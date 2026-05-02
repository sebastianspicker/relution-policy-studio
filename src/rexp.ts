import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { readZip, writeZip, type ZipEntry, type ZipEntryInput } from "./zip.js";

export interface PolicySummary {
  path: string;
  uuid?: string;
  name?: string;
  platform?: string;
  versionCount?: number;
  configurationCount?: number;
  plaintextBytes?: number;
  sha256?: string;
  expectedSha256?: string;
  hashMatches?: boolean;
}

export interface InspectResult {
  file: string;
  metadata: unknown;
  report: unknown;
  policyEntries: string[];
  hashes?: Record<string, string>;
  policies?: PolicySummary[];
}

export interface VerificationResult {
  ok: boolean;
  checkedEntries: PolicySummary[];
}

export interface ExtractOptions {
  force?: boolean;
  pretty?: boolean;
}

export interface PackOptions {
  force?: boolean;
  randomBytes?: (size: number) => Buffer;
}

const POLICY_SUFFIX = ".json";
const METADATA_JSON = "metadata.json";
const REPORT_JSON = "report.json";
const METADATA_BIN = "metadata.bin";
const HASHES_JSON = "metadata.hashes.json";
const SALT_LENGTH = 8;
const IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;
const KEY_LENGTH_BYTES = 16;
const PBKDF2_ITERATIONS = 10000;
const MAX_REXP_ENTRIES = 1024;
const MAX_REXP_TOTAL_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_REXP_TOTAL_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MANAGED_PROJECT_PATHS = [METADATA_JSON, REPORT_JSON, HASHES_JSON, "policies"] as const;
const POLICY_FILE_PATTERN = /^policies\/policy_[^/]+\.json$/u;

export function inspectRexp(filePath: string, password?: string): InspectResult {
  const entries = readRexpEntries(filePath);
  const metadata = parseJson(getRequiredEntry(entries, METADATA_JSON).data, METADATA_JSON);
  const report = parseJson(getRequiredEntry(entries, REPORT_JSON).data, REPORT_JSON);
  const policyEntries = entries.filter((entry) => isPolicyEntry(entry.name)).map((entry) => entry.name);

  if (password === undefined) {
    return { file: filePath, metadata, report, policyEntries };
  }

  const hashes = decryptHashMap(getRequiredEntry(entries, METADATA_BIN).data, password);
  const policies = policyEntries.map((entryName) => {
    const encryptedEntry = getRequiredEntry(entries, entryName);
    const plaintext = decryptRelutionPayload(encryptedEntry.data, password);
    const policy = parseJson(plaintext, entryName);
    return summarizePolicy(entryName, policy, plaintext.length, encryptedEntry.data, hashes[entryName]);
  });

  return { file: filePath, metadata, report, policyEntries, hashes, policies };
}

export function verifyRexp(filePath: string, password: string): VerificationResult {
  const inspected = inspectRexp(filePath, password);
  const entries = readRexpEntries(filePath);
  const hashes = inspected.hashes ?? decryptHashMap(getRequiredEntry(entries, METADATA_BIN).data, password);
  const checkedEntries = [
    summarizeArchiveEntry(getRequiredEntry(entries, METADATA_JSON), hashes[METADATA_JSON]),
    summarizeArchiveEntry(getRequiredEntry(entries, REPORT_JSON), hashes[REPORT_JSON]),
    ...(inspected.policies ?? []),
  ];
  return {
    ok: checkedEntries.every((entry) => entry.hashMatches === true),
    checkedEntries,
  };
}

export function extractRexp(filePath: string, outputDir: string, password: string, options: ExtractOptions = {}): void {
  const entries = readRexpEntries(filePath);
  const hashes = decryptHashMap(getRequiredEntry(entries, METADATA_BIN).data, password);
  assertArchiveEntryHashes(entries, hashes);
  prepareOutputPath(outputDir, options.force === true);

  writeProjectFile(outputDir, METADATA_JSON, maybeFormatJson(getRequiredEntry(entries, METADATA_JSON).data, options.pretty));
  writeProjectFile(outputDir, REPORT_JSON, maybeFormatJson(getRequiredEntry(entries, REPORT_JSON).data, options.pretty));
  writeProjectFile(outputDir, HASHES_JSON, formatJsonBuffer(Buffer.from(JSON.stringify(hashes), "utf8")));

  for (const entry of entries.filter((candidate) => isPolicyEntry(candidate.name))) {
    const plaintext = decryptRelutionPayload(entry.data, password);
    writeProjectFile(outputDir, entry.name, maybeFormatJson(plaintext, options.pretty));
  }
}

export function packPlainDirectory(inputDir: string, outputFile: string, password: string, options: PackOptions = {}): void {
  if (existsSync(outputFile) && options.force !== true) {
    throw new Error(`Output file already exists: ${outputFile}`);
  }

  const metadata = readProjectFile(inputDir, METADATA_JSON);
  const report = readProjectFile(inputDir, REPORT_JSON);
  parseJson(metadata, METADATA_JSON);
  parseJson(report, REPORT_JSON);

  const policyFiles = listPolicyFiles(inputDir);
  if (policyFiles.length === 0) {
    throw new Error(`No policy files found below ${join(inputDir, "policies")}`);
  }

  const randomSource = options.randomBytes ?? randomBytes;
  const encryptedPolicies = policyFiles.map((policyPath) => {
    const plaintext = readProjectFile(inputDir, policyPath);
    parseJson(plaintext, policyPath);
    return {
      name: policyPath,
      data: encryptRelutionPayload(plaintext, password, randomSource),
    };
  });

  const hashMap: Record<string, string> = {
    [METADATA_JSON]: sha256Hex(metadata),
    [REPORT_JSON]: sha256Hex(report),
  };

  for (const policy of encryptedPolicies) {
    hashMap[policy.name] = sha256Hex(policy.data);
  }

  const metadataBinPlain = Buffer.from(JSON.stringify(hashMap), "utf8");
  const metadataBinEncrypted = encryptRelutionPayload(metadataBinPlain, password, randomSource);
  const zipEntries: ZipEntryInput[] = [
    ...encryptedPolicies,
    { name: METADATA_JSON, data: metadata },
    { name: REPORT_JSON, data: report },
    { name: METADATA_BIN, data: metadataBinEncrypted },
  ];

  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, writeZip(zipEntries));
}

export function decryptRelutionPayload(payload: Buffer, password: string): Buffer {
  const saltLength = readLength(payload, 0, 1, 9, "salt");
  const saltStart = 1;
  const saltEnd = saltStart + saltLength;
  const ivLengthOffset = saltEnd;
  const ivLength = readLength(payload, ivLengthOffset, 12, 16, "IV");
  const ivStart = ivLengthOffset + 1;
  const ivEnd = ivStart + ivLength;

  if (payload.length < ivEnd + GCM_TAG_LENGTH) {
    throw new Error("Encrypted payload is too short");
  }

  const salt = payload.subarray(saltStart, saltEnd);
  const iv = payload.subarray(ivStart, ivEnd);
  const encrypted = payload.subarray(ivEnd);
  const ciphertext = encrypted.subarray(0, encrypted.length - GCM_TAG_LENGTH);
  const tag = encrypted.subarray(encrypted.length - GCM_TAG_LENGTH);
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv("aes-128-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptRelutionPayload(
  plaintext: Buffer,
  password: string,
  randomSource: (size: number) => Buffer = randomBytes,
): Buffer {
  const salt = randomSource(SALT_LENGTH);
  const iv = randomSource(IV_LENGTH);
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH) {
    throw new Error("Random source returned an unexpected length");
  }

  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-128-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([salt.length]), salt, Buffer.from([iv.length]), iv, ciphertext, tag]);
}

function readRexpEntries(filePath: string): ZipEntry[] {
  return readZip(readFileSync(filePath), {
    maxEntries: MAX_REXP_ENTRIES,
    maxTotalCompressedBytes: MAX_REXP_TOTAL_COMPRESSED_BYTES,
    maxTotalUncompressedBytes: MAX_REXP_TOTAL_UNCOMPRESSED_BYTES,
  });
}

function decryptHashMap(encryptedMetadata: Buffer, password: string): Record<string, string> {
  const plaintext = decryptRelutionPayload(encryptedMetadata, password);
  const parsed = parseJson(plaintext, METADATA_BIN);
  if (!isStringRecord(parsed)) {
    throw new Error("Decrypted metadata.bin is not a string map");
  }
  return parsed;
}

function assertArchiveEntryHashes(entries: ZipEntry[], hashes: Record<string, string>): void {
  const checkedNames = new Set([
    METADATA_JSON,
    REPORT_JSON,
    ...entries.filter((entry) => isPolicyEntry(entry.name)).map((entry) => entry.name),
  ]);

  for (const hashName of Object.keys(hashes)) {
    if (!isHashManagedProjectPath(hashName)) {
      throw new Error(`Archive hash map references path outside extraction root or managed surface: ${hashName}`);
    }
    if (!checkedNames.has(hashName)) {
      throw new Error(`Archive hash map references unexpected entry: ${hashName}`);
    }
  }

  for (const name of checkedNames) {
    const expectedSha256 = hashes[name];
    if (expectedSha256 === undefined) {
      throw new Error(`Archive hash map is missing ${name}`);
    }
    const entry = getRequiredEntry(entries, name);
    const actualSha256 = sha256Hex(entry.data);
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Archive hash mismatch for ${name}`);
    }
  }
}

function summarizePolicy(
  path: string,
  policy: unknown,
  plaintextBytes: number,
  encryptedBytes: Buffer,
  expectedSha256: string | undefined,
): PolicySummary {
  const record = asRecord(policy);
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  const configurationCount = versions.reduce<number>((sum, version) => {
    const versionRecord = asRecord(version);
    const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
    return sum + configurations.length;
  }, 0);
  const sha256 = sha256Hex(encryptedBytes);

  const summary: PolicySummary = {
    path,
    versionCount: versions.length,
    configurationCount,
    plaintextBytes,
    sha256,
    hashMatches: expectedSha256 === sha256,
  };

  const uuid = stringField(record, "uuid");
  const name = stringField(record, "name");
  const platform = stringField(record, "platform");
  if (uuid !== undefined) {
    summary.uuid = uuid;
  }
  if (name !== undefined) {
    summary.name = name;
  }
  if (platform !== undefined) {
    summary.platform = platform;
  }
  if (expectedSha256 !== undefined) {
    summary.expectedSha256 = expectedSha256;
  }

  return summary;
}

function summarizeArchiveEntry(entry: ZipEntry, expectedSha256: string | undefined): PolicySummary {
  const sha256 = sha256Hex(entry.data);
  return {
    path: entry.name,
    plaintextBytes: entry.data.length,
    sha256,
    ...(expectedSha256 === undefined ? {} : { expectedSha256 }),
    hashMatches: expectedSha256 === sha256,
  };
}

function prepareOutputPath(outputDir: string, force: boolean): void {
  if (existsSync(outputDir)) {
    if (!statSync(outputDir).isDirectory()) {
      throw new Error(`Output path exists and is not a directory: ${outputDir}`);
    }
    if (readdirSync(outputDir).length > 0) {
      if (!force) {
        throw new Error(`Output directory is not empty: ${outputDir}`);
      }
      for (const relativePath of MANAGED_PROJECT_PATHS) {
        rmSync(resolveManagedProjectPath(outputDir, relativePath), { recursive: true, force: true });
      }
    }
  }
  mkdirSync(outputDir, { recursive: true });
}

function listPolicyFiles(inputDir: string): string[] {
  const policiesDir = join(inputDir, "policies");
  if (!existsSync(policiesDir) || !statSync(policiesDir).isDirectory()) {
    return [];
  }
  assertProjectPathUsesNoSymlink(inputDir, "policies");
  const policyFiles = readdirSync(policiesDir)
    .filter((name) => name.startsWith("policy_") && name.endsWith(POLICY_SUFFIX))
    .sort()
    .map((name) => `policies/${name}`);
  for (const policyFile of policyFiles) {
    assertProjectPathUsesNoSymlink(inputDir, policyFile);
  }
  return policyFiles;
}

function writeProjectFile(outputDir: string, relativePath: string, data: Buffer): void {
  const destination = resolveManagedProjectPath(outputDir, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, data);
}

function readProjectFile(inputDir: string, relativePath: string): Buffer {
  assertProjectPathUsesNoSymlink(inputDir, relativePath);
  return readFileSync(resolveManagedProjectPath(inputDir, relativePath));
}

function getRequiredEntry(entries: ZipEntry[], name: string): ZipEntry {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new Error(`Missing required archive entry: ${name}`);
  }
  return entry;
}

function isPolicyEntry(name: string): boolean {
  return POLICY_FILE_PATTERN.test(name);
}

function resolveManagedProjectPath(rootDir: string, relativePath: string): string {
  if (!isManagedProjectPath(relativePath)) {
    throw new Error(`Project path resolves outside extraction root or managed surface: ${relativePath}`);
  }
  const resolvedRoot = resolve(rootDir);
  const candidate = resolve(resolvedRoot, relativePath);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Project path resolves outside extraction root: ${relativePath}`);
  }
  return candidate;
}

function assertProjectPathUsesNoSymlink(rootDir: string, relativePath: string): void {
  const resolvedRoot = resolve(rootDir);
  if (existsSync(resolvedRoot) && lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`Project path must not use symlinks: ${rootDir}`);
  }

  let current = resolvedRoot;
  for (const segment of relativePath.split(/[\\/]/u).filter((part) => part.length > 0)) {
    current = join(current, segment);
    if (!existsSync(current)) {
      break;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Project path must not use symlinks: ${relativePath}`);
    }
  }
}

function isManagedProjectPath(relativePath: string): boolean {
  return relativePath === METADATA_JSON || relativePath === REPORT_JSON || relativePath === HASHES_JSON || relativePath === "policies" || POLICY_FILE_PATTERN.test(relativePath);
}

function isHashManagedProjectPath(relativePath: string): boolean {
  return relativePath === METADATA_JSON || relativePath === REPORT_JSON || POLICY_FILE_PATTERN.test(relativePath);
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH_BYTES, "sha256");
}

function readLength(payload: Buffer, offset: number, minInclusive: number, maxExclusive: number, label: string): number {
  const length = payload[offset];
  if (length === undefined) {
    throw new Error(`Missing ${label} length`);
  }
  if (length < minInclusive || length >= maxExclusive) {
    throw new Error(`Unexpected ${label} length ${length}`);
  }
  return length;
}

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseJson(buffer: Buffer, label: string): unknown {
  try {
    return JSON.parse(buffer.toString("utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${label}: ${message}`);
  }
}

function maybeFormatJson(buffer: Buffer, pretty: boolean | undefined): Buffer {
  return pretty === true ? formatJsonBuffer(buffer) : buffer;
}

function formatJsonBuffer(buffer: Buffer): Buffer {
  const parsed = parseJson(buffer, "JSON");
  return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = asRecord(value);
  return record !== undefined && Object.values(record).every((entry) => typeof entry === "string");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" ? value : undefined;
}

/** Packs validated project files, self-verifies the exact ZIP, then publishes atomically. */
import { randomBytes } from "node:crypto";
import { writePrivateFileAtomic } from "../platform/filesystem/atomic-private-file.js";
import { encryptedRelutionPayloadLength, encryptRelutionPayload, parseJson, sha256Hex } from "./rexp-crypto.js";
import { assertRexpZipEntryDataLengths, assertRexpZipEntryLengths, readRexpArchive } from "./rexp-archive-reader.js";
import { MAX_REXP_TOTAL_COMPRESSED_BYTES, METADATA_BIN, METADATA_JSON, type PackOptions, REPORT_JSON } from "./rexp-format.js";
import { listPolicyFiles, readProjectFile } from "./rexp-project.js";
import { verifyRexpEntries } from "./rexp-inspection.js";
import { writeZip, type ZipEntryInput } from "./zip.js";
import { assertWorkspaceIntegrity } from "../workspace/workspace-integrity.js";
import { assertPersistableWorkspaceShape } from "../workspace/storage.js";
import type { PolicyWorkspace } from "../workspace/types.js";

export function packPlainDirectory(inputDir: string, outputFile: string, password: string, options: PackOptions = {}): void {
  const source = readPackSource(inputDir);
  packSource(source, outputFile, password, options, true);
}

/**
 * INTERNAL editor-saga entrypoint. The exact staged file must be verified
 * before publication; ordinary pack APIs retain their in-memory self-check.
 */
export function packPlainWorkspaceToStageInternal(
  workspace: Readonly<PolicyWorkspace>,
  outputFile: string,
  password: string,
  options: PackOptions = {},
): void {
  packSource(workspacePackSource(workspace), outputFile, password, options, false);
}

function workspacePackSource(workspace: Readonly<PolicyWorkspace>): PackSource {
  assertPersistableWorkspaceShape(workspace as PolicyWorkspace);
  assertWorkspaceIntegrity(workspace as PolicyWorkspace);
  return {
    metadata: serializeWorkspaceJson(workspace.metadata),
    report: serializeWorkspaceJson(workspace.report),
    policies: workspace.policies.map((policy) => ({ name: policy.path, data: serializeWorkspaceJson(policy.document) })),
  };
}

function packSource(source: PackSource, outputFile: string, password: string, options: PackOptions, selfVerify: boolean): void {
  assertPackSourceLengths(source);
  const entries = createArchiveEntries(source, password, options.randomBytes ?? randomBytes);
  assertRexpZipEntryDataLengths(entries);
  const archive = writeZip(entries);
  if (selfVerify) {
    const verification = verifyRexpEntries(readRexpArchive(archive), password);
    if (!verification.ok) throw new Error("Packed archive failed verification");
  }
  writePrivateFileAtomic(outputFile, archive, { force: options.force === true, label: "Archive output path" });
}

interface PackSource { metadata: Buffer; report: Buffer; policies: { name: string; data: Buffer }[]; }

function serializeWorkspaceJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readPackSource(inputDir: string): PackSource {
  const metadata = readProjectFile(inputDir, METADATA_JSON);
  const report = readProjectFile(inputDir, REPORT_JSON);
  parseJson(metadata, METADATA_JSON); parseJson(report, REPORT_JSON);
  const paths = listPolicyFiles(inputDir);
  if (paths.length === 0) throw new Error(`No policy files found below ${inputDir}/policies`);
  return { metadata, report, policies: paths.map((name) => readValidatedPolicy(inputDir, name)) };
}

function readValidatedPolicy(inputDir: string, name: string): { name: string; data: Buffer } {
  const data = readProjectFile(inputDir, name); parseJson(data, name); return { name, data };
}

/** The build route reports this message to the user; other pack errors stay generic. */
export class RexpArchiveTooLargeError extends Error {}

function assertPackSourceLengths(source: PackSource): void {
  const hashNames = [METADATA_JSON, REPORT_JSON, ...source.policies.map((policy) => policy.name)];
  const projectedHashes = Object.fromEntries(hashNames.map((name) => [name, "0".repeat(64)]));
  const projectedMetadataBytes = Buffer.byteLength(JSON.stringify(projectedHashes), "utf8");
  const encrypted = [
    ...source.policies.map(({ name, data }) => ({ name, length: encryptedRelutionPayloadLength(data.length) })),
    { name: METADATA_BIN, length: encryptedRelutionPayloadLength(projectedMetadataBytes) },
  ];
  assertRexpZipEntryLengths([...encrypted, { name: METADATA_JSON, length: source.metadata.length }, { name: REPORT_JSON, length: source.report.length }]);
  // Encrypted entries do not compress, so their sum is a floor for the size every reader checks.
  const incompressible = encrypted.reduce((sum, entry) => sum + entry.length, 0);
  if (incompressible > MAX_REXP_TOTAL_COMPRESSED_BYTES) {
    throw new RexpArchiveTooLargeError(`The archive would be larger than the ${String(MAX_REXP_TOTAL_COMPRESSED_BYTES / 1024 / 1024)} MiB that .rexp readers accept; split the policies across workspaces.`);
  }
}

function createArchiveEntries(source: PackSource, password: string, randomSource: (size: number) => Buffer): ZipEntryInput[] {
  const policies = source.policies.map(({ name, data }) => ({ name, data: encryptRelutionPayload(data, password, randomSource) }));
  const hashes = { [METADATA_JSON]: sha256Hex(source.metadata), [REPORT_JSON]: sha256Hex(source.report), ...Object.fromEntries(policies.map((entry) => [entry.name, sha256Hex(entry.data)])) };
  const metadata = encryptRelutionPayload(Buffer.from(JSON.stringify(hashes), "utf8"), password, randomSource);
  return [...policies, { name: METADATA_JSON, data: source.metadata }, { name: REPORT_JSON, data: source.report }, { name: METADATA_BIN, data: metadata }];
}

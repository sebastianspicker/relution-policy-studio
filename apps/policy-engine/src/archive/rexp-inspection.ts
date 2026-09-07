/** Inspects and verifies decrypted REXP contents without filesystem extraction. */
import { asRecord } from "../platform/serialization/json-guards.js";
import { decryptRelutionPayload, parseJson, sha256Hex } from "./rexp-crypto.js";
import { decryptHashMap, getRequiredEntry, policyEntries, validateArchiveJson } from "./rexp-archive-validation.js";
import { assertArchiveHashMapDomain } from "./rexp-archive-hashes.js";
import { readRexpEntries } from "./rexp-archive-reader.js";
import { type ArchiveHashStatus, type InspectResult, METADATA_JSON, type PolicySummary, REPORT_JSON, type VerificationResult } from "./rexp-format.js";
import type { ZipEntry } from "./zip.js";

export function inspectRexp(filePath: string, password?: string): InspectResult {
  const entries = readRexpEntries(filePath);
  validateArchiveJson(entries, password);
  const metadata = parseJson(getRequiredEntry(entries, METADATA_JSON).data, METADATA_JSON);
  const report = parseJson(getRequiredEntry(entries, REPORT_JSON).data, REPORT_JSON);
  const names = policyEntries(entries).map((entry) => entry.name);
  if (password === undefined) return { file: filePath, metadata, report, policyEntries: names };
  return inspectDecrypted(filePath, entries, metadata, report, names, password);
}

export function verifyRexp(filePath: string, password: string): VerificationResult {
  return verifyRexpEntries(readRexpEntries(filePath), password);
}

export function verifyRexpEntries(entries: ZipEntry[], password: string): VerificationResult {
  validateArchiveJson(entries, password);
  const hashes = decryptHashMap(entries, password);
  assertArchiveHashMapDomain(entries, hashes);
  const checkedEntries = [
    summarizeArchiveEntry(getRequiredEntry(entries, METADATA_JSON), hashes[METADATA_JSON]),
    summarizeArchiveEntry(getRequiredEntry(entries, REPORT_JSON), hashes[REPORT_JSON]),
    ...policyEntries(entries).map((entry) => summarizeDecryptedPolicy(entry, password, hashes[entry.name])),
  ];
  return { ok: checkedEntries.every((entry) => entry.hashStatus === "match"), checkedEntries };
}

function inspectDecrypted(file: string, entries: ZipEntry[], metadata: unknown, report: unknown, names: string[], password: string): InspectResult {
  const hashes = decryptHashMap(entries, password);
  assertArchiveHashMapDomain(entries, hashes);
  const policies = policyEntries(entries).map((entry) => summarizeDecryptedPolicy(entry, password, hashes[entry.name]));
  return { file, metadata, report, policyEntries: names, hashes, policies };
}

function summarizeDecryptedPolicy(entry: ZipEntry, password: string, expectedSha256: string | undefined): PolicySummary {
  const plaintext = decryptRelutionPayload(entry.data, password);
  return summarizePolicy(entry.name, parseJson(plaintext, entry.name), plaintext.length, entry.data, expectedSha256);
}

function summarizePolicy(path: string, policy: unknown, plaintextBytes: number, encryptedBytes: Buffer, expectedSha256: string | undefined): PolicySummary {
  const record = asRecord(policy);
  const versions = Array.isArray(record?.versions) ? record.versions : [];
  const configurationCount = versions.reduce<number>((sum, version) => sum + configurationLength(version), 0);
  const sha256 = sha256Hex(encryptedBytes);
  const summary: PolicySummary = { path, versionCount: versions.length, configurationCount, plaintextBytes, sha256, hashStatus: archiveHashStatus(expectedSha256, sha256) };
  addStringField(summary, record, "uuid"); addStringField(summary, record, "name"); addStringField(summary, record, "platform");
  if (expectedSha256 !== undefined) summary.expectedSha256 = expectedSha256;
  return summary;
}

function summarizeArchiveEntry(entry: ZipEntry, expectedSha256: string | undefined): PolicySummary {
  const sha256 = sha256Hex(entry.data);
  return { path: entry.name, plaintextBytes: entry.data.length, sha256, ...(expectedSha256 === undefined ? {} : { expectedSha256 }), hashStatus: archiveHashStatus(expectedSha256, sha256) };
}

function addStringField(summary: PolicySummary, record: Record<string, unknown> | undefined, field: "uuid" | "name" | "platform"): void {
  const value = record?.[field]; if (typeof value === "string") summary[field] = value;
}

function configurationLength(version: unknown): number {
  const configurations = asRecord(version)?.configurations;
  return Array.isArray(configurations) ? configurations.length : 0;
}

function archiveHashStatus(expected: string | undefined, actual: string): ArchiveHashStatus {
  return expected === undefined ? "absent" : expected === actual ? "match" : "mismatch";
}

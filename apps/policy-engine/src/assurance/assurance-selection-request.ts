/** Parses untrusted assurance preview and apply request bodies. */
import type {
  AssuranceApplicabilityContext,
  AssuranceConflictDecision,
  AssuranceSelection,
  AssuranceSelectionApplyRequest,
  AssuranceSelectionExclusion,
  AssuranceSelectionRequest,
} from "./assurance-contracts.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { assertPlainJson } from "../platform/serialization/json-integrity.js";
import type { PolicyWorkspace } from "../workspace/types.js";

const DIGEST = /^[a-f0-9]{64}$/u;

export function parseAssuranceSelectionRequest(body: JsonRecord): AssuranceSelectionRequest {
  const workspace = parseWorkspace(body.workspace);
  const target = requireRecord(body.target, "assurance target");
  const selection = parseSelection(body.selection);
  const applicability = body.applicability === undefined ? undefined : parseAssuranceApplicabilityContext(body.applicability);
  const parameters = body.parameters === undefined ? undefined : requireRecord(body.parameters, "assurance parameters");
  if (parameters !== undefined) assertPlainJson(parameters, "Assurance parameters");
  const decisions = body.decisions === undefined ? undefined : parseDecisions(body.decisions);
  const exclusions = body.exclusions === undefined ? undefined : parseExclusions(body.exclusions);
  const obligations = body.obligations === undefined ? undefined : parseStrings(body.obligations, "assurance obligations");
  const exceptions = body.exceptions === undefined ? undefined : parseStrings(body.exceptions, "assurance exceptions");
  const acknowledgedSourceDigests = body.acknowledgedSourceDigests === undefined
    ? undefined
    : parseDigests(body.acknowledgedSourceDigests, "acknowledged source digests");
  const snapshotDigest = body.snapshotDigest === undefined ? undefined : requireDigest(body.snapshotDigest, "assurance snapshotDigest");
  const readinessReview = body.readinessReview === undefined ? undefined : parseReadinessReview(body.readinessReview);
  return {
    expectedRevision: requireDigest(body.expectedRevision, "assurance expectedRevision"),
    workspace,
    target: {
      policyPath: requireString(target.policyPath, "assurance target policyPath"),
      versionIndex: requireNonNegativeInteger(target.versionIndex, "assurance target versionIndex"),
    },
    selection,
    ...(applicability === undefined ? {} : { applicability }),
    ...(parameters === undefined ? {} : { parameters }),
    ...(decisions === undefined ? {} : { decisions }),
    ...(exclusions === undefined ? {} : { exclusions }),
    ...(obligations === undefined ? {} : { obligations }),
    ...(exceptions === undefined ? {} : { exceptions }),
    ...(acknowledgedSourceDigests === undefined ? {} : { acknowledgedSourceDigests }),
    ...(snapshotDigest === undefined ? {} : { snapshotDigest }),
    ...(readinessReview === undefined ? {} : { readinessReview }),
  };
}

export function parseAssuranceSelectionApplyRequest(body: JsonRecord): AssuranceSelectionApplyRequest {
  return {
    ...parseAssuranceSelectionRequest(body),
    draftDigest: requireDigest(body.draftDigest, "assurance draftDigest"),
    resultDigest: requireDigest(body.resultDigest, "assurance resultDigest"),
    previewDigest: requireDigest(body.previewDigest, "assurance previewDigest"),
    assuranceDigest: requireDigest(body.assuranceDigest, "assurance assuranceDigest"),
    resolvedSnapshotDigest: requireDigest(body.resolvedSnapshotDigest, "assurance resolvedSnapshotDigest"),
    snapshotSelection: parseSnapshotSelection(body.snapshotSelection),
    sourceDigests: parseSourceDigestRecord(body.sourceDigests),
    ...(body.presetDigest === undefined ? {} : { presetDigest: requireDigest(body.presetDigest, "assurance presetDigest") }),
  };
}

function parseSnapshotSelection(value: unknown): "current" | "retained" {
  if (value !== "current" && value !== "retained") throw new Error("Assurance snapshotSelection must be current or retained");
  return value;
}

function parseWorkspace(value: unknown): PolicyWorkspace {
  const record = requireRecord(value, "assurance workspace");
  assertPlainJson(record, "Assurance workspace");
  return record as unknown as PolicyWorkspace;
}

function parseSelection(value: unknown): AssuranceSelection {
  const record = requireRecord(value, "assurance selection");
  if (record.kind === "recommendation") {
    return { kind: "recommendation", recommendationId: requireString(record.recommendationId, "assurance recommendationId") };
  }
  if (record.kind === "preset") {
    return {
      kind: "preset",
      presetId: requireString(record.presetId, "assurance presetId"),
      presetVersion: requireString(record.presetVersion, "assurance presetVersion"),
    };
  }
  throw new Error(`Unsupported assurance selection kind: ${String(record.kind)}`);
}

export function parseAssuranceApplicabilityContext(value: unknown): AssuranceApplicabilityContext {
  const record = requireRecord(value, "assurance applicability context");
  return {
    ...(record.osVersion === undefined ? {} : { osVersion: requireString(record.osVersion, "assurance osVersion") }),
    ...(record.enrollmentChannel === undefined ? {} : { enrollmentChannel: requireString(record.enrollmentChannel, "assurance enrollmentChannel") }),
    ...(record.deviceOwnership === undefined ? {} : { deviceOwnership: requireString(record.deviceOwnership, "assurance deviceOwnership") }),
    ...(record.supervision === undefined ? {} : { supervision: requireString(record.supervision, "assurance supervision") }),
  };
}

function parseDecisions(value: unknown): AssuranceConflictDecision[] {
  return requireArray(value, "assurance decisions").map((entry, index) => {
    const record = requireRecord(entry, `assurance decision ${String(index)}`);
    return {
      path: requireString(record.path, "assurance conflict path"),
      winnerRecommendationId: requireString(record.winnerRecommendationId, "assurance conflict winner"),
      rationale: requireString(record.rationale, "assurance conflict rationale"),
    };
  });
}

function parseExclusions(value: unknown): AssuranceSelectionExclusion[] {
  return requireArray(value, "assurance exclusions").map((entry, index) => {
    const record = requireRecord(entry, `assurance exclusion ${String(index)}`);
    return {
      recommendationId: requireString(record.recommendationId, "assurance exclusion recommendationId"),
      reason: requireString(record.reason, "assurance exclusion reason"),
    };
  });
}

function parseReadinessReview(value: unknown): { readonly reviewed: true; readonly rationale: string } {
  const record = requireRecord(value, "assurance readiness review");
  if (record.reviewed !== true) throw new Error("Assurance readiness review must be explicit");
  return { reviewed: true, rationale: requireString(record.rationale, "assurance readiness rationale") };
}

function parseSourceDigestRecord(value: unknown): Readonly<Record<string, string>> {
  const record = requireRecord(value, "assurance sourceDigests");
  return Object.fromEntries(Object.entries(record).map(([sourceId, digest]) => [
    requireString(sourceId, "assurance source id"),
    requireDigest(digest, `assurance source digest ${sourceId}`),
  ]));
}

function parseDigests(value: unknown, label: string): string[] {
  return requireArray(value, label).map((entry) => requireDigest(entry, label));
}

function parseStrings(value: unknown, label: string): string[] {
  return requireArray(value, label).map((entry) => requireString(entry, label));
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value);
  if (record === undefined) throw new Error(`${label} must be an object`);
  return record;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!DIGEST.test(digest)) throw new Error(`${label} must be a SHA-256 digest`);
  return digest;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`);
  return value as number;
}

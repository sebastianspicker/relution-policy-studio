/** Parses workspace, compliance, and recommendation request payloads. */
import { RECOMMENDATION_SOURCES, type RecommendationSource } from "../assurance/recommendation-types.js";
import { isRecommendationSource } from "../assurance/recommendation-catalog-loader.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { badRequest, type JsonRecord } from "./editor-http-error.js";
import { optionalRecord, requireNumber, requireString } from "./editor-api-request-input.js";

export function parseWorkspaceBody(body: JsonRecord): PolicyWorkspace {
  const workspace = body.workspace;
  if (typeof workspace !== "object" || workspace === null || Array.isArray(workspace)) {
    throw badRequest("Expected workspace object");
  }
  return workspace as PolicyWorkspace;
}

/** Reads the opaque state revision required by replacement-style mutations. */
export function parseExpectedRevisionBody(body: JsonRecord): string {
  const revision = requireString(body, "expectedRevision");
  if (!/^[a-f0-9]{64}$/u.test(revision)) throw badRequest("Expected a valid workspace revision");
  return revision;
}

export interface ComplianceTargetBody {
  readonly policyPath: string;
  readonly versionIndex: number;
}

/** Parses an HTTP-stable policy target; index resolution belongs to the locked workspace read. */
export function parseComplianceTargetBody(body: JsonRecord): ComplianceTargetBody {
  const target = optionalRecord(body, "target");
  if (target === undefined) throw badRequest("Expected target object");
  return { policyPath: requireString(target, "policyPath"), versionIndex: requireNumber(target, "versionIndex") };
}

export function parseRecommendationSourcesBody(body: JsonRecord): RecommendationSource[] {
  const rawSources = body.sources;
  if (rawSources === undefined) return [...RECOMMENDATION_SOURCES];
  if (!Array.isArray(rawSources)) throw badRequest("Expected sources array");
  const sources = rawSources.map(parseRecommendationSource);
  if (sources.length === 0) throw badRequest("At least one recommendation source is required");
  return [...new Set(sources)];
}

export function parseRecommendationSourceBody(body: JsonRecord): RecommendationSource {
  return parseRecommendationSource(requireString(body, "source"));
}

function parseRecommendationSource(value: unknown): RecommendationSource {
  if (typeof value !== "string" || !isRecommendationSource(value)) {
    throw badRequest(`Unknown recommendation source: ${String(value)}`);
  }
  return value;
}

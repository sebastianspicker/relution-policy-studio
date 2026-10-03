/** Applies one reviewed current mapping to its active durable workspace. */
import { badRequest } from "../editor-http-error.js";
import type { JsonRecord } from "../../platform/serialization/json-guards.js";
import { mutateEditorWorkspaceState } from "../../workspace-state/editor-port.js";
import type { PolicyWorkspace } from "../../workspace/types.js";
import type { EditorRequestContext } from "../editor-server-contract.js";
import type { CampusWeaveMapping, CampusWeaveProject } from "../../contracts/campusweave.js";
import { reviewCampusWeaveProject } from "../../application/campusweave-review.js";
import { findTemplate } from "../../contracts/template.js";
import { objectProperties } from "../../contracts/template-schema-structure.js";
import { validateWorkspace } from "../../workspace/workspace-validation.js";
import type { RelutionTemplateBundle } from "../../contracts/template.js";

const UNSAFE_FIELDS = new Set(["__proto__", "constructor", "prototype"]);

export function projectCampusWeaveMapping(
  context: EditorRequestContext,
  project: CampusWeaveProject,
  mappingId: string,
  expectedWorkspaceRevision: string,
  reviewState: Parameters<typeof reviewCampusWeaveProject>[1],
): { readonly revision: string; readonly workspace: PolicyWorkspace } {
  const mappingIndex = project.mappings.findIndex((mapping) => mapping.id === mappingId);
  if (mappingIndex < 0) throw badRequest("CampusWeave mapping not found");
  const mapping = project.mappings[mappingIndex]!;
  const review = reviewCampusWeaveProject(project, reviewState);
  const mappingReview = review.mappings[mappingIndex];
  if (mappingReview?.projectable !== true) {
    throw badRequest(`CampusWeave mapping is not projectable: ${mappingReview?.reasons.join(", ") ?? "review is missing"}`);
  }
  const runtime = context.runtimeState.campusweave!;
  if (runtime.activeWorkspaceId !== mapping.workspace_id) throw badRequest("Mapping workspace is not the active workspace");
  return mutateEditorWorkspaceState(
    { workspaceDir: runtime.activeWorkspaceDir, appleSchemaRevision: context.appleSchema.source.revision },
    (workspace) => {
      return applyCampusWeaveMapping(workspace, mapping, context.bundle);
    },
    expectedWorkspaceRevision,
  );
}

export function applyCampusWeaveMapping(
  workspace: PolicyWorkspace,
  mapping: CampusWeaveMapping,
  bundle: RelutionTemplateBundle,
): PolicyWorkspace {
  if (UNSAFE_FIELDS.has(mapping.field) || !/^[A-Za-z0-9_.-]{1,128}$/u.test(mapping.field)) {
    throw badRequest("Mapping field must be a safe direct configuration detail field");
  }
  const policy = workspace.policies.find((candidate) =>
    candidate.path === mapping.policy_id || candidate.document.uuid === mapping.policy_id
  );
  if (policy === undefined) throw badRequest("Mapped policy is not present in the active workspace");
  if (policy.document.platform !== mapping.platform) throw badRequest("Mapped policy platform no longer matches");
  const configurations = configurationRecords(policy.document);
  const candidates = configurations.filter((configuration) =>
    configuration.uuid === mapping.configuration_id
    || (asRecord(configuration.details)?.uuid === mapping.configuration_id)
  );
  if (candidates.length !== 1) throw badRequest("Mapped configuration identity is missing or ambiguous");
  const details = asRecord(candidates[0]!.details);
  if (details === undefined || details.type !== mapping.configuration_type) {
    throw badRequest("Mapped configuration type no longer matches");
  }
  const template = findTemplate(bundle, mapping.configuration_type);
  const schema = template === undefined ? undefined : bundle.schemas[template.schemaName];
  const properties = schema === undefined ? {} : objectProperties(schema, bundle.schemas);
  if (!Object.hasOwn(properties, mapping.field)) throw badRequest("Mapping field is not declared by the configuration schema");
  Object.defineProperty(details, mapping.field, {
    value: structuredClone(mapping.value), enumerable: true, configurable: true, writable: true,
  });
  const validation = validateWorkspace(workspace, bundle);
  if (!validation.ok) {
    throw badRequest(`Projected workspace is invalid: ${validation.errors.slice(0, 3).map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  return workspace;
}

function configurationRecords(document: JsonRecord): JsonRecord[] {
  const versions = Array.isArray(document.versions) ? document.versions : [];
  return versions.flatMap((version) => {
    const record = asRecord(version);
    const configurations = Array.isArray(record?.configurations) ? record.configurations : [];
    return configurations.flatMap((configuration) => {
      const parsed = asRecord(configuration);
      return parsed === undefined ? [] : [parsed];
    });
  });
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}

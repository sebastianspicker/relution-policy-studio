/** Typed application use cases for editor archive and compliance operations. */
import {
  type ComplianceReport,
  type ComplianceSelection,
  type ComplianceSourceCatalogs,
} from "../assurance/compliance-types.js";
import { buildComplianceReport } from "../assurance/compliance-report.js";
import { applyComplianceRemediationToWorkspace } from "../assurance/compliance-remediation.js";
import { assertNewArchiveKey } from "../archive/rexp-key-policy.js";
import type { VerificationResult } from "../archive/rexp-format.js";
import { schemaCompatibilityIssues, validateWorkspace } from "../workspace/workspace-validation.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../workspace/types.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import type { RecommendationSource } from "../assurance/recommendation-types.js";
import type { BuildComplianceReportInput } from "../assurance/compliance-contracts.js";

export interface ComplianceCheckInput {
  readonly workspace: PolicyWorkspace;
  readonly selection: ComplianceSelection;
  readonly sources: readonly RecommendationSource[];
}

export interface ComplianceApplicationInput extends ComplianceCheckInput {
  readonly source: RecommendationSource;
  readonly recommendationId: string;
  readonly remediationId: string;
}

export interface ArchiveImportInput {
  readonly archive: Uint8Array;
  readonly key: string;
  /** Required when replacing an initialized editor workspace through the HTTP editor. */
  readonly expectedRevision?: string;
}

export interface ArchiveImportPort<TSidecar> {
  extractWorkspace(input: ArchiveImportInput): PolicyWorkspace;
  replaceImportedWorkspace(workspace: PolicyWorkspace, expectedRevision: string | undefined): { readonly workspace: PolicyWorkspace; readonly sidecar: TSidecar; readonly revision: string };
}

export interface ArchiveBuildPort<TSidecar> {
  captureSnapshot(): ArchiveBuildSnapshot<TSidecar>;
}

/** One coherent durable read with a frozen validation view and opaque pack operation. */
interface ArchiveBuildSnapshot<TSidecar> {
  readonly validationWorkspace: Readonly<PolicyWorkspace>;
  readonly sidecar: Readonly<TSidecar>;
  buildVerifiedArchive(key: string): VerificationResult;
  dispose(): void;
}

export type ArchiveBuildResult<TSidecar> =
  | { readonly kind: "validation-failed"; readonly validation: WorkspaceValidationResult; readonly constraintsRemoved: readonly SchemaConstraintRemoval[] }
  | { readonly kind: "verification-failed"; readonly validation: WorkspaceValidationResult; readonly constraintsRemoved: readonly SchemaConstraintRemoval[]; readonly verification: VerificationResult }
  | { readonly kind: "built"; readonly validation: WorkspaceValidationResult; readonly constraintsRemoved: readonly SchemaConstraintRemoval[]; readonly sidecar: TSidecar; readonly verification: VerificationResult };

interface SchemaConstraintRemoval {
  readonly path: string;
  readonly constraint: string;
  readonly original: string | undefined;
}

export function checkCompliance(input: ComplianceCheckInput, dependencies: ComplianceDependencies): ComplianceReport {
  return buildComplianceReport({
    workspace: input.workspace,
    selection: input.selection,
    sources: [...input.sources],
    catalogs: dependencies.catalogs.load([...input.sources]),
    bundle: dependencies.bundle,
    appleSchema: dependencies.appleSchema,
    ...(dependencies.assurance === undefined ? {} : { assurance: dependencies.assurance }),
  });
}

export function applyCompliance(input: ComplianceApplicationInput, dependencies: ComplianceDependencies): {
  readonly workspace: PolicyWorkspace;
  readonly report: ComplianceReport;
} {
  const workspace = applyComplianceRemediationToWorkspace({
    workspace: input.workspace,
    selection: input.selection,
    sources: [...input.sources],
    source: input.source,
    recommendationId: input.recommendationId,
    remediationId: input.remediationId,
    catalogs: dependencies.catalogs.load([...input.sources]),
    bundle: dependencies.bundle,
    appleSchema: dependencies.appleSchema,
    ...(dependencies.assurance === undefined ? {} : { assurance: dependencies.assurance }),
  }).workspace;
  const validation = validateWorkspace(workspace, dependencies.bundle);
  if (!validation.ok) {
    throw new Error(`Compliance remediation produced an invalid workspace: ${validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  return { workspace, report: checkCompliance({ workspace, selection: input.selection, sources: input.sources }, dependencies) };
}

export function importArchive<TSidecar>(
  input: ArchiveImportInput,
  dependencies: ArchiveImportPort<TSidecar> & { readonly bundle: RelutionTemplateBundle },
): { readonly workspace: PolicyWorkspace; readonly validation: WorkspaceValidationResult; readonly sidecar: TSidecar; readonly revision: string; readonly key: string } {
  const importedWorkspace = dependencies.extractWorkspace(input);
  const validation = validateWorkspace(importedWorkspace, dependencies.bundle);
  if (!validation.ok) {
    throw new Error(`Imported archive workspace is invalid: ${validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  const persisted = dependencies.replaceImportedWorkspace(importedWorkspace, input.expectedRevision);
  return { ...persisted, validation, key: input.key };
}

export function buildVerifiedArchive<TSidecar>(
  key: string,
  dependencies: { readonly bundle: RelutionTemplateBundle; readonly archive: ArchiveBuildPort<TSidecar> },
): ArchiveBuildResult<TSidecar> {
  assertNewArchiveKey(key);
  const snapshot = dependencies.archive.captureSnapshot();
  try {
    const validation = validateWorkspace(snapshot.validationWorkspace as PolicyWorkspace, dependencies.bundle);
    const constraintsRemoved = getRemovedSchemaConstraints(dependencies.bundle);
    if (!validation.ok) return { kind: "validation-failed", validation, constraintsRemoved };
    const verification = snapshot.buildVerifiedArchive(key);
    if (!verification.ok) return { kind: "verification-failed", validation, constraintsRemoved, verification };
    return { kind: "built", validation, constraintsRemoved, sidecar: snapshot.sidecar, verification };
  } finally {
    snapshot.dispose();
  }
}

export interface ComplianceDependencies {
  readonly assurance?: BuildComplianceReportInput["assurance"];
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly catalogs: { load(sources: RecommendationSource[]): Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> };
}

function getRemovedSchemaConstraints(bundle: RelutionTemplateBundle): SchemaConstraintRemoval[] {
  return schemaCompatibilityIssues(bundle).map((issue) => ({
    path: issue.path,
    constraint: issue.kind === "invalid-pattern" ? "pattern" : issue.kind,
    original: issue.pattern,
  }));
}

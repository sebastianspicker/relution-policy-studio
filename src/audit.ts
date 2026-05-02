import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { extractRexp, packPlainDirectory, verifyRexp } from "./rexp.js";
import { type ConfigurationTemplate, type RelutionTemplateBundle } from "./templates.js";
import {
  addConfigurationToWorkspace,
  createNewWorkspace,
  loadWorkspace,
  schemaCompatibilityIssues,
  validateWorkspace,
  type WorkspaceValidationError,
} from "./workspace.js";

export interface AuditOptions {
  bundle: RelutionTemplateBundle;
  key: string;
  sampleRexp?: string;
}

export interface AuditOutputOptions {
  jsonOut?: string;
  markdownOut?: string;
}

export interface RelutionAuditReport {
  generatedAt: string;
  server: {
    version: string;
    sourceImage: string;
    sourceImageDigest: string;
    bundleGeneratedAt: string;
  };
  summary: {
    platformCount: number;
    configurationTypeCount: number;
    schemaCount: number;
    springGroupCount: number;
    springPropertyCount: number;
    fieldCount: number;
    primitiveFieldCount: number;
    objectFieldCount: number;
    arrayFieldCount: number;
    enumFieldCount: number;
    describedFieldCount: number;
    refFieldCount: number;
    schemaCompatibilityIssueCount: number;
    mockRoundtripPassed: number;
    mockRoundtripFailed: number;
  };
  sourceInventory: {
    openApiSchemas: number;
    iosSystemAppsPresent: boolean;
    springConfigurationMetadataPresent: boolean;
    runtimeMetadataSource: "reflected" | "heuristic";
    runtimeMetadataConfigurationTypes: number;
  };
  platforms: PlatformAuditEntry[];
  configurationTypes: ConfigurationTypeAuditEntry[];
  schemaCompatibilityIssues: ReturnType<typeof schemaCompatibilityIssues>;
  mockRoundtrip: MockRoundtripResult[];
  sampleExport?: SampleExportAudit;
}

export interface PlatformAuditEntry {
  platform: string;
  configurationTypeCount: number;
  configurationTypes: string[];
}

export interface ConfigurationTypeAuditEntry {
  type: string;
  label: string;
  description?: string;
  descriptionSource?: string;
  schemaName: string;
  platforms: string[];
  enrollmentTypes: string[];
  multiConfig: boolean;
  portalHidden: boolean;
  placeholderCount: number;
  fields: ConfigurationTemplate["fields"];
}

export interface MockRoundtripResult {
  type: string;
  platform: string;
  validationOk: boolean;
  packOk: boolean;
  verifyOk: boolean;
  extractOk: boolean;
  detailsTypeOk: boolean;
  errors: string[];
}

export interface SampleExportAudit {
  path: string;
  verifyOk: boolean;
  validationOk: boolean;
  validationErrors: WorkspaceValidationError[];
}

export function createRelutionAuditReport(options: AuditOptions): RelutionAuditReport {
  const configurationTypes = options.bundle.configurationTypes.map((template) => ({
    type: template.type,
    label: template.label,
    ...(template.description === undefined
      ? {}
      : { description: template.description, descriptionSource: template.descriptionSource }),
    schemaName: template.schemaName,
    platforms: template.platforms,
    enrollmentTypes: template.enrollmentTypes,
    multiConfig: template.multiConfig,
    portalHidden: template.portalHidden,
    placeholderCount: template.placeholders.length,
    fields: template.fields,
  }));
  const platforms = options.bundle.platforms.map((platform) => {
    const platformTypes = options.bundle.configurationTypes
      .filter((template) => template.platforms.includes(platform))
      .map((template) => template.type)
      .sort();
    return {
      platform,
      configurationTypeCount: platformTypes.length,
      configurationTypes: platformTypes,
    };
  });
  const allFields = options.bundle.configurationTypes.flatMap((template) => template.fields);
  const mockRoundtrip = runMockRoundtrip(options.bundle, options.key);
  const sampleExport = options.sampleRexp === undefined ? undefined : auditSampleExport(options.bundle, options.sampleRexp, options.key);
  const compatibilityIssues = schemaCompatibilityIssues(options.bundle);

  const report: RelutionAuditReport = {
    generatedAt: new Date().toISOString(),
    server: {
      version: options.bundle.serverVersion,
      sourceImage: options.bundle.sourceImage,
      sourceImageDigest: options.bundle.sourceImageDigest,
      bundleGeneratedAt: options.bundle.generatedAt,
    },
    summary: {
      platformCount: options.bundle.platforms.length,
      configurationTypeCount: options.bundle.configurationTypes.length,
      schemaCount: Object.keys(options.bundle.schemas).length,
      springGroupCount: springGroupCount(options.bundle),
      springPropertyCount: springPropertyCount(options.bundle),
      fieldCount: allFields.length,
      primitiveFieldCount: allFields.filter((field) => isPrimitiveKind(field.kind)).length,
      objectFieldCount: allFields.filter((field) => field.kind === "object").length,
      arrayFieldCount: allFields.filter((field) => field.kind === "array").length,
      enumFieldCount: allFields.filter((field) => field.enumValues.length > 0).length,
      describedFieldCount: allFields.filter((field) => field.description !== undefined).length,
      refFieldCount: allFields.filter((field) => field.ref !== undefined).length,
      schemaCompatibilityIssueCount: compatibilityIssues.length,
      mockRoundtripPassed: mockRoundtrip.filter((result) => mockResultOk(result)).length,
      mockRoundtripFailed: mockRoundtrip.filter((result) => !mockResultOk(result)).length,
    },
    sourceInventory: {
      openApiSchemas: Object.keys(options.bundle.schemas).length,
      iosSystemAppsPresent: options.bundle.refreshDiagnostics.iosSystemAppsLoaded,
      springConfigurationMetadataPresent: options.bundle.refreshDiagnostics.springConfigurationMetadataLoaded,
      runtimeMetadataSource: options.bundle.refreshDiagnostics.runtimeMetadata.source,
      runtimeMetadataConfigurationTypes: options.bundle.refreshDiagnostics.runtimeMetadata.configurationTypeCount,
    },
    platforms,
    configurationTypes,
    schemaCompatibilityIssues: compatibilityIssues,
    mockRoundtrip,
  };
  if (sampleExport !== undefined) {
    report.sampleExport = sampleExport;
  }
  return report;
}

export function writeAuditOutputs(report: RelutionAuditReport, options: AuditOutputOptions): void {
  if (options.jsonOut !== undefined) {
    writeTextFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.markdownOut !== undefined) {
    writeTextFile(options.markdownOut, renderAuditMarkdown(report));
  }
}

export function renderAuditMarkdown(report: RelutionAuditReport): string {
  const lines: string[] = [
    "# Relution Configuration Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Server version: ${report.server.version}`,
    `Template source: ${report.server.sourceImage}`,
    "",
    "## Summary",
    "",
    `- Platforms: ${report.summary.platformCount}`,
    `- Configuration types: ${report.summary.configurationTypeCount}`,
    `- OpenAPI schemas: ${report.summary.schemaCount}`,
    `- Spring metadata: ${report.summary.springGroupCount} groups, ${report.summary.springPropertyCount} properties`,
    `- Fields: ${report.summary.fieldCount} total, ${report.summary.primitiveFieldCount} primitive, ${report.summary.objectFieldCount} object, ${report.summary.arrayFieldCount} array`,
    `- Enum fields: ${report.summary.enumFieldCount}`,
    `- Fields with descriptions: ${report.summary.describedFieldCount}`,
    `- Referenced fields: ${report.summary.refFieldCount}`,
    `- Schema compatibility issues recorded: ${report.summary.schemaCompatibilityIssueCount}`,
    `- Mock roundtrip: ${report.summary.mockRoundtripPassed} passed, ${report.summary.mockRoundtripFailed} failed`,
    "",
    "## Platform Matrix",
    "",
    "| Platform | Configuration types |",
    "| --- | ---: |",
    ...report.platforms.map((entry) => `| ${entry.platform} | ${entry.configurationTypeCount} |`),
    "",
    "## Schema Compatibility",
    "",
  ];

  if (report.schemaCompatibilityIssues.length === 0) {
    lines.push("No schema compatibility issues were recorded.", "");
  } else {
    lines.push("| Schema | Path | Issue |", "| --- | --- | --- |");
    for (const issue of report.schemaCompatibilityIssues) {
      lines.push(`| ${issue.schemaName} | ${issue.path} | ${escapeMarkdown(issue.message)} |`);
    }
    lines.push("");
  }

  lines.push("## Mock Roundtrip", "");
  const failures = report.mockRoundtrip.filter((result) => !mockResultOk(result));
  if (failures.length === 0) {
    lines.push("All configuration templates validated, packed, verified, extracted, and preserved their `details.type`.", "");
  } else {
    lines.push("| Type | Platform | Errors |", "| --- | --- | --- |");
    for (const failure of failures) {
      lines.push(`| ${failure.type} | ${failure.platform} | ${escapeMarkdown(failure.errors.join("; "))} |`);
    }
    lines.push("");
  }

  if (report.sampleExport !== undefined) {
    lines.push("## Sample Export", "");
    lines.push(`- Path: ${report.sampleExport.path}`);
    lines.push(`- Hash verification: ${report.sampleExport.verifyOk ? "PASS" : "FAIL"}`);
    lines.push(`- Local schema validation: ${report.sampleExport.validationOk ? "PASS" : "FAIL"}`);
    if (report.sampleExport.validationErrors.length > 0) {
      lines.push("", "| Path | Error |", "| --- | --- |");
      for (const error of report.sampleExport.validationErrors) {
        lines.push(`| ${error.path} | ${escapeMarkdown(error.message)} |`);
      }
    }
    lines.push("");
  }

  lines.push("## Parameter Matrix", "");
  lines.push("The complete per-configuration field matrix is stored in the JSON audit report under `configurationTypes[].fields`.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function runMockRoundtrip(bundle: RelutionTemplateBundle, key: string): MockRoundtripResult[] {
  return bundle.configurationTypes.map((template) => runTemplateRoundtrip(bundle, template, key));
}

function runTemplateRoundtrip(bundle: RelutionTemplateBundle, template: ConfigurationTemplate, key: string): MockRoundtripResult {
  const platform = template.platforms.find((candidate) => candidate !== "UNKNOWN") ?? template.platforms[0] ?? "UNKNOWN";
  const root = mkdtempSync(join(tmpdir(), `relution-audit-${template.type.toLowerCase().replaceAll("_", "-")}-`));
  const out = join(root, "mock.rexp");
  const extracted = join(root, "extracted");
  const result: MockRoundtripResult = {
    type: template.type,
    platform,
    validationOk: false,
    packOk: false,
    verifyOk: false,
    extractOk: false,
    detailsTypeOk: false,
    errors: [],
  };

  try {
    const workspace = createNewWorkspace({
      workspace: root,
      platform,
      name: `Mock ${template.type}`,
      serverVersion: bundle.serverVersion,
    });
    const policyPath = requiredPolicyPath(workspace);
    addConfigurationToWorkspace(root, bundle, { policyPath, versionIndex: 0, type: template.type });
    const validation = validateWorkspace(loadWorkspace(root), bundle);
    result.validationOk = validation.ok;
    if (!validation.ok) {
      result.errors.push(...validation.errors.map((error) => `${error.path}: ${error.message}`));
      return result;
    }

    packPlainDirectory(root, out, key, { force: true });
    result.packOk = true;
    result.verifyOk = verifyRexp(out, key).ok;
    if (!result.verifyOk) {
      result.errors.push("verifyRexp failed");
      return result;
    }

    extractRexp(out, extracted, key, { force: true });
    result.extractOk = true;
    const extractedPolicy = JSON.parse(readFileSync(join(extracted, policyPath), "utf8")) as unknown;
    result.detailsTypeOk = extractedDetailsType(extractedPolicy) === template.type;
    if (!result.detailsTypeOk) {
      result.errors.push(`details.type mismatch after extract`);
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

function auditSampleExport(bundle: RelutionTemplateBundle, sampleRexp: string, key: string): SampleExportAudit {
  const root = mkdtempSync(join(tmpdir(), "relution-sample-audit-"));
  const verifyOk = verifyRexp(sampleRexp, key).ok;
  extractRexp(sampleRexp, root, key, { force: true, pretty: true });
  const validation = validateWorkspace(loadWorkspace(root), bundle);
  return {
    path: sampleRexp,
    verifyOk,
    validationOk: validation.ok,
    validationErrors: validation.errors,
  };
}

function mockResultOk(result: MockRoundtripResult): boolean {
  return result.validationOk && result.packOk && result.verifyOk && result.extractOk && result.detailsTypeOk;
}

function requiredPolicyPath(workspace: { policies: Array<{ path: string }> }): string {
  const policyPath = workspace.policies[0]?.path;
  if (policyPath === undefined) {
    throw new Error("Workspace has no policy");
  }
  return policyPath;
}

function extractedDetailsType(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const versions = Array.isArray(record.versions) ? record.versions : [];
  const firstVersion = versions[0];
  if (typeof firstVersion !== "object" || firstVersion === null || Array.isArray(firstVersion)) {
    return undefined;
  }
  const configurations = Array.isArray((firstVersion as Record<string, unknown>).configurations)
    ? ((firstVersion as Record<string, unknown>).configurations as unknown[])
    : [];
  const firstConfiguration = configurations[0];
  if (typeof firstConfiguration !== "object" || firstConfiguration === null || Array.isArray(firstConfiguration)) {
    return undefined;
  }
  const details = (firstConfiguration as Record<string, unknown>).details;
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return undefined;
  }
  const type = (details as Record<string, unknown>).type;
  return typeof type === "string" ? type : undefined;
}

function springGroupCount(bundle: RelutionTemplateBundle): number {
  return countArrayProperty(bundle.springConfigurationMetadata, "groups");
}

function springPropertyCount(bundle: RelutionTemplateBundle): number {
  return countArrayProperty(bundle.springConfigurationMetadata, "properties");
}

function countArrayProperty(value: unknown, property: string): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 0;
  }
  const child = (value as Record<string, unknown>)[property];
  return Array.isArray(child) ? child.length : 0;
}

function isPrimitiveKind(kind: string): boolean {
  return kind === "string" || kind === "boolean" || kind === "integer" || kind === "number";
}

function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

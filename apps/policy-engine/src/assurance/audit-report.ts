/** Builds deterministic inventory and summary sections for an audit report. */
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../contracts/template.js";
import { schemaCompatibilityIssues } from "../workspace/workspace-validation.js";
import type {
  AuditOptions,
  ConfigurationTypeAuditEntry,
  PlatformAuditEntry,
  RelutionAuditReport,
} from "./audit-types.js";
import { auditSampleExport } from "./audit-archive-inspection.js";
import { mockResultOk, runMockRoundtrip } from "./audit-roundtrip.js";

export function createRelutionAuditReport(options: AuditOptions): RelutionAuditReport {
  const configurationTypes = options.bundle.configurationTypes.map(configurationTypeEntry);
  const platforms = options.bundle.platforms.map((platform) => platformEntry(options.bundle, platform));
  const allFields = options.bundle.configurationTypes.flatMap((template) => template.fields);
  const mockRoundtrip = runMockRoundtrip(options.bundle, options.key);
  const compatibilityIssues = schemaCompatibilityIssues(options.bundle);
  const report: RelutionAuditReport = {
    generatedAt: new Date().toISOString(),
    server: {
      version: options.bundle.serverVersion,
      sourceImage: options.bundle.sourceImage,
      ...(options.bundle.sourceImageDigest === undefined ? {} : { sourceImageDigest: options.bundle.sourceImageDigest }),
      bundleGeneratedAt: options.bundle.generatedAt,
    },
    summary: {
      platformCount: options.bundle.platforms.length,
      configurationTypeCount: options.bundle.configurationTypes.length,
      schemaCount: Object.keys(options.bundle.schemas).length,
      springGroupCount: countArrayProperty(options.bundle.springConfigurationMetadata, "groups"),
      springPropertyCount: countArrayProperty(options.bundle.springConfigurationMetadata, "properties"),
      fieldCount: allFields.length,
      primitiveFieldCount: allFields.filter((field) => isPrimitiveKind(field.kind)).length,
      objectFieldCount: allFields.filter((field) => field.kind === "object").length,
      arrayFieldCount: allFields.filter((field) => field.kind === "array").length,
      enumFieldCount: allFields.filter((field) => field.enumValues.length > 0).length,
      describedFieldCount: allFields.filter((field) => field.description !== undefined).length,
      refFieldCount: allFields.filter((field) => field.ref !== undefined).length,
      schemaCompatibilityIssueCount: compatibilityIssues.length,
      mockRoundtripPassed: mockRoundtrip.filter(mockResultOk).length,
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
  if (options.sampleRexp !== undefined) report.sampleExport = auditSampleExport(options.bundle, options.sampleRexp, options.key);
  return report;
}

function configurationTypeEntry(template: ConfigurationTemplate): ConfigurationTypeAuditEntry {
  return {
    type: template.type,
    label: template.label,
    ...(template.description === undefined ? {} : { description: template.description, descriptionSource: template.descriptionSource }),
    schemaName: template.schemaName,
    platforms: template.platforms,
    enrollmentTypes: template.enrollmentTypes,
    multiConfig: template.multiConfig,
    portalHidden: template.portalHidden,
    placeholderCount: template.placeholders.length,
    fields: template.fields,
  };
}

function platformEntry(bundle: RelutionTemplateBundle, platform: string): PlatformAuditEntry {
  const configurationTypes = bundle.configurationTypes
    .filter((template) => template.platforms.includes(platform))
    .map((template) => template.type)
    .sort();
  return { platform, configurationTypeCount: configurationTypes.length, configurationTypes };
}

function countArrayProperty(value: unknown, property: string): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return 0;
  return Array.isArray((value as Record<string, unknown>)[property])
    ? ((value as Record<string, unknown>)[property] as unknown[]).length
    : 0;
}

function isPrimitiveKind(kind: string): boolean {
  return kind === "string" || kind === "boolean" || kind === "integer" || kind === "number";
}

/** Defines the public and internal structures of a Relution audit report. */
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../contracts/template.js";
import type { WorkspaceValidationError } from "../workspace/types.js";
import { schemaCompatibilityIssues } from "../workspace/workspace-validation.js";

export interface AuditOptions {
  bundle: RelutionTemplateBundle;
  key: string;
  sampleRexp?: string;
}

export interface AuditOutputOptions {
  jsonOut?: string;
  markdownOut?: string;
}

export interface PlatformAuditEntry {
  readonly platform: string;
  readonly configurationTypeCount: number;
  readonly configurationTypes: string[];
}

export interface ConfigurationTypeAuditEntry {
  readonly type: string;
  readonly label: string;
  readonly description?: string;
  readonly descriptionSource?: string;
  readonly schemaName: string;
  readonly platforms: string[];
  readonly enrollmentTypes: string[];
  readonly multiConfig: boolean;
  readonly portalHidden: boolean;
  readonly placeholderCount: number;
  readonly fields: ConfigurationTemplate["fields"];
}

export interface MockRoundtripResult {
  readonly type: string;
  readonly platform: string;
  validationOk: boolean;
  packOk: boolean;
  verifyOk: boolean;
  extractOk: boolean;
  detailsTypeOk: boolean;
  readonly errors: string[];
}

export interface SampleExportAudit {
  readonly path: string;
  readonly verifyOk: boolean;
  readonly validationOk: boolean;
  readonly validationErrors: WorkspaceValidationError[];
}

export interface RelutionAuditReport {
  generatedAt: string;
  server: {
    version: string;
    sourceImage: string;
    sourceImageDigest?: string;
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

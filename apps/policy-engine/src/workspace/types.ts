/** Declares the public workspace contracts. */
import type { CustomSettingsInput } from "../apple/apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export interface PolicyWorkspace { metadata: JsonRecord; report: JsonRecord; policies: WorkspacePolicy[]; }
export interface WorkspacePolicy { path: string; document: JsonRecord; }
export interface WorkspaceValidationResult { ok: boolean; errors: WorkspaceValidationError[]; schemaCompatibilityIssueCount?: number; schemaCompatibilityIssues?: SchemaCompatibilityIssue[]; }
export interface WorkspaceValidationError { path: string; message: string; }
export interface SchemaCompatibilityIssue { schemaName: string; path: string; kind: "invalid-pattern"; pattern: string; message: string; }
export interface NewWorkspaceOptions { platform: string; name: string; workspace: string; serverVersion: string; force?: boolean; /** Internal audit lane for declared unsupported template platforms. */ allowUnknownPlatform?: boolean; }
export interface AddConfigurationOptions { policyPath: string; versionIndex: number; type: string; }
export interface AddAppleCompatConfigurationOptions { policyPath: string; versionIndex: number; settingId: string; }
export interface AddAppleSchemaProfileOptions { policyPath: string; versionIndex: number; schemaId: string; }
export interface AddCustomSettingsOptions extends CustomSettingsInput { policyPath: string; versionIndex: number; }
export interface ConfigurationPositionOptions { policyPath: string; versionIndex: number; configurationIndex: number; }
export interface MoveConfigurationOptions extends ConfigurationPositionOptions { direction: "up" | "down"; }
export interface AddPolicyOptions { platform: string; name: string; }
export interface AddPolicyResult { workspace: PolicyWorkspace; policyPath: string; }
export interface SchemaSanitizationContext { schemaName: string; path: string; issues: SchemaCompatibilityIssue[]; }
export type SchemaSanitizer = (value: unknown, context: SchemaSanitizationContext) => unknown;

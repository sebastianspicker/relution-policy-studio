/** Shared types for Apple schema catalog entries and generated artifacts. */

export type AppleSchemaKind =
  | "profile"
  | "ddm-configuration"
  | "ddm-asset"
  | "ddm-activation"
  | "ddm-management"
  | "ddm-status"
  | "mdm-command"
  | "mdm-checkin"
  | "ddm-protocol";

export type AppleSchemaFieldKind = "string" | "textarea" | "boolean" | "integer" | "number" | "list" | "json" | "data";

export interface AppleSchemaCatalog {
  version: 1;
  source: {
    repository: string;
    revision: string;
    generatedAt: string;
  };
  counts: Record<AppleSchemaKind, number>;
  entries: AppleSchemaEntry[];
}

export interface AppleSchemaEntry {
  id: string;
  kind: AppleSchemaKind;
  title: string;
  description: string;
  identifier: string;
  sourcePath: string;
  availability: AppleAvailability;
  deprecated: boolean;
  fields: AppleSchemaField[];
}

export interface AppleAvailability {
  platforms: string[];
  allowMultiple: boolean;
  requiresMdm: boolean;
  deprecated: boolean;
  notes: string[];
}

export interface AppleSchemaField {
  path: string;
  payloadKey: string;
  title: string;
  kind: AppleSchemaFieldKind;
  required: boolean;
  description: string;
  defaultValue: unknown;
  enumValues: string[];
  variableSafe: boolean;
}

export interface AppleSchemaValues {
  [key: string]: unknown;
}

export interface DdmArtifact {
  uuid: string;
  schemaId: string;
  kind: AppleSchemaKind;
  identifier: string;
  title: string;
  values: AppleSchemaValues;
  payload: Record<string, unknown>;
}

export interface MdmCommandArtifact {
  uuid: string;
  schemaId: string;
  requestType: string;
  title: string;
  values: AppleSchemaValues;
  payload: Record<string, unknown>;
}

export interface CustomSettingsInput {
  domain: string;
  settings: Record<string, unknown>;
  displayName?: string;
}

export interface AppleSchemaProfileCreateOptions {
  uuidFactory?: () => string;
  now?: () => number;
}

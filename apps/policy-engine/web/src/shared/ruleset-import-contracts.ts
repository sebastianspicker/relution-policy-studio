// Shared ruleset-import parsing and mapping contracts.
import type { AppleSchemaCatalog } from "../../../src/browser/apple.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../../../src/browser/workspace.js";
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";
import type { JsonRecord } from "../../../src/browser/json.js";

export interface RulesetImportReport {
  applied: RulesetAppliedMapping[];
  unresolved: RulesetUnresolvedRule[];
  conflicts: string[];
  warnings: string[];
}

export interface RulesetImportResult {
  workspace?: PolicyWorkspace;
  report: RulesetImportReport;
}

export interface RulesetImportOptions {
  now?: number;
  uuidFactory?: () => string;
}

export type Mapping =
  | { readonly kind: "relution-native"; readonly type: string; readonly values: JsonRecord }
  | { readonly kind: "apple-mobileconfig"; readonly payloadType: string; readonly values: JsonRecord }
  | { readonly kind: "apple-schema-profile"; readonly schemaId: string; readonly values: JsonRecord };

export type RulesetPolicy = {
  readonly platform: string;
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly RulesetRule[];
};

export type RulesetRule = {
  readonly id: string;
  readonly title: string;
  readonly informational: boolean;
  readonly mappings: readonly Mapping[];
};

type RulesetAppliedMapping = {
  readonly policyName: string;
  readonly ruleId: string;
  readonly kind: Mapping["kind"];
  readonly target: string;
};

type RulesetUnresolvedRule = {
  readonly policyName: string;
  readonly ruleId: string;
  readonly title: string;
  readonly suggestions: readonly string[];
};

export type ImportContext = {
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly now: number;
  readonly uuidFactory: () => string;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
};

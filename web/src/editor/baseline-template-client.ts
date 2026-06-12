import type { BaselineTemplatePlatform, BaselineTemplateShape, BaselineTemplateTier } from "../../../src/baseline-templates.js";
import { networkEditorAuthHeaders, readJsonResponse } from "./editor-utils.js";

export interface BaselineTemplateClientSelection {
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
}

export interface BaselineExpertApplyRuleset {
  readonly version: 1;
  readonly name: string;
  readonly policies: readonly {
    readonly platform: BaselineTemplatePlatform;
    readonly name: string;
    readonly description?: string;
    readonly rules: readonly {
      readonly id: string;
      readonly title: string;
      readonly informational: false;
      readonly reason?: string;
      readonly sourceRules?: readonly { readonly source: string; readonly ruleId: string; readonly title: string }[];
      readonly mappings: readonly {
        readonly kind: string;
        readonly type?: string;
        readonly payloadType?: string;
        readonly schemaId?: string;
        readonly values: Record<string, unknown>;
      }[];
    }[];
  }[];
}

export async function fetchBaselineTemplateRuleset(template: BaselineTemplateClientSelection): Promise<unknown> {
  const params = new URLSearchParams({
    platform: template.platform,
    tier: String(template.tier),
    shape: template.shape,
  });
  const response = await fetch(`/api/baseline-templates/template?${params.toString()}`, { headers: networkEditorAuthHeaders() });
  const parsed = await readJsonResponse<unknown>(response);
  if (!response.ok) {
    throw new Error(JSON.stringify(parsed));
  }
  return parsed;
}

export function baselineTemplateImportName(template: BaselineTemplateClientSelection): string {
  return `baseline ${template.platform} tier ${String(template.tier)} ${template.shape}`;
}

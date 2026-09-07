/** Fetches and names baseline-template rulesets for import into the active workspace. */
import type { BaselineTemplatePlatform, BaselineTemplateShape, BaselineTemplateTier } from "../../../../src/browser/assurance.js";
import { networkEditorAuthHeaders } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";

export interface BaselineTemplateClientSelection {
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
}

export type { BaselineExpertApplyRuleset } from "../../shared/baseline-template-contract.js";

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

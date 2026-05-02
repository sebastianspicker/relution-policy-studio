import type { BaselineTemplatePlatform, BaselineTemplateShape, BaselineTemplateTier } from "../../../src/baseline-templates.js";
import { readJsonResponse } from "./editor-utils.js";

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

export interface BaselineTemplateApplyActions {
  readonly applyBaselineTemplate: (template: BaselineTemplateClientSelection) => Promise<void>;
  readonly applyExpertBaselineSelection: (ruleset: BaselineExpertApplyRuleset) => Promise<void>;
}

export function createBaselineTemplateApplyActions(input: {
  readonly currentWorkspaceHasContent: boolean;
  readonly isDirty: boolean;
  readonly applyRulesetJson: (name: string, parsed: unknown) => Promise<void>;
  readonly setStatus: (status: string) => void;
}): BaselineTemplateApplyActions {
  return {
    applyBaselineTemplate: async (template) => {
      if (!confirmReplace(input.currentWorkspaceHasContent, input.isDirty)) {
        return;
      }
      try {
        await input.applyRulesetJson(baselineTemplateImportName(template), await fetchBaselineTemplateRuleset(template));
        input.setStatus("Applied baseline template");
      } catch (error) {
        input.setStatus(`Baseline template import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    applyExpertBaselineSelection: async (ruleset) => {
      if (!ruleset.policies.some((policy) => policy.rules.length > 0)) {
        input.setStatus("Select at least one expert baseline setting");
        return;
      }
      if (!confirmReplace(input.currentWorkspaceHasContent, input.isDirty)) {
        return;
      }
      try {
        await input.applyRulesetJson(ruleset.name, ruleset);
        input.setStatus("Applied expert baseline selection");
      } catch (error) {
        input.setStatus(`Expert baseline import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

export async function fetchBaselineTemplateRuleset(template: BaselineTemplateClientSelection): Promise<unknown> {
  const params = new URLSearchParams({
    platform: template.platform,
    tier: String(template.tier),
    shape: template.shape,
  });
  const response = await fetch(`/api/baseline-templates/template?${params.toString()}`);
  const parsed = await readJsonResponse<unknown>(response);
  if (!response.ok) {
    throw new Error(JSON.stringify(parsed));
  }
  return parsed;
}

export function baselineTemplateImportName(template: BaselineTemplateClientSelection): string {
  return `baseline ${template.platform} tier ${String(template.tier)} ${template.shape}`;
}

function confirmReplace(currentWorkspaceHasContent: boolean, isDirty: boolean): boolean {
  return !(currentWorkspaceHasContent || isDirty) || window.confirm("Replace the current workspace with this baseline? This does not touch Relution and can be undone before saving.");
}

/** Composes archive and ruleset import action domains. */
import type { BaselineExpertApplyRuleset, BaselineTemplateClientSelection } from "../features/assurance/baseline-template-client.js";
import { createBaselineActions } from "./editor-baseline-actions.js";
import { buildArchive } from "../features/artifacts/editor-build-action.js";
import { createFileImportActions } from "../features/artifacts/editor-file-import-actions.js";
import { applyRulesetJson } from "../features/artifacts/editor-ruleset-apply.js";
import { createRulesetImportActions } from "../features/artifacts/editor-ruleset-import-actions.js";
import type { WorkspaceRequest } from "../shared/editor-workspace-request-guard.js";
import type { ImportBuildActionInput } from "../shared/editor-import-build-contract.js";
export type { ImportBuildActionInput } from "../shared/editor-import-build-contract.js";


export function createImportBuildActions(input: ImportBuildActionInput): {
  readonly buildArchive: () => Promise<void>;
  readonly importArchive: () => Promise<void>;
  readonly importJsonTemplates: () => Promise<void>;
  readonly importRuleset: () => Promise<void>;
  readonly importRecommendationRuleset: () => Promise<void>;
  readonly applyBaselineTemplate: (template: BaselineTemplateClientSelection) => Promise<void>;
  readonly applyExpertBaselineSelection: (ruleset: BaselineExpertApplyRuleset) => Promise<void>;
} {
  const applyRuleset = (name: string, parsed: unknown, request: WorkspaceRequest) => applyRulesetJson(input, name, parsed, request);
  const baselineActions = createBaselineActions(input, applyRuleset);
  const fileImportActions = createFileImportActions(input);
  const rulesetImportActions = createRulesetImportActions(input, applyRuleset);
  return {
    buildArchive: () => buildArchive(input),
    importArchive: fileImportActions.importArchive,
    importJsonTemplates: fileImportActions.importJsonTemplates,
    importRuleset: rulesetImportActions.importRuleset,
    importRecommendationRuleset: rulesetImportActions.importRecommendationRuleset,
    applyBaselineTemplate: baselineActions.applyBaselineTemplate,
    applyExpertBaselineSelection: baselineActions.applyExpertBaselineSelection,
  };
}

/** Applies baseline templates through the shared ruleset mutation path. */
import { baselineTemplateImportName, fetchBaselineTemplateRuleset, type BaselineExpertApplyRuleset, type BaselineTemplateClientSelection } from "../features/assurance/baseline-template-client.js";
import type { ImportBuildActionInput } from "../shared/editor-import-build-contract.js";
import { errorMessage } from "../features/artifacts/editor-ruleset-apply.js";
import type { WorkspaceRequest } from "../shared/editor-workspace-request-guard.js";

type ApplyRuleset = (name: string, parsed: unknown, request: WorkspaceRequest) => Promise<"applied" | "blocked">;

function confirmReplaceWorkspace(input: ImportBuildActionInput): boolean {
  return input.currentState.workspace.policies.length === 0 && !input.isDirty
    ? true
    : window.confirm("Replace the current workspace with this baseline? This does not touch Relution and can be undone before saving.");
}

async function importBaselineRuleset(input: ImportBuildActionInput, applyRuleset: ApplyRuleset, name: string, parsed: Promise<unknown> | unknown, success: string, failure: string, request: WorkspaceRequest): Promise<void> {
  try {
    if (await applyRuleset(name, await parsed, request) === "applied") input.setActionSuccessStatus(success);
  } catch (error) {
    if (!input.requestGuard.isCurrent(request)) return;
    const message = errorMessage(error);
    input.setLastActionResult({ ok: false, error: message });
    input.setStatus(`${failure}: ${message}`);
  }
}

export function createBaselineActions(input: ImportBuildActionInput, applyRuleset: ApplyRuleset): {
  readonly applyBaselineTemplate: (template: BaselineTemplateClientSelection) => Promise<void>;
  readonly applyExpertBaselineSelection: (ruleset: BaselineExpertApplyRuleset) => Promise<void>;
} {
  async function applyBaselineTemplate(template: BaselineTemplateClientSelection): Promise<void> {
    if (!confirmReplaceWorkspace(input)) return;
    await importBaselineRuleset(input, applyRuleset, baselineTemplateImportName(template), fetchBaselineTemplateRuleset(template), "Applied baseline template", "Baseline template import failed", input.requestGuard.begin());
  }
  async function applyExpertBaselineSelection(ruleset: BaselineExpertApplyRuleset): Promise<void> {
    if (!ruleset.policies.some((policy) => policy.rules.length > 0)) {
      input.setActionErrorStatus("Select at least one expert baseline setting");
      return;
    }
    if (!confirmReplaceWorkspace(input)) return;
    await importBaselineRuleset(input, applyRuleset, ruleset.name, ruleset, "Applied expert baseline selection", "Expert baseline import failed", input.requestGuard.begin());
  }
  return { applyBaselineTemplate, applyExpertBaselineSelection };
}

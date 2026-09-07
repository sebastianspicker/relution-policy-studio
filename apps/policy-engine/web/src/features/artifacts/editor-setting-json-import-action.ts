/** Applies selected setting JSON through the live editor selection. */
import type { ImportBuildActionInput } from "../../shared/editor-import-build-contract.js";
import { mergeSettingDetails, parseSettingDetailsJson } from "./json-template-import.js";
import { reportImportError } from "./editor-ruleset-apply.js";

export async function importJsonTemplates(input: ImportBuildActionInput): Promise<void> {
  if (input.selection === undefined || input.configuration === undefined || input.details === undefined) {
    input.setActionErrorStatus("Select a configuration before applying JSON");
    return;
  }
  const file = input.jsonTemplateFile;
  if (file === undefined) {
    input.setActionErrorStatus("Choose a setting JSON file first");
    return;
  }
  const request = input.requestGuard.begin();
  try {
    const imported = parseSettingDetailsJson(await file.text());
    if (!input.requestGuard.isCurrent(request)) return;
    if (!input.updateSelectedConfiguration({ ...input.configuration, details: mergeSettingDetails(input.details, imported) })) return;
    input.setActionSuccessStatus(`Applied ${file.name} to selected setting`);
    input.setInspectorTab("validation");
  } catch (error) {
    if (input.requestGuard.isCurrent(request)) reportImportError(input, error, "Setting JSON import");
  }
}

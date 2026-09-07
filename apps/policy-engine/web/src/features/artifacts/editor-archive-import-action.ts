/** Imports an archive through the exclusive workspace mutation path. */
import { postJson } from "../../shared/editor-api-client.js";
import { fileToBase64 } from "../../shared/editor-field-values.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import { firstConfigurationSelection } from "../../shared/editor-workspace-utils.js";
import type { ImportBuildActionInput } from "../../shared/editor-import-build-contract.js";
import { importedKeyState } from "../../shared/key-validation.js";
import { clearWorkspaceHistory } from "../../shared/workspace-history.js";
import { reportImportError } from "./editor-ruleset-apply.js";
import type { JsonRecord, WorkspaceResponse } from "../../shared/editor-contracts.js";

export async function importArchive(input: ImportBuildActionInput): Promise<void> {
  const file = input.importFile;
  if (file === undefined) {
    input.setActionErrorStatus("Choose a .rexp file first");
    return;
  }
  if (input.isDirty && !window.confirm("Importing replaces the current workspace. Continue?")) return;
  const request = input.requestGuard.beginExclusiveMutation();
  if (request === undefined) {
    input.setActionErrorStatus("A server workspace mutation is already in progress");
    return;
  }
  try {
    const body: JsonRecord = { fileName: file.name, dataBase64: await fileToBase64(file), expectedRevision: input.currentState.revision };
    const key = input.keyValue.trim();
    if (key.length > 0) body.key = key;
    const response = await postJson("/api/import", body);
    const result = await readJsonResponse<WorkspaceResponse | JsonRecord>(response);
    if (!response.ok) {
      input.setActionErrorStatus(`Import blocked: ${JSON.stringify(result)}`);
      return;
    }
    if (!input.requestGuard.isExclusiveCurrent(request)) return;
    const imported = result as WorkspaceResponse;
    input.setState((current) => current === undefined ? current : {
      ...current,
      revision: imported.revision,
      workspace: imported.workspace,
      validation: imported.validation,
      ...importedKeyState(imported, current),
      sidecar: imported.sidecar ?? current.sidecar,
    });
    input.setIsDirty(false);
    input.setHasFreshBuild(false);
    clearWorkspaceHistory(input.historyInput);
    input.setSelection(firstConfigurationSelection(imported.workspace));
    input.setSelectedType("");
    input.setActionSuccessStatus(`Imported ${file.name}`);
  } catch (error) {
    if (input.requestGuard.isExclusiveCurrent(request)) reportImportError(input, error, "Import");
  } finally {
    input.requestGuard.finishExclusiveMutation(request);
  }
}

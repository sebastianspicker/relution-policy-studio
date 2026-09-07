/** Runs one cancellable policy-wizard data request. */
import { editorApiFetch } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";

export function requestPolicyWizardData<T>(
  url: string,
  onSuccess: (result: T) => void,
  onError: (message: string) => void,
): () => void {
  let cancelled = false;
  void executePolicyWizardRequest(url, onSuccess, onError, () => cancelled);
  return () => { cancelled = true; };
}

async function executePolicyWizardRequest<T>(
  url: string,
  onSuccess: (result: T) => void,
  onError: (message: string) => void,
  isCancelled: () => boolean,
): Promise<void> {
  try {
    const response = await editorApiFetch(url);
    const result = await readJsonResponse<T>(response);
    if (isCancelled()) return;
    if (!response.ok) {
      onError(JSON.stringify(result));
      return;
    }
    onSuccess(result);
  } catch (error) {
    if (!isCancelled()) onError(error instanceof Error ? error.message : String(error));
  }
}

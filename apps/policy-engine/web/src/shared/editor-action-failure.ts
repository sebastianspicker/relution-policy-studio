/** Publishes a failed editor action without losing the original error text. */
export interface EditorActionFailureSink {
  readonly setLastActionResult: (result: { readonly ok: false; readonly error: string }) => void;
  readonly setStatus: (message: string) => void;
}

export function reportEditorActionFailure(input: EditorActionFailureSink, prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  input.setLastActionResult({ ok: false, error: message });
  input.setStatus(`${prefix}: ${message}`);
}

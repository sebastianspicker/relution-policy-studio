/** Parses JSON while preserving a caller-owned, non-secret error context. */
export function parseJsonWithContext(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw jsonContextError(label, error);
  }
}

export function jsonContextError(label: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Could not parse ${label}: ${message}`);
}

/** Builds consistent ZIP-family limit errors without duplicating boundary logic. */
export function maximumExceededError(label: string, actual: number, limit: number): Error {
  return new Error(`${label} (${String(actual)} > ${String(limit)})`);
}

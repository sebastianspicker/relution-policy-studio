/** Converts JSON-compatible constraint values into safe comparable integers. */
export function comparableNumber(value: unknown): number | undefined {
  if (typeof value === "number") return safeInteger(value);
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return safeInteger(Number(value));
}

function safeInteger(value: number): number | undefined {
  return Number.isFinite(value) && Number.isSafeInteger(value) ? value : undefined;
}

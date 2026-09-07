/** Parses a non-negative decimal Content-Length without trusting malformed values. */
export function httpServiceContentLength(value: string | string[] | null | undefined): number | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || text === null || !/^\d+$/u.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

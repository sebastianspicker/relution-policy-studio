/** Validates local transport options before outbound service work begins. */
export function positiveHttpServiceSafeInteger(value: number, label: string): number {
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new Error(`${label} must be a positive safe integer`);
}

export function isHttpServiceRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

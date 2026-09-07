/** Parses finite plist integer and real scalar values. */
export function parsePlistInteger(value: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/u.test(trimmed)) throw new Error(`Invalid plist integer: ${value}`);
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Plist integer is outside the safe integer range: ${value}`);
  return parsed;
}

export function parsePlistReal(value: string): number {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(trimmed)) {
    throw new Error(`Invalid plist real: ${value}`);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) throw new Error(`Plist real must be finite: ${value}`);
  return parsed;
}

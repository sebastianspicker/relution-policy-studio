/** Rejects runtime values that cannot be represented as lossless ordinary JSON. */
export function assertPlainJson(value: unknown, label: string): void {
  assertJsonValue(value, label, new Set<object>());
}

function assertJsonValue(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite JSON numbers`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} contains a non-JSON ${typeof value} value`);
  if (ancestors.has(value)) throw new Error(`${path} contains a cyclic JSON value`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${path} must contain only plain JSON arrays`);
      for (let index = 0; index < value.length; index += 1) assertJsonValue(value[index], `${path}[${String(index)}]`, ancestors);
      return;
    }
    assertPlainRecord(value, path);
    for (const key of Object.keys(value)) assertJsonValue(value[key], `${path}.${key}`, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function assertPlainRecord(value: object, path: string): asserts value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${path} must contain only plain JSON objects`);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(`${path} must not contain symbol properties`);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) throw new Error(`${path}.${key} must not be an accessor`);
    if (key === "toJSON") throw new Error(`${path} must not define a custom toJSON method`);
  }
}

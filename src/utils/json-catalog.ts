import { existsSync, readFileSync } from "node:fs";

export function readJsonCatalog<T>(
  path: string,
  label: string,
  isValid: (value: unknown) => boolean = () => true,
): T {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isValid(parsed)) {
    throw new Error(`Invalid ${label.charAt(0).toLowerCase()}${label.slice(1)}: ${path}`);
  }
  return parsed as T;
}

/** Shared strict numeric request parsing for editor route inputs. */
import { requireNumber } from "./editor-api-request-input.js";
import { badRequest } from "./editor-http-error.js";

export function optionalNonNegativeInteger(body: Record<string, unknown>, key: string): number | undefined {
  if (body[key] === undefined) return undefined;
  const value = requireNumber(body, key);
  if (!Number.isSafeInteger(value) || value < 0) throw badRequest(`Expected non-negative integer for ${key}`);
  return value;
}

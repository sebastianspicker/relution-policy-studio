/** Parses baseline platform, shape, and tier request selections. */
import {
  isBaselineTemplatePlatform,
  isBaselineTemplateShape,
  isBaselineTemplateTier,
  type BaselineTemplatePlatform,
  type BaselineTemplateShape,
  type BaselineTemplateTier,
} from "./baseline-template-model.js";

function parseBaselineTemplateString<T extends string>(
  value: string | null,
  kind: string,
  isValid: (candidate: string) => candidate is T,
): T {
  if (value !== null && isValid(value)) return value;
  throw new Error(`Unknown baseline template ${kind}: ${String(value)}`);
}

export function parseBaselineTemplatePlatform(value: string | null): BaselineTemplatePlatform {
  return parseBaselineTemplateString(value, "platform", isBaselineTemplatePlatform);
}

export function parseBaselineTemplateShape(value: string | null): BaselineTemplateShape {
  return parseBaselineTemplateString(value, "shape", isBaselineTemplateShape);
}

export function parseBaselineTemplateTier(value: string | null): BaselineTemplateTier {
  const parsed = Number(value);
  if (isBaselineTemplateTier(parsed)) return parsed;
  throw new Error(`Unknown baseline template tier: ${String(value)}`);
}

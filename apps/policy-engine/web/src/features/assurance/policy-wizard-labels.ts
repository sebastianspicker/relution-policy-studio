/** Formats baseline wizard values and human-readable labels. */
import type {
  BaselineTemplatePlatform,
  BaselineTemplateShape,
} from "../../../../src/browser/assurance.js";

export function formatMappingValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

export function sourceLabel(source: string): string {
  if (source === "bsi") return "BSI";
  if (source === "cis") return "CIS";
  if (source === "vendor") return "Vendor";
  return source.toUpperCase();
}

export function platformLabel(platform: BaselineTemplatePlatform): string {
  const labels: Record<BaselineTemplatePlatform, string> = {
    ANDROID_ENTERPRISE: "Android Enterprise",
    IOS: "iOS",
    MACOS: "macOS",
    WINDOWS: "Windows",
  };
  return labels[platform];
}

export function shapeLabel(shape: BaselineTemplateShape): string {
  return shape === "modules" ? "Modular policies" : "Single policy";
}

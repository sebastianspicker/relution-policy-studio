/** Normalizes configuration-picker values and labels. */
import { findAppleCompatSetting } from "../../../src/browser/apple.js";
import type { AddSelection } from "./editor-contracts.js";

export const NATIVE_ADD_PREFIX = "native:";
export const APPLE_COMPAT_ADD_PREFIX = "apple-compat:";
export const APPLE_SCHEMA_ADD_PREFIX = "apple-profile:";
export const CUSTOM_SETTINGS_ADD_VALUE = "custom-settings";

export function isPrimitiveKind(kind: string): boolean {
  return kind === "boolean" || kind === "string" || kind === "integer" || kind === "number";
}

export function parseAddSelection(value: string): AddSelection {
  if (value === CUSTOM_SETTINGS_ADD_VALUE) {
    return { kind: "custom-settings", value };
  }
  if (value.startsWith(APPLE_SCHEMA_ADD_PREFIX)) {
    return { kind: "apple-profile", value: value.slice(APPLE_SCHEMA_ADD_PREFIX.length) };
  }
  if (value.startsWith(APPLE_COMPAT_ADD_PREFIX)) {
    return { kind: "apple-compat", value: value.slice(APPLE_COMPAT_ADD_PREFIX.length) };
  }
  if (value.startsWith(NATIVE_ADD_PREFIX)) {
    return { kind: "native", value: value.slice(NATIVE_ADD_PREFIX.length) };
  }
  return { kind: "native", value };
}

export function addConfigurationLabel(selection: AddSelection): string {
  if (selection.kind === "apple-compat") {
    return findAppleCompatSetting(selection.value)?.label ?? selection.value;
  }
  if (selection.kind === "custom-settings") {
    return "Application & Custom Settings";
  }
  return selection.value;
}

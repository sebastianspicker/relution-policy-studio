/** Persists sanitized custom theme tokens and rejects inaccessible or unsafe state. */
import {
  CUSTOM_THEME_STORAGE_NAME,
  DEFAULT_CUSTOM_THEME_TOKENS,
  type CustomThemeTokens,
  type ThemeStorage,
} from "./theme-contract.js";
import { parseCustomThemeTokens, sanitizeCustomThemeTokens } from "./custom-theme-tokens.js";
import { validateCustomThemeContrast } from "./theme-contrast.js";

export function readCustomThemeTokens(storage: ThemeStorage | undefined): CustomThemeTokens {
  if (storage === undefined) return {};
  try {
    return parseCustomThemeTokens(storage.getItem(CUSTOM_THEME_STORAGE_NAME));
  } catch {
    return {};
  }
}

export function writeCustomThemeTokens(storage: ThemeStorage | undefined, tokens: CustomThemeTokens): boolean {
  if (storage === undefined) return false;
  const sanitizedTokens = sanitizeCustomThemeTokens(tokens);
  if (!validateCustomThemeContrast({ ...DEFAULT_CUSTOM_THEME_TOKENS, ...sanitizedTokens }).ok) return false;
  try {
    storage.setItem(CUSTOM_THEME_STORAGE_NAME, JSON.stringify(sanitizedTokens));
    return true;
  } catch {
    return false;
  }
}

export function resetCustomThemeTokens(storage: ThemeStorage | undefined): boolean {
  if (storage === undefined) return false;
  try {
    storage.removeItem(CUSTOM_THEME_STORAGE_NAME);
    return true;
  } catch {
    return false;
  }
}

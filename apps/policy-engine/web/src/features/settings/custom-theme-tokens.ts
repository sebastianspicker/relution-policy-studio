/** Sanitizes, persists, applies, and clears custom corporate theme tokens. */
import {
  CUSTOM_THEME_TOKEN_NAMES,
  isCustomThemeTokenName,
  sanitizeCustomThemeTokenValue,
  type CustomThemeTokens,
} from "./theme-contract.js";

export function parseCustomThemeTokens(value: unknown): CustomThemeTokens {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return sanitizeCustomThemeTokens(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function sanitizeCustomThemeTokens(value: Record<string, unknown>): CustomThemeTokens {
  const tokens: CustomThemeTokens = {};
  for (const [tokenName, tokenValue] of Object.entries(value)) {
    if (!isCustomThemeTokenName(tokenName)) continue;
    const sanitized = sanitizeCustomThemeTokenValue(tokenValue);
    if (sanitized !== undefined) tokens[tokenName] = sanitized;
  }
  return tokens;
}

export function applyCustomThemeTokens(target: HTMLElement, tokens: CustomThemeTokens): void {
  for (const tokenName of CUSTOM_THEME_TOKEN_NAMES) {
    const tokenValue = tokens[tokenName];
    if (tokenValue === undefined) target.style.removeProperty(tokenName);
    else target.style.setProperty(tokenName, tokenValue);
  }
}

export function clearCustomThemeTokens(target: HTMLElement): void {
  for (const tokenName of CUSTOM_THEME_TOKEN_NAMES) target.style.removeProperty(tokenName);
}

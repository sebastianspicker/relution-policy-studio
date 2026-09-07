/** Owns persisted custom-theme editing, contrast validation, and DOM application. */
import { useEffect, useState } from "react";
import {
  DEFAULT_CUSTOM_THEME_TOKENS,
  type CorporateTheme,
  type CustomThemeTokenName,
  type CustomThemeTokens,
} from "./theme-contract.js";
import { validateCustomThemeContrast } from "./theme-contrast.js";
import { readCustomThemeTokens, resetCustomThemeTokens, writeCustomThemeTokens } from "./custom-theme-storage.js";
import { applyCustomThemeTokens, clearCustomThemeTokens } from "./custom-theme-tokens.js";
import { themeStorage } from "./theme-storage.js";

function getCustomTokens(): CustomThemeTokens {
  return { ...DEFAULT_CUSTOM_THEME_TOKENS, ...readCustomThemeTokens(themeStorage()) };
}

export function useCustomTheme(theme: CorporateTheme, onThemeChange: (theme: CorporateTheme) => void) {
  const [customTokens, setCustomTokens] = useState<CustomThemeTokens>(getCustomTokens);
  const [appliedTokens, setAppliedTokens] = useState<CustomThemeTokens>(getCustomTokens);
  const [contrastError, setContrastError] = useState<string>();
  const [showTokens, setShowTokens] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (theme === "custom") applyCustomThemeTokens(document.documentElement, appliedTokens);
    else clearCustomThemeTokens(document.documentElement);
  }, [appliedTokens, theme]);

  function updateToken(tokenName: CustomThemeTokenName, tokenValue: string): void {
    const nextTokens = { ...customTokens, [tokenName]: tokenValue };
    setCustomTokens(nextTokens);
    const result = validateCustomThemeContrast(nextTokens);
    if (!result.ok) {
      setContrastError(result.failures.map((failure) => `${failure.pair}: ${failure.ratio.toFixed(2)}:1 (needs ${failure.minimum}:1)`).join("; "));
      return;
    }
    setContrastError(undefined);
    setAppliedTokens(nextTokens);
    if (writeCustomThemeTokens(themeStorage(), nextTokens)) onThemeChange("custom");
  }

  function resetTokens(): void {
    resetCustomThemeTokens(themeStorage());
    setCustomTokens(DEFAULT_CUSTOM_THEME_TOKENS);
    setAppliedTokens(DEFAULT_CUSTOM_THEME_TOKENS);
    setContrastError(undefined);
    onThemeChange("custom");
  }

  return { customTokens, contrastError, showTokens, setShowTokens, updateToken, resetTokens };
}

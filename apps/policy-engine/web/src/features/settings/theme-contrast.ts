/** Validates the minimum contrast pairs used by a custom corporate theme. */
import {
  DEFAULT_CUSTOM_THEME_TOKENS,
  type CustomThemeTokens,
  type ThemeContrastFailure,
  type ThemeContrastResult,
} from "./theme-contract.js";

export function validateCustomThemeContrast(tokens: CustomThemeTokens): ThemeContrastResult {
  const resolved = { ...DEFAULT_CUSTOM_THEME_TOKENS, ...tokens };
  const pairs = [
    ["Toolbar text", resolved["--ci-color-toolbar-text"], resolved["--ci-color-toolbar-bg"], 4.5],
    ["Primary action text", resolved["--ci-color-primary-contrast"], resolved["--ci-color-primary"], 4.5],
    ["Primary focus on surface", resolved["--ci-color-primary"], resolved["--ci-color-surface"], 3],
    ["Primary focus on page", resolved["--ci-color-primary"], resolved["--ci-color-page"], 3],
  ] as const;
  const failures: ThemeContrastFailure[] = [];
  for (const [pair, foreground, background, minimum] of pairs) {
    if (foreground === undefined || background === undefined) continue;
    const ratio = contrastRatio(foreground, background);
    if (ratio < minimum) failures.push({ pair, foreground, background, minimum, ratio });
  }
  return { ok: failures.length === 0, failures };
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

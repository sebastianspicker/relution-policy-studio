/** Defines corporate theme packs, token names, defaults, and storage contracts. */
export const THEME_STORAGE_NAME = "rexp-studio:corporate-theme";
export const CUSTOM_THEME_STORAGE_NAME = "rexp-studio:custom-corporate-theme";

export const CUSTOM_THEME_TOKEN_NAMES = [
  "--ci-color-page",
  "--ci-color-surface",
  "--ci-color-toolbar-bg",
  "--ci-color-toolbar-text",
  "--ci-color-primary",
  "--ci-color-primary-contrast",
] as const;

export const THEME_PACKS = [
  { value: "studio", label: "Studio", dataTheme: "studio" },
  { value: "neutral", label: "Neutral", dataTheme: "neutral" },
  { value: "organization", label: "Institution", dataTheme: "organization" },
  { value: "dark", label: "Dark", dataTheme: "dark" },
  { value: "custom", label: "Custom", dataTheme: "custom" },
] as const;

export type CorporateTheme = (typeof THEME_PACKS)[number]["value"];
export type CustomThemeTokenName = (typeof CUSTOM_THEME_TOKEN_NAMES)[number];
export type CustomThemeTokens = Partial<Record<CustomThemeTokenName, string>>;
export type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ThemeContrastFailure {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
  readonly pair: string;
  readonly ratio: number;
}

export interface ThemeContrastResult {
  readonly ok: boolean;
  readonly failures: readonly ThemeContrastFailure[];
}

export const DEFAULT_THEME: CorporateTheme = "studio";
export const DEFAULT_CUSTOM_THEME_TOKENS: CustomThemeTokens = {
  "--ci-color-page": "#e8edf2",
  "--ci-color-surface": "#ffffff",
  "--ci-color-toolbar-bg": "#121a24",
  "--ci-color-toolbar-text": "#d7e0ea",
  "--ci-color-primary": "#0d6e66",
  "--ci-color-primary-contrast": "#f4fffd",
};

export const CUSTOM_THEME_TOKEN_OPTIONS = [
  { name: "--ci-color-page", label: "Page" },
  { name: "--ci-color-surface", label: "Surface" },
  { name: "--ci-color-toolbar-bg", label: "Toolbar" },
  { name: "--ci-color-toolbar-text", label: "Toolbar text" },
  { name: "--ci-color-primary", label: "Primary" },
  { name: "--ci-color-primary-contrast", label: "Primary text" },
] as const satisfies readonly { readonly name: CustomThemeTokenName; readonly label: string }[];

export function isCorporateTheme(value: unknown): value is CorporateTheme {
  return typeof value === "string" && THEME_PACKS.some((theme) => theme.value === value);
}

export function isCustomThemeTokenName(value: unknown): value is CustomThemeTokenName {
  return typeof value === "string" && CUSTOM_THEME_TOKEN_NAMES.some((tokenName) => tokenName === value);
}

export function sanitizeCustomThemeTokenValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return undefined;
  return /^#[\da-f]{6}$/iu.test(trimmed) ? trimmed : undefined;
}

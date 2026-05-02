export const THEME_STORAGE_KEY = "relution-policy-workbench:corporate-theme";
export const CUSTOM_THEME_STORAGE_KEY = "relution-policy-workbench:custom-corporate-theme";

const CORPORATE_THEME_VALUES = ["default", "organization", "relution", "dark", "custom"] as const;
const CUSTOM_THEME_TOKEN_NAMES = [
  "--ci-color-page",
  "--ci-color-surface",
  "--ci-color-toolbar-bg",
  "--ci-color-toolbar-text",
  "--ci-color-primary",
  "--ci-color-primary-contrast",
] as const;

export type CorporateTheme = (typeof CORPORATE_THEME_VALUES)[number];
export type CustomThemeTokenName = (typeof CUSTOM_THEME_TOKEN_NAMES)[number];
export type CustomThemeTokens = Partial<Record<CustomThemeTokenName, string>>;

export type ThemePack = {
  readonly value: CorporateTheme;
  readonly label: string;
  readonly dataTheme: CorporateTheme;
};

export type ThemeReader = Pick<Storage, "getItem">;

export type ThemeWriter = Pick<Storage, "setItem">;

export type ThemeResetWriter = Pick<Storage, "removeItem">;

export const DEFAULT_THEME: CorporateTheme = "default";
export const DEFAULT_CUSTOM_THEME_TOKENS: CustomThemeTokens = {
  "--ci-color-page": "#f4f6f8",
  "--ci-color-surface": "#ffffff",
  "--ci-color-toolbar-bg": "#20242a",
  "--ci-color-toolbar-text": "#ffffff",
  "--ci-color-primary": "#1d6fb8",
  "--ci-color-primary-contrast": "#ffffff",
};

export const THEME_PACKS = [
  { value: "default", label: "Default", dataTheme: "default" },
  { value: "organization", label: "Institution", dataTheme: "organization" },
  { value: "relution", label: "Relution", dataTheme: "relution" },
  { value: "dark", label: "Dark", dataTheme: "dark" },
  { value: "custom", label: "Custom", dataTheme: "custom" },
] as const satisfies readonly ThemePack[];

export const THEME_OPTIONS = THEME_PACKS;

export const CUSTOM_THEME_TOKEN_OPTIONS = [
  { name: "--ci-color-page", label: "Page" },
  { name: "--ci-color-surface", label: "Surface" },
  { name: "--ci-color-toolbar-bg", label: "Toolbar" },
  { name: "--ci-color-toolbar-text", label: "Toolbar text" },
  { name: "--ci-color-primary", label: "Primary" },
  { name: "--ci-color-primary-contrast", label: "Primary text" },
] as const satisfies readonly { readonly name: CustomThemeTokenName; readonly label: string }[];

export function isCorporateTheme(value: unknown): value is CorporateTheme {
  return typeof value === "string" && CORPORATE_THEME_VALUES.some((theme) => theme === value);
}

export function parseCorporateTheme(value: unknown): CorporateTheme {
  return isCorporateTheme(value) ? value : DEFAULT_THEME;
}

export function readCorporateTheme(storage: ThemeReader | undefined): CorporateTheme {
  if (storage === undefined) {
    return DEFAULT_THEME;
  }

  try {
    return parseCorporateTheme(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeCorporateTheme(storage: ThemeWriter | undefined, theme: CorporateTheme): boolean {
  if (storage === undefined) {
    return false;
  }

  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function isCustomThemeTokenName(value: unknown): value is CustomThemeTokenName {
  return typeof value === "string" && CUSTOM_THEME_TOKEN_NAMES.some((tokenName) => tokenName === value);
}

export function sanitizeCustomThemeTokenValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return undefined;
  }

  return /^#[\da-f]{6}$/iu.test(trimmed) ? trimmed : undefined;
}

export function parseCustomThemeTokens(value: unknown): CustomThemeTokens {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const tokens: CustomThemeTokens = {};
    for (const [tokenName, tokenValue] of Object.entries(parsed)) {
      if (isCustomThemeTokenName(tokenName)) {
        const sanitized = sanitizeCustomThemeTokenValue(tokenValue);
        if (sanitized !== undefined) {
          tokens[tokenName] = sanitized;
        }
      }
    }
    return tokens;
  } catch {
    return {};
  }
}

export function readCustomThemeTokens(storage: ThemeReader | undefined): CustomThemeTokens {
  if (storage === undefined) {
    return {};
  }

  try {
    return parseCustomThemeTokens(storage.getItem(CUSTOM_THEME_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeCustomThemeTokens(storage: ThemeWriter | undefined, tokens: CustomThemeTokens): boolean {
  if (storage === undefined) {
    return false;
  }

  const sanitizedTokens: CustomThemeTokens = {};
  for (const [tokenName, tokenValue] of Object.entries(tokens)) {
    if (isCustomThemeTokenName(tokenName)) {
      const sanitized = sanitizeCustomThemeTokenValue(tokenValue);
      if (sanitized !== undefined) {
        sanitizedTokens[tokenName] = sanitized;
      }
    }
  }

  try {
    storage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(sanitizedTokens));
    return true;
  } catch {
    return false;
  }
}

export function resetCustomThemeTokens(storage: ThemeResetWriter | undefined): boolean {
  if (storage === undefined) {
    return false;
  }

  try {
    storage.removeItem(CUSTOM_THEME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function applyCustomThemeTokens(target: HTMLElement, tokens: CustomThemeTokens): void {
  for (const tokenName of CUSTOM_THEME_TOKEN_NAMES) {
    const tokenValue = tokens[tokenName];
    if (tokenValue === undefined) {
      target.style.removeProperty(tokenName);
    } else {
      target.style.setProperty(tokenName, tokenValue);
    }
  }
}

export function clearCustomThemeTokens(target: HTMLElement): void {
  for (const tokenName of CUSTOM_THEME_TOKEN_NAMES) {
    target.style.removeProperty(tokenName);
  }
}

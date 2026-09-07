/** Reads and writes the selected corporate theme using guarded browser storage. */
import {
  DEFAULT_THEME,
  THEME_STORAGE_NAME,
  isCorporateTheme,
  type CorporateTheme,
  type ThemeStorage,
} from "./theme-contract.js";

export function themeStorage(): ThemeStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function parseCorporateTheme(value: unknown): CorporateTheme {
  return isCorporateTheme(value) ? value : DEFAULT_THEME;
}

export function readCorporateTheme(storage: ThemeStorage | undefined): CorporateTheme {
  if (storage === undefined) return DEFAULT_THEME;
  try {
    return parseCorporateTheme(storage.getItem(THEME_STORAGE_NAME));
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeCorporateTheme(storage: ThemeStorage | undefined, theme: CorporateTheme): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(THEME_STORAGE_NAME, theme);
    return true;
  } catch {
    return false;
  }
}

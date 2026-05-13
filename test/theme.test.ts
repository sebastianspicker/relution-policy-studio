import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CUSTOM_THEME_STORAGE_KEY,
  DEFAULT_THEME,
  parseCustomThemeTokens,
  parseCorporateTheme,
  readCustomThemeTokens,
  readCorporateTheme,
  resetCustomThemeTokens,
  THEME_STORAGE_KEY,
  writeCustomThemeTokens,
  writeCorporateTheme,
  type ThemeReader,
  type ThemeWriter,
} from "../web/src/editor/theme.js";

class MemoryThemeStorage implements ThemeReader, ThemeWriter {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("parses supported corporate themes", () => {
  assert.equal(parseCorporateTheme("default"), "default");
  assert.equal(parseCorporateTheme("organization"), "organization");
  assert.equal(parseCorporateTheme("relution"), "relution");
  assert.equal(parseCorporateTheme("custom"), "custom");
});

test("falls back to the default corporate theme for unsupported values", () => {
  assert.equal(parseCorporateTheme("Institution"), DEFAULT_THEME);
  assert.equal(parseCorporateTheme(""), DEFAULT_THEME);
  assert.equal(parseCorporateTheme(null), DEFAULT_THEME);
  assert.equal(parseCorporateTheme(undefined), DEFAULT_THEME);
});

test("reads stored corporate themes with safe fallback behavior", () => {
  const storage = new MemoryThemeStorage();
  storage.setItem(THEME_STORAGE_KEY, "organization");

  assert.equal(readCorporateTheme(storage), "organization");

  storage.setItem(THEME_STORAGE_KEY, "unknown");
  assert.equal(readCorporateTheme(storage), DEFAULT_THEME);
  assert.equal(readCorporateTheme(undefined), DEFAULT_THEME);
  assert.equal(
    readCorporateTheme({
      getItem() {
        throw new Error("storage blocked");
      },
    }),
    DEFAULT_THEME,
  );
});

test("parses custom theme tokens from supported CSS custom properties", () => {
  assert.deepEqual(
    parseCustomThemeTokens(
      JSON.stringify({
        "--ci-color-page": "#101820",
        "--ci-color-primary": "#00aaff",
        "--ci-color-text": "#111111",
      }),
    ),
    {
      "--ci-color-page": "#101820",
      "--ci-color-primary": "#00aaff",
    },
  );
});

test("rejects unsafe custom theme token storage values", () => {
  assert.deepEqual(parseCustomThemeTokens("not json"), {});
  assert.deepEqual(parseCustomThemeTokens(JSON.stringify(["#ffffff"])), {});
  assert.deepEqual(
    parseCustomThemeTokens(
      JSON.stringify({
        "--ci-color-page": "red",
        "--ci-color-surface": "#fff",
        "--ci-color-primary": "#ffffff; color: red",
        "--ci-color-toolbar-bg": "#123abc",
      }),
    ),
    {
      "--ci-color-toolbar-bg": "#123abc",
    },
  );
});

test("reads, writes, and resets custom theme tokens safely", () => {
  const storage = new MemoryThemeStorage();

  assert.equal(
    writeCustomThemeTokens(storage, {
      "--ci-color-page": "#101820",
      "--ci-color-primary": "bad",
    }),
    true,
  );
  assert.equal(storage.getItem(CUSTOM_THEME_STORAGE_KEY), "{\"--ci-color-page\":\"#101820\"}");
  assert.deepEqual(readCustomThemeTokens(storage), { "--ci-color-page": "#101820" });

  assert.equal(resetCustomThemeTokens(storage), true);
  assert.equal(storage.getItem(CUSTOM_THEME_STORAGE_KEY), null);
  assert.deepEqual(readCustomThemeTokens(undefined), {});
  assert.equal(writeCustomThemeTokens(undefined, { "--ci-color-page": "#101820" }), false);
  assert.equal(resetCustomThemeTokens(undefined), false);
});

test("handles custom theme token storage failures without throwing", () => {
  assert.deepEqual(
    readCustomThemeTokens({
      getItem() {
        throw new Error("storage blocked");
      },
    }),
    {},
  );
  assert.equal(
    writeCustomThemeTokens(
      {
        setItem() {
          throw new Error("storage blocked");
        },
      },
      { "--ci-color-page": "#101820" },
    ),
    false,
  );
  assert.equal(
    resetCustomThemeTokens({
      removeItem() {
        throw new Error("storage blocked");
      },
    }),
    false,
  );
});

test("writes corporate themes without leaking storage failures", () => {
  const storage = new MemoryThemeStorage();

  assert.equal(writeCorporateTheme(storage, "relution"), true);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), "relution");
  assert.equal(writeCorporateTheme(undefined, "organization"), false);
  assert.equal(
    writeCorporateTheme(
      {
        setItem() {
          throw new Error("storage blocked");
        },
      },
      "organization",
    ),
    false,
  );
});

test("dark theme semantic status colors keep WCAG AA text contrast", () => {
  const tokens = readCssVariables("web/src/styles/themes/dark.css");

  assertContrast(tokens["--ci-color-success-text"], tokens["--ci-color-success-bg"], 4.5, "success");
  assertContrast(tokens["--ci-color-info-text"], tokens["--ci-color-info-bg"], 4.5, "info");
  assertContrast(tokens["--ci-color-warning-text"], tokens["--ci-color-page"], 4.5, "warning page");
});

test("toast and popover CSS use the documented z-index scale", () => {
  const toastCss = readFileSync("web/src/styles/toast.css", "utf8");
  const controlsCss = readFileSync("web/src/styles/controls.css", "utf8");

  assert.match(toastCss, /z-index: var\(--z-toast, 1000\)/u);
  assert.match(controlsCss, /z-index: var\(--z-popover, 200\)/u);
});

function readCssVariables(path: string): Record<string, string> {
  const css = readFileSync(path, "utf8");
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/giu)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

function assertContrast(foreground: string | undefined, background: string | undefined, minimum: number, label: string): void {
  assert.notEqual(foreground, undefined, `${label} foreground token`);
  assert.notEqual(background, undefined, `${label} background token`);
  assert.equal(contrastRatio(foreground ?? "#000000", background ?? "#ffffff") >= minimum, true, `${label} contrast`);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const [r, g, b] = [red, green, blue].map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linearize(component: number): number {
  return component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

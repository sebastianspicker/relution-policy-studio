import assert from "node:assert/strict";
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

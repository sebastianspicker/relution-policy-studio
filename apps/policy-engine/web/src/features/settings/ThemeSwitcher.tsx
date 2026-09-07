/** Selects built-in and custom themes while keeping contrast validation visible to editors. */
import type { JSX } from "react";
import {
  CUSTOM_THEME_TOKEN_OPTIONS,
  DEFAULT_CUSTOM_THEME_TOKENS,
  THEME_PACKS,
  type CorporateTheme,
} from "./theme-contract.js";
import { parseCorporateTheme } from "./theme-storage.js";
import { useCustomTheme } from "./useCustomTheme.js";

type ThemeSwitcherProps = {
  readonly theme: CorporateTheme;
  readonly onThemeChange: (theme: CorporateTheme) => void;
};

export function ThemeSwitcher({ theme, onThemeChange }: ThemeSwitcherProps): JSX.Element {
  const custom = useCustomTheme(theme, onThemeChange);

  return (
    <div className="theme-switcher">
      <fieldset className="theme-selector">
        <legend>Theme</legend>
        <div className="theme-options">
          {THEME_PACKS.map((option) => (
            <label key={option.value} className={theme === option.value ? "theme-option theme-option--selected" : "theme-option"}>
              <span className="theme-option-title">
                <input
                  type="radio"
                  name="corporate-theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={(event) => onThemeChange(parseCorporateTheme(event.target.value))}
                />
                {option.label}
              </span>
              <span className="theme-preview" data-theme={option.dataTheme} aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>
      {theme === "custom" ? (
        <div className="theme-token-panel">
          <button
            type="button"
            aria-expanded={custom.showTokens}
            onClick={() => custom.setShowTokens((visible) => !visible)}
          >
            {custom.showTokens ? "Hide tokens" : "Customize tokens"}
          </button>
          {custom.showTokens ? (
            <div className="theme-token-inputs">
              {CUSTOM_THEME_TOKEN_OPTIONS.map((option) => (
                <label key={option.name}>
                  {option.label}{" "}
                  <input
                    aria-label={`Custom theme ${option.label}`}
                    type="color"
                    value={custom.customTokens[option.name] ?? DEFAULT_CUSTOM_THEME_TOKENS[option.name] ?? "#000000"}
                    onChange={(event) => custom.updateToken(option.name, event.target.value)}
                  />
                </label>
              ))}
              {custom.contrastError !== undefined ? <p className="field-error" role="alert">Custom theme not applied: {custom.contrastError}</p> : null}
              <button type="button" onClick={custom.resetTokens}>
                Reset custom
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

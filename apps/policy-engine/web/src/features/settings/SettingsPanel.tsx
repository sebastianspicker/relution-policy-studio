/** Renders editor preferences, masked credential inputs, and theme controls. */
import type { JSX } from "react";
import { SectionHeader } from "../../ui/SectionHeader.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";
import type { CorporateTheme } from "./theme-contract.js";
import type { EditorController } from "../../shared/editor-contracts.js";
import { SettingsGuidance, SettingsIndex } from "./settings-navigation.js";
import { EncryptionSettings, ImportSettings } from "./settings-security-import.js";
import { AboutSettings, DangerSettings, ShortcutSettings } from "./settings-workspace-sections.js";

export function SettingsPanel(props: {
  readonly controller: EditorController;
  readonly theme: CorporateTheme;
  readonly onThemeChange: (theme: CorporateTheme) => void;
}): JSX.Element {
  return (
    <div className="settings-workspace">
      <SectionHeader title="Settings" description="Configure the local workbench, archive encryption, imports, and accessibility preferences." />
      <div className="settings-layout">
        <SettingsIndex />
        <div className="settings-panel">
          <section className="settings-section" id="settings-appearance">
            <h2>Appearance</h2>
            <p className="settings-hint">Choose one of the built-in themes or use a contrast-validated custom palette.</p>
            <ThemeSwitcher theme={props.theme} onThemeChange={props.onThemeChange} />
          </section>
          <EncryptionSettings controller={props.controller} />
          <ImportSettings controller={props.controller} />
          <ShortcutSettings />
          <DangerSettings controller={props.controller} />
          <AboutSettings controller={props.controller} />
        </div>
        <SettingsGuidance />
      </div>
    </div>
  );
}

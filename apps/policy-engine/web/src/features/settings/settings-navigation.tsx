/** Renders the settings section index and local-workbench guidance. */
import type { JSX } from "react";

const SETTINGS_SECTIONS = [
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-encryption", label: "Encryption" },
  { id: "settings-import", label: "Import" },
  { id: "settings-shortcuts", label: "Keyboard shortcuts" },
  { id: "settings-danger", label: "Danger zone" },
  { id: "settings-about", label: "About" },
] as const;

export function SettingsIndex(): JSX.Element {
  return (
    <nav className="settings-index" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => document.getElementById(section.id)?.scrollIntoView?.({ block: "start" })}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

export function SettingsGuidance(): JSX.Element {
  return (
    <aside className="settings-guidance" aria-label="Local workbench notes">
      <section><h2>Local by design</h2><p>Workspace editing and archive construction run in the local workbench.</p></section>
      <section><h2>Archive security</h2><p>The archive passphrase is masked in the browser and sent to the local editor process when required.</p></section>
      <section><h2>External actions</h2><p>Relution audits are read-only. Zammad ticket creation is a separate, explicitly confirmed write.</p></section>
    </aside>
  );
}

import { useEffect, useState, type JSX } from "react";
import { APPLE_COMPAT_HINT } from "../../../src/apple-compat.js";
import { BaselinePanel } from "./BaselinePanel.js";
import { ConfigurationInspector } from "./ConfigurationInspector.js";
import { ConfigurationPickerModal } from "./ConfigurationPickerModal.js";
import { EditorBreadcrumb } from "./EditorBreadcrumb.js";
import { asRecord } from "./editor-utils.js";
import { AppleCompatFields } from "./fields/AppleCompatFields.js";
import { AppleSchemaFields } from "./fields/AppleSchemaFields.js";
import { GeneratedFields } from "./fields/GeneratedFields.js";
import { InfoButton } from "./fields/InfoButton.js";
import { IconBaseline, IconDashboard, IconPolicies, IconSettings } from "./icons.js";
import { JsonTemplateImportControl } from "./JsonTemplateImportControl.js";
import { MobileConfigFields } from "./fields/MobileConfigFields.js";
import { PolicyNavigator } from "./PolicyNavigator.js";
import { RelutionDashboardPanel } from "./RelutionDashboardPanel.js";
import { SettingsPanel } from "./SettingsPanel.js";
import type { CorporateTheme } from "./theme.js";
import type { EditorController } from "./types.js";
import { WorkspaceToolbar } from "./WorkspaceToolbar.js";

const INSPECTOR_PINNED_KEY = "relution-editor-inspector-pinned";

function readInspectorPinned(): boolean {
  try {
    const stored = window.localStorage.getItem(INSPECTOR_PINNED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

type AppSection = "policies" | "baseline" | "dashboard" | "settings";

const APP_SECTIONS = [
  { id: "policies", label: "Policies", Icon: IconPolicies },
  { id: "baseline", label: "Baseline", Icon: IconBaseline },
  { id: "dashboard", label: "Dashboard", Icon: IconDashboard },
  { id: "settings", label: "Settings", Icon: IconSettings },
] as const satisfies readonly { readonly id: AppSection; readonly label: string; readonly Icon: (props: { size?: number }) => JSX.Element }[];

type EditorShellProps = {
  readonly controller: EditorController;
  readonly theme: CorporateTheme;
  readonly onThemeChange: (theme: CorporateTheme) => void;
};

export function EditorShell({ controller, theme, onThemeChange }: EditorShellProps): JSX.Element {
  const c = controller;
  const [appSection, setAppSection] = useState<AppSection>("policies");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(() =>
    typeof window !== "undefined" ? readInspectorPinned() : true,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(INSPECTOR_PINNED_KEY, String(inspectorPinned));
    } catch {
      // ignore
    }
  }, [inspectorPinned]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      if (event.key === "s") {
        event.preventDefault();
        void c.saveWorkspace();
      } else if (event.key === "b") {
        event.preventDefault();
        void c.buildArchive();
      } else if (event.key === "i") {
        event.preventDefault();
        setInspectorPinned((prev) => !prev);
      } else if (event.key === "z" && event.shiftKey) {
        event.preventDefault();
        c.redoWorkspace();
      } else if (event.key === "z") {
        event.preventDefault();
        c.undoWorkspace();
      } else if (event.key === "y") {
        event.preventDefault();
        c.redoWorkspace();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [c]);

  const workspaceClassName = [
    "workspace-grid",
    appSection === "policies" && navigationOpen ? "show-navigation" : "",
    appSection === "policies" && inspectorOpen ? "show-inspector" : "",
    inspectorPinned ? "inspector-pinned" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="editor-root" data-theme={theme}>
      <WorkspaceToolbar
        controller={c}
        inspectorPinned={inspectorPinned}
        onToggleInspector={() => setInspectorPinned((prev) => !prev)}
      />

      <nav className="mobile-section-controls" aria-label="App sections">
        {APP_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={appSection === section.id ? "page" : undefined}
            onClick={() => setAppSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {appSection === "policies" ? (
        <nav className="mobile-pane-controls" aria-label="Workspace panes">
          <button
            type="button"
            aria-controls="editor-navigation-pane"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen((current) => !current)}
          >
            Navigation
          </button>
          <button
            type="button"
            aria-controls="editor-inspector-pane"
            aria-expanded={inspectorOpen}
            onClick={() => setInspectorOpen((current) => !current)}
          >
            Inspector
          </button>
        </nav>
      ) : null}

      <section className={workspaceClassName}>
        <AppRail section={appSection} onChange={setAppSection} />

        <aside id="editor-navigation-pane" className="sidebar">
          <PolicyNavigator
            policies={c.state.workspace.policies}
            selection={c.selection}
            templatesByType={c.templatesByType}
            newPolicyName={c.newPolicyName}
            newPolicyPlatform={c.newPolicyPlatform}
            creatablePlatforms={c.creatablePlatforms}
            isDirty={c.isDirty}
            onSelect={c.setSelection}
            onMoveConfiguration={(targetSelection, direction) => void c.moveConfiguration(targetSelection, direction)}
            onRemoveConfiguration={(targetSelection) => void c.removeConfiguration(targetSelection)}
            onNewPolicyNameChange={c.setNewPolicyName}
            onNewPolicyPlatformChange={c.setNewPolicyPlatform}
            onCreatePolicy={() => void c.addPolicy()}
          />
        </aside>

        <section className="editor-panel">
          {appSection === "baseline" ? (
            <div className="center-section">
              <BaselinePanel controller={c} />
            </div>
          ) : appSection === "dashboard" ? (
            <div className="center-section center-section--wide">
              <RelutionDashboardPanel />
            </div>
          ) : appSection === "settings" ? (
            <div className="center-section center-section--narrow">
              <SettingsPanel controller={c} theme={theme} onThemeChange={onThemeChange} />
            </div>
          ) : c.selection === undefined ? (
            <EditorWelcome />
          ) : (
            <EditorWorkspace controller={c} />
          )}
        </section>

        <ConfigurationInspector controller={c} id="editor-inspector-pane" />
      </section>
    </main>
  );
}

function AppRail({
  section,
  onChange,
}: {
  readonly section: AppSection;
  readonly onChange: (s: AppSection) => void;
}): JSX.Element {
  return (
    <nav className="app-rail" aria-label="App sections">
      {APP_SECTIONS.map((appSection) => (
        <button
          key={appSection.id}
          type="button"
          className="app-rail-btn"
          aria-current={section === appSection.id ? "page" : undefined}
          title={appSection.label}
          onClick={() => onChange(appSection.id)}
        >
          <span className="app-rail-icon" aria-hidden="true">
            <appSection.Icon size={20} />
          </span>
          <span className="app-rail-label">{appSection.label}</span>
        </button>
      ))}
    </nav>
  );
}

function EditorWorkspace({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasConfig = c.configuration !== undefined;

  const versionName = getVersionName(c);

  function openPicker(): void {
    setPickerOpen(true);
  }
  function closePicker(): void {
    setPickerOpen(false);
  }

  const pickerModal = pickerOpen ? (
    <ConfigurationPickerModal
      availableTemplates={c.availableTemplates}
      presentNativeTypes={c.presentNativeTypes}
      availableAppleCompatSettings={c.availableAppleCompatSettings}
      availableAppleSchemaProfiles={c.availableAppleSchemaProfiles}
      customSettingsAvailable={c.policy?.document.platform === "MACOS"}
      selectedType={c.selectedType}
      query={c.addQuery}
      group={c.addGroup}
      onSelectedTypeChange={c.setSelectedType}
      onQueryChange={c.setAddQuery}
      onGroupChange={c.setAddGroup}
      onAdd={() => {
        void c.addConfiguration();
        closePicker();
      }}
      onClose={closePicker}
    />
  ) : null;

  if (!hasConfig) {
    const name = typeof c.policy?.document.name === "string" ? c.policy.document.name : "";
    const description =
      typeof c.policy?.document.description === "string" ? c.policy.document.description : "";
    const platform =
      typeof c.policy?.document.platform === "string" ? c.policy.document.platform : "";
    return (
      <>
        <EditorBreadcrumb
          policy={c.policy}
          template={undefined}
          appleCompatSetting={undefined}
          appleSchemaProfile={undefined}
          hasConfiguration={false}
          versionName={versionName}
        />
        <div className="policy-version-context">
          <div className="pvc-identity">
            <div className="pvc-meta">
              <span className="pvc-platform">{platform}</span>
            </div>
            <input
              className="pvc-name"
              aria-label="Policy name"
              value={name}
              onChange={(e) => c.renameSelectedPolicy(e.target.value)}
            />
            <textarea
              className="pvc-description"
              aria-label="Policy description"
              placeholder="Add a description…"
              value={description}
              onChange={(e) => c.updateSelectedPolicyDescription(e.target.value)}
            />
          </div>
          <div className="pvc-actions">
            <button type="button" onClick={c.duplicateSelectedPolicy}>
              Duplicate
            </button>
            <button type="button" className="btn-danger" onClick={c.deleteSelectedPolicy}>
              Delete
            </button>
          </div>
        </div>
        <div className="panel-header">
          <div>
            <h1>Configurations</h1>
            <p>Add or import configurations for this policy version.</p>
          </div>
          <div className="configuration-tools">
            <button type="button" className="btn-add-configuration" onClick={openPicker}>
              + Add configuration
            </button>
          </div>
        </div>
        {pickerModal}
      </>
    );
  }

  return (
    <>
      <EditorBreadcrumb
        policy={c.policy}
        template={c.template}
        appleCompatSetting={c.appleCompatSetting}
        appleSchemaProfile={c.appleSchemaProfile}
        hasConfiguration={hasConfig}
        versionName={versionName}
      />
      <div className="panel-header">
        <div>
          <h1>
            {c.appleCompatSetting !== undefined
              ? `${c.appleCompatSetting.label} *`
              : c.appleSchemaProfile !== undefined
              ? `${c.appleSchemaProfile.title} *`
              : c.template?.label ?? "Configuration"}
          </h1>
          <p>
            {c.appleCompatSetting !== undefined
              ? `APPLE_MOBILECONFIG | ${c.appleCompatSetting.payloadType}`
              : c.appleSchemaProfile !== undefined
              ? `APPLE_MOBILECONFIG | ${c.appleSchemaProfile.identifier} | Apple schema ${c.state.appleSchema.source.revision}`
              : c.template === undefined
              ? "Select or add a configuration."
              : `${c.template.type} | ${c.template.schemaName} | ${c.template.multiConfig ? "multi" : "single"}`}
            {c.appleCompatSetting !== undefined ? (
              <InfoButton label={c.appleCompatSetting.label} description={APPLE_COMPAT_HINT} source="Relution APPLE_MOBILECONFIG" />
            ) : c.template?.description !== undefined ? (
              <InfoButton label={c.template.label} description={c.template.description} source={c.template.descriptionSource} />
            ) : null}
          </p>
        </div>
        <div className="configuration-tools">
          <button type="button" className="btn-add-configuration" onClick={openPicker}>
            + Add configuration
          </button>
          <JsonTemplateImportControl
            label="Apply JSON"
            ariaLabel="Selected setting JSON file"
            disabled={c.configuration === undefined}
            onFileChange={c.setJsonTemplateFile}
            onImport={() => void c.importJsonTemplates()}
          />
        </div>
      </div>
      {pickerModal}
      <div className="editor-content">
        <EditorFields controller={c} />
      </div>
    </>
  );
}

function EditorFields({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  if (c.configuration !== undefined && c.details !== undefined && c.appleCompatSetting !== undefined) {
    return (
      <AppleCompatFields
        setting={c.appleCompatSetting}
        details={c.details}
        onError={c.setStatus}
        onChange={(nextDetails) => c.updateSelectedConfiguration({ ...c.configuration, details: nextDetails })}
      />
    );
  }
  if (c.configuration !== undefined && c.details !== undefined && c.appleSchemaProfile !== undefined) {
    return (
      <AppleSchemaFields
        entry={c.appleSchemaProfile}
        details={c.details}
        onError={c.setStatus}
        onChange={(nextDetails) => c.updateSelectedConfiguration({ ...c.configuration, details: nextDetails })}
      />
    );
  }
  if (c.configuration !== undefined && c.details !== undefined && c.details.type === "APPLE_MOBILECONFIG") {
    return (
      <MobileConfigFields
        details={c.details}
        onError={c.setStatus}
        onChange={(nextDetails) => c.updateSelectedConfiguration({ ...c.configuration, details: nextDetails })}
      />
    );
  }
  if (c.configuration !== undefined && c.details !== undefined && c.template !== undefined) {
    return <GeneratedFields template={c.template} details={c.details} onChange={(nextDetails) => c.updateSelectedConfiguration({ ...c.configuration, details: nextDetails })} />;
  }
  return <div className="empty-state">No editable configuration selected.</div>;
}

function EditorWelcome(): JSX.Element {
  return (
    <article className="editor-welcome">
      <h1>Select a policy to start editing</h1>
      <p>
        Pick a policy version from the sidebar or create a new one to begin adding configurations.
      </p>
      <div className="welcome-grid">
        <section>
          <h2>Select or create a policy</h2>
          <p>Choose an existing version from the left sidebar, or click <strong>+</strong> to create a new platform policy.</p>
        </section>
        <section>
          <h2>Add configurations</h2>
          <p>Add Relution native settings, Apple mobileconfig payloads, Apple schema profiles, or macOS declarative management entries.</p>
        </section>
        <section>
          <h2>Apply baseline evidence</h2>
          <p>Import BSI/CIS recommendations, run compliance checks, or apply JSON templates to pre-fill values.</p>
        </section>
        <section>
          <h2>Build and export</h2>
          <p>Save your work, optionally set an encryption key, then Build → Download the <code>.rexp</code> archive.</p>
        </section>
      </div>
    </article>
  );
}

function getVersionName(c: EditorController): string | undefined {
  if (c.selection === undefined || c.policy === undefined) {
    return undefined;
  }
  const versions = Array.isArray(c.policy.document.versions) ? c.policy.document.versions : [];
  const version = asRecord(versions[c.selection.versionIndex]);
  if (typeof version?.name === "string" && version.name.length > 0) {
    return version.name;
  }
  return `Version ${c.selection.versionIndex + 1}`;
}

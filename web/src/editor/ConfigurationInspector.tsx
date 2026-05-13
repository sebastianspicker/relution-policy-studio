import { useRef, type JSX } from "react";
import { asRecord } from "./editor-utils.js";
import { IconCheck, IconCode, IconEye, IconLayers } from "./icons.js";
import { SidecarPanel } from "./SidecarPanel.js";
import type { EditorController, InspectorTab, JsonRecord, RulesetImportReport } from "./types.js";

const INSPECTOR_TABS = [
  { id: "validation", label: "Validation", Icon: IconCheck,  short: "Check" },
  { id: "preview",    label: "Preview",    Icon: IconEye,    short: "View"  },
  { id: "json",       label: "Raw JSON",   Icon: IconCode,   short: "JSON"  },
  { id: "sidecar",    label: "Sidecar",    Icon: IconLayers, short: "Data"  },
] as const satisfies readonly { readonly id: InspectorTab; readonly label: string; readonly Icon: (props: { size?: number }) => JSX.Element; readonly short: string }[];

export function ConfigurationInspector(props: { readonly controller: EditorController; readonly id?: string; readonly className?: string }): JSX.Element {
  const c = props.controller;
  const className = ["json-panel", props.className ?? ""].filter(Boolean).join(" ");
  const activePanelId = inspectorPanelId(c.inspectorTab);
  const tablistRef = useRef<HTMLElement>(null);

  function handleTabKeyDown(event: React.KeyboardEvent, currentId: InspectorTab): void {
    const ids = INSPECTOR_TABS.map((t) => t.id);
    const currentIndex = ids.indexOf(currentId);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % ids.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + ids.length) % ids.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = ids.length - 1;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      const nextId = ids[nextIndex]!;
      c.setInspectorTab(nextId);
      const btn = tablistRef.current?.querySelector<HTMLElement>(`#${inspectorTabId(nextId)}`);
      btn?.focus();
    }
  }

  return (
    <aside id={props.id} className={className}>
      <nav ref={tablistRef} className="inspector-sidebar" role="tablist" aria-label="Inspector panels" aria-orientation="vertical">
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            id={inspectorTabId(tab.id)}
            role="tab"
            tabIndex={c.inspectorTab === tab.id ? 0 : -1}
            aria-selected={c.inspectorTab === tab.id}
            aria-controls={inspectorPanelId(tab.id)}
            className={c.inspectorTab === tab.id ? "active" : ""}
            onClick={() => c.setInspectorTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
            title={tab.label}
            aria-label={tab.label}
          >
            <span className="inspector-tab-icon" aria-hidden="true"><tab.Icon size={18} /></span>
            <span className="inspector-tab-short" aria-hidden="true">{tab.short}</span>
          </button>
        ))}
      </nav>
      <div className="inspector-body">
        <section id={activePanelId} role="tabpanel" aria-labelledby={inspectorTabId(c.inspectorTab)} tabIndex={0}>
          {c.inspectorTab === "validation" ? <ValidationView controller={c} /> : null}
          {c.inspectorTab === "preview" ? <PreviewView controller={c} /> : null}
          {c.inspectorTab === "json" ? <RawJsonView controller={c} /> : null}
          {c.inspectorTab === "sidecar" ? <SidecarPanel controller={c} /> : null}
        </section>
      </div>
    </aside>
  );
}

function inspectorTabId(tab: InspectorTab): string {
  return `inspector-tab-${tab}`;
}

function inspectorPanelId(tab: InspectorTab): string {
  return `inspector-panel-${tab}`;
}

function ValidationView({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  return (
    <div className="inspector-content">
      <h2>Validation</h2>
      {c.state.validation.ok ? <p className="ok">Workspace valid</p> : null}
      {c.isDirty ? <p className="warning">Unsaved workspace changes are being validated locally and will be saved before build.</p> : null}
      {c.state.validation.errors.map((error) => (
        <p className="error" key={`${error.path}-${error.message}`}>
          <strong>{error.path}</strong>
          <span>{error.message}</span>
        </p>
      ))}
      {c.rulesetReport !== undefined ? <RulesetReportView report={c.rulesetReport} /> : null}
    </div>
  );
}

function RulesetReportView({ report }: { readonly report: RulesetImportReport }): JSX.Element {
  return (
    <section className="ruleset-report">
      <h3>Ruleset import</h3>
      <p className={report.conflicts.length === 0 && report.unresolved.length === 0 ? "ok" : "warning"}>
        Applied {report.applied.length}. Conflicts {report.conflicts.length}. Unresolved {report.unresolved.length}. Warnings {report.warnings.length}.
      </p>
      {report.conflicts.map((conflict) => <p className="error" key={conflict}>{conflict}</p>)}
      {report.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      {report.unresolved.map((rule) => (
        <details className="preview-block" key={`${rule.policyName}-${rule.ruleId}`}>
          <summary>{rule.policyName}: {rule.ruleId}</summary>
          <p>{rule.title}</p>
          {rule.suggestions.length > 0 ? <pre>{rule.suggestions.join("\n")}</pre> : null}
        </details>
      ))}
    </section>
  );
}

function PreviewView({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const payload = asRecord(asRecord(c.details?.payloadContent)?.payload);
  const rawContent = typeof c.details?.rawContent === "string" ? c.details.rawContent : undefined;
  return (
    <div className="inspector-content">
      <h2>Preview</h2>
      {c.configuration === undefined ? (
        <p className="sidecar-summary">Select a configuration to preview generated output.</p>
      ) : (
        <>
          <PreviewSummary details={c.details} />
          {payload !== undefined ? <PreviewBlock title="Apple payload" value={payload} /> : null}
          {rawContent !== undefined && rawContent.length > 0 ? (
            <details className="preview-block">
              <summary>Generated mobileconfig</summary>
              <pre>{rawContent}</pre>
            </details>
          ) : null}
          <PreviewBlock title="Configuration" value={c.configuration} />
        </>
      )}
    </div>
  );
}

function RawJsonView({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  return (
    <div className="inspector-content">
      <h2>Configuration JSON</h2>
      {c.rawJsonDirty ? <p className="warning">Raw JSON draft differs from the live configuration. Reset JSON to discard the draft.</p> : null}
      <textarea aria-label="Configuration raw JSON" value={c.rawJson} onChange={(event) => c.setRawJson(event.target.value)} />
      <div className="json-actions">
        <button type="button" disabled={!c.rawJsonDirty || c.configuration === undefined} onClick={c.resetRawJson}>
          Reset JSON
        </button>
        <button type="button" disabled={c.configuration === undefined} onClick={c.applyRawJson}>
          Apply JSON
        </button>
      </div>
    </div>
  );
}

function PreviewSummary(props: { readonly details: JsonRecord | undefined }): JSX.Element {
  return (
    <dl className="preview-summary">
      <div>
        <dt>Type</dt>
        <dd>{typeof props.details?.type === "string" ? props.details.type : "UNKNOWN"}</dd>
      </div>
      <div>
        <dt>Display</dt>
        <dd>{typeof props.details?.displayName === "string" ? props.details.displayName : "Configuration"}</dd>
      </div>
      <div>
        <dt>Payload</dt>
        <dd>{typeof props.details?.secondLevelPayloadType === "string" ? props.details.secondLevelPayloadType : "n/a"}</dd>
      </div>
    </dl>
  );
}

function PreviewBlock(props: { readonly title: string; readonly value: JsonRecord }): JSX.Element {
  return (
    <details className="preview-block" open={props.title === "Apple payload"}>
      <summary>{props.title}</summary>
      <pre>{JSON.stringify(props.value, null, 2)}</pre>
    </details>
  );
}

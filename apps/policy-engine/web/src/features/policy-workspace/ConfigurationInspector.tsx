/** Surfaces validation, preview, raw JSON, and artifacts for the selected configuration. */
import type { JSX } from "react";
import { ConfigurationInspectorPreview } from "./ConfigurationInspectorPreview.js";
import { ConfigurationInspectorRawJson } from "./ConfigurationInspectorRawJson.js";
import { ConfigurationInspectorTabs, inspectorPanelId, inspectorTabId } from "./ConfigurationInspectorTabs.js";
import { ConfigurationInspectorValidation } from "./ConfigurationInspectorValidation.js";
import { SidecarPanel } from "../../shared/SidecarPanel.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function ConfigurationInspector(props: { readonly controller: EditorController; readonly id?: string; readonly className?: string }): JSX.Element {
  const className = ["json-panel", props.className ?? ""].filter(Boolean).join(" ");
  return (
    <aside id={props.id} className={className}>
      <div className="inspector-heading">
        <h2 className="inspector-title">Assurance</h2>
        <span className="chip mono">local checks</span>
      </div>
      <div className="assurance-local-badge" role="status">
        <span className="assurance-local-pulse" aria-hidden="true" />
        LOCAL · not a live tenant
      </div>
      <ConfigurationInspectorTabs active={props.controller.inspectorTab} onChange={props.controller.setInspectorTab} />
      <div className="inspector-body">
        <section id={inspectorPanelId(props.controller.inspectorTab)} role="tabpanel" aria-labelledby={inspectorTabId(props.controller.inspectorTab)} tabIndex={0}>
          {props.controller.inspectorTab === "validation" ? <ConfigurationInspectorValidation controller={props.controller} /> : null}
          {props.controller.inspectorTab === "preview" ? <ConfigurationInspectorPreview controller={props.controller} /> : null}
          {props.controller.inspectorTab === "json" ? <ConfigurationInspectorRawJson controller={props.controller} /> : null}
          {props.controller.inspectorTab === "sidecar" ? <SidecarPanel controller={props.controller} /> : null}
        </section>
      </div>
      <p className="inspector-evidence-note">Local evidence / no tenant write</p>
    </aside>
  );
}

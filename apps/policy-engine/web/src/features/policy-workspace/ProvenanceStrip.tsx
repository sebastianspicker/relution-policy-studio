/** Instrument strip showing workspace scope, schema ring, and write authority. */
import type { JSX } from "react";
import { provenanceSchemaLabel } from "./provenance-stage.js";
import type { EditorController } from "../../shared/editor-contracts.js";

const isHostedDemo = import.meta.env.MODE === "demo";

export function ProvenanceStrip(props: {
  readonly controller: EditorController;
}): JSX.Element {
  const { controller } = props;
  const schema = provenanceSchemaLabel(controller.state.bundle?.serverVersion);

  return (
    <div className="provenance-strip" aria-label="Workspace provenance">
      <div className="provenance-item">
        <span className="provenance-dot" aria-hidden="true" />
        <span className="provenance-label">Scope</span>
        <span className="provenance-value">{isHostedDemo ? "Hosted demo" : "Local workspace"}</span>
      </div>
      <div className="provenance-item">
        <span className="provenance-label">Schema</span>
        <span className="provenance-value">{schema}</span>
      </div>
      <div className="provenance-item">
        <span className="provenance-label">Ring</span>
        <span className="provenance-value">{isHostedDemo ? "DEMO" : "LAB"}</span>
      </div>
      <div className="provenance-item">
        <span className="provenance-label">Tenant write</span>
        <span className="provenance-value">Disabled</span>
      </div>
    </div>
  );
}

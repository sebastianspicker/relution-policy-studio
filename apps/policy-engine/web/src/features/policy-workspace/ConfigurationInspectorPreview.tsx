/** Renders generated payload and configuration previews. */
import type { JSX } from "react";
import { asRecord } from "../../shared/editor-record-utils.js";
import type { EditorController, JsonRecord } from "../../shared/editor-contracts.js";

export function ConfigurationInspectorPreview({ controller }: { readonly controller: EditorController }): JSX.Element {
  const payload = asRecord(asRecord(controller.details?.payloadContent)?.payload);
  const rawContent = typeof controller.details?.rawContent === "string" ? controller.details.rawContent : undefined;
  return (
    <div className="inspector-content">
      <h2>Preview</h2>
      {controller.configuration === undefined ? (
        <p className="sidecar-summary">Select a configuration to preview generated output.</p>
      ) : (
        <>
          <PreviewSummary details={controller.details} />
          {payload === undefined ? null : <PreviewBlock title="Apple payload" value={payload} />}
          {rawContent !== undefined && rawContent.length > 0 ? (
            <details className="preview-block"><summary>Generated mobileconfig</summary><pre>{rawContent}</pre></details>
          ) : null}
          <PreviewBlock title="Configuration" value={controller.configuration} />
        </>
      )}
    </div>
  );
}

function PreviewSummary({ details }: { readonly details: JsonRecord | undefined }): JSX.Element {
  return (
    <dl className="preview-summary">
      <div><dt>Type</dt><dd>{typeof details?.type === "string" ? details.type : "UNKNOWN"}</dd></div>
      <div><dt>Display</dt><dd>{typeof details?.displayName === "string" ? details.displayName : "Configuration"}</dd></div>
      <div><dt>Payload</dt><dd>{typeof details?.secondLevelPayloadType === "string" ? details.secondLevelPayloadType : "n/a"}</dd></div>
    </dl>
  );
}

function PreviewBlock(props: { readonly title: string; readonly value: JsonRecord }): JSX.Element {
  return (
    <details className="preview-block" open={props.title === "Apple payload"}>
      <summary>{props.title}</summary><pre>{JSON.stringify(props.value, null, 2)}</pre>
    </details>
  );
}

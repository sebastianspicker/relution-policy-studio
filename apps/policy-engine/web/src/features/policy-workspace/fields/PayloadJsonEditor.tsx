/** Edits raw payload JSON with validation feedback before it reaches policy state. */
import { useEffect, useState, type JSX } from "react";
import { FieldFrame } from "../../../ui/FieldFrame.js";

export function PayloadJsonEditor(props: {
  draftKey: string;
  payloadJson: string;
  onApply: (payloadJson: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(props.payloadJson);

  useEffect(() => {
    setDraft(props.payloadJson);
  }, [props.draftKey]);

  function applyDraft(): void {
    try {
      const parsed = JSON.parse(draft.length === 0 ? "{}" : draft) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        props.onError("Payload JSON must be an object");
        return;
      }
      props.onApply(JSON.stringify(parsed, null, 2));
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <FieldFrame
      className="field field-wide payload-json-editor"
      label="Apple payload JSON"
      path="Payload body keys only"
      required
      footer={(
        <div className="payload-json-actions">
          <button type="button" onClick={applyDraft}>Apply payload JSON</button>
          <button type="button" onClick={() => setDraft(props.payloadJson)}>Reset</button>
        </div>
      )}
    >
      <textarea className="payload-json-textarea compact-code-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </FieldFrame>
  );
}

/** Displays mobileconfig warnings and edits its non-XML metadata fields. */
import type { JSX } from "react";
import { FieldFrame } from "../../../ui/FieldFrame.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";

export function MobileConfigMetadataFields(props: {
  readonly details: JsonRecord;
  readonly onChange: (details: JsonRecord) => void;
}): JSX.Element {
  const displayName = typeof props.details.displayName === "string" ? props.details.displayName : "";
  const payloadType = typeof props.details.secondLevelPayloadType === "string" ? props.details.secondLevelPayloadType : "";

  return (
    <>
      <FieldFrame label="Display name" path="displayName">
        <input value={displayName} onChange={(event) => props.onChange({ ...props.details, displayName: event.target.value })} />
      </FieldFrame>
      <FieldFrame label="Detected payload type" path="secondLevelPayloadType">
        <input readOnly value={payloadType} />
      </FieldFrame>
    </>
  );
}

export function MobileConfigMetadataWarnings({ details }: { readonly details: JsonRecord }): JSX.Element {
  const signatureState = typeof details.mobileConfigSignatureState === "string" ? details.mobileConfigSignatureState : "unknown";

  return (
    <>
      <p className="warning">
        Relution accepts this as APPLE_MOBILECONFIG on import and publish. Relution Server 26.1.1 does not include APPLE_MOBILECONFIG again when exporting policies as .rexp.
      </p>
      {signatureState !== "unsigned" && signatureState !== "unknown" ? (
        <p className="warning">Signature state: {signatureState}. Editing this content drops original signature fidelity unless it is re-signed outside the editor.</p>
      ) : null}
    </>
  );
}

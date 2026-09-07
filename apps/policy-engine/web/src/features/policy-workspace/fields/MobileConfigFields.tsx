/** Composes mobileconfig import, metadata, and XML payload editing fields. */
import type { JSX } from "react";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { MobileConfigFileImport } from "./MobileConfigFileImport.js";
import { MobileConfigMetadataFields, MobileConfigMetadataWarnings } from "./MobileConfigMetadataFields.js";
import { MobileConfigPayloadEditor } from "./MobileConfigPayloadEditor.js";

export function MobileConfigFields(props: {
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <div className="field-grid">
      <MobileConfigMetadataWarnings details={props.details} />
      <MobileConfigFileImport details={props.details} onChange={props.onChange} onError={props.onError} />
      <MobileConfigMetadataFields details={props.details} onChange={props.onChange} />
      <MobileConfigPayloadEditor details={props.details} onChange={props.onChange} onError={props.onError} />
    </div>
  );
}

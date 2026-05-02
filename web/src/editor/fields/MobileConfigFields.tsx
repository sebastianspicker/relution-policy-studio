import { useState, type JSX } from "react";
import { invalidateMobileConfigDetails, updateMobileConfigDetails } from "../mobileconfig-editor.js";
import type { JsonRecord } from "../types.js";
import { InfoButton } from "./InfoButton.js";

export function MobileConfigFields(props: {
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const [fileName, setFileName] = useState<string>();
  const displayName = typeof props.details.displayName === "string" ? props.details.displayName : "";
  const rawContent = typeof props.details.rawContent === "string" ? props.details.rawContent : "";
  const payloadType = typeof props.details.secondLevelPayloadType === "string" ? props.details.secondLevelPayloadType : "";
  const signatureState = typeof props.details.mobileConfigSignatureState === "string" ? props.details.mobileConfigSignatureState : "unknown";
  return (
    <div className="field-grid">
      <p className="warning">
        Relution accepts this as APPLE_MOBILECONFIG on import and publish. Relution Server 26.1.1 does not include APPLE_MOBILECONFIG again when exporting policies as .rexp.
      </p>
      {signatureState !== "unsigned" && signatureState !== "unknown" ? (
        <p className="warning">Signature state: {signatureState}. Editing this content drops original signature fidelity unless it is re-signed outside the editor.</p>
      ) : null}
      <div className="field">
        <div className="field-label-row">
          <span>
            <span className="field-label">Mobileconfig file</span>
            <code className="field-path">rawContent</code>
          </span>
          <InfoButton
            label="Mobileconfig file"
            description="Upload or paste a complete Apple configuration profile XML plist. The editor reads PayloadContent and PayloadType from the file."
            source="Relution APPLE_MOBILECONFIG"
          />
        </div>
        <label className="btn file-input-label" title={fileName ?? "Select .mobileconfig or XML file"}>
          {fileName ?? "Choose .mobileconfig…"}
          <input
            className="visually-hidden"
            type="file"
            accept=".mobileconfig,.xml,application/xml,text/xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                setFileName(file.name);
                void file.text().then((text) => {
                  try {
                    props.onChange(updateMobileConfigDetails(props.details, text));
                  } catch (error) {
                    props.onError(error instanceof Error ? error.message : String(error));
                    props.onChange(invalidateMobileConfigDetails(props.details, text));
                  }
                });
              }
            }}
          />
        </label>
      </div>
      <div className="field">
        <div className="field-label-row">
          <span>
            <span className="field-label">Display name</span>
            <code className="field-path">displayName</code>
          </span>
        </div>
        <input value={displayName} onChange={(event) => props.onChange({ ...props.details, displayName: event.target.value })} />
      </div>
      <div className="field">
        <div className="field-label-row">
          <span>
            <span className="field-label">Detected payload type</span>
            <code className="field-path">secondLevelPayloadType</code>
          </span>
        </div>
        <input readOnly value={payloadType} />
      </div>
      <div className="field field-wide">
        <div className="field-label-row">
          <span>
            <span className="field-label">Mobileconfig XML</span>
            <code className="field-path">rawContent</code>
          </span>
        </div>
        <textarea
          className="mobileconfig-textarea"
          value={rawContent}
          onChange={(event) => {
            const text = event.target.value;
            try {
              props.onChange(updateMobileConfigDetails(props.details, text));
            } catch (error) {
              props.onError(error instanceof Error ? error.message : String(error));
              props.onChange(invalidateMobileConfigDetails(props.details, text));
            }
          }}
        />
      </div>
    </div>
  );
}

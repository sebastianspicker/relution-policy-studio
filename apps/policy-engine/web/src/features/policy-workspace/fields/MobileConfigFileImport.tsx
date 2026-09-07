/** Imports mobileconfig source files after their contents are parsed successfully. */
import { useState, type ChangeEvent, type JSX } from "react";
import { updateMobileConfigDetails } from "../../../shared/mobileconfig-editor.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { InfoButton } from "./InfoButton.js";

export function MobileConfigFileImport(props: {
  readonly details: JsonRecord;
  readonly onChange: (details: JsonRecord) => void;
  readonly onError: (message: string) => void;
}): JSX.Element {
  const [fileName, setFileName] = useState<string>();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    void file.text().then((text) => {
      try {
        props.onChange(updateMobileConfigDetails(props.details, text));
        setFileName(file.name);
      } catch (error) {
        props.onError(error instanceof Error ? error.message : String(error));
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      props.onError(`Mobileconfig file read failed: ${message}`);
    });
  };

  return (
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
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
}

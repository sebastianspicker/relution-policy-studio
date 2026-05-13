import { useState, type JSX } from "react";

export function JsonTemplateImportControl(props: {
  readonly label: string;
  readonly ariaLabel: string;
  readonly disabled: boolean;
  readonly onFileChange: (file: File | undefined) => void;
  readonly onImport: () => void;
}): JSX.Element {
  const [fileName, setFileName] = useState<string>();
  return (
    <div className="template-import">
      <label className="btn file-input-label" title={fileName ?? `Select ${props.ariaLabel}`}>
        {fileName ?? "Choose file…"}
        <input
          type="file"
          accept=".json,application/json"
          aria-label={props.ariaLabel}
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            props.onFileChange(file);
            setFileName(file?.name);
          }}
        />
      </label>
      <button type="button" disabled={props.disabled} onClick={props.onImport}>
        {props.label}
      </button>
    </div>
  );
}

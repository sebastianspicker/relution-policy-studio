/** Updates mobileconfig XML and clears derived payload state when parsing fails. */
import type { ChangeEvent, JSX } from "react";
import { invalidateMobileConfigDetails, updateMobileConfigDetails } from "../../../shared/mobileconfig-editor.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { FieldFrame } from "../../../ui/FieldFrame.js";

export function MobileConfigPayloadEditor(props: {
  readonly details: JsonRecord;
  readonly onChange: (details: JsonRecord) => void;
  readonly onError: (message: string) => void;
}): JSX.Element {
  const rawContent = typeof props.details.rawContent === "string" ? props.details.rawContent : "";

  const handlePayloadChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const text = event.target.value;
    try {
      props.onChange(updateMobileConfigDetails(props.details, text));
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
      props.onChange(invalidateMobileConfigDetails(props.details, text));
    }
  };

  return (
    <FieldFrame className="field field-wide" label="Mobileconfig XML" path="rawContent" required>
      <textarea className="mobileconfig-textarea" value={rawContent} onChange={handlePayloadChange} />
    </FieldFrame>
  );
}

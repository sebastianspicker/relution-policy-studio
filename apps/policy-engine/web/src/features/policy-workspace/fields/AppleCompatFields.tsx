/** Renders Apple compatibility settings with their platform constraints and descriptions. */
import type { JSX } from "react";
import {
  extractAppleCompatPayloadBodyJson,
  updateAppleCompatDetailsFromPayloadBodyJson,
} from "../../../../../src/browser/apple.js";
import { updateAppleCompatDetails } from "../../../../../src/browser/apple.js";
import type { AppleCompatField, AppleCompatSetting } from "../../../../../src/browser/apple.js";
import { extractAppleCompatValues } from "../../../../../src/browser/apple.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { AppleCompatObjectListInput } from "./apple-compat-field-collections.js";
import { AppleCompatScalarFieldInput } from "./apple-compat-field-scalar.js";
import { InfoButton } from "./InfoButton.js";
import { PayloadJsonEditor } from "./PayloadJsonEditor.js";

type AppleCompatFieldsProps = {
  setting: AppleCompatSetting;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
};

type AppleCompatFieldInputProps = {
  field: AppleCompatField;
  value: unknown;
  onChange: (value: unknown) => void;
};

export function AppleCompatFields(props: AppleCompatFieldsProps): JSX.Element {
  const values = extractAppleCompatValues(props.details, props.setting);
  const payloadJson = extractAppleCompatPayloadBodyJson(props.details, props.setting);
  const settingFacts = [
    `Apple payload type: ${props.setting.payloadType}`,
    `Jamf feature: ${props.setting.jamfFeature}`,
    `Platforms: ${props.setting.platforms.join(", ")}`,
    `Sources: ${props.setting.sourceUrls.join(", ")}`,
  ];

  function reportError(error: unknown): void {
    props.onError(error instanceof Error ? error.message : String(error));
  }

  function applyPayloadJson(payloadBodyJson: string): void {
    try {
      props.onChange(updateAppleCompatDetailsFromPayloadBodyJson(props.details, props.setting.id, payloadBodyJson));
    } catch (error) {
      reportError(error);
    }
  }

  function changeField(field: AppleCompatField, value: unknown): void {
    try {
      const nextValues = { ...values };
      if (value === undefined) {
        delete nextValues[field.id];
      } else {
        nextValues[field.id] = value;
      }
      props.onChange(updateAppleCompatDetails(props.details, props.setting.id, nextValues));
    } catch (error) {
      reportError(error);
    }
  }

  return (
    <div className="field-grid">
      <p className="warning">
        {props.setting.label} is marked with * because Relution 26.1.1 exposes it through APPLE_MOBILECONFIG instead of a dedicated harvested GUI configuration.
        <InfoButton label={props.setting.label} description={props.setting.description} facts={settingFacts} />
      </p>
      <PayloadJsonEditor
        draftKey={typeof props.details.uuid === "string" ? props.details.uuid : props.setting.id}
        payloadJson={payloadJson}
        onError={props.onError}
        onApply={applyPayloadJson}
      />
      {props.setting.fields.filter((field) => field.id !== "payloadKeysJson").map((field) => (
        <AppleCompatFieldInput key={field.id} field={field} value={values[field.id]} onChange={(value) => changeField(field, value)} />
      ))}
    </div>
  );
}

function AppleCompatFieldInput(props: AppleCompatFieldInputProps): JSX.Element {
  if (props.field.kind === "object-list") {
    return <AppleCompatObjectListInput field={props.field} value={props.value} onChange={props.onChange} />;
  }
  return <AppleCompatScalarFieldInput field={props.field} value={props.value} onChange={props.onChange} />;
}

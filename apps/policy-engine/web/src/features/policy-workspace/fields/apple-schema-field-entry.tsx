import type { JSX } from "react";
import {
  updateAppleSchemaProfileDetailsFromPayloadBodyJson,
  type AppleSchemaEntry,
} from "../../../../../src/browser/apple.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { InfoButton } from "./InfoButton.js";
import { PayloadJsonEditor } from "./PayloadJsonEditor.js";

export function AppleSchemaEntryDetails(props: {
  entry: AppleSchemaEntry;
  details: JsonRecord;
  payloadJson: string;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  return (
    <>
      <AppleSchemaEntryNotice entry={props.entry} />
      <PayloadJsonEditor
        draftKey={typeof props.details.uuid === "string" ? props.details.uuid : props.entry.id}
        payloadJson={props.payloadJson}
        onError={props.onError}
        onApply={(payloadBodyJson) => applyPayloadBodyJson(props, payloadBodyJson)}
      />
    </>
  );
}

function AppleSchemaEntryNotice(props: { entry: AppleSchemaEntry }): JSX.Element {
  const { entry } = props;
  return (
    <>
      <p className="warning">
        Generated from Apple's pinned device-management schema. Saved through Relution APPLE_MOBILECONFIG; DDM is handled in the sidecar.
        <InfoButton
          label={entry.title}
          description={entry.description}
          facts={appleSchemaEntryFacts(entry)}
          source="Apple device-management schema"
        />
      </p>
      {entry.availability.deprecated ? <p className="warning">This Apple payload is deprecated in the pinned schema.</p> : null}
    </>
  );
}

function applyPayloadBodyJson(
  props: Pick<Parameters<typeof AppleSchemaEntryDetails>[0], "details" | "entry" | "onChange" | "onError">,
  payloadBodyJson: string,
): void {
  try {
    props.onChange(updateAppleSchemaProfileDetailsFromPayloadBodyJson(props.details, props.entry, payloadBodyJson));
  } catch (error) {
    props.onError(error instanceof Error ? error.message : String(error));
  }
}

function appleSchemaEntryFacts(entry: AppleSchemaEntry): string[] {
  return [
    `Identifier: ${entry.identifier}`,
    `Schema source: ${entry.sourcePath}`,
    `Platforms: ${entry.availability.platforms.join(", ")}`,
    `Allow multiple: ${String(entry.availability.allowMultiple)}`,
    `Requires MDM: ${String(entry.availability.requiresMdm)}`,
  ];
}

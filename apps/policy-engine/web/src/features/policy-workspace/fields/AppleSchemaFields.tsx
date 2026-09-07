/** Renders Apple schema profile controls from catalog metadata and current payload values. */
import type { JSX } from "react";
import {
  extractAppleSchemaPayloadBodyJson,
  extractAppleSchemaValues,
  type AppleSchemaEntry,
} from "../../../../../src/browser/apple.js";
import type { JsonRecord } from "../../../shared/editor-contracts.js";
import { AppleSchemaEntryDetails } from "./apple-schema-field-entry.js";
import { AppleSchemaFieldList } from "./apple-schema-field-list.js";

export function AppleSchemaFields(props: {
  entry: AppleSchemaEntry;
  details: JsonRecord;
  onChange: (details: JsonRecord) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const values = extractAppleSchemaValues(props.details, props.entry);
  const payloadJson = extractAppleSchemaPayloadBodyJson(props.details, props.entry);
  return (
    <div className="field-grid">
      <AppleSchemaEntryDetails
        entry={props.entry}
        details={props.details}
        payloadJson={payloadJson}
        onChange={props.onChange}
        onError={props.onError}
      />
      <AppleSchemaFieldList entry={props.entry} details={props.details} values={values} onChange={props.onChange} onError={props.onError} />
    </div>
  );
}

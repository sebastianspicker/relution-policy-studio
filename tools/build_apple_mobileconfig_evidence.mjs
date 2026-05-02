#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { APPLE_COMPAT_SETTINGS } from "../dist/src/apple-compat.js";

const OUTPUT_PATH = "example/vendor-references/downloads/derived/apple-mobileconfig-evidence.json";

const settings = APPLE_COMPAT_SETTINGS
  .filter((setting) => setting.status === "mobileconfig-backed" && setting.relutionTransportType === "APPLE_MOBILECONFIG")
  .map((setting) => ({
    id: setting.id,
    label: setting.label,
    payloadType: setting.payloadType,
    platforms: setting.platforms,
    status: setting.status,
    relutionTransportType: setting.relutionTransportType,
    builder: setting.builder,
    fields: flattenFields(setting.fields ?? []),
  }))
  .sort((left, right) => left.payloadType.localeCompare(right.payloadType) || left.id.localeCompare(right.id));

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify({
    version: 1,
    generatedFrom: "Relution Apple compatibility settings that export as APPLE_MOBILECONFIG payloads.",
    settings,
  }, null, 2)}\n`,
);

function flattenFields(fields, prefix = "") {
  const flattened = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.id}` : field.id;
    flattened.push({
      id: field.id,
      path,
      payloadKey: field.payloadKey,
      label: field.label,
      kind: field.kind,
      defaultValue: field.defaultValue,
      options: field.options,
    });
    if (Array.isArray(field.itemFields)) {
      flattened.push(...flattenFields(field.itemFields, path));
    }
  }
  return flattened;
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFields } from "./template-field-collection.js";
import { asMaybeObject, type ConfigurationTemplate, type RelutionTemplateBundle, type TemplateRefreshDiagnostics } from "../contracts/template.js";

export const DEFAULT_TEMPLATE_BUNDLE_PATH = "data/relution-26.1.1/template-bundle.json";
const BUNDLED_TEMPLATE_BUNDLE_PATH = fileURLToPath(new URL("../../../data/relution-26.1.1/template-bundle.json", import.meta.url));

export function loadTemplateBundle(bundlePath = DEFAULT_TEMPLATE_BUNDLE_PATH): RelutionTemplateBundle {
  const resolved = bundlePath === DEFAULT_TEMPLATE_BUNDLE_PATH ? BUNDLED_TEMPLATE_BUNDLE_PATH : resolve(bundlePath);
  if (!existsSync(resolved)) {
    throw new Error(`Template bundle not found: ${resolved}. Run rexp templates refresh first.`);
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (asMaybeObject(parsed) === undefined || !Array.isArray(asMaybeObject(parsed)?.configurationTypes)) {
    throw new Error(`Invalid template bundle: ${resolved}`);
  }
  return normalizeTemplateBundle(parsed as RelutionTemplateBundle);
}

export function listTemplates(bundle: RelutionTemplateBundle, platform?: string): ConfigurationTemplate[] {
  return platform === undefined ? bundle.configurationTypes : bundle.configurationTypes.filter((template) => template.platforms.includes(platform));
}

export function normalizeTemplateBundle(bundle: RelutionTemplateBundle): RelutionTemplateBundle {
  return { ...withRefreshDiagnostics(bundle), configurationTypes: bundle.configurationTypes.map(withFieldsFromSchema(bundle)) };
}

function withRefreshDiagnostics(bundle: RelutionTemplateBundle): RelutionTemplateBundle {
  const refreshDiagnostics: TemplateRefreshDiagnostics = bundle.refreshDiagnostics ?? {
    runtimeMetadata: { source: "reflected", reflectedCount: bundle.configurationTypes.length, configurationTypeCount: bundle.configurationTypes.length },
    iosSystemAppsLoaded: hasValue(bundle.iosSystemApps),
    springConfigurationMetadataLoaded: hasValue(bundle.springConfigurationMetadata),
  };
  return { ...bundle, refreshDiagnostics };
}

function withFieldsFromSchema(bundle: RelutionTemplateBundle): (template: ConfigurationTemplate) => ConfigurationTemplate {
  return (template) => {
    const schema = bundle.schemas[template.schemaName];
    return schema === undefined ? template : { ...template, fields: collectFields(schema, bundle.schemas) };
  };
}

function hasValue(value: unknown): boolean {
  const object = asMaybeObject(value);
  return value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0) && (object === undefined || Object.keys(object).length > 0);
}

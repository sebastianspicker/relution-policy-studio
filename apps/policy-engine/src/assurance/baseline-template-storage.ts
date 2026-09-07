/** Resolves bundled baseline template artifacts and their catalog entries. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_TEMPLATE_PLATFORMS,
  BASELINE_TEMPLATE_SHAPES,
  BASELINE_TEMPLATE_TIERS,
  type BaselineTemplateOptionsResponse,
  type BaselineTemplateSelection,
  type TemplateIndex,
} from "./baseline-template-model.js";
import { findBaselineTemplateEntry, safeBaselineTemplatePath } from "./baseline-template-catalog.js";
import { compareBaselineTemplateOptions, optionFromBaselineTemplateEntry } from "./baseline-template-option-builders.js";
import { parseTemplateIndex } from "./baseline-template-validation.js";
import { readJsonCatalog } from "../platform/serialization/json-catalog.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TEMPLATE_ROOT = resolve(PACKAGE_ROOT, "example/relution-baseline-templates");
const INDEX_PATH = resolve(TEMPLATE_ROOT, "index.json");

export function listBaselineTemplateOptions(): BaselineTemplateOptionsResponse {
  const index = loadTemplateIndex();
  return {
    version: index.version,
    format: index.format,
    platforms: [...BASELINE_TEMPLATE_PLATFORMS],
    shapes: [...BASELINE_TEMPLATE_SHAPES],
    tiers: [...BASELINE_TEMPLATE_TIERS],
    options: [
      ...index.tieredModularBundleTemplates.map((entry) => optionFromBaselineTemplateEntry(entry, "modules")),
      ...index.tieredConsolidatedTemplates.map((entry) => optionFromBaselineTemplateEntry(entry, "full")),
    ].sort(compareBaselineTemplateOptions),
  };
}

export function loadBaselineTemplate(selection: BaselineTemplateSelection): unknown {
  const entry = findBaselineTemplateEntry(loadTemplateIndex(), selection);
  return readJsonCatalog<unknown>(safeBaselineTemplatePath(PACKAGE_ROOT, TEMPLATE_ROOT, entry.path), "Baseline template");
}

function loadTemplateIndex(): TemplateIndex {
  return parseTemplateIndex(readJsonCatalog<unknown>(INDEX_PATH, "Baseline template index"));
}

/** Resolves safe catalog paths and requested baseline entries. */
import { existsSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { BaselineTemplateSelection, TemplateIndex, TemplateIndexEntry } from "./baseline-template-model.js";

export function safeBaselineTemplatePath(packageRoot: string, templateRoot: string, indexPath: string): string {
  const file = resolve(packageRoot, indexPath);
  if (!existsSync(file)) throw new Error(`Baseline template file does not exist: ${indexPath}`);
  const realRoot = realpathSync(templateRoot);
  const realFile = realpathSync(file);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${sep}`)) {
    throw new Error(`Baseline template path escapes template root: ${indexPath}`);
  }
  return file;
}

export function findBaselineTemplateEntry(index: TemplateIndex, selection: BaselineTemplateSelection): TemplateIndexEntry {
  const entries = selection.shape === "modules" ? index.tieredModularBundleTemplates : index.tieredConsolidatedTemplates;
  const entry = entries.find((candidate) => candidate.platform === selection.platform && candidate.tier === selection.tier);
  if (entry === undefined) {
    throw new Error(`Baseline template is not available: ${selection.platform} tier ${String(selection.tier)} ${selection.shape}`);
  }
  return entry;
}

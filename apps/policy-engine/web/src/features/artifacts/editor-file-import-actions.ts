/** Composes archive and setting-file import actions without snapshotting editor state. */
import type { ImportBuildActionInput } from "../../shared/editor-import-build-contract.js";
import { importArchive } from "./editor-archive-import-action.js";
import { importJsonTemplates } from "./editor-setting-json-import-action.js";

export function createFileImportActions(input: ImportBuildActionInput): {
  readonly importArchive: () => Promise<void>;
  readonly importJsonTemplates: () => Promise<void>;
} {
  return {
    importArchive: () => importArchive(input),
    importJsonTemplates: () => importJsonTemplates(input),
  };
}

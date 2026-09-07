/** Adapts authenticated archive bytes into the editor's durable workspace-and-sidecar boundary. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importArchive, type ArchiveImportInput } from "../application/editor-archive-compliance.js";
import { extractRexp } from "../archive/rexp-extraction.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { loadEditorWorkspaceState, replaceEditorWorkspaceFromArchive } from "../workspace-state/editor-port.js";
import type { EditorSidecarState } from "../workspace-state/sidecar-types.js";

export interface EditorArchiveImportOptions extends ArchiveImportInput {
  readonly workspaceDir: string;
  readonly appleSchemaRevision: string;
  readonly bundle: RelutionTemplateBundle;
  /** CLI force imports recover and validate their destination under the composite lock. */
  readonly force?: boolean;
}

/** Extracts privately, validates before publication, then replaces the full durable editor state. */
export function importEditorArchive(options: EditorArchiveImportOptions): {
  readonly workspace: ReturnType<typeof loadEditorWorkspaceState>["workspace"];
  readonly validation: ReturnType<typeof importArchive<EditorSidecarState>>["validation"];
  readonly sidecar: EditorSidecarState;
  readonly revision: string;
  readonly key: string;
} {
  return importArchive(options, {
    bundle: options.bundle,
    extractWorkspace: (input) => extractArchiveWorkspace(input),
    replaceImportedWorkspace: (workspace, expectedRevision) => replaceEditorWorkspaceFromArchive({
      workspaceDir: options.workspaceDir,
      appleSchemaRevision: options.appleSchemaRevision,
    }, workspace, {
      force: options.force === true,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
  });
}

function extractArchiveWorkspace(input: ArchiveImportInput): ReturnType<typeof loadEditorWorkspaceState>["workspace"] {
  const importDir = mkdtempSync(join(tmpdir(), "rexp-studio-import-"));
  try {
    const archive = join(importDir, "import.rexp");
    writeFileSync(archive, input.archive, { mode: 0o600 });
    const extractedWorkspace = join(importDir, "workspace");
    extractRexp(archive, extractedWorkspace, input.key, { force: true, pretty: true });
    return loadEditorWorkspaceState({ workspaceDir: extractedWorkspace, appleSchemaRevision: "" }).workspace;
  } finally {
    rmSync(importDir, { recursive: true, force: true });
  }
}

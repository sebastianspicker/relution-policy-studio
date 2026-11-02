/** Adapts authenticated archive bytes into the editor's durable workspace-and-sidecar boundary. */
import { importArchive, type ArchiveImportInput } from "../application/editor-archive-compliance.js";
import { readRexpArchive } from "../archive/rexp-archive-reader.js";
import { parseJson } from "../archive/rexp-crypto.js";
import { decryptRexpProject } from "../archive/rexp-extraction.js";
import { MAX_REXP_POLICY_ENTRIES, METADATA_JSON, REPORT_JSON } from "../archive/rexp-format.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { requireRecord } from "../platform/serialization/json-guards.js";
import { isPolicyPath } from "../workspace/policy-path.js";
import { assertWorkspaceIntegrity } from "../workspace/workspace-integrity.js";
import { assertPersistableWorkspaceShape } from "../workspace/workspace-storage-shape.js";
import type { PolicyWorkspace } from "../workspace/types.js";
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

/** Decrypts in memory, so plaintext policies never reach the disk before validation and publication. */
function extractArchiveWorkspace(input: ArchiveImportInput): PolicyWorkspace {
  const archive = Buffer.from(input.archive.buffer, input.archive.byteOffset, input.archive.byteLength);
  const files = decryptRexpProject(readRexpArchive(archive), input.key);
  const document = (name: string) => requireRecord(parseJson(files.get(name)!, name), name);
  const workspace: PolicyWorkspace = {
    metadata: document(METADATA_JSON),
    report: document(REPORT_JSON),
    policies: [...files.keys()].filter(isPolicyPath).sort().map((path) => ({ path, document: document(path) })),
  };
  // Same shape and integrity checks a workspace read from disk gets, before validation runs on it.
  assertPersistableWorkspaceShape(workspace, MAX_REXP_POLICY_ENTRIES);
  assertWorkspaceIntegrity(workspace);
  return workspace;
}

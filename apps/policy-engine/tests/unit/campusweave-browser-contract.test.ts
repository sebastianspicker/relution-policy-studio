/** Verifies the unified host can bootstrap a platform-neutral browser workspace. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  CampusWeaveEvidence,
  CampusWeaveMapping,
  CampusWeavePlannerCommand,
  CampusWeaveProfile,
  CampusWeaveProject,
  CampusWeaveReview,
  CampusWeaveReviewMapping,
  CampusWeaveWorkspaceRef,
} from "../../src/browser/campusweave.js";
import { initializeEmptyEditorWorkspace } from "../../src/editor/editor-workspace-initialization.js";
import { loadEditorWorkspaceState } from "../../src/workspace-state/editor-port.js";
import { packPlainWorkspace } from "../../src/archive/rexp-packing.js";
import { verifyRexp } from "../../src/archive/rexp-inspection.js";
import { createTestWorkspace } from "../support/workspace.js";

test("empty unified host workspaces contain no invented platform policy", () => {
  const root = mkdtempSync(join(tmpdir(), "campusweave-empty-workspace-"));
  const workspace = join(root, "workspace");
  try {
    initializeEmptyEditorWorkspace(workspace, "test-server");
    const state = loadEditorWorkspaceState({ workspaceDir: workspace, appleSchemaRevision: "test" });
    assert.deepEqual(state.workspace.policies, []);
    assert.deepEqual(state.workspace.report.policiesToExport, []);
    const compileOnly: Pick<CampusWeaveProject, "schema_version"> = { schema_version: 1 };
    assert.equal(compileOnly.schema_version, 1);
    const browserSurface = null as unknown as {
      evidence: CampusWeaveEvidence;
      mapping: CampusWeaveMapping;
      command: CampusWeavePlannerCommand;
      profile: CampusWeaveProfile;
      review: CampusWeaveReview;
      mappingReview: CampusWeaveReviewMapping;
      workspace: CampusWeaveWorkspaceRef;
    } | null;
    assert.equal(browserSurface, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the existing in-memory workspace pack API still emits a verified archive", () => {
  const fixture = createTestWorkspace("Snapshot pack compatibility");
  const output = join(fixture.root, "snapshot.rexp");
  try {
    const state = loadEditorWorkspaceState({ workspaceDir: fixture.workspace, appleSchemaRevision: "test" });
    packPlainWorkspace(state.workspace, output, fixture.key);
    assert.equal(verifyRexp(output, fixture.key).ok, true);
  } finally {
    fixture.cleanup();
  }
});

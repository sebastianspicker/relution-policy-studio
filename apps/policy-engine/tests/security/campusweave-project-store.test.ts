/** Exercises private project persistence, recovery receipts, and writer exclusion. */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CampusWeaveInputError, CampusWeaveRevisionConflictError, CampusWeaveStoreBusyError } from "../../src/contracts/campusweave-errors.js";
import { initializeEmptyEditorWorkspace } from "../../src/editor/editor-workspace-initialization.js";
import { openCampusWeaveProjectStore } from "../../src/workspace-state/campusweave-project-store.js";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

test("project revisions preserve server-owned workspace references and operation receipts", () => {
  const fixture = projectStoreFixture();
  try {
    const store = openCampusWeaveProjectStore(fixture.root);
    const created = store.create("Revision contract");
    const workspace = { id: "workspace-one", name: "One", platform: "IOS", created_at: new Date(0).toISOString() };
    const pending = store.beginWorkspace(created.id, workspace, created.revision);
    assert.equal(pending.project.operations.length, 1);
    assert.equal(pending.project.workspace_refs.length, 0);
    assert.throws(() => store.completeWorkspace(created.id, pending.operation.id, pending.project.revision), /workspace/iu);
    initializeEmptyEditorWorkspace(store.workspacePath(workspace.id), "test-server");
    const attached = store.completeWorkspace(created.id, pending.operation.id, pending.project.revision);
    assert.equal(attached.workspace_refs[0]?.id, workspace.id);
    assert.equal(attached.operations[0]?.status, "committed");

    const forged = structuredClone(attached);
    forged.workspace_refs = [{ id: "forged-workspace", name: "Forged", platform: "IOS", created_at: new Date(0).toISOString() }];
    forged.operations = [{ id: "forged-operation" }];
    const saved = store.save(forged, attached.revision);
    assert.deepEqual(saved.workspace_refs, attached.workspace_refs);
    assert.deepEqual(saved.operations, attached.operations);
    assert.throws(() => store.save(saved, attached.revision), CampusWeaveRevisionConflictError);
    store.close();
  } finally {
    fixture.cleanup();
  }
});

test("artifact ledgers and interrupted operation receipts survive restart", () => {
  const fixture = projectStoreFixture();
  try {
    let store = openCampusWeaveProjectStore(fixture.root);
    const project = store.create("Recovery contract");
    const workspace = { id: "workspace-recovery", name: "Recovery", platform: "IOS", created_at: new Date(0).toISOString() };
    const pending = store.beginWorkspace(project.id, workspace, project.revision);
    writeFileSync(join(fixture.root, "projects", ".interrupted.tmp"), "partial", { mode: 0o600 });
    store.recordArtifact({ workspaceId: workspace.id, policyRevision: DIGEST_A, artifactDigest: DIGEST_B, catalogDigest: DIGEST_C, builtAt: new Date(0).toISOString() });
    store.close();

    store = openCampusWeaveProjectStore(fixture.root);
    assert.equal(store.get(project.id).operations[0]?.status, "pending");
    assert.equal(store.get(project.id).revision, pending.project.revision);
    assert.equal(store.artifact(workspace.id)?.artifactDigest, DIGEST_B);
    assert.equal(store.list().length, 1);
    store.close();
  } finally {
    fixture.cleanup();
  }
});

test("writer locks fail closed and private roots are not silently chmodded", () => {
  const fixture = projectStoreFixture();
  try {
    const first = openCampusWeaveProjectStore(fixture.root);
    assert.throws(() => openCampusWeaveProjectStore(fixture.root), CampusWeaveStoreBusyError);
    first.close();
    writeFileSync(join(fixture.root, ".writer.lock"), `${JSON.stringify({ pid: 999_999_999, token: "stale" })}\n`, { mode: 0o600 });
    assert.throws(() => openCampusWeaveProjectStore(fixture.root), CampusWeaveStoreBusyError);
    unlinkSync(join(fixture.root, ".writer.lock"));
    chmodSync(fixture.root, 0o755);
    assert.throws(() => openCampusWeaveProjectStore(fixture.root), CampusWeaveInputError);
  } finally {
    fixture.cleanup();
  }
});

test("assurance bindings and review decisions survive reopening while legacy records remain readable", () => {
  const fixture = projectStoreFixture();
  try {
    let store = openCampusWeaveProjectStore(fixture.root);
    const legacy = store.create("Assurance persistence");
    assert.equal(store.get(legacy.id).assurance_reviews, undefined);
    const evidence = {
      intent_id: "intent", workspace_id: "workspace-one", requirement_id: "local-check", kind: "local" as const,
      profile_digest: DIGEST_A, policy_revision: DIGEST_B, artifact_digest: DIGEST_C, catalog_digest: DIGEST_A,
    };
    const reviews = [{ selection: { kind: "preset", presetId: "managed" }, conflicts: [], exclusions: [{ reason: "External evidence required" }] }];
    const saved = store.save({ ...legacy, evidence: [evidence, { ...evidence, assurance_digest: DIGEST_B }], assurance_reviews: reviews }, legacy.revision);
    assert.throws(() => store.save({ ...saved, evidence: [{ ...evidence, assurance_digest: "invalid" }] }, saved.revision), /assurance_digest/u);
    store.recordArtifact({ workspaceId: "workspace-one", policyRevision: DIGEST_A, artifactDigest: DIGEST_B, catalogDigest: DIGEST_C, assuranceDigest: DIGEST_B, builtAt: new Date(0).toISOString() });
    store.close();
    store = openCampusWeaveProjectStore(fixture.root);
    assert.deepEqual(store.get(saved.id), saved);
    assert.deepEqual(store.get(saved.id).assurance_reviews, reviews);
    assert.equal(store.get(saved.id).evidence[0]?.assurance_digest, undefined);
    assert.equal(store.get(saved.id).evidence[1]?.assurance_digest, DIGEST_B);
    assert.equal(store.artifact("workspace-one")?.assuranceDigest, DIGEST_B);
    store.close();
  } finally { fixture.cleanup(); }
});

function projectStoreFixture(): { readonly root: string; readonly cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "campusweave-project-store-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

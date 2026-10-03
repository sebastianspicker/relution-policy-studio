/**
 * Pins the on-disk CampusWeave store format. tests/fixtures/campusweave-store was written by
 * openCampusWeaveProjectStore (create, beginWorkspace, completeWorkspace, save, recordArtifact);
 * the "legacy" project predates assurance_reviews and assurance_digest.
 */
import assert from "node:assert/strict";
import { chmodSync, cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openCampusWeaveProjectStore } from "../../src/workspace-state/campusweave-project-store.js";
import { ENGINE_ROOT, tempRoot } from "../support/contracts.js";

const GOLDEN = join(ENGINE_ROOT, "tests/fixtures/campusweave-store");
const CURRENT_ID = "65cb1d3d-6276-48ec-9849-bfa17b17db21";
const LEGACY_ID = "417849ce-340a-4e4a-b917-1be351590ec5";

function copyGolden(): { readonly root: string; readonly cleanup: () => void } {
  const copy = tempRoot("campusweave-golden-");
  for (const directory of ["projects", "artifacts"]) {
    cpSync(join(GOLDEN, directory), join(copy.root, directory), { recursive: true });
    chmodSync(join(copy.root, directory), 0o700);
    for (const file of readdirSync(join(copy.root, directory))) chmodSync(join(copy.root, directory, file), 0o600);
  }
  chmodSync(copy.root, 0o700);
  return copy;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

test("the store reads golden projects back unchanged without rewriting them", () => {
  const copy = copyGolden();
  try {
    const store = openCampusWeaveProjectStore(copy.root);
    for (const id of [CURRENT_ID, LEGACY_ID]) {
      assert.deepEqual(store.get(id), readJson(join(GOLDEN, "projects", `${id}.json`)));
      assert.equal(readFileSync(join(copy.root, "projects", `${id}.json`), "utf8"), readFileSync(join(GOLDEN, "projects", `${id}.json`), "utf8"));
      assert.equal(`${JSON.stringify(store.get(id), null, 2)}\n`, readFileSync(join(GOLDEN, "projects", `${id}.json`), "utf8"));
    }
    assert.deepEqual(store.list(), [
      { id: LEGACY_ID, name: "Golden legacy project", revision: 2, workspace_count: 0 },
      { id: CURRENT_ID, name: "Golden current project", revision: 4, workspace_count: 1 },
    ]);
    store.close();
  } finally {
    copy.cleanup();
  }
});

test("legacy records without assurance data stay readable and absent fields stay absent", () => {
  const copy = copyGolden();
  try {
    const store = openCampusWeaveProjectStore(copy.root);
    const legacy = store.get(LEGACY_ID);
    assert.equal(Object.hasOwn(legacy, "assurance_reviews"), false);
    assert.equal(Object.hasOwn(legacy.evidence[0] ?? {}, "assurance_digest"), false);
    const current = store.get(CURRENT_ID);
    assert.equal(current.assurance_reviews?.length, 1);
    assert.equal(current.evidence[0]?.assurance_digest, undefined);
    assert.equal(current.evidence[1]?.assurance_digest, "d".repeat(64));
    assert.equal(current.workspace_refs[0]?.id, "workspace-golden");
    assert.equal(current.operations[0]?.status, "committed");
    assert.equal(current.mappings[0]?.reviewed, true);
    store.close();
  } finally {
    copy.cleanup();
  }
});

test("artifact records read back with and without an assurance digest", () => {
  const copy = copyGolden();
  try {
    const store = openCampusWeaveProjectStore(copy.root);
    assert.deepEqual(store.artifact("workspace-golden"), readJson(join(GOLDEN, "artifacts/workspace-golden.json")));
    assert.deepEqual(store.artifact("workspace-legacy"), readJson(join(GOLDEN, "artifacts/workspace-legacy.json")));
    assert.equal(store.artifact("workspace-legacy")?.assuranceDigest, undefined);
    assert.equal(store.artifact("workspace-missing"), undefined);
    store.close();
  } finally {
    copy.cleanup();
  }
});

test("saving a golden project advances only its revision and keeps the persisted shape", () => {
  const copy = copyGolden();
  try {
    const store = openCampusWeaveProjectStore(copy.root);
    const before = store.get(LEGACY_ID);
    const saved = store.save(before, before.revision);
    assert.deepEqual({ ...saved, revision: before.revision }, before);
    assert.equal(saved.revision, before.revision + 1);
    assert.deepEqual(readJson(join(copy.root, "projects", `${LEGACY_ID}.json`)), saved);
    store.close();
  } finally {
    copy.cleanup();
  }
});

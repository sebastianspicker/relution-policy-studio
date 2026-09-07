/** Leaf updates must not mutate history or clone unrelated configuration values. */
import assert from "node:assert/strict";
import test from "node:test";
import { updatePath } from "../../web/src/shared/editor-object-path.js";
import { deletePathAndPrune } from "../../web/src/features/policy-workspace/fields/generated-fields-tree.js";

test("leaf set and clear retain siblings, list identities and immutable history", () => {
  const sibling = { enabled: true };
  const rows = [{ name: "one" }];
  const original = { nested: { leaf: 1, sibling }, rows };
  const updated = updatePath(original, "nested.leaf", 2);
  assert.deepEqual(original.nested, { leaf: 1, sibling });
  assert.notEqual(updated.nested, original.nested);
  assert.equal((updated.nested as typeof original.nested).sibling, sibling);
  assert.equal(updated.rows, rows);
  const cleared = updatePath(updated, "nested.leaf", undefined, true);
  assert.deepEqual(cleared.nested, { sibling });
  assert.equal(cleared.rows, rows);
  assert.deepEqual(updatePath({ nested: { leaf: 1 }, sibling }, "nested.leaf", undefined, true), { sibling });
});

test("clear matches existing prune semantics and rejects unsafe paths", () => {
  for (const path of ["a.b.c", "missing.value", "a.missing", "a.b", "empty.missing", "__proto__.x"]) {
    const source = { a: { b: { c: 1 } }, empty: {}, keep: [1, 2] };
    const expected = structuredClone(source);
    deletePathAndPrune(expected, path);
    assert.deepEqual(updatePath(source, path, undefined, true), expected);
  }
  assert.throws(() => updatePath({}, "constructor.prototype.bad", true), /Unsafe/);
  assert.deepEqual(updatePath({ value: 1 }, "value", null), { value: null });
});

test("configuration replacement copies workspace ancestors and retains unrelated policies and configurations", async () => {
  const { createConfigurationEditingActions } = await import("../../web/src/features/policy-workspace/editor-configuration-edit-actions.js");
  const unchangedConfiguration = { details: { enabled: true } };
  const changedConfiguration = { details: { length: 8 } };
  const originalConfiguration = { details: { length: 4 } };
  const otherPolicy = { path: "other.json", document: { versions: [] } };
  const workspace = { policies: [{ path: "selected.json", document: { versions: [{ configurations: [originalConfiguration, unchangedConfiguration] }] } }, otherPolicy] };
  let published: typeof workspace | undefined;
  const input = {
    selection: { policyIndex: 0, versionIndex: 0, configurationIndex: 0 },
    currentState: { workspace },
    markWorkspaceDirty: (next: typeof workspace) => { published = next; return true; },
  } as unknown as Parameters<typeof createConfigurationEditingActions>[0];
  assert.equal(createConfigurationEditingActions(input).updateSelectedConfiguration(changedConfiguration), true);
  assert.ok(published);
  assert.equal(published.policies[1], otherPolicy);
  const selected = published.policies[0]!.document.versions[0]!;
  assert.equal(selected.configurations[0], changedConfiguration);
  assert.equal(selected.configurations[1], unchangedConfiguration);
  assert.equal(workspace.policies[0]!.document.versions[0]!.configurations[0], originalConfiguration);
});

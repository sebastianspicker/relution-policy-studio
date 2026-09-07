/** Validates persisted workspace content using the live template bundle. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { loadPersistedWorkspace as loadWorkspace } from "../../src/workspace/storage.js";
import { validateWorkspace } from "../../src/workspace/workspace-validation.js";
import { createTestWorkspace } from "../support/workspace.js";

test("workspace validation accepts a created policy and reports an invalid platform without persistence", () => {
  const fixture = createTestWorkspace("Validation contract");
  try {
    const workspace = loadWorkspace(fixture.workspace);
    assert.equal(validateWorkspace(workspace, loadTemplateBundle()).ok, true);

    workspace.policies[0]!.document.platform = "NOT_A_RELUTION_PLATFORM";
    const validation = validateWorkspace(workspace, loadTemplateBundle());
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.message.includes("Policy platform is invalid")));
    assert.equal(loadWorkspace(fixture.workspace).policies[0]!.document.platform, "IOS");
  } finally {
    fixture.cleanup();
  }
});

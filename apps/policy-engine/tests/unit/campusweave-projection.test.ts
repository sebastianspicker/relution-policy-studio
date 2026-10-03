/** Prevents reviewed mappings from bypassing the existing configuration schema. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import type { CampusWeaveMapping } from "../../src/contracts/campusweave.js";
import { applyCampusWeaveMapping } from "../../src/editor/campusweave/projection.js";
import { addConfigurationToLoadedWorkspace } from "../../src/workspace/workspace-configuration-actions.js";
import { createNewWorkspaceInMemory } from "../../src/workspace/workspace-creation.js";

test("projection rejects undeclared fields and invalid post-image values", () => {
  const bundle = loadTemplateBundle();
  const workspace = createNewWorkspaceInMemory({
    workspace: "/unused/unit-workspace",
    platform: "IOS",
    name: "Projection schema",
    serverVersion: bundle.serverVersion,
  });
  addConfigurationToLoadedWorkspace(workspace, bundle, {
    policyPath: workspace.policies[0]!.path,
    versionIndex: 0,
    type: "IOS_PASSCODE",
  });
  const document = workspace.policies[0]!.document as unknown as {
    versions: Array<{ configurations: Array<{ uuid: string }> }>;
  };
  const version = document.versions[0]!;
  const mapping: CampusWeaveMapping = {
    id: "mapping-schema",
    intent_id: "intent.schema",
    workspace_id: "workspace-schema",
    policy_id: workspace.policies[0]!.path,
    configuration_id: version.configurations[0]!.uuid,
    field: "undeclaredField",
    value: true,
    platform: "IOS",
    configuration_type: "IOS_PASSCODE",
    applicability: "all",
    reviewed: true,
    profile_digest: "a".repeat(64),
    policy_revision: "b".repeat(64),
  };
  assert.throws(() => applyCampusWeaveMapping(structuredClone(workspace), mapping, bundle), /not declared/u);
  assert.throws(() => applyCampusWeaveMapping(structuredClone(workspace), {
    ...mapping,
    field: "maxFailedAttempts",
    value: 99,
  }, bundle), /Projected workspace is invalid/u);
});

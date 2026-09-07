/** Creates disposable, schema-backed workspaces for observable Node contracts. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { createNewWorkspace } from "../../src/workspace/workspace-creation.js";

export interface TestWorkspace {
  readonly root: string;
  readonly workspace: string;
  readonly archive: string;
  readonly key: string;
  cleanup(): void;
}

export function createTestWorkspace(name = "Contract policy"): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), "rexp-contract-"));
  const workspace = join(root, "workspace");
  createNewWorkspace({ workspace, platform: "IOS", name, serverVersion: loadTemplateBundle().serverVersion });
  return {
    root,
    workspace,
    archive: join(root, "policy.rexp"),
    key: "correct-horse-battery-staple",
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

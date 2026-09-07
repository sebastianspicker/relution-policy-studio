/** Ensures editor archive publication requires verification of the exact staged bytes. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { buildVerifiedEditorArchive } from "../../src/editor/editor-build-publish.js";
import type { PolicyWorkspace } from "../../src/workspace/types.js";

test("corrupt staged archive bytes cannot replace the prior published archive", () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-editor-archive-publication-"));
  const output = join(root, "policy.rexp");
  const previous = Buffer.from("previous verified archive", "utf8");
  writeFileSync(output, previous, { mode: 0o600 });
  try {
    assert.throws(() => buildVerifiedEditorArchive({
      workspace: {} as PolicyWorkspace,
      output,
      key: "test-passphrase",
      pack: (_workspace, stagedFile) => writeFileSync(stagedFile, "corrupt staged bytes", { mode: 0o600 }),
    }));
    assert.deepEqual(readFileSync(output), previous);
    assert.deepEqual(readdirSync(root), [basename(output)]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

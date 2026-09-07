/** Exercises the supported archive facade against real workspace files. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { extractRexp } from "../../src/archive/rexp-extraction.js";
import { verifyRexp } from "../../src/archive/rexp-inspection.js";
import { packPlainDirectory } from "../../src/archive/rexp-packing.js";
import { readZip } from "../../src/archive/zip.js";
import { loadPersistedWorkspace as loadWorkspace } from "../../src/workspace/storage.js";
import { createTestWorkspace } from "../support/workspace.js";

test("the archive capability round-trips encrypted policy content without packing editor state", () => {
  const fixture = createTestWorkspace("Facade round trip");
  try {
    writeFileSync(join(fixture.workspace, "editor-sidecar.json"), '{"version":1}\n');
    packPlainDirectory(fixture.workspace, fixture.archive, fixture.key);
    assert.equal(verifyRexp(fixture.archive, fixture.key).ok, true);
    assert.deepEqual(readZip(readFileSync(fixture.archive)).map((entry) => entry.name).sort(), [
      "metadata.bin", "metadata.json", `policies/policy_${String(loadWorkspace(fixture.workspace).policies[0]!.document.uuid)}.json`, "report.json",
    ].sort());

    const extracted = join(fixture.root, "extracted");
    extractRexp(fixture.archive, extracted, fixture.key);
    assert.equal(existsSync(join(extracted, "editor-sidecar.json")), false, "sidecars must remain local editor state");
    assert.equal(loadWorkspace(extracted).policies[0]!.document.name, "Facade round trip");
  } finally {
    fixture.cleanup();
  }
});

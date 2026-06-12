import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRelutionAuditReport } from "../src/audit.js";
import { loadTemplateBundle } from "../src/templates.js";
import { readZip, writeZip } from "../src/zip.js";
import { fixture, password } from "./rexp-helpers.js";

test("sample export audit skips validation when archive verification fails", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-sample-audit-failed-verify-"));
  const tampered = join(root, "tampered.rexp");
  const tamperedEntries = readZip(readFileSync(fixture)).map((entry) => ({
    name: entry.name,
    data: entry.name === "metadata.json" ? Buffer.from('{"tampered":true}\n', "utf8") : entry.data,
  }));
  writeFileSync(tampered, writeZip(tamperedEntries));

  const report = createRelutionAuditReport({ bundle: loadTemplateBundle(), key: password, sampleRexp: tampered });

  assert.equal(report.sampleExport?.verifyOk, false);
  assert.equal(report.sampleExport?.validationOk, false);
  assert.deepEqual(report.sampleExport?.validationErrors, []);
});

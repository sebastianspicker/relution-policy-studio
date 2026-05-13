import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAppleCompatReport, renderAppleCompatReportMarkdown } from "../src/apple-compat-report.js";
import { createRelutionAuditReport } from "../src/audit.js";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { fixture, password } from "./rexp-helpers.js";

function assertCountNearLabel(text: string, labelPattern: string, count: number): void {
  const value = String(count);
  assert.match(text, new RegExp(`${value}[^\\n]*(${labelPattern})|(${labelPattern})[^\\n]*${value}`, "i"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("committed Apple compatibility artifacts match generated output", () => {
  const bundle = loadTemplateBundle();
  const report = createAppleCompatReport(bundle);
  const committedJson = JSON.parse(readFileSync("data/apple-compat/relution-jamf-gap.json", "utf8")) as unknown;
  const committedMarkdown = readFileSync("docs/JAMF_RELUTION_APPLE_GAP.md", "utf8");

  assert.deepEqual(committedJson, report);
  assert.equal(committedMarkdown, renderAppleCompatReportMarkdown(report));
});

test("README factual counts match the bundled data", () => {
  const readme = readFileSync("README.md", "utf8");
  const bundle = loadTemplateBundle();
  const catalog = loadAppleSchemaCatalog();
  const report = createAppleCompatReport(bundle);
  const audit = createRelutionAuditReport({ bundle, key: password, sampleRexp: fixture });

  assertCountNearLabel(readme, "configuration (?:detail )?templates|configuration types", bundle.configurationTypes.length);
  assertCountNearLabel(readme, "schemas", Object.keys(bundle.schemas).length);
  assertCountNearLabel(readme, "mobileconfig-backed gap settings", report.summary.mobileconfigBacked);
  assertCountNearLabel(readme, "Apple schema entries", catalog.entries.length);
  assertCountNearLabel(readme, "OpenAPI schemas", audit.summary.schemaCount);
});

test("committed audit report matches the generated stable summary", () => {
  const bundle = loadTemplateBundle();
  const report = createRelutionAuditReport({ bundle, key: password, sampleRexp: fixture });
  const committed = JSON.parse(readFileSync("data/relution-26.1.1/audit-report.json", "utf8")) as Record<string, unknown>;

  assert.deepEqual(committed.summary, report.summary);
  assert.deepEqual(committed.sourceInventory, report.sourceInventory);
});

test("README, compose defaults, and template bundle agree on the pinned Relution version", () => {
  const readme = readFileSync("README.md", "utf8");
  const compose = readFileSync("docker-compose.relution-e2e.yml", "utf8");
  const bundle = loadTemplateBundle();
  const version = escapeRegExp(bundle.serverVersion);

  assert.match(compose, new RegExp(`RELUTION_DOCKER_IMAGE:-relution/relution:${version}`));
  assert.match(readme, new RegExp(`Relution Server \`${version}\``));
  assert.match(readme, new RegExp(`RELUTION_DOCKER_IMAGE=relution/relution:${version}`));
  assert.match(readme, new RegExp(`--server-version ${version}`));
  assert.match(readme, new RegExp(`data/relution-${version}/template-bundle\\.json`));
  assert.match(readme, new RegExp(`data/relution-${version}/audit-report\\.json`));
});

test("README explains RELUTION_DOCKER_MEMORY as the value passed through to RELUTION_MEMORY", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /RELUTION_DOCKER_MEMORY[\s\S]*passes through to the container's `RELUTION_MEMORY`/u);
});

test("README documents Apple schema release snapshot refresh semantics", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /vendored Apple `device-management` release snapshot/u);
  assert.match(readme, /--revision <commit-or-tag>/u);
});

test("package exposes a post-build CLI runner", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

  assert.equal(packageJson.scripts?.["rexp:built"], "node dist/src/cli.js");
});

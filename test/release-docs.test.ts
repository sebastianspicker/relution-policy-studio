import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAppleCompatReport, renderAppleCompatReportMarkdown } from "../src/apple-compat-report.js";
import { createRelutionAuditReport } from "../src/audit.js";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { fixture, password } from "./rexp-helpers.js";

function assertCountNearLabel(text: string, labels: string[], count: number): void {
  const value = String(count);
  const matchingLine = text.split("\n").find((line) => {
    const lowerLine = line.toLowerCase();
    return line.includes(value) && labels.some((label) => lowerLine.includes(label.toLowerCase()));
  });
  assert.notEqual(matchingLine, undefined, `Expected ${value} near one of: ${labels.join(", ")}`);
}

test("assertCountNearLabel accepts a count on the same line as its label", () => {
  assert.doesNotThrow(() => assertCountNearLabel("Policies: 5", ["Policies"], 5));
});

test("assertCountNearLabel rejects off-by-one counts", () => {
  assert.throws(() => assertCountNearLabel("Policies: 5", ["Policies"], 6));
});

test("assertCountNearLabel does not match counts split onto another line", () => {
  assert.throws(() => assertCountNearLabel("Policies:\n5", ["Policies"], 5));
});

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

  assertCountNearLabel(readme, ["configuration templates", "configuration detail templates", "configuration types"], bundle.configurationTypes.length);
  assertCountNearLabel(readme, ["schemas"], Object.keys(bundle.schemas).length);
  assertCountNearLabel(readme, ["mobileconfig-backed gap settings"], report.summary.mobileconfigBacked);
  assertCountNearLabel(readme, ["Apple schema entries"], catalog.entries.length);
  assertCountNearLabel(readme, ["OpenAPI schemas"], audit.summary.schemaCount);
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
  const version = bundle.serverVersion;

  assert.equal(compose.includes(`RELUTION_DOCKER_IMAGE:-relution/relution:${version}`), true);
  assert.equal(readme.includes(`Relution Server \`${version}\``), true);
  assert.equal(readme.includes(`RELUTION_DOCKER_IMAGE=relution/relution:${version}`), true);
  assert.equal(readme.includes(`--server-version ${version}`), true);
  assert.equal(readme.includes(`data/relution-${version}/template-bundle.json`), true);
  assert.equal(readme.includes(`data/relution-${version}/audit-report.json`), true);
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

test("post-build CLI runner executes the built help command", () => {
  const output = execFileSync("pnpm", ["rexp:built", "help"], { encoding: "utf8" });

  assert.match(output, /Usage:/u);
  assert.match(output, /rexp inspect <file\.rexp>/u);
  assert.match(output, /RELUTION_BASE_URL/u);
  assert.match(output, /RELUTION_ACCESS_TOKEN/u);
});

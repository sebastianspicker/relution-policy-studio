import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRelutionAuditReport } from "../src/audit.js";
import { inspectImageDigest, refreshTemplates, resolveTemplateRefreshEntryTarget } from "../src/template-refresh.js";
import { createTemplateBundle } from "../src/templates.js";
import { writeZip } from "../src/zip.js";

test("records template bundle provenance when runtime metadata falls back to heuristics", () => {
  const bundle = createTemplateBundle({
    openApi: minimalRelutionOpenApi(),
    iosSystemApps: {},
    springConfigurationMetadata: {},
    runtimeMetadata: [],
    serverVersion: "test",
    sourceImage: "local-test",
    sourceImageDigest: "sha256:test",
  });
  const audit = createRelutionAuditReport({ bundle, key: "key123" });

  assert.deepEqual(bundle.refreshDiagnostics.runtimeMetadata, {
    source: "heuristic",
    reflectedCount: 0,
    configurationTypeCount: 0,
  });
  assert.equal(audit.sourceInventory.runtimeMetadataConfigurationTypes, 0);
  assert.equal(audit.sourceInventory.runtimeMetadataSource, "heuristic");
});

test("template refresh fails by default when runtime metadata cannot be reflected", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-strict-"));
  const jarPath = join(root, "relution-exec.jar");
  const out = join(root, "template-bundle.json");
  writeMinimalRelutionJar(jarPath);

  assert.throws(
    () => refreshTemplates({ jar: jarPath, out, serverVersion: "test" }),
    /runtime metadata reflection failed/i,
  );
  assert.equal(existsSync(out), false);
});

test("template refresh reports a clear error when the JAR is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-missing-"));
  const jarPath = join(root, "missing-relution-exec.jar");
  const out = join(root, "template-bundle.json");

  assert.throws(
    () => refreshTemplates({ jar: jarPath, out, serverVersion: "test" }),
    /no such file|cannot find|missing-relution-exec\.jar/i,
  );
  assert.equal(existsSync(out), false, "missing JAR must not create an output bundle");
});

test("template refresh heuristic fallback requires explicit opt-in", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-heuristic-"));
  const jarPath = join(root, "relution-exec.jar");
  const out = join(root, "template-bundle.json");
  writeMinimalRelutionJar(jarPath);

  refreshTemplates({ jar: jarPath, out, serverVersion: "test", allowHeuristicRuntimeMetadata: true });

  const bundle = JSON.parse(readFileSync(out, "utf8")) as { refreshDiagnostics?: { runtimeMetadata?: { source?: string } } };
  assert.equal(bundle.refreshDiagnostics?.runtimeMetadata?.source, "heuristic");
  assert.equal("sourceImageDigest" in bundle, false);
});

test("inspectImageDigest reports Docker inspect failures without a sentinel digest", () => {
  const originalPath = process.env.PATH;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  process.env.PATH = "";
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    assert.equal(inspectImageDigest("relution/missing:test"), undefined);
    assert.match(warnings.join("\n"), /Could not inspect image digest/u);
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    console.warn = originalWarn;
  }
});

test("templates refresh CLI warns before success output when build provenance is degraded", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-cli-warning-"));
  const jarPath = join(root, "relution-exec.jar");
  const out = join(root, "template-bundle.json");
  writeMinimalRelutionJar(jarPath);

  const result = spawnSync(process.execPath, [
    "dist/src/cli.js",
    "templates",
    "refresh",
    "--jar",
    jarPath,
    "--out",
    out,
    "--server-version",
    "test",
    "--allow-heuristic-runtime-metadata",
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stderr, /runtime metadata built from heuristic fallback/u);
  assert.match(result.stderr, /image digest unknown/u);
  assert.match(result.stdout, /Wrote /u);
  assert.equal(result.stdout.includes("runtime metadata built"), false, "stderr should not appear in stdout");
});

test("template refresh rejects class extraction entries outside the work directory", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-entry-"));
  const classesDir = join(root, "classes");

  assert.equal(resolveTemplateRefreshEntryTarget(classesDir, "com/example/Config.class"), join(classesDir, "com/example/Config.class"));
  assert.throws(() => resolveTemplateRefreshEntryTarget(classesDir, "../../escape.class"), /escapes extraction root/u);
});

test("template bundle generation tolerates recursive allOf references", () => {
  const bundle = createTemplateBundle({
    openApi: {
      components: {
        schemas: {
          Platform: { type: "string", enum: ["UNKNOWN", "IOS"] },
          EnrollmentType: { type: "string", enum: [] },
          ConfigurationDetails: {
            discriminator: {
              mapping: {
                IOS_RECURSIVE: "#/components/schemas/IosRecursiveDetails",
              },
            },
          },
          IosRecursiveDetails: {
            allOf: [
              { $ref: "#/components/schemas/IosRecursiveDetails" },
              {
                type: "object",
                properties: {
                  type: { type: "string" },
                },
              },
            ],
          },
        },
      },
    },
    iosSystemApps: {},
    springConfigurationMetadata: {},
    runtimeMetadata: [],
    serverVersion: "test",
    sourceImage: "local-test",
    sourceImageDigest: "sha256:test",
  });

  assert.equal(bundle.configurationTypes[0]?.type, "IOS_RECURSIVE");
});

function writeMinimalRelutionJar(path: string): void {
  writeFileSync(
    path,
    writeZip([
      {
        name: "BOOT-INF/classes/openapi.json",
        data: Buffer.from(JSON.stringify(minimalRelutionOpenApi())),
      },
    ]),
  );
}

function minimalRelutionOpenApi(): Record<string, unknown> {
  return {
    components: {
      schemas: {
        Platform: { type: "string", enum: ["UNKNOWN", "IOS"] },
        EnrollmentType: { type: "string", enum: [] },
        ConfigurationDetails: {
          discriminator: {
            mapping: {
              IOS_TEST: "#/components/schemas/IosTestDetails",
            },
          },
        },
        IosTestDetails: {
          type: "object",
          properties: {
            type: { type: "string" },
            enabled: { type: "boolean" },
          },
        },
      },
    },
  };
}

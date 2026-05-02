import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRelutionAuditReport } from "../src/audit.js";
import { refreshTemplates } from "../src/template-refresh.js";
import { createTemplateBundle } from "../src/templates.js";
import { writeZip } from "../src/zip.js";

test("records template bundle provenance when runtime metadata falls back to heuristics", () => {
  const bundle = createTemplateBundle({
    openApi: {
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
    },
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

test("template refresh heuristic fallback requires explicit opt-in", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-template-refresh-heuristic-"));
  const jarPath = join(root, "relution-exec.jar");
  const out = join(root, "template-bundle.json");
  writeMinimalRelutionJar(jarPath);

  refreshTemplates({ jar: jarPath, out, serverVersion: "test", allowHeuristicRuntimeMetadata: true });

  const bundle = JSON.parse(readFileSync(out, "utf8")) as { refreshDiagnostics?: { runtimeMetadata?: { source?: string } } };
  assert.equal(bundle.refreshDiagnostics?.runtimeMetadata?.source, "heuristic");
});

function writeMinimalRelutionJar(path: string): void {
  writeFileSync(
    path,
    writeZip([
      {
        name: "BOOT-INF/classes/openapi.json",
        data: Buffer.from(JSON.stringify({
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
        })),
      },
    ]),
  );
}

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_APPLE_SCHEMA_CATALOG_PATH,
  DEFAULT_APPLE_SCHEMA_REVISION,
  loadAppleSchemaCatalog,
  refreshAppleSchemaCatalog,
} from "../src/apple-schema-catalog.js";

test("default Apple schema refresh writes to a version-neutral path", () => {
  assert.equal(DEFAULT_APPLE_SCHEMA_REVISION, "release");
  assert.equal(/apple-device-management-\d/u.test(DEFAULT_APPLE_SCHEMA_CATALOG_PATH), false);
});

test("refreshAppleSchemaCatalog assigns unique ids to colliding Apple identifiers and skips TopLevel", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-apple-catalog-refresh-"));
  const profilesDir = join(root, "mdm", "profiles");
  mkdirSync(profilesDir, { recursive: true });
  writeFileSync(
    join(profilesDir, "TopLevel.yaml"),
    [
      "title: Top Level",
      "payload:",
      "  payloadtype: TopLevel",
      "  supportedOS:",
      "    iOS:",
      "      introduced: '1.0'",
      "payloadkeys: []",
      "",
    ].join("\n"),
  );
  for (const name of ["ManagedClientA.yaml", "ManagedClientB.yaml"]) {
    writeFileSync(
      join(profilesDir, name),
      [
        `title: ${name}`,
        "payload:",
        "  payloadtype: com.apple.MCX",
        "  supportedOS:",
        "    macOS:",
        "      introduced: '1.0'",
        "payloadkeys: []",
        "",
      ].join("\n"),
    );
  }

  const out = join(root, "catalog.json");
  const catalog = await refreshAppleSchemaCatalog({ source: root, revision: "test-fixture", out });
  const ids = catalog.entries.map((entry) => entry.id);

  assert.equal(ids.some((id) => id.includes("TopLevel")), false);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(catalog.entries.filter((entry) => entry.identifier === "com.apple.MCX").length, 2);
});

test("refreshAppleSchemaCatalog preserves structured arrays as json fields", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-apple-array-refresh-"));
  const profilesDir = join(root, "mdm", "profiles");
  mkdirSync(profilesDir, { recursive: true });
  writeFileSync(
    join(profilesDir, "Structured.yaml"),
    [
      "title: Structured Array Payload",
      "payload:",
      "  payloadtype: com.example.structured",
      "  supportedOS:",
      "    iOS:",
      "      introduced: '1.0'",
      "payloadkeys:",
      "- key: Subject",
      "  type: <array>",
      "  subkeys:",
      "  - key: SubjectItem",
      "    type: <array>",
      "    subkeys:",
      "    - key: SubjectPair",
      "      type: <string>",
      "- key: Geofences",
      "  type: <array>",
      "  subkeys:",
      "  - key: GeofenceItem",
      "    type: <dictionary>",
      "    subkeys:",
      "    - key: Latitude",
      "      type: <real>",
      "",
    ].join("\n"),
  );

  const catalog = await refreshAppleSchemaCatalog({ source: root, revision: "test-fixture", out: join(root, "catalog.json") });
  const entry = catalog.entries.find((candidate) => candidate.identifier === "com.example.structured");
  assert.notEqual(entry, undefined);
  assert.equal(entry?.fields.find((field) => field.path === "Subject")?.kind, "json");
  assert.equal(entry?.fields.find((field) => field.path === "Geofences")?.kind, "json");
});

test("loadAppleSchemaCatalog exposes a pinned catalog with unique ids and without TopLevel profiles", () => {
  const catalog = loadAppleSchemaCatalog();
  const ids = catalog.entries.map((entry) => entry.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(catalog.entries.some((entry) => entry.identifier === "TopLevel"), false);
});

test("refreshAppleSchemaCatalog rejects floating release output in a version-labeled path", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-apple-floating-release-"));
  const profilesDir = join(root, "mdm", "profiles");
  mkdirSync(profilesDir, { recursive: true });
  writeFileSync(
    join(profilesDir, "Example.yaml"),
    [
      "title: Example",
      "payload:",
      "  payloadtype: com.example.payload",
      "  supportedOS:",
      "    iOS:",
      "      introduced: '1.0'",
      "payloadkeys: []",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    refreshAppleSchemaCatalog({
      source: root,
      revision: "release",
      out: join(root, "data", "apple-device-management-26.4", "catalog.json"),
    }),
    /floating release.*version-labeled path/i,
  );
});

test("refreshAppleSchemaCatalog allows versioned revisions in version-labeled output paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-apple-versioned-release-"));
  const profilesDir = join(root, "mdm", "profiles");
  mkdirSync(profilesDir, { recursive: true });
  writeFileSync(
    join(profilesDir, "Example.yaml"),
    [
      "title: Example",
      "payload:",
      "  payloadtype: com.example.payload",
      "  supportedOS:",
      "    iOS:",
      "      introduced: '1.0'",
      "payloadkeys: []",
      "",
    ].join("\n"),
  );

  const out = join(root, "data", "apple-device-management-26.4", "catalog.json");
  const catalog = await refreshAppleSchemaCatalog({ source: root, revision: "26.4", out });

  assert.equal(catalog.source.revision, "26.4");
  assert.equal(JSON.parse(readFileSync(out, "utf8")).source.revision, "26.4");
});

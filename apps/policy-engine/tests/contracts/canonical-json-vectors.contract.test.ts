/** Pins the engine canonical JSON digests to the Python planner golden vectors and the assurance snapshot index. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assuranceCanonicalDigest } from "../../src/assurance/assurance-json.js";
import { canonicalJsonSha256 } from "../../src/platform/serialization/canonical-json.js";
import { ENGINE_ROOT, readContractJson } from "../support/contracts.js";

interface Vector {
  readonly name: string;
  readonly input?: unknown;
  readonly input_file?: string;
  readonly canonical: string;
  readonly sha256: string;
}

const vectors = readContractJson<{ vectors: Vector[] }>("fixtures/canonical-json-vectors.json").vectors;

for (const vector of vectors) {
  test(`canonicalJsonSha256 matches the Python golden vector ${vector.name}`, () => {
    const input = vector.input_file === undefined ? vector.input : readContractJson(`fixtures/${vector.input_file}`);
    assert.equal(canonicalJsonSha256(input), vector.sha256);
  });
}

test("assuranceCanonicalDigest hashes the golden canonical text without its trailing newline", () => {
  for (const vector of vectors) {
    const input = vector.input_file === undefined ? vector.input : readContractJson(`fixtures/${vector.input_file}`);
    const unterminated = vector.canonical.slice(0, -1);
    assert.equal(assuranceCanonicalDigest(input), createHash("sha256").update(unterminated).digest("hex"), vector.name);
  }
});

interface SnapshotEntry {
  readonly snapshotDigest: string;
  readonly catalogDigest: string;
  readonly detailsDigest: string;
  readonly catalogPath: string;
  readonly presetsPath: string;
  readonly detailsPath: string;
}

test("assuranceCanonicalDigest reproduces every digest recorded in the assurance snapshot index", () => {
  const read = (path: string): unknown => JSON.parse(readFileSync(join(ENGINE_ROOT, path), "utf8"));
  const index = read("example/recommendation-coverage/assurance-snapshots/index.json") as { entries: SnapshotEntry[] };
  assert.ok(index.entries.length >= 2);
  for (const entry of index.entries) {
    const catalog = read(entry.catalogPath);
    assert.equal(assuranceCanonicalDigest(read(entry.detailsPath)), entry.detailsDigest);
    assert.equal(assuranceCanonicalDigest(catalog), entry.catalogDigest);
    assert.equal(assuranceCanonicalDigest({ catalog, presets: read(entry.presetsPath) }), entry.snapshotDigest);
  }
});

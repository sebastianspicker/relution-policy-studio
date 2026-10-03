/** Validates what the running profile, project store and stdio bridge produce against contracts/schemas. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { CampusWeaveInputError } from "../../src/contracts/campusweave-errors.js";
import type { CampusWeaveProfile } from "../../src/contracts/campusweave.js";
import { campusWeaveProfileDigest, parseCampusWeaveProfile } from "../../src/contracts/campusweave-validation.js";
import { initializeEmptyEditorWorkspace } from "../../src/editor/editor-workspace-initialization.js";
import { openCampusWeaveProjectStore } from "../../src/workspace-state/campusweave-project-store.js";
import { readContractJson, REPO_ROOT, tempRoot } from "../support/contracts.js";

const ajv = new Ajv2020({ strict: true, allErrors: true });
for (const name of ["profile-v2", "mapping", "project", "planner-bridge"]) ajv.addSchema(readContractJson<object>(`schemas/${name}.schema.json`));
const validator = (id: string) => {
  const validate = ajv.getSchema(id);
  assert.ok(validate, `schema ${id} must compile in strict mode`);
  return validate;
};
const profileSchema = validator("campusweave-profile-v2");
const projectSchema = validator("https://campusweave.local/schemas/project.schema.json");
const mappingSchema = validator("https://campusweave.local/schemas/mapping.schema.json");
const bridgeSchema = validator("campusweave-planner-bridge-v1");

const blank = readContractJson<CampusWeaveProfile>("fixtures/planner-v2-blank.json");
const custom = readContractJson<CampusWeaveProfile>("fixtures/planner-v2-custom.json");
const D = (character: string): string => character.repeat(64);

function accepts(validate: ReturnType<typeof validator>, value: unknown): void {
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}
function rejects(validate: ReturnType<typeof validator>, value: unknown): void {
  assert.equal(validate(value), false);
}
const edit = (mutate: (profile: Record<string, any>) => void): unknown => {
  const copy = structuredClone(custom) as Record<string, any>;
  mutate(copy);
  return copy;
};

test("the contract profile fixtures satisfy profile-v2.schema.json and the engine profile parser", () => {
  for (const profile of [blank, custom]) {
    accepts(profileSchema, profile);
    assert.deepEqual(parseCampusWeaveProfile(profile), profile);
  }
});

test("profile-v2.schema.json rejects what the planner rejects structurally", () => {
  rejects(profileSchema, edit((p) => { p.extra = 1; }));
  rejects(profileSchema, edit((p) => { p.organizations[0].extra = 1; }));
  rejects(profileSchema, edit((p) => { delete p.name; }));
  rejects(profileSchema, edit((p) => { p.id = " padded"; }));
  rejects(profileSchema, edit((p) => { p.organizations[0].requirements = [" padded"]; }));
  rejects(profileSchema, edit((p) => { p.organizations[0].requirements = ["a", "a"]; }));
  rejects(profileSchema, edit((p) => { p.intents[0].layer = 8; }));
  rejects(profileSchema, edit((p) => { p.rollout_stages[0].order = -1; }));
  rejects(profileSchema, edit((p) => { p.token = "x"; }));
});

test("profile-v2.schema.json accepts omitted nullable fields, as the planner does", () => {
  accepts(profileSchema, edit((p) => {
    delete p.organizations[0].parent_id;
    delete p.organizations[0].description;
    delete p.intents[0].layer;
    delete p.intents[0].role;
    delete p.assignments[0].rollout_stage_id;
  }));
});

test("the engine rejects every reserved profile key the schema lists, at any depth and in any case", () => {
  const reserved = readContractJson<{ $defs: { reservedKey: { enum: string[] } } }>("schemas/profile-v2.schema.json").$defs.reservedKey.enum;
  assert.equal(reserved.length, 15);
  for (const key of reserved) {
    for (const variant of [key, key.toUpperCase()]) {
      assert.throws(() => parseCampusWeaveProfile({ ...blank, [variant]: "x" }), CampusWeaveInputError, variant);
      assert.throws(() => parseCampusWeaveProfile({ ...blank, intents: [{ nested: [{ [variant]: 1 }] }] }), CampusWeaveInputError, variant);
    }
  }
  assert.doesNotThrow(() => parseCampusWeaveProfile({ ...blank, tokens: "x", hosts: "y" }));
});

test("projects written by the real store satisfy project.schema.json and mapping.schema.json", () => {
  const fixture = tempRoot("campusweave-schema-store-");
  try {
    const store = openCampusWeaveProjectStore(fixture.root);
    const empty = store.create("Schema empty");
    accepts(projectSchema, empty);
    accepts(projectSchema, JSON.parse(readFileSync(join(fixture.root, "projects", `${empty.id}.json`), "utf8")));

    const project = store.create("Schema full", custom);
    const workspace = { id: "workspace-schema", name: "Schema workspace", platform: "IOS", created_at: new Date(0).toISOString() };
    const pending = store.beginWorkspace(project.id, workspace, project.revision);
    accepts(projectSchema, pending.project);
    initializeEmptyEditorWorkspace(store.workspacePath(workspace.id), "schema-test");
    const attached = store.completeWorkspace(project.id, pending.operation.id, pending.project.revision);
    const profileDigest = campusWeaveProfileDigest(custom);
    const mapping = {
      id: "mapping-one", intent_id: "intent.baseline", workspace_id: workspace.id, policy_id: "policy", configuration_id: "configuration",
      field: "/passcode", value: { minimum: 8 }, platform: "IOS", configuration_type: "passcode", applicability: "all", reviewed: false,
      profile_digest: profileDigest, policy_revision: D("a"),
    };
    accepts(mappingSchema, mapping);
    accepts(mappingSchema, { ...mapping, value: null, extra_member: true });
    const evidence = { intent_id: "intent.baseline", workspace_id: workspace.id, requirement_id: "local", kind: "local" as const, profile_digest: profileDigest, policy_revision: D("a"), artifact_digest: D("b"), catalog_digest: D("c") };
    const saved = store.save({
      ...attached,
      mappings: [mapping, { ...mapping, id: "mapping-two", value: [1, "two", null], reviewed: true }],
      evidence: [evidence, { ...evidence, assurance_digest: D("d") }],
      assurance_reviews: [{ selection: { kind: "preset", presetId: "managed" }, conflicts: [], exclusions: [] }],
    }, attached.revision);
    for (const value of [saved, store.get(saved.id), JSON.parse(readFileSync(join(fixture.root, "projects", `${saved.id}.json`), "utf8"))]) accepts(projectSchema, value);
    assert.equal(saved.workspace_refs.length, 1);
    assert.equal(saved.mappings.length, 2);
    assert.equal(saved.assurance_reviews?.length, 1);

    rejects(projectSchema, { ...saved, unexpected: 1 });
    rejects(projectSchema, { ...saved, evidence: [{ ...evidence, assurance_digest: "short" }] });
    rejects(projectSchema, { ...saved, mappings: [{ ...mapping, reviewed: "yes" }] });
    rejects(projectSchema, { ...saved, name: "   " });
    store.close();
  } finally {
    fixture.cleanup();
  }
});

test("the store keeps a looser profile than profile-v2, so project.schema.json keeps its own store-level profile", () => {
  const fixture = tempRoot("campusweave-schema-loose-");
  try {
    const store = openCampusWeaveProjectStore(fixture.root);
    const created = store.create("Loose profile");
    const loose = { ...created, profile: { ...created.profile, notes: "kept", intents: [{ free_form: true }] } };
    const saved = store.save(loose, created.revision);
    assert.deepEqual(saved.profile, loose.profile);
    accepts(projectSchema, saved);
    rejects(profileSchema, saved.profile);
    store.close();
  } finally {
    fixture.cleanup();
  }
});

function plannerExchange(request: unknown): { readonly request: unknown; readonly response: unknown; readonly status: number | null } {
  const result = spawnSync(join(REPO_ROOT, "apps/planner/.venv/bin/python"), ["-m", "campusweave.commands.stdio"], {
    cwd: join(REPO_ROOT, "apps/planner"),
    input: JSON.stringify(request),
    encoding: "utf8",
  });
  const lines = result.stdout.split("\n").filter((line) => line.length > 0);
  assert.equal(lines.length, 1, result.stderr);
  return { request, response: JSON.parse(lines[0] ?? ""), status: result.status };
}

test("real planner stdio requests and responses satisfy planner-bridge.schema.json", () => {
  const cases: [unknown, number, boolean][] = [
    [{ version: 1, id: "reference-1", command: "reference", payload: {} }, 0, true],
    [{ version: 1, id: "validate-1", command: "validate", payload: { profile: custom } }, 0, true],
    [{ version: 1, id: "compile-1", command: "compile", payload: { profile: custom } }, 0, true],
    [{ version: 1, id: "convert-1", command: "convert-v1", payload: { profile: {} } }, 0, true],
    [{ version: 1, id: "bad-command", command: "nope", payload: {} }, 2, false],
    [{ version: 2, id: "bad-version", command: "reference", payload: {} }, 2, false],
    [{ version: 1, id: "bad-payload", command: "reference", payload: { profile: {} } }, 2, false],
  ];
  for (const [request, status, ok] of cases) {
    const exchange = plannerExchange(request);
    assert.equal(exchange.status, status, JSON.stringify(exchange.response));
    assert.equal((exchange.response as { ok: boolean }).ok, ok);
    // The schema and the bridge agree on which requests are well formed.
    if (ok) accepts(bridgeSchema, exchange.request);
    else rejects(bridgeSchema, exchange.request);
    accepts(bridgeSchema, exchange.response);
  }
  const unversioned = plannerExchange({ id: "x" });
  assert.equal((unversioned.response as { error: { code: string } }).error.code, "invalid_request");
  accepts(bridgeSchema, unversioned.response);
});

test("planner-bridge.schema.json rejects malformed envelopes and lists every failure code the bridge emits", () => {
  rejects(bridgeSchema, { version: 1, id: "x", command: "reference", payload: { profile: {} } });
  rejects(bridgeSchema, { version: 1, id: "x", command: "validate", payload: {} });
  rejects(bridgeSchema, { version: 1, id: " ", command: "reference", payload: {} });
  rejects(bridgeSchema, { version: 1, id: "x", ok: false, error: { code: "other", message: "m", details: [] } });
  for (const code of ["request_too_large", "invalid_json", "invalid_request", "unsupported_version", "unknown_command", "response_too_large", "internal_error"]) {
    accepts(bridgeSchema, { version: 1, id: null, ok: false, error: { code, message: "m", details: [{ path: "$", message: "m" }] } });
  }
});

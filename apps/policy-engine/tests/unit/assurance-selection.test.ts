/** Tests source-preserving exact draft previews and fail-closed application. */
import assert from "node:assert/strict";
import test from "node:test";
import { prepareAssuranceSelection, applyPreparedAssuranceSelection } from "../../src/assurance/assurance-selection.js";
import { assuranceApplicability } from "../../src/assurance/assurance-applicability.js";
import { parseAssuranceCatalog, parseAssurancePresetCatalog } from "../../src/assurance/assurance-catalog-validation.js";
import { applyRequest, catalogBundle, configurations, DIGEST, fixture, recommendation } from "./assurance-fixture.js";
import type { JsonRecord } from "../../src/platform/serialization/json-guards.js";

test("a stronger existing setting is retained and unrelated draft fields survive", () => {
  const { input, dependencies } = fixture();
  const details = configurations(input.workspace)[0]!.details as JsonRecord;
  details.minLength = 12;
  input.workspace.policies[0]!.document.description = "Unrelated unsaved edit";
  const before = structuredClone(input.workspace);
  const result = prepareAssuranceSelection(input, dependencies);
  assert.equal(result.preview.ready, true);
  assert.deepEqual(result.workspace, before);
  assert.deepEqual(result.preview.changes, []);
  assert.equal(result.preview.retained[0]!.reason, "stronger-existing");
  assert.deepEqual(input.workspace, before);
});

test("creation is deterministic and preview enumerates all new configuration fields", () => {
  const { input, dependencies } = fixture(undefined, false);
  const first = prepareAssuranceSelection(input, dependencies);
  const second = prepareAssuranceSelection(input, dependencies);
  assert.equal(first.preview.ready, true);
  assert.deepEqual(second, first);
  assert.ok(first.preview.changes.some(change => change.path.endsWith("/details/minLength") && change.after === 6));
  assert.ok(first.preview.changes.some(change => change.path.endsWith("/uuid")));
  assert.deepEqual(applyPreparedAssuranceSelection(applyRequest(input, first.preview), dependencies).workspace, first.workspace);
  assert.equal(configurations(input.workspace).length, 0);
});

test("incompatible values require a current conflict decision with a recorded rationale", () => {
  const first = recommendation({ constraints: [{ path: "/minLength", operator: "equals", value: 6 }] });
  const second = recommendation({ id: "bsi:two", sourceRecommendationId: "two", mapping: { family: "relution-native", target: "IOS_PASSCODE", values: { minLength: 8 } }, constraints: [{ path: "/minLength", operator: "equals", value: 8 }] });
  const { input, dependencies } = fixture([first, second]);
  const selection = { ...input, selection: { kind: "preset", presetId: "essential", presetVersion: "1" } as const };
  const unresolved = prepareAssuranceSelection(selection, dependencies).preview;
  assert.equal(unresolved.ready, false);
  assert.equal(unresolved.conflicts.length, 1);
  assert.throws(() => applyPreparedAssuranceSelection(applyRequest(selection, unresolved), dependencies), /not ready/u);
  const decisions = [{ path: unresolved.conflicts[0]!.path, winnerRecommendationId: second.id, rationale: "Reviewed institutional compatibility decision" }];
  const resolved = prepareAssuranceSelection({ ...selection, decisions }, dependencies);
  assert.equal(resolved.preview.ready, true);
  assert.equal((configurations(resolved.workspace)[0]!.details as JsonRecord).minLength, 8);
  assert.deepEqual(resolved.preview.conflicts[0]!.resolvedBy, decisions[0]);
  assert.throws(() => prepareAssuranceSelection({ ...selection, decisions: [{ ...decisions[0]!, rationale: "" }] }, dependencies), /rationale/u);
});

test("required parameters remain unanswered and cannot weaken source constraints", () => {
  const record = recommendation({ disposition: "parameter", parameters: [{ id: "passcode.length", path: "/minLength", label: "Minimum length", required: true, valueType: "integer", minimum: 4, maximum: 16 }] });
  const { input, dependencies } = fixture([record]);
  assert.deepEqual(prepareAssuranceSelection(input, dependencies).preview.unresolvedParameters, ["passcode.length"]);
  const resolved = prepareAssuranceSelection({ ...input, parameters: { "passcode.length": 10 } }, dependencies);
  assert.equal(resolved.preview.ready, true);
  assert.equal((configurations(resolved.workspace)[0]!.details as JsonRecord).minLength, 10);
  assert.throws(() => prepareAssuranceSelection({ ...input, parameters: { "passcode.length": 4 } }, dependencies), /source constraint/u);
  assert.throws(() => prepareAssuranceSelection({ ...input, parameters: { "passcode.length": "10" } }, dependencies), /invalid integer/u);
});

test("missing, malformed, enrollment and OS applicability never becomes an applicable result", () => {
  const record = recommendation({ applicability: { operator: "all", predicates: [{ field: "platform", operator: "equals", value: "IOS" }, { field: "enrollmentChannel", operator: "equals", value: "device" }, { field: "osVersion", operator: "atLeast", value: "18.1" }] } });
  assert.equal(assuranceApplicability(record, "IOS", {}).applies, false);
  assert.equal(assuranceApplicability(record, "IOS", { enrollmentChannel: "user", osVersion: "18.1" }).applies, false);
  assert.equal(assuranceApplicability(record, "IOS", { enrollmentChannel: "device", osVersion: "18.0.9" }).applies, false);
  assert.equal(assuranceApplicability(record, "IOS", { enrollmentChannel: "device", osVersion: "unknown" }).applies, false);
  assert.equal(assuranceApplicability(record, "IOS", { enrollmentChannel: "device", osVersion: "18.2" }).applies, true);
  const empty = recommendation({ applicability: { operator: "all", predicates: [] } });
  assert.equal(assuranceApplicability(empty, "IOS", {}).applies, false);
  assert.throws(() => parseAssuranceCatalog(catalogBundle([empty]).catalog), /applicability/u);
});

test("catalog validation rejects empty, malformed and uncovered constraint declarations", () => {
  for (const constraints of [[], [{ path: "/minLength", operator: "atLeast", value: "six" }], [{ path: "/minLength", operator: "unknown", value: 6 }], [{ path: "/__proto__/polluted", operator: "equals", value: true }], [{ path: "/other", operator: "equals", value: true }]]) {
    const record = { ...recommendation(), constraints };
    assert.throws(() => parseAssuranceCatalog({ ...catalogBundle([]).catalog, recommendations: [record] }));
  }
  const unsupported = recommendation({ disposition: "unsupported" });
  assert.throws(() => parseAssuranceCatalog(catalogBundle([unsupported]).catalog), /selectable/u);
});

test("stale digests, post-image validation and explicit high readiness block apply", () => {
  const { input, dependencies } = fixture();
  const preview = prepareAssuranceSelection(input, dependencies).preview;
  assert.throws(() => applyPreparedAssuranceSelection({ ...applyRequest(input, preview), resultDigest: "b".repeat(64) }, dependencies), /result digest/u);
  assert.throws(() => applyPreparedAssuranceSelection(applyRequest(input, preview), { ...dependencies, workspaceRevision: "b".repeat(64) }), /revision/u);
  const undeclared = recommendation({ mapping: { family: "relution-native", target: "IOS_PASSCODE", values: { inventedField: true } }, constraints: [{ path: "/inventedField", operator: "equals", value: true }] });
  assert.throws(() => prepareAssuranceSelection(input, { ...dependencies, catalog: catalogBundle([undeclared]) }), /not declared/u);
  const invalid = recommendation({ mapping: { family: "relution-native", target: "IOS_PASSCODE", values: { maxFailedAttempts: 99 } }, constraints: [{ path: "/maxFailedAttempts", operator: "equals", value: 99 }] });
  assert.throws(() => prepareAssuranceSelection(input, { ...dependencies, catalog: catalogBundle([invalid]) }), /invalid workspace/u);
  const presets = dependencies.catalog.presets.presets.map(p => ({ ...p, requiresReadinessReview: true }));
  const restricted = { ...dependencies, catalog: { ...dependencies.catalog, presets: { ...dependencies.catalog.presets, presets } } };
  const selection = { ...input, selection: { kind: "preset", presetId: "essential", presetVersion: "1" } as const };
  assert.equal(prepareAssuranceSelection(selection, restricted).preview.ready, false);
  assert.equal(prepareAssuranceSelection({ ...selection, readinessReview: { reviewed: true, rationale: "Recovery and support ownership reviewed for this institution" } }, restricted).preview.ready, true);
  assert.equal(prepareAssuranceSelection({ ...input, acknowledgedSourceDigests: [] }, dependencies).preview.ready, false);
  assert.equal(preview.sourceDigests["bsi:document"], DIGEST);
});

test("compatible set constraints combine requirements while preserving existing protection", () => {
  const first = recommendation({ mapping: { family: "relution-native", target: "IOS_RESTRICTION", values: { blacklistedAppBundleIDs: ["test.blocked.a"] } }, constraints: [{ path: "/blacklistedAppBundleIDs", operator: "containsAll", value: ["test.blocked.a"] }] });
  const second = { ...first, id: "bsi:two", mapping: { ...first.mapping!, values: { blacklistedAppBundleIDs: ["test.blocked.b"] } }, constraints: [{ path: "/blacklistedAppBundleIDs", operator: "containsAll" as const, value: ["test.blocked.b"] }] };
  const { input, dependencies } = fixture([first, second]);
  (configurations(input.workspace)[0]!.details as JsonRecord).blacklistedAppBundleIDs = ["test.existing"];
  const selection = { ...input, selection: { kind: "preset", presetId: "essential", presetVersion: "1" } as const };
  const result = prepareAssuranceSelection(selection, dependencies);
  assert.equal(result.preview.ready, true);
  assert.equal(result.preview.conflicts.length, 0);
  assert.deepEqual((configurations(result.workspace)[0]!.details as JsonRecord).blacklistedAppBundleIDs, ["test.existing", "test.blocked.a", "test.blocked.b"]);
});

test("Apple profile XML and metadata identifiers reproduce the reviewed result", () => {
  const record = recommendation({ platform: "MACOS", applicability: { operator: "all", predicates: [{ field: "platform", operator: "equals", value: "MACOS" }] }, mapping: { family: "apple-schema-profile", target: "profile:com.apple.security.firewall", values: { EnableFirewall: true } }, constraints: [{ path: "/EnableFirewall", operator: "equals", value: true }] });
  const { input, dependencies } = fixture([record], false);
  const reviewed = prepareAssuranceSelection(input, dependencies);
  const applied = applyPreparedAssuranceSelection(applyRequest(input, reviewed.preview), dependencies);
  assert.equal(applied.preview.ready, true);
  assert.deepEqual(applied.workspace, reviewed.workspace);
  const details = configurations(applied.workspace)[0]!.details as JsonRecord;
  assert.equal(typeof details.rawContent, "string");
  const subsequent = prepareAssuranceSelection({ ...input, workspace: applied.workspace }, dependencies);
  assert.equal(subsequent.preview.changes.length, 0);
});

test("higher presets compare fixed values with the inherited effective source value", () => {
  const { input, dependencies } = fixture();
  const essential = dependencies.catalog.presets.presets[0]!;
  const sourceSelection = essential.selections[0]!;
  const pinned = { ...sourceSelection, fixedValues: { "/minLength": 6 }, settingRationales: { "/minLength": "Foundational minimum" }, overrideJustifications: { "/minLength": null } };
  const managed = { ...essential, id: "managed", inherits: "essential", selections: [pinned] };
  const high = { ...managed, id: "high", inherits: "managed", selections: [{ ...pinned, fixedValues: { "/minLength": 8 }, overrideJustifications: { "/minLength": "Operationally reviewed stronger institutional minimum" } }] };
  const catalog = { ...dependencies.catalog, presets: { ...dependencies.catalog.presets, presets: [essential, managed, high] } };
  const selection = { ...input, selection: { kind: "preset", presetId: "high", presetVersion: "1" } as const };
  const result = prepareAssuranceSelection(selection, { ...dependencies, catalog });
  assert.deepEqual(result.preview.recommendationIds, ["bsi:one"]);
  assert.equal((configurations(result.workspace)[0]!.details as JsonRecord).minLength, 8);
  high.selections[0]!.overrideJustifications["/minLength"] = "";
  assert.throws(() => prepareAssuranceSelection(selection, { ...dependencies, catalog }), /override rationale/u);
});

test("higher presets can document and apply inherited parameter default overrides", () => {
  const record = recommendation({
    disposition: "parameter",
    parameters: [{ id: "passcode.length", path: "/minLength", label: "Minimum length", required: true, valueType: "integer", defaultValue: 6, minimum: 6, maximum: 16 }],
  });
  const { input, dependencies } = fixture([record]);
  const parentSelection = {
    recommendationId: record.id,
    fixedValues: {},
    parameterDefaults: {},
    settingRationales: {},
    overrideJustifications: {},
  };
  const childSelection = {
    ...parentSelection,
    parameterDefaults: { "passcode.length": 6 },
    overrideJustifications: {},
  };
  const essential = { ...dependencies.catalog.presets.presets[0]!, selections: [parentSelection] };
  const managed = { ...essential, id: "managed", inherits: "essential", selections: [childSelection] };
  const restrictiveSelection = {
    ...childSelection,
    parameterDefaults: { "passcode.length": 8 },
    overrideJustifications: { "/minLength": "Operationally reviewed stronger institutional minimum" },
  };
  const high = { ...managed, id: "high", inherits: "managed", selections: [restrictiveSelection] };
  const presets = parseAssurancePresetCatalog(
    { ...dependencies.catalog.presets, presets: [essential, managed, high] },
    dependencies.catalog.catalog,
  );
  const catalog = { ...dependencies.catalog, presets };
  const selection = { ...input, selection: { kind: "preset", presetId: "high", presetVersion: "1" } as const };
  const result = prepareAssuranceSelection(selection, { ...dependencies, catalog });
  assert.equal((configurations(result.workspace)[0]!.details as JsonRecord).minLength, 8);

  const undocumented = { ...high, selections: [{ ...restrictiveSelection, overrideJustifications: {} }] };
  const parsedUndocumented = parseAssurancePresetCatalog(
    { ...dependencies.catalog.presets, presets: [essential, managed, undocumented] },
    dependencies.catalog.catalog,
  );
  assert.throws(
    () => prepareAssuranceSelection(selection, { ...dependencies, catalog: { ...catalog, presets: parsedUndocumented } }),
    /parameter override rationale/u,
  );
});

/** Prevents mixed and empty legacy mappings from claiming a compliant recommendation. */
import assert from "node:assert/strict";
import test from "node:test";
import { mappingValuesMatch } from "../../src/assurance/compliance-value-matching.js";
import { evaluateRecommendation } from "../../src/assurance/compliance-recommendation-evaluation.js";
import { evaluateMapping } from "../../src/assurance/compliance-mapping-evaluation.js";
import { bindComplianceApplicability } from "../../src/assurance/compliance-assurance-binding.js";
import { loadAppleSchemaCatalog } from "../../src/apple/apple-schema-catalog.js";
import type { RecommendationRecord, RecommendationRulesetMapping } from "../../src/assurance/recommendation-types.js";
import type { ComplianceSourceCatalogs } from "../../src/assurance/compliance-types.js";
import { catalogBundle, recommendation } from "./assurance-fixture.js";

const appleSchema = loadAppleSchemaCatalog();
const complete = { kind: "relution-native", type: "IOS_PASSCODE", values: { minLength: 6 } };
function legacy(mappings: RecommendationRulesetMapping[]): RecommendationRecord {
  return { id: "one", title: "Synthetic recommendation", platform: "IOS", sourceIds: ["document"], implementation: {category: "relution-achievable", surfaces: ["relution-native"], importableVia: ["ruleset-import"], blockingReasons: []}, section: "Test", recommendedValue: 6, reason: "Synthetic", vendor: {}, relutionMapping: { status: "exact", rulesetMappings: mappings, notes: [], candidates: [], mergeableInImportableRuleset: true } } as RecommendationRecord;
}
function evaluate(mappings: RecommendationRulesetMapping[]) {
  return evaluateRecommendation("bsi", legacy(mappings), [{ details: { type: "IOS_PASSCODE", minLength: 6 } }], {} as ComplianceSourceCatalogs, appleSchema);
}

test("every declared mapping remains visible and one unsupported mapping blocks compliance", () => {
  const result = evaluate([complete, { kind: "gpo-only", values: { enabled: true } }]);
  assert.equal(result.status, "not-checkable");
  assert.deepEqual(result.mappingResults.map(mapping => mapping.status), ["compliant", "unsupported"]);
  assert.equal(result.remediationOptions.length, 0);
  assert.equal(evaluate([]).status, "not-checkable");
});

test("empty and malformed predicates fail closed even alongside matching actual values", () => {
  for (const mapping of [{ ...complete, constraints: [] }, { ...complete, values: {} }, { ...complete, values: { nested: {} } }, { ...complete, constraints: [{ path: "", operator: "atLeast", value: 6 }] }, { ...complete, constraints: [{ path: "minLength", operator: "atLeast", value: "not a number" }] }, { ...complete, constraints: [{ path: "items", operator: "containsAll", value: [] }] }]) {
    assert.equal(mappingValuesMatch(mapping as RecommendationRulesetMapping, mapping.values, { minLength: 6 }), false);
    assert.equal(evaluateMapping(mapping as RecommendationRulesetMapping, [], appleSchema).status, "unsupported");
  }
  assert.equal(mappingValuesMatch({ ...complete, constraints: [{ path: "minLength", operator: "atLeast", value: 6 }] }, complete.values, { minLength: 12 }), true);
});

test("a local value match needs a supported source audit and resolved device applicability", () => {
  const matched = evaluate([complete]);
  assert.equal(matched.status, "compliant");
  const unbound = bindComplianceApplicability(matched, "IOS", undefined);
  assert.equal(unbound.status, "not-checkable");
  assert.equal(unbound.localConfigurationStatus, "compliant");
  const record = recommendation({ applicability: { operator: "all", predicates: [{ field: "platform", operator: "equals", value: "IOS" }, { field: "supervision", operator: "equals", value: "supervised" }] } });
  const catalog = catalogBundle([record]);
  assert.equal(bindComplianceApplicability(matched, "IOS", { catalog, applicability: {} }).status, "not-checkable");
  assert.equal(bindComplianceApplicability(matched, "IOS", { catalog, applicability: { supervision: "supervised" } }).status, "compliant");
});

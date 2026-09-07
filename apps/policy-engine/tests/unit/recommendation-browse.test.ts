/** Ensures compact browsing preserves selection/filter behavior without transferring evidence. */
import assert from "node:assert/strict";
import test from "node:test";
import { browseRecommendationCatalog } from "../../src/assurance/recommendation-browse.js";
import { loadRecommendationCatalog } from "../../src/assurance/recommendation-catalog-loader.js";
import { implementationOf } from "../../src/assurance/recommendation-implementation.js";
import { matchesFilters } from "../../web/src/features/assurance/recommendation-search.js";
import { canImportRuleset } from "../../web/src/features/assurance/recommendation-view-metadata.js";

for (const source of ["bsi", "vendor", "cis"] as const) {
  test(`${source} browse retains identity, filters and imports while excluding evidence`, () => {
    const catalog = loadRecommendationCatalog(source, { rootDir: process.cwd() });
    assert.equal(catalog.available, true);
    const before = JSON.stringify(catalog);
    const browse = browseRecommendationCatalog(catalog);
    assert.equal(browseRecommendationCatalog(catalog), browse);
    assert.equal(browse.recommendations.length, catalog.recommendations.length);
    assert.equal(browse.coverageSummary, catalog.coverageSummary);
    assert.ok(JSON.stringify(browse).length < before.length / 4);
    assert.equal("ruleset" in browse, false);
    browse.recommendations.forEach((row, index) => {
      const record = catalog.recommendations[index]!;
      assert.equal(row.id, record.id);
      assert.equal(row.hasRulesetMappings, record.relutionMapping.rulesetMappings.length > 0);
      const { category, surfaces, importableVia } = implementationOf(record);
      assert.deepEqual(row.implementation, { category, surfaces, importableVia });
      assert.equal("rulesetMappings" in row.relutionMapping, false);
      for (const query of ["", row.title.slice(0, 12), row.displayIdentifier]) {
        assert.equal(matchesFilters(source, row, row.platform, query, "ALL", "ALL"), matchesFilters(source, record, row.platform, query, "ALL", "ALL"));
      }
    });
    for (const platform of catalog.displayPlatforms) {
      const expected = catalog.ruleset?.policies.some((policy) => policy.platform === catalog.displayToImportPlatform[platform] && policy.rules.some((rule) => rule.informational !== true && (rule.mappings?.length ?? 0) > 0)) ?? false;
      assert.equal(canImportRuleset(browse, platform), expected);
    }
    assert.equal(JSON.stringify(catalog), before);
  });
}

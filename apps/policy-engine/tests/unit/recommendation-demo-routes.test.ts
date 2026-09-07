/** Hosted demo provides the same additive recommendation resources without network access. */
import assert from "node:assert/strict";
import test from "node:test";
import { DemoApi } from "../../web/src/demo/demo-api.js";
import type { RecommendationBrowseResponse, RecommendationCatalogResponse } from "../../src/browser/assurance.js";

test("demo legacy, compact browse, selected evidence and import ruleset remain equivalent", async () => {
  const api = new DemoApi();
  for (const source of ["bsi", "vendor", "cis"]) {
    const prefix = `/api/recommendations/${source}`;
    const catalog = await (await api.fetch(prefix)).json() as RecommendationCatalogResponse;
    const browse = await (await api.fetch(`${prefix}/browse`)).json() as RecommendationBrowseResponse;
    assert.equal("ruleset" in browse, false);
    assert.equal(browse.recommendations[0]?.id, catalog.recommendations[0]?.id);
    const detail = await api.fetch(`${prefix}/records/${encodeURIComponent(browse.recommendations[0]!.id)}`);
    assert.deepEqual(await detail.json(), catalog.recommendations[0]);
    assert.deepEqual(await (await api.fetch(`${prefix}/ruleset`)).json(), catalog.ruleset);
    assert.equal((await api.fetch(`${prefix}/records/missing`)).status, 404);
    assert.equal((await api.fetch(`${prefix}/records/%ZZ`)).status, 400);
    assert.equal((await api.fetch(`${prefix}/browse/extra`)).status, 404);
  }
  assert.equal((await api.fetch("/api/recommendations/unknown/browse")).status, 404);
});

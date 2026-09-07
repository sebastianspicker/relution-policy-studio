/** The HTTP additions do not alter legacy recommendation responses or route precedence. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { handleRecommendationApiRequest } from "../../src/editor/editor-server-recommendation-routes.js";
import { listRecommendationCatalogs, loadRecommendationCatalog } from "../../src/assurance/recommendation-catalog-loader.js";
import { browseRecommendationCatalog } from "../../src/assurance/recommendation-browse.js";

test("legacy catalog and additive browse, detail, ruleset HTTP routes", async () => {
  const server = createServer((request, response) => {
    if (!handleRecommendationApiRequest(new URL(request.url ?? "/", "http://localhost"), request, response)) response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/recommendations`)).json(), listRecommendationCatalogs());
    for (const source of ["bsi", "vendor", "cis"] as const) {
      const prefix = `${base}/api/recommendations/${source}`;
      const catalog = loadRecommendationCatalog(source);
      assert.deepEqual(await (await fetch(prefix)).json(), catalog);
      assert.deepEqual(await (await fetch(`${prefix}/browse`)).json(), browseRecommendationCatalog(catalog));
      const ruleset = await fetch(`${prefix}/ruleset`);
      assert.equal(ruleset.status, catalog.ruleset === undefined ? 404 : 200);
      if (catalog.ruleset !== undefined) assert.deepEqual(await ruleset.json(), catalog.ruleset);
      const record = catalog.recommendations[0];
      if (record !== undefined) assert.deepEqual(await (await fetch(`${prefix}/records/${encodeURIComponent(record.id)}`)).json(), record);
      assert.equal((await fetch(`${prefix}/records/does-not-exist`)).status, 404);
      assert.equal((await fetch(`${prefix}/records/%ZZ`)).status, 400);
      assert.equal((await fetch(`${prefix}/browse/unexpected`)).status, 404);
    }
    assert.equal((await fetch(`${base}/api/recommendations/unknown/browse`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

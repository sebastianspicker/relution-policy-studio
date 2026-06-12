import assert from "node:assert/strict";
import test from "node:test";
import { relutionE2eApiUrl } from "./relution-docker-e2e-helpers.js";

test("Relution E2E API URLs require loopback by default and encode path segments", () => {
  const url = relutionE2eApiUrl(["api", "management", "policy id", "versions"], {
    baseUrlValue: "http://127.0.0.1:8080/customer-a/",
  });

  assert.equal(url.href, "http://127.0.0.1:8080/customer-a/api/management/policy%20id/versions");
});

test("Relution E2E API URLs reject malformed, non-http, and remote base URLs without opt-in", () => {
  assert.throws(() => relutionE2eApiUrl(["api"], { baseUrlValue: "not a url" }), /Invalid URL/u);
  assert.throws(() => relutionE2eApiUrl(["api"], { baseUrlValue: "file:///tmp/relution" }), /must use http or https/u);
  assert.throws(() => relutionE2eApiUrl(["api"], { baseUrlValue: "https://relution.example.test" }), /must be loopback/u);
});

test("Relution E2E API URLs allow remote targets only with explicit opt-in", () => {
  const url = relutionE2eApiUrl(["api", "management"], {
    baseUrlValue: "https://relution.example.test",
    allowRemoteBaseUrl: true,
  });

  assert.equal(url.href, "https://relution.example.test/api/management");
});

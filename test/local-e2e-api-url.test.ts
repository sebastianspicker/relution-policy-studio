import assert from "node:assert/strict";
import test from "node:test";
import { localEditorApiUrl } from "./local-e2e-api-url.js";

test("local editor E2E API URLs are constrained to loopback API paths", () => {
  assert.equal(localEditorApiUrl("http://127.0.0.1:8787/", "/api/relution/session").href, "http://127.0.0.1:8787/api/relution/session");
  assert.throws(() => localEditorApiUrl("https://editor.example.test", "/api/relution/session"), /must be loopback/u);
  assert.throws(() => localEditorApiUrl("file:///tmp/editor", "/api/relution/session"), /must use http or https/u);
  assert.throws(() => localEditorApiUrl("http://127.0.0.1:8787/", "https://example.invalid/api/relution/session"), /Unexpected/u);
  assert.throws(() => localEditorApiUrl("http://127.0.0.1:8787/", "//example.invalid/api/relution/session"), /Unexpected/u);
  assert.throws(() => localEditorApiUrl("http://127.0.0.1:8787/", "/not-api/relution/session"), /Unexpected/u);
});

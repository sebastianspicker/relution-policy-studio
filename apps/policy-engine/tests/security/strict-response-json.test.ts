/** Verifies fatal UTF-8 JSON decoding shared by external service clients. */
import assert from "node:assert/strict";
import test from "node:test";
import { strictResponseJson } from "../../src/platform/network/strict-response-json.js";

test("accepts BOM-prefixed JSON and valid multibyte UTF-8", async () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"name":"Jörg"}')]);
  assert.deepEqual(await strictResponseJson(new Response(bytes), "Test response"), { name: "Jörg" });
});

test("rejects malformed UTF-8 rather than decoding a replacement character", async () => {
  await assert.rejects(
    strictResponseJson(new Response(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])), "Test response"),
    /Test response returned invalid JSON/u,
  );
});

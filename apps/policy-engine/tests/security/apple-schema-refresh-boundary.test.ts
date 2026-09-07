/** Exercises the bounded, fixed-destination Apple schema refresh boundary. */
import assert from "node:assert/strict";
import test from "node:test";
import { APPLE_SCHEMA_SOURCE_PATHS } from "../../src/apple/apple-schema-catalog-storage.js";
import { readRemoteAppleSchemaDocuments } from "../../src/apple/apple-schema-catalog-remote.js";
import { fetchAppleSchemaUrl } from "../../src/apple/apple-schema-catalog-urls.js";

const firstSource = APPLE_SCHEMA_SOURCE_PATHS[0];
if (firstSource === undefined) throw new Error("Apple schema source catalog must not be empty");

test("Apple schema refresh rejects redirects and requests them manually", async () => {
  let redirectMode: RequestRedirect | undefined;
  await withFetchStub(async (_url, init) => {
    redirectMode = init?.redirect;
    return new Response(null, { status: 302, headers: { location: "https://example.test/" } });
  }, async () => {
    await assert.rejects(readRemoteAppleSchemaDocuments("release"), /must not redirect/u);
  });
  assert.equal(redirectMode, "manual");
});

test("Apple schema fetch accepts only its exact HTTPS hosts, default port, and catalog paths", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(
    fetchAppleSchemaUrl(new URL("https://api.github.com:8443/repos/apple/device-management/contents/mdm/profiles?ref=release"), signal, 16),
    /Unexpected Apple schema URL/u,
  );
  await assert.rejects(
    fetchAppleSchemaUrl(new URL("https://raw.githubusercontent.com/apple/device-management/release/not-a-catalog-path/example.yaml"), signal, 16),
    /Unexpected Apple schema URL/u,
  );
});

test("Apple schema refresh bounds each directory response and the aggregate directory entries", async () => {
  await withFetchStub(async () => new Response("x".repeat(32)), async () => {
    await assert.rejects(
      readRemoteAppleSchemaDocuments("release", { maxDirectoryResponseBytes: 16 }),
      /Apple schema download API response exceeds 16 bytes/u,
    );
  });

  await withFetchStub(async () => directoryResponse([
    remoteEntry(firstSource.path, "one.yaml"),
    remoteEntry(firstSource.path, "two.yaml"),
  ]), async () => {
    await assert.rejects(
      readRemoteAppleSchemaDocuments("release", { maxDirectoryEntries: 1 }),
      /exceeds 1 directory entries/u,
    );
  });
});

test("Apple schema refresh enforces the aggregate document budget", async () => {
  await withFetchStub(async (url) => {
    if (url.hostname === "api.github.com") {
      return url.pathname.endsWith(`/${firstSource.path}`)
        ? directoryResponse([remoteEntry(firstSource.path, "one.yaml"), remoteEntry(firstSource.path, "two.yaml")])
        : directoryResponse([]);
    }
    return new Response("abc");
  }, async () => {
    await assert.rejects(
      readRemoteAppleSchemaDocuments("release", { maxDocumentBytes: 5 }),
      /exceeds 5 document bytes/u,
    );
  });
});

test("Apple schema refresh counts directory and document bodies against one aggregate budget", async () => {
  await withFetchStub(async () => directoryResponse([]), async () => {
    await assert.rejects(
      readRemoteAppleSchemaDocuments("release", { maxAggregateBodyBytes: 1 }),
      /exceeds 1 aggregate body bytes/u,
    );
  });
});

test("Apple schema refresh applies one deadline to the entire fetch sequence", async () => {
  let requestSignal: AbortSignal | undefined;
  await withFetchStub(async (_url, init) => {
    requestSignal = init?.signal ?? undefined;
    return await new Promise<Response>(() => undefined);
  }, async () => {
    await assert.rejects(
      readRemoteAppleSchemaDocuments("release", { timeoutMs: 20 }),
      /Apple schema refresh exceeded 20ms/u,
    );
  });
  assert.equal(requestSignal?.aborted, true);
});

function directoryResponse(entries: unknown[]): Response {
  return new Response(JSON.stringify(entries));
}

function remoteEntry(path: string, name: string): Record<string, string> {
  return {
    name,
    download_url: `https://raw.githubusercontent.com/apple/device-management/release/${path}/${name}`,
  };
}

async function withFetchStub(
  fetchStub: (url: URL, init: RequestInit | undefined) => Promise<Response>,
  action: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => await fetchStub(new URL(input instanceof URL ? input.href : input.toString()), init);
  try {
    await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

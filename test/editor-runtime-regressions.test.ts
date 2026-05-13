import assert from "node:assert/strict";
import test from "node:test";
import { lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "../src/editor-server.js";
import { assertSafeEditorHost } from "../src/editor-server-helpers.js";
import { loadEditorSidecar, saveEditorSidecar, type EditorSidecarState } from "../src/sidecar.js";
import { loadTemplateBundle } from "../src/templates.js";
import { createNewWorkspace } from "../src/workspace.js";

const EMPTY_SIDECAR: EditorSidecarState = {
  version: 1,
  mobileConfigRestore: [],
  ddmArtifacts: [],
  mdmCommandArtifacts: [],
  customManifests: [],
};

async function withEditorServer<T>(
  options: Parameters<typeof startEditorServer>[0],
  callback: (handle: Awaited<ReturnType<typeof startEditorServer>>) => Promise<T>,
): Promise<T> {
  const handle = await startEditorServer(options);
  try {
    return await callback(handle);
  } finally {
    await handle.close();
  }
}

test("sidecar I/O rejects a symlinked editor-sidecar.json", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-sidecar-"));
  const workspace = join(root, "workspace");
  const outside = join(root, "outside-sidecar.json");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(outside, `${JSON.stringify(EMPTY_SIDECAR)}\n`);
  symlinkSync(outside, join(workspace, "editor-sidecar.json"));

  assert.equal(lstatSync(join(workspace, "editor-sidecar.json")).isSymbolicLink(), true);
  assert.throws(() => loadEditorSidecar(workspace), /sidecar path must not use symlinks/u);
  assert.throws(() => saveEditorSidecar(workspace, EMPTY_SIDECAR), /sidecar path must not use symlinks/u);
});

test("sidecar I/O rejects a symlinked workspace root", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-sidecar-root-"));
  const realWorkspace = join(root, "real-workspace");
  const workspaceLink = join(root, "workspace-link");
  mkdirSync(realWorkspace, { recursive: true });
  symlinkSync(realWorkspace, workspaceLink);

  assert.equal(lstatSync(workspaceLink).isSymbolicLink(), true);
  assert.throws(() => loadEditorSidecar(workspaceLink), /sidecar path must not use symlinks/u);
  assert.throws(() => saveEditorSidecar(workspaceLink, EMPTY_SIDECAR), /sidecar path must not use symlinks/u);
});

test("editor mutation endpoints return 400 for malformed client requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-editor-api-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "API validation",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const moveResponse = await postJson(new URL("api/configuration/move", handle.url), {
      policyPath: "policies/policy_missing.json",
      versionIndex: 0,
      configurationIndex: 0,
      direction: "left",
    });
    assert.equal(moveResponse.status, 400);
    assert.match(await moveResponse.text(), /Unsupported move direction/u);

    const ddmResponse = await postJson(new URL("api/ddm/artifact", handle.url), {
      schemaId: "missing-schema",
      values: {},
    });
    assert.equal(ddmResponse.status, 400);
    assert.match(await ddmResponse.text(), /Unknown Apple schema entry/u);

    const importResponse = await postJson(new URL("api/import", handle.url), {
      dataBase64: "AA==",
    });
    assert.equal(importResponse.status, 400);
    assert.match(await importResponse.text(), /Import requires an encryption key/u);
  } finally {
    await handle.close();
  }
});

test("network editor mode requires the fragment capability token for API requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-network-token-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Network token guard",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
    allowNetworkHost: true,
  });

  try {
    const url = new URL(handle.url);
    const token = url.hash.startsWith("#editorToken=") ? decodeURIComponent(url.hash.slice("#editorToken=".length)) : null;
    assert.equal(url.searchParams.get("editorToken"), null);
    assert.equal(typeof token, "string");
    assert.notEqual(token, "");

    const blocked = await postJsonWithHost(handle.url, {
      host: "attacker.example.test",
      origin: "http://attacker.example.test",
      body: { key: "stolen-by-rebinding" },
    });
    assert.equal(blocked.status, 403);
    assert.match(blocked.body, /editor token/u);

    const allowed = await postJsonWithHost(handle.url, {
      host: "attacker.example.test",
      origin: "http://attacker.example.test",
      token: token ?? "",
      body: { key: "operator-approved" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await handle.close();
  }
});

test("default loopback editor mode rejects API reads with non-loopback Host headers", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-loopback-host-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Loopback host guard",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const blockedGet = await getWithHost(new URL("api/state", handle.url), "attacker.example.test");
    assert.equal(blockedGet.status, 403);
    assert.match(blockedGet.body, /loopback Host header/u);

    const allowedGet = await getWithHost(new URL("api/state", handle.url), "127.0.0.1");
    assert.equal(allowedGet.status, 200);
    assert.match(allowedGet.body, /Loopback host guard/u);
  } finally {
    await handle.close();
  }
});

test("mutating API origin checks treat default HTTP ports as equivalent", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-origin-port-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Default port origin guard",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const allowed = await postJsonWithHost(handle.url, {
      host: "127.0.0.1:80",
      origin: "http://127.0.0.1",
      body: { key: "same-origin-default-port" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await handle.close();
  }
});

test("loopback host validation accepts IPv4-mapped IPv6 loopback addresses", () => {
  assert.doesNotThrow(() => assertSafeEditorHost("::ffff:127.0.0.1", false));
});

test("editor JSON body reader rejects excessively deep JSON before parsing", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-json-depth-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "JSON depth guard",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const deepJson = `{"workspace":${"[".repeat(250)}0${"]".repeat(250)}}`;
    const rejected = await postRawWithHost(new URL("api/workspace", handle.url), {
      host: "127.0.0.1",
      origin: "http://127.0.0.1",
      body: deepJson,
    });
    assert.equal(rejected.status, 413);
    assert.match(rejected.body, /maximum nesting depth/u);
  } finally {
    await handle.close();
  }
});

test("editor server closes gracefully and releases its port", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-editor-close-"));
  const workspace = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  createNewWorkspace({
    workspace,
    platform: "IOS",
    name: "Graceful close",
    serverVersion: bundle.serverVersion,
  });

  let releasedPort = 0;
  await withEditorServer({ workspace, key: "", out, host: "127.0.0.1", port: 0 }, async (handle) => {
    const response = await fetch(new URL("api/state", handle.url));
    assert.equal(response.status, 200, "server should respond before close");
    releasedPort = Number(new URL(handle.url).port);
  });

  assert.equal(Number.isSafeInteger(releasedPort) && releasedPort > 0, true, "server should expose a real port");
  await withEditorServer({ workspace, key: "", out, host: "127.0.0.1", port: releasedPort }, async (handle) => {
    assert.equal(Number(new URL(handle.url).port), releasedPort, "closed server port should be reusable");
  });
});

async function postJson(url: URL, value: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function getWithHost(url: URL, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname,
        method: "GET",
        headers: { host },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolveRequest({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", rejectRequest);
    request.end();
  });
}

function postJsonWithHost(
  baseUrl: string,
  options: { host: string; origin: string; token?: string; body: unknown },
): Promise<{ status: number; body: string }> {
  const url = new URL("api/key", baseUrl);
  const body = JSON.stringify(options.body);

  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "host": options.host,
          "origin": options.origin,
          ...(options.token === undefined ? {} : { "x-relution-editor-token": options.token }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolveRequest({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", rejectRequest);
    request.end(body);
  });
}

function postRawWithHost(
  url: URL,
  options: { host: string; origin: string; body: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(options.body),
          "host": options.host,
          "origin": options.origin,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolveRequest({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", rejectRequest);
    request.end(options.body);
  });
}

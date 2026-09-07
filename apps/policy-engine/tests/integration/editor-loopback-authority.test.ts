/** Exercises loopback Host, token, and same-Origin controls through a real server. */
import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { startEditorServer } from "../../src/editor/editor-server.js";
import { createTestWorkspace } from "../support/workspace.js";

test("the loopback editor requires its capability token, a loopback Host, and same-origin JSON mutations", async () => {
  const fixture = createTestWorkspace("Editor authority");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "127.0.0.1", port: 0, apiToken: "editor-contract-token" });
  try {
    const state = await fetch(`${handle.url}api/state`);
    assert.equal(state.status, 403);

    const authority = new URL(handle.url);
    const wrongHost = await rawRequest(authority, "/api/state", { "x-rexp-studio-token": handle.apiToken, host: "example.test" });
    assert.equal(wrongHost.status, 403);

    const wrongOrigin = await fetch(`${handle.url}api/workspace/validate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rexp-studio-token": handle.apiToken, origin: "http://localhost:65535" },
      body: "{}",
    });
    assert.equal(wrongOrigin.status, 403);

    const authenticated = await fetch(`${handle.url}api/state`, { headers: { "x-rexp-studio-token": handle.apiToken } });
    const body = await authenticated.json() as { workspace: { policies: Array<{ document: { platform: string } }> } };
    body.workspace.policies[0]!.document.platform = "INVALID";
    const validation = await fetch(`${handle.url}api/workspace/validate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rexp-studio-token": handle.apiToken, origin: authority.origin },
      body: JSON.stringify({ workspace: body.workspace }),
    });
    assert.equal(validation.status, 200);
    assert.equal((await validation.json() as { validation: { ok: boolean } }).validation.ok, false);

    const wrongMethod = await fetch(`${handle.url}api/build`, { headers: { "x-rexp-studio-token": handle.apiToken } });
    assert.equal(wrongMethod.status, 404);
    assert.deepEqual(await wrongMethod.json(), { error: "Unknown API endpoint: GET /api/build" });

    const unknownNamespaceRoute = await fetch(`${handle.url}api/relution/missing`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-rexp-studio-token": handle.apiToken, origin: authority.origin },
      body: "{}",
    });
    assert.equal(unknownNamespaceRoute.status, 404);
    assert.deepEqual(await unknownNamespaceRoute.json(), { error: "Unknown Relution endpoint: POST /api/relution/missing" });
  } finally {
    await handle.close();
    fixture.cleanup();
  }
});

test("the editor runtime refuses non-loopback bind addresses", async () => {
  const fixture = createTestWorkspace("Editor bind guard");
  try {
    await assert.rejects(
      startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: fixture.key, host: "0.0.0.0", port: 0 }),
      /Non-loopback editor host/u,
    );
  } finally {
    fixture.cleanup();
  }
});

test("bodyless build returns before an unfinished malformed request upload ends", async () => {
  const fixture = createTestWorkspace("Editor bodyless build");
  const handle = await startEditorServer({ workspace: fixture.workspace, out: fixture.archive, key: "", host: "127.0.0.1", port: 0, apiToken: "editor-bodyless-token" });
  try {
    const authority = new URL(handle.url);
    const result = await unfinishedPost(authority, "/api/build", handle.apiToken);
    assert.equal(result.status, 400);
    assert.match(result.body, /Build requires an archive passphrase/u);
  } finally {
    await handle.close();
    fixture.cleanup();
  }
});

async function rawRequest(authority: URL, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return await new Promise((resolvePromise, reject) => {
    const incoming = request({ hostname: authority.hostname, port: authority.port, path, headers }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolvePromise({ status: response.statusCode ?? 0, body }));
    });
    incoming.on("error", reject);
    incoming.end();
  });
}

async function unfinishedPost(authority: URL, path: string, token: string): Promise<{ status: number; body: string }> {
  return await new Promise((resolvePromise, reject) => {
    let settled = false;
    const incoming = request({
      hostname: authority.hostname,
      port: authority.port,
      path,
      method: "POST",
      headers: { "content-type": "application/json", "x-rexp-studio-token": token, origin: authority.origin },
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => {
        settled = true;
        clearTimeout(timeout);
        incoming.destroy();
        resolvePromise({ status: response.statusCode ?? 0, body });
      });
    });
    incoming.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    const timeout = setTimeout(() => {
      settled = true;
      incoming.destroy();
      reject(new Error("Bodyless build waited for the unfinished request body"));
    }, 2_000);
    incoming.write("{malformed");
  });
}

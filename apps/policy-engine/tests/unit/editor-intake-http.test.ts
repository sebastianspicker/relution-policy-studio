/** Exercises upload scheduling and disconnect cleanup with real loopback sockets. */
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { EditorMutationIntake } from "../../src/editor/editor-mutation-intake.js";
import { editorMutationRequestCancellation } from "../../src/editor/editor-mutation-routing.js";
import { LARGE_JSON_BODY_LIMIT_BYTES, readJsonBody } from "../../src/editor/editor-json-body.js";

function signalEvent(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((ready) => { resolve = ready; });
  return { promise, resolve };
}

test("a normal HTTP mutation finishes during an unfinished upload, whose disconnect releases admission", { timeout: 5_000 }, async () => {
  const intake = new EditorMutationIntake();
  const uploadReceived = signalEvent();
  const uploadSettled = signalEvent();
  let uploadExecuted = false;
  const server = createServer((request, response) => {
    const upload = request.url === "/upload";
    const cancellation = editorMutationRequestCancellation(request, response);
    if (upload) uploadReceived.resolve();
    void intake.run(request, upload ? LARGE_JSON_BODY_LIMIT_BYTES : 1024 * 1024, true, async () => {
      const body = await readJsonBody(request);
      if (upload) uploadExecuted = true;
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    }, { signal: cancellation.signal }).catch((error: unknown) => {
      if (!response.destroyed) response.writeHead(400).end(String(error));
    }).finally(() => {
      cancellation.dispose();
      if (upload) uploadSettled.resolve();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const upload = httpRequest(`${base}/upload`, { method: "POST" });
  upload.on("error", () => {});
  try {
    upload.write('{"unfinished":');
    await uploadReceived.promise;
    const normal = await fetch(`${base}/normal`, { method: "POST", body: '{"value":"normal"}' });
    assert.equal(normal.status, 200);
    assert.deepEqual(await normal.json(), { value: "normal" });
    assert.equal(uploadExecuted, false);
    assert.equal(intake.pendingCount, 1);
    assert.equal(intake.reservedBodyBytes, LARGE_JSON_BODY_LIMIT_BYTES);
    upload.destroy();
    await uploadSettled.promise;
    assert.equal(intake.pendingCount, 0);
    assert.equal(intake.reservedBodyBytes, 0);
    assert.equal(uploadExecuted, false);
  } finally {
    upload.destroy();
    await intake.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
});

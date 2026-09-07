/** Verifies bounded body intake remains responsive while mutation effects stay serial. */
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";
import { OperationQueueAbortedError, OperationQueueFullError } from "../../src/platform/filesystem/bounded-operation-queue.js";
import {
  EditorMutationBodyCapacityError,
  EditorMutationIntake,
  MAX_EDITOR_RESERVED_BODY_BYTES_PER_DOMAIN,
} from "../../src/editor/editor-mutation-intake.js";
import { LARGE_JSON_BODY_LIMIT_BYTES, readJsonBody } from "../../src/editor/editor-json-body.js";
import { classifyEditorPostRoute } from "../../src/editor/editor-request-dispatcher.js";

function requestBody(contents?: string): { readonly request: IncomingMessage; readonly stream: PassThrough } {
  const stream = new PassThrough();
  if (contents !== undefined) stream.end(contents);
  return { request: stream as unknown as IncomingMessage, stream };
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("dispatcher classifies only known POST routes and preserves bodyless compatibility", () => {
  assert.deepEqual(classifyEditorPostRoute("/api/import"), {
    domain: "workspace", bodyLimitBytes: LARGE_JSON_BODY_LIMIT_BYTES, readsBody: true,
  });
  assert.deepEqual(classifyEditorPostRoute("/api/build"), {
    domain: "workspace", bodyLimitBytes: 0, readsBody: false,
  });
  assert.deepEqual(classifyEditorPostRoute("/api/relution/test"), {
    domain: "relution", bodyLimitBytes: 0, readsBody: false,
  });
  assert.equal(classifyEditorPostRoute("/api/state"), undefined);
  assert.equal(classifyEditorPostRoute("/api/unknown"), undefined);
});

test("a slow large upload does not delay a normal body and parsed bodies stay request-local", async () => {
  const intake = new EditorMutationIntake();
  const slow = requestBody();
  const normal = requestBody('{"kind":"normal"}');
  let normalFinished = false;
  const slowRun = intake.run(slow.request, LARGE_JSON_BODY_LIMIT_BYTES, true, async () => {
    assert.deepEqual(await readJsonBody(slow.request), { kind: "slow" });
    return "slow";
  });
  const normalRun = intake.run(normal.request, 1024 * 1024, true, async () => {
    assert.deepEqual(await readJsonBody(normal.request), { kind: "normal" });
    normalFinished = true;
    return "normal";
  });

  assert.equal(await normalRun, "normal");
  assert.equal(normalFinished, true);
  slow.stream.end('{"kind":"slow"}');
  assert.equal(await slowRun, "slow");
  await intake.close();
});

test("bodyless effects do not wait for or validate an unfinished request body", async () => {
  const intake = new EditorMutationIntake();
  const unfinished = requestBody();
  unfinished.stream.write("{malformed");
  assert.equal(await intake.run(unfinished.request, 0, false, () => "built"), "built");
  assert.equal(intake.pendingCount, 0);
  assert.equal(intake.reservedBodyBytes, 0);
  unfinished.stream.destroy();
  await intake.close();
});

test("effects are serial and cancellation only removes work that has not started", async () => {
  const intake = new EditorMutationIntake();
  const firstBody = requestBody("{}");
  const secondBody = requestBody("{}");
  const firstStarted = deferred();
  const releaseFirst = deferred();
  let secondStarted = false;
  const firstController = new AbortController();
  const first = intake.run(firstBody.request, 1024, true, async () => {
    firstStarted.resolve();
    await releaseFirst.promise;
    return "completed";
  }, { signal: firstController.signal });
  const controller = new AbortController();
  const second = intake.run(secondBody.request, 1024, true, () => { secondStarted = true; }, { signal: controller.signal });
  await firstStarted.promise;
  firstController.abort(new OperationQueueAbortedError("started effect must continue"));
  controller.abort(new OperationQueueAbortedError("cancel queued effect"));
  await assert.rejects(second, OperationQueueAbortedError);
  assert.equal(secondStarted, false);
  releaseFirst.resolve();
  assert.equal(await first, "completed");
  await intake.close();
});

test("cancellation interrupts an active slow body reader before effects start", async () => {
  const intake = new EditorMutationIntake();
  const slow = requestBody();
  const controller = new AbortController();
  let effectStarted = false;
  const run = intake.run(slow.request, 1024, true, () => { effectStarted = true; }, { signal: controller.signal });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort(new OperationQueueAbortedError("cancel active reader"));
  await assert.rejects(run, OperationQueueAbortedError);
  assert.equal(effectStarted, false);
  assert.equal(intake.pendingCount, 0);
  assert.equal(intake.reservedBodyBytes, 0);
  await intake.close();
});

test("admission enforces count and reserved-byte limits through execution", async () => {
  const countIntake = new EditorMutationIntake(2);
  const countBodies = [requestBody(), requestBody(), requestBody()];
  const first = countIntake.run(countBodies[0]!.request, 2, true, () => undefined);
  const second = countIntake.run(countBodies[1]!.request, 2, true, () => undefined);
  await assert.rejects(countIntake.run(countBodies[2]!.request, 2, true, () => undefined), OperationQueueFullError);
  assert.equal(countIntake.pendingCount, 2);
  countBodies[0]!.stream.end("{}");
  countBodies[1]!.stream.end("{}");
  await Promise.all([first, second]);
  await countIntake.close();

  const byteIntake = new EditorMutationIntake();
  const large = requestBody();
  const normal = requestBody();
  const excess = requestBody("{}");
  const largeRun = byteIntake.run(large.request, LARGE_JSON_BODY_LIMIT_BYTES, true, () => undefined);
  const normalRun = byteIntake.run(normal.request, 1024 * 1024, true, () => undefined);
  assert.equal(byteIntake.reservedBodyBytes, MAX_EDITOR_RESERVED_BODY_BYTES_PER_DOMAIN);
  await assert.rejects(byteIntake.run(excess.request, 1, true, () => undefined), EditorMutationBodyCapacityError);
  large.stream.end("{}");
  normal.stream.end("{}");
  await Promise.all([largeRun, normalRun]);
  await byteIntake.close();

  const heldIntake = new EditorMutationIntake();
  const heldBody = requestBody("{}");
  const heldEffect = deferred();
  const heldRun = heldIntake.run(heldBody.request, 4096, true, async () => await heldEffect.promise);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(heldIntake.pendingCount, 1);
  assert.equal(heldIntake.reservedBodyBytes, 4096);
  heldEffect.resolve();
  await heldRun;
  assert.equal(heldIntake.pendingCount, 0);
  assert.equal(heldIntake.reservedBodyBytes, 0);
  await heldIntake.close();
});

test("at most two request bodies are read concurrently per domain", async () => {
  const intake = new EditorMutationIntake();
  const bodies = [requestBody(), requestBody(), requestBody()];
  const runs = bodies.map(({ request }) => intake.run(request, 16, true, () => undefined));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(intake.pendingCount, 3);
  assert.equal(intake.activeBodyReaderCount, 2);
  bodies[0]!.stream.end("{}");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(intake.activeBodyReaderCount, 2);
  bodies[1]!.stream.end("{}");
  bodies[2]!.stream.end("{}");
  await Promise.all(runs);
  await intake.close();
});

test("malformed bodies release admission and shutdown terminates active readers", async () => {
  const intake = new EditorMutationIntake();
  const malformed = requestBody("{} trailing");
  let guardChecks = 0;
  let mutated = false;
  await assert.rejects(intake.run(malformed.request, 1024, true, async () => {
    guardChecks += 1;
    await readJsonBody(malformed.request);
    mutated = true;
  }), /Invalid JSON body/u);
  assert.equal(guardChecks, 1);
  assert.equal(mutated, false);
  assert.equal(intake.pendingCount, 0);
  assert.equal(intake.reservedBodyBytes, 0);

  const stalled = requestBody();
  const stalledRun = intake.run(stalled.request, 1024, true, () => undefined);
  await intake.close();
  await assert.rejects(stalledRun);
  assert.equal(stalled.request.destroyed, true);
  assert.equal(intake.pendingCount, 0);
});

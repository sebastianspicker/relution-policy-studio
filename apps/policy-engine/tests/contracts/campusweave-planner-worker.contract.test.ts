/** Pins the stdio planner client protocol (envelope, bounds, error kinds) against stub worker executables. */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CampusWeaveInputError, CampusWeavePlannerError } from "../../src/contracts/campusweave-errors.js";
import { runCampusWeavePlanner } from "../../src/integrations/campusweave/planner-worker.js";

const READ_ID = `request=$(cat)\nid=$(printf '%s' "$request" | sed -n 's/^{"version":1,"id":"\\([^"]*\\)".*/\\1/p')\n`;

function stub(body: string): { readonly options: { pythonExecutable: string; cwd: string }; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), "planner-stub-"));
  const script = join(dir, "worker.sh");
  writeFileSync(script, `#!/bin/sh\n${READ_ID}${body}\n`, { mode: 0o700 });
  chmodSync(script, 0o700);
  return { options: { pythonExecutable: script, cwd: dir }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function withStub<T>(body: string, run: (options: { pythonExecutable: string; cwd: string }) => Promise<T>): Promise<T> {
  const worker = stub(body);
  try {
    return await run(worker.options);
  } finally {
    worker.cleanup();
  }
}

function plannerError(kind: CampusWeavePlannerError["kind"], message: RegExp): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof CampusWeavePlannerError, `expected CampusWeavePlannerError, got ${String(error)}`);
    assert.equal(error.kind, kind);
    assert.match(error.message, message);
    return true;
  };
}

test("a well-formed worker response round-trips the result and echoes the request id", async () => {
  const result = await withStub(
    `printf '{"version":1,"id":"%s","ok":true,"result":{"echo":["reference"]}}\\n' "$id"`,
    (options) => runCampusWeavePlanner(options, "reference", {}),
  );
  assert.deepEqual(result, { echo: ["reference"] });
});

test("the worker receives one versioned request line carrying the command and profile payload", async () => {
  const result = await withStub(
    `printf '{"version":1,"id":"%s","ok":true,"result":{"request":%s}}\\n' "$id" "$request"`,
    (options) => runCampusWeavePlanner(options, "validate", { profile: { id: "p" } }),
  ) as { request: { version: number; id: string; command: string; payload: unknown } };
  assert.equal(result.request.version, 1);
  assert.match(result.request.id, /^[0-9a-f-]{36}$/u);
  assert.equal(result.request.command, "validate");
  assert.deepEqual(result.request.payload, { profile: { id: "p" } });
});

test("a response whose id does not echo the request id is an invalid envelope", async () => {
  await withStub(`printf '{"version":1,"id":"other","ok":true,"result":{}}\\n'`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /invalid response envelope/u)));
});

test("a wrong version or non-boolean ok is an invalid envelope", async () => {
  await withStub(`printf '{"version":2,"id":"%s","ok":true,"result":{}}\\n' "$id"`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /invalid response envelope/u)));
  await withStub(`printf '{"version":1,"id":"%s","ok":"yes","result":{}}\\n' "$id"`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /invalid response envelope/u)));
});

test("a successful envelope without result is unavailable", async () => {
  await withStub(`printf '{"version":1,"id":"%s","ok":true}\\n' "$id"`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /missing result/u)));
});

test("more than one output line is rejected as a protocol failure", async () => {
  await withStub(
    `printf '{"version":1,"id":"%s","ok":true,"result":{}}\\n{"version":1,"id":"%s","ok":true,"result":{}}\\n' "$id" "$id"`,
    (options) => assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /^CampusWeave planner failed$/u)),
  );
});

test("empty output includes the bounded stderr detail", async () => {
  await withStub(`echo 'worker exploded' >&2`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /failed: worker exploded/u)));
});

test("output beyond 1 MiB is capped", async () => {
  await withStub(`head -c 1100000 /dev/zero | tr '\\0' a`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /response exceeds 1 MiB/u)));
});

test("ok:false maps the worker error object or string to the rejected kind", async () => {
  await withStub(
    `printf '{"version":1,"id":"%s","ok":false,"error":{"code":"invalid_request","message":"bad profile","details":[]}}\\n' "$id"; exit 2`,
    (options) => assert.rejects(runCampusWeavePlanner(options, "validate", { profile: {} }), plannerError("rejected", /^bad profile$/u)),
  );
  await withStub(`printf '{"version":1,"id":"%s","ok":false,"error":"plain failure"}\\n' "$id"`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("rejected", /^plain failure$/u)));
  await withStub(`printf '{"version":1,"id":"%s","ok":false}\\n' "$id"`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("rejected", /rejected the request/u)));
});

test("a non-zero exit with ok:true is unavailable", async () => {
  await withStub(`printf '{"version":1,"id":"%s","ok":true,"result":{}}\\n' "$id"; exit 3`, (options) =>
    assert.rejects(runCampusWeavePlanner(options, "reference", {}), plannerError("unavailable", /exited with status 3/u)));
});

test("a worker that never answers times out", async () => {
  await withStub("exec sleep 5", (options) =>
    assert.rejects(runCampusWeavePlanner({ ...options, timeoutMs: 100 }, "reference", {}), plannerError("timeout", /timed out/u)));
});

test("a missing executable is unavailable", async () => {
  await assert.rejects(
    runCampusWeavePlanner({ pythonExecutable: join(tmpdir(), "does-not-exist-planner"), cwd: tmpdir() }, "reference", {}),
    plannerError("unavailable", /Failed to start CampusWeave planner/u),
  );
});

test("an oversized request is rejected before a worker starts", async () => {
  await assert.rejects(
    runCampusWeavePlanner({ pythonExecutable: "/bin/true", cwd: tmpdir() }, "validate", { profile: { blob: "x".repeat(1024 * 1024) } }),
    plannerError("capacity", /request exceeds 1 MiB/u),
  );
});

test("options must be absolute and within the timeout bounds", async () => {
  const absolute = { pythonExecutable: "/bin/true", cwd: tmpdir() };
  await assert.rejects(runCampusWeavePlanner({ ...absolute, pythonExecutable: "python3" }, "reference", {}), /pythonExecutable must be an absolute path/u);
  await assert.rejects(runCampusWeavePlanner({ ...absolute, pythonExecutable: " " }, "reference", {}), /pythonExecutable must be an absolute path/u);
  await assert.rejects(runCampusWeavePlanner({ ...absolute, cwd: "relative" }, "reference", {}), /cwd must be an absolute path/u);
  for (const timeoutMs of [99, 120_001, 1.5]) {
    await assert.rejects(runCampusWeavePlanner({ ...absolute, timeoutMs }, "reference", {}), /timeoutMs must be between 100 and 120000/u);
  }
});

test("commands and payload keys are validated before spawning", async () => {
  const options = { pythonExecutable: "/bin/true", cwd: tmpdir() };
  const input = (message: RegExp) => (error: unknown) => error instanceof CampusWeaveInputError && message.test(error.message);
  await assert.rejects(runCampusWeavePlanner(options, "reference", { profile: {} }), input(/reference payload must be empty/u));
  await assert.rejects(runCampusWeavePlanner(options, "validate", {}), input(/validate payload must contain only profile/u));
  await assert.rejects(runCampusWeavePlanner(options, "compile", { profile: {}, extra: 1 }), input(/compile payload must contain only profile/u));
  await assert.rejects(runCampusWeavePlanner(options, "convert-v1", { other: {} }), input(/convert-v1 payload must contain only profile/u));
  await assert.rejects(runCampusWeavePlanner(options, "execute" as never, {}), input(/Unsupported CampusWeave planner command: execute/u));
});

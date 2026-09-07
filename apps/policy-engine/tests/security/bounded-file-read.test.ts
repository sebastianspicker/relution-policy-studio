/** Covers capped real-file reads without mocking Node internals. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readBoundedRegularFileNoFollow } from "../../src/platform/filesystem/bounded-file-read.js";

test("bounded reads return real regular files and reject oversized inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-bounded-read-"));
  try {
    const input = join(root, "input.json");
    writeFileSync(input, "abc");
    assert.deepEqual(readBoundedRegularFileNoFollow(input, { label: "Input", maxBytes: 3 }), Buffer.from("abc"));
    assert.throws(() => readBoundedRegularFileNoFollow(input, { label: "Input", maxBytes: 2 }), /Input exceeds the 2 byte limit/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bounded reads reject symlinks and FIFOs without following or blocking", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-bounded-special-"));
  try {
    const target = join(root, "target.json");
    const link = join(root, "link.json");
    writeFileSync(target, "secret");
    symlinkSync(target, link);
    assert.throws(
      () => readBoundedRegularFileNoFollow(link, { label: "Input", maxBytes: 32 }),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ELOOP",
    );

    const fifo = join(root, "input.fifo");
    execFileSync("mkfifo", [fifo]);
    assert.throws(() => readBoundedRegularFileNoFollow(fifo, { label: "Input", maxBytes: 32 }), /must be a regular file/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

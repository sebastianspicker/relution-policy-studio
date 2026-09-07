/** Characterizes atomic writes for private files. */
import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { writePrivateFileAtomic } from "../../src/platform/filesystem/atomic-private-file.js";

test("writePrivateFileAtomic writes a private file in a private parent directory", () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-atomic-private-file-"));
  try {
    const output = join(root, "nested", "secret.bin");
    const resolvedOutput = writePrivateFileAtomic(output, Buffer.from("private data"), { force: false, label: "Secret output" });
    assert.ok(resolvedOutput.endsWith(output));
    assert.deepEqual(readFileSync(resolvedOutput), Buffer.from("private data"));
    assert.equal(lstatSync(resolvedOutput).mode & 0o777, 0o600);
    assert.equal(lstatSync(dirname(resolvedOutput)).mode & 0o777, 0o700);
    assert.deepEqual(readdirSync(dirname(resolvedOutput)), ["secret.bin"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writePrivateFileAtomic refuses an existing file unless force is set", () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-atomic-private-file-"));
  try {
    const output = join(root, "secret.bin");
    writeFileSync(output, "existing");
    assert.throws(
      () => writePrivateFileAtomic(output, Buffer.from("replacement"), { force: false, label: "Secret output" }),
      (error: Error) => {
        assert.equal((error as NodeJS.ErrnoException).code, "EEXIST");
        assert.match(error.message, /Secret output already exists/u);
        return true;
      },
    );
    assert.equal(readFileSync(output, "utf8"), "existing");
    assert.deepEqual(readdirSync(root), ["secret.bin"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writePrivateFileAtomic replaces an existing file when force is set", () => {
  const root = mkdtempSync(join(tmpdir(), "rexp-atomic-private-file-"));
  try {
    const output = join(root, "secret.bin");
    writeFileSync(output, "existing", { mode: 0o644 });
    const resolvedOutput = writePrivateFileAtomic(output, Buffer.from("replacement"), { force: true, label: "Secret output" });
    assert.ok(resolvedOutput.endsWith(output));
    assert.equal(readFileSync(resolvedOutput, "utf8"), "replacement");
    assert.equal(lstatSync(resolvedOutput).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(dirname(resolvedOutput)), ["secret.bin"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

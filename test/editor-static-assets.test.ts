import assert from "node:assert/strict";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";

const SERVER_READY_TIMEOUT_MS = 15_000;

type EditorChildProcess = ChildProcessByStdio<null, Readable, Readable>;

function launchEditorFromForeignCwd(args: string[]): EditorChildProcess {
  const foreignCwd = mkdtempSync(join(tmpdir(), "relution-editor-cwd-"));
  const cliPath = resolve("dist/src/cli.js");
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: foreignCwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
}

async function waitForServerUrl(child: EditorChildProcess): Promise<{ url: string; output: string }> {
  let output = "";
  let settled = false;

  return await new Promise<{ url: string; output: string }>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      rejectPromise(new Error(`Timed out waiting for editor server.\n${output}`));
    }, SERVER_READY_TIMEOUT_MS);

    const rejectWithError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    };

    const onData = (chunk: string): void => {
      output += chunk;
      const match = output.match(/Relution policy workbench: (http:\/\/[^\s]+\/)/u);
      if (match === null || match[1] === undefined || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ url: match[1], output });
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("error", (error) => {
      rejectWithError(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      rejectWithError(new Error(`Editor exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"}).\n${output}`));
    });
  });
}

test("editor serves the built dist-web assets referenced by index.html outside the repo cwd", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "relution-editor-"));
  const workspace = join(root, "workspace");
  const out = join(root, "out.rexp");
  const child = launchEditorFromForeignCwd(["serve", "--workspace", workspace, "--out", out, "--port", "0"]);

  t.after(() => {
    child.kill("SIGTERM");
  });

  const { url, output } = await waitForServerUrl(child);
  const indexResponse = await fetch(url);
  const indexHtml = await indexResponse.text();

  assert.equal(indexResponse.status, 200, output);
  const assetPaths = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)]
    .map((match) => match[1])
    .filter((match): match is string => typeof match === "string" && match.length > 0);
  assert.ok(assetPaths.length > 0, indexHtml);

  for (const assetPath of assetPaths) {
    const response = await fetch(new URL(assetPath, url));
    const body = await response.text();

    assert.equal(response.status, 200, `${assetPath}\n${body}`);
    assert.ok(body.length > 0, assetPath);
    if (assetPath.endsWith(".js")) {
      assert.match(response.headers.get("content-type") ?? "", /text\/javascript/u);
    }
    if (assetPath.endsWith(".css")) {
      assert.match(response.headers.get("content-type") ?? "", /text\/css/u);
    }
  }
});

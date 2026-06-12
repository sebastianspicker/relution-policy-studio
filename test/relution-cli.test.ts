import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { RelutionAssessmentReport } from "../src/relution-api.js";
import { runRelutionCliCommand } from "../src/relution-cli.js";

test("Relution CLI queries devices with environment credentials", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.RELUTION_BASE_URL;
  const originalToken = process.env.RELUTION_ACCESS_TOKEN;
  process.env.RELUTION_BASE_URL = "https://relution.example.test";
  process.env.RELUTION_ACCESS_TOKEN = "secret-token";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://relution.example.test/api/v2/devices/baseInfo/query");
    assert.equal((init?.headers as Record<string, string>)["X-User-Access-Token"], "secret-token");
    assert.match(String(init?.body), /"platform"/u);
    return new Response(JSON.stringify({
      nonpagedCount: 1,
      results: [{ uuid: "DEVICE-1", name: "Campus iPad", platform: "IOS", status: "COMPLIANT", policyStatus: "APPLIED" }],
    }));
  };
  try {
    const output = await captureStdout(() => runRelutionCliCommand({
      positionals: ["devices"],
      options: { platform: "IOS", json: true },
    }));
    const parsed = JSON.parse(output) as { count: number; devices: Array<{ name: string }> };
    assert.equal(parsed.count, 1);
    assert.equal(parsed.devices[0]?.name, "Campus iPad");
  } finally {
    restoreEnv("RELUTION_BASE_URL", originalBaseUrl);
    restoreEnv("RELUTION_ACCESS_TOKEN", originalToken);
    globalThis.fetch = originalFetch;
  }
});

test("Relution CLI test rejects malformed 200 connection responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "unauthorized" }));
  try {
    await assert.rejects(
      runRelutionCliCommand({
        positionals: ["test"],
        options: {
          host: "relution.example.test",
          token: "secret-token",
        },
      }),
      /Relution API connection failed: Relution connection test returned an unexpected device query response/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Relution CLI assessment writes local report files when workspace is provided", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    nonpagedCount: 1,
    results: [{ uuid: "DEVICE-1", name: "Dorm Android", platform: "ANDROID_ENTERPRISE", status: "COMPLIANT", policyStatus: "NONE" }],
  }));
  const workspace = mkdtempSync(join(tmpdir(), "relution-cli-report-"));
  try {
    const output = await captureStdout(() => runRelutionCliCommand({
      positionals: ["assess"],
      options: {
        host: "relution.example.test",
        token: "secret-token",
        workspace,
      },
    }));
    assert.match(output, /Issues: 1/u);
    assert.equal(existsSync(join(workspace, "reports")), true);
    const reportJsonPath = output.match(/^Report JSON: (?<path>.+)$/mu)?.groups?.path;
    assert.notEqual(reportJsonPath, undefined);
    const report = JSON.parse(readFileSync(reportJsonPath!, "utf8")) as RelutionAssessmentReport;
    const stdoutIssueCount = Number(output.match(/^Issues: (?<count>\d+)$/mu)?.groups?.count);
    const issueCount = report.devices.reduce((total, entry) => total + entry.issues.length, 0);

    assert.equal(report.devices[0]?.device.uuid, "DEVICE-1");
    assert.equal(report.summary.issue, stdoutIssueCount);
    assert.equal(issueCount, stdoutIssueCount);
    assert.equal(report.devices[0]?.issues.some((issue) => issue.id === "policy-status-not-applied"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Relution CLI assessment warns when device query results are truncated", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    nonpagedCount: 2,
    results: [{ uuid: "DEVICE-1", name: "Dorm Android", platform: "ANDROID_ENTERPRISE", status: "COMPLIANT", policyStatus: "APPLIED" }],
  }));
  try {
    const stderr = await captureStderr(() => runRelutionCliCommand({
      positionals: ["assess"],
      options: {
        host: "relution.example.test",
        token: "secret-token",
      },
    }));
    assert.match(stderr, /showing 1 of 2 enrolled devices; compliance results are incomplete/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function captureStderr(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let output = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;
  try {
    await run();
    return output;
  } finally {
    process.stderr.write = originalWrite;
  }
}

function restoreEnv(name: "RELUTION_BASE_URL" | "RELUTION_ACCESS_TOKEN", value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

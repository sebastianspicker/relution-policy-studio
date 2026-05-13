import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "../src/editor-server.js";
import { loadTemplateBundle } from "../src/templates.js";
import { createNewWorkspace, type PolicyWorkspace } from "../src/workspace.js";

test("compliance APIs report and apply an exact native BSI recommendation", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-compliance-native-"));
  const workspacePath = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  const workspace = createNewWorkspace({
    workspace: workspacePath,
    platform: "ANDROID_ENTERPRISE",
    name: "Compliance Native",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace: workspacePath,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const checkResponse = await fetch(new URL("api/compliance/check", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace,
        selection: { policyIndex: 0, versionIndex: 0 },
        sources: ["bsi"],
      }),
    });
    assert.equal(checkResponse.status, 200);
    const check = await checkResponse.json() as {
      report: {
        results: Array<{
          source: string;
          recommendationId: string;
          status: string;
          remediationOptions: Array<{ id: string }>;
        }>;
      };
    };

    const exactGap = check.report.results.find((entry) => entry.recommendationId === "android-enterprise-sys-3-2-4-a2");
    assert.ok(exactGap);
    assert.equal(exactGap.source, "bsi");
    assert.equal(exactGap.status, "exact-gap");
    assert.deepEqual(exactGap.remediationOptions.map((entry) => entry.id), [
      "native-bundle:bsi-android-enterprise-android-enterprise-advanced-security-overrides",
    ]);

    const applyResponse = await fetch(new URL("api/compliance/apply", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace,
        selection: { policyIndex: 0, versionIndex: 0 },
        sources: ["bsi"],
        source: "bsi",
        recommendationId: "android-enterprise-sys-3-2-4-a2",
        remediationId: "native-bundle:bsi-android-enterprise-android-enterprise-advanced-security-overrides",
      }),
    });
    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json() as {
      workspace: PolicyWorkspace;
      report: {
        results: Array<{ recommendationId: string; status: string }>;
      };
    };

    const configurations = selectedConfigurations(applied.workspace);
    assert.equal(
      configurations.some(
        (entry) =>
          entry.details?.type === "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES"
          && entry.details.developerSettings === "DEVELOPER_SETTINGS_DISABLED",
      ),
      true,
    );
    assert.equal(
      applied.report.results.some(
        (entry) => entry.recommendationId === "android-enterprise-sys-3-2-4-a2" && entry.status === "compliant",
      ),
      true,
    );
  } finally {
    await handle.close();
  }
});

test("compliance APIs report and apply an exact Apple schema CIS recommendation", async () => {
  const root = mkdtempSync(join(tmpdir(), "relution-compliance-apple-"));
  const workspacePath = join(root, "workspace");
  const out = join(root, "output.rexp");
  const bundle = loadTemplateBundle();
  const workspace = createNewWorkspace({
    workspace: workspacePath,
    platform: "IOS",
    name: "Compliance Apple",
    serverVersion: bundle.serverVersion,
  });

  const handle = await startEditorServer({
    workspace: workspacePath,
    key: "",
    out,
    host: "127.0.0.1",
    port: 0,
  });

  try {
    const checkResponse = await fetch(new URL("api/compliance/check", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace,
        selection: { policyIndex: 0, versionIndex: 0 },
        sources: ["cis"],
      }),
    });
    assert.equal(checkResponse.status, 200);
    const check = await checkResponse.json() as {
      report: {
        results: Array<{
          source: string;
          recommendationId: string;
          status: string;
          remediationOptions: Array<{ id: string }>;
        }>;
      };
    };

    const exactGap = check.report.results.find((entry) => entry.recommendationId === "cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-2");
    assert.ok(exactGap);
    assert.equal(exactGap.source, "cis");
    assert.equal(exactGap.status, "exact-gap");
    assert.deepEqual(exactGap.remediationOptions.map((entry) => entry.id), [
      "recommendation:cis:cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-2",
    ]);

    const applyResponse = await fetch(new URL("api/compliance/apply", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace,
        selection: { policyIndex: 0, versionIndex: 0 },
        sources: ["cis"],
        source: "cis",
        recommendationId: "cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-2",
        remediationId: "recommendation:cis:cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-2",
      }),
    });
    assert.equal(applyResponse.status, 200);
    const applied = await applyResponse.json() as {
      workspace: PolicyWorkspace;
      report: {
        results: Array<{ recommendationId: string; status: string }>;
      };
    };

    const configurations = selectedConfigurations(applied.workspace);
    assert.equal(
      configurations.some(
        (entry) =>
          entry.details?.type === "APPLE_MOBILECONFIG"
          && entry.details.secondLevelPayloadType === "com.apple.applicationaccess",
      ),
      true,
    );
    assert.equal(
      applied.report.results.some(
        (entry) => entry.recommendationId === "cis-apple-ios-17-ipados-17-intune-1-0-0-2-2-2" && entry.status === "compliant",
      ),
      true,
    );
  } finally {
    await handle.close();
  }
});

function selectedConfigurations(workspace: PolicyWorkspace): Array<{ details?: Record<string, unknown> }> {
  const policy = workspace.policies[0];
  const document = policy?.document as { versions?: Array<{ configurations?: Array<{ details?: Record<string, unknown> }> }> } | undefined;
  const version = document?.versions?.[0];
  return Array.isArray(version?.configurations) ? version.configurations : [];
}

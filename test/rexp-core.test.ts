import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { createAppleCompatReport } from "../src/apple-compat.js";
import { createRelutionAuditReport, writeAuditOutputs } from "../src/audit.js";
import { inspectMobileConfigText } from "../src/plist.js";
import { encryptRelutionPayload, extractRexp, inspectRexp, packPlainDirectory, verifyRexp } from "../src/rexp.js";
import { loadEditorSidecar, recordMobileConfigRestoreEntries, reconcileMobileConfigRestoreEntries } from "../src/sidecar.js";
import { findTemplate, loadTemplateBundle } from "../src/templates.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addConfigurationToWorkspace,
  addPolicyToWorkspace,
  createNewWorkspace,
  loadWorkspace,
  moveConfigurationInWorkspace,
  removeConfigurationFromWorkspace,
  validateWorkspace,
} from "../src/workspace.js";
import { readZip, writeZip } from "../src/zip.js";
import {
  assertReportContainsPolicy,
  configurationTypes,
  deterministicRandomBytes,
  fixture,
  password,
  requirePolicyPath,
  type RelutionTemplateAuditShape,
} from "./rexp-helpers.js";

test("decrypts the provided Relution policy export", () => {
  const result = inspectRexp(fixture, password);

  assert.equal(result.policyEntries.length, 1);
  assert.equal(result.policies?.length, 1);
  assert.equal(result.policies?.[0]?.uuid, "11111111-2222-4333-8444-555555555555");
  assert.equal(result.policies?.[0]?.name, "Example iOS Policy");
  assert.equal(result.policies?.[0]?.platform, "IOS");
  assert.equal(result.policies?.[0]?.hashMatches, true);
});

test("rejects an incorrect encryption key", () => {
  assert.throws(() => inspectRexp(fixture, "wrong-password"), /authenticate|Unsupported state|bad decrypt/i);
});

test("round-trips extracted policy exports into a verifiable rexp archive", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-rexp-"));
  const extracted = join(root, "extracted");
  const rebuilt = join(root, "roundtrip.rexp");

  extractRexp(fixture, extracted, password);
  packPlainDirectory(extracted, rebuilt, password, {
    randomBytes: deterministicRandomBytes(),
  });

  const verification = verifyRexp(rebuilt, password);
  assert.equal(verification.ok, true);

  const zipEntries = readZip(readFileSync(rebuilt)).map((entry) => entry.name);
  assert.deepEqual(zipEntries, [
    "policies/policy_11111111-2222-4333-8444-555555555555.json",
    "metadata.json",
    "report.json",
    "metadata.bin",
  ]);
});

test("readZip rejects archives whose aggregate inflated size exceeds the configured limit", () => {
  const archive = writeZip([
    { name: "entry-1.json", data: Buffer.alloc(4, "a") },
    { name: "entry-2.json", data: Buffer.alloc(4, "b") },
    { name: "entry-3.json", data: Buffer.alloc(4, "c") },
    { name: "entry-4.json", data: Buffer.alloc(4, "d") },
  ]);

  assert.throws(
    () => readZip(archive, { maxTotalUncompressedBytes: 12 }),
    /uncompressed data exceeds the supported size limit/u,
  );
});

test("packPlainDirectory rejects symlinked managed input paths", () => {
  const scenarios = [
    {
      name: "metadata",
      link: (workspace: string, outsideFile: string) => {
        rmSync(join(workspace, "metadata.json"));
        symlinkSync(outsideFile, join(workspace, "metadata.json"));
      },
    },
    {
      name: "report",
      link: (workspace: string, outsideFile: string) => {
        rmSync(join(workspace, "report.json"));
        symlinkSync(outsideFile, join(workspace, "report.json"));
      },
    },
    {
      name: "policies-directory",
      link: (workspace: string, outsideFile: string) => {
        const outsidePolicies = join(outsideFile, "..", "outside-policies");
        mkdirSync(outsidePolicies, { recursive: true });
        writeFileSync(join(outsidePolicies, "policy_SECRET.json"), '{"uuid":"SECRET","versions":[]}\n');
        rmSync(join(workspace, "policies"), { recursive: true });
        symlinkSync(outsidePolicies, join(workspace, "policies"));
      },
    },
    {
      name: "policy-file",
      link: (workspace: string, outsideFile: string) => {
        rmSync(join(workspace, "policies", "policy_LOCAL.json"));
        symlinkSync(outsideFile, join(workspace, "policies", "policy_LOCAL.json"));
      },
    },
  ] as const;

  for (const scenario of scenarios) {
    const root = mkdtempSync(join(tmpdir(), `relution-pack-symlink-${scenario.name}-`));
    const workspace = join(root, "workspace");
    const outsideFile = join(root, "outside.json");
    mkdirSync(join(workspace, "policies"), { recursive: true });
    writeFileSync(join(workspace, "metadata.json"), '{"version":1}\n');
    writeFileSync(join(workspace, "report.json"), '{"policiesToExport":[],"exportedPolicies":{},"failedPolicies":{}}\n');
    writeFileSync(join(workspace, "policies", "policy_LOCAL.json"), '{"uuid":"LOCAL","versions":[]}\n');
    writeFileSync(outsideFile, '{"uuid":"SECRET","versions":[]}\n');

    scenario.link(workspace, outsideFile);

    assert.throws(
      () => packPlainDirectory(workspace, join(root, "out.rexp"), password),
      /Project path must not use symlinks/u,
      scenario.name,
    );
  }
});

test("extractRexp rejects policy entries that escape the output root", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-rexp-traversal-"));
  const archive = join(root, "malicious.rexp");
  const outputDir = join(root, "extracted");
  const escapedPath = resolve(outputDir, "../outside.json");
  const maliciousEntries = writeZip([
    {
      name: "policies/policy_../../outside.json",
      data: encryptRelutionPayload(Buffer.from('{"uuid":"MALICIOUS"}\n', "utf8"), password, deterministicRandomBytes()),
    },
    { name: "metadata.json", data: Buffer.from('{"version":1}\n', "utf8") },
    { name: "report.json", data: Buffer.from('{"policiesToExport":[],"exportedPolicies":{},"failedPolicies":{}}\n', "utf8") },
    {
      name: "metadata.bin",
      data: encryptRelutionPayload(
        Buffer.from(
          JSON.stringify({
            "metadata.json": "hash",
            "report.json": "hash",
            "policies/policy_../../outside.json": "hash",
          }),
          "utf8",
        ),
        password,
        deterministicRandomBytes(),
      ),
    },
  ]);
  writeFileSync(archive, maliciousEntries);

  assert.throws(() => extractRexp(archive, outputDir, password), /outside extraction root/i);
  assert.equal(existsSync(escapedPath), false);
});

test("extractRexp with force removes stale managed files before writing extracted content", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-rexp-force-clean-"));
  const extracted = join(root, "extracted");
  const rebuilt = join(root, "roundtrip.rexp");
  const stalePolicyPath = join(extracted, "policies", "policy_STALE.json");
  const unrelatedPath = join(extracted, "notes.txt");

  mkdirSync(join(extracted, "policies"), { recursive: true });
  writeFileSync(stalePolicyPath, '{"uuid":"STALE"}\n');
  writeFileSync(join(extracted, "metadata.json"), '{"tampered":true}\n');
  writeFileSync(join(extracted, "report.json"), '{"tampered":true}\n');
  writeFileSync(join(extracted, "metadata.hashes.json"), '{"tampered":true}\n');
  writeFileSync(unrelatedPath, "keep me\n");

  extractRexp(fixture, extracted, password, { force: true, pretty: true });
  packPlainDirectory(extracted, rebuilt, password, {
    randomBytes: deterministicRandomBytes(),
  });

  const inspection = inspectRexp(rebuilt, password);
  assert.equal(inspection.policyEntries.includes("policies/policy_STALE.json"), false);
  assert.equal(existsSync(stalePolicyPath), false);
  assert.equal(readFileSync(unrelatedPath, "utf8"), "keep me\n");
});

test("verification fails when metadata or report hashes do not match", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-rexp-hash-check-"));
  const extracted = join(root, "extracted");
  const rebuilt = join(root, "roundtrip.rexp");
  const tampered = join(root, "tampered.rexp");

  extractRexp(fixture, extracted, password);
  packPlainDirectory(extracted, rebuilt, password, {
    randomBytes: deterministicRandomBytes(),
  });

  const tamperedEntries = readZip(readFileSync(rebuilt)).map((entry) => ({
    name: entry.name,
    data:
      entry.name === "metadata.json"
        ? Buffer.from('{"tampered":true}\n', "utf8")
        : entry.name === "report.json"
        ? Buffer.from('{"tampered":true}\n', "utf8")
        : entry.data,
  }));
  writeFileSync(tampered, writeZip(tamperedEntries));

  const verification = verifyRexp(tampered, password);
  assert.equal(verification.ok, false);
  assert.equal(verification.checkedEntries.some((entry) => entry.path === "metadata.json" && entry.hashMatches === false), true);
  assert.equal(verification.checkedEntries.some((entry) => entry.path === "report.json" && entry.hashMatches === false), true);
});

test("extractRexp rejects archives with tampered cleartext entries", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-rexp-extract-hash-check-"));
  const extracted = join(root, "extracted");
  const rebuilt = join(root, "roundtrip.rexp");
  const tampered = join(root, "tampered.rexp");
  const tamperedOutput = join(root, "tampered-output");

  extractRexp(fixture, extracted, password);
  packPlainDirectory(extracted, rebuilt, password, {
    randomBytes: deterministicRandomBytes(),
  });

  const tamperedEntries = readZip(readFileSync(rebuilt)).map((entry) => ({
    name: entry.name,
    data: entry.name === "metadata.json" ? Buffer.from('{"tampered":true}\n', "utf8") : entry.data,
  }));
  writeFileSync(tampered, writeZip(tamperedEntries));

  assert.throws(() => extractRexp(tampered, tamperedOutput, password), /hash mismatch/i);
  assert.equal(existsSync(join(tamperedOutput, "metadata.json")), false);
});

test("loads templates harvested from Relution Server 26.1.1", () => {
  const bundle = loadTemplateBundle();

  assert.equal(bundle.serverVersion, "26.1.1");
  assert.equal(bundle.configurationTypes.length, 201);
  assert.equal(Object.keys(bundle.schemas).length, 2067);
  assert.equal(typeof bundle.springConfigurationMetadata, "object");
  assert.deepEqual(bundle.platforms, [
    "UNKNOWN",
    "ANDROID",
    "ANDROID_ENTERPRISE",
    "IOS",
    "TVOS",
    "MACOS",
    "VISIONOS",
    "WATCHOS",
    "WINDOWS",
    "CHROMEOS",
    "LINUX",
    "EDGEROUTER",
    "BLENODE",
    "ASSET",
    "BEACON",
    "KNX",
    "BACNET",
    "VIRTUAL",
    "LORAWAN",
  ]);

  const iosRestriction = findTemplate(bundle, "IOS_RESTRICTION");
  assert.equal(iosRestriction?.schemaName, "IosRestrictionConfiguration");
  assert.equal(iosRestriction?.label, "iOS Restriction");
  assert.equal(iosRestriction?.platforms.includes("IOS"), true);
  const smartReplies = iosRestriction?.fields.find((field) => field.path === "allowMailSmartReplies");
  assert.equal(smartReplies?.label, "Allow Mail Smart Replies");
  assert.equal(smartReplies?.descriptionSource, "openapi");

  const windowsWifi = findTemplate(bundle, "WINDOWS_WIFI");
  assert.equal(windowsWifi?.label, "Windows Wi-Fi");
  assert.equal(windowsWifi?.fields.find((field) => field.path === "certificate.uuid")?.label, "Certificate UUID");

  const systemUpdate = findTemplate(bundle, "ANDROID_ENTERPRISE_SYSTEM_UPDATE");
  const updateType = systemUpdate?.fields.find((field) => field.path === "systemUpdateType");
  assert.equal(updateType?.enumLabels.SYSTEM_UPDATE_TYPE_UNSPECIFIED, "System Update Type Unspecified");
});

test("templates expose friendly labels for every configuration and field", () => {
  const bundle = loadTemplateBundle();
  const allFields = bundle.configurationTypes.flatMap((template) => template.fields);

  assert.equal(bundle.configurationTypes.every((template) => template.label.trim().length > 0), true);
  assert.equal(allFields.every((field) => field.label.trim().length > 0), true);
  assert.equal(allFields.every((field) => field.enumValues.every((value) => (field.enumLabels[value] ?? "").trim().length > 0)), true);
});

test("creates and validates a local policy workspace from templates", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-workspace-"));

  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Local iOS Test",
    serverVersion: bundle.serverVersion,
  });
  const policyPath = requirePolicyPath(workspace);
  const updated = addConfigurationToWorkspace(root, bundle, {
    policyPath,
    versionIndex: 0,
    type: "IOS_RESTRICTION",
  });

  const validation = validateWorkspace(updated, bundle);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("adds new policies by platform to an existing workspace", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-policy-create-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Initial iOS",
    serverVersion: bundle.serverVersion,
  });

  const windows = addPolicyToWorkspace(root, bundle, { platform: "WINDOWS", name: "Local Windows" });
  const chromeOs = addPolicyToWorkspace(root, bundle, { platform: "CHROMEOS", name: "Local ChromeOS" });
  const loaded = loadWorkspace(root);

  assert.equal(workspace.policies.length, 1);
  assert.equal(loaded.policies.length, 3);
  assert.equal(loaded.policies.some((policy) => policy.path === windows.policyPath), true);
  assert.equal(loaded.policies.some((policy) => policy.path === chromeOs.policyPath), true);
  assert.equal(validateWorkspace(loaded, bundle).ok, true);
  assertReportContainsPolicy(loaded, windows.policyPath, "Local Windows");
  assertReportContainsPolicy(loaded, chromeOs.policyPath, "Local ChromeOS");
});

test("rejects invalid policy creation input", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-policy-invalid-"));
  createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Initial iOS",
    serverVersion: bundle.serverVersion,
  });

  assert.throws(() => addPolicyToWorkspace(root, bundle, { platform: "UNKNOWN", name: "Bad" }), /Unsupported policy platform/);
  assert.throws(() => addPolicyToWorkspace(root, bundle, { platform: "WINDOWS", name: "  " }), /must not be empty/);
});

test("moves and removes profile configurations in local workspaces", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-config-actions-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Config Actions",
    serverVersion: bundle.serverVersion,
  });
  const policyPath = requirePolicyPath(workspace);
  addConfigurationToWorkspace(root, bundle, { policyPath, versionIndex: 0, type: "IOS_RESTRICTION" });
  addConfigurationToWorkspace(root, bundle, { policyPath, versionIndex: 0, type: "IOS_AIRPLAY" });
  addAppleCompatConfigurationToWorkspace(root, { policyPath, versionIndex: 0, settingId: "associated-domains" });

  const movedUp = moveConfigurationInWorkspace(root, {
    policyPath,
    versionIndex: 0,
    configurationIndex: 2,
    direction: "up",
  });
  assert.deepEqual(configurationTypes(movedUp), ["IOS_RESTRICTION", "APPLE_MOBILECONFIG", "IOS_AIRPLAY"]);

  const movedDown = moveConfigurationInWorkspace(root, {
    policyPath,
    versionIndex: 0,
    configurationIndex: 1,
    direction: "down",
  });
  assert.deepEqual(configurationTypes(movedDown), ["IOS_RESTRICTION", "IOS_AIRPLAY", "APPLE_MOBILECONFIG"]);

  const removed = removeConfigurationFromWorkspace(root, {
    policyPath,
    versionIndex: 0,
    configurationIndex: 1,
  });
  assert.deepEqual(configurationTypes(removed), ["IOS_RESTRICTION", "APPLE_MOBILECONFIG"]);
  assert.equal(validateWorkspace(removed, bundle).ok, true);
});

test("reconciles multiple mobileconfig restore entries with the same payload type", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-sidecar-restore-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Sidecar Restore Test",
    serverVersion: bundle.serverVersion,
  });
  const policyPath = requirePolicyPath(workspace);
  addAppleCompatConfigurationToWorkspace(root, { policyPath, versionIndex: 0, settingId: "associated-domains" });
  addAppleCompatConfigurationToWorkspace(root, { policyPath, versionIndex: 0, settingId: "associated-domains" });

  const saved = loadWorkspace(root);
  const sidecar = recordMobileConfigRestoreEntries(root, saved);
  const stripped = structuredClone(saved) as typeof saved;
  const firstPolicy = stripped.policies[0];
  assert.notEqual(firstPolicy, undefined);
  if (firstPolicy !== undefined && Array.isArray(firstPolicy.document.versions)) {
    const firstVersion = firstPolicy.document.versions[0] as Record<string, unknown> | undefined;
    if (firstVersion !== undefined) {
      firstVersion.configurations = [];
    }
  }

  const reconciled = reconcileMobileConfigRestoreEntries(stripped, sidecar);
  assert.equal(configurationTypes(reconciled).filter((type) => type === "APPLE_MOBILECONFIG").length, 2);
});

test("reconciles mobileconfig restore entries back into the original version", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-sidecar-version-restore-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Multi Version Restore Test",
    serverVersion: bundle.serverVersion,
  });
  const policyPath = requirePolicyPath(workspace);
  addAppleCompatConfigurationToWorkspace(root, { policyPath, versionIndex: 0, settingId: "associated-domains" });

  const saved = loadWorkspace(root);
  const policy = saved.policies[0];
  assert.notEqual(policy, undefined);
  const firstVersion = Array.isArray(policy?.document.versions) ? policy.document.versions[0] : undefined;
  assert.equal(typeof firstVersion, "object");
  assert.notEqual(firstVersion, null);
  if (policy !== undefined && Array.isArray(policy.document.versions) && firstVersion !== undefined && typeof firstVersion === "object" && firstVersion !== null && !Array.isArray(firstVersion)) {
    const clonedVersion = structuredClone(firstVersion) as Record<string, unknown>;
    clonedVersion.uuid = "SECOND-VERSION-UUID";
    clonedVersion.version = 2;
    clonedVersion.name = "Version 2";
    policy.document.versions.push(clonedVersion);
    const secondVersion = policy.document.versions[1] as Record<string, unknown>;
    secondVersion.configurations = (firstVersion as Record<string, unknown>).configurations;
    (firstVersion as Record<string, unknown>).configurations = [];
  }
  writeFileSync(join(root, policyPath), `${JSON.stringify(policy?.document, null, 2)}\n`);

  const versionedWorkspace = loadWorkspace(root);
  const sidecar = recordMobileConfigRestoreEntries(root, versionedWorkspace);
  const stripped = structuredClone(versionedWorkspace) as typeof versionedWorkspace;
  const strippedPolicy = stripped.policies[0];
  const strippedSecondVersion =
    Array.isArray(strippedPolicy?.document.versions) ? strippedPolicy.document.versions[1] as Record<string, unknown> | undefined : undefined;
  if (strippedSecondVersion !== undefined) {
    strippedSecondVersion.configurations = [];
  }

  const reconciled = reconcileMobileConfigRestoreEntries(stripped, sidecar);
  const reconciledPolicy = reconciled.policies[0];
  const reconciledFirstVersion =
    Array.isArray(reconciledPolicy?.document.versions) ? reconciledPolicy.document.versions[0] as Record<string, unknown> | undefined : undefined;
  const reconciledSecondVersion =
    Array.isArray(reconciledPolicy?.document.versions) ? reconciledPolicy.document.versions[1] as Record<string, unknown> | undefined : undefined;
  assert.equal(Array.isArray(reconciledFirstVersion?.configurations) ? reconciledFirstVersion.configurations.length : 0, 0);
  assert.equal(Array.isArray(reconciledSecondVersion?.configurations) ? reconciledSecondVersion.configurations.length : 1, 1);
});

test("marks arbitrary non-XML mobileconfig text as signed-invalid", () => {
  const inspection = inspectMobileConfigText("this is not xml");

  assert.equal(inspection.signatureState, "signed-invalid");
});

test("rejects ZIP entries that exceed the supported uncompressed size", () => {
  const oversized = Buffer.alloc(17 * 1024 * 1024, 0x41);
  const archive = writeZip([{ name: "too-large.json", data: oversized }]);

  assert.throws(() => readZip(archive), /exceeds the supported size/i);
});

test("drops malformed mobileconfig restore entries when loading sidecar state", () => {
  const root = mkdtempSync(join(tmpdir(), "relution-sidecar-malformed-"));
  writeFileSync(
    join(root, "editor-sidecar.json"),
    `${JSON.stringify({
      version: 1,
      mobileConfigRestore: [{ policyPath: "policies/policy_TEST.json", configuration: {}, configurationUuid: 42 }],
      ddmArtifacts: [],
      mdmCommandArtifacts: [],
      customManifests: [],
    }, null, 2)}\n`,
  );

  const sidecar = loadEditorSidecar(root);
  assert.deepEqual(sidecar.mobileConfigRestore, []);
});

test("validates the provided Relution export with local compatibility rules", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-sample-validation-"));

  extractRexp(fixture, root, password, { force: true, pretty: true });
  const validation = validateWorkspace(loadWorkspace(root), bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("audits every template through local mock rexp roundtrip", () => {
  const bundle = loadTemplateBundle();
  const report = createRelutionAuditReport({ bundle, key: password, sampleRexp: fixture });

  assert.equal(report.summary.platformCount, 19);
  assert.equal(report.summary.configurationTypeCount, 201);
  assert.equal(report.summary.schemaCount, 2067);
  assert.equal(report.summary.springPropertyCount, 491);
  assert.equal(report.summary.mockRoundtripPassed, 201);
  assert.equal(report.summary.mockRoundtripFailed, 0);
  assert.equal(report.sampleExport?.validationOk, true);
  assert.equal(report.sampleExport?.verifyOk, true);
  assert.equal(report.schemaCompatibilityIssues.length, 24);
  assert.equal(report.schemaCompatibilityIssues.some((issue) => issue.pattern.includes("IsAlphabetic")), true);
});

test("writes machine-readable and markdown audit reports", () => {
  const bundle = loadTemplateBundle();
  const report = createRelutionAuditReport({ bundle, key: password, sampleRexp: fixture });
  const root = mkdtempSync(join(tmpdir(), "relution-audit-output-"));
  const jsonOut = join(root, "audit-report.json");
  const markdownOut = join(root, "AUDIT.md");

  writeAuditOutputs(report, { jsonOut, markdownOut });

  assert.equal(existsSync(jsonOut), true);
  assert.equal(existsSync(markdownOut), true);
  const parsed = JSON.parse(readFileSync(jsonOut, "utf8")) as RelutionTemplateAuditShape;
  assert.equal(parsed.configurationTypes.length, 201);
  assert.equal(parsed.configurationTypes.some((entry) => entry.fields.length > 0), true);
  assert.match(readFileSync(markdownOut, "utf8"), /Mock roundtrip: 201 passed, 0 failed/);
});

test("reports Jamf Apple gaps that can be wired through Relution mobileconfig", () => {
  const bundle = loadTemplateBundle();
  const report = createAppleCompatReport(bundle);
  const expectedMobileconfigIds = [
    "acme-certificate",
    "associated-domains",
    "autonomous-single-app-mode",
    "cellular-private-network",
    "certificate-preference",
    "certificate-revocation",
    "certificate-transparency",
    "exchange-web-services",
    "identity-preference",
    "lights-out-management",
    "lock-screen-message",
    "managed-login-items",
    "managed-preferences",
    "network-relay",
    "network-usage-rules",
    "pppc",
    "printing",
    "smart-card",
    "system-migration",
    "tv-remote",
    "xsan",
    "xsan-preferences",
  ];
  const mobileconfigIds = report.settings
    .filter((setting) => setting.status === "mobileconfig-backed")
    .map((setting) => setting.id)
    .sort();

  assert.equal(report.summary.relutionHasMobileconfigTransport, true);
  assert.equal(report.summary.totalJamfGapSettings, expectedMobileconfigIds.length + 1);
  assert.equal(report.summary.mobileconfigBacked, expectedMobileconfigIds.length);
  assert.equal(report.summary.notMobileconfigWireable, 1);
  assert.equal("relutionServerPolicyExportIncludesMobileconfig" in report.summary, false);
  assert.equal(report.summary.relutionMobileconfigPlatforms.includes("IOS"), true);
  assert.equal(report.summary.relutionMobileconfigPlatforms.includes("MACOS"), true);
  assert.deepEqual(mobileconfigIds, [...expectedMobileconfigIds].sort());
  assert.equal(report.settings.some((setting) => setting.id === "pppc" && setting.payloadType === "com.apple.TCC.configuration-profile-policy"), true);
  assert.equal(report.settings.some((setting) => setting.id === "declarative-management-declarations" && setting.status === "not-mobileconfig-wireable"), true);
});

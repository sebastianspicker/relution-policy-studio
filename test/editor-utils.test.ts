import assert from "node:assert/strict";
import test from "node:test";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { loadTemplateBundle } from "../src/templates.js";
import { groupConfigurationOptions, optionMatches, type ConfigurationOption } from "../web/src/editor/AddConfigurationControl.js";
import { readJsonResponse } from "../web/src/editor/editor-utils.js";
import { mergeSettingDetails, parseSettingDetailsJson } from "../web/src/editor/json-template-import.js";
import { policyMatches } from "../web/src/editor/PolicyNavigator.js";
import { importRulesetWorkspace } from "../web/src/editor/ruleset-import.js";
import { duplicatePolicy, recordPolicyInReport, removePolicyFromReport, updateReportPolicyName } from "../web/src/editor/workspace-mutations.js";

function sequentialUuid(): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `UUID-${index}`;
  };
}

test("reports HTML responses when the editor API is missing", async () => {
  const response = new Response("<!doctype html><title>Vite preview</title>", {
    headers: { "content-type": "text/html" },
    status: 200,
  });

  await assert.rejects(readJsonResponse(response), /Expected JSON.*doctype html/u);
});

test("filters configuration options by group and search text", () => {
  const option: ConfigurationOption = {
    group: "apple-profile",
    value: "apple-profile:profile:com.apple.wifi.managed",
    label: "Wi-Fi",
    meta: "com.apple.wifi.managed",
  };

  assert.equal(optionMatches(option, "wifi", "all"), true);
  assert.equal(optionMatches(option, "com.apple", "apple-profile"), true);
  assert.equal(optionMatches(option, "vpn", "all"), false);
  assert.equal(optionMatches(option, "wifi", "native"), false);
});

test("groups matching configuration options by source", () => {
  const options: ConfigurationOption[] = [
    { group: "apple-profile", value: "apple-profile:profile:com.apple.wifi.managed", label: "Wi-Fi", meta: "com.apple.wifi.managed" },
    { group: "native", value: "native:PASSCODE", label: "Passcode", meta: "PASSCODE" },
    { group: "apple-compat", value: "apple-compat:login-window", label: "Login Window *", meta: "com.apple.loginwindow" },
  ];

  const groups = groupConfigurationOptions(options);

  assert.deepEqual(groups.map((group) => group.label), ["Relution native", "Apple mobileconfig gaps", "Apple schema profiles"]);
  assert.deepEqual(groups.map((group) => group.options.map((option) => option.value)), [
    ["native:PASSCODE"],
    ["apple-compat:login-window"],
    ["apple-profile:profile:com.apple.wifi.managed"],
  ]);
});

test("filters policies by name, platform, and path", () => {
  const policy = {
    path: "policies/policy_ABC.json",
    document: { name: "Campus iOS Baseline", platform: "IOS" },
  };

  assert.equal(policyMatches(policy, "campus"), true);
  assert.equal(policyMatches(policy, "ios"), true);
  assert.equal(policyMatches(policy, "policy_ABC"), true);
  assert.equal(policyMatches(policy, "windows"), false);
});

test("parses and merges selected setting JSON imports", () => {
  assert.deepEqual(parseSettingDetailsJson('{"details":{"type":"IOS_RESTRICTION","allowCamera":false}}'), {
    type: "IOS_RESTRICTION",
    allowCamera: false,
  });
  assert.deepEqual(parseSettingDetailsJson('{"type":"APPLE_MOBILECONFIG","displayName":"Login Window"}'), {
    type: "APPLE_MOBILECONFIG",
    displayName: "Login Window",
  });
  assert.deepEqual(
    mergeSettingDetails(
      { uuid: "KEEP", type: "IOS_RESTRICTION", nested: { uuid: "NESTED", enabled: true }, allowCamera: true },
      { uuid: "DROP", nested: { uuid: "DROP2", extra: 1 }, allowCamera: false },
    ),
    { uuid: "KEEP", type: "IOS_RESTRICTION", nested: { uuid: "NESTED", enabled: true, extra: 1 }, allowCamera: false },
  );
  assert.throws(() => parseSettingDetailsJson("[]"), /one object/u);
  assert.throws(() => parseSettingDetailsJson('{"displayName":"Missing type"}'), /details\.type or top-level type/u);
  assert.throws(
    () => mergeSettingDetails({ type: "IOS_RESTRICTION", allowCamera: true }, { type: "IOS_PASSCODE", minLength: 8 }),
    /selected setting type IOS_RESTRICTION/u,
  );
});

test("imports built-in and explicit ruleset mappings into a workspace", () => {
  const result = importRulesetWorkspace(
    {
      version: 1,
      name: "BSI",
      policies: [{
        platform: "IOS",
        name: "iOS Baseline",
        rules: [
          { id: "bsi-ios-disable-camera", title: "Disable camera" },
          { id: "explicit-associated-domains", title: "Associated domains", mappings: [{ kind: "apple-mobileconfig", payloadType: "com.apple.associated-domains", values: {} }] },
        ],
      }],
    },
    loadTemplateBundle(),
    loadAppleSchemaCatalog(),
    { now: 1234, uuidFactory: sequentialUuid() },
  );
  const versions = result.workspace?.policies[0]?.document.versions as Array<{ configurations?: Array<{ details?: Record<string, unknown> }> }> | undefined;
  const details = versions?.[0]?.configurations?.map((configuration) => configuration.details);

  assert.equal(result.report.conflicts.length, 0);
  assert.equal(result.report.unresolved.length, 0);
  assert.equal(result.report.applied.length, 2);
  assert.equal(result.workspace?.policies[0]?.document.name, "iOS Baseline");
  assert.equal(details?.[0]?.type, "IOS_RESTRICTION");
  assert.equal(details?.[0]?.allowCamera, false);
  assert.equal(details?.[1]?.type, "APPLE_MOBILECONFIG");
});

test("blocks ruleset import on unresolved rules and single-config conflicts", () => {
  const bundle = loadTemplateBundle();
  const catalog = loadAppleSchemaCatalog();
  const unresolved = importRulesetWorkspace(
    { version: 1, name: "BSI", policies: [{ platform: "IOS", name: "iOS Baseline", rules: [{ id: "camera-restriction", title: "Camera restriction" }] }] },
    bundle,
    catalog,
  );
  const conflict = importRulesetWorkspace(
    {
      version: 1,
      name: "BSI",
      policies: [{
        platform: "IOS",
        name: "iOS Baseline",
        rules: [
          { id: "first", title: "First", mappings: [{ kind: "relution-native", type: "IOS_RESTRICTION", values: {} }] },
          { id: "second", title: "Second", mappings: [{ kind: "relution-native", type: "IOS_RESTRICTION", values: {} }] },
        ],
      }],
    },
    bundle,
    catalog,
  );

  assert.equal(unresolved.workspace, undefined);
  assert.equal(unresolved.report.unresolved.length, 1);
  assert.equal(unresolved.report.unresolved[0]?.suggestions.includes("relution-native:IOS_RESTRICTION"), true);
  assert.equal(conflict.workspace, undefined);
  assert.equal(conflict.report.conflicts.length, 1);
});

test("updates report entries when policies are renamed, duplicated, and removed", () => {
  const report: Record<string, unknown> = { policiesToExport: ["POLICY-1"], exportedPolicies: { "POLICY-1": { policyName: "Original" } } };
  const policy = {
    path: "policies/policy_POLICY-1.json",
    document: {
      uuid: "POLICY-1",
      name: "Original",
      versions: [{ uuid: "VERSION-1", configurations: [{ uuid: "CONFIG-1", details: { uuid: "DETAIL-1" } }] }],
    },
  };

  updateReportPolicyName(policy.document, report, "Renamed");
  assert.deepEqual(report.exportedPolicies, { "POLICY-1": { policyName: "Renamed" } });

  const duplicate = duplicatePolicy(policy);
  assert.notEqual(duplicate.path, policy.path);
  assert.notEqual(duplicate.document.uuid, policy.document.uuid);
  assert.equal(duplicate.document.name, "Original Copy");

  recordPolicyInReport(report, duplicate.document);
  assert.equal((report.policiesToExport as string[]).includes(duplicate.document.uuid as string), true);

  removePolicyFromReport(report, policy.document);
  assert.deepEqual(report.policiesToExport, [duplicate.document.uuid]);
});

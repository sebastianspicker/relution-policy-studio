import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLE_COMPAT_SETTINGS,
  createAppleCompatConfiguration,
  extractAppleCompatPayloadBodyJson,
  extractAppleCompatValues,
  findAppleCompatSettingForDetails,
  updateAppleCompatDetails,
  updateAppleCompatDetailsFromPayloadBodyJson,
} from "../src/apple-compat.js";
import {
  type AppleSchemaEntry,
  appleSchemaEntriesForPlatform,
  createAppleSchemaProfileConfiguration,
  extractAppleSchemaPayloadBodyJson,
  extractAppleSchemaValues,
  findAppleSchemaEntry,
  updateAppleSchemaProfileDetails,
  updateAppleSchemaProfileDetailsFromPayloadBodyJson,
} from "../src/apple-schema.js";
import { loadAppleSchemaCatalog } from "../src/apple-schema-catalog.js";
import { inspectMobileConfigText } from "../src/plist.js";
import { PROFILE_EDITOR_META_PROPERTY } from "../src/profile-editor-meta.js";
import { loadTemplateBundle } from "../src/templates.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addAppleSchemaProfileToWorkspace,
  createNewWorkspace,
  type SchemaCompatibilityIssue,
  schemaCompatibilityIssues,
  validateWorkspace,
} from "../src/workspace.js";
import {
  firstConfiguration,
  parseJsonRecord,
  requireArray,
  requirePolicyPath,
  requireRecord,
} from "./rexp-helpers.js";
import {
  createOptionalParityAppleSchemaEntry,
  createSchemaCompatibilityFixture,
  createSchemaCompatibilityWorkspace,
} from "./rexp-apple-compat-fixtures.js";

function sequentialIds(prefix: string): () => string {
  let index = 0;
  return () => {
    index += 1;
    return `${prefix}-${index}`;
  };
}

// Apple device-management catalog snapshot currently exposes 126 profile entries.
const APPLE_SCHEMA_MIN_PROFILE_ENTRIES = 120;
// Apple device-management catalog snapshot currently exposes 36 DDM configuration entries.
const APPLE_SCHEMA_MIN_DDM_CONFIGURATION_ENTRIES = 30;
// Apple device-management catalog snapshot currently exposes 65 MDM command entries.
const APPLE_SCHEMA_MIN_MDM_COMMAND_ENTRIES = 60;

test("creates every mobileconfig-backed Apple gap configuration", () => {
  const settings = APPLE_COMPAT_SETTINGS.filter((setting) => setting.status === "mobileconfig-backed");

  for (const setting of settings) {
    const configuration = createAppleCompatConfiguration(setting.id);
    const details = configuration.details as Record<string, unknown>;

    assert.equal(details.type, "APPLE_MOBILECONFIG", setting.id);
    assert.equal(details.firstLevelPayloadType, "CONFIGURATION", setting.id);
    assert.equal(details.secondLevelPayloadType, setting.payloadType, setting.id);
    assert.equal(findAppleCompatSettingForDetails(details)?.id, setting.id, setting.id);
    assert.equal(String(details.rawContent).includes(`<string>${setting.payloadType}</string>`), true, setting.id);
  }
});

test("Apple compatibility payload JSON errors include setting context", () => {
  const configuration = createAppleCompatConfiguration("pppc");

  assert.throws(
    () => updateAppleCompatDetailsFromPayloadBodyJson(requireRecord(configuration.details), "pppc", "{"),
    /Could not parse setting pppc payload body JSON/u,
  );
});

test("Apple compatibility configuration creation accepts deterministic factories", () => {
  const configuration = createAppleCompatConfiguration("associated-domains", {}, {
    now: () => 1234,
    uuidFactory: sequentialIds("COMPAT"),
  });
  const details = requireRecord(configuration.details);
  const payloadContent = requireRecord(details.payloadContent);
  const meta = requireRecord(payloadContent[PROFILE_EDITOR_META_PROPERTY]);

  assert.equal(configuration.uuid, "COMPAT-1");
  assert.equal(configuration.creationDate, 1234);
  assert.equal(configuration.modificationDate, 1234);
  assert.equal(details.uuid, "COMPAT-2");
  assert.equal(meta.profileUuid, "COMPAT-3");
  assert.equal(meta.payloadUuid, "COMPAT-4");
});

test("loads the pinned Apple device-management schema catalog", () => {
  const catalog = loadAppleSchemaCatalog();
  const acme = findAppleSchemaEntry(catalog, "profile:com.apple.security.acme");
  const caldav = findAppleSchemaEntry(catalog, "ddm-configuration:com.apple.configuration.account.caldav");
  const accountConfiguration = findAppleSchemaEntry(catalog, "mdm-command:AccountConfiguration");
  const iosProfiles = appleSchemaEntriesForPlatform(catalog, "IOS", "profile");
  const acmeSubject = acme?.fields.find((field) => field.payloadKey === "Subject");

  assert.equal(catalog.counts.profile >= APPLE_SCHEMA_MIN_PROFILE_ENTRIES, true);
  assert.equal(catalog.counts["ddm-configuration"] >= APPLE_SCHEMA_MIN_DDM_CONFIGURATION_ENTRIES, true);
  assert.equal(catalog.counts["mdm-command"] >= APPLE_SCHEMA_MIN_MDM_COMMAND_ENTRIES, true);
  assert.notEqual(acme, undefined);
  assert.notEqual(caldav, undefined);
  assert.notEqual(accountConfiguration, undefined);
  assert.equal(acme?.identifier, "com.apple.security.acme");
  assert.equal(acme?.fields.some((field) => field.payloadKey === "DirectoryURL" && field.required), true);
  assert.equal(acmeSubject?.kind, "json");
  assert.equal(iosProfiles.some((entry) => entry.identifier === "com.apple.security.acme"), true);
});

test("creates generated Apple schema profiles in local workspaces", () => {
  const bundle = loadTemplateBundle();
  const catalog = loadAppleSchemaCatalog();
  const root = mkdtempSync(join(tmpdir(), "relution-apple-schema-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Schema ACME",
    serverVersion: bundle.serverVersion,
  });
  const updated = addAppleSchemaProfileToWorkspace(root, catalog, {
    policyPath: requirePolicyPath(workspace),
    versionIndex: 0,
    schemaId: "profile:com.apple.security.acme",
  });
  const configuration = firstConfiguration(updated);
  const details = requireRecord(configuration.details);

  assert.equal(validateWorkspace(updated, bundle).ok, true);
  assert.equal(details.type, "APPLE_MOBILECONFIG");
  assert.equal(details.secondLevelPayloadType, "com.apple.security.acme");
  assert.match(String(details.rawContent), /<string>com\.apple\.security\.acme<\/string>/);
});

test("Apple schema profile creation accepts deterministic factories", () => {
  const catalog = loadAppleSchemaCatalog();
  const entry = findAppleSchemaEntry(catalog, "profile:com.apple.security.acme");
  assert.notEqual(entry, undefined);

  const configuration = createAppleSchemaProfileConfiguration(entry!, {}, {
    now: () => 5678,
    uuidFactory: sequentialIds("SCHEMA"),
  });
  const details = requireRecord(configuration.details);
  const payloadContent = requireRecord(details.payloadContent);
  const meta = requireRecord(payloadContent[PROFILE_EDITOR_META_PROPERTY]);

  assert.equal(configuration.uuid, "SCHEMA-1");
  assert.equal(configuration.creationDate, 5678);
  assert.equal(configuration.modificationDate, 5678);
  assert.equal(details.uuid, "SCHEMA-2");
  assert.equal(meta.profileUuid, "SCHEMA-3");
  assert.equal(meta.payloadUuid, "SCHEMA-4");
});

test("creates mobileconfig-backed Apple gap configurations in local workspaces", () => {
  const bundle = loadTemplateBundle();
  const root = mkdtempSync(join(tmpdir(), "relution-apple-gap-"));
  const workspace = createNewWorkspace({
    workspace: root,
    platform: "IOS",
    name: "Local Apple Gap",
    serverVersion: bundle.serverVersion,
  });

  const updated = addAppleCompatConfigurationToWorkspace(root, {
    policyPath: requirePolicyPath(workspace),
    versionIndex: 0,
    settingId: "associated-domains",
  });
  const validation = validateWorkspace(updated, bundle);
  const configuration = firstConfiguration(updated);
  const details = configuration.details as Record<string, unknown>;

  assert.equal(validation.ok, true);
  assert.equal(details.type, "APPLE_MOBILECONFIG");
  assert.equal(details.firstLevelPayloadType, "CONFIGURATION");
  assert.equal(details.secondLevelPayloadType, "com.apple.associated-domains");
  assert.match(String(details.rawContent), /<key>PayloadType<\/key>\n\s+<string>com\.apple\.associated-domains<\/string>/);
  assert.equal(findAppleCompatSettingForDetails(details)?.id, "associated-domains");
});

test("updates generated Apple mobileconfig details without exposing raw XML editing", () => {
  const configuration = createAppleCompatConfiguration("pppc");
  const details = configuration.details as Record<string, unknown>;
  const updated = updateAppleCompatDetails(details, "pppc", {
    ...extractAppleCompatValues(details, findAppleCompatSettingForDetails(details)!),
    identifier: "com.example.privacy",
    service: "Camera",
    authorization: "Deny",
  });

  assert.equal(updated.type, "APPLE_MOBILECONFIG");
  assert.equal(updated.secondLevelPayloadType, "com.apple.TCC.configuration-profile-policy");
  assert.match(String(updated.rawContent), /com\.example\.privacy/);
  assert.match(String(updated.rawContent), /<key>Camera<\/key>/);
  assert.match(String(updated.rawContent), /<string>Deny<\/string>/);
});

test("round-trips every Apple compat builder through payload JSON and guided fields", () => {
  const cases: {
    readonly settingId: string;
    readonly defaultKey: string;
    readonly payloadBody: Record<string, unknown>;
    readonly guidedValues: Record<string, unknown>;
    readonly assertValues: (values: Record<string, unknown>) => void;
    readonly assertGuidedBody: (body: Record<string, unknown>) => void;
  }[] = [
    {
      settingId: "pppc",
      defaultKey: "Services",
      payloadBody: {
        Services: { Camera: [{ Authorization: "Deny", CodeRequirement: "anchor camera", Identifier: "com.example.camera", IdentifierType: "bundleID" }] },
        VendorUnknown: { Preserve: true },
      },
      guidedValues: { service: "Microphone", authorization: "Allow", codeRequirement: "anchor mic", identifier: "/Applications/Mic.app", identifierType: "path" },
      assertValues: (values) => {
        assert.equal(values.service, "Camera");
        assert.equal(values.authorization, "Deny");
        assert.equal(values.identifier, "com.example.camera");
      },
      assertGuidedBody: (body) => {
        const services = requireRecord(body.Services);
        const rules = requireArray(services.Microphone);
        const rule = requireRecord(rules[0]);
        assert.equal(rule.Authorization, "Allow");
        assert.equal(rule.Identifier, "/Applications/Mic.app");
        assert.equal(rule.IdentifierType, "path");
      },
    },
    {
      settingId: "managed-preferences",
      defaultKey: "PayloadContent",
      payloadBody: {
        PayloadContent: { "com.example.app": { Forced: [{ mcx_preference_settings: { DisableFeature: true } }] } },
        VendorUnknown: { Preserve: true },
      },
      guidedValues: { domain: "com.example.changed", key: "Greeting", value: "Hello" },
      assertValues: (values) => {
        assert.equal(values.domain, "com.example.app");
        assert.equal(values.key, "DisableFeature");
        assert.equal(values.value, "true");
      },
      assertGuidedBody: (body) => {
        const domain = requireRecord(requireRecord(body.PayloadContent)["com.example.changed"]);
        const forced = requireRecord(requireArray(domain.Forced)[0]);
        assert.equal(requireRecord(forced.mcx_preference_settings).Greeting, "Hello");
      },
    },
    {
      settingId: "associated-domains",
      defaultKey: "AssociatedDomains",
      payloadBody: {
        ApplicationIdentifier: "TEAMID.com.example.app",
        AssociatedDomains: ["applinks:example.test"],
        VendorUnknown: { Preserve: true },
      },
      guidedValues: { applicationIdentifier: "TEAMID.com.example.changed", associatedDomains: ["webcredentials:example.test"] },
      assertValues: (values) => {
        assert.equal(values.applicationIdentifier, "TEAMID.com.example.app");
        assert.deepEqual(values.associatedDomains, ["applinks:example.test"]);
      },
      assertGuidedBody: (body) => {
        assert.equal(body.ApplicationIdentifier, "TEAMID.com.example.changed");
        assert.deepEqual(body.AssociatedDomains, ["webcredentials:example.test"]);
      },
    },
    {
      settingId: "managed-login-items",
      defaultKey: "Rules",
      payloadBody: {
        Rules: [{ Comment: "Allow agent", RuleType: "BundleIdentifier", RuleValue: "com.example.agent", TeamIdentifier: "TEAMID" }],
        VendorUnknown: { Preserve: true },
      },
      guidedValues: { comment: "Changed agent", bundleIdentifier: "com.example.changed", teamIdentifier: "TEAMCHG" },
      assertValues: (values) => {
        assert.equal(values.comment, "Allow agent");
        assert.equal(values.bundleIdentifier, "com.example.agent");
        assert.equal(values.teamIdentifier, "TEAMID");
      },
      assertGuidedBody: (body) => {
        const rule = requireRecord(requireArray(body.Rules)[0]);
        assert.equal(rule.RuleType, "BundleIdentifier");
        assert.equal(rule.RuleValue, "com.example.changed");
        assert.equal(rule.TeamIdentifier, "TEAMCHG");
      },
    },
    {
      settingId: "network-usage-rules",
      defaultKey: "ApplicationRules",
      payloadBody: {
        ApplicationRules: [{ AppIdentifierMatches: ["com.example.one"], AllowCellularData: true, AllowRoamingCellularData: false }],
        VendorUnknown: { Preserve: true },
      },
      guidedValues: { applicationRules: [{ appIdentifierMatches: ["com.example.two"], allowCellularData: false, allowRoamingCellularData: true }] },
      assertValues: (values) => {
        const rule = requireRecord(requireArray(values.applicationRules)[0]);
        assert.deepEqual(rule.appIdentifierMatches, ["com.example.one"]);
        assert.equal(rule.allowCellularData, true);
      },
      assertGuidedBody: (body) => {
        const rule = requireRecord(requireArray(body.ApplicationRules)[0]);
        assert.deepEqual(rule.AppIdentifierMatches, ["com.example.two"]);
        assert.equal(rule.AllowCellularData, false);
        assert.equal(rule.AllowRoamingCellularData, true);
      },
    },
  ];
  for (const entry of cases) {
    const details = createAppleCompatConfiguration(entry.settingId).details as Record<string, unknown>;
    const setting = findAppleCompatSettingForDetails(details);
    assert.notEqual(setting, undefined, entry.settingId);
    const initialBody = parseJsonRecord(extractAppleCompatPayloadBodyJson(details, setting!));
    assert.equal(Object.prototype.hasOwnProperty.call(initialBody, entry.defaultKey), true, entry.settingId);
    const fromJson = updateAppleCompatDetailsFromPayloadBodyJson(details, entry.settingId, JSON.stringify(entry.payloadBody, null, 2));
    const values = extractAppleCompatValues(fromJson, setting!);
    entry.assertValues(values);
    const guided = updateAppleCompatDetails(fromJson, entry.settingId, { ...values, ...entry.guidedValues });
    const guidedBody = parseJsonRecord(extractAppleCompatPayloadBodyJson(guided, setting!));
    entry.assertGuidedBody(guidedBody);
    assert.deepEqual(guidedBody.VendorUnknown, { Preserve: true }, entry.settingId);
    assert.equal(String(guided.rawContent).includes(`<key>${entry.defaultKey}</key>`), true, entry.settingId);
  }
});

test("edits Apple gap payload body JSON bidirectionally", () => {
  const configuration = createAppleCompatConfiguration("associated-domains");
  const details = configuration.details as Record<string, unknown>;
  const setting = findAppleCompatSettingForDetails(details);
  assert.notEqual(setting, undefined);
  const fromJson = updateAppleCompatDetailsFromPayloadBodyJson(
    details,
    "associated-domains",
    JSON.stringify(
      {
        ApplicationIdentifier: "TEAMID.com.example.app",
        AssociatedDomains: ["applinks:example.test"],
        VendorUnknown: { Preserve: true },
      },
      null,
      2,
    ),
  );
  const values = extractAppleCompatValues(fromJson, setting!);
  const payloadBody = parseJsonRecord(extractAppleCompatPayloadBodyJson(fromJson, setting!));

  assert.equal(values.applicationIdentifier, "TEAMID.com.example.app");
  assert.deepEqual(values.associatedDomains, ["applinks:example.test"]);
  assert.deepEqual(payloadBody.VendorUnknown, { Preserve: true });

  const guided = updateAppleCompatDetails(fromJson, "associated-domains", {
    ...values,
    applicationIdentifier: "TEAMID.com.example.changed",
  });
  const guidedPayloadBody = parseJsonRecord(extractAppleCompatPayloadBodyJson(guided, setting!));

  assert.equal(guidedPayloadBody.ApplicationIdentifier, "TEAMID.com.example.changed");
  assert.deepEqual(guidedPayloadBody.VendorUnknown, { Preserve: true });
  assert.match(String(guided.rawContent), /TEAMID\.com\.example\.changed/);
});

test("edits Apple schema profile payload body JSON bidirectionally", () => {
  const catalog = loadAppleSchemaCatalog();
  const entry = findAppleSchemaEntry(catalog, "profile:com.apple.security.acme");
  assert.notEqual(entry, undefined);
  const directoryField = entry!.fields.find((field) => field.payloadKey === "DirectoryURL");
  assert.notEqual(directoryField, undefined);
  const configuration = createAppleSchemaProfileConfiguration(entry!);
  const details = configuration.details as Record<string, unknown>;
  const fromJson = updateAppleSchemaProfileDetailsFromPayloadBodyJson(
    details,
    entry!,
    JSON.stringify(
      {
        DirectoryURL: "https://acme.example.test/directory",
        VendorUnknown: { Preserve: true },
      },
      null,
      2,
    ),
  );
  const values = extractAppleSchemaValues(fromJson, entry!);
  const payloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(fromJson, entry!));

  assert.equal(values[directoryField!.path], "https://acme.example.test/directory");
  assert.deepEqual(payloadBody.VendorUnknown, { Preserve: true });

  const guided = updateAppleSchemaProfileDetails(fromJson, entry!, {
    ...values,
    [directoryField!.path]: "https://acme.example.test/changed",
  });
  const guidedPayloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(guided, entry!));

  assert.equal(guidedPayloadBody.DirectoryURL, "https://acme.example.test/changed");
  assert.deepEqual(guidedPayloadBody.VendorUnknown, { Preserve: true });
  assert.match(String(guided.rawContent), /https:\/\/acme\.example\.test\/changed/);
});

test("preserves omitted optional Apple schema values separately from explicit false zero and enum values", () => {
  const entry = createOptionalParityAppleSchemaEntry();
  const configuration = createAppleSchemaProfileConfiguration(entry, { requiredName: "alpha" });
  const details = configuration.details as Record<string, unknown>;
  const initialValues = extractAppleSchemaValues(details, entry);
  const initialPayloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(details, entry));

  assert.equal(Object.prototype.hasOwnProperty.call(initialValues, "optionalToggle"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(initialValues, "optionalCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(initialValues, "optionalMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(initialPayloadBody, "OptionalToggle"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(initialPayloadBody, "OptionalCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(initialPayloadBody, "OptionalMode"), false);

  const explicit = updateAppleSchemaProfileDetails(details, entry, {
    ...initialValues,
    optionalToggle: false,
    optionalCount: 0,
    optionalMode: "manual",
  });
  const explicitValues = extractAppleSchemaValues(explicit, entry);
  const explicitPayloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(explicit, entry));

  assert.equal(explicitValues.optionalToggle, false);
  assert.equal(explicitValues.optionalCount, 0);
  assert.equal(explicitValues.optionalMode, "manual");
  assert.equal(explicitPayloadBody.OptionalToggle, false);
  assert.equal(explicitPayloadBody.OptionalCount, 0);
  assert.equal(explicitPayloadBody.OptionalMode, "manual");

  const omittedAgain = updateAppleSchemaProfileDetails(explicit, entry, {
    ...explicitValues,
    optionalToggle: undefined,
    optionalCount: undefined,
    optionalMode: undefined,
  });
  const omittedValues = extractAppleSchemaValues(omittedAgain, entry);
  const omittedPayloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(omittedAgain, entry));

  assert.equal(Object.prototype.hasOwnProperty.call(omittedValues, "optionalToggle"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(omittedValues, "optionalCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(omittedValues, "optionalMode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(omittedPayloadBody, "OptionalToggle"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(omittedPayloadBody, "OptionalCount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(omittedPayloadBody, "OptionalMode"), false);
});

test("syncs guided Apple gap fields into payload keys JSON", () => {
  const configuration = createAppleCompatConfiguration("network-usage-rules");
  const details = configuration.details as Record<string, unknown>;
  const setting = findAppleCompatSettingForDetails(details);
  assert.notEqual(setting, undefined);
  const updated = updateAppleCompatDetails(details, "network-usage-rules", {
    ...extractAppleCompatValues(details, setting!),
    applicationRules: [
      {
        appIdentifierMatches: ["com.example.managed", "com.example.*"],
        allowCellularData: false,
        allowRoamingCellularData: true,
      },
    ],
  });
  const values = extractAppleCompatValues(updated, setting!);
  const payloadKeys = parseJsonRecord(values.payloadKeysJson);
  const applicationRules = requireArray(payloadKeys.ApplicationRules);
  const firstRule = requireRecord(applicationRules[0]);

  assert.deepEqual(firstRule.AppIdentifierMatches, ["com.example.managed", "com.example.*"]);
  assert.equal(firstRule.AllowCellularData, false);
  assert.equal(firstRule.AllowRoamingCellularData, true);
  assert.match(String(updated.rawContent), /<key>ApplicationRules<\/key>/);
  assert.match(String(updated.rawContent), /com\.example\.managed/);
});

test("hydrates guided Apple gap fields from payload keys JSON and preserves unknown keys", () => {
  const configuration = createAppleCompatConfiguration("network-relay");
  const details = configuration.details as Record<string, unknown>;
  const setting = findAppleCompatSettingForDetails(details);
  assert.notEqual(setting, undefined);
  const withJson = updateAppleCompatDetails(details, "network-relay", {
    ...extractAppleCompatValues(details, setting!),
    payloadKeysJson: JSON.stringify(
      {
        Relays: [
          {
            HTTP2RelayURL: "https://relay.example.test/http2",
            HTTP3RelayURL: "https://relay.example.test/http3",
            PayloadCertificateUUID: "CERT-PAYLOAD-UUID",
            RawPublicKeys: ["BASE64PUBLICKEY"],
            AdditionalHTTPHeaderFields: {
              "X-Relay-Tenant": "music-school",
            },
          },
        ],
        MatchDomains: ["example.test"],
      },
      null,
      2,
    ),
  });
  const hydratedValues = extractAppleCompatValues(withJson, setting!);
  const relays = requireArray(hydratedValues.relays);
  const firstRelay = requireRecord(relays[0]);
  const updated = updateAppleCompatDetails(withJson, "network-relay", {
    ...hydratedValues,
    relays: [
      {
        ...firstRelay,
        http2RelayUrl: "https://relay.example.test/changed",
      },
    ],
  });
  const updatedValues = extractAppleCompatValues(updated, setting!);
  const payloadKeys = parseJsonRecord(updatedValues.payloadKeysJson);
  const updatedRelays = requireArray(payloadKeys.Relays);
  const updatedRelay = requireRecord(updatedRelays[0]);

  assert.equal(firstRelay.http2RelayUrl, "https://relay.example.test/http2");
  assert.equal(firstRelay.http3RelayUrl, "https://relay.example.test/http3");
  assert.deepEqual(firstRelay.rawPublicKeys, ["BASE64PUBLICKEY"]);
  assert.deepEqual(firstRelay.additionalHttpHeaderFields, { "X-Relay-Tenant": "music-school" });
  assert.equal(updatedRelay.HTTP2RelayURL, "https://relay.example.test/changed");
  assert.deepEqual(payloadKeys.MatchDomains, ["example.test"]);
});

test("syncs decimal Apple payload numbers into valid plist real values", () => {
  const configuration = createAppleCompatConfiguration("cellular-private-network");
  const details = configuration.details as Record<string, unknown>;
  const setting = findAppleCompatSettingForDetails(details);
  assert.notEqual(setting, undefined);
  const updated = updateAppleCompatDetails(details, "cellular-private-network", {
    ...extractAppleCompatValues(details, setting!),
    dataSetName: "CampusPrivate5G",
    versionNumber: "2026.04",
    geofences: [
      {
        geofenceId: "example-campus",
        latitude: 47.6205,
        longitude: -122.3493,
        radius: 120.5,
      },
    ],
  });
  const values = extractAppleCompatValues(updated, setting!);
  const payloadKeys = parseJsonRecord(values.payloadKeysJson);
  const geofences = requireArray(payloadKeys.Geofences);
  const firstGeofence = requireRecord(geofences[0]);

  assert.equal(payloadKeys.DataSetName, "CampusPrivate5G");
  assert.equal(firstGeofence.Latitude, 47.6205);
  assert.equal(firstGeofence.Longitude, -122.3493);
  assert.equal(firstGeofence.Radius, 120.5);
  assert.match(String(updated.rawContent), /<real>47\.6205<\/real>/);
  assert.match(String(updated.rawContent), /<real>120\.5<\/real>/);
});

test("detects opaque signed mobileconfig input without XML parsing", () => {
  const inspection = inspectMobileConfigText("-----BEGIN PKCS7-----\nopaque\n-----END PKCS7-----");

  assert.equal(inspection.signatureState, "signed-opaque");
  assert.equal(inspection.displayName, "Custom .mobileconfig");
});

test("emits plist data nodes for Apple schema data fields", () => {
  const entry: AppleSchemaEntry = {
    id: "profile:com.example.data",
    kind: "profile",
    title: "Data Payload",
    description: "",
    identifier: "com.example.data",
    sourcePath: "local/Data.yaml",
    availability: {
      platforms: ["IOS"],
      allowMultiple: true,
      requiresMdm: false,
      deprecated: false,
      notes: [],
    },
    deprecated: false,
    fields: [
      {
        path: "payloadBlob",
        payloadKey: "PayloadBlob",
        title: "Payload blob",
        kind: "data",
        required: true,
        description: "",
        defaultValue: "",
        enumValues: [],
        variableSafe: false,
      },
    ],
  };

  const configuration = createAppleSchemaProfileConfiguration(entry, { payloadBlob: "QUJDREVGRw==" });
  const details = configuration.details as Record<string, unknown>;
  const payloadBody = parseJsonRecord(extractAppleSchemaPayloadBodyJson(details, entry));

  assert.equal(payloadBody.PayloadBlob, "QUJDREVGRw==");
  assert.match(String(details.rawContent), /<data>QUJDREVGRw==<\/data>/);
});

test("records schema compatibility issues instead of throwing on Java regex patterns", () => {
  const bundle = loadTemplateBundle();
  const issues = schemaCompatibilityIssues(bundle);

  assert.equal(hasSchemaCompatibilityIssue(issues, "Organization", "Organization.properties.email", "IsAlphabetic"), true);
  assert.equal(hasSchemaCompatibilityIssue(issues, "IotUpdateConfiguration", "IotUpdateConfiguration.allOf[1].properties.serverUrl", "https?"), true);
});

function hasSchemaCompatibilityIssue(
  issues: readonly SchemaCompatibilityIssue[],
  schemaName: string,
  path: string,
  patternFragment: string,
): boolean {
  return issues.some((issue) =>
    issue.kind === "invalid-pattern" &&
    issue.schemaName === schemaName &&
    issue.path === path &&
    issue.pattern.includes(patternFragment)
  );
}

test("reports schema compatibility issue counts on otherwise valid workspaces", () => {
  const bundle = createSchemaCompatibilityFixture("\\p{IsAlphabetic}+");
  const workspace = createSchemaCompatibilityWorkspace("123");
  const validation = validateWorkspace(workspace, bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.schemaCompatibilityIssueCount, 1);
});

test("reports zero schema compatibility issues when validation schemas need no sanitizing", () => {
  const bundle = createSchemaCompatibilityFixture("^[A-Za-z]+$");
  const workspace = createSchemaCompatibilityWorkspace("abc");
  const validation = validateWorkspace(workspace, bundle);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.schemaCompatibilityIssueCount, 0);
});

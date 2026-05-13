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
import { loadTemplateBundle } from "../src/templates.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addAppleSchemaProfileToWorkspace,
  createNewWorkspace,
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

test("loads the pinned Apple device-management schema catalog", () => {
  const catalog = loadAppleSchemaCatalog();
  const acme = findAppleSchemaEntry(catalog, "profile:com.apple.security.acme");
  const iosProfiles = appleSchemaEntriesForPlatform(catalog, "IOS", "profile");
  const acmeSubject = acme?.fields.find((field) => field.payloadKey === "Subject");

  assert.equal(catalog.counts.profile, 126);
  assert.equal(catalog.counts["ddm-configuration"], 36);
  assert.equal(catalog.counts["mdm-command"], 65);
  assert.notEqual(acme, undefined);
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

  assert.equal(issues.length, 24);
  assert.equal(issues.some((issue) => issue.kind === "invalid-pattern" && issue.pattern.includes("IsAlphabetic")), true);
});

function createOptionalParityAppleSchemaEntry(): AppleSchemaEntry {
  return {
    id: "profile:com.example.optional-parity",
    kind: "profile",
    title: "Optional Parity",
    description: "",
    identifier: "com.example.optional-parity",
    sourcePath: "local/OptionalParity.yaml",
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
        path: "requiredName",
        payloadKey: "RequiredName",
        title: "Required name",
        kind: "string",
        required: true,
        description: "",
        defaultValue: "alpha",
        enumValues: [],
        variableSafe: true,
      },
      {
        path: "optionalToggle",
        payloadKey: "OptionalToggle",
        title: "Optional toggle",
        kind: "boolean",
        required: false,
        description: "",
        defaultValue: false,
        enumValues: [],
        variableSafe: false,
      },
      {
        path: "optionalCount",
        payloadKey: "OptionalCount",
        title: "Optional count",
        kind: "integer",
        required: false,
        description: "",
        defaultValue: 0,
        enumValues: [],
        variableSafe: false,
      },
      {
        path: "optionalMode",
        payloadKey: "OptionalMode",
        title: "Optional mode",
        kind: "string",
        required: false,
        description: "",
        defaultValue: "",
        enumValues: ["automatic", "manual"],
        variableSafe: true,
      },
    ],
  };
}

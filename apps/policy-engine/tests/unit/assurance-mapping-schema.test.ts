/** Source values cannot be silently coerced when the installed schema changes. */
import assert from "node:assert/strict";
import test from "node:test";
import { assertAssuranceMappingSchema } from "../../src/assurance/assurance-mapping-schema.js";
import { APPLE_COMPAT_SETTINGS } from "../../src/apple/apple-compat-settings.js";
import { fixture, recommendation } from "./assurance-fixture.js";
import type { AssuranceMapping } from "../../src/assurance/assurance-contracts.js";

test("native assurance fields reject scalar, array and enum mismatches before mutation", () => {
  const { dependencies: { bundle, appleSchema } } = fixture();
  const target = bundle.configurationTypes.find((entry) => entry.type === "IOS_PASSCODE")!;
  const changed = { ...bundle, schemas: { ...bundle.schemas, [target.schemaName]: { type: "object", properties: {
    flag: { type: "boolean" }, amount: { type: "integer" }, mode: { type: "string", enum: ["enforced"] }, names: { type: "array", items: { type: "string" } },
  } } } };
  const mapping: AssuranceMapping = { family: "relution-native", target: target.type, values: {} };
  for (const values of [{ flag: "true" }, { amount: 6.5 }, { amount: [6] }, { mode: "disabled" }, { names: [true] }, { names: "one" }]) {
    assert.throws(() => assertAssuranceMappingSchema(mapping, values, "IOS", changed, appleSchema), /does not match/u);
  }
  assert.doesNotThrow(() => assertAssuranceMappingSchema(mapping, { flag: true, amount: 6, mode: "enforced", names: ["one"] }, "IOS", changed, appleSchema));
});

test("Apple schema type and option drift cannot normalize a reviewed boolean into text", () => {
  const { dependencies: { bundle, appleSchema } } = fixture();
  const target = appleSchema.entries.find((entry) => entry.id === "profile:com.apple.security.firewall")!;
  const mapping: AssuranceMapping = { family: "apple-schema-profile", target: target.id, values: { EnableFirewall: true } };
  const changed = structuredClone(appleSchema);
  const field = changed.entries.find((entry) => entry.id === target.id)!.fields.find((entry) => entry.path === "EnableFirewall")!;
  field.kind = "string";
  assert.throws(() => assertAssuranceMappingSchema(mapping, mapping.values, "MACOS", bundle, changed), /does not match string/u);
  field.kind = "boolean"; field.enumValues = ["false"];
  assert.throws(() => assertAssuranceMappingSchema(mapping, mapping.values, "MACOS", bundle, changed), /allowed option/u);
  field.enumValues = []; field.kind = "list";
  assert.throws(() => assertAssuranceMappingSchema(mapping, { EnableFirewall: [true] }, "MACOS", bundle, changed), /list of strings/u);
  field.kind = "integer";
  assert.throws(() => assertAssuranceMappingSchema(mapping, { EnableFirewall: "1" }, "MACOS", bundle, changed), /does not match integer/u);
  assert.doesNotThrow(() => assertAssuranceMappingSchema(mapping, mapping.values, "MACOS", bundle, appleSchema));
});

test("Apple compatibility values require their declared field kind", () => {
  const { dependencies: { bundle, appleSchema } } = fixture([recommendation()]);
  const setting = APPLE_COMPAT_SETTINGS.find((entry) => entry.fields.some((field) => field.kind === "boolean"))!;
  const field = setting.fields.find((entry) => entry.kind === "boolean")!;
  const mapping: AssuranceMapping = { family: "apple-mobileconfig", target: setting.payloadType, values: {} };
  assert.throws(() => assertAssuranceMappingSchema(mapping, { [field.id]: "true" }, setting.platforms[0]!, bundle, appleSchema), /does not match boolean/u);
  assert.doesNotThrow(() => assertAssuranceMappingSchema(mapping, { [field.id]: true }, setting.platforms[0]!, bundle, appleSchema));
});

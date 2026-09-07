// Normalizes raw Relution device payloads into stable summary records.
import type { RelutionDeviceSummary } from "./relution-api-types.js";
import { asRecord } from "../../platform/serialization/json-guards.js";

export function normalizeRelutionDeviceSummary(value: unknown): RelutionDeviceSummary {
  const raw = asRecord(value) ?? {};
  const uuid = firstString(raw, ["uuid", "id"], true);
  const platform = firstString(raw, ["platform", "osPlatform"]);
  const status = firstString(raw, ["status", "complianceStatus"]);
  const policyStatus = firstString(raw, ["policyStatus", "policyState"]);
  const lastConnectionDate = firstString(raw, ["lastConnectionDate", "lastSeen", "lastContact"]);
  const ownership = firstString(raw, ["ownership", "ownerShip"]);
  const serialNumber = firstString(raw, ["serialNumber", "serial", "imei", "udid"]);
  const userName = firstString(raw, ["userName", "username", "ownerName"]);
  const userEmail = firstString(raw, ["userEmail", "email", "ownerEmail"]);
  const assignedPolicies = assignedPolicyNames(raw);
  const name = firstString(raw, ["name", "deviceName", "displayName"]) ?? firstString(raw, ["uuid", "id"]) ?? "Unnamed device";
  return {
    ...optionalProperty("uuid", uuid),
    name,
    ...optionalProperty("platform", platform),
    ...optionalProperty("status", status),
    ...optionalProperty("policyStatus", policyStatus),
    ...optionalProperty("lastConnectionDate", lastConnectionDate),
    ...optionalProperty("ownership", ownership),
    ...optionalProperty("serialNumber", serialNumber),
    ...optionalProperty("userName", userName),
    ...optionalProperty("userEmail", userEmail),
    ...optionalProperty("assignedPolicies", assignedPolicies),
    // Keep the stable public field for compatibility without retaining or
    // returning unmodeled remote device data, credentials, or diagnostics.
    raw: {},
  };
}

function optionalProperty<Key extends string, Value>(key: Key, value: Value | undefined): Record<Key, Value> | Record<never, never> {
  return value === undefined ? {} : { [key]: value } as Record<Key, Value>;
}

function firstString(record: Record<string, unknown>, keys: string[], trim = false): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const candidate = trim ? value.trim() : value;
    if (candidate.length > 0) return candidate;
  }
  return undefined;
}

function assignedPolicyNames(record: Record<string, unknown>): string[] | undefined {
  for (const key of ["assignedPolicies", "policies", "policyNames", "appliedPolicies"]) {
    const value = record[key];
    const names = stringList(value);
    if (names !== undefined) {
      return names;
    }
  }
  return undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (value.length === 0) {
    return [];
  }
  const names = value.flatMap((entry) => {
    if (typeof entry === "string" && entry.length > 0) {
      return [entry];
    }
    const record = asRecord(entry);
    const name = record === undefined ? undefined : firstString(record, ["name", "policyName", "title", "displayName", "uuid", "id"]);
    return name === undefined ? [] : [name];
  });
  return names.length === 0 ? undefined : names;
}

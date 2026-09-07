/** Resolves and validates the policy version selected for compliance work. */
import type { ComplianceSelection, JsonRecord } from "./compliance-report-types.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function selectedPolicyTarget(
  workspace: PolicyWorkspace,
  selection: ComplianceSelection,
): { policy: { path: string; document: JsonRecord }; policyName: string; policyPlatform: string; configurations: JsonRecord[] } {
  const policy = workspace.policies[selection.policyIndex];
  const policyDocument = asRecord(policy?.document);
  if (policy === undefined || policyDocument === undefined) {
    throw new Error(`Policy selection is invalid: ${selection.policyIndex}`);
  }
  const versions = Array.isArray(policyDocument.versions) ? policyDocument.versions : [];
  const version = asRecord(versions[selection.versionIndex]);
  if (version === undefined) {
    throw new Error(`Policy version selection is invalid: ${selection.versionIndex}`);
  }
  const configurationsPath = `versions[${String(selection.versionIndex)}].configurations`;
  const configurationValues = requireArray(
    version.configurations,
    invalidConfigurationsError(configurationsPath),
  );
  for (const [configurationIndex, configuration] of configurationValues.entries()) {
    requireValue(
      asRecord(configuration),
      invalidConfigurationError(configurationsPath, configurationIndex),
    );
  }
  const configurations = configurationValues as JsonRecord[];
  const policyName = typeof policyDocument.name === "string" ? policyDocument.name : policy.path;
  const policyPlatform = typeof policyDocument.platform === "string" ? policyDocument.platform : "";
  if (policyPlatform.length === 0) {
    throw new Error(`Selected policy platform is invalid: ${String(policyDocument.platform)}`);
  }
  return {
    policy: { path: policy.path, document: policyDocument },
    policyName,
    policyPlatform,
    configurations,
  };
}

function requireValue<T>(value: T | undefined, invalid: Error): T {
  if (value === undefined) throw invalid;
  return value;
}

function requireArray(value: unknown, invalid: Error): unknown[] {
  return requireValue(Array.isArray(value) ? value : undefined, invalid);
}

function invalidConfigurationsError(path: string): Error {
  return selectedPolicyVersionError(`configurations are invalid: expected array at ${path}`);
}

function invalidConfigurationError(path: string, index: number): Error {
  return selectedPolicyVersionError(`configuration is invalid: ${path}[${String(index)}]`);
}

function selectedPolicyVersionError(detail: string): Error {
  return new Error(`Selected policy version ${detail}`);
}

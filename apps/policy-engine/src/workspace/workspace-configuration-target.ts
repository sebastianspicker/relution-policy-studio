/** Locates mutable configuration arrays in a loaded workspace. */
import { requireRecord, type JsonRecord } from "../platform/serialization/json-guards.js";
import { WorkspaceInputError } from "./input-values.js";
import type { ConfigurationPositionOptions, PolicyWorkspace, WorkspacePolicy } from "./types.js";

export interface ConfigurationTarget { policy: WorkspacePolicy; configurations: unknown[]; }
export function configurationTarget(workspace: PolicyWorkspace, options: Pick<ConfigurationPositionOptions, "policyPath" | "versionIndex">): ConfigurationTarget {
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) throw new WorkspaceInputError(`Policy not found in workspace: ${options.policyPath}`);
  const versions = requireArray(policy.document, "versions", options.policyPath);
  if (!Number.isSafeInteger(options.versionIndex) || options.versionIndex < 0 || options.versionIndex >= versions.length) throw new WorkspaceInputError(`Version index ${String(options.versionIndex)} is out of range for ${options.policyPath}.versions`);
  return { policy, configurations: requireArray(requireRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`), "configurations", `${options.policyPath}.versions[${options.versionIndex}]`) };
}
export function assertConfigurationIndex(configurations: unknown[], options: ConfigurationPositionOptions): void { if (!Number.isSafeInteger(options.configurationIndex) || options.configurationIndex < 0 || options.configurationIndex >= configurations.length) throw new WorkspaceInputError(`Configuration index ${options.configurationIndex} is out of range for ${options.policyPath}.versions[${options.versionIndex}].configurations`); }
function requireArray(record: JsonRecord, key: string, label: string): unknown[] { const value = record[key]; if (!Array.isArray(value)) throw new Error(`${label}.${key} is not an array`); return value; }

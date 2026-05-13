import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PolicyWorkspace } from "../src/workspace.js";

export interface BaselineTemplateIndex {
  consolidatedTemplates: BaselineTemplateIndexEntry[];
  modularBundleTemplates: BaselineTemplateIndexEntry[];
  modularTemplates: BaselineTemplateIndexEntry[];
  tieredConsolidatedTemplates: BaselineTemplateIndexEntry[];
  tieredModularBundleTemplates: BaselineTemplateIndexEntry[];
  tieredModularTemplates: BaselineTemplateIndexEntry[];
}

export interface BaselineTemplateIndexEntry {
  path: string;
  platform: string;
  tier?: 1 | 2 | 3;
}

export interface BaselineTemplate {
  name: string;
  policies: BaselinePolicy[];
}

export interface BaselinePolicy {
  name: string;
  rules: BaselineRule[];
}

export interface BaselineRule {
  mappings?: BaselineMapping[];
}

export type BaselineMapping =
  | { kind: "relution-native"; type: string }
  | { kind: "apple-mobileconfig"; payloadType: string }
  | { kind: "apple-schema-profile"; schemaId: string };

export interface PolicyImportReport {
  importedPolicies?: Record<string, PolicyImportReportEntry>;
  failedPolicies?: Record<string, PolicyImportReportEntry>;
  errors?: string[];
  warnings?: string[];
}

export interface PolicyImportReportEntry {
  policyUuid?: string;
  policyName?: string;
  result?: string;
  errors?: string[];
  warnings?: string[];
}

export interface PolicyVersionWrapper {
  results?: PolicyVersion[];
}

export interface PolicyVersion {
  uuid?: string;
  name?: string;
  state?: string;
  configurations?: PolicyConfiguration[];
}

export interface PolicyConfigurationWrapper {
  results?: PolicyConfiguration[];
}

export interface PolicyConfiguration {
  uuid?: string;
  details?: {
    type?: string;
    rawContent?: string;
    secondLevelPayloadType?: string;
  };
}

const composeFile = resolve("docker-compose.relution-e2e.yml");
const composeProject = process.env.RELUTION_DOCKER_PROJECT ?? "relution-policy-workbench-e2e";
const dockerPort = process.env.RELUTION_DOCKER_PORT ?? "8080";
const username = process.env.RELUTION_E2E_USERNAME ?? "admin";
const password = process.env.RELUTION_E2E_PASSWORD ?? "relution-e2e-admin";

export const baseUrl = process.env.RELUTION_E2E_BASE_URL ?? `http://127.0.0.1:${dockerPort}`;
export const archiveKey = process.env.RELUTION_E2E_REXP_KEY ?? "key123";

export async function waitForRelution(): Promise<void> {
  const deadline = Date.now() + 480_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status < 500) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const ps = dockerCompose(["ps", "-a", "relution"], false);
    if (ps.includes("Exited") || ps.includes("Restarting")) {
      throw new Error(`Relution container stopped before becoming reachable at ${baseUrl}: ${lastError}`);
    }
    await delay(5_000);
  }
  throw new Error(`Relution did not become reachable at ${baseUrl}: ${lastError}`);
}

export async function importPolicy(path: string): Promise<PolicyImportReport> {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.set("encryptionKey", archiveKey);
  form.set("file", new Blob([bytes]), path.split("/").at(-1) ?? "policy.rexp");
  const response = await fetch(`${baseUrl}/api/management/v1/devices/policies/import`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return JSON.parse(body) as PolicyImportReport;
}

export async function importBaselineTemplate(path: string, label: string): Promise<PolicyImportReport> {
  const importReport = await importPolicy(path);
  assert.deepEqual(importReport.errors ?? [], [], `${label}: import errors`);
  assert.equal(Object.keys(importReport.failedPolicies ?? {}).length, 0, `${label}: failed policy imports ${JSON.stringify(importReport.failedPolicies)}`);
  return importReport;
}

export async function publishFirstPolicyVersion(policyUuid: string): Promise<string> {
  const versionsResponse = await fetch(`${baseUrl}/api/management/v1/devices/policies/${policyUuid}/versions`, {
    headers: authHeaders(),
  });
  const versionsBody = await versionsResponse.text();
  assert.equal(versionsResponse.ok, true, versionsBody);
  const versions = JSON.parse(versionsBody) as PolicyVersionWrapper;
  const versionUuid = versions.results?.find((version) => version.uuid !== undefined)?.uuid;
  if (versionUuid === undefined) {
    throw new Error(`Imported policy has no version UUID: ${versionsBody}`);
  }
  const publishResponse = await fetch(`${baseUrl}/api/management/v1/devices/policies/${policyUuid}/versions/${versionUuid}/publish`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Version 1", description: "Published by local Docker E2E" }),
  });
  const publishBody = await publishResponse.text();
  assert.equal(publishResponse.ok, true, publishBody);
  return versionUuid;
}

export async function waitForPublishedConfigurations(policyUuid: string, versionUuid: string): Promise<PolicyConfiguration[]> {
  return waitForPublishedConfigurationsWithTypes(policyUuid, versionUuid, ["APPLE_MOBILECONFIG"]);
}

export async function waitForPublishedConfigurationsWithTypes(
  policyUuid: string,
  versionUuid: string,
  expectedTypes: string[],
): Promise<PolicyConfiguration[]> {
  const deadline = Date.now() + 60_000;
  let lastState = "";
  while (Date.now() < deadline) {
    const version = await fetchPolicyVersion(policyUuid, versionUuid);
    lastState = version === undefined ? "missing" : `${version.state ?? "no-state"} with ${String(version.configurations?.length ?? 0)} configs`;
    if (version?.state === "PUBLISHED" && configurationsHaveTypes(version.configurations ?? [], expectedTypes)) {
      return version.configurations ?? [];
    }
    const configurations = await fetchPolicyVersionConfigurations(policyUuid, versionUuid);
    if (configurationsHaveTypes(configurations, expectedTypes)) {
      return configurations;
    }
    await delay(2_000);
  }
  const configurations = await fetchPolicyVersionConfigurations(policyUuid, versionUuid);
  const availableTypes = configurationTypes(configurations);
  const missingTypes = expectedTypes.filter((type) => !availableTypes.includes(type));
  throw new Error(
    `Published version ${versionUuid} did not expose expected configurations ${missingTypes.join(", ")}: ${lastState}; available types: ${availableTypes.join(", ")}`,
  );
}

export async function exportPolicy(policyUuid: string): Promise<Blob> {
  const response = await fetch(`${baseUrl}/api/management/v1/devices/policies/export`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      policyUuids: [policyUuid],
      encryptionKey: Array.from(archiveKey),
      cipherSpecVersion: 1,
      digestSpecVersion: 1,
      archiveFormatVersion: 1,
      fileFormatVersion: 1,
    }),
  });
  const body = await response.blob();
  assert.equal(response.ok, true, await body.text());
  return body;
}

export function firstImportedPolicyUuid(report: PolicyImportReport): string {
  const entries = Object.values(report.importedPolicies ?? {});
  const policyUuid = entries.find((entry) => entry.policyUuid !== undefined)?.policyUuid;
  if (policyUuid === undefined) {
    throw new Error(`Import report did not contain an imported policy UUID: ${JSON.stringify(report)}`);
  }
  return policyUuid;
}

export function importedPolicyUuidByName(report: PolicyImportReport, policyName: string): string {
  const entries = Object.values(report.importedPolicies ?? {});
  const policyUuid = entries.find((entry) => entry.policyName === policyName && entry.policyUuid !== undefined)?.policyUuid;
  if (policyUuid === undefined) {
    throw new Error(`Import report did not contain imported policy ${policyName}: ${JSON.stringify(report)}`);
  }
  return policyUuid;
}

export function dockerCompose(args: string[], check = true): string {
  const result = spawnSync("docker", ["compose", "-f", composeFile, "-p", composeProject, ...args], {
    cwd: resolve("."),
    encoding: "utf8",
    env: process.env,
  });
  const output = `${result.stdout}${result.stderr}`;
  if (check && result.status !== 0) {
    throw new Error(`docker compose ${args.join(" ")} failed with status ${String(result.status)}\n${output}`);
  }
  return output;
}

export function requireRelutionE2eAccessToken(): string {
  return process.env.RELUTION_E2E_ACCESS_TOKEN ?? "local-dashboard-e2e-token";
}

export function requirePolicyPath(workspace: PolicyWorkspace): string {
  const policyPath = workspace.policies[0]?.path;
  if (policyPath === undefined) {
    throw new Error("Workspace has no policy path");
  }
  return policyPath;
}

export function requireImportedWorkspace(workspace: PolicyWorkspace | undefined, label: string): PolicyWorkspace {
  if (workspace === undefined) {
    throw new Error(`${label}: ruleset import did not create a workspace`);
  }
  return workspace;
}

export function configurationsHaveType(configurations: PolicyConfiguration[], type: string): boolean {
  return configurations.some((configuration) => configuration.details?.type === type);
}

export function baselineTemplateEntries(): BaselineTemplateIndexEntry[] {
  const index = readJson<BaselineTemplateIndex>("example/relution-baseline-templates/index.json");
  return [
    ...index.consolidatedTemplates,
    ...index.modularBundleTemplates,
    ...index.modularTemplates,
    ...index.tieredConsolidatedTemplates,
    ...index.tieredModularBundleTemplates,
    ...index.tieredModularTemplates,
  ];
}

export function expectedServerConfigurationTypes(policy: BaselinePolicy): string[] {
  const expected = new Set<string>();
  for (const rule of policy.rules) {
    for (const mapping of rule.mappings ?? []) {
      if (mapping.kind === "relution-native") {
        expected.add(mapping.type);
      } else {
        expected.add("APPLE_MOBILECONFIG");
      }
    }
  }
  if (expected.size === 0) {
    throw new Error(`Baseline policy has no actionable mappings: ${policy.name}`);
  }
  return [...expected].sort();
}

export function isRelutionExportablePolicy(expectedTypes: string[]): boolean {
  return expectedTypes.some((type) => type !== "APPLE_MOBILECONFIG");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as T;
}

export function workspaceHasConfigurationType(workspace: PolicyWorkspace, type: string): boolean {
  return workspace.policies.some((policy) => {
    const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
    return versions.some((version) => {
      const versionRecord =
        typeof version === "object" && version !== null && !Array.isArray(version) ? (version as Record<string, unknown>) : undefined;
      const configurations = Array.isArray(versionRecord?.configurations) ? versionRecord.configurations : [];
      return configurations.some((configuration) => {
        const configurationRecord =
          typeof configuration === "object" && configuration !== null && !Array.isArray(configuration)
            ? (configuration as Record<string, unknown>)
            : undefined;
        const details = configurationRecord?.details;
        const detailRecord = typeof details === "object" && details !== null && !Array.isArray(details) ? (details as Record<string, unknown>) : undefined;
        return detailRecord?.type === type;
      });
    });
  });
}

export async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

async function fetchPolicyVersion(policyUuid: string, versionUuid: string): Promise<PolicyVersion | undefined> {
  const response = await fetch(`${baseUrl}/api/management/v1/devices/policies/${policyUuid}/versions/${versionUuid}`, {
    headers: authHeaders(),
  });
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return (JSON.parse(body) as PolicyVersionWrapper).results?.[0];
}

async function fetchPolicyVersionConfigurations(policyUuid: string, versionUuid: string): Promise<PolicyConfiguration[]> {
  const response = await fetch(`${baseUrl}/api/management/v1/devices/policies/${policyUuid}/versions/${versionUuid}/configurations`, {
    headers: authHeaders(),
  });
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return (JSON.parse(body) as PolicyConfigurationWrapper).results ?? [];
}

function authHeaders(): Record<string, string> {
  const token = process.env.RELUTION_E2E_MANAGEMENT_ACCESS_TOKEN;
  if (token !== undefined && token.length > 0) {
    return { "X-User-Access-Token": token };
  }
  return {
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  };
}

function configurationsHaveTypes(configurations: PolicyConfiguration[], types: string[]): boolean {
  return types.every((type) => configurationsHaveType(configurations, type));
}

function configurationTypes(configurations: PolicyConfiguration[]): string[] {
  return [...new Set(configurations.map((configuration) => configuration.details?.type).filter((type): type is string => type !== undefined))].sort();
}

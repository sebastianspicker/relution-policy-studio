import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { appleCompatSettingsForPlatform, createAppleCompatConfiguration, findAppleCompatSetting } from "./apple-compat.js";
import {
  appleSchemaEntriesForPlatform,
  createAppleSchemaProfileConfiguration,
  createCustomSettingsConfiguration,
  findAppleSchemaEntry,
  type AppleSchemaCatalog,
  type CustomSettingsInput,
} from "./apple-schema.js";
import { findTemplate, defaultValueForSchema, objectProperties, type ConfigurationTemplate, type RelutionTemplateBundle } from "./templates.js";

export interface PolicyWorkspace {
  metadata: JsonRecord;
  report: JsonRecord;
  policies: WorkspacePolicy[];
}

export interface WorkspacePolicy {
  path: string;
  document: JsonRecord;
}

export interface WorkspaceValidationResult {
  ok: boolean;
  errors: WorkspaceValidationError[];
}

export interface WorkspaceValidationError {
  path: string;
  message: string;
}

export interface SchemaCompatibilityIssue {
  schemaName: string;
  path: string;
  kind: "invalid-pattern";
  pattern: string;
  message: string;
}

export interface NewWorkspaceOptions {
  platform: string;
  name: string;
  workspace: string;
  serverVersion: string;
  force?: boolean;
}

export interface AddConfigurationOptions {
  policyPath: string;
  versionIndex: number;
  type: string;
}

export interface AddAppleCompatConfigurationOptions {
  policyPath: string;
  versionIndex: number;
  settingId: string;
}

export interface AddAppleSchemaProfileOptions {
  policyPath: string;
  versionIndex: number;
  schemaId: string;
}

export interface AddCustomSettingsOptions extends CustomSettingsInput {
  policyPath: string;
  versionIndex: number;
}

export interface ConfigurationPositionOptions {
  policyPath: string;
  versionIndex: number;
  configurationIndex: number;
}

export interface MoveConfigurationOptions extends ConfigurationPositionOptions {
  direction: "up" | "down";
}

export interface AddPolicyOptions {
  platform: string;
  name: string;
}

export interface AddPolicyResult {
  workspace: PolicyWorkspace;
  policyPath: string;
}

type JsonRecord = Record<string, unknown>;

interface CreatedPolicy {
  uuid: string;
  path: string;
  document: JsonRecord;
}

const POLICY_PATH_PATTERN = /^policies\/policy_[^/]+\.json$/u;

export function createNewWorkspace(options: NewWorkspaceOptions): PolicyWorkspace {
  prepareWorkspace(options.workspace, options.force === true);
  const policy = createPolicyDocument({ platform: options.platform, name: options.name });
  const workspace = {
    metadata: createWorkspaceMetadata(options.serverVersion),
    report: createExportReport(policy.uuid, options.name),
    policies: [{ path: policy.path, document: policy.document }],
  };
  saveWorkspace(options.workspace, workspace);
  return workspace;
}

export function loadWorkspace(workspaceDir: string): PolicyWorkspace {
  assertWorkspacePathUsesNoSymlink(workspaceDir, "metadata.json");
  assertWorkspacePathUsesNoSymlink(workspaceDir, "report.json");
  return {
    metadata: readJsonFile(join(workspaceDir, "metadata.json")),
    report: readJsonFile(join(workspaceDir, "report.json")),
    policies: listPolicyFiles(workspaceDir).map((path) => {
      assertWorkspacePathUsesNoSymlink(workspaceDir, path);
      return {
        path,
        document: readJsonFile(join(workspaceDir, path)),
      };
    }),
  };
}

export function saveWorkspace(workspaceDir: string, workspace: PolicyWorkspace): void {
  assertPersistableWorkspace(workspace);
  assertWorkspacePathUsesNoSymlink(workspaceDir, "metadata.json");
  assertWorkspacePathUsesNoSymlink(workspaceDir, "report.json");
  assertWorkspacePathUsesNoSymlink(workspaceDir, "policies");

  const serialized = serializeWorkspace(workspace);
  const resolvedWorkspaceDir = resolve(workspaceDir);
  mkdirSync(resolvedWorkspaceDir, { recursive: true });
  const stagingDir = mkdtempSync(join(dirname(resolvedWorkspaceDir), `${workspaceTempPrefix(resolvedWorkspaceDir)}stage-`));

  try {
    writeSerializedWorkspace(stagingDir, serialized);
    replaceManagedWorkspaceSurface(resolvedWorkspaceDir, stagingDir);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

export function replaceWorkspace(workspaceDir: string, workspace: PolicyWorkspace): void {
  saveWorkspace(workspaceDir, workspace);
}

export function addConfigurationToWorkspace(
  workspaceDir: string,
  bundle: RelutionTemplateBundle,
  options: AddConfigurationOptions,
): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) {
    throw new Error(`Policy not found in workspace: ${options.policyPath}`);
  }
  const versions = getArray(policy.document, "versions", options.policyPath);
  const version = asRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`);
  const configurations = getArray(version, "configurations", `${options.policyPath}.versions[${options.versionIndex}]`);
  const template = findTemplate(bundle, options.type);
  if (template === undefined) {
    throw new Error(`Unknown configuration type: ${options.type}`);
  }
  if (!template.multiConfig && configurations.some((entry) => configurationType(entry) === options.type)) {
    throw new Error(`Configuration type ${options.type} is not multi-config and already exists in this policy version`);
  }
  configurations.push(createConfiguration(template, bundle));
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function addAppleCompatConfigurationToWorkspace(
  workspaceDir: string,
  options: AddAppleCompatConfigurationOptions,
): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) {
    throw new Error(`Policy not found in workspace: ${options.policyPath}`);
  }
  const platform = stringValue(policy.document.platform);
  if (platform === undefined) {
    throw new Error(`Policy platform is invalid: ${String(policy.document.platform)}`);
  }
  const setting = findAppleCompatSetting(options.settingId);
  if (setting === undefined || !appleCompatSettingsForPlatform(platform).some((candidate) => candidate.id === setting.id)) {
    throw new Error(`Apple compatibility setting ${options.settingId} is not compatible with policy platform ${platform}`);
  }
  const versions = getArray(policy.document, "versions", options.policyPath);
  const version = asRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`);
  const configurations = getArray(version, "configurations", `${options.policyPath}.versions[${options.versionIndex}]`);
  configurations.push(createAppleCompatConfiguration(setting.id));
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function addAppleSchemaProfileToWorkspace(
  workspaceDir: string,
  catalog: AppleSchemaCatalog,
  options: AddAppleSchemaProfileOptions,
): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) {
    throw new Error(`Policy not found in workspace: ${options.policyPath}`);
  }
  const platform = stringValue(policy.document.platform);
  if (platform === undefined) {
    throw new Error(`Policy platform is invalid: ${String(policy.document.platform)}`);
  }
  const entry = findAppleSchemaEntry(catalog, options.schemaId);
  if (entry === undefined || entry.kind !== "profile") {
    throw new Error(`Apple profile schema not found: ${options.schemaId}`);
  }
  if (!appleSchemaEntriesForPlatform(catalog, platform, "profile").some((candidate) => candidate.id === entry.id)) {
    throw new Error(`Apple profile schema ${options.schemaId} is not compatible with policy platform ${platform}`);
  }
  const versions = getArray(policy.document, "versions", options.policyPath);
  const version = asRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`);
  const configurations = getArray(version, "configurations", `${options.policyPath}.versions[${options.versionIndex}]`);
  configurations.push(createAppleSchemaProfileConfiguration(entry));
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function addCustomSettingsToWorkspace(workspaceDir: string, options: AddCustomSettingsOptions): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) {
    throw new Error(`Policy not found in workspace: ${options.policyPath}`);
  }
  const platform = stringValue(policy.document.platform);
  if (platform !== "MACOS") {
    throw new Error(`Application & Custom Settings is compatible with MACOS policies, not ${String(platform)}`);
  }
  const versions = getArray(policy.document, "versions", options.policyPath);
  const version = asRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`);
  const configurations = getArray(version, "configurations", `${options.policyPath}.versions[${options.versionIndex}]`);
  configurations.push(createCustomSettingsConfiguration(options));
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function removeConfigurationFromWorkspace(workspaceDir: string, options: ConfigurationPositionOptions): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const configurations = getConfigurations(workspace, options);
  requireConfigurationIndex(configurations, options.configurationIndex, options);
  configurations.splice(options.configurationIndex, 1);
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function moveConfigurationInWorkspace(workspaceDir: string, options: MoveConfigurationOptions): PolicyWorkspace {
  const workspace = loadWorkspace(workspaceDir);
  const configurations = getConfigurations(workspace, options);
  requireConfigurationIndex(configurations, options.configurationIndex, options);
  const nextIndex = options.direction === "up" ? options.configurationIndex - 1 : options.configurationIndex + 1;
  if (nextIndex < 0 || nextIndex >= configurations.length) {
    saveWorkspace(workspaceDir, workspace);
    return workspace;
  }
  const [configuration] = configurations.splice(options.configurationIndex, 1);
  configurations.splice(nextIndex, 0, configuration);
  saveWorkspace(workspaceDir, workspace);
  return workspace;
}

export function addPolicyToWorkspace(
  workspaceDir: string,
  bundle: RelutionTemplateBundle,
  options: AddPolicyOptions,
): AddPolicyResult {
  validateNewPolicyInput(bundle, options);
  const workspace = loadWorkspace(workspaceDir);
  const policy = createPolicyDocument({ platform: options.platform, name: options.name.trim() });
  workspace.policies.push({ path: policy.path, document: policy.document });
  recordPolicyInReport(workspace.report, policy.uuid, options.name.trim());
  saveWorkspace(workspaceDir, workspace);
  return { workspace, policyPath: policy.path };
}

export { validateWorkspace, schemaCompatibilityIssues } from "./workspace-validation.js";

export function createConfiguration(template: ConfigurationTemplate, bundle: RelutionTemplateBundle): JsonRecord {
  const schema = bundle.schemas[template.schemaName];
  const details = defaultValueForSchema(schema, bundle.schemas);
  const detailRecord = typeof details === "object" && details !== null && !Array.isArray(details) ? (details as JsonRecord) : {};
  detailRecord.type = template.type;
  detailRecord.uuid = randomUUID().toUpperCase();
  detailRecord.enabled = true;
  if (template.type === "APPLE_MOBILECONFIG") {
    detailRecord.displayName = "Custom .mobileconfig";
    detailRecord.rawContent = "";
    detailRecord.payloadContent = {};
    detailRecord.firstLevelPayloadType = "CONFIGURATION";
    detailRecord.secondLevelPayloadType = "";
  }

  const properties = schema === undefined ? {} : objectProperties(schema, bundle.schemas);
  for (const required of template.required) {
    if (detailRecord[required] === undefined && properties[required] !== undefined) {
      detailRecord[required] = defaultValueForSchema(properties[required], bundle.schemas);
    }
  }

  const now = Date.now();
  return {
    uuid: randomUUID().toUpperCase(),
    createdBy: "local",
    creationDate: now,
    modifiedBy: "local",
    modificationDate: now,
    details: detailRecord,
  };
}

function createWorkspaceMetadata(serverVersion: string): JsonRecord {
  return {
    version: 1,
    type: "POLICY",
    serverVersion,
    cipherSpecVersion: 1,
    digestSpecVersion: 1,
    archiveFormatVersion: 1,
    fileFormatVersion: 1,
  };
}

function createExportReport(policyUuid: string, policyName: string): JsonRecord {
  const report: JsonRecord = {
    policiesToExport: [],
    exportedPolicies: {},
    failedPolicies: {},
    exportFile: {
      uuid: null,
      name: null,
      contentType: null,
      size: 0,
      modificationDate: 0,
      properties: {},
      hashcode: null,
      link: null,
    },
  };
  recordPolicyInReport(report, policyUuid, policyName);
  return report;
}

function createPolicyDocument(options: AddPolicyOptions): CreatedPolicy {
  const policyUuid = randomUUID().toUpperCase();
  const versionUuid = randomUUID().toUpperCase();
  const now = Date.now();
  return {
    uuid: policyUuid,
    path: `policies/policy_${policyUuid}.json`,
    document: {
      uuid: policyUuid,
      createdBy: "local",
      creationDate: now,
      modifiedBy: "local",
      modificationDate: now,
      organizationUuid: null,
      name: options.name,
      description: "",
      platform: options.platform,
      payloadUuid: null,
      deletedBy: null,
      deletionDate: null,
      versions: [
        {
          uuid: versionUuid,
          createdBy: "local",
          creationDate: now,
          modifiedBy: "local",
          modificationDate: now,
          version: 1,
          state: "PUBLISHED",
          name: "Version 1",
          description: null,
          publisher: null,
          publishDate: null,
          configurations: [],
        },
      ],
    },
  };
}

function validateNewPolicyInput(bundle: RelutionTemplateBundle, options: AddPolicyOptions): void {
  if (options.name.trim().length === 0) {
    throw new Error("Policy name must not be empty");
  }
  if (options.platform === "UNKNOWN" || !bundle.platforms.includes(options.platform)) {
    throw new Error(`Unsupported policy platform: ${options.platform}`);
  }
}

function recordPolicyInReport(report: JsonRecord, policyUuid: string, policyName: string): void {
  const policiesToExport = Array.isArray(report.policiesToExport)
    ? report.policiesToExport.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (!policiesToExport.includes(policyUuid)) {
    policiesToExport.push(policyUuid);
  }
  report.policiesToExport = policiesToExport;

  const exportedPolicies =
    typeof report.exportedPolicies === "object" && report.exportedPolicies !== null && !Array.isArray(report.exportedPolicies)
      ? (report.exportedPolicies as JsonRecord)
      : {};
  exportedPolicies[policyUuid] = {
    policyUuid,
    policyName,
    result: "SUCCESS",
    errors: [],
  };
  report.exportedPolicies = exportedPolicies;

  if (typeof report.failedPolicies !== "object" || report.failedPolicies === null || Array.isArray(report.failedPolicies)) {
    report.failedPolicies = {};
  }
}

function prepareWorkspace(workspaceDir: string, force: boolean): void {
  if (existsSync(workspaceDir) && statSync(workspaceDir).isDirectory() && readdirSync(workspaceDir).length > 0 && !force) {
    throw new Error(`Workspace directory is not empty: ${workspaceDir}`);
  }
  mkdirSync(workspaceDir, { recursive: true });
}

function assertPersistableWorkspace(workspace: PolicyWorkspace): void {
  if (!asOptionalRecord(workspace.metadata)) {
    throw new Error("Workspace metadata must be an object");
  }
  if (!asOptionalRecord(workspace.report)) {
    throw new Error("Workspace report must be an object");
  }
  if (!Array.isArray(workspace.policies)) {
    throw new Error("Workspace policies must be an array");
  }
  const seenPaths = new Set<string>();
  for (const policy of workspace.policies) {
    if (typeof policy.path !== "string" || policy.path.length === 0) {
      throw new Error("Workspace policy path must be a non-empty string");
    }
    if (!POLICY_PATH_PATTERN.test(policy.path)) {
      throw new Error(`Workspace policy path is invalid: ${policy.path}`);
    }
    if (seenPaths.has(policy.path)) {
      throw new Error(`Workspace policy path is duplicated: ${policy.path}`);
    }
    seenPaths.add(policy.path);
    if (!asOptionalRecord(policy.document)) {
      throw new Error(`Workspace policy document must be an object: ${policy.path}`);
    }
    resolveWorkspacePath(".", policy.path);
  }
}

function listPolicyFiles(workspaceDir: string): string[] {
  const policiesDir = join(workspaceDir, "policies");
  if (!existsSync(policiesDir)) {
    return [];
  }
  assertWorkspacePathUsesNoSymlink(workspaceDir, "policies");
  return readdirSync(policiesDir)
    .filter((name) => name.startsWith("policy_") && name.endsWith(".json"))
    .sort()
    .map((name) => `policies/${name}`);
}

interface SerializedWorkspace {
  metadata: string;
  report: string;
  policies: Array<{
    path: string;
    document: string;
  }>;
}

function readJsonFile(path: string): JsonRecord {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return asRecord(parsed, path);
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function serializeWorkspace(workspace: PolicyWorkspace): SerializedWorkspace {
  return {
    metadata: serializeWorkspaceJson(workspace.metadata, "metadata"),
    report: serializeWorkspaceJson(workspace.report, "report"),
    policies: workspace.policies.map((policy) => ({
      path: policy.path,
      document: serializeWorkspaceJson(policy.document, policy.path),
    })),
  };
}

function serializeWorkspaceJson(value: unknown, label: string): string {
  try {
    return `${JSON.stringify(value, null, 2)}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to serialize workspace ${label}: ${message}`);
  }
}

function writeSerializedWorkspace(workspaceDir: string, serialized: SerializedWorkspace): void {
  writeSerializedJson(resolveWorkspacePath(workspaceDir, "metadata.json"), serialized.metadata);
  writeSerializedJson(resolveWorkspacePath(workspaceDir, "report.json"), serialized.report);
  for (const policy of serialized.policies) {
    writeSerializedJson(resolveWorkspacePath(workspaceDir, policy.path), policy.document);
  }
}

function writeSerializedJson(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function replaceManagedWorkspaceSurface(workspaceDir: string, stagingDir: string): void {
  const backupDir = mkdtempSync(join(dirname(workspaceDir), `${workspaceTempPrefix(workspaceDir)}backup-`));
  const movedToBackup: string[] = [];
  const movedFromStage: string[] = [];

  try {
    for (const entry of ["metadata.json", "report.json", "policies"] as const) {
      if (moveManagedEntry(workspaceDir, backupDir, entry)) {
        movedToBackup.push(entry);
      }
    }
    for (const entry of ["metadata.json", "report.json", "policies"] as const) {
      if (moveManagedEntry(stagingDir, workspaceDir, entry)) {
        movedFromStage.push(entry);
      }
    }
  } catch (error) {
    rollbackManagedWorkspaceSurface(workspaceDir, backupDir, movedToBackup, movedFromStage);
    throw error;
  } finally {
    rmSync(backupDir, { recursive: true, force: true });
  }
}

function rollbackManagedWorkspaceSurface(
  workspaceDir: string,
  backupDir: string,
  movedToBackup: string[],
  movedFromStage: string[],
): void {
  for (const entry of [...movedFromStage].reverse()) {
    rmSync(join(workspaceDir, entry), { recursive: entry === "policies", force: true });
  }
  for (const entry of [...movedToBackup].reverse()) {
    void moveManagedEntry(backupDir, workspaceDir, entry);
  }
}

function moveManagedEntry(fromRoot: string, toRoot: string, relativePath: string): boolean {
  const source = join(fromRoot, relativePath);
  if (!existsSync(source)) {
    return false;
  }
  assertWorkspacePathUsesNoSymlink(fromRoot, relativePath);
  const destination = join(toRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(source, destination);
  return true;
}

function workspaceTempPrefix(workspaceDir: string): string {
  const base = basename(workspaceDir);
  return `${base.length > 0 ? base : "workspace"}-`;
}

function getArray(record: JsonRecord, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${key} is not an array`);
  }
  return value;
}

function getConfigurations(workspace: PolicyWorkspace, options: ConfigurationPositionOptions): unknown[] {
  const policy = workspace.policies.find((candidate) => candidate.path === options.policyPath);
  if (policy === undefined) {
    throw new Error(`Policy not found in workspace: ${options.policyPath}`);
  }
  const versions = getArray(policy.document, "versions", options.policyPath);
  const version = asRecord(versions[options.versionIndex], `${options.policyPath}.versions[${options.versionIndex}]`);
  return getArray(version, "configurations", `${options.policyPath}.versions[${options.versionIndex}]`);
}

function requireConfigurationIndex(configurations: unknown[], configurationIndex: number, options: ConfigurationPositionOptions): void {
  if (!Number.isInteger(configurationIndex) || configurationIndex < 0 || configurationIndex >= configurations.length) {
    throw new Error(
      `Configuration index ${configurationIndex} is out of range for ${options.policyPath}.versions[${options.versionIndex}].configurations`,
    );
  }
}

function configurationType(value: unknown): string | undefined {
  const details = configurationDetails(value);
  return stringValue(details?.type);
}

function configurationDetails(value: unknown): JsonRecord | undefined {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
  const details = record?.details;
  return typeof details === "object" && details !== null && !Array.isArray(details) ? (details as JsonRecord) : undefined;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
}

function asOptionalRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveWorkspacePath(workspaceDir: string, relativePath: string): string {
  if (relativePath !== "metadata.json" && relativePath !== "report.json" && !POLICY_PATH_PATTERN.test(relativePath)) {
    throw new Error(`Workspace path must stay within the managed workspace surface: ${relativePath}`);
  }
  const resolvedRoot = resolve(workspaceDir);
  const candidate = resolve(resolvedRoot, relativePath);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Workspace path escapes the workspace root: ${relativePath}`);
  }
  return candidate;
}

function assertWorkspacePathUsesNoSymlink(workspaceDir: string, relativePath: string): void {
  const resolvedRoot = resolve(workspaceDir);
  if (existsSync(resolvedRoot) && lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`Workspace path must not use symlinks: ${workspaceDir}`);
  }

  let current = resolvedRoot;
  for (const segment of relativePath.split(/[\\/]/u).filter((part) => part.length > 0)) {
    current = join(current, segment);
    if (!existsSync(current)) {
      break;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Workspace path must not use symlinks: ${relativePath}`);
    }
  }
}

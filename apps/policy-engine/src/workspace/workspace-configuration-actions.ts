/** Adds compatible configuration records to persisted policies. */
import { appleCompatSettingsForPlatform, createAppleCompatConfiguration, findAppleCompatSetting } from "../apple/apple-compat-values.js";
import { appleSchemaEntriesForPlatform, findAppleSchemaEntry } from "../apple/apple-schema-catalog-access.js";
import { createAppleSchemaProfileConfiguration } from "../apple/apple-schema-profile-details.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import { findTemplate, type RelutionTemplateBundle } from "../contracts/template.js";
import { stringValue, type JsonRecord } from "../platform/serialization/json-guards.js";
import { incompatibleWorkspaceConfigurationMessage, invalidWorkspacePolicyPlatformMessage, workspaceConfigurationType } from "./workspace-model.js";
import { configurationTarget } from "./workspace-configuration-target.js";
import { createConfiguration } from "./workspace-configuration-builder.js";
import { loadPersistedWorkspace as loadWorkspace, savePersistedWorkspace as saveWorkspace } from "./storage.js";
import { WorkspaceInputError } from "./input-values.js";
import type { AddAppleCompatConfigurationOptions, AddAppleSchemaProfileOptions, AddConfigurationOptions, PolicyWorkspace } from "./types.js";

export function addConfigurationToWorkspace(path: string, bundle: RelutionTemplateBundle, options: AddConfigurationOptions): PolicyWorkspace {
  const workspace = loadWorkspace(path);
  return saveUpdatedWorkspace(path, addConfigurationToLoadedWorkspace(workspace, bundle, options));
}

/** Applies the template configuration mutation to an already loaded workspace. */
export function addConfigurationToLoadedWorkspace(workspace: PolicyWorkspace, bundle: RelutionTemplateBundle, options: AddConfigurationOptions): PolicyWorkspace {
  return addConfiguration(workspace, options, ({ configurations }) => {
    const template = findTemplate(bundle, options.type);
    if (template === undefined) throw new WorkspaceInputError(`Unknown configuration type: ${options.type}`);
    if (!template.multiConfig && configurations.some((entry) => workspaceConfigurationType(entry) === options.type)) {
      throw new WorkspaceInputError(`Configuration type ${options.type} is not multi-config and already exists in this policy version`);
    }
    return createConfiguration(template, bundle);
  });
}

/** Applies the Apple compatibility configuration mutation to an already loaded workspace. */
export function addAppleCompatConfigurationToLoadedWorkspace(workspace: PolicyWorkspace, options: AddAppleCompatConfigurationOptions): PolicyWorkspace {
  return addConfiguration(workspace, options, ({ policy }) => {
    const platform = policyPlatform(policy.document);
    const setting = findAppleCompatSetting(options.settingId);
    if (setting === undefined || !appleCompatSettingsForPlatform(platform).some((candidate) => candidate.id === setting.id)) {
      throw new WorkspaceInputError(incompatibleWorkspaceConfigurationMessage(`Apple compatibility setting ${options.settingId}`, platform));
    }
    return createAppleCompatConfiguration(setting.id);
  });
}

/** Applies the Apple schema profile mutation to an already loaded workspace. */
export function addAppleSchemaProfileToLoadedWorkspace(workspace: PolicyWorkspace, catalog: AppleSchemaCatalog, options: AddAppleSchemaProfileOptions): PolicyWorkspace {
  return addConfiguration(workspace, options, ({ policy }) => {
    const platform = policyPlatform(policy.document);
    const entry = findAppleSchemaEntry(catalog, options.schemaId);
    if (entry === undefined || entry.kind !== "profile") throw new WorkspaceInputError(`Apple profile schema not found: ${options.schemaId}`);
    if (!appleSchemaEntriesForPlatform(catalog, platform, "profile").some((candidate) => candidate.id === entry.id)) {
      throw new WorkspaceInputError(incompatibleWorkspaceConfigurationMessage(`Apple profile schema ${options.schemaId}`, platform));
    }
    return createAppleSchemaProfileConfiguration(entry);
  });
}

function addConfiguration(workspace: PolicyWorkspace, options: { policyPath: string; versionIndex: number }, create: (target: ReturnType<typeof configurationTarget>) => JsonRecord): PolicyWorkspace {
  const target = configurationTarget(workspace, options);
  target.configurations.push(create(target));
  return workspace;
}

function saveUpdatedWorkspace(path: string, workspace: PolicyWorkspace): PolicyWorkspace {
  saveWorkspace(path, workspace);
  return workspace;
}
function policyPlatform(document: JsonRecord): string { const platform = stringValue(document.platform); if (platform === undefined) throw new WorkspaceInputError(invalidWorkspacePolicyPlatformMessage(document.platform)); return platform; }

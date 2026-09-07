/** Adds custom MACOS settings through the common workspace persistence boundary. */
import { createCustomSettingsConfiguration } from "../apple/apple-schema-custom-settings-config.js";
import { stringValue } from "../platform/serialization/json-guards.js";
import { configurationTarget } from "./workspace-configuration-target.js";
import { WorkspaceInputError } from "./input-values.js";
import type { AddCustomSettingsOptions, PolicyWorkspace } from "./types.js";

/** Adds custom settings to an already loaded workspace without persisting it. */
export function addCustomSettingsToLoadedWorkspace(workspace: PolicyWorkspace, options: AddCustomSettingsOptions): PolicyWorkspace {
  const target = configurationTarget(workspace, options);
  if (stringValue(target.policy.document.platform) !== "MACOS") {
    throw new WorkspaceInputError(`Application & Custom Settings is compatible with MACOS policies, not ${String(target.policy.document.platform)}`);
  }
  target.configurations.push(createCustomSettingsConfiguration(options));
  return workspace;
}

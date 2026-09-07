/** Reorders or removes selected configurations. */
import { assertConfigurationIndex, configurationTarget } from "./workspace-configuration-target.js";
import type { ConfigurationPositionOptions, MoveConfigurationOptions, PolicyWorkspace } from "./types.js";

/** Removes a configuration from an already loaded workspace without persisting it. */
export function removeConfigurationFromLoadedWorkspace(workspace: PolicyWorkspace, options: ConfigurationPositionOptions): PolicyWorkspace {
  const configurations = configurationTarget(workspace, options).configurations;
  assertConfigurationIndex(configurations, options);
  configurations.splice(options.configurationIndex, 1);
  return workspace;
}

/** Moves a configuration in an already loaded workspace without persisting it. */
export function moveConfigurationInLoadedWorkspace(workspace: PolicyWorkspace, options: MoveConfigurationOptions): PolicyWorkspace {
  const configurations = configurationTarget(workspace, options).configurations;
  assertConfigurationIndex(configurations, options);
  const next = options.direction === "up" ? options.configurationIndex - 1 : options.configurationIndex + 1;
  if (next >= 0 && next < configurations.length) {
    const [entry] = configurations.splice(options.configurationIndex, 1);
    configurations.splice(next, 0, entry);
  }
  return workspace;
}

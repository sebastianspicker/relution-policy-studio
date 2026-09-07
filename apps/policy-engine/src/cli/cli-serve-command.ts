/** Implements editor serving and default workspace bootstrapping. */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParsedArgs } from "./contracts.js";
import { optionalString } from "./cli-arg-values.js";
import { serveEditor } from "./cli-editor-commands.js";
import { optionalEnvRexpKey } from "./cli-runtime.js";
import { loadTemplateBundle } from "../assurance/template-bundle.js";
import { createNewWorkspace } from "../workspace/workspace-creation.js";

export const DEFAULT_SERVE_WORKSPACE = ".rexp-editor/workspace";
const DEFAULT_SERVE_OUTPUT = ".rexp-editor/output.rexp";
const DEFAULT_SERVE_PLATFORM = "IOS";
const DEFAULT_SERVE_POLICY_NAME = "Local iOS Policy";

export async function serveCommand(args: ParsedArgs): Promise<void> {
  const workspace = optionalString(args, "workspace") ?? DEFAULT_SERVE_WORKSPACE;
  const out = optionalString(args, "out") ?? defaultServeOutput(workspace);
  const key = optionalString(args, "key") ?? optionalEnvRexpKey() ?? "";
  if (shouldBootstrapWorkspace(workspace)) createDefaultWorkspace(args, workspace);
  await serveEditor(args, workspace, out, key);
}

function defaultServeOutput(workspace: string): string {
  return workspace === DEFAULT_SERVE_WORKSPACE ? DEFAULT_SERVE_OUTPUT : resolve(dirname(workspace), "output.rexp");
}

function shouldBootstrapWorkspace(workspace: string): boolean {
  return !existsSync(workspace) || (statSync(workspace).isDirectory() && readdirSync(workspace).length === 0);
}

function createDefaultWorkspace(args: ParsedArgs, workspace: string): void {
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  const platform = optionalString(args, "platform") ?? DEFAULT_SERVE_PLATFORM;
  const name = optionalString(args, "name") ?? DEFAULT_SERVE_POLICY_NAME;
  if (platform === "UNKNOWN" || !bundle.platforms.includes(platform)) throw new Error(`Unsupported default policy platform: ${platform}`);
  createNewWorkspace({ workspace, platform, name, serverVersion: bundle.serverVersion });
  console.log(`Created workspace ${resolve(workspace)}`);
}

/** Implements explicit workspace creation, archive editing, and editor server lifecycle. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startEditorServer } from "../editor/editor-server.js";
import type { ParsedArgs } from "./contracts.js";
import { optionalInteger, optionalString, requirePositional, requireString } from "./cli-arg-values.js";
import { requireKey } from "./cli-runtime.js";
import { loadAppleSchemaCatalog } from "../apple/apple-schema-catalog.js";
import { loadTemplateBundle } from "../assurance/template-bundle.js";
import { initializeNewWorkspace } from "../application/workspace-initialization.js";
import { importEditorArchive } from "../editor/editor-archive-import.js";
import { editorWorkspaceInitializationPort } from "../editor/editor-workspace-initialization.js";
import { prepareNewWorkspaceDirectory } from "../workspace/workspace-creation.js";

export function newCommand(args: ParsedArgs): void {
  const workspace = requireString(args, "workspace", "new requires --workspace <dir>");
  const platform = requireString(args, "platform", "new requires --platform <Platform>");
  const name = requireString(args, "name", "new requires --name <policy name>");
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  if (platform === "UNKNOWN" || !bundle.platforms.includes(platform)) {
    throw new Error(`Unsupported policy platform: ${platform}`);
  }
  initializeNewWorkspace({ workspace, platform, name, serverVersion: bundle.serverVersion, force: args.options.force === true }, editorWorkspaceInitializationPort);
  console.log(`Created workspace ${resolve(workspace)}`);
}

export async function editCommand(args: ParsedArgs): Promise<void> {
  const file = requirePositional(args, 0, "edit requires a .rexp file");
  const workspace = requireString(args, "workspace", "edit requires --workspace <dir>");
  const out = requireString(args, "out", "edit requires --out <file.rexp>");
  const key = requireKey(args);
  const force = args.options.force === true;
  // Forced import validates the destination while the workspace-state lock holds
  // recovery, so an interrupted base transaction cannot be mistaken for an
  // arbitrary non-workspace directory.
  if (!force) prepareNewWorkspaceDirectory(workspace, false, { allowWorkspaceState: true });
  importEditorArchive({
    archive: readFileSync(file),
    key,
    workspaceDir: workspace,
    bundle: loadTemplateBundle(),
    appleSchemaRevision: loadAppleSchemaCatalog().source.revision,
    force,
  });
  await serveEditor(args, workspace, out, key);
}

export async function serveEditor(args: ParsedArgs, workspace: string, out: string, key: string): Promise<void> {
  const bundlePath = optionalString(args, "bundle");
  const apiToken = optionalString(args, "editor-api-token");
  const options: Parameters<typeof startEditorServer>[0] = {
    workspace,
    out,
    key,
    allowLocalServiceHosts: args.options["allow-local-service-hosts"] === true,
    port: optionalInteger(args, "port") ?? 8787,
    host: optionalString(args, "host") ?? "127.0.0.1",
    ...(apiToken === undefined ? {} : { apiToken }),
    ...(bundlePath === undefined ? {} : { bundlePath }),
  };
  const handle = await startEditorServer(options);
  console.log(`REXP Studio: ${handle.browserUrl}`);
  console.log(`Workspace: ${resolve(workspace)}`);
  console.log(`Output: ${resolve(out)}`);
  if (key.length === 0) console.log("Key: not set; enter one in the UI before importing or building encrypted .rexp files.");
  if (args.options.once === true) return handle.close();
  await new Promise<void>((resolveStop) => {
    process.once("SIGINT", () => { void handle.close().finally(resolveStop); });
    process.once("SIGTERM", () => { void handle.close().finally(resolveStop); });
  });
}

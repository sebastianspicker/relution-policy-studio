/** Composes the unified Relution Policy Studio loopback host from a private local data directory. */
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadTemplateBundle } from "../assurance/template-bundle.js";
import { startEditorServer } from "../editor/editor-server.js";
import { initializeEmptyEditorWorkspace } from "../editor/editor-workspace-initialization.js";

interface StudioHostPlannerOptions {
  readonly pythonExecutable: string;
  readonly cwd: string;
}

export interface StudioHostOptions {
  /** Application-private state: scratch workspace, project store and archive output. */
  readonly dataDir: string;
  readonly port: number;
  /** Built workbench assets served by the authenticated loopback host. */
  readonly staticRoot: string;
  readonly planner: StudioHostPlannerOptions;
}

export interface StudioHostHandle {
  /** Browser launch URL carrying the editor token in its fragment. */
  readonly browserUrl: string;
  readonly close: () => Promise<void>;
}

/** Refuses symlink traversal before creating application-private state. */
function preparePrivateDataDirectory(dataDir: string): void {
  for (let path = dataDir; ; path = dirname(path)) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Data path must not contain symlinks");
    if (dirname(path) === path) break;
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (lstatSync(dataDir).mode & 0o077) throw new Error("Data directory must be private (mode 0700)");
}

export async function startStudioHost(options: StudioHostOptions): Promise<StudioHostHandle> {
  const dataDir = resolve(options.dataDir);
  preparePrivateDataDirectory(dataDir);
  const scratch = join(dataDir, "scratch-workspace");
  const bundle = loadTemplateBundle();
  if (!existsSync(scratch)) initializeEmptyEditorWorkspace(scratch, bundle.serverVersion);
  if (!existsSync(options.planner.pythonExecutable)) throw new Error("Install planner first: pnpm bootstrap");
  const handle = await startEditorServer({
    workspace: scratch,
    key: "",
    out: join(dataDir, "campusweave.rexp"),
    host: "127.0.0.1",
    port: options.port,
    staticRoot: options.staticRoot,
    campusweave: {
      projectRoot: join(dataDir, "projects"),
      planner: { pythonExecutable: options.planner.pythonExecutable, cwd: options.planner.cwd },
    },
  });
  return { browserUrl: handle.browserUrl, close: handle.close };
}

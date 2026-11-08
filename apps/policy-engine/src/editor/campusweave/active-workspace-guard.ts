/** Rejects workspace-targeting requests from a tab whose active workspace was switched by another tab or project. */
import type { IncomingMessage } from "node:http";
import { HttpError } from "../editor-http-error.js";
import type { EditorRequestContext } from "../editor-server-contract.js";

/** Sent by the browser client: the active workspace id the tab adopted, or "scratch". Absent for legacy clients. */
const EXPECTED_WORKSPACE_HEADER = "x-rexp-studio-workspace";
const SCRATCH_WORKSPACE = "scratch";

/** Routes that select or repair the active workspace, or do not touch it. */
const UNGUARDED_ROUTES = new Set([
  "/api/key",
  "/api/campusweave/workspaces",
  "/api/campusweave/workspaces/activate",
  "/api/campusweave/workspaces/recover",
  "/api/campusweave/workspaces/abandon",
]);

export function assertExpectedActiveWorkspace(pathname: string, request: IncomingMessage, context: EditorRequestContext): void {
  const runtime = context.runtimeState.campusweave;
  if (runtime === undefined || UNGUARDED_ROUTES.has(pathname)) return;
  const header = request.headers[EXPECTED_WORKSPACE_HEADER];
  const expected = Array.isArray(header) ? header[0] : header;
  if (expected === undefined || expected === (runtime.activeWorkspaceId ?? SCRATCH_WORKSPACE)) return;
  throw new HttpError(409, "The active policy workspace was changed in another tab or project. Reload this page to continue with the workspace that is open now.");
}

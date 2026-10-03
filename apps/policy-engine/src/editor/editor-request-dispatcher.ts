/** Classifies authenticated POST routes before bounded body intake begins. */
import { DEFAULT_JSON_BODY_LIMIT_BYTES, LARGE_JSON_BODY_LIMIT_BYTES } from "./editor-json-body.js";

export type EditorMutationDomain = "workspace" | "relution" | "zammad" | "campusweave";

export interface EditorPostRoute {
  readonly domain: EditorMutationDomain;
  readonly bodyLimitBytes: number;
  readonly readsBody: boolean;
}

const BODYLESS_WORKSPACE_POST_ROUTES = new Set(["/api/build"]);
const BODYLESS_RELUTION_POST_ROUTES = new Set(["/api/relution/test"]);
const BODYLESS_ZAMMAD_POST_ROUTES = new Set(["/api/zammad/test"]);
const CAMPUSWEAVE_POST_ROUTES = new Set([
  "/api/campusweave/projects",
  "/api/campusweave/project",
  "/api/campusweave/planner",
  "/api/campusweave/review",
]);

const LARGE_WORKSPACE_POST_ROUTES = new Set([
  "/api/assurance/preview",
  "/api/assurance/apply",
  "/api/import",
  "/api/workspace",
  "/api/workspace/validate",
]);

const WORKSPACE_POST_ROUTES = new Set([
  "/api/add-configuration",
  "/api/add-policy",
  "/api/apple-compat/add",
  "/api/apple-profile/add",
  "/api/compliance/apply",
  "/api/compliance/check",
  "/api/configuration/move",
  "/api/configuration/remove",
  "/api/custom-settings/add",
  "/api/ddm/artifact",
  "/api/ddm/artifact/remove",
  "/api/ddm/artifact/update",
  "/api/key",
  "/api/mdm-command/artifact",
  "/api/mdm-command/artifact/remove",
  "/api/mdm-command/artifact/update",
  "/api/mobileconfig/inspect",
  "/api/roundtrip/reconcile",
  "/api/campusweave/workspaces/activate",
  "/api/campusweave/workspaces/recover",
  "/api/campusweave/workspaces",
  "/api/campusweave/projection",
]);

const RELUTION_POST_ROUTES = new Set([
  "/api/relution/devices/assess",
  "/api/relution/devices/audit",
  "/api/relution/devices/query",
  "/api/relution/reports/compliance",
  "/api/relution/session",
]);

const ZAMMAD_POST_ROUTES = new Set([
  "/api/zammad/session",
  "/api/zammad/tickets",
]);

/** Unknown paths remain outside intake so their existing namespace errors retain precedence. */
export function classifyEditorPostRoute(pathname: string): EditorPostRoute | undefined {
  if (BODYLESS_WORKSPACE_POST_ROUTES.has(pathname)) {
    return { domain: "workspace", bodyLimitBytes: 0, readsBody: false };
  }
  if (BODYLESS_RELUTION_POST_ROUTES.has(pathname)) {
    return { domain: "relution", bodyLimitBytes: 0, readsBody: false };
  }
  if (BODYLESS_ZAMMAD_POST_ROUTES.has(pathname)) {
    return { domain: "zammad", bodyLimitBytes: 0, readsBody: false };
  }
  if (LARGE_WORKSPACE_POST_ROUTES.has(pathname)) {
    return { domain: "workspace", bodyLimitBytes: LARGE_JSON_BODY_LIMIT_BYTES, readsBody: true };
  }
  if (WORKSPACE_POST_ROUTES.has(pathname)) {
    return { domain: "workspace", bodyLimitBytes: DEFAULT_JSON_BODY_LIMIT_BYTES, readsBody: true };
  }
  if (RELUTION_POST_ROUTES.has(pathname)) {
    return { domain: "relution", bodyLimitBytes: DEFAULT_JSON_BODY_LIMIT_BYTES, readsBody: true };
  }
  if (ZAMMAD_POST_ROUTES.has(pathname)) {
    return { domain: "zammad", bodyLimitBytes: DEFAULT_JSON_BODY_LIMIT_BYTES, readsBody: true };
  }
  if (CAMPUSWEAVE_POST_ROUTES.has(pathname)) {
    return { domain: "campusweave", bodyLimitBytes: DEFAULT_JSON_BODY_LIMIT_BYTES, readsBody: true };
  }
  return undefined;
}

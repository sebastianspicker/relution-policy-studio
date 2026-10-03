/** Authenticated route handlers for unified CampusWeave projects and planner work. */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest } from "../editor-http-error.js";
import { optionalRecord, requireNumber, requireString } from "../editor-api-request-input.js";
import { readJsonBody } from "../editor-json-body.js";
import { sendJson } from "../editor-routes-utils.js";
import type { EditorRequestContext } from "../editor-server-contract.js";
import { loadEditorWorkspaceState } from "../../workspace-state/editor-port.js";
import { initializeNewWorkspace } from "../../application/workspace-initialization.js";
import { editorWorkspaceInitializationPort } from "../editor-workspace-initialization.js";
import type { CampusWeavePlannerCommand, CampusWeaveProject, CampusWeaveWorkspaceRef } from "../../contracts/campusweave.js";
import { runCampusWeavePlanner } from "../../integrations/campusweave/planner-worker.js";
import { parseCampusWeaveProfile, parseCampusWeaveProject } from "../../contracts/campusweave-validation.js";
import { reviewCampusWeaveProject, type CampusWeaveReviewCurrentState } from "../../application/campusweave-review.js";
import { applyCampusWeaveMapping, projectCampusWeaveMapping } from "./projection.js";
import { CampusWeaveRevisionConflictError } from "../../contracts/campusweave-errors.js";
import { campusWeaveAssuranceDigest } from "./assurance-state.js";

const PLANNER_COMMANDS = new Set<CampusWeavePlannerCommand>(["reference", "convert-v1", "validate", "compile"]);

export async function handleCampusWeaveApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/campusweave")) return false;
  const runtime = context.runtimeState.campusweave;
  if (runtime === undefined) throw badRequest("CampusWeave host extension is not configured");
  if (url.pathname === "/api/campusweave/projects") {
    if (request.method === "GET") sendJson(response, 200, { projects: runtime.store.list() });
    else if (request.method === "POST") await createProject(request, response, context);
    else return false;
    return true;
  }
  if (url.pathname === "/api/campusweave/project") {
    if (request.method === "GET") sendJson(response, 200, { project: runtime.store.get(requireQueryId(url, "id")) });
    else if (request.method === "POST") await saveProject(request, response, context);
    else return false;
    return true;
  }
  if (url.pathname === "/api/campusweave/planner" && request.method === "POST") {
    await runPlanner(request, response, context);
    return true;
  }
  if (url.pathname === "/api/campusweave/review" && request.method === "POST") {
    await reviewProject(request, response, context);
    return true;
  }
  if (url.pathname === "/api/campusweave/projection" && request.method === "POST") {
    await projectMapping(request, response, context);
    return true;
  }
  if (url.pathname === "/api/campusweave/workspaces") {
    if (request.method === "GET") listWorkspaces(url, response, context);
    else if (request.method === "POST") await createWorkspace(request, response, context);
    else return false;
    return true;
  }
  if (url.pathname === "/api/campusweave/workspaces/recover" && request.method === "POST") {
    await withBody(request, (body) => {
      const project = runtime.store.completeWorkspace(requireString(body, "projectId"), requireString(body, "operationId"), requireNumber(body, "expectedRevision"));
      sendJson(response, 200, { project, transactions: { workspace: "verified", project: "committed" } });
    });
    return true;
  }
  if (url.pathname === "/api/campusweave/workspaces/activate" && request.method === "POST") {
    await activateWorkspace(request, response, context);
    return true;
  }
  return false;
}

function createProject(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  return withBody(request, (body) => {
    const supplied = optionalRecord(body, "profile");
    const profile = supplied === undefined ? undefined : parseCampusWeaveProfile(supplied);
    const project = context.runtimeState.campusweave!.store.create(requireString(body, "name"), profile);
    sendJson(response, 200, { project });
  });
}

function saveProject(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  return withBody(request, (body) => {
    const project = parseCampusWeaveProject(body.project);
    const saved = context.runtimeState.campusweave!.store.save(project, requireNumber(body, "expectedRevision"));
    sendJson(response, 200, { project: saved });
  });
}

async function runPlanner(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  const body = await readJsonBody(request);
  const commandValue = requireString(body, "command");
  if (!PLANNER_COMMANDS.has(commandValue as CampusWeavePlannerCommand)) throw badRequest(`Unsupported CampusWeave planner command: ${commandValue}`);
  const payload = optionalRecord(body, "payload");
  if (payload === undefined) throw badRequest("Expected object body field: payload");
  const result = await runCampusWeavePlanner(context.runtimeState.campusweave!.planner, commandValue as CampusWeavePlannerCommand, payload);
  sendJson(response, 200, { result: commandValue === "compile" ? withCatalogDigest(result, context) : result });
}

async function reviewProject(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  const body = await readJsonBody(request);
  const project = context.runtimeState.campusweave!.store.get(requireString(body, "projectId"));
  assertRevision(project, requireNumber(body, "expectedRevision"));
  let trustedCompilation: unknown;
  try {
    trustedCompilation = await runCampusWeavePlanner(
      context.runtimeState.campusweave!.planner,
      "compile",
      { profile: project.profile },
    );
  } catch {
    trustedCompilation = undefined;
  }
  sendJson(response, 200, {
    review: reviewCampusWeaveProject(project, currentReviewState(context, project, trustedCompilation)),
  });
}

async function projectMapping(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  const body = await readJsonBody(request);
    const project = context.runtimeState.campusweave!.store.get(requireString(body, "projectId"));
    assertRevision(project, requireNumber(body, "expectedRevision"));
    const trustedCompilation = await runCampusWeavePlanner(
      context.runtimeState.campusweave!.planner,
      "compile",
      { profile: project.profile },
    );
    assertTrustedCompilation(project, trustedCompilation);
    const result = projectCampusWeaveMapping(
      context,
      project,
      requireString(body, "mappingId"),
      requireString(body, "expectedWorkspaceRevision"),
      currentReviewState(context, project, trustedCompilation),
    );
    sendJson(response, 200, {
      workspace: result.workspace,
      revision: result.revision,
      active_workspace_id: context.runtimeState.campusweave!.activeWorkspaceId,
      project_revision: project.revision,
    });
}

function currentReviewState(
  context: EditorRequestContext,
  project: CampusWeaveProject,
  trustedCompilation: unknown,
): CampusWeaveReviewCurrentState {
  const runtime = context.runtimeState.campusweave!;
  const mappingReasons = new Map<number, string>();
  const workspaces = new Map<string, {
    available: boolean;
    policyRevision?: string;
    artifact?: { policyRevision: string; artifactDigest: string; catalogDigest: string; assuranceDigest?: string };
  }>();
  for (const workspace of project.workspace_refs) {
    try {
      const snapshot = loadEditorWorkspaceState({
        workspaceDir: runtime.store.workspacePath(workspace.id),
        appleSchemaRevision: context.appleSchema.source.revision,
      });
      const policyRevision = snapshot.revision;
      for (const [index, mapping] of project.mappings.entries()) {
        if (mapping.workspace_id !== workspace.id) continue;
        try { applyCampusWeaveMapping(structuredClone(snapshot.workspace), mapping, context.bundle); }
        catch (error) { mappingReasons.set(index, error instanceof Error ? error.message : "Mapped configuration is invalid"); }
      }
      const artifact = runtime.store.artifact(workspace.id);
      workspaces.set(workspace.id, {
        available: true,
        policyRevision,
        ...(artifact === undefined ? {} : { artifact: {
          policyRevision: artifact.policyRevision,
          artifactDigest: artifact.artifactDigest,
          catalogDigest: artifact.catalogDigest,
          ...(artifact.assuranceDigest === undefined ? {} : { assuranceDigest: artifact.assuranceDigest }),
        } }),
      });
    } catch {
      workspaces.set(workspace.id, { available: false });
    }
  }
  const trusted = typeof trustedCompilation === "object" && trustedCompilation !== null && !Array.isArray(trustedCompilation)
    ? trustedCompilation as Record<string, unknown>
    : undefined;
  const assuranceDigest = campusWeaveAssuranceDigest(context, project);
  return {
    catalogDigest: runtime.catalogDigest,
    ...(assuranceDigest === undefined ? {} : { assuranceDigest }),
    workspaces,
    mappingReasons,
    ...(trusted === undefined ? {} : { trustedCompilation: trusted }),
  };
}

function withCatalogDigest(result: unknown, context: EditorRequestContext): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return result;
  return { ...result, catalog_digest: context.runtimeState.campusweave!.catalogDigest };
}

function assertTrustedCompilation(project: CampusWeaveProject, trusted: unknown): void {
  if (typeof trusted !== "object" || trusted === null || Array.isArray(trusted)) throw badRequest("Planner compile result is invalid");
  const compiled = trusted as Record<string, unknown>;
  if (compiled.valid !== true) throw badRequest("Project profile does not pass current planner validation");
  if (project.compiled_plan === null
    || project.compiled_plan.profile_digest !== compiled.profile_digest
    || project.compiled_plan.plan_digest !== compiled.plan_digest) {
    throw badRequest("Saved compiled plan does not match the current trusted planner result");
  }
}

function listWorkspaces(url: URL, response: ServerResponse, context: EditorRequestContext): void {
  const project = context.runtimeState.campusweave!.store.get(requireQueryId(url, "projectId"));
  sendJson(response, 200, {
    workspaces: project.workspace_refs,
    active_workspace_id: context.runtimeState.campusweave!.activeWorkspaceId ?? null,
  });
}

function createWorkspace(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  return withBody(request, (body) => {
    const runtime = context.runtimeState.campusweave!;
    const projectId = requireString(body, "projectId");
    const expectedRevision = requireNumber(body, "expectedRevision");
    const workspaceRef: CampusWeaveWorkspaceRef = {
      id: randomUUID(),
      name: requireString(body, "name"),
      platform: requireString(body, "platform"),
      created_at: new Date().toISOString(),
    };
    const workspacePath = runtime.store.workspacePath(workspaceRef.id);
    const pending = runtime.store.beginWorkspace(projectId, workspaceRef, expectedRevision);
    let project: CampusWeaveProject;
    try {
    initializeNewWorkspace({
      workspace: workspacePath,
      name: workspaceRef.name,
      platform: workspaceRef.platform,
      serverVersion: context.bundle.serverVersion,
    }, editorWorkspaceInitializationPort);
    project = runtime.store.completeWorkspace(projectId, pending.operation.id, pending.project.revision);
    } catch (error) {
      sendJson(response, 409, {
        error: error instanceof Error ? error.message : "Workspace creation interrupted",
        project: runtime.store.get(projectId),
        transactions: { workspace: "unconfirmed", project: "pending", recovery_operation_id: pending.operation.id },
      });
      return;
    }
    runtime.activeWorkspaceId = workspaceRef.id;
    runtime.activeProjectId = project.id;
    runtime.activeWorkspaceDir = workspacePath;
    const revision = loadEditorWorkspaceState({ workspaceDir: workspacePath, appleSchemaRevision: context.appleSchema.source.revision }).revision;
    sendJson(response, 200, {
      workspace: workspaceRef,
      workspace_revision: revision,
      project,
      active_workspace_id: workspaceRef.id,
      transactions: { workspace: "committed", project: "committed", recovery_operation_id: pending.operation.id },
    });
  });
}

function activateWorkspace(request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<void> {
  return withBody(request, (body) => {
    const runtime = context.runtimeState.campusweave!;
    const project = runtime.store.get(requireString(body, "projectId"));
    const workspaceId = requireString(body, "workspaceId");
    if (!project.workspace_refs.some((workspace) => workspace.id === workspaceId)) {
      throw badRequest("Workspace is not attached to the selected project");
    }
    const workspaceDir = runtime.store.workspacePath(workspaceId);
    const state = loadEditorWorkspaceState({ workspaceDir, appleSchemaRevision: context.appleSchema.source.revision });
    runtime.activeWorkspaceDir = workspaceDir;
    runtime.activeWorkspaceId = workspaceId;
    runtime.activeProjectId = project.id;
    sendJson(response, 200, {
      active_workspace_id: workspaceId,
      workspace: state.workspace,
      sidecar: state.sidecar,
      revision: state.revision,
    });
  });
}

async function withBody(request: IncomingMessage, action: (body: Awaited<ReturnType<typeof readJsonBody>>) => void): Promise<void> {
  action(await readJsonBody(request));
}

function requireQueryId(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value === null || value.length === 0) throw badRequest(`Expected query parameter: ${key}`);
  return value;
}

function assertRevision(project: CampusWeaveProject, expected: number): void {
  if (project.revision !== expected) {
    throw new CampusWeaveRevisionConflictError(`CampusWeave project revision conflict: expected ${String(expected)}, current ${String(project.revision)}`);
  }
}

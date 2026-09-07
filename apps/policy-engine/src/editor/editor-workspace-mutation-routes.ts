/** Implements authenticated workspace mutation endpoints for the editor. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./editor-routes-utils.js";
import { requireNumber, requireString } from "./editor-api-request-input.js";
import { badRequest, type JsonRecord } from "./editor-http-error.js";
import { readJsonBody } from "./editor-json-body.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import {
  addAppleCompatConfigurationToLoadedWorkspace,
  addConfigurationToLoadedWorkspace,
} from "../workspace/workspace-configuration-actions.js";
import {
  moveConfigurationInLoadedWorkspace,
  removeConfigurationFromLoadedWorkspace,
} from "../workspace/workspace-configuration-ordering.js";
import { addPolicyToLoadedWorkspace } from "../workspace/workspace-policy-actions.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { editorWorkspaceStateInput, type EditorRequestContext } from "./editor-server-contract.js";
import { mutateEditorWorkspaceState } from "../workspace-state/editor-port.js";
import { parseExpectedRevisionBody } from "./editor-domain-request-input.js";

interface WorkspaceMutationResult {
  readonly workspace: PolicyWorkspace;
  readonly extra?: JsonRecord;
}

const WORKSPACE_MUTATION_ROUTES: readonly {
  readonly path: string;
  readonly mutate: (workspace: PolicyWorkspace, bundle: RelutionTemplateBundle, body: JsonRecord) => WorkspaceMutationResult;
}[] = [
  {
    path: "/api/add-configuration",
    mutate: (workspace, bundle, body) => ({
      workspace: addConfigurationToLoadedWorkspace(workspace, bundle, {
        policyPath: requireString(body, "policyPath"),
        versionIndex: requireNumber(body, "versionIndex"),
        type: requireString(body, "type"),
      }),
    }),
  },
  {
    path: "/api/apple-compat/add",
    mutate: (workspace, _bundle, body) => ({
      workspace: addAppleCompatConfigurationToLoadedWorkspace(workspace, {
        policyPath: requireString(body, "policyPath"),
        versionIndex: requireNumber(body, "versionIndex"),
        settingId: requireString(body, "settingId"),
      }),
    }),
  },
  {
    path: "/api/configuration/remove",
    mutate: (workspace, _bundle, body) => ({
      workspace: removeConfigurationFromLoadedWorkspace(workspace, {
        policyPath: requireString(body, "policyPath"),
        versionIndex: requireNumber(body, "versionIndex"),
        configurationIndex: requireNumber(body, "configurationIndex"),
      }),
    }),
  },
  {
    path: "/api/configuration/move",
    mutate: (workspace, _bundle, body) => ({
      workspace: moveConfigurationInLoadedWorkspace(workspace, {
        policyPath: requireString(body, "policyPath"),
        versionIndex: requireNumber(body, "versionIndex"),
        configurationIndex: requireNumber(body, "configurationIndex"),
        direction: requireMoveDirection(body),
      }),
    }),
  },
  {
    path: "/api/add-policy",
    mutate: (workspace, bundle, body) => {
      const result = addPolicyToLoadedWorkspace(workspace, bundle, {
        platform: requireString(body, "platform"),
        name: requireString(body, "name"),
      });
      return { workspace: result.workspace, extra: { policyPath: result.policyPath } };
    },
  },
];

export async function handleWorkspaceMutationApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const route = WORKSPACE_MUTATION_ROUTES.find((candidate) => candidate.path === url.pathname);
  if (route === undefined || request.method !== "POST") return false;

  const body = await readJsonBody(request);
  const expectedRevision = parseExpectedRevisionBody(body);
  let extra: JsonRecord | undefined;
  const { workspace, revision } = mutateEditorWorkspaceState(editorWorkspaceStateInput(context), (workspace) => {
    const result = route.mutate(workspace, context.bundle, body);
    extra = result.extra;
    return result.workspace;
  }, expectedRevision);
  sendJson(response, 200, {
    workspace,
    revision,
    validation: validateWorkspace(workspace, context.bundle),
    ...extra,
  });
  return true;
}

function requireMoveDirection(body: JsonRecord): "up" | "down" {
  const direction = requireString(body, "direction");
  if (direction !== "up" && direction !== "down") {
    throw badRequest(`Unsupported move direction: ${direction}`);
  }
  return direction;
}

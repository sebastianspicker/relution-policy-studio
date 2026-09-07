/** Composes Apple schema, artifact, and mobileconfig API handlers. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleDdmArtifactApiRequest, handleMdmCommandArtifactApiRequest } from "./editor-server-apple-artifact-routes.js";
import { handleAppleProfileApiRequest } from "./editor-server-apple-profile-routes.js";
import { handleMobileConfigInspectApiRequest } from "./editor-server-mobileconfig-routes.js";
import { runEditorApiHandlers, type EditorApiHandler, type EditorRequestContext } from "./editor-server-contract.js";

const APPLE_ARTIFACT_API_HANDLERS: readonly EditorApiHandler[] = [
  handleAppleProfileApiRequest,
  handleDdmArtifactApiRequest,
  handleMdmCommandArtifactApiRequest,
  handleMobileConfigInspectApiRequest,
];

export async function handleAppleArtifactApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  return await runEditorApiHandlers(APPLE_ARTIFACT_API_HANDLERS, url, request, response, context);
}

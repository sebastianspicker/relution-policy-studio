/** Routes DDM and MDM-command artifact endpoints through shared mutations. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { DDM_ARTIFACT_ROUTE, MDM_COMMAND_ARTIFACT_ROUTE } from "./editor-server-apple-artifact-definitions.js";
import { handleManagedAppleArtifactApiRequest } from "./editor-server-apple-artifact-mutation.js";
import type { EditorRequestContext } from "./editor-server-contract.js";

export async function handleDdmArtifactApiRequest(url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<boolean> {
  return await handleManagedAppleArtifactApiRequest(url, request, response, context, DDM_ARTIFACT_ROUTE);
}

export async function handleMdmCommandArtifactApiRequest(url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<boolean> {
  return await handleManagedAppleArtifactApiRequest(url, request, response, context, MDM_COMMAND_ARTIFACT_ROUTE);
}

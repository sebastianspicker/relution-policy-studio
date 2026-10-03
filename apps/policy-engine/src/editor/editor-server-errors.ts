/** Converts route failures into one safe editor HTTP response. */
import type { ServerResponse } from "node:http";
import { SidecarInputError } from "../workspace-state/sidecar-types.js";
import { isZammadOperationError } from "../integrations/zammad/zammad-operation-error.js";
import { HttpError } from "./editor-http-error.js";
import { isEditorMutationCancellation } from "./editor-mutation-routing.js";
import { sendJson } from "./editor-routes-utils.js";
import { WorkspaceInputError } from "../workspace/input-values.js";
import { WorkspaceStateRevisionConflictError } from "../workspace-state/editor-port.js";
import {
  CampusWeaveCapacityError,
  CampusWeaveInputError,
  CampusWeaveNotFoundError,
  CampusWeavePlannerError,
  CampusWeaveRevisionConflictError,
  CampusWeaveStoreBusyError,
} from "../contracts/campusweave-errors.js";

interface EditorServerErrorDescriptor {
  readonly status: number;
  readonly message: string;
}

export function describeEditorServerError(error: unknown): EditorServerErrorDescriptor {
  if (isZammadOperationError(error)) {
    switch (error.context.kind) {
      case "uncertain-outcome":
        return { status: 409, message: error.message };
      case "store-capacity":
      case "store-busy":
        return { status: 503, message: error.message };
    }
  }
  if (error instanceof HttpError) {
    return {
      status: error.status,
      message: error.expose || error.status < 500 ? error.message : "Internal editor error",
    };
  }
  if (error instanceof WorkspaceStateRevisionConflictError) {
    return { status: 409, message: error.message };
  }
  if (error instanceof CampusWeaveRevisionConflictError) {
    return { status: 409, message: error.message };
  }
  if (error instanceof CampusWeaveStoreBusyError) {
    return { status: 503, message: error.message };
  }
  if (error instanceof CampusWeaveInputError) return { status: 400, message: error.message };
  if (error instanceof CampusWeaveNotFoundError) return { status: 404, message: error.message };
  if (error instanceof CampusWeaveCapacityError) return { status: 413, message: error.message };
  if (error instanceof CampusWeavePlannerError) {
    const status = error.kind === "capacity" ? 413 : error.kind === "rejected" ? 422 : error.kind === "timeout" ? 504 : 502;
    return { status, message: error.message };
  }
  if (error instanceof WorkspaceInputError || error instanceof SidecarInputError) {
    return { status: 400, message: error.message };
  }
  return { status: 500, message: "Internal editor error" };
}

export function handleEditorServerError(response: ServerResponse, error: unknown): void {
  if (isEditorMutationCancellation(error)) return;
  const descriptor = describeEditorServerError(error);
  if (descriptor.status >= 500) console.error(error);
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  sendJson(response, descriptor.status, { error: descriptor.message });
}

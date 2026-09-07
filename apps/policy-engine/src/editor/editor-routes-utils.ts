/** Shares response and request parsing helpers across editor API routes. */
import type { ServerResponse } from "node:http";
import { badRequest } from "./editor-http-error.js";

export interface RuntimeConnectionState<T> {
  readonly connection?: T;
}

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.on("error", (error) => {
    console.error("[editor response error]", error.message);
  });
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(JSON.stringify(value));
}

export function requireRuntimeConnection<T>(runtime: RuntimeConnectionState<T>, service: string): T {
  if (runtime.connection === undefined) {
    throw badRequest(`${service} API session is not configured`);
  }
  return runtime.connection;
}

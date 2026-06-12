import type { ServerResponse } from "node:http";
import { badRequest } from "./editor-server-helpers.js";

export interface RuntimeConnectionState<T> {
  readonly connection?: T;
}

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.on("error", (error) => {
    console.error("[editor response error]", error.message);
  });
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export function requireRuntimeConnection<T>(runtime: RuntimeConnectionState<T>, service: string): T {
  if (runtime.connection === undefined) {
    throw badRequest(`${service} API session is not configured`);
  }
  return runtime.connection;
}

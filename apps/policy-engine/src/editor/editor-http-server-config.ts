/** Applies bounded request and connection limits to the local editor server. */
import type { Server } from "node:http";

export function configureEditorHttpServer(server: Server): void {
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
}

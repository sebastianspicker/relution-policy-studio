// Enforces read-only Relution requests and delegates authenticated network transport.
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import type { RelutionConnection } from "./relution-api-types.js";
import { createServiceNetworkError, fetchServiceApi } from "../../platform/network/service-api-request.js";

export async function relutionFetch(
  connection: RelutionConnection,
  path: string,
  init: RequestInit,
  transportOptions: HttpServiceTransportOptions,
): Promise<Response> {
  assertRelutionReadOnlyRequest(init.method, path);
  return await fetchServiceApi({
    connection,
    serviceName: "Relution",
    path,
    init,
    transportOptions,
    serviceHeaders: {
      "accept": "application/json",
      "accept-charset": "UTF-8",
      "content-type": "application/json",
      "X-User-Access-Token": connection.apiToken,
    },
    createNetworkError: createServiceNetworkError("RelutionNetworkError"),
  });
}

function assertRelutionReadOnlyRequest(method: string | undefined, path: string): void {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  // Relution exposes device search as POST, but this endpoint only reads base
  // device information. Do not add mutating endpoints here for production use.
  if (normalizedMethod === "POST" && path === "/api/v2/devices/baseInfo/query") {
    return;
  }
  throw new Error(`Blocked non-read-only Relution API request: ${normalizedMethod} ${path}`);
}

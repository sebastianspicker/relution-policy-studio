/** Performs Zammad requests through the shared pinned-service transport. */
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { createServiceNetworkError, fetchServiceApi } from "../../platform/network/service-api-request.js";
import type { ZammadConnection } from "../../contracts/zammad.js";

export async function zammadFetch(
  connection: ZammadConnection,
  path: string,
  init: RequestInit,
  transportOptions: HttpServiceTransportOptions,
  query?: URLSearchParams,
): Promise<Response> {
  return await fetchServiceApi({
    connection,
    serviceName: "Zammad",
    path,
    init,
    transportOptions,
    serviceHeaders: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Token token=${connection.apiToken}`,
    },
    createNetworkError: createServiceNetworkError("ZammadNetworkError"),
    ...(query === undefined ? {} : { query }),
  });
}

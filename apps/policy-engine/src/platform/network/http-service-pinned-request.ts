/** Executes a prepared HTTP(S) request against its pre-approved address set. */
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type TcpNetConnectOpts } from "node:net";
import type { ResolvedServiceAddress } from "./outbound-host-policy.js";
import { preparePinnedHttpServiceRequest } from "./http-service-node-adapter.js";
import { incomingMessageToResponse } from "./http-service-incoming-response.js";
import { approvedAddressLookup, normalizedUrlHostname } from "./http-service-pinned-lookup.js";

export async function requestPinnedHttpServiceUrl(
  url: URL,
  init: RequestInit,
  addresses: readonly ResolvedServiceAddress[],
  maxResponseBytes: number,
): Promise<Response> {
  const { body, headers } = preparePinnedHttpServiceRequest(url, init);
  const requestOptions: RequestOptions & Pick<TcpNetConnectOpts, "autoSelectFamily" | "autoSelectFamilyAttemptTimeout"> = {
    method: init.method ?? "GET",
    hostname: normalizedUrlHostname(url.hostname),
    path: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(headers.entries()),
    lookup: approvedAddressLookup(url.hostname, addresses),
    autoSelectFamily: addresses.length > 1,
    autoSelectFamilyAttemptTimeout: 250,
    agent: false,
    ...(url.port.length === 0 ? {} : { port: Number(url.port) }),
    ...(init.signal === undefined || init.signal === null ? {} : { signal: init.signal }),
  };
  return await new Promise<Response>((resolveResponse, rejectResponse) => {
    const onResponse = (incoming: IncomingMessage): void => {
      void incomingMessageToResponse(incoming, maxResponseBytes).then(resolveResponse, rejectResponse);
    };
    const request = url.protocol === "https:"
      ? httpsRequest({ ...requestOptions, ...(tlsServerName(url.hostname) === undefined ? {} : { servername: tlsServerName(url.hostname) }) }, onResponse)
      : httpRequest(requestOptions, onResponse);
    request.once("error", rejectResponse);
    request.end(body);
  });
}

function tlsServerName(hostname: string): string | undefined {
  const normalized = normalizedUrlHostname(hostname);
  return isIP(normalized) === 0 ? normalized : undefined;
}

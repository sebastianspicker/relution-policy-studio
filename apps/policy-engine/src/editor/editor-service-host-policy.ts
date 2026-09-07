/** Applies the shared literal and DNS host policy to outbound editor services. */
import { badRequest, HttpError } from "./editor-http-error.js";
import type { HttpServiceTransportOptions } from "../platform/network/http-service-transport.js";
import { literalServiceHostPolicyError, outboundHostPolicyError } from "../platform/network/outbound-host-policy.js";

export async function assertAllowedEditorServiceHost(
  service: string,
  host: string,
  allowLocalServiceHosts: boolean,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<void> {
  const literalError = literalServiceHostPolicyError(service, host, allowLocalServiceHosts);
  if (literalError !== undefined) throw badRequest(literalError);
  const adapter = transportOptions.adapter;
  const resolver = adapter === undefined ? undefined : async (serviceName: string, hostname: string): Promise<string[]> =>
    (await adapter.resolveAddresses(serviceName, hostname, allowLocalServiceHosts)).map((entry) => entry.address);
  const dnsError = await outboundHostPolicyError(service, host, allowLocalServiceHosts, resolver);
  if (dnsError === undefined) return;
  if (dnsError.kind === "blocked") throw badRequest(dnsError.reason);
  throw new HttpError(502, dnsError.error);
}

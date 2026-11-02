/** Checks DNS-resolved service hosts against the outbound-address policy. */
import {
  blockedServiceAddressReason,
  isBlockedServiceAddress,
} from "./outbound-host-classification.js";
import {
  resolveValidatedServiceAddresses,
  type ServiceAddressResolver,
} from "./outbound-host-resolution.js";
import type { OutboundHostPolicyResult } from "./outbound-host-policy-types.js";

/** Resolves before session setup so hostnames cannot conceal local addresses. */
export async function outboundHostPolicyError(
  serviceName: string,
  host: string,
  allowLocalServiceHosts: boolean,
  resolveAddresses?: ServiceAddressResolver,
  timeoutMs?: number,
): Promise<OutboundHostPolicyResult> {
  if (allowLocalServiceHosts) return undefined;
  try {
    const resolved = await resolveValidatedServiceAddresses(serviceName, host, resolveAddresses, timeoutMs);
    const blockedAddress = resolved.addresses.find((entry) => isBlockedServiceAddress(entry.address));
    return blockedAddress === undefined ? undefined : { kind: "blocked", reason: blockedServiceAddressReason(serviceName, blockedAddress.address) };
  } catch (error) {
    return { kind: "dns-failure", error: error instanceof Error ? error.message : String(error) };
  }
}

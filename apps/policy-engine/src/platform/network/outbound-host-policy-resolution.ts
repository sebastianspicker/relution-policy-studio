/** Resolves service hosts and rejects private addresses before socket pinning. */
import {
  blockedServiceAddressReason,
  isBlockedServiceAddress,
} from "./outbound-host-classification.js";
import {
  resolveValidatedServiceAddresses,
  type ResolvedServiceAddress,
  type ServiceAddressResolver,
} from "./outbound-host-resolution.js";

/** Resolves once and returns exact, policy-approved addresses for socket pinning. */
export async function resolveAllowedServiceAddresses(
  serviceName: string,
  host: string,
  allowLocalServiceHosts: boolean,
  resolveAddresses?: ServiceAddressResolver,
  timeoutMs?: number,
): Promise<ResolvedServiceAddress[]> {
  const resolved = await resolveValidatedServiceAddresses(serviceName, host, resolveAddresses, timeoutMs);
  if (!allowLocalServiceHosts) {
    const blockedAddress = resolved.addresses.find((entry) => isBlockedServiceAddress(entry.address));
    if (blockedAddress !== undefined) throw new Error(blockedServiceAddressReason(serviceName, blockedAddress.address));
  }
  return resolved.addresses;
}

/** Rejects literal private service addresses before DNS preflight. */
import { isIP } from "node:net";
import {
  blockedServiceAddressReason,
  isBlockedServiceAddress,
  normalizeServiceHostname,
} from "./outbound-host-classification.js";

/** Rejects a literal blocked host before DNS preflight. */
export function literalServiceHostPolicyError(serviceName: string, host: string, allowLocalServiceHosts: boolean): string | undefined {
  if (allowLocalServiceHosts) return undefined;
  const hostname = normalizeServiceHostname(host);
  return isIP(hostname) !== 0 && isBlockedServiceAddress(hostname)
    ? blockedServiceAddressReason(serviceName, hostname)
    : undefined;
}

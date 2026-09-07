/** Enforces outbound host policy and DNS-based private-network protections. */
export type { ResolvedServiceAddress } from "./outbound-host-resolution.js";
export { assertOutboundHostAllowed, outboundHostPolicyError } from "./outbound-host-policy-check.js";
export { resolveAllowedServiceAddresses } from "./outbound-host-policy-resolution.js";
export { literalServiceHostPolicyError } from "./outbound-host-literal-policy.js";

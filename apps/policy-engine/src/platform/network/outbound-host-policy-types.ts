/** Declares the public result contract for outbound host policy. */

export type OutboundHostPolicyResult =
  | { kind: "blocked"; reason: string }
  | { kind: "dns-failure"; error: string }
  | undefined;

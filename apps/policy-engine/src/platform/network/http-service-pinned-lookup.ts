/** Supplies Node with only the already approved addresses for a service hostname. */
import { type LookupFunction } from "node:net";
import { normalizeHttpHostname } from "./connection-host-input.js";
import type { ResolvedServiceAddress } from "./outbound-host-policy.js";

export function approvedAddressLookup(expectedHostname: string, addresses: readonly ResolvedServiceAddress[]): LookupFunction {
  const normalizedExpectedHostname = normalizeHttpHostname(expectedHostname).toLowerCase();
  return (hostname, options, callback): void => {
    if (normalizeHttpHostname(hostname).toLowerCase() !== normalizedExpectedHostname) {
      callback(Object.assign(new Error("Pinned HTTP lookup received an unexpected hostname"), { code: "EHOSTUNREACH" }), "");
      return;
    }
    if (options.all) {
      callback(null, addresses.map(({ address, family }) => ({ address, family })));
      return;
    }
    const first = addresses[0];
    if (first === undefined) {
      callback(Object.assign(new Error("Pinned HTTP lookup has no approved address"), { code: "EHOSTUNREACH" }), "");
      return;
    }
    callback(null, first.address, first.family);
  };
}

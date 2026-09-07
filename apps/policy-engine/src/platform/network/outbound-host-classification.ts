/** Classifies normalized IP addresses for the outbound service-host policy. */
import { BlockList, isIP } from "node:net";

const blockedServiceAddresses = new BlockList();
// RFC 6890 unspecified address.
blockedServiceAddresses.addAddress("0.0.0.0", "ipv4");
blockedServiceAddresses.addSubnet("0.0.0.0", 8, "ipv4");
// RFC 1918 private networks.
blockedServiceAddresses.addSubnet("10.0.0.0", 8, "ipv4");
// RFC 6598 shared address space.
blockedServiceAddresses.addSubnet("100.64.0.0", 10, "ipv4");
// RFC 1122 loopback.
blockedServiceAddresses.addSubnet("127.0.0.0", 8, "ipv4");
// RFC 3927 IPv4 link-local.
blockedServiceAddresses.addSubnet("169.254.0.0", 16, "ipv4");
// RFC 1918 private networks.
blockedServiceAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedServiceAddresses.addSubnet("192.168.0.0", 16, "ipv4");
// IANA special-purpose protocol assignments and deprecated 6to4 relay anycast.
blockedServiceAddresses.addSubnet("192.0.0.0", 24, "ipv4");
blockedServiceAddresses.addSubnet("192.88.99.0", 24, "ipv4");
// RFC 2544 benchmarking and RFC 5737 documentation ranges.
blockedServiceAddresses.addSubnet("192.0.2.0", 24, "ipv4");
blockedServiceAddresses.addSubnet("198.18.0.0", 15, "ipv4");
blockedServiceAddresses.addSubnet("198.51.100.0", 24, "ipv4");
blockedServiceAddresses.addSubnet("203.0.113.0", 24, "ipv4");
// RFC 5771 multicast, RFC 1112 reserved, and limited broadcast space.
blockedServiceAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedServiceAddresses.addSubnet("240.0.0.0", 4, "ipv4");
// RFC 4291 unspecified and loopback.
blockedServiceAddresses.addAddress("::", "ipv6");
blockedServiceAddresses.addAddress("::1", "ipv6");
// IPv4-compatible/translatable forms can embed a local IPv4 target.
blockedServiceAddresses.addSubnet("::", 96, "ipv6");
blockedServiceAddresses.addSubnet("::ffff:0:0:0", 96, "ipv6");
blockedServiceAddresses.addSubnet("64:ff9b::", 96, "ipv6");
blockedServiceAddresses.addSubnet("64:ff9b:1::", 48, "ipv6");
// RFC 6666 discard-only and RFC 3849 documentation ranges.
blockedServiceAddresses.addSubnet("100::", 64, "ipv6");
// RFC 3879 deprecated site-local addresses.
blockedServiceAddresses.addSubnet("fec0::", 10, "ipv6");
// IETF protocol assignments and transition ranges can encode other addresses.
blockedServiceAddresses.addSubnet("2001::", 23, "ipv6");
blockedServiceAddresses.addSubnet("2002::", 16, "ipv6");
blockedServiceAddresses.addSubnet("2001:db8::", 32, "ipv6");
// Documentation and segment-routing SID ranges are not public service hosts.
blockedServiceAddresses.addSubnet("3fff::", 20, "ipv6");
blockedServiceAddresses.addSubnet("5f00::", 16, "ipv6");
// RFC 4193 unique local, RFC 4291 link-local, and RFC 4291 multicast.
blockedServiceAddresses.addSubnet("fc00::", 7, "ipv6");
blockedServiceAddresses.addSubnet("fe80::", 10, "ipv6");
blockedServiceAddresses.addSubnet("ff00::", 8, "ipv6");

export function normalizeServiceHostname(host: string): string {
  return host.trim().toLowerCase().replace(/^\[(.*)\]$/u, "$1").replace(/\.$/u, "");
}

export function isBlockedServiceAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedServiceAddresses.check(address, "ipv4");
  if (family === 6) return blockedServiceAddresses.check(address, "ipv6");
  return true;
}

export function blockedServiceAddressReason(serviceName: string, address: string): string {
  return `${serviceName} host resolves to a blocked local/private address (${address}); use --allow-local-service-hosts only for local Docker or lab targets`;
}

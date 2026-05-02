import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blockedServiceAddresses = new BlockList();
blockedServiceAddresses.addAddress("0.0.0.0", "ipv4");
blockedServiceAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedServiceAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedServiceAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedServiceAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedServiceAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedServiceAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedServiceAddresses.addAddress("::", "ipv6");
blockedServiceAddresses.addAddress("::1", "ipv6");
blockedServiceAddresses.addSubnet("fc00::", 7, "ipv6");
blockedServiceAddresses.addSubnet("fe80::", 10, "ipv6");
blockedServiceAddresses.addSubnet("ff00::", 8, "ipv6");

export async function outboundHostPolicyError(
  serviceName: string,
  host: string,
  allowLocalServiceHosts: boolean,
): Promise<string | undefined> {
  if (allowLocalServiceHosts) {
    return undefined;
  }

  const hostname = normalizeHostname(host);
  let addresses: string[];
  try {
    addresses = await resolveServiceAddresses(serviceName, hostname);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const blockedAddress = addresses.find((address) => isBlockedServiceAddress(address));
  if (blockedAddress === undefined) {
    return undefined;
  }

  return `${serviceName} host resolves to a blocked local/private address (${blockedAddress}); use --allow-local-service-hosts only for local Docker or lab targets`;
}

async function resolveServiceAddresses(serviceName: string, hostname: string): Promise<string[]> {
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    return [hostname];
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve ${serviceName} host "${hostname}": ${message}`);
  }
}

function isBlockedServiceAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return blockedServiceAddresses.check(address, "ipv4");
  }
  if (family === 6) {
    return blockedServiceAddresses.check(address, "ipv6");
  }
  return true;
}

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/^\[(.*)\]$/u, "$1").replace(/\.$/u, "");
}

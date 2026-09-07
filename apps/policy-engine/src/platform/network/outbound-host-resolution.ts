/** Resolves and validates outbound service addresses before socket pinning. */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { normalizeServiceHostname } from "./outbound-host-classification.js";

const DEFAULT_DNS_TIMEOUT_MS = 30_000;

export type ServiceAddressResolver = (serviceName: string, hostname: string) => Promise<string[]>;

export interface ResolvedServiceAddress {
  address: string;
  family: 4 | 6;
}

export interface ResolvedServiceAddresses {
  hostname: string;
  addresses: ResolvedServiceAddress[];
}

export async function resolveValidatedServiceAddresses(
  serviceName: string,
  host: string,
  resolveAddresses: ServiceAddressResolver = resolveServiceAddresses,
  timeoutMs = DEFAULT_DNS_TIMEOUT_MS,
): Promise<ResolvedServiceAddresses> {
  const hostname = normalizeServiceHostname(host);
  assertDnsTimeout(timeoutMs);
  let answers: string[];
  try {
    answers = await resolveWithTimeout(resolveAddresses(serviceName, hostname), serviceName, timeoutMs);
  } catch (error) {
    throw resolutionError(serviceName, hostname, errorMessage(error));
  }
  const uniqueAnswers = [...new Set(answers)];
  if (uniqueAnswers.length === 0) {
    throw resolutionError(serviceName, hostname, "DNS returned no addresses");
  }
  return { hostname, addresses: uniqueAnswers.map((address) => resolvedAddress(serviceName, hostname, address)) };
}

function resolvedAddress(serviceName: string, hostname: string, address: string): ResolvedServiceAddress {
  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw resolutionError(serviceName, hostname, `invalid address ${address}`);
  }
  return { address, family };
}

async function resolveServiceAddresses(_serviceName: string, hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) return [hostname];
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function resolveWithTimeout<T>(operation: Promise<T>, serviceName: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${serviceName} host resolution exceeded ${String(timeoutMs)}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function assertDnsTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("DNS timeout must be a positive safe integer");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolutionError(serviceName: string, hostname: string, detail: string): Error {
  return new Error(`Unable to resolve ${serviceName} host "${hostname}": ${detail}`);
}

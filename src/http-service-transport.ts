import type { NormalizedConnectionBase } from "./connection-normalization.js";

export function httpServiceRequestUrl(
  connection: NormalizedConnectionBase,
  path: string,
  serviceName: string,
): URL {
  const origin = `${connection.protocol}://${connection.port === undefined ? connection.host : `${connection.host}:${String(connection.port)}`}`;
  const url = new URL(`${connection.basePath}${path}`, origin);
  if (url.protocol !== `${connection.protocol}:` || url.hostname !== connection.host || url.pathname !== `${connection.basePath}${path}`) {
    throw new Error(`${serviceName} API path resolves outside configured service root: ${path}`);
  }
  return url;
}

export async function fetchHttpServiceUrl(
  connection: NormalizedConnectionBase,
  url: URL,
  init: RequestInit,
  serviceName: string,
): Promise<Response> {
  assertHttpServiceUrl(connection, url, serviceName);
  return await globalThis.fetch(url, init);
}

function assertHttpServiceUrl(connection: NormalizedConnectionBase, url: URL, serviceName: string): void {
  if (
    url.protocol !== `${connection.protocol}:`
    || url.hostname !== connection.host
    || url.port !== expectedUrlPort(connection.protocol, connection.port)
    || !url.pathname.startsWith(connection.basePath)
  ) {
    throw new Error(`${serviceName} API URL resolves outside configured service root: ${url.href}`);
  }
}

function expectedUrlPort(protocol: NormalizedConnectionBase["protocol"], port: number | undefined): string {
  if (port === undefined || (protocol === "https" && port === 443) || (protocol === "http" && port === 80)) {
    return "";
  }
  return String(port);
}

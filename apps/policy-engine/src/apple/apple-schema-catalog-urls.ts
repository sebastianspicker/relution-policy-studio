/** Builds and validates the only remote URLs allowed during catalog refreshes. */
import { APPLE_SCHEMA_SOURCE_PATHS, isKnownAppleSchemaSourcePath } from "./apple-schema-catalog-storage.js";
import { waitForAbort } from "../platform/network/http-service-abort.js";
import { responseWithinLimit } from "../platform/network/http-service-response.js";

const GITHUB_API_ROOT = "https://api.github.com/repos/apple/device-management/contents";
const GITHUB_RAW_ROOT = "https://raw.githubusercontent.com/apple/device-management";

export function appleSchemaGithubApiUrl(path: string, revision: string): URL {
  assertKnownAppleSchemaSourcePath(path);
  const url = new URL(`${GITHUB_API_ROOT}/${path}`);
  url.searchParams.set("ref", revision);
  return url;
}

export function appleSchemaRawDocumentUrl(path: string, name: string, revision: string): URL {
  assertKnownAppleSchemaSourcePath(path);
  if (!name.endsWith(".yaml") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Unexpected Apple schema document name: ${name}`);
  }
  return new URL(`${GITHUB_RAW_ROOT}/${encodeURIComponent(revision)}/${path}/${encodeURIComponent(name)}`);
}

/** Fetches one catalog resource without following redirects and with a bounded response body. */
export async function fetchAppleSchemaUrl(url: URL, signal: AbortSignal, maxResponseBytes: number): Promise<Response> {
  assertExpectedAppleSchemaUrl(url);
  const response = await waitForAbort(globalThis.fetch(url, { redirect: "manual", signal }), signal, {
    disposeLateValue: cancelResponseBody,
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Apple schema downloads must not redirect");
  }
  return await responseWithinLimit(response, maxResponseBytes, "Apple schema download", signal);
}

export function assertExpectedAppleSchemaDownloadUrl(value: string | undefined, expected: URL): void {
  if (value === undefined) return;
  const parsed = parseAppleSchemaDownloadUrl(value);
  if (!isExpectedAppleSchemaUrl(parsed) || parsed.href !== expected.href) {
    unexpectedAppleSchemaDownloadUrl(value);
  }
}

function assertKnownAppleSchemaSourcePath(path: string): void {
  if (!isKnownAppleSchemaSourcePath(path)) throw new Error(`Unexpected Apple schema source path: ${path}`);
}

function assertExpectedAppleSchemaUrl(url: URL): void {
  if (!isExpectedAppleSchemaUrl(url)) {
    throw new Error(`Unexpected Apple schema URL: ${url.href}`);
  }
}

function parseAppleSchemaDownloadUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    return unexpectedAppleSchemaDownloadUrl(value);
  }
}

function unexpectedAppleSchemaDownloadUrl(value: string): never {
  throw new Error(`Unexpected Apple schema download URL: ${value}`);
}

function isExpectedAppleSchemaUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "" || url.hash !== "") return false;
  if (url.hostname === "api.github.com") {
    const reference = url.searchParams.getAll("ref");
    return reference.length === 1
      && reference[0] !== undefined
      && reference[0].length > 0
      && [...url.searchParams.keys()].every((key) => key === "ref")
      && APPLE_SCHEMA_SOURCE_PATHS.some((source) => url.pathname === `/repos/apple/device-management/contents/${source.path}`);
  }
  if (url.hostname !== "raw.githubusercontent.com" || url.search !== "") return false;
  const segments = url.pathname.split("/");
  if (segments[0] !== "" || segments[1] !== "apple" || segments[2] !== "device-management") return false;
  const revision = segments[3];
  if (revision === undefined || revision.length === 0) return false;
  const documentPath = segments.slice(4).join("/");
  return APPLE_SCHEMA_SOURCE_PATHS.some((source) => {
    const prefix = `${source.path}/`;
    const name = documentPath.startsWith(prefix) ? documentPath.slice(prefix.length) : "";
    return name.length > 0 && name.endsWith(".yaml") && !name.includes("/") && !name.includes("\\");
  });
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

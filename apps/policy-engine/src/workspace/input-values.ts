/** Shares primitive workspace-input checks across creation and report validation. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

const UNSAFE_UUID_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class WorkspaceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceInputError";
  }
}

export function workspaceString(record: JsonRecord | undefined, key: string): string | undefined {
  return typeof record?.[key] === "string" ? record[key] : undefined;
}

export function isUnsafeWorkspaceUuid(value: string): boolean {
  return UNSAFE_UUID_KEYS.has(value);
}

function isUnsupportedWorkspacePlatform(platform: string, options: { allowed?: readonly string[]; allowUnknown?: boolean } = {}): boolean {
  return platform.trim().length === 0
    || (platform === "UNKNOWN" && options.allowUnknown !== true)
    || (options.allowed !== undefined && !options.allowed.includes(platform));
}

export function assertSupportedWorkspacePlatform(platform: string, options: { allowed?: readonly string[]; allowUnknown?: boolean } = {}): void {
  if (isUnsupportedWorkspacePlatform(platform, options)) {
    throw new WorkspaceInputError(`Unsupported policy platform: ${platform}`);
  }
}

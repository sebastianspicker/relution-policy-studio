/** Builds the shared JSON model used by workspace creation and ruleset imports. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

interface WorkspacePolicyDocumentOptions {
  uuid: string;
  versionUuid: string;
  now: number;
  name: string;
  platform: string;
  description: string;
  configurations?: unknown[];
}

export { createWorkspaceExportReport, recordPolicyInWorkspaceExportReport } from "./workspace-export-report.js";

export interface WorkspacePolicyEntryOptions extends WorkspacePolicyDocumentOptions {}

export function createWorkspacePolicyEntry(options: WorkspacePolicyEntryOptions): { path: string; document: JsonRecord } {
  return {
    path: `policies/policy_${options.uuid}.json`,
    document: createWorkspacePolicyDocument(options),
  };
}

export function createWorkspaceMetadata(serverVersion: string): JsonRecord {
  return {
    version: 1,
    type: "POLICY",
    serverVersion,
    cipherSpecVersion: 1,
    digestSpecVersion: 1,
    archiveFormatVersion: 1,
    fileFormatVersion: 1,
  };
}

function createWorkspacePolicyDocument(options: WorkspacePolicyDocumentOptions): JsonRecord {
  return {
    uuid: options.uuid,
    createdBy: "local",
    creationDate: options.now,
    modifiedBy: "local",
    modificationDate: options.now,
    organizationUuid: null,
    name: options.name,
    description: options.description,
    platform: options.platform,
    payloadUuid: null,
    deletedBy: null,
    deletionDate: null,
    versions: [
      {
        uuid: options.versionUuid,
        createdBy: "local",
        creationDate: options.now,
        modifiedBy: "local",
        modificationDate: options.now,
        version: 1,
        state: "PUBLISHED",
        name: "Version 1",
        description: null,
        publisher: null,
        publishDate: null,
        configurations: options.configurations ?? [],
      },
    ],
  };
}

export function workspaceConfigurationDetails(value: unknown): JsonRecord | undefined {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
  const details = record?.details;
  return typeof details === "object" && details !== null && !Array.isArray(details) ? (details as JsonRecord) : undefined;
}

export function workspaceConfigurationType(value: unknown): string | undefined {
  const details = workspaceConfigurationDetails(value);
  return typeof details?.type === "string" ? details.type : undefined;
}

export function invalidWorkspacePolicyPlatformMessage(platform: unknown): string {
  return `Policy platform is invalid: ${String(platform)}`;
}

export function incompatibleWorkspaceConfigurationMessage(type: string, platform: string): string {
  return `${type} is not compatible with policy platform ${platform}`;
}

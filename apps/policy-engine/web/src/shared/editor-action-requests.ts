/** Centralizes typed API request construction for editor actions. */
import { postJson } from "./editor-api-client.js";
import { parseAddSelection } from "./editor-configuration-utils.js";
import { asRecord, isEditorSidecarState, readJsonResponse } from "./editor-record-utils.js";
import type { AppState, JsonRecord } from "./editor-contracts.js";

export async function postAddConfiguration(
  addSelection: ReturnType<typeof parseAddSelection>,
  policyPath: string,
  versionIndex: number,
  expectedRevision: string,
): Promise<Response> {
  if (addSelection.kind === "apple-compat") {
    return await postJson("/api/apple-compat/add", { policyPath, versionIndex, settingId: addSelection.value, expectedRevision });
  }
  if (addSelection.kind === "apple-profile") {
    return await postJson("/api/apple-profile/add", { policyPath, versionIndex, schemaId: addSelection.value, expectedRevision });
  }
  if (addSelection.kind === "custom-settings") {
    return await postJson("/api/custom-settings/add", {
      policyPath,
      versionIndex,
      domain: "com.example.app",
      settings: {},
      displayName: "Application & Custom Settings",
      expectedRevision,
    });
  }
  return await postJson("/api/add-configuration", { policyPath, versionIndex, type: addSelection.value, expectedRevision });
}

export async function postSidecarActionRequest(url: string, body: JsonRecord, success: string): Promise<{ readonly sidecar: AppState["sidecar"]; readonly revision: string }> {
  const missing = Object.entries(body).find(([, value]) => typeof value === "string" && value.length === 0)?.[0];
  if (missing !== undefined) {
    const field = missing === "schemaId" ? (url.includes("/mdm-command/") ? "mdmCommandSchemaId" : "ddmSchemaId") : missing === "uuid" ? "artifact UUID" : missing;
    throw new Error(`${success} blocked: missing ${field}`);
  }
  const response = await postJson(url, body);
  const result = await readJsonResponse<{ sidecar?: unknown; revision?: unknown } & JsonRecord>(response);
  if (!response.ok || !isEditorSidecarState(result.sidecar) || typeof result.revision !== "string") {
    throw new Error(`${success} blocked: ${JSON.stringify(result)}`);
  }
  return { sidecar: result.sidecar, revision: result.revision };
}

export function parseArtifactValuesJson(valuesJson: string): JsonRecord {
  const parsed = JSON.parse(valuesJson.length === 0 ? "{}" : valuesJson) as unknown;
  const values = asRecord(parsed);
  if (values === undefined) {
    throw new Error("Artifact values JSON must be an object");
  }
  return values;
}

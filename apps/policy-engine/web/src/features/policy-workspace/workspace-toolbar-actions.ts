/** Pure helpers and download actions extracted from the workspace toolbar. */
import { networkEditorAuthHeaders } from "../../shared/editor-api-client.js";
import type { AppSection } from "../../shared/application-sections.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function workspaceContext(section: AppSection, controller: EditorController): readonly string[] {
  if (section === "baselines") return ["Baselines", "Policy guidance"];
  if (section === "device-audit") return ["Device audit", "Read-only posture"];
  if (section === "settings") return ["Settings", "Local workbench"];

  const policyName = typeof controller.policy?.document.name === "string"
    ? controller.policy.document.name
    : undefined;
  const configurationName = controller.appleCompatSetting?.label
    ?? controller.appleSchemaProfile?.title
    ?? controller.template?.label;
  return ["Policies", policyName, configurationName].filter((segment): segment is string => segment !== undefined && segment.length > 0);
}

export function reportDownloadError(error: unknown, setStatus: (status: string) => void): void {
  setStatus(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
}

export async function downloadOutputArchive(): Promise<void> {
  const response = await fetch("/api/output", { headers: networkEditorAuthHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to download output archive (${response.status}${response.statusText.length > 0 ? ` ${response.statusText}` : ""})`);
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = outputArchiveFileName(response.headers.get("content-disposition"));
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

function outputArchiveFileName(contentDisposition: string | null): string {
  const match = /filename="([^"]+)"/u.exec(contentDisposition ?? "");
  return match?.[1] ?? "rexp-studio-policy.rexp";
}

/** Safely applies sidecar mobileconfig snapshots to a cloned workspace. */
import type { PolicyWorkspace } from "../workspace/types.js";
import type { EditorSidecarState, MobileConfigRestoreEntry } from "./sidecar-types.js";
import { workspaceHasMobileConfig } from "./sidecar-mobileconfig-presence.js";
import { findMobileConfigTargetPolicy, findMobileConfigTargetVersion } from "./sidecar-mobileconfig-target.js";

export function reconcileMobileConfigRestoreEntries(workspace: PolicyWorkspace, sidecar: EditorSidecarState): PolicyWorkspace {
  const restored = structuredClone(workspace) as PolicyWorkspace;
  for (const entry of sidecar.mobileConfigRestore) restoreOneEntry(restored, entry);
  return restored;
}

function restoreOneEntry(workspace: PolicyWorkspace, entry: MobileConfigRestoreEntry): void {
  const policy = findMobileConfigTargetPolicy(workspace, entry);
  if (policy === undefined || workspaceHasMobileConfig(policy.document, entry)) return;
  const version = findMobileConfigTargetVersion(policy.document, entry);
  if (version === undefined) return;
  const configurations = Array.isArray(version.configurations) ? version.configurations : [];
  configurations.push(structuredClone(entry.configuration));
  version.configurations = configurations;
}

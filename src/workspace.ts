export function createWorkspaceSummary() {
  return { scope: "workspace", status: "ready" };
}

// current lane: workspace
export function workspaceTask() {
  return { scope: "workspace", status: "ready" };
}

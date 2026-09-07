/** Matches API namespaces only at a complete path-segment boundary. */
export function isEditorApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isEditorApiNamespace(pathname: string, namespace: "relution" | "zammad"): boolean {
  const prefix = `/api/${namespace}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

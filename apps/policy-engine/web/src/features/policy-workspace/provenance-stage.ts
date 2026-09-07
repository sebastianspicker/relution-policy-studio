/** Pure formatting for the workspace schema provenance value. */

export function provenanceSchemaLabel(serverVersion: string | undefined): string {
  const version = serverVersion?.trim();
  if (version !== undefined && version.length > 0) {
    return version.startsWith("Relution") ? version : `Relution ${version}`;
  }
  return "Relution 26.1.1";
}

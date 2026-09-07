/** Resolves fixed, symlink-free paths for the Zammad operation store. */
import { join } from "node:path";
import { resolveSymlinkFreePath } from "../../platform/filesystem/path-safety.js";

const PRIVATE_DIRECTORY = ".rexp-studio-private";
const OPERATIONS_DIRECTORY = "zammad-ticket-operations";
export const OPERATION_STORE_LOCK = ".capacity.lock";

export function operationsPath(workspace: string): string {
  const root = resolveSymlinkFreePath(workspace, "Zammad operation workspace");
  return resolveSymlinkFreePath(join(root, PRIVATE_DIRECTORY, OPERATIONS_DIRECTORY), "Zammad operation store");
}

export function operationPath(workspace: string, operationId: string): string {
  if (!validOperationId(operationId)) throw new Error("Invalid Zammad operation id");
  return resolveSymlinkFreePath(join(operationsPath(workspace), `${operationId}.json`), "Zammad operation record");
}

export function validOperationId(value: string): boolean {
  return value.length <= 96 && /^relution-op-[a-f0-9]{64}$/u.test(value);
}

/** Reads and writes bounded, validated Zammad operation records. */
import { readBoundedRegularFileNoFollow } from "../../platform/filesystem/bounded-file-read.js";
import { writePrivateFileAtomic } from "../../platform/filesystem/atomic-private-file.js";
import { hasErrorCode } from "../../platform/filesystem/error-code.js";
import { MAX_OPERATION_BYTES, type PersistedOperation } from "./zammad-operation-contract.js";
import { operationPath } from "./zammad-operation-paths.js";
import { parseOperation } from "./zammad-operation-record.js";

export function readOperation(workspace: string, operationId: string): PersistedOperation | undefined {
  let contents: Buffer;
  try {
    contents = readBoundedRegularFileNoFollow(operationPath(workspace, operationId), { label: "Zammad operation record", maxBytes: MAX_OPERATION_BYTES });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw new Error("Zammad operation record is unavailable; refusing ticket creation", { cause: error });
  }
  try {
    return parseOperation(JSON.parse(contents.toString("utf8")) as unknown, operationId);
  } catch (error) {
    throw new Error("Zammad operation record is invalid; refusing ticket creation", { cause: error });
  }
}

export function writeOperation(workspace: string, operation: PersistedOperation, force: boolean): void {
  const data = Buffer.from(`${JSON.stringify(operation)}\n`, "utf8");
  if (data.length > MAX_OPERATION_BYTES) throw new Error("Zammad operation record exceeds its byte limit; refusing ticket creation");
  writePrivateFileAtomic(operationPath(workspace, operation.id), data, { force, label: "Zammad operation record" });
}

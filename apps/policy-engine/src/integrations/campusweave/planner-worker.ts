/** Runs one bounded CampusWeave planner command over a fresh stdio worker. */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { JsonRecord } from "../../platform/serialization/json-guards.js";
import type { CampusWeavePlannerCommand } from "../../contracts/campusweave.js";
import { CampusWeaveInputError, CampusWeavePlannerError } from "../../contracts/campusweave-errors.js";

const MAX_REQUEST_BYTES = 1024 * 1024;
/** Matches the planner's MAX_RESPONSE_BYTES: a compiled plan is about as large as its profile. */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const COMMANDS = new Set<CampusWeavePlannerCommand>(["reference", "convert-v1", "validate", "compile"]);

export interface CampusWeavePlannerOptions {
  readonly pythonExecutable: string;
  readonly cwd: string;
  readonly timeoutMs?: number;
}

interface WorkerResponse {
  readonly version: 1;
  readonly id: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: unknown;
}

export async function runCampusWeavePlanner(
  options: CampusWeavePlannerOptions,
  command: CampusWeavePlannerCommand,
  payload: JsonRecord,
): Promise<unknown> {
  validatePlannerOptions(options);
  if (!COMMANDS.has(command)) throw new CampusWeaveInputError(`Unsupported CampusWeave planner command: ${String(command)}`);
  validatePayload(command, payload);
  const id = randomUUID();
  const request = Buffer.from(`${JSON.stringify({ version: 1, id, command, payload })}\n`, "utf8");
  if (request.length > MAX_REQUEST_BYTES) throw new CampusWeavePlannerError("capacity", "CampusWeave planner request exceeds 1 MiB; the profile is too large");
  const { response, stderr } = await exchangeWithWorker(options, request);
  if (response.version !== 1 || response.id !== id || typeof response.ok !== "boolean") {
    throw new CampusWeavePlannerError("unavailable", "CampusWeave planner returned an invalid response envelope");
  }
  if (!response.ok) throw new CampusWeavePlannerError("rejected", workerErrorMessage(response.error), stderr);
  if (!Object.hasOwn(response, "result")) throw new CampusWeavePlannerError("unavailable", "CampusWeave planner response is missing result");
  return response.result;
}

async function exchangeWithWorker(options: CampusWeavePlannerOptions, request: Buffer): Promise<{ response: WorkerResponse; stderr: string }> {
  return await new Promise<{ response: WorkerResponse; stderr: string }>((resolve, reject) => {
    const child = spawn(options.pythonExecutable, ["-m", "campusweave.commands.stdio"], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finishReject(new CampusWeavePlannerError("timeout", "CampusWeave planner timed out"));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const finishReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    child.once("error", (error) => finishReject(new CampusWeavePlannerError("unavailable", "Failed to start CampusWeave planner; see the host log", error.message)));
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_RESPONSE_BYTES) {
        child.kill("SIGKILL");
        finishReject(new CampusWeavePlannerError("unavailable", "CampusWeave planner response exceeds 4 MiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_REQUEST_BYTES) stderr.push(chunk);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const diagnostic = Buffer.concat(stderr).toString("utf8").trim().slice(-4000);
      try {
        const response = parseWorkerResponse(Buffer.concat(stdout));
        if (code !== 0 && response.ok) {
          reject(new CampusWeavePlannerError("unavailable", `CampusWeave planner exited with status ${String(code)}${signal === null ? "" : ` (${signal})`}`, diagnostic));
          return;
        }
        resolve({ response, stderr: diagnostic });
      } catch {
        // stderr may hold tracebacks with absolute paths: keep it in the host-only diagnostic.
        reject(new CampusWeavePlannerError("unavailable", diagnostic.length === 0 ? "CampusWeave planner failed" : "CampusWeave planner failed; see the host log", diagnostic));
      }
    });
    child.stdin.once("error", (error) => finishReject(new CampusWeavePlannerError("unavailable", `Failed to write CampusWeave planner request: ${error.message}`)));
    child.stdin.end(request);
  });
}

function parseWorkerResponse(buffer: Buffer): WorkerResponse {
  const text = buffer.toString("utf8");
  if (text.length === 0 || text.split(/\r?\n/u).filter((line) => line.length > 0).length !== 1) {
    throw new Error("Planner response must contain exactly one JSON line");
  }
  const value = JSON.parse(text) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Planner response must be an object");
  return value as WorkerResponse;
}

function validatePayload(command: CampusWeavePlannerCommand, payload: JsonRecord): void {
  const keys = Object.keys(payload);
  if (command === "reference") {
    if (keys.length !== 0) throw new CampusWeaveInputError("reference payload must be empty");
    return;
  }
  if (keys.length !== 1 || !Object.hasOwn(payload, "profile")) {
    throw new CampusWeaveInputError(`${command} payload must contain only profile`);
  }
}

function validatePlannerOptions(options: CampusWeavePlannerOptions): void {
  if (options.pythonExecutable.trim().length === 0 || !isAbsolute(options.pythonExecutable)) {
    throw new Error("CampusWeave planner pythonExecutable must be an absolute path");
  }
  if (options.cwd.trim().length === 0 || !isAbsolute(options.cwd)) {
    throw new Error("CampusWeave planner cwd must be an absolute path");
  }
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 120_000)) {
    throw new Error("CampusWeave planner timeoutMs must be between 100 and 120000");
  }
}

function workerErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.length > 0) return error.slice(0, 1000);
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    const details = "details" in error && Array.isArray(error.details) ? workerErrorDetails(error.details) : "";
    return `${error.message}${details}`.slice(0, 1000);
  }
  return "CampusWeave planner rejected the request";
}

function workerErrorDetails(details: readonly unknown[]): string {
  const lines = details.slice(0, 3).flatMap((detail) => {
    if (typeof detail !== "object" || detail === null) return [];
    const { path, message } = detail as { path?: unknown; message?: unknown };
    return typeof path === "string" && typeof message === "string" ? [`${path}: ${message}`] : [];
  });
  return lines.length === 0 ? "" : ` (${lines.join("; ")})`;
}

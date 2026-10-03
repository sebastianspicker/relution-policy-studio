/** Private, bounded, revisioned persistence for CampusWeave projects. */
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";
import { writePrivateFileAtomic } from "../platform/filesystem/atomic-private-file.js";
import type { CampusWeaveProfile, CampusWeaveProject, CampusWeaveWorkspaceRef } from "../contracts/campusweave.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import { CampusWeaveCapacityError, CampusWeaveInputError, CampusWeaveNotFoundError, CampusWeaveRevisionConflictError, CampusWeaveStoreBusyError } from "../contracts/campusweave-errors.js";
import { CAMPUSWEAVE_ID_PATTERN, emptyCampusWeaveProfile, parseCampusWeaveProfile, parseCampusWeaveProject } from "../contracts/campusweave-validation.js";
import { loadWorkspaceStateSnapshot } from "./persistence.js";

const MAX_PROJECT_BYTES = 4 * 1024 * 1024;
const MAX_PROJECTS = 256;

interface CampusWeaveProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly workspace_count: number;
}

interface CampusWeaveArtifactRecord {
  readonly workspaceId: string;
  readonly policyRevision: string;
  readonly artifactDigest: string;
  readonly catalogDigest: string;
  readonly assuranceDigest?: string;
  readonly builtAt: string;
}

interface CampusWeaveWorkspaceOperation extends JsonRecord {
  readonly id: string;
  readonly kind: "workspace-create";
  readonly status: "pending" | "committed";
  readonly workspace_id: string;
  readonly name: string;
  readonly platform: string;
  readonly created_at: string;
  readonly committed_at?: string;
}

export interface CampusWeaveProjectStore {
  readonly projectRoot: string;
  list(): CampusWeaveProjectSummary[];
  get(id: string): CampusWeaveProject;
  create(name: string, profile?: CampusWeaveProfile): CampusWeaveProject;
  save(project: CampusWeaveProject, expectedRevision: number): CampusWeaveProject;
  beginWorkspace(projectId: string, workspace: CampusWeaveWorkspaceRef, expectedRevision: number): { project: CampusWeaveProject; operation: CampusWeaveWorkspaceOperation };
  completeWorkspace(projectId: string, operationId: string, expectedRevision: number): CampusWeaveProject;
  workspacePath(workspaceId: string): string;
  recordArtifact(record: CampusWeaveArtifactRecord): void;
  artifact(workspaceId: string): CampusWeaveArtifactRecord | undefined;
  close(): void;
}

export function openCampusWeaveProjectStore(projectRoot: string): CampusWeaveProjectStore {
  const root = resolveSymlinkFreePath(projectRoot, "CampusWeave project root");
  preparePrivateDirectory(root, "CampusWeave project root");
  const projects = privateSubdirectory(root, "projects");
  const workspaces = privateSubdirectory(root, "workspaces");
  const artifacts = privateSubdirectory(root, "artifacts");
  const releaseLock = acquireWriterLock(root);
  let closed = false;
  return {
    projectRoot: root,
    list: () => listProjects(projects),
    get: (id) => readProject(projects, id),
    create: (name, profile) => createProject(projects, name, profile),
    save: (project, expectedRevision) => saveProject(projects, project, expectedRevision),
    beginWorkspace: (projectId, workspace, expectedRevision) => beginWorkspace(projects, projectId, workspace, expectedRevision),
    completeWorkspace: (projectId, operationId, expectedRevision) => completeWorkspace(projects, workspaces, projectId, operationId, expectedRevision),
    workspacePath: (workspaceId) => join(workspaces, assertIdentifier(workspaceId, "workspace id")),
    recordArtifact: (record) => publishArtifact(artifacts, record),
    artifact: (workspaceId) => readArtifact(artifacts, workspaceId),
    close: () => {
      if (closed) return;
      closed = true;
      releaseLock();
    },
  };
}

function listProjects(projects: string): CampusWeaveProjectSummary[] {
  const entries = projectFiles(projects);
  return entries.map((file) => {
    const project = readProjectFile(join(projects, file));
    return { id: project.id, name: project.name, revision: project.revision, workspace_count: project.workspace_refs.length };
  });
}

function createProject(projects: string, name: string, suppliedProfile?: CampusWeaveProfile): CampusWeaveProject {
  const normalizedName = requireName(name);
  if (projectFiles(projects).length >= MAX_PROJECTS) throw new CampusWeaveCapacityError("CampusWeave project limit reached");
  const id = randomUUID();
  const profile = suppliedProfile === undefined
    ? emptyCampusWeaveProfile(id, normalizedName)
    : parseCampusWeaveProfile(suppliedProfile);
  const project: CampusWeaveProject = {
    schema_version: 1,
    id,
    name: normalizedName,
    revision: 1,
    profile,
    compiled_plan: null,
    mappings: [],
    workspace_refs: [],
    evidence: [],
    operations: [],
  };
  publishProject(projects, project, false);
  return project;
}

function saveProject(projects: string, submitted: CampusWeaveProject, expectedRevision: number): CampusWeaveProject {
  const project = parseCampusWeaveProject(submitted);
  const current = readProject(projects, project.id);
  assertExpectedRevision(current, expectedRevision);
  if (project.revision !== expectedRevision) {
    throw new CampusWeaveRevisionConflictError("Submitted project revision does not match expectedRevision");
  }
  const next = {
    ...project,
    revision: expectedRevision + 1,
    workspace_refs: current.workspace_refs,
    operations: current.operations,
  };
  publishProject(projects, next, true);
  return next;
}

function beginWorkspace(
  projects: string,
  projectId: string,
  workspace: CampusWeaveWorkspaceRef,
  expectedRevision: number,
): { project: CampusWeaveProject; operation: CampusWeaveWorkspaceOperation } {
  const current = readProject(projects, projectId);
  assertExpectedRevision(current, expectedRevision);
  if (current.workspace_refs.some((candidate) => candidate.id === workspace.id)) {
    throw new CampusWeaveInputError(`Workspace is already attached: ${workspace.id}`);
  }
  const operation: CampusWeaveWorkspaceOperation = {
    id: randomUUID(),
    kind: "workspace-create",
    status: "pending",
    workspace_id: workspace.id,
    name: workspace.name,
    platform: workspace.platform,
    created_at: workspace.created_at,
  };
  const next: CampusWeaveProject = {
    ...current,
    revision: current.revision + 1,
    operations: [...current.operations, operation],
  };
  publishProject(projects, next, true);
  return { project: next, operation };
}

function completeWorkspace(projects: string, workspaces: string, projectId: string, operationId: string, expectedRevision: number): CampusWeaveProject {
  const current = readProject(projects, projectId);
  assertExpectedRevision(current, expectedRevision);
  const operationIndex = current.operations.findIndex((entry) => entry.id === operationId && entry.kind === "workspace-create");
  const operation = current.operations[operationIndex] as CampusWeaveWorkspaceOperation | undefined;
  if (operation === undefined || operation.status !== "pending") throw new CampusWeaveInputError("Pending workspace operation not found");
  const workspace: CampusWeaveWorkspaceRef = {
    id: operation.workspace_id,
    name: operation.name,
    platform: operation.platform,
    created_at: operation.created_at,
  };
  loadWorkspaceStateSnapshot(join(workspaces, workspace.id));
  const operations = [...current.operations];
  operations[operationIndex] = { ...operation, status: "committed", committed_at: new Date().toISOString() };
  const next: CampusWeaveProject = {
    ...current,
    revision: current.revision + 1,
    workspace_refs: [...current.workspace_refs, workspace],
    operations,
  };
  publishProject(projects, next, true);
  return next;
}

function readProject(projects: string, id: string): CampusWeaveProject {
  return readProjectFile(join(projects, `${assertIdentifier(id, "project id")}.json`));
}

function readProjectFile(path: string): CampusWeaveProject {
  let buffer: Buffer;
  try {
    buffer = readBoundedRegularFileNoFollow(path, { label: "CampusWeave project", maxBytes: MAX_PROJECT_BYTES });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CampusWeaveNotFoundError("CampusWeave project not found");
    throw error;
  }
  try {
    return parseCampusWeaveProject(JSON.parse(buffer.toString("utf8")) as unknown);
  } catch (error) {
    if (error instanceof CampusWeaveInputError) throw new Error(`Invalid persisted CampusWeave project: ${error.message}`, { cause: error });
    throw error;
  }
}

function publishProject(projects: string, project: CampusWeaveProject, force: boolean): void {
  const serialized = Buffer.from(`${JSON.stringify(project, null, 2)}\n`, "utf8");
  if (serialized.length > MAX_PROJECT_BYTES) throw new CampusWeaveCapacityError("CampusWeave project exceeds its persisted size limit");
  writePrivateFileAtomic(join(projects, `${project.id}.json`), serialized, { force, label: "CampusWeave project" });
}

function projectFiles(projects: string): string[] {
  const files = readdirSync(projects, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length > MAX_PROJECTS) throw new Error("CampusWeave project store exceeds its project limit");
  return files;
}

function publishArtifact(artifacts: string, record: CampusWeaveArtifactRecord): void {
  const workspaceId = assertIdentifier(record.workspaceId, "workspace id");
  const policyRevision = assertDigest(record.policyRevision, "policy revision");
  const artifactDigest = assertDigest(record.artifactDigest, "artifact digest");
  const catalogDigest = assertDigest(record.catalogDigest, "catalog digest");
  const value: CampusWeaveArtifactRecord = {
    workspaceId,
    policyRevision,
    artifactDigest,
    catalogDigest,
    ...(record.assuranceDigest === undefined ? {} : { assuranceDigest: assertDigest(record.assuranceDigest, "assurance digest") }),
    builtAt: new Date(record.builtAt).toISOString(),
  };
  writePrivateFileAtomic(join(artifacts, `${workspaceId}.json`), Buffer.from(`${JSON.stringify(value)}\n`), {
    force: true,
    label: "CampusWeave artifact record",
  });
}

function readArtifact(artifacts: string, workspaceId: string): CampusWeaveArtifactRecord | undefined {
  const path = join(artifacts, `${assertIdentifier(workspaceId, "workspace id")}.json`);
  let bytes: Buffer;
  try {
    bytes = readBoundedRegularFileNoFollow(path, { label: "CampusWeave artifact record", maxBytes: 4096 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const value = JSON.parse(bytes.toString("utf8")) as Partial<CampusWeaveArtifactRecord>;
  return {
    workspaceId: assertIdentifier(value.workspaceId ?? "", "workspace id"),
    policyRevision: assertDigest(value.policyRevision, "policy revision"),
    artifactDigest: assertDigest(value.artifactDigest, "artifact digest"),
    catalogDigest: assertDigest(value.catalogDigest, "catalog digest"),
    ...(value.assuranceDigest === undefined ? {} : { assuranceDigest: assertDigest(value.assuranceDigest, "assurance digest") }),
    builtAt: typeof value.builtAt === "string" ? new Date(value.builtAt).toISOString() : invalidArtifactDate(),
  };
}

function acquireWriterLock(root: string): () => void {
  const lock = join(root, ".writer.lock");
  const token = randomUUID();
  const contents = `${JSON.stringify({ pid: process.pid, token })}\n`;
  try {
    publishWriterLock(lock, contents);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const current = parseLockOwner(lock);
    const owner = current === undefined ? "unknown" : `PID ${String(current.pid)}`;
    throw new CampusWeaveStoreBusyError(`CampusWeave project store already has a writer (${owner}); remove a stale lock only after verifying that process is stopped`);
  }
  return () => {
    const current = parseLockOwner(lock);
    if (current?.token !== token) throw new Error("CampusWeave writer lock ownership changed");
    unlinkSync(lock);
  };
}

function parseLockOwner(path: string): { readonly pid: number; readonly token: string } | undefined {
  try {
    const bytes = readBoundedRegularFileNoFollow(path, { label: "CampusWeave writer lock", maxBytes: 1024 });
    const parsed = JSON.parse(bytes.toString("utf8")) as { pid?: unknown; token?: unknown };
    return Number.isSafeInteger(parsed.pid) && (parsed.pid as number) > 0 && typeof parsed.token === "string"
      ? { pid: parsed.pid as number, token: parsed.token }
      : undefined;
  } catch {
    return undefined;
  }
}

function publishWriterLock(path: string, contents: string): void {
  writePrivateFileAtomic(path, Buffer.from(contents, "utf8"), { force: false, label: "CampusWeave writer lock" });
}

function privateSubdirectory(root: string, name: string): string {
  const path = resolveSymlinkFreePath(join(root, name), `CampusWeave ${name} directory`);
  preparePrivateDirectory(path, `CampusWeave ${name} directory`);
  return path;
}

function preparePrivateDirectory(path: string, label: string): void {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    mkdirSync(path, { recursive: true, mode: 0o700 });
    stats = lstatSync(path);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new CampusWeaveInputError(`${label} must be a real directory`);
  if ((stats.mode & 0o077) !== 0) throw new CampusWeaveInputError(`${label} must not grant group or world permissions`);
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) throw new CampusWeaveInputError(`${label} must be owned by the current user`);
}

function assertExpectedRevision(project: CampusWeaveProject, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) throw new CampusWeaveInputError("expectedRevision must be a positive integer");
  if (project.revision !== expected) {
    throw new CampusWeaveRevisionConflictError(`CampusWeave project revision conflict: expected ${String(expected)}, current ${String(project.revision)}`);
  }
}

function assertIdentifier(value: string, label: string): string {
  if (!CAMPUSWEAVE_ID_PATTERN.test(value)) throw new CampusWeaveInputError(`${label} must be a lowercase identifier`);
  return value;
}

function requireName(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new CampusWeaveInputError("name must be a non-empty string");
  if (value.length > 160) throw new CampusWeaveInputError("name exceeds its 160 character limit");
  return value.trim();
}

function assertDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new CampusWeaveInputError(`${label} must be a SHA-256 digest`);
  return value;
}

function invalidArtifactDate(): never {
  throw new CampusWeaveInputError("artifact builtAt must be an ISO date string");
}

/** Loads a bounded template-refresh JAR from local storage or an isolated image. */
import { execFileSync } from "node:child_process";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";

export interface TemplateRefreshSourceJar {
  readonly jar: Buffer;
  readonly image: string;
  readonly imageDigest?: string;
  readonly serverVersion: string;
}

export interface TemplateRefreshSourceOptions {
  readonly image?: string;
  readonly jar?: string;
  readonly serverVersion?: string;
}

const MAX_TEMPLATE_REFRESH_JAR_BYTES = 512 * 1024 * 1024;

export function readTemplateRefreshSource(options: TemplateRefreshSourceOptions): TemplateRefreshSourceJar {
  if (options.jar !== undefined) {
    return {
      jar: readBoundedRegularFileNoFollow(options.jar, {
        label: "Template refresh JAR",
        maxBytes: MAX_TEMPLATE_REFRESH_JAR_BYTES,
      }),
      image: options.image ?? "local-jar",
      serverVersion: options.serverVersion ?? "unspecified",
    };
  }

  const image = options.image ?? "relution/relution:26.1.1";
  const jar = execFileSync("docker", [
    "run",
    "--rm",
    ...templateRefreshDockerIsolationArgs(false),
    "--entrypoint",
    "cat",
    image,
    "/opt/relution/lib/relution-exec.jar",
  ], { maxBuffer: MAX_TEMPLATE_REFRESH_JAR_BYTES });
  const imageDigest = inspectImageDigest(image);
  return {
    jar,
    image,
    ...(imageDigest === undefined ? {} : { imageDigest }),
    serverVersion: options.serverVersion ?? versionFromImage(image),
  };
}

function inspectImageDigest(image: string): string | undefined {
  try {
    const output = execFileSync("docker", ["image", "inspect", image], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const first = parsed[0] as Record<string, unknown> | undefined;
    const repoDigests = first?.RepoDigests;
    if (Array.isArray(repoDigests) && typeof repoDigests[0] === "string") return repoDigests[0];
    return typeof first?.Id === "string" ? first.Id : undefined;
  } catch (error) {
    console.warn(`[template-refresh] Could not inspect image digest for ${image}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export function templateRefreshDockerIsolationArgs(writableTemp: boolean): string[] {
  const user = typeof process.getuid === "function" && typeof process.getgid === "function"
    ? ["--user", `${String(process.getuid())}:${String(process.getgid())}`]
    : [];
  return [
    "--network=none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only",
    "--pids-limit=256",
    "--memory=1g",
    "--cpus=2",
    ...user,
    ...(writableTemp ? ["--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m"] : []),
  ];
}

function versionFromImage(image: string): string {
  const tag = image.split(":").at(-1);
  return tag !== undefined && tag !== image ? tag : "unspecified";
}

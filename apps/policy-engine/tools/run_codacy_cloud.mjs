// Refresh Codacy Cloud configuration in an ignored local cache before analysis.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { cleanPythonCaches } from "./codacy-cloud-cache.mjs";
import {
  normalizeCodacyConfig,
  validateCodacyConfigIdentity,
} from "./codacy-cloud-config.mjs";

const mode = process.argv[2] ?? "analyze";
const configPath = ".codacy/generated/remote.config.json";
const generatedDir = ".codacy/generated";
const pylintHome = join(generatedDir, "pylint-cache");

/** Run one Codacy subprocess with inherited output and an isolated writable Pylint cache. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      PYLINTHOME: pylintHome,
    },
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

/** Resolve the Codacy remote from the configured GitHub origin without hard-coded repository metadata. */
function githubRemoteCoordinates() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Cannot resolve the Git origin required for Codacy initialization");
  }
  const match = result.stdout.trim().match(/github\.com(?::|\/)([^/]+)\/([^/]+)$/u);
  const owner = match?.[1];
  const repository = match?.[2]?.replace(/\.git$/u, "");
  if (owner === undefined || repository === undefined || repository.length === 0) {
    throw new Error("Codacy initialization requires a GitHub origin URL");
  }
  return { provider: "gh", organization: owner, repository };
}

/** Update the existing remote config, falling back to initialization on first use. */
function refreshRemoteConfig() {
  const updateStatus = run("codacy-analysis", [
    "update-config",
    "--config-file",
    configPath,
  ]);
  if (updateStatus === 0) {
    return 0;
  }
  const { organization, repository } = githubRemoteCoordinates();
  return run("codacy-analysis", [
    "init",
    "--remote",
    "gh",
    organization,
    repository,
    "--config-file",
    configPath,
  ]);
}

const expectedIdentity = githubRemoteCoordinates();
const preflightStatus = validateCodacyConfigIdentity(configPath, expectedIdentity);
if (preflightStatus !== 0) {
  process.exit(preflightStatus);
}

cleanPythonCaches();
mkdirSync(pylintHome, { recursive: true });

let status = 0;
try {
  status = refreshRemoteConfig();
  if (status === 0) {
    normalizeCodacyConfig(configPath);
    status = validateCodacyConfigIdentity(configPath, expectedIdentity, { required: true });
  }
  if (status === 0 && mode === "inspect") {
    status = run("codacy-analysis", [
      "analyze",
      "--config-file",
      configPath,
      "--inspect",
      "--output-format",
      "json",
      "--no-log",
      "--output",
      ".codacy/generated/remote-inspect.json",
    ]);
  } else if (status === 0 && mode === "analyze") {
    status = run("codacy-analysis", [
      "analyze",
      "--config-file",
      configPath,
      "--install-dependencies",
      "--output-format",
      "json",
      "--no-log",
      "--output",
      ".codacy/generated/remote-analysis.json",
    ]);
  } else if (status === 0 && mode !== "config") {
    console.error(`Unsupported Codacy Cloud mode: ${mode}`);
    status = 2;
  }
} finally {
  cleanPythonCaches();
}

process.exit(status);

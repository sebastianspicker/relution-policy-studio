import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] ?? "analyze";
const configPath = ".codacy/generated/remote.config.json";
const localConfigPath = ".codacy/codacy.config.json";
const generatedDir = ".codacy/generated";
const pylintHome = join(generatedDir, "pylint-cache");
const policyExcludes = [
  "AGENTS.md",
  "private/**",
  "node_modules/**",
  "docs/archive/**",
];

function cleanPythonCaches() {
  for (const root of ["test", "tools"]) {
    if (!existsSync(root)) {
      continue;
    }
    removePycacheDirs(root);
  }
}

function removePycacheDirs(path) {
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    const stat = statSync(child);
    if (stat.isDirectory() && entry === "__pycache__") {
      rmSync(child, { recursive: true, force: true });
      continue;
    }
    if (stat.isDirectory()) {
      removePycacheDirs(child);
    }
  }
}

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

function normalizeRepositoryConfigPaths(path) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  for (const tool of config.tools ?? []) {
    if (tool.localConfigurationFile?.endsWith("/pyproject.toml")) {
      tool.localConfigurationFile = "pyproject.toml";
    }
  }
  const excludes = new Set(config.exclude ?? []);
  for (const exclude of policyExcludes) {
    excludes.add(exclude);
  }
  config.exclude = [...excludes];
  writeJson(path, config);
  return config;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function refreshRemoteConfig() {
  const updateStatus = run("codacy-analysis", [
    "update-config",
    "--config-file",
    configPath,
  ]);
  if (updateStatus === 0) {
    return 0;
  }
  return run("codacy-analysis", [
    "init",
    "--remote",
    "gh",
    "sebastianspicker",
    "relution-policy-workbench",
    "--config-file",
    configPath,
  ]);
}

function comparableConfig(path) {
  const config = normalizeRepositoryConfigPaths(path);
  delete config.metadata?.createdAt;
  delete config.metadata?.updatedAt;
  return JSON.stringify(config);
}

function syncLocalConfigFromRemote() {
  normalizeRepositoryConfigPaths(configPath);
  copyFileSync(configPath, localConfigPath);
  if (comparableConfig(configPath) !== comparableConfig(localConfigPath)) {
    console.error(
      `Local Codacy config ${localConfigPath} does not match fetched remote config ${configPath}`,
    );
    return 1;
  }
  return 0;
}

cleanPythonCaches();
mkdirSync(pylintHome, { recursive: true });

let status = 0;
try {
  status = refreshRemoteConfig();
  if (status === 0) {
    status = syncLocalConfigFromRemote();
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

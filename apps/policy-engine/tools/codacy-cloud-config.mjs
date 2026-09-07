// Normalizes and validates ignored Codacy Cloud configuration caches.
import { readFileSync, writeFileSync } from "node:fs";

const POLICY_EXCLUDES = [
  "private/**",
  "node_modules/**",
];

/** Verify a local Codacy config belongs to the Git origin without changing it. */
export function validateCodacyConfigIdentity(configPath, expectedIdentity, { required = false } = {}) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    if ((error instanceof Error && "code" in error && error.code === "ENOENT") && !required) {
      return 0;
    }
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Cannot validate Codacy config ${configPath}: ${reason}`);
    return 1;
  }

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    console.error(`Codacy config ${configPath} must be a JSON object with identity metadata`);
    return 1;
  }
  const metadata = config.metadata;
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    console.error(`Codacy config ${configPath} is missing identity metadata`);
    return 1;
  }
  const identity = {
    provider: metadata.provider,
    organization: metadata.organization,
    repository: metadata.repositoryName,
  };
  if (Object.values(identity).some((value) => typeof value !== "string" || value.length === 0)) {
    console.error(`Codacy config ${configPath} is missing provider, organization, or repository identity metadata`);
    return 1;
  }
  if (
    identity.provider !== expectedIdentity.provider
    || identity.organization !== expectedIdentity.organization
    || identity.repository !== expectedIdentity.repository
  ) {
    console.error(
      `Codacy config ${configPath} identity mismatch: expected ${expectedIdentity.provider}/${expectedIdentity.organization}/${expectedIdentity.repository} from Git origin, received ${identity.provider}/${identity.organization}/${identity.repository}`,
    );
    return 1;
  }
  return 0;
}

/** Make fetched configuration portable and restore mandatory public/private exclusions. */
export function normalizeCodacyConfig(path) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  for (const tool of config.tools ?? []) {
    if (tool.localConfigurationFile?.endsWith("/pyproject.toml")) {
      tool.localConfigurationFile = "pyproject.toml";
    }
  }
  const excludes = new Set(config.exclude ?? []);
  for (const exclude of POLICY_EXCLUDES) {
    excludes.add(exclude);
  }
  config.exclude = [...excludes];
  writeJson(path, config);
  return config;
}

/** Write deterministic, reviewable JSON with a trailing newline. */
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

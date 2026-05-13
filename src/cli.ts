#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createAppleCompatReport, renderAppleCompatReportMarkdown } from "./apple-compat.js";
import { loadAppleSchemaCatalog, refreshAppleSchemaCatalog } from "./apple-schema-catalog.js";
import { createRelutionAuditReport, writeAuditOutputs } from "./audit.js";
import { startEditorServer } from "./editor-server.js";
import { runRelutionCliCommand } from "./relution-cli.js";
import { extractRexp, inspectRexp, packPlainDirectory, verifyRexp } from "./rexp.js";
import { resetEditorSidecar } from "./sidecar.js";
import { refreshTemplates } from "./template-refresh.js";
import { DEFAULT_TEMPLATE_BUNDLE_PATH, listTemplates, loadTemplateBundle } from "./templates.js";
import { createNewWorkspace } from "./workspace.js";

const DEFAULT_SERVE_WORKSPACE = ".rexp-editor/workspace";
const DEFAULT_SERVE_OUTPUT = ".rexp-editor/output.rexp";
const DEFAULT_SERVE_PLATFORM = "IOS";
const DEFAULT_SERVE_POLICY_NAME = "Local iOS Policy";
const BOOLEAN_FLAGS = [
  "force",
  "pretty",
  "json",
  "once",
  "sort-ascending",
  "allow-network-editor",
  "allow-local-service-hosts",
  "allow-heuristic-runtime-metadata",
] as const;

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  options: Record<string, string | boolean>;
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  try {
    switch (args.command) {
      case "inspect":
        inspectCommand(args);
        return;
      case "verify":
        verifyCommand(args);
        return;
      case "extract":
        extractCommand(args);
        return;
      case "pack":
        packCommand(args);
        return;
      case "templates":
        templatesCommand(args);
        return;
      case "audit":
        auditCommand(args);
        return;
      case "apple-compat":
        appleCompatCommand(args);
        return;
      case "apple-schema":
        await appleSchemaCommand(args);
        return;
      case "relution":
        await runRelutionCliCommand(args);
        return;
      case "new":
        newCommand(args);
        return;
      case "edit":
        await editCommand(args);
        return;
      case "serve":
        await serveCommand(args);
        return;
      case undefined:
        await serveCommand(args);
        return;
      case "help":
        printHelp();
        return;
      default:
        cliError(`Unknown command: ${args.command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatCliError(message));
    process.exitCode = 1;
  }
}

async function appleSchemaCommand(args: ParsedArgs): Promise<void> {
  const action = requirePositional(args, 0, "apple-schema requires an action: refresh, list, or audit");
  if (action === "refresh") {
    const refreshOptions: Parameters<typeof refreshAppleSchemaCatalog>[0] = {};
    const out = optionalString(args, "out");
    const revision = optionalString(args, "revision");
    const source = optionalString(args, "source");
    if (out !== undefined) {
      refreshOptions.out = out;
    }
    if (revision !== undefined) {
      refreshOptions.revision = revision;
    }
    if (source !== undefined) {
      refreshOptions.source = source;
    }
    const catalog = await refreshAppleSchemaCatalog(refreshOptions);
    if (args.options.json === true) {
      printJson(catalog);
      return;
    }
    console.log(`Wrote ${resolve(optionalString(args, "out") ?? "data/apple-device-management/catalog.json")}`);
    console.log(`Apple schema entries: ${catalog.entries.length}`);
    return;
  }
  if (action === "list") {
    const catalog = loadAppleSchemaCatalog(optionalString(args, "catalog"));
    const kind = optionalString(args, "kind");
    const entries = kind === undefined ? catalog.entries : catalog.entries.filter((entry) => entry.kind === kind);
    if (args.options.json === true) {
      printJson({ source: catalog.source, entries });
      return;
    }
    for (const entry of entries) {
      console.log(`${entry.kind} ${entry.title} -> ${entry.identifier} [${entry.availability.platforms.join(",")}]`);
    }
    console.log(`Total: ${entries.length}`);
    return;
  }
  if (action === "audit") {
    const catalog = loadAppleSchemaCatalog(optionalString(args, "catalog"));
    if (args.options.json === true) {
      printJson(catalog);
      return;
    }
    console.log(`Apple schema source: ${catalog.source.repository} ${catalog.source.revision}`);
    for (const [kind, count] of Object.entries(catalog.counts)) {
      console.log(`${kind}: ${count}`);
    }
    console.log(`Total: ${catalog.entries.length}`);
    return;
  }
  throw new Error(`Unknown apple-schema action: ${action}`);
}

function inspectCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "inspect requires a .rexp file");
  const key = optionalString(args, "key") ?? optionalEnvRexpKey();
  const result = inspectRexp(file, key);

  if (args.options.json === true) {
    printJson(result);
    return;
  }

  console.log(`Archive: ${file}`);
  console.log(`Policy entries: ${result.policyEntries.length}`);
  console.log(`Metadata: ${JSON.stringify(result.metadata)}`);
  console.log(`Report: ${JSON.stringify(result.report)}`);

  if (result.policies !== undefined) {
    console.log("Decrypted policies:");
    for (const policy of result.policies) {
      const hashState = policy.hashMatches === true ? "hash ok" : "hash mismatch";
      console.log(
        `- ${policy.path}: ${policy.name ?? "(unnamed)"} (${policy.uuid ?? "no uuid"}, ${policy.platform ?? "no platform"}, ${policy.configurationCount ?? 0} configurations, ${hashState})`,
      );
    }
  }
}

function verifyCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "verify requires a .rexp file");
  const key = requireKey(args);
  const result = verifyRexp(file, key);

  if (args.options.json === true) {
    printJson(result);
    return;
  }

  for (const entry of result.checkedEntries) {
    const state = entry.hashMatches === true ? "PASS" : "FAIL";
    console.log(`${state} ${entry.path}`);
  }
  console.log(result.ok ? "VERDICT: PASS" : "VERDICT: FAIL");
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function extractCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "extract requires a .rexp file");
  const out = requireString(args, "out", "extract requires --out <dir>");
  const key = requireKey(args);
  extractRexp(file, out, key, {
    force: args.options.force === true,
    pretty: args.options.pretty === true,
  });
  console.log(`Extracted ${file} to ${out}`);
}

function packCommand(args: ParsedArgs): void {
  const inputDir = requirePositional(args, 0, "pack requires an extracted directory");
  const out = requireString(args, "out", "pack requires --out <file.rexp>");
  const key = requireKey(args);

  if (!existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  packPlainDirectory(inputDir, out, key, {
    force: args.options.force === true,
  });
  console.log(`Wrote ${resolve(out)}`);
}

function templatesCommand(args: ParsedArgs): void {
  const action = requirePositional(args, 0, "templates requires an action: refresh or list");
  if (action === "refresh") {
    const out = optionalString(args, "out") ?? DEFAULT_TEMPLATE_BUNDLE_PATH;
    const options: Parameters<typeof refreshTemplates>[0] = { out };
    const image = optionalString(args, "image");
    const jar = optionalString(args, "jar");
    const serverVersion = optionalString(args, "server-version");
    if (image !== undefined) {
      options.image = image;
    }
    if (jar !== undefined) {
      options.jar = jar;
    }
    if (serverVersion !== undefined) {
      options.serverVersion = serverVersion;
    }
    if (args.options["allow-heuristic-runtime-metadata"] === true) {
      options.allowHeuristicRuntimeMetadata = true;
    }
    refreshTemplates(options);
    console.log(`Wrote ${resolve(out)}`);
    return;
  }
  if (action === "list") {
    const bundle = loadTemplateBundle(optionalString(args, "bundle"));
    const templates = listTemplates(bundle, optionalString(args, "platform"));
    if (args.options.json === true) {
      printJson({ serverVersion: bundle.serverVersion, templates });
      return;
    }
    for (const template of templates) {
      const platforms = template.platforms.join(",");
      const flags = [template.multiConfig ? "multi" : "single", template.portalHidden ? "hidden" : "visible"].join(",");
      console.log(`${template.type} -> ${template.schemaName} [${platforms}] ${flags}`);
    }
    console.log(`Total: ${templates.length}`);
    return;
  }
  throw new Error(`Unknown templates action: ${action}`);
}

function auditCommand(args: ParsedArgs): void {
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  const key = optionalString(args, "key") ?? optionalEnvRexpKey() ?? "key123";
  const defaultSample = "example/sample-policy-export.rexp";
  const sampleRexp = optionalString(args, "sample") ?? (existsSync(defaultSample) ? defaultSample : undefined);
  const auditOptions: Parameters<typeof createRelutionAuditReport>[0] = { bundle, key };
  if (sampleRexp !== undefined) {
    auditOptions.sampleRexp = sampleRexp;
  }
  const report = createRelutionAuditReport(auditOptions);
  const jsonOut = optionalString(args, "json-out") ?? "data/relution-26.1.1/audit-report.json";
  const markdownOut = optionalString(args, "markdown-out") ?? "AUDIT.md";
  writeAuditOutputs(report, { jsonOut, markdownOut });

  if (args.options.json === true) {
    printJson(report);
  } else {
    console.log(`Wrote ${resolve(jsonOut)}`);
    console.log(`Wrote ${resolve(markdownOut)}`);
    console.log(
      `Mock roundtrip: ${report.summary.mockRoundtripPassed} passed, ${report.summary.mockRoundtripFailed} failed`,
    );
    if (report.sampleExport !== undefined) {
      console.log(`Sample export validation: ${report.sampleExport.validationOk ? "PASS" : "FAIL"}`);
    }
  }

  if (report.summary.mockRoundtripFailed > 0 || report.sampleExport?.validationOk === false) {
    process.exitCode = 1;
  }
}

function appleCompatCommand(args: ParsedArgs): void {
  const action = requirePositional(args, 0, "apple-compat requires an action: list or audit");
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  const report = createAppleCompatReport(bundle);
  if (action === "list") {
    if (args.options.json === true) {
      printJson(report);
      return;
    }
    for (const setting of report.settings) {
      const mark = setting.status === "mobileconfig-backed" ? "*" : "";
      console.log(`${setting.label}${mark} -> ${setting.payloadType} [${setting.platforms.join(",")}]`);
    }
    console.log(`Mobileconfig-backed: ${report.summary.mobileconfigBacked}`);
    return;
  }
  if (action === "audit") {
    const jsonOut = optionalString(args, "json-out") ?? "data/apple-compat/relution-jamf-gap.json";
    const markdownOut = optionalString(args, "markdown-out") ?? "docs/JAMF_RELUTION_APPLE_GAP.md";
    writeJson(jsonOut, report);
    writeText(markdownOut, renderAppleCompatReportMarkdown(report));
    if (args.options.json === true) {
      printJson(report);
      return;
    }
    console.log(`Wrote ${resolve(jsonOut)}`);
    console.log(`Wrote ${resolve(markdownOut)}`);
    return;
  }
  throw new Error(`Unknown apple-compat action: ${action}`);
}

function newCommand(args: ParsedArgs): void {
  const workspace = requireString(args, "workspace", "new requires --workspace <dir>");
  const platform = requireString(args, "platform", "new requires --platform <Platform>");
  const name = requireString(args, "name", "new requires --name <policy name>");
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  createNewWorkspace({
    workspace,
    platform,
    name,
    serverVersion: bundle.serverVersion,
    force: args.options.force === true,
  });
  if (args.options.force === true) {
    resetEditorSidecar(workspace);
  }
  console.log(`Created workspace ${resolve(workspace)}`);
}

async function editCommand(args: ParsedArgs): Promise<void> {
  const file = requirePositional(args, 0, "edit requires a .rexp file");
  const key = requireKey(args);
  const workspace = requireString(args, "workspace", "edit requires --workspace <dir>");
  const out = requireString(args, "out", "edit requires --out <file.rexp>");
  extractRexp(file, workspace, key, { force: args.options.force === true, pretty: true });
  await serveEditor(args, workspace, out, key);
}

async function serveCommand(args: ParsedArgs): Promise<void> {
  const workspace = optionalString(args, "workspace") ?? DEFAULT_SERVE_WORKSPACE;
  const out = optionalString(args, "out") ?? defaultServeOutput(workspace);
  const key = optionalString(args, "key") ?? optionalEnvRexpKey() ?? "";
  if (shouldBootstrapWorkspace(workspace)) {
    const bundle = loadTemplateBundle(optionalString(args, "bundle"));
    const platform = optionalString(args, "platform") ?? DEFAULT_SERVE_PLATFORM;
    const name = optionalString(args, "name") ?? DEFAULT_SERVE_POLICY_NAME;
    if (platform === "UNKNOWN" || !bundle.platforms.includes(platform)) {
      throw new Error(`Unsupported default policy platform: ${platform}`);
    }
    createNewWorkspace({
      workspace,
      platform,
      name,
      serverVersion: bundle.serverVersion,
    });
    console.log(`Created workspace ${resolve(workspace)}`);
  }
  await serveEditor(args, workspace, out, key);
}

function shouldBootstrapWorkspace(workspace: string): boolean {
  if (!existsSync(workspace)) {
    return true;
  }
  return statSync(workspace).isDirectory() && readdirSync(workspace).length === 0;
}

async function serveEditor(args: ParsedArgs, workspace: string, out: string, key: string): Promise<void> {
  const options: Parameters<typeof startEditorServer>[0] = {
    workspace,
    out,
    key,
    allowNetworkHost: args.options["allow-network-editor"] === true,
    allowLocalServiceHosts: args.options["allow-local-service-hosts"] === true,
    port: optionalInteger(args, "port") ?? 8787,
    host: optionalString(args, "host") ?? "127.0.0.1",
  };
  const bundlePath = optionalString(args, "bundle");
  if (bundlePath !== undefined) {
    options.bundlePath = bundlePath;
  }
  const handle = await startEditorServer(options);
  console.log(`Relution policy workbench: ${handle.url}`);
  console.log(`Workspace: ${resolve(workspace)}`);
  console.log(`Output: ${resolve(out)}`);
  if (key.length === 0) {
    console.log("Key: not set; enter one in the UI before importing or building encrypted .rexp files.");
  }
  if (args.options.once === true) {
    await handle.close();
    return;
  }
  await new Promise<void>((resolveStop) => {
    process.once("SIGINT", () => {
      void handle.close().finally(resolveStop);
    });
    process.once("SIGTERM", () => {
      void handle.close().finally(resolveStop);
    });
  });
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      continue;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const name = token.slice(2);
    if (isBooleanFlag(name)) {
      options[name] = true;
      continue;
    }

    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      cliError(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }

  return { command, positionals, options };
}

function requirePositional(args: ParsedArgs, index: number, message: string): string {
  const value = args.positionals[index];
  if (value === undefined) {
    cliError(message);
  }
  return value;
}

function requireKey(args: ParsedArgs): string {
  const cliKey = optionalString(args, "key");
  if (cliKey !== undefined) {
    return cliKey;
  }
  const envKey = optionalEnvRexpKey();
  if (envKey !== undefined) {
    return envKey;
  }
  cliError("Missing --key <password> or RELUTION_REXP_KEY");
}

function defaultServeOutput(workspace: string): string {
  return workspace === DEFAULT_SERVE_WORKSPACE ? DEFAULT_SERVE_OUTPUT : resolve(dirname(workspace), "output.rexp");
}

function requireString(args: ParsedArgs, name: string, message: string): string {
  const value = optionalString(args, name);
  if (typeof value !== "string" || value.length === 0) {
    cliError(message);
  }
  return value;
}

function optionalEnvRexpKey(): string | undefined {
  const value = process.env.RELUTION_REXP_KEY;
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (value.length < 16 || /^(password|changeme|change_me|secret|key123)$/iu.test(value)) {
    cliError("RELUTION_REXP_KEY must be at least 16 characters and must not be an obvious default.");
  }
  return value;
}

function optionalString(args: ParsedArgs, name: string): string | undefined {
  const value = args.options[name];
  return typeof value === "string" ? value : undefined;
}

function optionalInteger(args: ParsedArgs, name: string): number | undefined {
  const value = optionalString(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!/^-?\d+$/u.test(value)) {
    cliError(`Expected integer for --${name}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    cliError(`Expected integer for --${name}`);
  }
  return parsed;
}

function isBooleanFlag(name: string): boolean {
  return BOOLEAN_FLAGS.some((flag) => flag === name);
}

function cliError(message: string): never {
  throw new Error(message.replace(/^ERROR:\s*/iu, ""));
}

function formatCliError(message: string): string {
  return `ERROR: ${message.replace(/^ERROR:\s*/iu, "")}`;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function printHelp(): void {
  console.log(`Usage:
  rexp
  rexp inspect <file.rexp> [--key <password>] [--json]
  rexp verify <file.rexp> --key <password> [--json]
  rexp extract <file.rexp> --key <password> --out <dir> [--force] [--pretty]
  rexp pack <dir> --key <password> --out <file.rexp> [--force]
  rexp templates refresh [--image relution/relution:26.1.1] [--jar <relution-exec.jar>] [--out <bundle.json>] [--allow-heuristic-runtime-metadata]
  rexp templates list [--platform <Platform>] [--json]
  rexp audit [--bundle <bundle.json>] [--key <password>] [--sample <file.rexp>] [--json-out <report.json>] [--markdown-out <AUDIT.md>] [--json]
  rexp apple-compat list [--bundle <bundle.json>] [--json]
  rexp apple-compat audit [--bundle <bundle.json>] [--json-out <report.json>] [--markdown-out <report.md>] [--json]
  rexp apple-schema refresh [--revision <ref>] [--source <apple-device-management-dir>] [--out <catalog.json>] [--json]
  rexp apple-schema list [--kind profile|ddm-configuration|mdm-command] [--catalog <catalog.json>] [--json]
  rexp apple-schema audit [--catalog <catalog.json>] [--json]
  rexp relution test --host <server> --token <api-token> [--protocol http|https] [--port <port>] [--json]       # read-only
  rexp relution devices --host <server> --token <api-token> [--platform <csv>] [--status <csv>] [--ownership <csv>] [--limit <n>] [--offset <n>] [--json]  # read-only
  rexp relution assess --host <server> --token <api-token> [--workspace <dir>] [--platform <csv>] [--status <csv>] [--json]  # read-only remote API
  rexp relution audit --host <server> --token <api-token> [--expected-policy IOS=Policy] [--inactive-warning-days 30] [--inactive-problem-days 90] [--json]  # read-only remote API
  rexp new --platform <Platform> --name <name> --workspace <dir> [--force]
  rexp edit <file.rexp> --key <password> --workspace <dir> --out <file.rexp> [--port 8787] [--force] [--allow-local-service-hosts]
  rexp serve [--workspace <dir>] [--out <file.rexp>] [--key <password>] [--platform <Platform>] [--name <policy name>] [--port 8787] [--allow-network-editor] [--allow-local-service-hosts]

With no arguments, rexp starts the local browser editor using ${DEFAULT_SERVE_WORKSPACE}.
The password can also be supplied through RELUTION_REXP_KEY.`);
}

void main(process.argv.slice(2));

/** Prints the CLI help text. */
import { DEFAULT_AUDIT_MARKDOWN_OUT } from "./cli-audit-command.js";
import { DEFAULT_SERVE_WORKSPACE } from "./cli-serve-command.js";

const RELUTION_CONNECTION_HELP = "--host <server> --token <api-token> [--protocol http|https] [--port <port>] [--base-path <path>] [--allow-local-service-hosts]";

export function printHelp(): void {
  const relutionCommand = (command: string, options: string, note: string): string => `  rexp relution ${command} ${RELUTION_CONNECTION_HELP} ${options}  # ${note}`;
  console.log([
    "Usage:", "  rexp", "  rexp inspect <file.rexp> [--key <passphrase>] [--json]", "  rexp verify <file.rexp> --key <passphrase> [--json]",
    "  rexp extract <file.rexp> --key <passphrase> --out <dir> [--force] [--pretty]", "  rexp pack <dir> --key <passphrase> --out <file.rexp> [--force]",
    "  rexp templates refresh [--image relution/relution:26.1.1] [--jar <relution-exec.jar>] [--out <bundle.json>] [--allow-heuristic-runtime-metadata]",
    "  rexp templates list [--platform <Platform>] [--json]", `  rexp audit [--bundle <bundle.json>] [--key <passphrase>] [--sample <file.rexp>] [--json-out <report.json>] [--markdown-out <${DEFAULT_AUDIT_MARKDOWN_OUT}>] [--json]`,
    "  rexp apple-compat list [--bundle <bundle.json>] [--json]", "  rexp apple-compat audit [--bundle <bundle.json>] [--json-out <report.json>] [--markdown-out <report.md>] [--json]",
    "  rexp apple-schema refresh [--revision <ref>] [--source <apple-device-management-dir>] [--out <catalog.json>] [--json]", "  rexp apple-schema list [--kind profile|ddm-configuration|mdm-command] [--catalog <catalog.json>] [--json]", "  rexp apple-schema audit [--catalog <catalog.json>] [--json]",
    relutionCommand("test", "[--json]", "read-only"), relutionCommand("devices", "[--platform <csv>] [--status <csv>] [--ownership <csv>] [--limit <n>] [--offset <n>] [--json]", "read-only"), relutionCommand("assess", "[--workspace <dir>] [--platform <csv>] [--status <csv>] [--json]", "read-only remote API"), relutionCommand("audit", "[--expected-policy IOS=Policy] [--inactive-warning-days 30] [--inactive-problem-days 90] [--json]", "read-only remote API"),
    "  rexp mdm verify-sources [--json]  # offline", "  rexp mdm validate [--json]        # offline", "  rexp mdm generate [--json]        # offline", "  rexp mdm diff [--json]            # offline", "  rexp mdm manifest [--json]        # offline",
    "  rexp new --platform <Platform> --name <name> --workspace <dir> [--force]", "  rexp edit <file.rexp> --key <passphrase> --workspace <dir> --out <file.rexp> [--port 8787] [--force] [--allow-local-service-hosts]", "  rexp serve [--workspace <dir>] [--out <file.rexp>] [--key <passphrase>] [--platform <Platform>] [--name <policy name>] [--port 8787] [--allow-local-service-hosts]", "", `With no arguments, rexp starts the local browser editor using ${DEFAULT_SERVE_WORKSPACE}.`, "The archive passphrase can also be supplied through RELUTION_REXP_KEY.", "Relution read-only commands can also read --host from RELUTION_BASE_URL and --token from RELUTION_ACCESS_TOKEN.",
  ].join("\n"));
}

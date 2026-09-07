/** Parses command-line arguments without applying command semantics. */
import { cliError } from "./cli-arg-values.js";
import type { ParsedArgs } from "./contracts.js";

export type { ParsedArgs } from "./contracts.js";

const BOOLEAN_FLAGS = [
  "force", "pretty", "json", "once", "sort-ascending", "allow-local-service-hosts", "allow-heuristic-runtime-metadata",
] as const;

export function parseArgs(argv: string[]): ParsedArgs {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand === "--help" || rawCommand === "-h" ? "help" : rawCommand;
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (typeof token === "undefined") continue;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name === "allow-network-editor") cliError("Option --allow-network-editor was removed; the editor is loopback-only.");
    if (BOOLEAN_FLAGS.some((flag) => flag === name)) {
      options[name] = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) cliError(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, positionals, options };
}

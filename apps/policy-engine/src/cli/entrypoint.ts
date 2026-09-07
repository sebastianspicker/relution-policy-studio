/** Dispatches parsed CLI commands and owns the top-level error boundary. */
import { appleCompatCommand } from "./cli-apple-compat-command.js";
import { appleSchemaCommand } from "./cli-apple-schema-command.js";
import { auditCommand } from "./cli-audit-command.js";
import { extractCommand, inspectCommand, packCommand, verifyCommand } from "./cli-archive-commands.js";
import { formatCliError } from "./cli-arg-values.js";
import { type ParsedArgs, parseArgs } from "./arguments.js";
import { editCommand, newCommand } from "./cli-editor-commands.js";
import { printHelp } from "./cli-help.js";
import { serveCommand } from "./cli-serve-command.js";
import { runMdmCliCommand } from "./mdm-command.js";
import { runRelutionCliCommand } from "./relution/relution-cli-dispatch.js";
import { templatesCommand } from "./cli-template-commands.js";

type CommandHandler = (args: ParsedArgs) => void | Promise<void>;

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  inspect: inspectCommand, verify: verifyCommand, extract: extractCommand, pack: packCommand, templates: templatesCommand, audit: auditCommand,
  "apple-compat": appleCompatCommand, "apple-schema": appleSchemaCommand, relution: runRelutionCliCommand, mdm: runMdmCliCommand,
  new: newCommand, edit: editCommand, serve: serveCommand, help: () => { printHelp(); },
};

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  try {
    const handler = args.command === undefined ? serveCommand : COMMAND_HANDLERS[args.command];
    if (handler === undefined) throw new Error(`Unknown command: ${args.command}`);
    await handler(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatCliError(message));
    process.exitCode = 1;
  }
}

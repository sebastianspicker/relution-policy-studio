/** Validates and reads parsed CLI argument values. */
import type { ParsedArgs } from "./contracts.js";

export function requirePositional(args: ParsedArgs, index: number, message: string): string {
  const value = args.positionals[index];
  if (value === undefined) cliError(message);
  return value;
}

export function requireString(args: ParsedArgs, name: string, message: string): string {
  const value = optionalString(args, name);
  if (typeof value !== "string" || value.length === 0) cliError(message);
  return value;
}

export function optionalString(args: ParsedArgs, name: string): string | undefined {
  const value = args.options[name];
  return typeof value === "string" ? value : undefined;
}

export function optionalInteger(args: ParsedArgs, name: string): number | undefined {
  const value = optionalString(args, name);
  if (value === undefined) return undefined;
  if (!/^-?\d+$/u.test(value)) cliError(`Expected integer for --${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) cliError(`Expected integer for --${name}`);
  return parsed;
}

export function cliError(message: string): never {
  throw new Error(message.replace(/^ERROR:\s*/iu, ""));
}

export function formatCliError(message: string): string {
  return `ERROR: ${message.replace(/^ERROR:\s*/iu, "")}`;
}

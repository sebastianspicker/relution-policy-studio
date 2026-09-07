/** Resolves archive passphrases and renders shared CLI output without exposing secrets. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParsedArgs } from "./contracts.js";
import { cliError, optionalString } from "./cli-arg-values.js";
import { assertNewArchiveKey } from "../archive/rexp-key-policy.js";

export function requireKey(args: ParsedArgs): string {
  return optionalString(args, "key") ?? optionalEnvRexpKey() ?? cliError("Missing --key <passphrase> or RELUTION_REXP_KEY");
}

export function optionalEnvRexpKey(): string | undefined {
  const value = process.env.RELUTION_REXP_KEY;
  if (value === undefined || value.length === 0) return undefined;
  if (value.length < 16 || /^(password|changeme|change_me|secret|key123)$/iu.test(value)) {
    cliError("RELUTION_REXP_KEY must be at least 16 characters and must not be an obvious default.");
  }
  return value;
}

export function requireNewArchiveKey(args: ParsedArgs): string {
  const key = requireKey(args);
  try { assertNewArchiveKey(key); }
  catch { cliError("New archive passphrase must be at least 16 characters and must not be an obvious default."); }
  return key;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function logWrittenPaths(...paths: string[]): void {
  for (const path of paths) console.log(`Wrote ${resolve(path)}`);
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

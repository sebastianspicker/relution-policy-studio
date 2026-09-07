/** Parses primitive Relution CLI option values without applying command semantics. */

export interface RelutionCliArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export function optionalString(args: RelutionCliArgs, name: string): string | undefined {
  const value = args.options[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalInteger(args: RelutionCliArgs, name: string): number | undefined {
  const value = optionalString(args, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) throw new Error(`Expected non-negative integer for --${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Expected safe integer for --${name}`);
  return parsed;
}

export function optionalBoolean(args: RelutionCliArgs, name: string): boolean | undefined {
  const value = args.options[name];
  if (value === undefined || typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected boolean for --${name}`);
}

export function optionalCsv(args: RelutionCliArgs, name: string): string[] | undefined {
  const value = optionalString(args, name);
  if (value === undefined) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return entries.length === 0 ? undefined : entries;
}

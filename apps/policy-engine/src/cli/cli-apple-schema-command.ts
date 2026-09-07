/** Implements Apple schema refresh, listing, and audit commands. */
import { resolve } from "node:path";
import { loadAppleSchemaCatalog, refreshAppleSchemaCatalog } from "../apple/apple-schema-catalog.js";
import type { ParsedArgs } from "./contracts.js";
import { optionalString, requirePositional } from "./cli-arg-values.js";
import { printJson } from "./cli-runtime.js";

export async function appleSchemaCommand(args: ParsedArgs): Promise<void> {
  const action = requirePositional(args, 0, "apple-schema requires an action: refresh, list, or audit");
  if (action === "refresh") return refreshAppleSchema(args);
  if (action === "list") return listAppleSchema(args);
  if (action === "audit") return auditAppleSchema(args);
  throw new Error(`Unknown apple-schema action: ${action}`);
}

async function refreshAppleSchema(args: ParsedArgs): Promise<void> {
  const out = optionalString(args, "out");
  const revision = optionalString(args, "revision");
  const source = optionalString(args, "source");
  const catalog = await refreshAppleSchemaCatalog({ ...(out === undefined ? {} : { out }), ...(revision === undefined ? {} : { revision }), ...(source === undefined ? {} : { source }) });
  if (args.options.json === true) return printJson(catalog);
  console.log(`Wrote ${resolve(out ?? "data/apple-device-management/catalog.json")}`);
  console.log(`Apple schema entries: ${catalog.entries.length}`);
}

function listAppleSchema(args: ParsedArgs): void {
  const catalog = loadAppleSchemaCatalog(optionalString(args, "catalog"));
  const kind = optionalString(args, "kind");
  const entries = kind === undefined ? catalog.entries : catalog.entries.filter((entry) => entry.kind === kind);
  if (args.options.json === true) return printJson({ source: catalog.source, entries });
  for (const entry of entries) console.log(`${entry.kind} ${entry.title} -> ${entry.identifier} [${entry.availability.platforms.join(",")}]`);
  console.log(`Total: ${entries.length}`);
}

function auditAppleSchema(args: ParsedArgs): void {
  const catalog = loadAppleSchemaCatalog(optionalString(args, "catalog"));
  if (args.options.json === true) return printJson(catalog);
  console.log(`Apple schema source: ${catalog.source.repository} ${catalog.source.revision}`);
  for (const [kind, count] of Object.entries(catalog.counts)) console.log(`${kind}: ${count}`);
  console.log(`Total: ${catalog.entries.length}`);
}

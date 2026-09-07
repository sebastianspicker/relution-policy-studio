/** Implements template refresh/listing and audit commands. */
import { resolve } from "node:path";
import type { ParsedArgs } from "./contracts.js";
import { optionalString, requirePositional } from "./cli-arg-values.js";
import { printJson } from "./cli-runtime.js";
import { refreshTemplates } from "../assurance/template-refresh.js";
import { DEFAULT_TEMPLATE_BUNDLE_PATH, listTemplates, loadTemplateBundle } from "../assurance/template-bundle.js";

export function templatesCommand(args: ParsedArgs): void {
  const action = requirePositional(args, 0, "templates requires an action: refresh or list");
  if (action === "refresh") {
    const out = optionalString(args, "out") ?? DEFAULT_TEMPLATE_BUNDLE_PATH;
    const options: Parameters<typeof refreshTemplates>[0] = { out };
    assignTemplateRefreshOptions(args, options);
    const bundle = refreshTemplates(options);
    if (bundle.refreshDiagnostics.runtimeMetadata.source === "heuristic") console.warn("[templates refresh] Warning: runtime metadata built from heuristic fallback; reflection failed.");
    if (bundle.sourceImageDigest === undefined) console.warn("[templates refresh] Warning: image digest unknown; Docker image digest was unavailable during build.");
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
      const flags = [template.multiConfig ? "multi" : "single", template.portalHidden ? "hidden" : "visible"].join(",");
      console.log(`${template.type} -> ${template.schemaName} [${template.platforms.join(",")}] ${flags}`);
    }
    console.log(`Total: ${templates.length}`);
    return;
  }
  throw new Error(`Unknown templates action: ${action}`);
}

function assignTemplateRefreshOptions(args: ParsedArgs, options: Parameters<typeof refreshTemplates>[0]): void {
  const image = optionalString(args, "image");
  const jar = optionalString(args, "jar");
  const serverVersion = optionalString(args, "server-version");
  if (image !== undefined) options.image = image;
  if (jar !== undefined) options.jar = jar;
  if (serverVersion !== undefined) options.serverVersion = serverVersion;
  if (args.options["allow-heuristic-runtime-metadata"] === true) options.allowHeuristicRuntimeMetadata = true;
}

/** Refreshes template bundles from a bounded local JAR or isolated container image. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createTemplateBundle } from "./template-create.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { readJsonEntry, readOptionalJsonEntry, readYamlEntry } from "./template-refresh-entries.js";
import { reflectRuntimeMetadata } from "./template-refresh-runtime.js";
import { readTemplateRefreshSource } from "./template-refresh-source.js";
import { readZip } from "../archive/zip.js";

export interface RefreshTemplatesOptions {
  allowHeuristicRuntimeMetadata?: boolean;
  image?: string;
  jar?: string;
  out: string;
  serverVersion?: string;
}

export function refreshTemplates(options: RefreshTemplatesOptions): RelutionTemplateBundle {
  const source = readTemplateRefreshSource(options);
  const zipEntries = readZip(source.jar);
  const iosSystemAppsName = "BOOT-INF/classes/config/ios-system-apps.yml";
  const springMetadataName = "META-INF/spring-configuration-metadata.json";
  const openApi = readJsonEntry(zipEntries, "BOOT-INF/classes/openapi.json");
  const iosSystemApps = readYamlEntry(zipEntries, iosSystemAppsName);
  const springConfigurationMetadata = readOptionalJsonEntry(zipEntries, springMetadataName);
  const runtimeMetadata = reflectRuntimeMetadata(source.jar);
  if (runtimeMetadata.length === 0 && options.allowHeuristicRuntimeMetadata !== true) {
    throw new Error("Runtime metadata reflection failed; rerun with --allow-heuristic-runtime-metadata to generate heuristic template metadata");
  }
  const bundle = createTemplateBundle({
    openApi,
    iosSystemApps,
    springConfigurationMetadata,
    runtimeMetadata,
    serverVersion: options.serverVersion ?? source.serverVersion,
    sourceImage: source.image,
    ...(source.imageDigest === undefined ? {} : { sourceImageDigest: source.imageDigest }),
    refreshDiagnostics: {
      runtimeMetadata: {
        source: runtimeMetadata.length > 0 ? "reflected" : "heuristic",
        reflectedCount: runtimeMetadata.length,
        configurationTypeCount: runtimeMetadata.length,
      },
      iosSystemAppsLoaded: zipEntries.some((entry) => entry.name === iosSystemAppsName),
      springConfigurationMetadataLoaded: zipEntries.some((entry) => entry.name === springMetadataName),
    },
  });

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

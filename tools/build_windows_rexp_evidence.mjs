#!/usr/bin/env node
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractRexp } from "../dist/src/rexp.js";

const PASSWORD = process.env.RELUTION_REXP_KEY ?? "Relution";
const OUTPUT_PATH = "example/vendor-references/downloads/derived/windows-relution-csp-evidence.json";
const INPUTS = [
  "example/Windows Group Policy Definitions.rexp",
  "example/Windows Policies Win11 24H2.rexp",
  "example/Windows Security Baselines Edge v128.rexp",
  "example/Windows Security Baselines Win11 24H2.rexp",
];

const sourceFiles = [];
const customCspSettings = [];

for (const sourceFile of INPUTS) {
  const extractDir = mkdtempSync(join(tmpdir(), "relution-windows-rexp-"));
  extractRexp(resolve(sourceFile), extractDir, PASSWORD, { force: true, pretty: true });
  const policyDir = join(extractDir, "policies");
  for (const policyFile of readdirSync(policyDir).filter((entry) => entry.endsWith(".json")).sort()) {
    const policy = JSON.parse(readFileSync(join(policyDir, policyFile), "utf8"));
    const configurations = policy.versions?.flatMap((version) => version.configurations ?? []) ?? [];
    sourceFiles.push({
      path: sourceFile,
      policyName: policy.name,
      platform: policy.platform,
      configurationCount: configurations.length,
    });
    for (const configuration of configurations) {
      const details = configuration.details;
      if (details?.type !== "WINDOWS_CUSTOM_CSP") {
        continue;
      }
      const parsedSyncMl = parseSyncMl(details.installSyncML);
      customCspSettings.push({
        name: details.name,
        sourceFile,
        policyName: policy.name,
        locUri: parsedSyncMl.locUri,
        state: parsedSyncMl.state,
        data: parsedSyncMl.data,
        dataValues: parsedSyncMl.dataValues,
        values: {
          enabled: details.enabled,
          name: details.name,
          installSyncML: details.installSyncML,
          deleteSyncML: details.deleteSyncML,
          wrapInAtomic: details.wrapInAtomic,
        },
      });
    }
  }
}

customCspSettings.sort((left, right) =>
  `${left.sourceFile}\u0000${left.policyName}\u0000${left.name}\u0000${left.locUri}`.localeCompare(
    `${right.sourceFile}\u0000${right.policyName}\u0000${right.name}\u0000${right.locUri}`,
  ),
);

writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify({
    version: 1,
    generatedFrom: "Relution Windows .rexp examples decrypted with the operator-supplied example key.",
    sourceFiles,
    customCspSettings,
  }, null, 2)}\n`,
);

function parseSyncMl(syncMl) {
  const locUri = firstMatch(syncMl, /<LocURI>(.*?)<\/LocURI>/su);
  const data = decodeXmlEntities(firstMatch(syncMl, /<Data><!\[CDATA\[(.*?)\]\]><\/Data>/su));
  return {
    locUri,
    data,
    state: data.includes("<enabled/>") ? "enabled" : data.includes("<disabled/>") ? "disabled" : "unknown",
    dataValues: [...data.matchAll(/<data\s+id="([^"]+)"\s+value="([^"]*)"\s*\/>/gsu)].map((match) => ({
      id: decodeXmlEntities(match[1] ?? ""),
      value: decodeXmlEntities(match[2] ?? ""),
    })),
  };
}

function firstMatch(value, pattern) {
  return pattern.exec(String(value ?? ""))?.[1] ?? "";
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&#xF000;", "\uF000");
}

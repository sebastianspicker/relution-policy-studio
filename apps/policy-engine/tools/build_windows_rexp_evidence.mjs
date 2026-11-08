#!/usr/bin/env node
// Extract deterministic Windows CSP evidence from reviewed example Relution archives.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readRexpArchive } from "../dist/src/archive/rexp-archive-reader.js";
import { decryptRexpProject } from "../dist/src/archive/rexp-extraction.js";
import { isPolicyPath } from "../dist/src/workspace/policy-path.js";
import { parseSyncMl } from "./windows-rexp-evidence-xml.mjs";

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
  // Decrypt in memory, so decrypted policies never land in the temp folder.
  const files = decryptRexpProject(readRexpArchive(readFileSync(resolve(sourceFile))), PASSWORD, true);
  for (const policyFile of [...files.keys()].filter(isPolicyPath).sort()) {
    const policy = JSON.parse(files.get(policyFile).toString("utf8"));
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
    "en", // a fixed locale, so the committed output does not depend on the machine's ICU default
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

#!/usr/bin/env node
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  mkdtempSync,
  opendirSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractRexp } from "../dist/src/rexp.js";

const PASSWORD = process.env.RELUTION_REXP_KEY ?? "Relution";
const OUTPUT_PATH = "example/vendor-references/downloads/derived/windows-relution-csp-evidence.json";
const MAX_POLICY_JSON_BYTES = 10 * 1024 * 1024;
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
  for (const policyFile of listDirectoryNames(policyDir).filter((entry) => entry.endsWith(".json")).sort()) {
    const policy = JSON.parse(readUtf8File(join(policyDir, policyFile)));
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
    state: syncMlState(data),
    dataValues: [...data.matchAll(/<data\s+id="([^"]+)"\s+value="([^"]*)"\s*\/>/gsu)].map((match) => ({
      id: decodeXmlEntities(match[1] ?? ""),
      value: decodeXmlEntities(match[2] ?? ""),
    })),
  };
}

function syncMlState(data) {
  if (hasXmlEmptyTag(data, "enabled")) {
    return "enabled";
  }
  if (hasXmlEmptyTag(data, "disabled")) {
    return "disabled";
  }
  return "unknown";
}

function hasXmlEmptyTag(value, tagName) {
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("<", cursor);
    if (start === -1) {
      return false;
    }
    const end = value.indexOf(">", start + 1);
    if (end === -1) {
      return false;
    }
    const tag = value.slice(start + 1, end).trim();
    if (tag === `${tagName}/` || tag === `${tagName} /`) {
      return true;
    }
    cursor = end + 1;
  }
  return false;
}

function readUtf8File(path) {
  const fd = openSync(resolve(path), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${path}`);
    }
    if (stat.size > MAX_POLICY_JSON_BYTES) {
      throw new Error(`Policy JSON is too large: ${path}`);
    }
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const bytesRead = readSync(fd, data, offset, data.length - offset, offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    if (offset !== data.length) {
      throw new Error(`Policy JSON changed while reading: ${path}`);
    }
    return data.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function listDirectoryNames(path) {
  const dir = opendirSync(resolve(path));
  const names = [];
  try {
    let entry = dir.readSync();
    while (entry !== null) {
      names.push(entry.name);
      entry = dir.readSync();
    }
  } finally {
    dir.closeSync();
  }
  return names;
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

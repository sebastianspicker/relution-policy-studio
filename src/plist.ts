export type PlistValue = string | number | boolean | PlistDataValue | PlistValue[] | { [key: string]: PlistValue };

export interface PlistDataValue {
  kind: "data";
  base64: string;
}

export interface MobileConfigInspection {
  rawContent: string;
  signatureState: "unsigned" | "signed-opaque" | "signed-invalid" | "unknown";
  firstLevelPayloadType: string;
  secondLevelPayloadType: string;
  displayName: string;
}

export function buildMobileConfig(profile: Record<string, PlistValue>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    renderPlistValue(profile, 0),
    "</plist>",
    "",
  ].join("\n");
}

export function plistValueFromUnknown(value: unknown): PlistValue {
  if (isPlistDataValue(value)) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(plistValueFromUnknown);
  }
  if (isRecord(value)) {
    const output: Record<string, PlistValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = plistValueFromUnknown(entry);
    }
    return output;
  }
  return "";
}

export function jsonPayloadKeys(record: Record<string, unknown>): Record<string, PlistValue> {
  const output: Record<string, PlistValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    output[key] = plistValueFromUnknown(entry);
  }
  return output;
}

export function inspectMobileConfigText(rawContent: string): MobileConfigInspection {
  const trimmed = rawContent.trim();
  const signatureState = detectSignatureState(trimmed);
  const displayName = firstPlistStringForKey(trimmed, "PayloadDisplayName") ?? "Custom .mobileconfig";
  const payloadTypes = allPlistStringsForKey(trimmed, "PayloadType");
  const firstLevelPayloadType = payloadTypeName(payloadTypes[0]);
  const secondLevelPayloadType = payloadTypeName(payloadTypes.find((value) => value !== "Configuration") ?? firstLevelPayloadType);
  return {
    rawContent,
    signatureState,
    firstLevelPayloadType,
    secondLevelPayloadType,
    displayName,
  };
}

function renderPlistValue(value: PlistValue, depth: number): string {
  const indent = "  ".repeat(depth);
  if (typeof value === "string") {
    return `${indent}<string>${escapeXml(value)}</string>`;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${indent}<integer>${String(value)}</integer>` : `${indent}<real>${String(value)}</real>`;
  }
  if (typeof value === "boolean") {
    return `${indent}<${value ? "true" : "false"}/>`;
  }
  if (isPlistDataValue(value)) {
    return `${indent}<data>${escapeXml(value.base64)}</data>`;
  }
  if (Array.isArray(value)) {
    return [`${indent}<array>`, ...value.map((entry) => renderPlistValue(entry, depth + 1)), `${indent}</array>`].join("\n");
  }
  const lines = [`${indent}<dict>`];
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`${"  ".repeat(depth + 1)}<key>${escapeXml(key)}</key>`);
    lines.push(renderPlistValue(entry, depth + 1));
  }
  lines.push(`${indent}</dict>`);
  return lines.join("\n");
}

function detectSignatureState(trimmed: string): MobileConfigInspection["signatureState"] {
  if (trimmed.length === 0) {
    return "unknown";
  }
  if (trimmed.startsWith("-----BEGIN PKCS7-----") || trimmed.startsWith("-----BEGIN CMS-----")) {
    return "signed-opaque";
  }
  if (!trimmed.startsWith("<")) {
    return "signed-invalid";
  }
  if (trimmed.includes("<plist") && trimmed.includes("</plist>")) {
    return "unsigned";
  }
  return "signed-invalid";
}

function allPlistStringsForKey(content: string, key: string): string[] {
  const escapedKey = escapeRegex(key);
  const pattern = new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<string>([^<]*)</string>`, "gu");
  return [...content.matchAll(pattern)].map((match) => unescapeXml(match[1] ?? ""));
}

function firstPlistStringForKey(content: string, key: string): string | undefined {
  return allPlistStringsForKey(content, key)[0];
}

function payloadTypeName(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    return "";
  }
  return value === "Configuration" ? "CONFIGURATION" : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/gu, "'")
    .replace(/&quot;/gu, "\"")
    .replace(/&gt;/gu, ">")
    .replace(/&lt;/gu, "<")
    .replace(/&amp;/gu, "&");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlistDataValue(value: unknown): value is PlistDataValue {
  return isRecord(value) && value.kind === "data" && typeof value.base64 === "string";
}

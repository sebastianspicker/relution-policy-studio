/** Serializes the supported plist-value subset without XML injection. */
import { isPlistDataValue, type PlistValue } from "./plist-types.js";

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

function renderPlistValue(value: PlistValue, depth: number): string {
  const indent = "  ".repeat(depth);
  if (typeof value === "string") return `${indent}<string>${escapeXml(value)}</string>`;
  if (typeof value === "number") return renderNumber(value, indent);
  if (typeof value === "boolean") return `${indent}<${value ? "true" : "false"}/>`;
  if (isPlistDataValue(value)) return `${indent}<data>${escapeXml(value.base64)}</data>`;
  if (Array.isArray(value)) return renderArray(value, depth, indent);
  return renderDictionary(value, depth, indent);
}

function renderNumber(value: number, indent: string): string {
  if (!Number.isFinite(value)) throw new TypeError("Plist numbers must be finite");
  return Number.isInteger(value) ? `${indent}<integer>${String(value)}</integer>` : `${indent}<real>${String(value)}</real>`;
}

function renderArray(values: PlistValue[], depth: number, indent: string): string {
  return `${indent}<array>\n${values.map((value) => renderPlistValue(value, depth + 1)).join("\n")}\n${indent}</array>`;
}

function renderDictionary(value: { [key: string]: PlistValue }, depth: number, indent: string): string {
  const lines = [`${indent}<dict>`];
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`${"  ".repeat(depth + 1)}<key>${escapeXml(key)}</key>`, renderPlistValue(entry, depth + 1));
  }
  return `${lines.join("\n")}\n${indent}</dict>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}

import { inspectMobileConfigText } from "../../../src/plist.js";
import { asRecord } from "./editor-utils.js";
import type { JsonRecord } from "./types.js";

const PAYLOAD_TYPE_NAMES = {
  Command: "COMMAND",
  Configuration: "CONFIGURATION",
} as const;

type PayloadTypeKind = keyof typeof PAYLOAD_TYPE_NAMES;

export function updateMobileConfigDetails(details: JsonRecord, rawContent: string): JsonRecord {
  if (rawContent.trim().length === 0) {
    return {
      ...details,
      rawContent,
      payloadContent: {},
      firstLevelPayloadType: "CONFIGURATION",
      secondLevelPayloadType: "",
      mobileConfigSignatureState: "unknown",
    };
  }
  const inspection = inspectMobileConfigText(rawContent);
  if (inspection.signatureState !== "unsigned") {
    return {
      ...details,
      displayName: inspection.displayName,
      rawContent,
      payloadContent: {},
      firstLevelPayloadType: inspection.firstLevelPayloadType,
      secondLevelPayloadType: inspection.secondLevelPayloadType,
      mobileConfigSignatureState: inspection.signatureState,
    };
  }
  const parsed = parseMobileConfig(rawContent);
  const payloadContent = Array.isArray(parsed.PayloadContent) ? parsed.PayloadContent : [];
  const firstPayload = asRecord(payloadContent[0]) ?? {};
  const firstLevelPayloadType = payloadTypeName(parsed.PayloadType);
  const secondLevelPayloadType = typeof firstPayload.PayloadType === "string" ? firstPayload.PayloadType : "";
  const displayName =
    typeof parsed.PayloadDisplayName === "string"
      ? parsed.PayloadDisplayName
      : typeof firstPayload.PayloadDisplayName === "string"
      ? firstPayload.PayloadDisplayName
      : typeof details.displayName === "string"
      ? details.displayName
      : "Custom .mobileconfig";
  return {
    ...details,
    displayName,
    rawContent,
    payloadContent: firstPayload,
    firstLevelPayloadType,
    secondLevelPayloadType,
    mobileConfigSignatureState: "unsigned",
  };
}

export function invalidateMobileConfigDetails(details: JsonRecord, rawContent: string): JsonRecord {
  const inspection = inspectMobileConfigText(rawContent);
  return {
    ...details,
    rawContent,
    payloadContent: {},
    firstLevelPayloadType: inspection.firstLevelPayloadType.length > 0 ? inspection.firstLevelPayloadType : "CONFIGURATION",
    secondLevelPayloadType: "",
    mobileConfigSignatureState: "signed-invalid",
  };
}

export function parseMobileConfig(rawContent: string): JsonRecord {
  const parser = new DOMParser();
  const document = parser.parseFromString(rawContent, "application/xml");
  if (document.querySelector("parsererror") !== null) {
    throw new Error("Mobileconfig XML could not be parsed");
  }
  const plist = document.documentElement;
  if (plist.nodeName !== "plist") {
    throw new Error("Mobileconfig must be a plist document");
  }
  const root = firstElement(plist);
  if (root?.nodeName !== "dict") {
    throw new Error("Mobileconfig plist root must be a dict");
  }
  const parsed = parsePlistElement(root);
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error("Mobileconfig plist root must parse to an object");
  }
  return record;
}

function parsePlistElement(element: Element): unknown {
  switch (element.nodeName) {
    case "dict":
      return parsePlistDict(element);
    case "array":
      return Array.from(element.children).map(parsePlistElement);
    case "integer":
      return parsePlistInteger(element.textContent ?? "0");
    case "real":
      return Number.parseFloat(element.textContent ?? "0");
    case "true":
      return true;
    case "false":
      return false;
    case "string":
    case "data":
    case "date":
      return element.textContent ?? "";
    default:
      throw new Error(`Unsupported plist element: ${element.nodeName}`);
  }
}

function parsePlistInteger(value: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/u.test(trimmed)) {
    throw new Error(`Invalid plist integer: ${value}`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Plist integer is outside the safe integer range: ${value}`);
  }
  return parsed;
}

function parsePlistDict(element: Element): JsonRecord {
  const record: JsonRecord = {};
  const children = Array.from(element.children);
  for (let index = 0; index < children.length; index += 2) {
    const key = children[index];
    const value = children[index + 1];
    if (key?.nodeName !== "key" || value === undefined) {
      throw new Error("Mobileconfig dict contains an invalid key/value sequence");
    }
    record[key.textContent ?? ""] = parsePlistElement(value);
  }
  return record;
}

function firstElement(element: Element): Element | undefined {
  return Array.from(element.children)[0];
}

function payloadTypeName(value: unknown): (typeof PAYLOAD_TYPE_NAMES)[PayloadTypeKind] {
  return isPayloadTypeKind(value) ? PAYLOAD_TYPE_NAMES[value] : PAYLOAD_TYPE_NAMES.Configuration;
}

function isPayloadTypeKind(value: unknown): value is PayloadTypeKind {
  return typeof value === "string" && value in PAYLOAD_TYPE_NAMES;
}

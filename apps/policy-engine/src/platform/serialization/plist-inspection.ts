/** Inspects trusted metadata from unsigned profiles and preserves signed opacity. */
import { inspectedUnsignedPlist } from "./plist-inspection-xml.js";
import { allPlistStringsForKey, firstPlistStringForKey, payloadTypeName } from "./plist-inspection-values.js";

export interface MobileConfigInspection {
  rawContent: string;
  signatureState: "unsigned" | "signed-opaque" | "signed-invalid" | "unknown";
  firstLevelPayloadType: string;
  secondLevelPayloadType: string;
  displayName: string;
}

export function inspectMobileConfigText(rawContent: string): MobileConfigInspection {
  const content = rawContent.trim();
  const unsigned = inspectedUnsignedPlist(content);
  const signatureState = mobileConfigSignatureState(content, unsigned);
  const displayName = unsigned === undefined ? "Custom .mobileconfig" : firstPlistStringForKey(unsigned, "PayloadDisplayName") ?? "Custom .mobileconfig";
  const payloadTypes = unsigned === undefined ? [] : allPlistStringsForKey(unsigned, "PayloadType");
  const firstLevelPayloadType = payloadTypeName(payloadTypes[0]);
  const secondLevelPayloadType = payloadTypeName(payloadTypes.find((value) => value !== "Configuration") ?? firstLevelPayloadType);
  return { rawContent, signatureState, firstLevelPayloadType, secondLevelPayloadType, displayName };
}

function mobileConfigSignatureState(content: string, unsigned: string | undefined): MobileConfigInspection["signatureState"] {
  if (content.length === 0) return "unknown";
  if (content.startsWith("-----BEGIN PKCS7-----") || content.startsWith("-----BEGIN CMS-----")) return "signed-opaque";
  return unsigned === undefined ? "signed-invalid" : "unsigned";
}

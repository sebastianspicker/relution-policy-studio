const WORD_LABELS: Record<string, string> = {
  ACL: "ACL", AD: "AD", AES: "AES", AI: "AI", APN: "APN", APNS: "APNs", API: "API", ARD: "ARD", BYOD: "BYOD", CA: "CA",
  CALDAV: "CalDAV", CARDDAV: "CardDAV", CDN: "CDN", CERT: "Certificate", CHROMEOS: "ChromeOS", CRL: "CRL", CSV: "CSV", CSP: "CSP",
  CSR: "CSR", DAV: "DAV", DEP: "DEP", DHCP: "DHCP", DNS: "DNS", EAP: "EAP", FDE: "FDE", FIDO: "FIDO", FQDN: "FQDN", HTTP: "HTTP",
  HTTPS: "HTTPS", ICCID: "ICCID", ID: "ID", IFP: "IFP", IMEI: "IMEI", IMSI: "IMSI", IOS: "iOS", IOT: "IoT", IP: "IP", JSON: "JSON",
  JWT: "JWT", KNX: "KNX", LAN: "LAN", LDAP: "LDAP", MAC: "MAC", MACOS: "macOS", MDM: "MDM", MMS: "MMS", MSCA: "MSCA", NFC: "NFC",
  OAUTH: "OAuth", OIDC: "OIDC", OS: "OS", OTA: "OTA", PDF: "PDF", PEAP: "PEAP", PIN: "PIN", PKCS: "PKCS", PSK: "PSK", QR: "QR",
  RCS: "RCS", RDP: "RDP", SAML: "SAML", SCEP: "SCEP", SCIM: "SCIM", SID: "SID", SMB: "SMB", SMS: "SMS", SMTP: "SMTP", SSID: "SSID",
  SSL: "SSL", SSO: "SSO", TCP: "TCP", TKIP: "TKIP", TLS: "TLS", TPM: "TPM", TVOS: "tvOS", UDP: "UDP", UI: "UI", URI: "URI",
  URL: "URL", USB: "USB", UUID: "UUID", VPP: "VPP", VPN: "VPN", WAN: "WAN", WEP: "WEP", WIFI: "Wi-Fi", WPA: "WPA", XML: "XML",
};

const SPECIAL_LABEL_PAIRS: Record<string, string> = {
  "File Vault": "FileVault", "MAC OS": "macOS", "I OS": "iOS", "Wi Fi": "Wi-Fi", "Cal DAV": "CalDAV", "Card DAV": "CardDAV",
};

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&",
};

export function cleanDescription(description: string | undefined): string | undefined {
  if (description === undefined) {
    return undefined;
  }
  const text = description
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:nbsp|quot|#39|lt|gt|amp);/gu, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 0 ? text : undefined;
}

function labelWords(words: string[]): string {
  return joinSpecialLabels(words.filter((word) => word.length > 0).map(labelWord)).join(" ");
}

export function labelConfigurationType(type: string): string {
  return labelWords(type.split("_"));
}

export function labelFieldPath(path: string): string {
  return labelWords(path.split(".").flatMap(splitIdentifier));
}

export function labelEnumValue(value: string): string {
  return labelWords(value.split(/[_\s-]+/u).flatMap(splitIdentifier));
}

function splitIdentifier(identifier: string): string[] {
  return identifier.match(/[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+/gu) ?? [identifier];
}

function labelWord(word: string): string {
  const mapped = WORD_LABELS[word.toUpperCase()];
  if (mapped !== undefined) {
    return mapped;
  }
  return /^\d+$/u.test(word) ? word : `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function joinSpecialLabels(labels: string[]): string[] {
  const joined: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const current = labels[index];
    if (current === undefined) {
      continue;
    }
    const special = SPECIAL_LABEL_PAIRS[`${current} ${labels[index + 1] ?? ""}`];
    if (special !== undefined) {
      joined.push(special);
      index += 1;
    } else {
      joined.push(current);
    }
  }
  return joined;
}

/** Extracts literal plist metadata values from inspection-safe XML markup. */
export function firstPlistStringForKey(content: string, key: string): string | undefined {
  return allPlistStringsForKey(content, key)[0];
}

export function allPlistStringsForKey(content: string, key: string): string[] {
  const values: string[] = [];
  const expression = /<key>\s*([\s\S]*?)\s*<\/key>\s*<string>([\s\S]*?)<\/string>/gu;
  for (const match of content.matchAll(expression)) {
    if (unescapeXml(match[1] ?? "") === key) values.push(unescapeXml(match[2] ?? ""));
  }
  return values;
}

export function payloadTypeName(value: string | undefined): string {
  if (value === undefined || value.length === 0) return "";
  return value === "Configuration" ? "CONFIGURATION" : value;
}

function unescapeXml(value: string): string {
  return value.replace(/&apos;/gu, "'").replace(/&quot;/gu, "\"").replace(/&gt;/gu, ">").replace(/&lt;/gu, "<").replace(/&amp;/gu, "&");
}

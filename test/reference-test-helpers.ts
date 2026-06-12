export type JsonRecord = Record<string, unknown>;

export type SourceEntry = {
  id: string;
  url: string;
};

export type DownloadManifestEntry = {
  id: string;
  url: string;
  localPath: string;
  headersPath: string;
  textPath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type RulesetPolicy = {
  platform: string;
  name: string;
  rules: Array<{
    id: string;
    title: string;
    informational?: boolean;
    mappings?: JsonRecord[];
    reason?: string;
    sourceIds?: string[];
  }>;
};

export type ImportableRuleset = {
  version: number;
  name: string;
  policies: RulesetPolicy[];
};

export function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce(valueAtSafePathSegment, value);
}

function valueAtSafePathSegment(current: unknown, part: string): unknown {
  if (!isSafeObjectPathSegment(part) || current === null || typeof current !== "object") {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(current, part)?.value;
}

function isSafeObjectPathSegment(part: string): boolean {
  return part !== "__proto__" && part !== "constructor" && part !== "prototype";
}

/** Parses the dashboard's compact filter inputs before any network request. */
const RELUTION_LIST_VALUE_PATTERN = /^[A-Z0-9_-]+$/u;

export function optionalPort(value: string): number | undefined {
  return value.trim().length === 0 ? undefined : Number(value);
}

export function csvValues(value: string, fieldLabel: string): string[] | undefined {
  const values = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const invalid = values.find((entry) => !RELUTION_LIST_VALUE_PATTERN.test(entry));
  if (invalid !== undefined) throw new Error(`Invalid Relution ${fieldLabel}: ${invalid}`);
  return values.length === 0 ? undefined : values;
}

export function expectedPoliciesByPlatform(value: string): Record<string, string[]> | undefined {
  const pairs = value.split(";").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (pairs.length === 0) return undefined;
  const result: Record<string, string[]> = {};
  for (const pair of pairs) addExpectedPolicyPair(result, pair);
  return result;
}

function addExpectedPolicyPair(result: Record<string, string[]>, pair: string): void {
  const separator = pair.indexOf("=");
  if (separator < 0) {
    throw new Error("Expected policies must use PLATFORM=Policy A,Policy B entries separated by semicolons.");
  }
  const platform = pair.slice(0, separator).trim();
  if (!RELUTION_LIST_VALUE_PATTERN.test(platform)) {
    throw new Error(`Invalid expected-policy platform: ${platform}`);
  }
  const policies = pair.slice(separator + 1).split(",").map((policy) => policy.trim()).filter((policy) => policy.length > 0);
  if (policies.length === 0) {
    throw new Error(`Expected-policy platform ${platform} must include at least one policy name.`);
  }
  result[platform] = policies;
}

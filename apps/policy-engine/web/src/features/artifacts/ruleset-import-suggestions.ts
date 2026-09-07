import { appleSchemaEntriesForPlatform } from "../../../../src/browser/apple.js";
import type { ImportContext, RulesetRule } from "../../shared/ruleset-import-contracts.js";

export function rulesetSuggestions(rule: RulesetRule, platform: string, context: ImportContext): string[] {
  const haystack = `${rule.id} ${rule.title}`.toLowerCase();
  const relution: string[] = [];
  for (const template of context.bundle.configurationTypes) {
    if (!template.platforms.includes(platform) || !hasRuleToken(haystack, template.label, template.type)) {
      continue;
    }
    relution.push(`relution-native:${template.type}`);
    if (relution.length === 5) {
      break;
    }
  }
  const apple: string[] = [];
  for (const entry of appleSchemaEntriesForPlatform(context.appleSchema, platform, "profile")) {
    if (!hasRuleToken(haystack, entry.title, entry.identifier)) {
      continue;
    }
    apple.push(`apple-schema-profile:${entry.id}`);
    if (apple.length === 5) {
      break;
    }
  }
  return [...relution, ...apple].slice(0, 8);
}

function hasRuleToken(haystack: string, ...values: string[]): boolean {
  return rulesetTokens(...values).some((token) => haystack.includes(token));
}

function rulesetTokens(...values: string[]): string[] {
  return values.join(" ").toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= 4);
}

/** Selects a baseline template option without coupling pure derivation to React hooks. */
import type {
  BaselineTemplateOption,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";

export function selectedBaselineOption(
  options: readonly BaselineTemplateOption[],
  platform: BaselineTemplatePlatform,
  tier: BaselineTemplateTier,
  shape: BaselineTemplateShape,
): BaselineTemplateOption | undefined {
  return options.find((candidate) => candidate.platform === platform && candidate.tier === tier && candidate.shape === shape);
}

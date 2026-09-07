/** Compatibility facade for narrow compliance helpers shared by the public API. */
export {
  applyNativeBundle,
  applyRecommendationMappings,
} from "./compliance-application.js";
export { appliesToPolicy } from "./compliance-policy-applicability.js";
export { selectedPolicyTarget } from "./compliance-policy-target.js";
export { evaluateRecommendation } from "./compliance-recommendation-evaluation.js";

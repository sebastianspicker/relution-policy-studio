import type {AssurancePreset, AssuranceRecommendation, AssuranceApplicabilityContext} from 'rexp-studio/browser';
export function presetRows(
  preset: AssurancePreset,
  presets: readonly AssurancePreset[],
): AssurancePreset['selections'] {
  const parent = presets.find(p => p.id === preset.inherits);
  const rows = new Map((parent ? presetRows(parent, presets) : []).map(row => [row.recommendationId, row]));
  for (const row of preset.selections) {
    const parentRow = rows.get(row.recommendationId);
    rows.set(
      row.recommendationId,
      parentRow
        ? {
            ...row,
            fixedValues: {...parentRow.fixedValues, ...row.fixedValues},
            parameterDefaults: {...parentRow.parameterDefaults, ...row.parameterDefaults},
            settingRationales: {...parentRow.settingRationales, ...row.settingRationales},
            overrideJustifications: {...parentRow.overrideJustifications, ...row.overrideJustifications},
          }
        : row,
    );
  }
  for (const row of preset.exclusions) rows.delete(row.recommendationId);
  return [...rows.values()];
}
export function applicability(
  r: AssuranceRecommendation,
  platform: string,
  context: AssuranceApplicabilityContext,
): string {
  if (!platform || !r.applicability.predicates.length || r.applicability.unresolvedRequirements?.length)
    return 'Context required';
  for (const p of r.applicability.predicates) {
    const actual = p.field === 'platform' ? platform : context[p.field];
    if (!actual) return 'Context required';
    const values = Array.isArray(p.value) ? p.value : [p.value];
    if (p.operator === 'equals' || p.operator === 'oneOf') {
      if (!values.includes(actual)) return 'Excluded by context';
    } else return 'Preview required';
  }
  return 'Matches context';
}
export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined ? 'Not specified' : JSON.stringify(value);
}

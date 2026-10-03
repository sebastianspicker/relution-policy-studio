import {blankIntent, type Intent, type Profile, type Project, type Row} from './types';

export const platformOptions = [
  ['ios_ipados', 'iOS / iPadOS', 'IOS'],
  ['macos', 'macOS', 'MACOS'],
  ['windows', 'Windows', 'WINDOWS'],
  ['android_enterprise', 'Android Enterprise', 'ANDROID_ENTERPRISE'],
] as const;

export interface ScopeDraft {
  intentId: string;
  name: string;
  outcome: string;
  organization: string;
  location: string;
  cohort: string;
  ownership: string;
  platform: string;
  scope: string;
  stage: string;
  role: string;
  layer: number | null;
  references?: Partial<
    Record<'organizations' | 'locations' | 'cohorts' | 'scope_blueprints' | 'rollout_stages', string>
  >;
}
const firstId = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? '') : '');
const named = (rows: Row[], id: string) => rows.find(row => row.id === id)?.name ?? '';

export function scopeDraft(project: Project, intentId?: string): ScopeDraft {
  const p = project.profile;
  const intent = p.intents.find(row => row.id === intentId) ?? p.intents[0] ?? blankIntent();
  const cohort = p.cohorts.find(row => row.id === intent.cohort_ids[0]);
  const scope = p.scope_blueprints.find(row => row.id === intent.scope_ids[0]);
  const assignment = p.assignments.find(row => row.intent_id === intent.id && row.scope_id === scope?.id);
  return {
    intentId: intent.id,
    name: p.intents.length ? intent.name : '',
    outcome: intent.outcome,
    organization: named(p.organizations, String(cohort?.organization_id ?? firstId(scope?.organization_ids))),
    location: named(p.locations, firstId(cohort?.location_ids) || firstId(scope?.location_ids)),
    cohort: cohort?.name ?? '',
    ownership: intent.ownership ?? '',
    platform: intent.platform,
    scope: scope?.name ?? '',
    stage: named(p.rollout_stages, String(assignment?.rollout_stage_id ?? '')),
    role: intent.role ?? '',
    layer: intent.layer,
    references: {
      organizations: String(cohort?.organization_id ?? firstId(scope?.organization_ids)),
      locations: firstId(cohort?.location_ids) || firstId(scope?.location_ids),
      cohorts: cohort?.id,
      scope_blueprints: scope?.id,
      rollout_stages: String(assignment?.rollout_stage_id ?? ''),
    },
  };
}

/** Reuse named records without changing shared constraints; append only explicit new records. */
export function applyScopeDraft(profile: Profile, draft: ScopeDraft): Profile {
  const next = structuredClone(profile);
  const row = (
    collection: 'organizations' | 'locations' | 'cohorts' | 'scope_blueprints' | 'rollout_stages',
    name: string,
    fields: Record<string, unknown>,
  ) => {
    if (!name.trim()) return undefined;
    const matches = next[collection].filter(item => item.name === name.trim());
    const original = matches.find(item => item.id === draft.references?.[collection]);
    if (original) return original;
    if (matches.length > 1)
      throw new Error(
        `More than one ${collection.replaceAll('_', ' ')} record is named “${name.trim()}”. Choose an unambiguous name in Institution tools before continuing.`,
      );
    if (matches[0]) return matches[0];
    const created: Row = {id: crypto.randomUUID(), name: name.trim(), requirements: [], ...fields};
    next[collection].push(created);
    return created;
  };
  const organization = row('organizations', draft.organization, {parent_id: null, description: null});
  const location = row('locations', draft.location, {organization_id: organization?.id ?? null, description: null});
  const cohort = row('cohorts', draft.cohort, {
    organization_id: organization?.id ?? null,
    location_ids: location ? [location.id] : [],
    role: draft.role || null,
    ownership: draft.ownership || null,
  });
  const scope = row('scope_blueprints', draft.scope, {
    cohort_ids: cohort ? [cohort.id] : [],
    organization_ids: organization ? [organization.id] : [],
    location_ids: location ? [location.id] : [],
    platforms: draft.platform ? [draft.platform] : [],
    ownerships: draft.ownership ? [draft.ownership] : [],
    roles: draft.role ? [draft.role] : [],
    depends_on: [],
  });
  const stage = row('rollout_stages', draft.stage, {order: next.rollout_stages.length, depends_on: []});
  const previous = next.intents.find(item => item.id === draft.intentId);
  const replaceFirst = (ids: string[], id?: string) =>
    !id ? [...ids] : ids.includes(id) ? [id, ...ids.filter(value => value !== id)] : [id, ...ids.slice(1)];
  const intent: Intent = {
    ...(previous ?? blankIntent()),
    id: draft.intentId,
    name: draft.name,
    outcome: draft.outcome,
    platform: draft.platform,
    ownership: draft.ownership,
    role: draft.role,
    layer: draft.layer,
    cohort_ids: replaceFirst(previous?.cohort_ids ?? [], cohort?.id),
    scope_ids: replaceFirst(previous?.scope_ids ?? [], scope?.id),
  };
  next.intents = previous
    ? next.intents.map(item => (item.id === intent.id ? intent : item))
    : [...next.intents, intent];
  if (scope) {
    const assignment =
      next.assignments.find(item => item.intent_id === intent.id && item.scope_id === scope.id) ??
      next.assignments.find(item => item.intent_id === intent.id && item.scope_id === previous?.scope_ids[0]);
    if (assignment)
      next.assignments = next.assignments.map(item =>
        item.id === assignment.id
          ? {...item, scope_id: scope.id, rollout_stage_id: stage?.id ?? item.rollout_stage_id}
          : item,
      );
    else
      next.assignments.push({
        id: crypto.randomUUID(),
        name: draft.name + ' assignment',
        intent_id: intent.id,
        scope_id: scope.id,
        rollout_stage_id: stage?.id ?? null,
        requirements: [],
      });
  }
  return next;
}

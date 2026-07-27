const CAMPUSWEAVE_STEPS = new Set([
  'start',
  'institution',
  'organization',
  'groups',
  'policies',
  'assignments',
  'readiness',
  'review',
])

export function stepFromHash(hash) {
  const candidate = String(hash || '').replace(/^#/, '')
  return CAMPUSWEAVE_STEPS.has(candidate) ? candidate : 'start'
}

export function profileCounts(profile) {
  return {
    organizationUnits: profile?.organization_units?.length || 0,
    locations: profile?.locations?.length || 0,
    cohorts: profile?.functional_cohorts?.length || 0,
    groups: profile?.group_blueprints?.length || 0,
    policies: profile?.policy_units?.length || 0,
    assignments: profile?.assignment_intents?.length || 0,
    workflows: profile?.api_workflows?.length || 0,
    unresolved: profile?.unresolved_inputs?.filter((item) => item.status === 'unresolved').length || 0,
  }
}

export function stepCounts(plan) {
  const counts = {}
  for (const step of plan?.steps || []) {
    counts[step.kind] = (counts[step.kind] || 0) + 1
  }
  return counts
}

export function assignmentRows(profile) {
  const policies = new Map(
    (profile?.policy_units || []).map((policy) => [policy.policy_id, policy]),
  )
  const groups = new Map(
    (profile?.group_blueprints || []).map((group) => [group.group_id, group]),
  )
  const cohorts = new Map(
    (profile?.functional_cohorts || []).map((cohort) => [cohort.cohort_id, cohort]),
  )
  return (profile?.assignment_intents || []).map((assignment) => ({
    ...assignment,
    policy: policies.get(assignment.policy_id),
    group: groups.get(assignment.scope_blueprint_id),
    cohortLabels: assignment.cohort_ids.map(
      (cohortId) => cohorts.get(cohortId)?.label || cohortId,
    ),
  }))
}

export function organizationTree(profile) {
  const units = profile?.organization_units || []
  const children = new Map()
  for (const unit of units) {
    const parent = unit.parent_unit_id || '__root__'
    children.set(parent, [...(children.get(parent) || []), unit])
  }
  for (const values of children.values()) {
    values.sort((left, right) => left.label.localeCompare(right.label))
  }
  const result = []
  const visit = (parent, depth) => {
    for (const unit of children.get(parent) || []) {
      result.push({ ...unit, depth })
      visit(unit.unit_id, depth + 1)
    }
  }
  visit('__root__', 0)
  return result
}

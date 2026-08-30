import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assignmentRows,
  organizationTree,
  profileCounts,
  stepCounts,
  stepFromHash,
} from '../../web/model.mjs'

test('selectors normalize navigation and summarize a profile safely', () => {
  assert.equal(stepFromHash('#review'), 'review')
  assert.equal(stepFromHash('unknown'), 'start')
  assert.equal(stepFromHash('##groups'), 'start')

  const profile = {
    organization_units: [{ unit_id: 'root' }],
    locations: [{ location_id: 'north' }],
    functional_cohorts: [{ cohort_id: 'staff', label: 'Staff' }],
    group_blueprints: [{ group_id: 'all-devices' }],
    policy_units: [{ policy_id: 'baseline' }],
    assignment_intents: [{ assignment_id: 'baseline-staff' }],
    api_workflows: [{ workflow_id: 'review' }],
    unresolved_inputs: [{ status: 'unresolved' }, { status: 'resolved' }],
  }
  assert.deepEqual(profileCounts(profile), {
    organizationUnits: 1,
    locations: 1,
    cohorts: 1,
    groups: 1,
    policies: 1,
    assignments: 1,
    workflows: 1,
    unresolved: 1,
  })
  assert.deepEqual(stepCounts({ steps: [{ kind: 'group' }, { kind: 'group' }, { kind: 'policy' }] }), {
    group: 2,
    policy: 1,
  })
})

test('selectors join assignment labels and produce an ordered organization tree', () => {
  const profile = {
    policy_units: [{ policy_id: 'policy.one', label: 'Baseline' }],
    group_blueprints: [{ group_id: 'group.one', label: 'All devices' }],
    functional_cohorts: [{ cohort_id: 'staff', label: 'Staff' }],
    assignment_intents: [{
      assignment_id: 'assignment.one',
      policy_id: 'policy.one',
      scope_blueprint_id: 'group.one',
      cohort_ids: ['staff', 'unresolved'],
    }],
    organization_units: [
      { unit_id: 'root', label: 'University' },
      { unit_id: 'zeta', label: 'Zeta', parent_unit_id: 'root' },
      { unit_id: 'alpha', label: 'Alpha', parent_unit_id: 'root' },
    ],
  }
  const [row] = assignmentRows(profile)
  assert.equal(row.policy.label, 'Baseline')
  assert.equal(row.group.label, 'All devices')
  assert.deepEqual(row.cohortLabels, ['Staff', 'unresolved'])
  assert.deepEqual(organizationTree(profile).map(({ unit_id, depth }) => [unit_id, depth]), [
    ['root', 0],
    ['alpha', 1],
    ['zeta', 1],
  ])
})

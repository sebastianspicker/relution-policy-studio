import assert from 'node:assert/strict'
import test from 'node:test'

import { stepFromHash } from '../../web/model.mjs'
import { renderApp, selectedDefaults } from '../../web/views.mjs'

const profile = {
  package: { institution_code: 'example-u', institution_label: 'Example University' },
  organization_units: [{ unit_id: 'ou.example-u', label: 'Example University' }],
  locations: [],
  functional_cohorts: [],
  group_blueprints: [{ group_id: 'group.all', assignment_eligible: true }],
  policy_units: [{ policy_id: 'policy.baseline' }],
  assignment_intents: [{ assignment_id: 'assignment.baseline' }],
  api_workflows: [],
  unresolved_inputs: [],
}

function stateFor(step, exportedProfileSha256) {
  return {
    bundle: {
      profile,
      plan: { steps: [{ kind: 'policy_publication_prerequisite' }] },
      profile_sha256: 'profile-sha',
    },
    step,
    selected: selectedDefaults(profile),
    filters: { policies: '', assignments: '' },
    busy: false,
    notice: '',
    error: undefined,
    storageState: 'memory',
    navigationOpen: false,
    compact: false,
    exportedProfileSha256,
    institutionDraft: undefined,
    selectionAnnouncement: '',
    confirmation: undefined,
  }
}

test('navigation reaches review and only enables matching digest-bound plan export after profile export', () => {
  const reviewStep = stepFromHash('#review')
  const beforeProfileExport = renderApp(stateFor(reviewStep))
  assert.match(beforeProfileExport, /Review and export/)
  assert.match(beforeProfileExport, /Export profile first/)
  assert.match(beforeProfileExport, /data-kind="plan" disabled/)

  const afterProfileExport = renderApp(stateFor(reviewStep, 'profile-sha'))
  assert.match(afterProfileExport, /Export matching plan/)
  assert.doesNotMatch(afterProfileExport, /data-kind="plan" disabled/)
})

import { assignmentRows } from '../model.mjs'
import { displayValue, escapeHtml, icon } from './html.mjs'

export function dossierHeader(label, title, id = '') {
  const idLine = id ? `<p class="dossier-id">${escapeHtml(id)}</p>` : ''
  return `<header class="inspector-header dossier-header"><div class="dossier-kicker"><span class="dossier-kicker-bar" aria-hidden="true"></span>${escapeHtml(label)}</div><h2>${escapeHtml(title)}</h2>${idLine}</header>`
}

export function definitionList(rows) {
  return `<dl class="inspector-section definition-list fact-grid">${rows.map(([label, value]) =>
    `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
  ).join('')}</dl>`
}

export function detailList(title, values) {
  return `<section class="inspector-section"><h3>${escapeHtml(title)}</h3><ul class="detail-list">${values.map((value) => `<li>${icon('check')}<span>${escapeHtml(value)}</span></li>`).join('') || '<li class="muted">None declared</li>'}</ul></section>`
}

export function inspectorOrganization(state) {
  const profile = state.bundle.profile
  const unit = profile.organization_units.find((item) => item.unit_id === state.selected.organization) || profile.organization_units[0]
  const locations = new Map(profile.locations.map((item) => [item.location_id, item.label]))
  return `${dossierHeader('Organization context', unit.label, unit.unit_id)}
    ${definitionList([
      ['Kind', displayValue(unit.kind)],
      ['Data risk', displayValue(unit.data_risk)],
      ['Assignment eligible', 'Not eligible'],
    ])}
    ${detailList('Default locations', unit.default_location_ids.map((id) => locations.get(id) || id))}
    ${detailList('Usability requirements', unit.usability_requirements)}
    <p class="inspector-boundary">Organization context never creates device membership.</p>`
}

export function inspectorGroup(state) {
  const groups = state.bundle.profile.group_blueprints
  const group = groups.find((item) => item.group_id === state.selected.groups) || groups[0]
  return `${dossierHeader('Group blueprint', group.label, group.group_id)}
    ${definitionList([
      ['Stable ID', group.group_id],
      ['Dimension', displayValue(group.primary_dimension)],
      ['Membership', displayValue(group.membership_mode)],
      ['Assignment eligible', group.assignment_eligible ? 'Yes, after target proof' : 'Not eligible'],
    ])}
    ${detailList('Declared values', group.values)}
    ${detailList('Referenced blueprints', group.referenced_group_ids)}
    <p class="inspector-boundary">Filters, resource IDs, and members remain target-contract required.</p>`
}

export function inspectorPolicy(state) {
  const policies = state.bundle.profile.policy_units
  const policy = policies.find((item) => item.policy_id === state.selected.policies) || policies[0]
  return `${dossierHeader('Policy intent', policy.label, policy.policy_id)}
    ${definitionList([
      ['Platform', displayValue(policy.platform)],
      ['Models', policy.models.map(displayValue).join(', ')],
      ['Impact floor', `Tier ${policy.impact_tier_floor}`],
      ['Activation', displayValue(policy.activation_state)],
    ])}
    ${detailList('Desired outcomes', policy.intent_settings.map((setting) => setting.desired_outcome))}
    ${detailList('Prerequisites', policy.prerequisites)}
    ${detailList('Explicit exclusions', policy.exclusions)}
    <p class="inspector-boundary">No payload or publication authority is present.</p>`
}

export function inspectorAssignment(state) {
  const rows = assignmentRows(state.bundle.profile)
  const row = rows.find((item) => item.assignment_id === state.selected.assignments) || rows[0]
  return `${dossierHeader('Assignment dossier', row.policy?.label || row.policy_id, row.assignment_id)}
    ${definitionList([
      ['Group blueprint', row.group?.label || row.scope_blueprint_id],
      ['Platform / model', `${displayValue(row.platform)} / ${displayValue(row.model)}`],
      ['Rollout ring', displayValue(row.ring_id)],
      ['Impact floor', `Tier ${row.impact_tier_floor}`],
    ])}
    ${detailList('Functional cohorts', row.cohortLabels)}
    ${detailList('Reference planning notes', row.notes)}
    <p class="inspector-boundary">Reference intent is read-only. CampusWeave accepts only institution rebinding, never arbitrary free text or target data.</p>`
}

export function renderInspector(state) {
  if (!state.bundle) return '<div class="inspector-empty"><div class="loader small"></div></div>'
  if (state.step === 'organization') return inspectorOrganization(state)
  if (state.step === 'groups') return inspectorGroup(state)
  if (state.step === 'policies') return inspectorPolicy(state)
  if (state.step === 'assignments') return inspectorAssignment(state)
  return ''
}

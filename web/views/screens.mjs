import {
  assignmentRows,
  organizationTree,
  profileCounts,
  stepCounts,
} from '../model.mjs'
import { displayValue, escapeHtml, icon, statusTag } from './html.mjs'
import {
  inspectorAssignment,
  inspectorGroup,
  inspectorOrganization,
  inspectorPolicy,
} from './inspectors.mjs'

export function emptyLoading(state) {
  if (state.error) {
    return `<section class="loading-state" aria-live="polite"><span class="loading-error-icon">${icon('warning')}</span><h1>Reference profile unavailable</h1><p>CampusWeave could not load the local reference profile.</p><button class="button primary" data-action="retry-reference" ${state.busy ? 'disabled' : ''}>Retry loading reference profile</button></section>`
  }
  return `<section class="loading-state" aria-live="polite"><div class="loader"></div><h1>Opening the university profile</h1><p>The local compiler is checking the commit-safe reference package.</p></section>`
}

export function pageHeader(title, description) {
  return `<header class="page-header"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div></header>`
}

export function renderStart(state) {
  const profile = state.bundle.profile
  const counts = profileCounts(profile)
  return `<section class="screen screen-start">
    ${pageHeader('Review an offline university plan', 'Inspect groups, policy intent, and assignments without connecting to a Relution instance.')}
    <div class="start-lead">
      <div class="start-copy">
        <h2>${escapeHtml(profile.package.institution_label)}</h2>
        <p>The active draft is a reference-derived public design. Only the institution name and namespace are user-supplied; the local compiler produces an inert, digest-bound plan.</p>
        <div class="button-row">
          <button class="button primary" data-action="navigate" data-step="institution">Begin review ${icon('chevron')}</button>
          <button class="button secondary" data-action="use-reference" ${state.busy ? 'disabled' : ''}>Reset to reference</button>
        </div>
      </div>
      <dl class="start-summary">
        <div><dt>${counts.organizationUnits}</dt><dd>organization units</dd></div>
        <div><dt>${counts.groups}</dt><dd>group blueprints</dd></div>
        <div><dt>${counts.policies}</dt><dd>policy intents</dd></div>
        <div><dt>${counts.assignments}</dt><dd>assignments</dd></div>
      </dl>
    </div>
    <div class="boundary-band">
      <h2>What stays outside CampusWeave</h2>
      <div class="boundary-columns">
        <p><strong>No live connection</strong><span>No tenant URL, token, API discovery, or outbound request path exists here.</span></p>
        <p><strong>No target evidence fields</strong><span>OpenAPI, inventory, identifiers, approvals, and audit records have no accepted import or storage path.</span></p>
        <p><strong>No apply action</strong><span>Every compiled step remains unbound and unauthorized with zero mutation capability.</span></p>
      </div>
    </div>
  </section>`
}

export function renderInstitution(state) {
  const pkg = state.bundle.profile.package
  const draft = state.institutionDraft || pkg
  const dirty = draft.institution_label !== pkg.institution_label
    || draft.institution_code !== pkg.institution_code
  return `<section class="screen">
    ${pageHeader('Define the institution', 'Use a neutral namespace and label. Target organization identifiers do not belong in this profile.')}
    <form class="form-sheet" data-form="institution">
      <label><span>Institution name</span><input data-institution-field name="institution_label" maxlength="200" pattern=".*[^ ].*" title="Enter a nonblank institution name" required value="${escapeHtml(draft.institution_label)}" autocomplete="off" ${state.busy ? 'disabled' : ''}><small>Human-readable label used throughout the portable design. Do not enter secrets or target identifiers.</small></label>
      <label><span>Institution code</span><input data-institution-field name="institution_code" maxlength="48" pattern="[a-z0-9](?:[a-z0-9]|-)*" required value="${escapeHtml(draft.institution_code)}" autocomplete="off" spellcheck="false" ${state.busy ? 'disabled' : ''}><small>Lowercase namespace used to rebind every institution-owned policy and workflow ID.</small></label>
      <div class="form-boundary"><span>${icon('lock')}</span><p><strong>Commit-safe only</strong>No URL, organization UUID, user data, or credential field can be added through this interface.</p></div>
      <div class="form-actions"><button class="button primary" type="submit" ${state.busy ? 'disabled' : ''}>Save institution</button><p class="form-status ${dirty ? 'is-dirty' : ''}" data-form-status role="status">${dirty ? 'Unsaved changes. Save the institution before continuing.' : 'Institution matches the validated local draft.'}</p></div>
    </form>
  </section>`
}

export function renderOrganization(state) {
  const profile = state.bundle.profile
  const selected = state.selected.organization || profile.organization_units[0]?.unit_id
  const locationIndex = new Map(profile.locations.map((item) => [item.location_id, item.label]))
  const rows = organizationTree(profile).map((unit) => `
    <button class="entity-row depth-${Math.min(unit.depth, 5)} ${unit.unit_id === selected ? 'selected' : ''}" data-action="select-organization" data-id="${escapeHtml(unit.unit_id)}" aria-pressed="${unit.unit_id === selected}" ${unit.unit_id === selected ? `aria-controls="${state.compact ? 'selection-inline-organization' : 'selection-inspector'}"` : ''}>
      <span class="entity-icon">${icon(unit.kind === 'institution' ? 'institution' : 'folder')}</span>
      <span class="entity-copy"><strong>${escapeHtml(unit.label)}</strong><small>${escapeHtml(displayValue(unit.kind))} · ${escapeHtml(displayValue(unit.data_risk))} data</small></span>
      <span class="entity-meta">${unit.default_location_ids.map((id) => escapeHtml(locationIndex.get(id) || id)).join(', ')}</span>
      ${icon('chevron')}
    </button>${unit.unit_id === selected ? `<section id="selection-inline-organization" class="mobile-inline-detail" aria-label="Selected organization details">${inspectorOrganization(state)}</section>` : ''}`).join('')
  return `<section class="screen">
    ${pageHeader('Review the university structure', 'Organization units describe business context only. They never create membership or assignment scope.')}
    <div class="toolbar"><span class="toolbar-summary">${profile.organization_units.length} units across ${profile.locations.length} locations</span><span>${statusTag('No organization-derived targeting', 'safe')}</span></div>
    <div class="entity-list organization-list">${rows}</div>
  </section>`
}

export function renderGroups(state) {
  const groups = state.bundle.profile.group_blueprints
  const selected = state.selected.groups || groups[0]?.group_id
  return `<section class="screen">
    ${pageHeader('Review group blueprints', 'Inspect reusable dimensions and intersections. Actual filters and member counts require target evidence.')}
    <div class="list-header"><span>Blueprint</span><span>Dimension</span><span>Membership</span><span>State</span></div>
    <div class="entity-list">${groups.map((group) => `
      <button class="entity-row four-column ${group.group_id === selected ? 'selected' : ''}" data-action="select-groups" data-id="${escapeHtml(group.group_id)}" aria-pressed="${group.group_id === selected}" ${group.group_id === selected ? `aria-controls="${state.compact ? 'selection-inline-groups' : 'selection-inspector'}"` : ''}>
        <span class="entity-copy"><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(displayValue(group.group_kind))}</small></span>
        <span>${escapeHtml(displayValue(group.primary_dimension))}</span>
        <span>${escapeHtml(displayValue(group.membership_mode))}</span>
        ${statusTag(group.assignment_eligible ? 'Assignment scope' : 'Blueprint only', group.assignment_eligible ? 'safe' : 'neutral')}
      </button>${group.group_id === selected ? `<section id="selection-inline-groups" class="mobile-inline-detail" aria-label="Selected group details">${inspectorGroup(state)}</section>` : ''}`).join('')}</div>
  </section>`
}

export function renderPolicies(state) {
  const policies = state.bundle.profile.policy_units
  const selected = state.selected.policies || policies[0]?.policy_id
  const query = state.filters.policies.toLowerCase()
  const visible = policies.filter((policy) => `${policy.label} ${policy.platform} ${policy.models.join(' ')}`.toLowerCase().includes(query))
  return `<section class="screen">
    ${pageHeader('Review policy intent', 'Policies express desired outcomes and safety prerequisites, never a Relution payload.')}
    <div class="toolbar"><label class="search-field">${icon('search')}<span class="sr-only">Search policies</span><input id="policy-search" type="search" data-filter="policies" value="${escapeHtml(state.filters.policies)}" placeholder="Search policies" autocomplete="off" spellcheck="false"></label><span class="toolbar-summary" role="status" aria-live="polite">${visible.length} of ${policies.length} policies</span></div>
    <div class="list-header policy-columns"><span>Policy intent</span><span>Platform</span><span>Impact</span><span>State</span></div>
    <div class="entity-list">${visible.map((policy) => `
      <button class="entity-row four-column policy-columns ${policy.policy_id === selected ? 'selected' : ''}" data-action="select-policies" data-id="${escapeHtml(policy.policy_id)}" aria-pressed="${policy.policy_id === selected}" ${policy.policy_id === selected ? `aria-controls="${state.compact ? 'selection-inline-policies' : 'selection-inspector'}"` : ''}>
        <span class="entity-copy"><strong>${escapeHtml(policy.label)}</strong><small>${escapeHtml(policy.layer_id)}</small></span>
        <span>${escapeHtml(displayValue(policy.platform))}</span>
        <span>Tier ${escapeHtml(policy.impact_tier_floor)}</span>
        ${statusTag('Target blocked', 'blocked')}
      </button>${policy.policy_id === selected ? `<section id="selection-inline-policies" class="mobile-inline-detail" aria-label="Selected policy details">${inspectorPolicy(state)}</section>` : ''}`).join('') || '<div class="empty-list"><p>No policy intent matches this search.</p><button class="button secondary" data-action="clear-filter" data-filter="policies">Clear policy search</button></div>'}</div>
  </section>`
}

export function renderAssignments(state) {
  const profile = state.bundle.profile
  const selected = state.selected.assignments || profile.assignment_intents[0]?.assignment_id
  const query = state.filters.assignments.toLowerCase()
  const rows = assignmentRows(profile).filter((row) => `${row.assignment_id} ${row.policy?.label} ${row.platform} ${row.model} ${row.cohortLabels.join(' ')}`.toLowerCase().includes(query))
  return `<section class="screen">
    ${pageHeader('Assignment intent', 'Review where policy intent would apply. Nothing here connects to a tenant.')}
    <div class="toolbar assignment-toolbar"><span class="toolbar-summary" role="status" aria-live="polite">${rows.length === profile.assignment_intents.length ? profile.assignment_intents.length : `${rows.length} of ${profile.assignment_intents.length}`} assignments</span><label class="search-field">${icon('search')}<span class="sr-only">Search assignment intent</span><input id="assignment-search" type="search" data-filter="assignments" value="${escapeHtml(state.filters.assignments)}" placeholder="Search assignment intent" autocomplete="off" spellcheck="false"></label></div>
    <div class="assignment-list" aria-label="Policy assignment intents">
      <div class="assignment-header" aria-hidden="true"><span>Assignment</span><span>Group scope</span><span>Target contract</span><span>Rollout ring</span><span>Impact floor</span><span></span></div>
      ${rows.map((row) => `<button class="assignment-row ${row.assignment_id === selected ? 'selected' : ''}" data-action="select-assignments" data-id="${escapeHtml(row.assignment_id)}" aria-pressed="${row.assignment_id === selected}" ${row.assignment_id === selected ? `aria-controls="${state.compact ? 'selection-inline-assignments' : 'selection-inspector'}"` : ''}>
        <span class="assignment-scope"><span class="device-icon">${icon(row.platform === 'ios_ipados' || row.platform === 'android_enterprise' ? 'assignment' : 'readiness')}</span><span><strong>${escapeHtml(row.policy?.label || row.policy_id)}</strong><small>${escapeHtml(row.assignment_id)}</small></span></span>
        <span class="entity-copy assignment-group"><strong>${escapeHtml(row.cohortLabels.join(', '))}</strong><small>${escapeHtml(displayValue(row.platform))} · ${escapeHtml(displayValue(row.model))}</small></span>
        <span class="status-text status-blocked">${icon('warning')}Target contract required<span class="sr-only">. Blocked by target contract</span></span>
        <span class="assignment-ring">${escapeHtml(displayValue(row.ring_id))}</span>
        <span class="assignment-impact">Tier ${escapeHtml(row.impact_tier_floor)}</span>
        ${icon('chevron')}
      </button>${row.assignment_id === selected ? `<section id="selection-inline-assignments" class="mobile-inline-detail" aria-label="Selected assignment details">${inspectorAssignment(state)}</section>` : ''}`).join('') || '<div class="empty-list"><p>No assignment intent matches this search.</p><button class="button secondary" data-action="clear-filter" data-filter="assignments">Clear assignment search</button></div>'}
    </div>
  </section>`
}

export function renderReadiness(state) {
  const profile = state.bundle.profile
  const plan = state.bundle.plan
  const unresolved = profile.unresolved_inputs
  const unresolvedLabels = [
    ['input.target', 'Target context', 'institution'],
    ['input.contract', 'Target contract', 'policy'],
    ['input.inventory', 'Inventory snapshot', 'database'],
    ['input.applications', 'Application portfolio', 'assignment'],
    ['input.identity-network', 'Identity and network', 'network'],
    ['input.policy-state', 'Operation bindings', 'link'],
    ['input.usability', 'Usability evidence', 'groups'],
    ['input.approvals', 'Approval record', 'user'],
  ].map(([inputId, label, iconName]) => ({
    input: unresolved.find((item) => item.input_id === inputId),
    label,
    iconName,
  }))
  const profileExported = state.exportedProfileSha256 === state.bundle.profile_sha256
  const networkCalls = state.bundle.dry_run?.network_calls ?? 0
  const mutationCalls = state.bundle.dry_run?.mutation_calls ?? 0
  const kindPrefixes = {
    group_scope_blueprint: 'GRP',
    policy_definition_intent: 'POL',
    policy_publication_prerequisite: 'PRE',
    assignment_intent: 'ASN',
  }
  const proofCells = plan.steps.map((step, index) => {
    const prefix = kindPrefixes[step.kind] || 'INT'
    return `<li title="${escapeHtml(step.kind || 'intent step')}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${prefix}-${String(index + 1).padStart(2, '0')}</strong><i aria-hidden="true"></i></li>`
  }).join('')
  const blockedGates = profile.activation_gates.filter((gate) => gate.gate_id !== 'G0_OFFLINE_VALID')
  const shownGates = blockedGates.slice(0, 4)
  return `<section class="proof-ledger">
    <section class="local-proof" aria-labelledby="local-proof-title">
      <p>Local proof</p>
      <h1 id="local-proof-title"><span>${plan.steps.length} steps</span> compile locally.</h1>
      <p class="mobile-proof-warning">${icon('warning')}Execution remains blocked by ${unresolved.length} missing evidence categories.</p>
      <dl class="local-facts">
        <div><dt>${icon('check')}Reference closed</dt><dd>Validated profile</dd></div>
        <div><dt>${networkCalls}</dt><dd>network calls</dd></div>
        <div><dt>${mutationCalls}</dt><dd>mutation calls</dd></div>
      </dl>
      <ol class="proof-matrix" aria-label="${plan.steps.length} locally compiled intent steps">${proofCells}</ol>
    </section>
    <section class="target-gap" aria-labelledby="target-gap-title">
      <header><p>Target gap</p><h2 id="target-gap-title">Execution remains blocked.</h2></header>
      <div class="target-ledger">
        <section class="gate-ledger" aria-labelledby="gate-ledger-title">
          <h3 id="gate-ledger-title" class="sr-only">Blocked activation gates</h3>
          <div class="gate-ledger-head" aria-hidden="true"><span>Gate</span><span>Requirement</span><span>Status</span></div>
          <ol>${shownGates.map((gate, index) => `<li class="evidence-gate blocked"><code>G${index + 1}</code><div><strong>${escapeHtml(gate.label)}</strong><p>${escapeHtml(gate.required_evidence.join(', '))}</p></div><span>${icon('lock')}Blocked</span></li>`).join('')}<li class="gate-continuation"><code>G5…G10</code><div><strong>Remaining gates</strong><p>${blockedGates.length - shownGates.length} additional gates remain closed.</p></div><span>Blocked</span></li></ol>
          <p class="target-boundary">${icon('warning')}<span><strong>No live evidence is stored in this browser.</strong> All proof is produced from local artifacts only.</span></p>
        </section>
        <aside class="missing-evidence" aria-label="${unresolved.length} missing evidence categories">
          <h3>Missing evidence categories</h3>
          <ol>${unresolvedLabels.map(({ input, label }, index) => `<li title="${escapeHtml(input?.description || '')}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(label)}</strong></li>`).join('')}</ol>
        </aside>
      </div>
    </section>
    <section class="handoff-dock" aria-labelledby="handoff-dock-title">
      <div class="dock-digest"><span>${icon('shield')}</span><div><strong>Evidence SHA-256</strong><code>${escapeHtml(state.bundle.profile_sha256 || '')}</code></div><button class="button" data-action="copy-digest" aria-label="Copy profile digest">Copy ${icon('copy')}</button></div>
      <div class="dock-handoff">
        <h2 id="handoff-dock-title">Ordered handoff</h2>
        <div class="dock-actions">
          <button class="dock-action ready" data-action="export" data-kind="profile" ${state.busy ? 'disabled' : ''}><b>1</b>${icon('upload')}<span><strong>Export profile</strong><small>Validated reference profile</small></span></button>
          <span aria-hidden="true">→</span>
          <button class="dock-action" data-action="export" data-kind="plan" ${state.busy || !profileExported ? 'disabled' : ''}><b>2</b>${icon('lock')}<span><strong>Export plan</strong><small>${profileExported ? 'Profile digest matched' : 'Locked until profile export'}</small></span></button>
          <span aria-hidden="true">→</span>
          <button class="dock-action" data-action="export" data-kind="dry-run" ${state.busy ? 'disabled' : ''}><b>3</b>${icon('terminal')}<span><strong>Export dry-run report</strong><small>Deterministic zero-call report</small></span></button>
        </div>
      </div>
    </section>
  </section>`
}

export function renderReview(state) {
  const profile = state.bundle.profile
  const plan = state.bundle.plan
  const counts = profileCounts(profile)
  const kinds = stepCounts(plan)
  const stem = profile.package.institution_code
  return `<section class="screen">
    ${pageHeader('Review and export', 'Export only the current validated profile, inert plan, or zero-network dry-run report.')}
    <div class="review-state"><span class="review-check">${icon('check')}</span><div><h2>Current revision validated</h2><p>${escapeHtml(profile.package.institution_label)} compiles to ${plan.steps.length} unbound steps. No credential was read.</p><small>Profile digest <code>${escapeHtml(state.bundle.profile_sha256 || '')}</code></small></div></div>
    <dl class="review-metrics">
      <div><dt>${counts.groups}</dt><dd>group blueprints</dd></div><div><dt>${counts.policies}</dt><dd>policy intents</dd></div><div><dt>${kinds.policy_publication_prerequisite || 0}</dt><dd>publication prerequisites</dd></div><div><dt>${counts.assignments}</dt><dd>assignments</dd></div>
    </dl>
    <div class="export-list">
      <div><span>${icon('institution')}</span><p><strong>University profile · step 1</strong><small>${escapeHtml(stem)}-profile.json · required companion for CLI plan validation</small></p><button class="button secondary" data-action="export" data-kind="profile" ${state.busy ? 'disabled' : ''}>${icon('download')} Export profile</button></div>
      <div><span>${icon('assignment')}</span><p><strong>Offline intent plan · step 2</strong><small>${escapeHtml(stem)}-plan.json · digest-bound to the profile above; set mode 0600</small></p><button class="button secondary" data-action="export" data-kind="plan" ${state.busy || state.exportedProfileSha256 !== state.bundle.profile_sha256 ? 'disabled' : ''}>${icon('download')} ${state.exportedProfileSha256 === state.bundle.profile_sha256 ? 'Export matching plan' : 'Export profile first'}</button></div>
      <div><span>${icon('readiness')}</span><p><strong>Dry-run report</strong><small>${escapeHtml(stem)}-dry-run.json · zero network and mutation calls</small></p><button class="button secondary" data-action="export" data-kind="dry-run" ${state.busy ? 'disabled' : ''}>${icon('download')} Export</button></div>
    </div>
    <p class="privacy-note">${icon('lock')} Downloads contain the reference design plus the institution name and namespace you entered. Do not enter secrets or target identifiers in those identity fields.</p>
  </section>`
}

export function renderMain(state) {
  if (!state.bundle) return emptyLoading(state)
  return ({
    start: renderStart,
    institution: renderInstitution,
    organization: renderOrganization,
    groups: renderGroups,
    policies: renderPolicies,
    assignments: renderAssignments,
    readiness: renderReadiness,
    review: renderReview,
  }[state.step] || renderStart)(state)
}

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assignmentRows,
  canonicalJson,
  organizationTree,
  profileCounts,
  safeFilename,
  stepFromHash,
  CampusWeaveApiError,
} from '../web/model.mjs'
import { renderApp, selectedDefaults } from '../web/views.mjs'

const profile = JSON.parse(
  readFileSync(
    new URL('../docs/relution/packages/university/desired-state.json', import.meta.url),
    'utf8',
  ),
)

/** Concatenate app.js entry plus app/*.mjs modules for source-pattern checks. */
function readAppSources() {
  const appJs = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8')
  const appDir = new URL('../web/app/', import.meta.url)
  const modules = readdirSync(appDir)
    .filter((name) => name.endsWith('.mjs'))
    .sort()
    .map((name) => readFileSync(new URL(name, appDir), 'utf8'))
  return [appJs, ...modules].join('\n')
}

function campusWeaveState(step, overrides = {}) {
  const activeProfile = structuredClone(profile)
  const profileSha256 = 'e93a7a7934ca1111111111111111111111111111111111111111111111111111'
  return {
    bundle: {
      profile: activeProfile,
      plan: { steps: Array.from({ length: 48 }, () => ({ kind: 'intent' })) },
      counts: profileCounts(activeProfile),
      profile_sha256: profileSha256,
    },
    step,
    selected: selectedDefaults(activeProfile),
    filters: { policies: '', assignments: '' },
    busy: false,
    notice: '',
    error: undefined,
    storageState: 'saved',
    navigationOpen: false,
    compact: false,
    exportedProfileSha256: undefined,
    ...overrides,
  }
}

test('reference profile selectors expose the complete university surface', () => {
  assert.deepEqual(profileCounts(profile), {
    organizationUnits: 10,
    locations: 4,
    cohorts: 10,
    groups: 7,
    policies: 15,
    assignments: 11,
    workflows: 12,
    unresolved: 8,
  })

  const assignments = assignmentRows(profile)
  assert.equal(assignments.length, 11)
  assert.ok(assignments.every((item) => item.policy && item.group))
  assert.ok(assignments.every((item) => item.cohortLabels.length > 0))

  const tree = organizationTree(profile)
  assert.equal(tree.length, 10)
  assert.equal(tree[0].unit_id, 'ou.university')
  assert.ok(tree.slice(1).every((item) => item.depth === 1))
})

test('download serialization is deterministic and digest-compatible', () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 3 } }), '{"a":{"b":3,"d":2},"z":1}\n')
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 3 } }), canonicalJson({ a: { b: 3, d: 2 }, z: 1 }))
  assert.equal(safeFilename(' Example University / 2026 '), 'example-university-2026')
})

test('documented screenshot routes fail closed to a known CampusWeave step', () => {
  assert.equal(stepFromHash('#assignments'), 'assignments')
  assert.equal(stepFromHash('review'), 'review')
  assert.equal(stepFromHash('#unknown'), 'start')
  assert.equal(stepFromHash(''), 'start')
})

test('mobile grid surfaces may shrink to the viewport', () => {
  const stylesDir = new URL('../web/styles/', import.meta.url)
  const modules = readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => readFileSync(new URL(name, stylesDir), 'utf8'))
  const stylesheet = [
    readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8'),
    ...modules,
  ].join('\n')
  assert.match(stylesheet, /\.workspace\.with-inspector\s*\{[^}]*min-width:\s*0/s)
  assert.match(stylesheet, /\.workspace\.without-inspector\s*\{[^}]*min-width:\s*0/s)
  assert.match(stylesheet, /\.canvas,\s*\n\.inspector\s*\{[^}]*min-width:\s*0/s)
  assert.match(stylesheet, /html,\s*\nbody\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s)
  assert.match(stylesheet, /\.mobile-inline-detail\s*\{[^}]*max-width:\s*100%[^}]*min-width:\s*0/s)
  assert.match(stylesheet, /\.detail-list li > span\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s)
  assert.match(stylesheet, /\.mobile-inline-detail \.definition-list div\s*\{[^}]*minmax\(0, 1\.2fr\)/s)
})

test('skip link focuses the workspace without becoming workflow navigation', () => {
  const index = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8')
  const appSource = readAppSources()

  assert.match(index, /<a class="skip-link" href="#main-content">Skip to workspace<\/a>/)
  const handler = appSource.match(/skipLink\?\.addEventListener\('click', \(event\) => \{([\s\S]*?)\n\}\)/)
  assert.ok(handler)
  assert.match(handler[1], /event\.preventDefault\(\)/)
  assert.match(handler[1], /document\.querySelector\('#main-content'\)\?\.focus\(\{ preventScroll: true \}\)/)
  assert.doesNotMatch(handler[1], /navigate\(|location\.hash|history\./)
  for (const step of ['start', 'institution', 'organization', 'groups', 'policies', 'assignments', 'readiness', 'review']) {
    assert.match(renderApp(campusWeaveState(step)), /<main class="(?:canvas|proof-canvas)" id="main-content" tabindex="-1"/)
  }
})

test('a successful profile import synchronizes the review route', () => {
  const appSource = readAppSources()
  const importFlow = appSource.match(/async function importFile\(file\) \{([\s\S]*?)\n\s*\}\n\n\s*async function saveInstitution/)

  assert.ok(importFlow)
  assert.match(importFlow[1], /acceptBundle\(bundle, \{ preserveSelection: false \}\)\s*\n\s*await navigate\('review', \{ confirmDiscard: false \}\)/)
  assert.doesNotMatch(importFlow[1], /state\.step\s*=\s*'review'/)
  assert.match(appSource, /window\.history\.pushState\(null, '', `#\$\{state\.step\}`\)/)
})

test('an initial reference failure presents a specific retry action', () => {
  const failed = renderApp(campusWeaveState('start', {
    bundle: undefined,
    error: new Error('Reference request failed'),
  }))
  const appSource = readAppSources()

  assert.match(failed, /Reference profile unavailable/)
  assert.match(failed, /data-action="retry-reference"[^>]*>Retry loading reference profile<\/button>/)
  assert.match(failed, /class="loading-state" aria-live="polite"/)
  assert.match(appSource, /else if \(action === 'retry-reference'\) void loadReference\(\)/)
})

test('selection announcements are consumed after their live update', () => {
  const appSource = readAppSources()
  const html = renderApp(campusWeaveState('assignments', {
    selectionAnnouncement: 'Example policy selected. Details updated.',
  }))

  assert.match(html, /role="status" aria-live="polite" data-selection-announcement>Example policy selected\. Details updated\.<\/p>/)
  assert.match(appSource, /function consumeSelectionAnnouncement\(\) \{[\s\S]*?state\.selectionAnnouncement = ''[\s\S]*?window\.requestAnimationFrame\(\(\) => announcement\?\.replaceChildren\(\)\)/)
  assert.match(appSource, /app\.innerHTML = renderApp\(state\)\s*\n\s*consumeSelectionAnnouncement\(\)/)
})

test('the status footer distinguishes inert group blueprints from live groups', () => {
  const html = renderApp(campusWeaveState('start'))

  assert.match(html, />7 group blueprints<\/span>/)
  assert.doesNotMatch(html, />7 groups<\/span>/)
})

test('safe validator details are rendered as actionable paths', () => {
  const error = new CampusWeaveApiError(400, {
    error: 'invalid_request',
    details: [{ path: '$.package', message: 'an unknown field is not allowed' }],
  })
  assert.deepEqual(error.details, ['$.package: an unknown field is not allowed'])
})

test('assignment intent is a semantic read-only button list that preserves every note', () => {
  const state = campusWeaveState('assignments')
  state.bundle.profile.assignment_intents[0].notes = [
    'First reference note.',
    'Second reference note.',
  ]
  const html = renderApp(state)

  assert.match(html, /class="assignment-list"/)
  assert.doesNotMatch(html, /role="row"/)
  assert.doesNotMatch(html, /data-form="assignment-note"/)
  assert.doesNotMatch(html, /<textarea/)
  assert.match(html, /First reference note\./)
  assert.match(html, /Second reference note\./)
  assert.doesNotMatch(html, /style="--depth:/)
  assert.equal((html.match(/Blocked by target contract/g) || []).length, 11)
  assert.doesNotMatch(html, /<span><span class="status-text/)
})

test('entity selection actions match the plural state sections', () => {
  assert.match(renderApp(campusWeaveState('groups')), /data-action="select-groups"[^>]*aria-pressed="true"/)
  assert.match(renderApp(campusWeaveState('policies')), /data-action="select-policies"[^>]*aria-pressed="true"/)
  assert.match(renderApp(campusWeaveState('assignments')), /data-action="select-assignments"[^>]*aria-pressed="true"/)
})

test('mobile navigation is inert while closed and isolates content while open', () => {
  const closed = renderApp(campusWeaveState('start', { compact: true }))
  assert.match(closed, /aria-controls="workflow-navigation" aria-expanded="false"/)
  assert.match(closed, /id="workflow-navigation"[^>]*inert aria-hidden="true"/)
  assert.match(closed, /data-action="import" aria-label="Import profile"/)
  assert.match(closed, /id="main-content" tabindex="-1"/)

  const open = renderApp(campusWeaveState('start', {
    compact: true,
    navigationOpen: true,
  }))
  assert.match(open, /aria-controls="workflow-navigation" aria-expanded="true"/)
  assert.doesNotMatch(open, /id="workflow-navigation"[^>]*inert/)
  assert.match(open, /class="nav-backdrop"/)
  assert.match(open, /class="menu-import" data-action="import"/)
  assert.match(open, /id="main-content" tabindex="-1" inert/)
  assert.match(open, /class="top-actions" inert/)
  assert.match(open, /class="status-rail" aria-label="Runtime status" inert/)
})

test('draft replacement uses an accessible in-product confirmation dialog', () => {
  const html = renderApp(campusWeaveState('start', {
    confirmation: {
      title: 'Replace the autosaved draft?',
      message: 'Importing a profile replaces the only draft saved in this browser.',
      confirmLabel: 'Replace draft',
    },
  }))
  const appSource = readAppSources()

  assert.match(html, /class="confirmation-dialog" role="alertdialog" aria-modal="true"/)
  assert.match(html, /data-action="confirm-cancel"/)
  assert.match(html, /data-action="confirm-accept"/)
  assert.match(html, /<header class="top-bar(?: [^"]*)?" inert>/)
  assert.match(html, /class="journey-navigation"[^>]* inert/)
  assert.doesNotMatch(appSource, /window\.confirm/)
})

test('review requires exporting the exact profile before its matching plan', () => {
  const state = campusWeaveState('review')
  const gated = renderApp(state)
  assert.match(gated, /Export profile first/)
  assert.match(gated, /e93a7a7934ca1111111111111111111111111111111111111111111111111111/)
  assert.match(gated, /class="workspace without-inspector"/)
  assert.doesNotMatch(gated, /id="selection-inspector"/)

  state.exportedProfileSha256 = state.bundle.profile_sha256
  const enabled = renderApp(state)
  assert.match(enabled, /Export matching plan/)
  assert.doesNotMatch(
    enabled,
    /data-kind="plan" disabled/,
  )
})

test('readiness renders the proof ledger and preserves export gating', () => {
  const state = campusWeaveState('readiness')
  const gated = renderApp(state)

  assert.match(gated, /48 steps/)
  assert.match(gated, /compile locally\./)
  assert.match(gated, /Execution remains blocked\./)
  assert.match(gated, /Reference closed/)
  assert.match(gated, /class="proof-matrix"/)
  assert.equal((gated.match(/<li title="intent">/g) || []).length, 48)
  assert.equal((gated.match(/class="evidence-gate blocked"/g) || []).length, 4)
  assert.match(gated, /8 missing evidence categories/)
  const missingEvidence = gated.match(/<aside class="missing-evidence"[\s\S]*?<\/aside>/)?.[0] || ''
  assert.equal((missingEvidence.match(/<span>0[1-8]<\/span><strong>/g) || []).length, 8)
  assert.match(gated, /No live evidence is stored in this browser\./)
  assert.match(gated, /class="handoff-dock"/)
  assert.match(gated, /class="journey-navigation"/)
  assert.match(gated, /data-kind="profile"/)
  assert.match(gated, /data-kind="plan" disabled/)
  assert.match(gated, /data-kind="dry-run"/)
  assert.match(gated, /e93a7a7934ca1111111111111111111111111111111111111111111111111111/)
  assert.match(gated, /data-action="copy-digest"/)
  assert.match(gated, /class="journey-navigation"/)
  assert.match(gated, /class="workspace without-inspector"/)
  assert.match(gated, /<main class="canvas" id="main-content"/)
  assert.doesNotMatch(gated, /id="selection-inspector"/)
  assert.match(gated, /class="status-rail"/)

  state.exportedProfileSha256 = state.bundle.profile_sha256
  const enabled = renderApp(state)
  assert.doesNotMatch(enabled, /data-kind="plan" disabled/)
})

test('institution edits remain visible and expose their unsaved state', () => {
  const state = campusWeaveState('institution', {
    institutionDraft: {
      institution_label: 'Example University',
      institution_code: 'example-u',
    },
  })
  const html = renderApp(state)
  assert.match(html, /value="Example University"/)
  assert.match(html, /value="example-u"/)
  assert.match(html, /Unsaved changes\. Save the institution before continuing\./)
  assert.match(html, /data-institution-field/)
})

test('filtered empty states provide a keyboard-operable recovery action', () => {
  const state = campusWeaveState('policies')
  state.filters.policies = 'no policy can match this value'
  const html = renderApp(state)
  assert.match(html, /No policy intent matches this search\./)
  assert.match(html, /data-action="clear-filter" data-filter="policies"/)
  assert.match(html, /role="status" aria-live="polite">0 of 15 policies/)
})

test('compact master-detail views place selected details beside the chosen row', () => {
  const html = renderApp(campusWeaveState('assignments', { compact: true }))
  assert.match(html, /class="workspace with-inspector selection-master-detail"/)
  assert.match(html, /id="selection-inline-assignments" class="mobile-inline-detail" aria-label="Selected assignment details"/)
  assert.match(html, /aria-controls="selection-inline-assignments"/)
  assert.match(html, /<dl class="inspector-section definition-list[^"]*">/)
})

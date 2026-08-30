export const STEPS = [
  ['start', 'Overview', 'home'],
  ['institution', 'Institution', 'institution'],
  ['organization', 'Organization', 'organization'],
  ['groups', 'Groups', 'groups'],
  ['policies', 'Policies', 'shield'],
  ['assignments', 'Assignments', 'assignment'],
  ['readiness', 'Readiness', 'readiness'],
  ['review', 'Review', 'review'],
]

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const DISPLAY_VALUES = new Map(Object.entries({
  android_enterprise: 'Android Enterprise',
  assignment_scope: 'Assignment scope',
  byod: 'BYOD',
  compliance_state: 'Compliance state',
  corp: 'Corporate',
  cross_platform_outcome: 'Cross-platform',
  ios_ipados: 'iOS & iPadOS',
  macos: 'macOS',
  privileged: 'Privileged',
  sensitive_personal: 'Sensitive personal',
  target_contract_required: 'Target contract required',
  windows: 'Windows',
}))

export function displayValue(value) {
  const source = String(value ?? '')
  const display = DISPLAY_VALUES.get(source)
  if (display) return display
  return source
    .replace(/^ring\./, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export const paths = new Map(Object.entries({
  home: '<path d="M3 10.7 12 3l9 7.7v9.8a.5.5 0 0 1-.5.5H15v-7H9v7H3.5a.5.5 0 0 1-.5-.5z"/>',
  institution: '<path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M2 21h20M12 3 3 7h18z"/>',
  organization: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M5 15.5v-4h14v4"/>',
  groups: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M13 15a4.5 4.5 0 0 1 8 3v2"/>',
  shield: '<path d="M12 2 4.5 5v5.5c0 5 3.1 8.5 7.5 10.5 4.4-2 7.5-5.5 7.5-10.5V5z"/><path d="m9 12 2 2 4-5"/>',
  assignment: '<circle cx="8" cy="8" r="3"/><path d="M2.5 20v-2.5A4.5 4.5 0 0 1 7 13h2a4.5 4.5 0 0 1 4.3 3.2M15 8h6m-3-3v6M16 17l2 2 4-5"/>',
  readiness: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3.5V2h6v1.5M8 9h8M8 13h5M8 17h3"/>',
  review: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 9 2 2 4-4m-6 9 2 2 4-4"/>',
  upload: '<path d="M12 16V3m0 0L7 8m5-5 5 5M4 14v6h16v-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  folder: '<path d="M3 6.5h6l2 2h10v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  policy: '<path d="M12 3v18M5 7h14M5 12h14M5 17h14"/>',
  warning: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5m0 3h.01"/>',
  download: '<path d="M12 3v13m0 0 5-5m-5 5-5-5M4 21h16"/>',
  edit: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10zM14 7l3 3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  network: '<path d="M5 8.5a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0m-5 4a2 2 0 0 1 2 0M12 20h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  terminal: '<path d="m4 6 5 5-5 5M11 17h9"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
}))

export function icon(name, className = '') {
  return `<svg class="icon ${escapeHtml(className)}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths.get(name) || paths.get('review')}</svg>`
}

export function statusTag(text, tone = 'neutral') {
  return `<span class="status-text status-${tone}">${tone === 'blocked' ? icon('warning') : tone === 'safe' ? icon('check') : ''}${escapeHtml(text)}</span>`
}

export function stepIndex(step) {
  const index = STEPS.findIndex(([id]) => id === step)
  return index === -1 ? 0 : index
}

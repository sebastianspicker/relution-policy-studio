import { profileCounts } from '../model.mjs'
import { STEPS, escapeHtml, icon, stepIndex } from './html.mjs'

export function topBar(state) {
  const pkg = state.bundle?.profile?.package
  const label = pkg?.institution_label || 'Opening profile…'
  const code = pkg?.institution_code
  const meta = code ? `<small class="institution-meta">${escapeHtml(code)} · draft</small>` : ''
  const backgroundInert = state.confirmation || (state.compact && state.navigationOpen) ? 'inert' : ''
  return `<header class="top-bar" ${backgroundInert}>
    <div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path class="weave-a" d="M6 10h12c4 0 7 3 7 6.5S22 23 18 23H10"/><path class="weave-b" d="M26 22H14c-4 0-7-3-7-6.5S10 9 14 9h8"/></svg></div>
    <div class="product-title">CampusWeave</div>
    <button class="institution-switch" data-action="navigate" data-step="institution" aria-label="Edit institution: ${escapeHtml(label)}" ${backgroundInert}><span class="institution-label">${escapeHtml(label)}</span>${meta}</button>
    <div class="top-actions" ${backgroundInert}><input id="profile-import" type="file" accept="application/json,.json" hidden><button class="button secondary import-button" data-action="import" aria-label="Import profile" ${state.busy ? 'disabled' : ''}>${icon('upload')} <span>Import</span></button><button class="button primary" data-action="validate" ${state.busy || !state.bundle ? 'disabled' : ''}>${icon('shield')} <span>${state.busy ? 'Validating…' : 'Validate'}</span></button><button id="workflow-toggle" class="icon-button mobile-menu" data-action="toggle-navigation" aria-label="Toggle workflow navigation" aria-controls="workflow-navigation" aria-expanded="${state.navigationOpen}">${icon('menu')}</button></div>
  </header>`
}

export function journeyNavigation(state, backgroundInert = '') {
  const groups = [
    ['Define', [['start', 'Overview'], ['institution', 'Institution']]],
    ['Inspect', [['organization', 'Organization'], ['groups', 'Groups'], ['policies', 'Policies']]],
    ['Prove', [['assignments', 'Assignments'], ['readiness', 'Readiness']]],
    ['Package', [['review', 'Review']]],
  ]
  const current = stepIndex(state.step)
  return `<nav class="journey-navigation" aria-label="CampusWeave grouped journey" ${backgroundInert}>${groups.map(([label, routes]) => {
    const active = routes.some(([route]) => route === state.step)
    const done = routes.every(([route]) => stepIndex(route) < current)
    return `<section class="journey-group ${active ? 'active' : ''} ${done ? 'done' : ''}">
      <div class="journey-label"><span class="journey-dot" aria-hidden="true"></span><span class="journey-icon" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong></div>
      <div class="journey-steps">${routes.map(([route, routeLabel]) => `<button data-action="navigate" data-step="${route}" ${route === state.step ? 'aria-current="step"' : ''}>${escapeHtml(routeLabel)}</button>`).join('<i aria-hidden="true">·</i>')}</div>
    </section>`
  }).join('')}</nav>`
}

export function navigation(state) {
  const closedCompact = state.compact && !state.navigationOpen
  return `<nav id="workflow-navigation" class="step-rail ${state.navigationOpen ? 'open' : ''}" aria-label="CampusWeave workflow" ${closedCompact ? 'inert aria-hidden="true"' : ''}><div class="mobile-nav-title"><strong>Workflow steps</strong><button id="workflow-close" class="icon-button" data-action="toggle-navigation" aria-label="Close workflow navigation">${icon('close')}</button></div>${STEPS.map(([id, label, iconName], index) => `<button data-action="navigate" data-step="${id}" class="step-button ${state.step === id ? 'active' : ''}" ${state.step === id ? 'aria-current="step"' : ''}><small aria-hidden="true">${String(index + 1).padStart(2, '0')}</small><span class="step-icon">${icon(iconName)}</span><span>${label}</span></button>`).join('')}<button class="menu-import" data-action="import" ${state.busy ? 'disabled' : ''}>${icon('upload')}<span>Import profile</span></button><div class="rail-save">${icon('check')}<span>${state.storageState === 'saved' ? 'Saved in this browser' : state.storageState === 'saving' ? 'Saving locally…' : 'Local draft'}</span></div></nav>${state.compact && state.navigationOpen ? '<button class="nav-backdrop" data-action="close-navigation" aria-label="Close workflow navigation" tabindex="-1"></button>' : ''}`
}

export function statusRail(state) {
  const counts = profileCounts(state.bundle?.profile)
  const backgroundInert = state.confirmation || (state.compact && state.navigationOpen) ? 'inert' : ''
  const autosaved = state.storageState === 'saved' ? 'Autosaved' : 'In memory'
  return `<footer class="status-rail" aria-label="Runtime status" ${backgroundInert}><span class="status-chip local-status"><i class="pip"></i>Local only</span><span class="status-chip">${escapeHtml(autosaved)}</span><span class="status-chip">${counts.groups} group blueprints</span><span class="status-chip">${counts.policies} policy intents</span><span class="status-chip">${counts.assignments} assignments</span><span class="status-chip warning-status">${counts.unresolved} target inputs unresolved</span><span class="status-chip no-connection">No live connection</span></footer>`
}

export function notification(state) {
  if (!state.notice && !state.error) return ''
  const errorDetails = state.error?.details?.length
    ? `<ul>${state.error.details.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : ''
  return `<div class="toast ${state.error ? 'error' : ''}" role="${state.error ? 'alert' : 'status'}"><span>${icon(state.error ? 'warning' : 'check')}</span><div><strong>${escapeHtml(state.error ? state.error.message : state.notice)}</strong>${errorDetails}</div><button class="icon-button" data-action="dismiss" aria-label="Dismiss message">${icon('close')}</button></div>`
}

export function confirmationDialog(state) {
  if (!state.confirmation) return ''
  return `<div class="confirmation-layer">
    <button class="confirmation-backdrop" data-action="confirm-cancel" tabindex="-1" aria-label="Cancel confirmation"></button>
    <section class="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
      <span class="confirmation-icon">${icon('warning')}</span>
      <div><h2 id="confirmation-title">${escapeHtml(state.confirmation.title)}</h2><p id="confirmation-message">${escapeHtml(state.confirmation.message)}</p></div>
      <div class="confirmation-actions"><button class="button secondary" data-action="confirm-cancel">Keep current draft</button><button class="button destructive" data-action="confirm-accept">${escapeHtml(state.confirmation.confirmLabel)}</button></div>
    </section>
  </div>`
}

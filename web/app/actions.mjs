import {
  MAX_IMPORT_BYTES,
  clearStoredProfile,
  downloadJson,
  loadStoredProfile,
  safeFilename,
  stepFromHash,
  storeValidatedProfile,
  campusWeaveApi,
} from '../model.mjs'
import { renderApp, selectedDefaults } from '../views.mjs'

/**
 * Domain actions and render helpers for the CampusWeave workbench.
 * Mutates the shared state and runtime objects; calls render after changes.
 */
export function createActions({ state, runtime, app }) {
  function render(options = {}) {
    app.setAttribute('aria-busy', String(state.busy || !state.bundle))
    const rendered = new DOMParser().parseFromString(renderApp(state), 'text/html')
    app.replaceChildren(...rendered.body.childNodes)
    consumeSelectionAnnouncement()
    if (state.bundle) {
      document.title = `${state.bundle.profile.package.institution_label} · CampusWeave`
    }
    if (options.focusId) {
      const control = document.getElementById(options.focusId)
      if (control) {
        control.focus()
        if (typeof options.selectionStart === 'number') {
          control.setSelectionRange(options.selectionStart, options.selectionStart)
        }
      }
    }
    if (options.focusSelection) {
      const control = [...app.querySelectorAll(`[data-action="${options.focusSelection.action}"]`)]
        .find((candidate) => candidate.dataset.id === options.focusSelection.id)
      control?.focus({ preventScroll: true })
    }
    if (state.confirmation) {
      window.requestAnimationFrame(() => {
        document.querySelector('.confirmation-dialog [data-action="confirm-cancel"]')?.focus()
      })
    }
  }

  function consumeSelectionAnnouncement() {
    if (!state.selectionAnnouncement) return
    state.selectionAnnouncement = ''
    const announcement = app.querySelector('[data-selection-announcement]')
    window.requestAnimationFrame(() => announcement?.replaceChildren())
  }

  function institutionDraftIsDirty() {
    const pkg = state.bundle?.profile?.package
    const draft = state.institutionDraft
    return Boolean(pkg && draft && (
      draft.institution_label !== pkg.institution_label
      || draft.institution_code !== pkg.institution_code
    ))
  }

  function resetInstitutionDraft() {
    const pkg = state.bundle?.profile?.package
    state.institutionDraft = pkg
      ? {
          institution_label: pkg.institution_label,
          institution_code: pkg.institution_code,
        }
      : undefined
  }

  function beginRequest() {
    runtime.activeRequest?.abort()
    runtime.activeRequest = new AbortController()
    runtime.requestSequence += 1
    return { id: runtime.requestSequence, signal: runtime.activeRequest.signal }
  }

  function isCurrentRequest(request) {
    return request.id === runtime.requestSequence
  }

  function handleRequestError(request, error) {
    if (!isCurrentRequest(request) || error?.name === 'AbortError') return
    state.busy = false
    showError(error)
  }

  function clearNoticeTimer() {
    clearTimeout(runtime.noticeTimer)
    runtime.noticeTimer = undefined
  }

  function showNotice(message) {
    clearNoticeTimer()
    state.notice = message
    state.error = undefined
    render()
    runtime.noticeTimer = setTimeout(() => {
      state.notice = ''
      app.querySelector('.toast:not(.error)')?.remove()
      runtime.noticeTimer = undefined
    }, 4800)
  }

  function showError(error) {
    clearNoticeTimer()
    state.notice = ''
    state.error = error instanceof Error ? error : new Error('CampusWeave could not complete this action.')
    render()
  }

  function persistBundle(bundle) {
    state.storageState = 'saving'
    render()
    try {
      storeValidatedProfile(bundle.profile)
      state.storageState = 'saved'
    } catch {
      state.storageState = 'memory'
    }
    render()
  }

  function acceptBundle(bundle, { preserveSelection = true, persist = true } = {}) {
    const defaults = selectedDefaults(bundle.profile)
    state.bundle = bundle
    if (state.exportedProfileSha256 !== bundle.profile_sha256) {
      state.exportedProfileSha256 = undefined
    }
    state.selected = preserveSelection
      ? { ...defaults, ...state.selected }
      : defaults
    resetInstitutionDraft()
    state.busy = false
    state.error = undefined
    if (persist) persistBundle(bundle)
    else render()
  }

  async function loadReference({ reset = false } = {}) {
    const request = beginRequest()
    state.busy = true
    state.error = undefined
    render()
    try {
      const bundle = await campusWeaveApi.reference(request.signal)
      if (!isCurrentRequest(request)) return
      if (reset) clearStoredProfile()
      acceptBundle(bundle, { preserveSelection: false })
      if (reset) showNotice('Reference University restored and validated locally.')
    } catch (error) {
      handleRequestError(request, error)
    }
  }

  async function compileCurrent(message = 'Profile and offline plan validated.') {
    if (!state.bundle || state.busy) return
    if (institutionDraftIsDirty()) {
      showError(new Error('Save or discard the institution changes before validating the plan.'))
      document.querySelector('[name="institution_label"]')?.focus()
      return
    }
    const request = beginRequest()
    state.busy = true
    state.error = undefined
    render()
    try {
      const bundle = await campusWeaveApi.compile(state.bundle.profile, request.signal)
      if (!isCurrentRequest(request)) return
      acceptBundle(bundle)
      showNotice(message)
    } catch (error) {
      handleRequestError(request, error)
    }
  }

  async function initialize() {
    render()
    const stored = loadStoredProfile()
    if (stored) {
      const request = beginRequest()
      state.busy = true
      render()
      try {
        const bundle = await campusWeaveApi.compile(stored, request.signal)
        if (!isCurrentRequest(request)) return
        acceptBundle(bundle, { preserveSelection: false })
        return
      } catch (error) {
        if (!isCurrentRequest(request) || error?.name === 'AbortError') return
        clearStoredProfile()
      }
    }
    await loadReference()
  }

  function requestConfirmation({ title, message, confirmLabel }) {
    if (runtime.confirmationResolve) runtime.confirmationResolve(false)
    const activeControl = document.activeElement?.closest?.('[data-action]')
    runtime.confirmationReturnFocus = state.compact
      ? { id: 'workflow-toggle' }
      : { action: activeControl?.dataset.action }
    return new Promise((resolve) => {
      runtime.confirmationResolve = resolve
      state.confirmation = { title, message, confirmLabel }
      state.navigationOpen = false
      render()
    })
  }

  function resolveConfirmation(accepted) {
    const resolve = runtime.confirmationResolve
    const returnFocus = runtime.confirmationReturnFocus
    runtime.confirmationResolve = undefined
    runtime.confirmationReturnFocus = undefined
    state.confirmation = undefined
    render()
    if (!accepted) {
      window.requestAnimationFrame(() => {
        if (returnFocus?.id) document.getElementById(returnFocus.id)?.focus()
        else if (returnFocus?.action) {
          document.querySelector(`[data-action="${returnFocus.action}"]`)?.focus()
        }
      })
    }
    resolve?.(accepted)
  }

  async function navigate(step, { confirmDiscard = true, updateHistory = 'push' } = {}) {
    const nextStep = stepFromHash(`#${step}`)
    if (shouldConfirmDiscard(nextStep, confirmDiscard)) {
      const discard = await requestConfirmation({
        title: 'Discard institution changes?',
        message: 'The validated local draft will not change. Any unsaved institution name or namespace edits will be lost.',
        confirmLabel: 'Discard changes',
      })
      if (!discard) {
        window.history.replaceState(null, '', `#${state.step}`)
        return false
      }
      resetInstitutionDraft()
    }
    clearNoticeTimer()
    state.step = nextStep
    if (updateHistory === 'push' && window.location.hash !== `#${state.step}`) {
      window.history.pushState(null, '', `#${state.step}`)
    } else if (updateHistory === 'replace') {
      window.history.replaceState(null, '', `#${state.step}`)
    }
    state.navigationOpen = false
    state.notice = ''
    state.error = undefined
    render()
    document.querySelector('#main-content')?.focus({ preventScroll: true })
    return true
  }

  function shouldConfirmDiscard(nextStep, confirmDiscard) {
    if (!confirmDiscard || state.step !== 'institution') return false
    if (nextStep === 'institution') return false
    return institutionDraftIsDirty()
  }

  async function confirmDraftReplacement(action) {
    if (!state.bundle) return true
    return requestConfirmation({
      title: 'Replace the autosaved draft?',
      message: `${action} replaces the only draft saved in this browser. Export the current profile first if you need to keep it.`,
      confirmLabel: 'Replace draft',
    })
  }

  async function importFile(file) {
    if (!file || state.busy) return
    if (file.size > MAX_IMPORT_BYTES) {
      showError(new Error('Profiles must be no larger than 2 MiB.'))
      return
    }
    const request = beginRequest()
    state.busy = true
    render()
    try {
      const source = await file.text()
      if (!isCurrentRequest(request)) return
      const bundle = await campusWeaveApi.importProfile(source, request.signal)
      if (!isCurrentRequest(request)) return
      acceptBundle(bundle, { preserveSelection: false })
      await navigate('review', { confirmDiscard: false })
      showNotice('Imported reference-derived profile validated. Only its institution identity was accepted.')
    } catch (error) {
      handleRequestError(request, error)
    }
  }

  async function saveInstitution(form) {
    if (!state.bundle || state.busy || !form.reportValidity()) return
    const values = new FormData(form)
    const request = beginRequest()
    state.busy = true
    render()
    try {
      const bundle = await campusWeaveApi.instantiate(
        state.bundle.profile,
        String(values.get('institution_code') || ''),
        String(values.get('institution_label') || ''),
        request.signal,
      )
      if (!isCurrentRequest(request)) return
      acceptBundle(bundle, { preserveSelection: false })
      showNotice('Institution namespace rebound and every reference revalidated.')
    } catch (error) {
      handleRequestError(request, error)
    }
  }

  function exportArtifact(kind) {
    if (!state.bundle || state.busy) return
    const stem = safeFilename(state.bundle.profile.package.institution_code)
    const exportKind = new Map([
      ['profile', () => exportProfile(stem)],
      ['plan', () => exportPlan(stem)],
      ['dry-run', () => exportDryRun(stem)],
    ]).get(kind)
    if (!exportKind || !exportKind()) return
    showNotice(exportNotice(kind))
  }

  function exportProfile(stem) {
    downloadJson(`${stem}-profile.json`, state.bundle.profile)
    state.exportedProfileSha256 = state.bundle.profile_sha256
    return true
  }

  function exportPlan(stem) {
    if (state.exportedProfileSha256 !== state.bundle.profile_sha256) {
      showError(new Error('Export this exact profile before exporting its digest-bound plan.'))
      return false
    }
    downloadJson(`${stem}-plan.json`, state.bundle.plan)
    return true
  }

  function exportDryRun(stem) {
    downloadJson(`${stem}-dry-run.json`, {
      ...state.bundle.dry_run,
      counts: state.bundle.counts,
      profile_sha256: state.bundle.profile_sha256,
      plan_sha256: state.bundle.plan_sha256,
    })
    return true
  }

  function exportNotice(kind) {
    if (kind === 'plan') return 'Matching plan exported. Keep it with the profile you just exported and set the plan to mode 0600.'
    if (kind === 'profile') return 'Profile exported. You may now export its exact digest-bound plan.'
    return 'Validated local artifact exported. No live operation was created.'
  }

  async function copyProfileDigest() {
    const digest = state.bundle?.profile_sha256
    if (!digest) return
    if (!navigator.clipboard?.writeText) {
      showError(new Error('Clipboard access is unavailable. Select the visible profile digest instead.'))
      return
    }
    try {
      await navigator.clipboard.writeText(digest)
      showNotice('Profile digest copied.')
    } catch {
      showError(new Error('CampusWeave could not copy the profile digest. Select the visible value instead.'))
    }
  }

  function setNavigation(open, { returnFocus = false } = {}) {
    state.navigationOpen = open
    render()
    if (open) document.querySelector('#workflow-close')?.focus()
    else if (returnFocus) document.querySelector('#workflow-toggle')?.focus()
  }

  async function beginImport() {
    if (state.busy) return
    if (await confirmDraftReplacement('Importing a profile')) {
      document.querySelector('#profile-import')?.click()
    }
  }

  async function resetToReference() {
    if (state.busy) return
    if (await confirmDraftReplacement('Resetting to the reference profile')) {
      await loadReference({ reset: true })
    }
  }

  return {
    render,
    consumeSelectionAnnouncement,
    institutionDraftIsDirty,
    clearNoticeTimer,
    loadReference,
    compileCurrent,
    initialize,
    resolveConfirmation,
    navigate,
    importFile,
    saveInstitution,
    exportArtifact,
    copyProfileDigest,
    setNavigation,
    beginImport,
    resetToReference,
  }
}

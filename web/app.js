import { stepFromHash } from './model.mjs'
import { createState, createRuntime } from './app/state.mjs'
import { createActions } from './app/actions.mjs'

const app = document.querySelector('#app')
const skipLink = document.querySelector('.skip-link')

const state = createState()
const runtime = createRuntime()
const {
  render,
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
} = createActions({ state, runtime, app })

app.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]')
  if (!control) return
  const action = control.dataset.action
  if (action === 'navigate') void navigate(control.dataset.step)
  else if (action === 'toggle-navigation') {
    setNavigation(!state.navigationOpen, { returnFocus: state.navigationOpen })
  } else if (action === 'close-navigation') setNavigation(false, { returnFocus: true })
  else if (action === 'import') void beginImport()
  else if (action === 'validate') void compileCurrent()
  else if (action === 'use-reference') void resetToReference()
  else if (action === 'confirm-accept') resolveConfirmation(true)
  else if (action === 'confirm-cancel') resolveConfirmation(false)
  else if (action === 'retry-reference') void loadReference()
  else if (action === 'dismiss') {
    clearNoticeTimer()
    state.notice = ''
    state.error = undefined
    render()
  } else if (action === 'export') exportArtifact(control.dataset.kind)
  else if (action === 'copy-digest') void copyProfileDigest()
  else if (action === 'clear-filter') {
    const filter = control.dataset.filter
    state.filters[filter] = ''
    render({ focusId: filter === 'policies' ? 'policy-search' : 'assignment-search' })
  }
  else if (action?.startsWith('select-')) {
    const section = action.slice('select-'.length)
    state.selected[section] = control.dataset.id
    state.selectionAnnouncement = `${control.querySelector('strong')?.textContent || 'Item'} selected. Details updated.`
    render({ focusSelection: { action, id: control.dataset.id } })
  }
})

app.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]')
  if (!form) return
  event.preventDefault()
  if (form.dataset.form === 'institution') void saveInstitution(form)
})

app.addEventListener('input', (event) => {
  const institutionField = event.target.closest('[data-institution-field]')
  if (institutionField) {
    state.institutionDraft = {
      ...state.institutionDraft,
      [institutionField.name]: institutionField.value,
    }
    const status = document.querySelector('[data-form-status]')
    if (status) {
      status.textContent = institutionDraftIsDirty()
        ? 'Unsaved changes. Save the institution before continuing.'
        : 'Institution matches the validated local draft.'
      status.classList.toggle('is-dirty', institutionDraftIsDirty())
    }
    return
  }
  const control = event.target.closest('[data-filter]')
  if (!control) return
  const filter = control.dataset.filter
  state.filters[filter] = control.value
  const selectionStart = control.selectionStart
  render({ focusId: control.id, selectionStart })
})

app.addEventListener('change', (event) => {
  if (event.target.id !== 'profile-import') return
  const [file] = event.target.files
  void importFile(file)
  event.target.value = ''
})

skipLink?.addEventListener('click', (event) => {
  event.preventDefault()
  document.querySelector('#main-content')?.focus({ preventScroll: true })
})

window.addEventListener('keydown', (event) => {
  if (state.confirmation && event.key === 'Tab') {
    const controls = [...document.querySelectorAll('.confirmation-dialog button:not([disabled])')]
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  if (event.key === 'Tab' && state.compact && state.navigationOpen) {
    const controls = [...document.querySelectorAll('#workflow-navigation button:not([disabled])')]
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  if (!state.confirmation && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void compileCurrent('Profile and offline plan revalidated.')
  }
  if (event.key === 'Escape' && state.confirmation) {
    event.preventDefault()
    resolveConfirmation(false)
  } else if (event.key === 'Escape' && state.navigationOpen) {
    setNavigation(false, { returnFocus: true })
  }
})

const compactQuery = window.matchMedia('(max-width: 900px)')
compactQuery.addEventListener('change', (event) => {
  state.compact = event.matches
  state.navigationOpen = false
  render()
})

window.addEventListener('hashchange', () => {
  const step = stepFromHash(window.location.hash)
  if (step !== state.step) void navigate(step, { updateHistory: 'none' })
})

void initialize()

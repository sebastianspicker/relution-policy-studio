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

const actionHandlers = new Map([
  ['navigate', (control) => void navigate(control.dataset.step)],
  ['toggle-navigation', () => setNavigation(!state.navigationOpen, { returnFocus: state.navigationOpen })],
  ['close-navigation', () => setNavigation(false, { returnFocus: true })],
  ['import', () => void beginImport()],
  ['validate', () => void compileCurrent()],
  ['use-reference', () => void resetToReference()],
  ['confirm-accept', () => resolveConfirmation(true)],
  ['confirm-cancel', () => resolveConfirmation(false)],
  ['retry-reference', () => void loadReference()],
  ['dismiss', dismissNotice],
  ['export', (control) => exportArtifact(control.dataset.kind)],
  ['copy-digest', () => void copyProfileDigest()],
  ['clear-filter', clearFilter],
])

function dismissNotice() {
  clearNoticeTimer()
  state.notice = ''
  state.error = undefined
  render()
}

function clearFilter(control) {
  const filter = control.dataset.filter
  const focusId = filter === 'policies' ? 'policy-search' : 'assignment-search'
  if (filter === 'policies') state.filters.policies = ''
  else if (filter === 'assignments') state.filters.assignments = ''
  else return
  render({ focusId })
}

function selectEntity(control, action) {
  const section = action.slice('select-'.length)
  if (section === 'groups') state.selected.groups = control.dataset.id
  else if (section === 'policies') state.selected.policies = control.dataset.id
  else if (section === 'assignments') state.selected.assignments = control.dataset.id
  else return
  state.selectionAnnouncement = `${control.querySelector('strong')?.textContent || 'Item'} selected. Details updated.`
  render({ focusSelection: { action, id: control.dataset.id } })
}

app.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]')
  if (!control) return
  const action = control.dataset.action
  const handler = actionHandlers.get(action)
  if (handler) handler(control)
  else if (action?.startsWith('select-')) selectEntity(control, action)
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
  if (filter === 'policies') state.filters.policies = control.value
  else if (filter === 'assignments') state.filters.assignments = control.value
  else return
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

function trapFocus(event, selector) {
  const controls = [...document.querySelectorAll(selector)]
  const first = controls[0]
  const last = controls.at(-1)
  const backwardsFromFirst = event.shiftKey && document.activeElement === first
  const forwardsFromLast = !event.shiftKey && document.activeElement === last
  if (!backwardsFromFirst && !forwardsFromLast) return
  event.preventDefault()
  if (backwardsFromFirst) last?.focus()
  else first?.focus()
}

function handleKeyboardShortcut(event) {
  if (state.confirmation || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  void compileCurrent('Profile and offline plan revalidated.')
}

function handleEscape(event) {
  if (event.key !== 'Escape') return
  if (state.confirmation) {
    event.preventDefault()
    resolveConfirmation(false)
  } else if (state.navigationOpen) {
    setNavigation(false, { returnFocus: true })
  }
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && state.confirmation) {
    trapFocus(event, '.confirmation-dialog button:not([disabled])')
  }
  if (event.key === 'Tab' && state.compact && state.navigationOpen) {
    trapFocus(event, '#workflow-navigation button:not([disabled])')
  }
  handleKeyboardShortcut(event)
  handleEscape(event)
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

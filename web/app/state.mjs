import { stepFromHash } from '../model.mjs'

/** Mutable application state for the CampusWeave browser workbench. */
export function createState() {
  return {
    bundle: undefined,
    step: stepFromHash(window.location.hash),
    selected: {},
    filters: { policies: '', assignments: '' },
    busy: false,
    notice: '',
    error: undefined,
    storageState: 'memory',
    navigationOpen: false,
    compact: window.matchMedia('(max-width: 900px)').matches,
    exportedProfileSha256: undefined,
    institutionDraft: undefined,
    selectionAnnouncement: '',
    confirmation: undefined,
  }
}

/** Request and confirmation control fields (not part of renderable state). */
export function createRuntime() {
  return {
    activeRequest: undefined,
    requestSequence: 0,
    noticeTimer: undefined,
    confirmationResolve: undefined,
    confirmationReturnFocus: undefined,
  }
}

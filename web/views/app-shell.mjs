import { escapeHtml } from './html.mjs'
import {
  confirmationDialog,
  journeyNavigation,
  navigation,
  notification,
  statusRail,
  topBar,
} from './shell.mjs'
import { renderInspector } from './inspectors.mjs'
import { renderMain } from './screens.mjs'

export function renderApp(state) {
  const backgroundInert = state.confirmation || (state.compact && state.navigationOpen) ? 'inert' : ''
  const hasInspector = ['organization', 'groups', 'policies', 'assignments']
    .includes(state.step)
  const inspector = hasInspector
    ? `<aside id="selection-inspector" class="inspector" aria-label="Selection details" ${backgroundInert}>${renderInspector(state)}</aside>`
    : ''
  const masterDetail = ['organization', 'groups', 'policies', 'assignments'].includes(state.step)
  const workspaceClass = `workspace ${hasInspector ? 'with-inspector' : 'without-inspector'}${masterDetail ? ' selection-master-detail' : ''}`
  return `${topBar(state)}${journeyNavigation(state, backgroundInert)}<div class="${workspaceClass}">${navigation(state)}<main class="canvas" id="main-content" tabindex="-1" ${backgroundInert}>${renderMain(state)}</main>${inspector}</div>${statusRail(state)}<p class="sr-only" role="status" aria-live="polite" data-selection-announcement>${escapeHtml(state.selectionAnnouncement || '')}</p>${notification(state)}${confirmationDialog(state)}`
}

export function selectedDefaults(profile) {
  return {
    organization: profile?.organization_units?.[0]?.unit_id,
    groups: profile?.group_blueprints?.find((item) => item.assignment_eligible)?.group_id || profile?.group_blueprints?.[0]?.group_id,
    policies: profile?.policy_units?.[0]?.policy_id,
    assignments: profile?.assignment_intents?.[0]?.assignment_id,
  }
}

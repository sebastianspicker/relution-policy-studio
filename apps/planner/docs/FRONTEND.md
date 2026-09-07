# Frontend development

The `web/` subtree is a dependency-free HTML, CSS, and JavaScript interface
served by CampusWeave's loopback server. It reviews a reference-derived profile
and delegates all validation and compilation to the Python backend.

User startup and export procedures are in [Using CampusWeave](USAGE.md). This
document is the source of truth for browser modules, routes, state, and manual
UI checks.

## Runtime boundary

The frontend uses same-origin relative requests with `credentials: "omit"` and
`cache: "no-store"`. The only API routes are:

- `GET /api/v1/health` reports local offline-planning mode.
- `GET /api/v1/reference` returns the reference profile and compiled facts.
- `POST /api/v1/compile-profile` validates and compiles a supported profile.
- `POST /api/v1/import-profile` validates a reference-derived import.
- `POST /api/v1/instantiate-profile` rebinds the institution code and label.

The server rejects other API routes, methods, query strings, and request
origins. Request JSON is bounded to 2 MiB. The frontend has no target,
credential, inventory, operation-binding, approval, publication, or execution
endpoint.

Every imported JavaScript or CSS file must also appear in the explicit static
allowlist in `campusweave/server.py`.

## Module map

- `index.html` defines the document shell, skip link, and application root.
- `app.js` starts the application and registers DOM events.
- `app/state.mjs` owns request, route, selection, filter, and dialog state.
- `app/actions.mjs` owns loading, validation, import, rebinding, navigation,
  export, notices, and persistence.
- `model/api.mjs`, `selectors.mjs`, `serialize.mjs`, and `storage.mjs` own API
  access, selection, canonical exports, and bounded local storage.
- `model.mjs` is the public model facade.
- `views/html.mjs`, `shell.mjs`, `inspectors.mjs`, `screens.mjs`, and
  `app-shell.mjs` own safe HTML helpers and application rendering.
- `views.mjs` is the public view facade.
- `styles.css` imports the purpose-specific files under `styles/`.

Keep `web/` browser-only. Do not add Node-only APIs, a runtime dependency,
client-side copies of profile validation, credential handling, or arbitrary
HTML insertion. Dynamic content must pass through the escaping helpers.

## Routes and layout

The application uses these URL fragments:

- `#start`
- `#institution`
- `#organization`
- `#groups`
- `#policies`
- `#assignments`
- `#readiness`
- `#review`

Unknown fragments resolve to `#start`. Browser history restores navigation.
Organization, groups, policies, and assignments use master-detail views. At
900 CSS pixels or less, navigation becomes a drawer and selected details move
next to their controlling row; additional compact rules apply at 520 pixels.

## State, persistence, and export

Application state holds the validated profile and compiled response, current
route and selection, filters, institution form state, export order, notices,
errors, busy state, confirmations, and compact-navigation state.

Only one profile is persisted, under `campusweave:v1:profile`. Stored JSON is
bounded to 2 MiB and is revalidated by the backend before use. Import, reset,
and navigation away from unsaved institution changes require confirmation.

Downloads use canonical JSON. Plan export remains disabled until the matching
profile digest has been exported. Browsers cannot enforce the required `0600`
mode for private plan files; the UI must continue to disclose that limitation.

## Accessibility and manual checks

Preserve semantic landmarks, heading order, the skip link, visible keyboard
focus, labeled native controls, announced results and errors, focus containment
in the drawer and confirmation dialog, reduced-motion behavior, and text
wrapping without document-level horizontal overflow. Color must not be the
only indication of state or selection.

Before release, manually check keyboard navigation, focus order, dialog
behavior, browser Back and Forward, screen-reader output, 200% and 400% zoom,
and the desktop and compact layouts. Automated tests do not replace these
checks.

## Automated checks

From the repository root after `npm ci`:

```sh
npm test
npm run lint
find web -type f \( -name '*.js' -o -name '*.mjs' \) -exec node --check {} +
```

The complete cross-language gate is in [CONTRIBUTING.md](../CONTRIBUTING.md).

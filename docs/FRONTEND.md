# Frontend architecture

The CampusWeave frontend is a dependency-free HTML, CSS, and JavaScript client
served by the Python loopback service. It reviews the checked-in profile and
requests all validation and compilation from the Python backend.

## Runtime boundary

Run the interface from the repository root:

```sh
python3 -m campusweave
```

The service binds to `127.0.0.1:8766`. It does not support another host or port.
Static files are served from an explicit allowlist in
`campusweave/service.py`.

The browser uses these local endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Report the local offline-planning mode |
| `GET` | `/api/v1/reference` | Return the checked-in reference profile and compiled facts |
| `POST` | `/api/v1/compile-profile` | Validate a profile and compile its offline plan |
| `POST` | `/api/v1/import-profile` | Validate an imported reference-derived profile |
| `POST` | `/api/v1/instantiate-profile` | Change the institution code and label |

Other paths and HTTP methods are rejected. Query strings are not accepted. The
request body limit is 2 MiB.

The frontend has no endpoint for tenant configuration, credentials, target
inventory, operation bindings, approval, publication, or device actions.

## Module structure

| Path | Responsibility |
| --- | --- |
| `index.html` | Document shell, metadata, skip link, application root, and module entry |
| `app.js` | DOM event registration and application startup |
| `app/state.mjs` | Mutable application and request state |
| `app/actions.mjs` | Loading, validation, import, navigation, export, notices, and persistence |
| `model/api.mjs` | Local HTTP client and safe error normalization |
| `model/selectors.mjs` | Profile selectors and route helpers |
| `model/serialize.mjs` | Canonical JSON, filenames, and browser downloads |
| `model/storage.mjs` | Bounded browser local-storage access |
| `model.mjs` | Public model exports |
| `views/html.mjs` | Escaping, icons, labels, and shared view helpers |
| `views/shell.mjs` | Navigation, masthead, status rail, and confirmation dialog |
| `views/inspectors.mjs` | Organization, group, policy, and assignment detail views |
| `views/screens.mjs` | Eight workflow screens |
| `views/app-shell.mjs` | Complete application render |
| `views.mjs` | Public view exports |
| `styles.css` | CSS entry point |
| `styles/` | Tokens, base styles, shell, controls, lists, inspectors, screens, and responsive rules |

Every imported static module must also appear in the service allowlist.

## Routes

The interface uses URL fragments:

- `#start`
- `#institution`
- `#organization`
- `#groups`
- `#policies`
- `#assignments`
- `#readiness`
- `#review`

Unknown fragments resolve to `#start`. User navigation updates browser history.
Back and Forward navigation restore the selected screen.

Organization, groups, policies, and assignments use a master-detail layout.
At widths of 900 CSS pixels or less, navigation becomes a drawer and selected
details render directly after the selected row. Additional compact rules apply
at 520 CSS pixels.

## State and persistence

Application state includes:

- the validated profile and compiled response;
- the current route and selected list items;
- policy and assignment filters;
- institution form values and unsaved state;
- export-order state;
- notices, errors, busy state, and pending confirmations; and
- compact navigation state.

The browser stores one profile under the local-storage key
`campusweave:v1:profile`. The stored JSON is limited to 2 MiB and must pass
backend validation before it is saved.

Import and reset require confirmation before replacing the stored profile.
Navigation also confirms before discarding unsaved institution changes.

## Validation and exports

The browser does not duplicate profile validation rules. It sends profiles and
institution changes to the Python service and displays safe validation paths
returned by that service.

Profile and plan downloads use canonical JSON. Plan export remains disabled
until the matching profile digest has been exported. The browser cannot set file
permissions on downloads, so operators must set plan files to mode `0600`
before command-line validation or storage.

## Styling

`styles.css` imports eight files:

```css
@import url("./styles/tokens.css");
@import url("./styles/base.css");
@import url("./styles/shell.css");
@import url("./styles/components.css");
@import url("./styles/lists.css");
@import url("./styles/inspector.css");
@import url("./styles/screens.css");
@import url("./styles/responsive.css");
```

Use the system UI font stack for interface text and the system monospace stack
for identifiers and digests. Do not add a webfont request or runtime styling
dependency.

Color is not the sole status or selection indicator. Selected controls use
`aria-pressed`, a visible boundary, and text. Safe and blocked states include
labels in addition to color.

## Accessibility

Frontend changes must preserve:

- semantic landmarks and heading order;
- the skip link;
- visible keyboard focus;
- labeled native controls;
- announced errors, notices, selections, and result counts;
- keyboard operation for navigation, filters, dialogs, and row selection;
- focus containment in the compact navigation and confirmation dialog;
- reduced-motion behavior;
- text wrapping without document-level horizontal overflow; and
- selected details near their controls in compact layouts.

The target is WCAG 2.2 AA. Screen-reader output, accessibility-tree order, and
zoom behavior still require manual browser testing before publication.

## Development and testing

Run frontend tests:

```sh
node --test tests/test_campusweave_ui.mjs
python3 -m unittest tests/test_campusweave.py -v
```

Check every JavaScript module:

```sh
for f in web/**/*.{js,mjs}; do
  [ -f "$f" ] || continue
  node --check "$f"
done
```

The GitHub Actions workflow runs the Node.js suite and checks the public entry
files `app.js`, `model.mjs`, and `views.mjs`. The broader loop above checks all
modules locally.

## Screenshots

Regenerate the synthetic screenshots after a visible interface change:

```sh
zsh scripts/capture_campusweave_screenshots.zsh
```

The script starts the local service and uses the first available supported macOS
browser:

1. Chromium
2. Google Chrome
3. Microsoft Edge

It captures:

| Route | File | Size |
| --- | --- | --- |
| `#start` | `docs/assets/screenshots/campusweave-overview.png` | 1440 by 1000 |
| `#assignments` | `docs/assets/screenshots/campusweave-assignments.png` | 1440 by 1000 |
| `#assignments` | `docs/assets/screenshots/campusweave-mobile.png` | 500 by 900 |

Inspect each image for clipping, stale interface text, private data, and target
data before including it in a release.

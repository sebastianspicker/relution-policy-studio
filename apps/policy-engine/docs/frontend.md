# Frontend conventions

The browser editor is served by the local Node.js process. Static Vite preview
does not provide the `/api/*` backend and is not a supported editor runtime.

## Routes

The application uses local hash routes:

- `#/policies`
- `#/baselines/builder`
- `#/baselines/recommendations`
- `#/baselines/compliance`
- `#/device-audit`
- `#/settings`

Routes do not contain tenant, policy, configuration, token, or workspace
identifiers. Unknown routes return to Policies. Browser Back and Forward move
between sections without replacing the loaded workspace.

## Layout

Policies uses the navigator, editor, and optional assurance inspector.
Baselines, Device audit, and Settings use dedicated full-width workspaces.
These panels and the individual baseline tabs load when opened, with loading
status and a retry control for failed loads. Routing and workspace state remain
in the central controller; theme application remains part of startup.

Recommendation browsing uses compact rows from `/api/recommendations/:source/browse`.
Selecting a row loads `/api/recommendations/:source/records/:id`; import intent
loads `/api/recommendations/:source/ruleset`. Separate request caches retain
browse rows, evidence, and rulesets across navigation and share pending requests.
The source index and legacy catalog endpoints remain available.

Desktop panes scroll independently. At and below the compact breakpoint, the
Policies section displays one named pane at a time. Tables can use labelled
horizontal scroll regions, but the document must not scroll horizontally.

## Design system

`web/src/styles/tokens.css` is the source of truth for color, typography,
spacing, geometry, motion, focus, and stacking tokens. Components consume the
semantic `--ci-*` variables rather than introducing feature-specific palettes.
The built-in Studio, Neutral, Institution, Dark, and Custom themes change
semantic tokens without changing interaction or layout contracts.

The editor self-hosts IBM Plex Sans and IBM Plex Mono from `web/public/fonts/`
and declares them in `web/src/styles/fonts.css`; it does not load a font CDN.
Use the sans stack for interface text and the monospace stack for technical
values, paths, and identifiers.

The shell uses a navigation rail, command bar, provenance strip, content area,
and local status footer. Preserve the feature ownership expressed by the style
files under `web/src/styles/`: global tokens and primitives stay shared, while
feature layout rules remain with their named surface. Treat
`web/src/features/settings/` as the owner of theme selection, persistence,
sanitization, contrast validation, and custom-token application.

Use primary and status colors by semantic role. Communicate status with text or
an icon as well as color, keep errors adjacent to their controls, and keep
loading, empty, disabled, success, and recoverable-error states local to the
operation they describe.

## Component contracts

- Use `FieldFrame` for visible labels, technical paths, descriptions, required
  state, and associated errors.
- Use `InlineStatus` for local loading, success, warning, and recoverable error
  feedback.
- Keep Save, Build, Download, and connection status persistent when the related
  state remains relevant.
- Keep local workspace state and remote service state distinguishable.
- Present validation and evidence limits beside the affected operation, and
  preserve raw identifiers needed for technical diagnosis.
- Implement composite tabs and radio groups with arrow keys and Home/End.
- Do not override native undo and redo inside editable controls.
- Provide loading, empty, error, disabled, and success states for asynchronous
  operations.
- Confirm destructive local actions and make external writes explicit.

## Accessibility

The target is WCAG 2.2 AA at 320 CSS pixels and browser zoom equivalents.
Preserve:

- semantic landmarks and form labels
- keyboard access and logical focus order
- visible focus indicators
- sufficient contrast
- reduced-motion behavior
- 44 CSS pixel targets for coarse pointers
- status text that does not rely on color alone

Automated checks do not replace manual keyboard and assistive-technology
review.

## Browser review

Run the bundle budget after a browser build:

```sh
pnpm build:web
pnpm check:bundle:web
```

The build writes `editor-dependency-graph.json`. The budget check measures the
initial app and its static dependencies, verifies that deferred panels exist
outside that graph, and retains the total JavaScript and CSS gzip budgets.
Check the demo with `pnpm build:demo` followed by
`node tools/check-web-bundle-budget.mjs --demo`.

For visible changes, review desktop, compact, and narrow layouts manually.
Record unavailable browsers or assistive technologies as untested.

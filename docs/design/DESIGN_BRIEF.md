# Relution Policy Studio: design brief

Scope: the Studio workbench (`apps/workbench`). The legacy engine editor (`rexp
serve`) and the legacy planner browser are out of scope. This brief supersedes
`system.md` and the `*-corrected.png` references, as the user decided on
2026-10-03; `fidelity.md` remains the record of the previous design.

## 1. Product

Relution Policy Studio is a local workbench for planning device-management
(MDM) policy for an institution before anything touches Relution. It runs as
one authenticated loopback host on the administrator's own machine. The React
UI talks to a policy engine and an offline Python planner. Nothing is
published, and Relution stays read-only.

The core material is a chain of custody from intent to evidence:

1. **Scope.** Name an intended outcome ("Trust and enrollment prerequisite"),
   who it is for (organization, location, cohort, ownership, platform) and the
   rollout stage. Compile it with the planner.
2. **Review.** Compare a source recommendation (BSI IT-Grundschutz, CIS
   benchmarks, or a studio preset) with the current policy draft, setting by
   setting, and acknowledge each change explicitly.
3. **Save & map.** Save the concrete configuration and bind it to the intent
   through a reviewed mapping: value, applicability and digest-pinned revision.
4. **Artifacts.** Validate, build a `.rexp` archive, attach evidence hashes and
   export a review package. The package still lists every unresolved
   requirement and states that execution and deployment are not authorized.

Secondary tools are Institution records, the Intent register, the Policies
editor (configurations, baselines, recommendations, compliance, workspaces),
Evidence, the Review package, Archives, Device assessment and Settings.

**Moment of value.** The Artifacts sheet: a validated archive and a review
package that honestly separates what has been *prepared*, what has been
*locally validated*, and what is *not operationally verified*. The product's
ethic, written into its README and AGENTS.md, is that local checks confer no
operational authority. The design has to make that distinction visible and
calm, never alarming and never glossed over.

## 2. Audience

**Primary: the institution's MDM administrator.** This person runs Relution
for a German university or school (*Hochschule*, *Schulträger*): IT operations
staff, often a small team of two to five, responsible for thousands of iPads,
Macs, Windows and Android devices across faculties, labs and administration.

- *Expertise:* deep in device management, profile payloads, enrollment and
  certificates. Comfortable with JSON, digests and CLIs. Not a designer, and
  wary of marketing gloss.
- *Goals:* turn a vague requirement ("lab Macs must be recoverable") into a
  concrete, defensible configuration, and leave a paper trail a data
  protection officer or an ISMS auditor (BSI Grundschutz) will accept.
- *Anxieties:* pushing a profile that bricks a lecture hall, losing work to a
  revision conflict, being blamed for an undocumented change, and a tool that
  claims more certainty than it has.
- *Distrusts:* green checkmarks without evidence, "AI-powered" anything, cloud
  sync of tenant data, vague status words.
- *Daily tools:* the Relution portal, Apple Configurator, Intune or Windows
  tooling, ticket systems (Zammad), spreadsheets and Word documents for change
  requests, and BSI and CIS PDFs.
- *Quality signals for them:* precise language, stable identifiers in view,
  dense but legible tables, nothing hidden, explicit save states, keyboard
  speed, and printed-document seriousness.

**Secondary: the reviewer** (ISMS officer, DPO, IT lead). This person reads
the review package and Evidence and Review screens and signs off. They need
hierarchy and plain language more than density.

## 3. Key journeys

1. Create a project (blank or institution reference), then go to Scope.
2. Scope → compile → choose a workspace → Review settings against a source →
   Save & map → Artifacts (validate, build the archive, attach evidence,
   export the review package).
3. Return later: open a project, see where it stands, and continue.
4. Recover: handle a save failure or revision conflict, export a recovery
   copy, retry.
5. Expert maintenance: Institution records, Intent register, policy editor,
   archives, settings (passphrase, theme, services).

## 4. Brand traits

| Trait | Not |
| --- | --- |
| **Exact.** Every status names what was checked. | Pedantic, or a wall of qualifiers |
| **Accountable.** The trail from intent to artifact is always visible. | Bureaucratic or form-heavy |
| **Calm.** Risky states are stated plainly, never dramatized. | Bland, or so muted that risk is missed |
| **Workmanlike.** Built for daily use by experts, dense and fast. | Cramped, or "enterprise grey" |
| **Independent.** Clearly its own tool, local and private. | Imitating Relution's or anyone's product look |

## 5. Market observations

The category consists of MDM consoles (Relution, Jamf Pro, Microsoft Intune,
Kandji, Mosyle, Workspace ONE) and compliance tools (Drata/Vanta-style
dashboards, BSI GS-Tool or Verinice for Grundschutz).

- *Conventions to honor:* left-to-right step flow for change work, tables with
  sticky headers and inspector panes, explicit Save, and recognisable platform
  names. Admins move between these tools daily, so these patterns stay.
- *Conventions to break:* blue SaaS chrome, card-dashboard overviews, green
  "compliant" percentages and donut charts, and icon-in-tinted-circle feature
  tiles. Compliance dashboards in particular sell a certainty this product
  refuses to claim.
- *The gap:* none of these tools looks like the artefact admins actually
  produce, which is a reviewed change document. Grundschutz work is
  documentary by nature: modules, requirements, evidence and sign-off.

No web research was run for this brief. The observations come from domain
knowledge and are recorded as assumptions below.

## 6. What to keep

- IBM Plex Sans and Mono, already self-hosted under the OFL with attribution.
  They are legible at small sizes, have strong tabular figures, and the users
  already know them.
- The four-sheet guided flow and its URL `?view=` contract, the narrow-view
  list → inspector → Back behaviour with focus restoration, reduced-motion
  support, the skip link, light and dark themes, and the `campusweave:theme`
  storage key.
- The honest copy: "Planning and local checks do not authorize deployment",
  "scope ≠ inventory", and "Not assessed" instead of a green tick.

## 7. Current weaknesses

- **Hierarchy is flat and loud at once.** Every page opens with a 48px, -1.8px
  tracked bold headline, so the headline outweighs the work. Section heads,
  field labels and captions sit within 2px of each other.
- **The step bar only says where you are.** The circled numbers and the yellow
  underline carry no sense of a document being assembled.
- **The leftover print-registration motif** (CMYK stripes, the `[rp]` glyph)
  is a decoration with no tie to the domain. Magenta squares mark "source"
  headings arbitrarily.
- **Status words are plain text** ("Needs mapping", "Not assessed"), so the
  most important information in every table has the least visual weight.
- **Projects are hard to find.** The Overview shows only the current project
  and a create form; opening another project is hidden in a dropdown.
- **Generic chrome:** white page, 7px-radius buttons, rail-gray table headers,
  and a warning-yellow alert box used for everything.
- **Five stylesheets with ad-hoc values:** 11–24px font sizes in 1px steps,
  hard-coded hex colors and repeated media-query patches.

## 8. Constraints

- Preserve all behaviour, routes (`?view=`), storage keys, API calls, the
  autosave and revision logic, dirty guards and focus management. This is a
  restyle and recomposition, not a rewrite of logic.
- The workbench is served offline from the loopback host, so fonts must be
  self-hosted. No CDNs and no new runtime dependencies.
- WCAG 2.2 AA: 4.5:1 text contrast, 3:1 for component boundaries and focus,
  visible focus, keyboard reach, and 44px targets on touch widths.
- The legacy UI bundle budget is unaffected because that UI is out of scope.
- Copy may change except where it is an identity listed in
  `docs/migration/PRODUCT-NAMING.md`.

## 9. Assumptions

| Assumption | Evidence | Confidence |
| --- | --- | --- |
| The primary user is an MDM admin at a German higher-education institution | "campusweave", Hochschule reference data, BSI + CIS source families, Zammad, Relution (German MDM vendor) | High |
| A secondary reviewer reads the review package | `execution_authorized=false` and `deployment_authorized=false` export fields, the evidence model, "review package" naming | High |
| The UI stays in English | All existing copy is English; the product name is English | Medium |
| Desktop at 1280–1600px is the main context; mobile is for reading and checking status, not authoring | Dense forms, policy editor, local loopback host | Medium |
| Users value a documentary, printed-report feel over dashboard polish | BSI Grundschutz practice, review-package export, prior "print" motif | Medium |
| Dark mode matters to a minority (evening maintenance windows) | Existing theme setting; no usage data | Low |
| Competitor surfaces look as described (blue SaaS chrome, dashboards) | Domain knowledge only; no live web review in this session | Medium |

---

## Design direction

### Direction A: "Title block" (*Schriftfeld*)

**Concept.** Every engineering drawing and every reviewed change document ends
in a title block, the ruled grid that says what this sheet is, which revision,
who prepared it and in what state. The studio's job is to produce exactly that
kind of document for device policy. So the interface is set as a sheet set:
each guided step is a numbered *sheet* in a ruled title block, status is a
*stamp*, and context sits in the *margin*.

- **Typography.** Source Serif 4 Semibold for page and panel titles gives the
  voice of a report rather than an app. IBM Plex Sans does the work: forms,
  tables, body. IBM Plex Sans Condensed in small caps sets the title-block
  labels, table headers and stamps, the lettering of technical drawings. IBM
  Plex Mono holds identifiers, digests, revisions and host. The scale is
  11 / 12.5 / 14 / 16 / 20 / 26 / 34.
- **Color.** Warm drafting paper (`#F3F1EC`) with ink (`#1A1C1E`); one
  *proofing vermilion* (`#B8410F`) marks the current sheet, focus and anything
  that needs the reader's pen. Primary actions are solid ink. Muted green,
  ochre and red exist only inside stamps and notices. In dark mode, the paper
  becomes graphite and the vermilion lightens to `#F08A5D`.
- **Layout.** A ruled grid: hairline rules instead of cards, square corners
  (2px on controls), a 12-column content area with a fixed margin column
  (about 340px), and dense 4px-based spacing. Tables are first-class citizens.
- **Motion.** Almost none: menu fade at 120ms, nothing on scroll. State
  changes are instant, as on paper.
- **Signature details.** (1) The sheet bar: guided steps as cells of a title
  block (`SHEET 02 / 04 · Review`), with a vermilion bar on the active cell.
  (2) Stamps: status as small ruled, condensed-caps marks (`NOT ASSESSED`,
  `NEEDS MAPPING`, `LOCALLY VALIDATED`), with variants that never use a
  checkmark for anything unverified.
- **Against the category.** No blue, no cards, no dashboards, no percentages.
  It looks like the document an auditor wants, not like an MDM console.
- **Refuses.** Rounded cards, shadows on content, icons as decoration, green
  ticks without evidence, and big marketing headlines.

### Direction B: "Wayfinding"

**Concept.** A campus signage system. Large step numerals as in a building
directory, platform color codes (macOS, iOS, Windows, Android) as wayfinding
lines, and a DIN-like grotesque (Barlow) at strong contrast.

- **Typography.** Barlow Semi Condensed for numerals and headings, Barlow for
  text, Plex Mono for data.
- **Color.** Dark navy information panels, white text, and four platform line
  colors used on rows, tabs and stamps.
- **Layout.** A big left step column with 64px numerals, generous spacing, and
  one task per screen.
- **Motion.** Slide transitions between steps, like moving along a route.
- **Signature details.** Platform color lines, and route-map progress.
- **Against the category.** Bold and human, unlike grey consoles.
- **Refuses.** Dense tables up front.

### Direction C: "Ledger"

**Concept.** An append-only chain of custody. Everything is a ledger line with
time, actor, digest and change. Monospace first, like a signed audit log.

- **Typography.** JetBrains Mono for everything except long prose (Plex Sans).
- **Color.** Near-black terminal-like ground, one amber for pending items and
  one green for hash-verified ones.
- **Layout.** A single column of entries with an expandable diff per entry,
  and a timeline gutter.
- **Motion.** New entries type in.
- **Signature details.** A digest gutter that shortens every hash to 8 chars
  with a copy action.
- **Against the category.** Feels like infrastructure, not SaaS.
- **Refuses.** Forms that look like forms.

### Evaluation and choice

| Criterion | A Title block | B Wayfinding | C Ledger |
| --- | --- | --- | --- |
| Grows from the product's own artefact | Strong: the review package *is* a title-blocked document | Weak: campus metaphor, not policy | Medium: custody trail exists, but the work is authoring, not logging |
| Fits expert density | Strong | Weak: one task per screen slows experts | Strong |
| Serves the secondary reviewer | Strong: reads like a report | Medium | Weak: hostile to non-engineers |
| Honest status | Stamps say exactly what was checked | Color codes encode platforms, not state | Green "verified" invites over-trust |
| Clichés avoided | Yes | Risk: color-coded platforms read like a transit-app trope | Risk: hacker-terminal and dark-neon cliché |
| Robust if assumptions fail (English UI, desktop-first) | Yes: ruled grid scales down to one column | Platform colors fail colour-blind users | Mono everywhere fails on mobile |

**Chosen: Direction A, "Title block".** It is the only direction whose
organizing idea is the product's own output. Its typography carries the
character on its own: a serif for headings, condensed caps for labels, mono
for evidence. It also makes the core ethic, prepared ≠ validated ≠ verified,
a visible system of stamps.

**What A gives up:** B's warmth and immediacy for first-time users, and C's
forensic precision for hashes. A borrows C's best idea in moderation: mono
digests with consistent truncation in the margin column.

**Assumption sensitivity.** If dark mode matters more than assumed, graphite
dark mode is specified as a first-class theme. If the UI is localized to
German later, the condensed caps and fixed label widths have room for
compounds such as *Anwendbarkeitsprüfung*. Labels wrap; they are never
truncated.

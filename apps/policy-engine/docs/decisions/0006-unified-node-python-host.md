# 0006: Keep the unified workbench on the authenticated Node host

Status: Active  
Date: 2026-09-07

## Context

The unified CampusWeave workbench needs the policy editor's archive and
workspace capabilities and the planner's offline Python compilation. Running a
second HTTP service would create a second authority boundary and duplicate the
editor's loopback authentication, origin controls, request limits, and mutation
scheduling.

## Decision

Extend the existing authenticated Node loopback host with an optional static
root and a CampusWeave project runtime. Node owns HTTP, private revisioned
project persistence, workspace association, and mutation queues. Each planner
request starts one bounded Python process using an explicitly configured
executable and working directory. The process receives one versioned JSON
request on standard input followed by EOF and returns one bounded versioned
JSON response. Python exposes planning commands and has no HTTP listener.

Project documents and policy workspaces retain separate durable transactions.
A project may associate several generated workspace identifiers, while only
one workspace is active in a host session. The association does not imply an
atomic multi-workspace commit.

## Invariants

- The existing loopback token, Host, Origin, body, and queue controls apply to
  all CampusWeave routes.
- Project and workspace paths are generated or configured at startup; request
  bodies cannot supply filesystem paths.
- Project persistence uses revision checks, bounded no-follow reads, private
  atomic writes, and a single-writer process lock.
- Projection requires a reviewed mapping bound to the current profile, policy
  revision and reference catalog, a fresh trusted compilation, the selected
  workspace, and schema validation of the resulting configuration.
- Browser code imports CampusWeave DTOs through `src/browser/` only; the
  workbench reaches them through the `rexp-studio/browser` and
  `rexp-studio/ui` package entry points, and the launcher through
  `rexp-studio/host` (`startStudioHost`).
- Node may launch Python; Python does not import Node code. No dependency-cycle
  exception is added to the architecture gate.

## Consequences

There is one local HTTP authority and one browser origin. Planner failures and
timeouts are isolated to their request. Workspace creation and project
association report separate transaction outcomes and do not claim distributed
or cross-workspace atomicity.

## Verification

Integration tests exercise loopback authorization, static-root serving,
revision conflicts, project recovery, worker failures, evidence staleness,
workspace activation, and mutation queue assignment. The existing architecture
and browser-boundary checks remain authoritative.

Workspace creation records a pending operation in the project before writing
workspace files, then attaches the verified workspace in a separate project
revision. Interrupted operations stay visible in Review and Policies.
`/api/campusweave/workspaces/recover` can finish an attachment after verifying
the durable workspace. A missing or invalid workspace keeps the operation
unresolved. Automatic stale writer-lock deletion is deliberately absent:
stop the host and verify the recorded process is gone before removing a stale
lock, so concurrent launchers cannot steal each other's ownership.

The legacy UI build retains its size limits and deferred-panel checks. Its
classic JSX transform and Oxc/Terser compression share initial and expert code
without changing the public React component contracts. Terser is an additional
pinned build dependency; existing locked package versions and integrity records
are retained.

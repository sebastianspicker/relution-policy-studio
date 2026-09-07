# 0005: Organize the workbench as a capability-oriented modular monolith

Status: Active  
Date: 2026-08-27

## Context

REXP Studio has one local operational process, one browser client, and offline
artifact-producing pipelines. Its historical flat source tree mixed domain
concepts, transports, persistence, and UI orchestration, while root facades
became accidental internal dependency hubs.

## Decision

Keep one deployable Node application and organize it by owned capability.
Transport adapters call typed application use cases for multi-effect workflows;
routes may call pure capability functions directly when no orchestration or
effect boundary is involved. Use cases coordinate pure capability logic and
narrow effect adapters. Editor routes use the workspace-state editor port for
durable state, except the designated initialization adapter and archive build
saga that own their raw persistence responsibilities. React is organized as an
app composition layer with isolated product feature packages. Features import
server-side code only through the browser-safe boundary, do not import sibling
features or the app shell, and place cross-feature browser contracts and small
utilities in `web/src/shared/`. The settings feature owns theme declarations,
persistence, validation, DOM application, and controls; the app may retain the
selected theme only to compose the workspace shell. Python remains an offline
pipeline that publishes checked-in JSON artifacts.

## Invariants

- `src/cli.ts` is the only root source entry point; implementation belongs to an
  owned capability directory.
- Production TypeScript has no dependency cycles.
- Capability dependencies follow the mechanically enforced acyclic matrix;
  integrations remain protocol-only and the editor owns HTTP concerns.
- Browser code reaches shared TypeScript only through `src/browser/`, whose
  runtime graph is free of Node dependencies.
- Python implementation modules use named capability modules, not numbered
  split files, wildcard imports, or imports through public tool facades.
- Interfaces represent nondeterministic effects; pure transformations remain
  direct functions.
- Editor routes do not import raw workspace persistence outside the designated
  state-initialization adapter and archive build saga.
- The React app shell composes product features; features use shared contracts
  and utilities rather than importing the app shell or a sibling feature, and
  reusable UI does not import feature orchestration.
- The settings feature owns theme behavior and presentation; no sibling feature
  owns or imports theme implementation.

## Consequences

The repository remains a modular monolith rather than a collection of services
or workspace packages. Capability directories communicate ownership without
adding deployment boundaries. The package exposes the CLI, not a parallel
source-level TypeScript API.

## Verification

`pnpm check:architecture` enforces the dependency rules. `pnpm verify:ci` adds
type checking, dead-code analysis, builds, bundle budgets, behavioral tests,
Ruff, and offline Python pipeline contracts.

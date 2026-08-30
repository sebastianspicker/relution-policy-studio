# Profile notes

The checked-in Reference University profile is an inert, institution-neutral
desired-state description. It models organization units, locations, cohorts,
policy intent, group blueprints, assignment intent, rollout rings, and
activation gates without tenant identifiers, credentials, request payloads, or
executable operations.

## Supported customization

CampusWeave supports changing only the institution code and label. The runtime
derives every required namespace from those values and rejects arbitrary changes
to organization, group, policy, and assignment content. This keeps the profile
safe to review and lets the compiler produce deterministic offline intent.

Use `profile instantiate` to create a reference-derived copy, then validate it
and build a private plan. The complete command sequence and artifact rules are
documented in [Compiler checks](compiler-checks.md) and
[University runtime](relution/UNIVERSITY_RUNTIME.md).

## Boundary

A valid profile or plan does not authorize a tenant connection or a live
change. Target identity, contract data, current state, approval, audit
evidence, and rollback planning must be established separately in an approved
operational process.

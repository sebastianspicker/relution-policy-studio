# 0003: Recover workspace and sidecar together; publish archives separately

Status: Active  
Date: 2026-08-09

## Context

REXP archives and editor sidecars can contain sensitive policy state. Partial
writes, path traversal, symlink substitution, unauthenticated extraction, or a
failed multi-file update could corrupt the workspace or modify files outside it.

## Decision

Archive extraction, packing, and editor persistence remain bounded. Managed
workspace files and the editor sidecar publish as one journaled, recoverable
unit of work. Archive publication is a separate staged-and-verified saga because
the output may be on another filesystem. Editor-only sidecar data remains
outside the authenticated `.rexp` payload.

Editor archive imports first extract into a private temporary workspace, validate
the loaded workspace, then replace the destination workspace together with a
fresh sidecar. Archive builds capture one locked workspace-and-sidecar pair and
materialize a private packing source, so validation, output bytes, and the
returned sidecar all refer to the same state even if another process writes the
live workspace afterwards.

## Invariants

- Archive authentication and structural limits are checked before extracted
  content is published.
- Archive entry paths, destination ancestry, and managed files reject traversal
  and symlink substitution.
- Workspace and sidecar files are staged under a private directory, published
  under an inter-process lock, and recovered from a durable journal after a
  process crash.
- `/api/state` returns an opaque revision of the canonical workspace-and-sidecar
  pair. Full replacement and multi-effect mutations must submit that value as
  `expectedRevision`; the comparison occurs while the same inter-process lock
  is held and a stale request receives HTTP 409 without publishing anything.
- Compliance remediation accepts the revision and stable `policyPath`/version
  target only. It resolves the authoritative workspace while locked instead of
  using a client-supplied workspace snapshot.
- Archive bytes are verified before atomic publication. The system does not
  claim cross-filesystem atomicity between an archive and its source workspace.
- Archive builds never reload or republish the captured live workspace. They
  validate and pack only the private snapshot source.
- Forced extraction journals destination replacement and recovers a killed
  process before another extraction touches that destination.
- DDM, MDM command drafts, and other editor sidecar state are not packed into a
  `.rexp` archive.

## Ownership and source of truth

Repository maintainers own the boundary. The implementation authority is
`src/archive/rexp-extraction.ts`, `src/archive/rexp-packing.ts`,
`src/platform/filesystem/atomic-private-file.ts`,
`src/workspace-state/persistence.ts`,
`src/editor/editor-archive-import.ts`, and
`src/editor/editor-server-archive-compliance-routes.ts`.

## Compatibility

Existing authenticated archive formats and plaintext workspace behavior remain
compatible. Sidecar schema evolution must preserve the separation from archive
content and must validate before replacing prior state.

## Rollback and recovery

Failed workspace operations restore the captured workspace and sidecar state.
An interrupted operation is recovered before the next load or mutation. If
recovery itself fails, surface the failure and stop further mutation. Archive
builds do not mutate their captured source; publication failures leave both the
live workspace and any previously published archive intact.

## Verification

`tests/contracts/rexp-archive-contract.test.ts`,
`tests/security/atomic-private-file.test.ts`,
`tests/security/rexp-extraction-recovery.test.ts`,
`tests/security/workspace-storage-transaction.test.ts`, and
`tests/workspace-state-persistence.test.ts` cover archive authentication,
containment, sidecar separation, symlink resistance, rollback, and real
process-crash recovery. `tests/integration/editor-workspace-state.test.ts`
proves recovery and non-resurrection through the live HTTP boundary.
Those integration tests also interleave independent editor runtimes to prove
that stale full saves and stale compliance remediations return HTTP 409 while
the earlier successful response remains durable.
`tests/contracts/cli-contract.test.ts` covers forced CLI replacement of stale
sidecar data, while `tests/integration/editor-mutation-families.test.ts` proves
that a concurrent process cannot change a captured archive build snapshot.

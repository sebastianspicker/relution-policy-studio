# Security policy

## Supported versions

CampusWeave is unpublished alpha software. Security fixes apply only to the
current source candidate.

## Reporting a vulnerability

Use GitHub private vulnerability reporting when it is available. Do not include
credentials, customer exports, tenant identifiers, device or user data, or live
configuration in a public issue.

If private reporting is unavailable, open a public issue with a minimal
non-sensitive description and request a private contact channel. Do not publish
exploit details before a fix and disclosure plan are available.

## Security boundary

CampusWeave is designed to:

- listen only on `127.0.0.1:8766`;
- accept only fixed local routes and request shapes;
- validate strict bounded JSON;
- compile profiles and plans without network or mutation capability;
- keep target contracts and evidence outside the public source tree; and
- keep Relution authentication material out of process arguments and files.

Report any behavior that:

- reads a credential or target artifact during normal web or offline CLI use;
- contacts a non-loopback service;
- accepts arbitrary target configuration through the browser;
- produces a plan with operation bindings or execution authorization;
- exposes sensitive values in errors, logs, output, or screenshots; or
- bypasses path, ownership, mode, symlink, origin, or request-size checks.

## Relution operations

Repository documentation does not authorize access to a Relution instance.
Live work requires an explicitly authorized target, exact target contract,
defined organization and resource scope, least-privilege identity, read-back,
audit evidence, and a recovery plan.

Do not retry a timed-out mutation until current state and audit evidence show
that another request is safe.

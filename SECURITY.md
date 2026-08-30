# Security policy

Security fixes apply to the current unpublished source candidate. Use private
vulnerability reporting when available. Never include credentials, customer data,
target hostnames, inventories, contracts, or live configuration in a public issue.

Normal CampusWeave behavior is loopback-only and offline: strict bounded JSON,
reference-derived profiles, unbound plans, no credential access, no target
configuration, and no outbound network. Report any path that weakens those
boundaries or exposes sensitive values.

Private artifact access requires POSIX no-follow, directory-relative,
mode-setting, and hard-link primitives and fails closed when they are missing.
Only macOS is exercised in the current CI matrix; an unverified platform must not
silently receive weaker symlink or file-mode protection.

The Relution transport adapter requires separate, explicit authorization and exact
target validation. It is not a supported mechanism for probing or mutating targets.

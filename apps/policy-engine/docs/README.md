# Documentation

The root [README](../README.md) is the primary installation, configuration,
usage, testing, operation, and troubleshooting guide.

## Technical references

- [Architecture](architecture.md): runtime boundaries, source ownership,
  dependency direction, durable state, and mechanical checks.
- [Frontend conventions](frontend.md): routes, design tokens, interaction
  contracts, responsive behavior, accessibility, and browser testing.
- [Release procedure](alpha-release.md): source release scope and release
  checks.
- [Apple compatibility matrix](JAMF_RELUTION_APPLE_GAP.md): Apple payloads
  bridged through Relution `APPLE_MOBILECONFIG`.
- [Mapping candidate review](MAPPING_CANDIDATE_REVIEW.md): current non-exact
  mapping queues and promotion rules.
- [MDM reference package](../mdm/README.md): LAB source records, schemas,
  evidence states, runbooks, and output validation.
- [Security policy](../SECURITY.md): reporting and data boundaries.
- [Contribution guide](../CONTRIBUTING.md): setup, change rules, and
  verification.
- [Architecture decisions](decisions/README.md): active safety-boundary
  invariants, ownership, compatibility, rollback, and verification evidence.

## Screenshots

`readme-tour/` contains seven 1440 by 1000 product images used by the root
README. They are maintained documentation assets, not test output.

## Private and local files

Do not place tenant exports, decrypted workspaces, credentials, tokens,
certificates, local reports, or source documents in this directory. Use the
ignored `private/`, `reports/`, or `scratch/` lanes as appropriate.

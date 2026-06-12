# Security Policy

## Supported Versions

Security fixes target the latest state of the `main` branch. This project is
local-first and does not run a hosted service for users.

## Reporting A Vulnerability

Do not open a public GitHub issue for suspected vulnerabilities.

Use GitHub private vulnerability reporting:

https://github.com/sebastianspicker/relution-policy-workbench/security/advisories/new

If GitHub returns a 404 or permission error for the private reporting link,
contact the maintainer privately and include:

- affected commit or release, or `main` when no narrower version is known
- reproduction steps
- expected and actual impact
- sanitized logs or sample files that reproduce the issue

Please avoid sending real Relution exports, credentials, tenant data, private
keys, or encryption keys unless a secure exchange path has been agreed first.

## Security-Relevant Data

Treat these as sensitive:

- Relution `.rexp` archives, decrypted workspaces, and generated imports
- archive encryption keys and `.env` files
- Relution API URLs, credentials, and read-only device audit exports
- policy payloads, screenshots, logs, and generated baseline artifacts

Keep real exports, credentials, and private tenant data out of git. Use tracked
examples only when they are sanitized fixtures.

## Disclosure And Response

The maintainer will triage privately reported vulnerabilities, determine the
affected scope from the reported commit or release and reproduction steps, and
publish a GitHub security advisory after a fix or mitigation is available.
Fixes target the `main` branch unless the report identifies an affected release
branch.

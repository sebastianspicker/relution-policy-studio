# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue for suspected vulnerabilities.

Use GitHub private vulnerability reporting if available. If it is unavailable,
contact the maintainer privately with reproduction steps, impact, affected
commit, and any relevant sanitized logs or sample files.

## Supported Scope

Security fixes target the latest state of the `main` branch.

This project is local-first, but its inputs can still be sensitive. Treat these
areas as security-relevant:

- Relution `.rexp` archives, decrypted workspaces, and generated imports
- encryption keys and `.env` files
- Relution API URLs, credentials, and read-only device audit exports
- policy payloads, screenshots, logs, and generated baseline artifacts

Keep real exports, credentials, and private tenant data out of git. Use the
tracked examples only for sanitized fixtures.

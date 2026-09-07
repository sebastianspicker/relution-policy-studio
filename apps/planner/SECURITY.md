# Security

CampusWeave handles contract and planning artifacts whose target-derived forms
can contain sensitive operational data. The current source candidate has no
published supported-version policy and no verified private reporting channel.

## Reporting

Use a public GitHub issue only when the report and reproduction contain no
credentials, target hostnames or identifiers, customer data, private contracts,
inventories, logs, screenshots, or other sensitive material. Otherwise, do not
publish the details; contact the repository owner through an existing trusted
private channel.

If a secret is exposed, stop using it, do not repeat it in a report, rotate it
through the authorized system, and retain only sanitized evidence.

## Security boundaries

Normal CampusWeave behavior is fixed-loopback and offline. It reads no
credentials, stores no server-side session state, accepts only
reference-derived profiles, produces unbound non-authorizing plans, and has no
target executor or outbound network path.

Private artifact access requires POSIX no-follow, directory-relative,
mode-setting, ownership, and hard-link checks. These checks must fail closed
when unavailable. Browser downloads cannot set POSIX modes; set private plans
to `0600` before command-line validation or storage.

`scripts/relution_curl.zsh` is a separate, manually sourced transport helper.
It can make real requests and therefore requires explicit target and operation
authorization. Its validation is not proof of permission, operation meaning,
idempotency, rollback, or outcome. Follow the
[Relution operations runbook](docs/relution/OPERATIONS.md).

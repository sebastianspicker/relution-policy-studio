# Contributing

Read the guide of the application you change: [policy engine](apps/policy-engine/CONTRIBUTING.md) or [planner](apps/planner/CONTRIBUTING.md); workbench changes follow the policy-engine guide. Repository-wide, `pnpm bootstrap` sets up both language environments and `pnpm verify` must pass before a pull request. Applications import each other only through their declared package entry points (see [README.md](README.md)).

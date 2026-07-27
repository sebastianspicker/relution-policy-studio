"""Command-line interface for the strictly offline university runtime."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping

import university_profile
from strict_json import load_strict_json

from .io import atomic_write_json, load_json_with_sha256, strict_load_json
from .plan import build_execution_plan, instantiate_profile, validate_execution_plan
from .target import validate_target_context


SCRIPT_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SCRIPT_ROOT.parent
DEFAULT_PROFILE = REPOSITORY_ROOT / "docs/relution/packages/university/desired-state.json"
DEFAULT_MANIFEST = REPOSITORY_ROOT / "docs/relution/registries/manifest.json"
DEFAULT_TARGET_TEMPLATE = REPOSITORY_ROOT / "docs/relution/templates/university-runtime-target.json"


def _json_output(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def _profile(
    path: Path,
    manifest: Path,
) -> tuple[Mapping[str, Any] | None, str | None, list[str]]:
    errors: list[str] = []
    concept_ids = university_profile.concept_ids_from_manifest(manifest, errors)
    try:
        document, digest = load_json_with_sha256(path)
    except ValueError as exc:
        errors.append(str(exc))
        return None, None, sorted(set(errors))
    if not isinstance(document, Mapping):
        errors.append("$: profile must be an object")
        return None, None, sorted(set(errors))
    errors.extend(university_profile.validate_package(document, concept_ids))
    return document, digest, sorted(set(errors))


def _report_errors(path: Path, errors: Iterable[str]) -> int:
    unique = sorted(set(errors))
    for error in unique:
        print(f"error: {path}:{error}", file=sys.stderr)
    print(f"validation failed: {len(unique)} error(s)", file=sys.stderr)
    return 1


def _profile_validate(args: argparse.Namespace) -> int:
    document, _, errors = _profile(args.profile, args.manifest)
    if errors or document is None:
        return _report_errors(args.profile, errors)
    package = document["package"]
    print(
        f"valid: {package['package_id']} is commit-safe, non-executable, "
        "reference-closed, and target-contract blocked"
    )
    return 0


def _profile_status(args: argparse.Namespace) -> int:
    document, digest, errors = _profile(args.profile, args.manifest)
    if errors or document is None:
        return _report_errors(args.profile, errors)
    package = document["package"]
    gates = document["activation_gates"]
    _json_output(
        {
            "profile_valid": True,
            "package_id": package["package_id"],
            "institution_code": package["institution_code"],
            "institution_label": package["institution_label"],
            "profile_sha256": digest,
            "execution_authorized": False,
            "runtime_state": "target_binding_required",
            "counts": {
                "organization_units": len(document["organization_units"]),
                "locations": len(document["locations"]),
                "functional_cohorts": len(document["functional_cohorts"]),
                "policies": len(document["policy_units"]),
                "group_blueprints": len(document["group_blueprints"]),
                "assignment_intents": len(document["assignment_intents"]),
                "workflows": len(document["api_workflows"]),
            },
            "activation": {
                "defined_gates": len(gates),
                "passed_gates": 0,
                "unresolved_inputs": [item["input_id"] for item in document["unresolved_inputs"]],
            },
        }
    )
    return 0


def _profile_instantiate(args: argparse.Namespace) -> int:
    template, _, errors = _profile(args.template, args.manifest)
    if errors or template is None:
        return _report_errors(args.template, errors)
    try:
        document = instantiate_profile(template, args.institution_code, args.institution_label)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    concept_errors: list[str] = []
    concept_ids = university_profile.concept_ids_from_manifest(args.manifest, concept_errors)
    concept_errors.extend(university_profile.validate_package(document, concept_ids))
    if concept_errors:
        return _report_errors(args.output, concept_errors)
    try:
        atomic_write_json(args.output, document, mode=0o644)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"created: non-executable university profile {args.output}")
    return 0


def _plan_build(args: argparse.Namespace) -> int:
    profile, profile_digest, errors = _profile(args.profile, args.manifest)
    if errors or profile is None or profile_digest is None:
        return _report_errors(args.profile, errors)
    plan = build_execution_plan(profile, profile_digest)
    plan_errors = validate_execution_plan(plan, profile, profile_digest)
    if plan_errors:
        return _report_errors(args.output, plan_errors)
    try:
        atomic_write_json(args.output, plan, mode=0o600)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(
        f"created: offline-only plan {args.output} with {len(plan['steps'])} "
        "unbound abstract intent steps; execution_authorized=false"
    )
    return 0


def _validated_plan(args: argparse.Namespace) -> tuple[Mapping[str, Any] | None, list[str]]:
    profile, profile_digest, errors = _profile(args.profile, args.manifest)
    if errors or profile is None or profile_digest is None:
        return None, errors
    try:
        document = strict_load_json(args.plan, private=not args.allow_nonprivate)
    except ValueError as exc:
        return None, [str(exc)]
    errors.extend(validate_execution_plan(document, profile, profile_digest))
    return document if isinstance(document, Mapping) else None, sorted(set(errors))


def _plan_validate(args: argparse.Namespace) -> int:
    document, errors = _validated_plan(args)
    if errors or document is None:
        return _report_errors(args.plan, errors)
    print(
        f"valid: {args.plan} is digest-bound, dependency-closed, offline-only, "
        f"and contains {len(document['steps'])} unbound abstract intent steps"
    )
    return 0


def _dry_run(args: argparse.Namespace) -> int:
    document, errors = _validated_plan(args)
    if errors or document is None:
        return _report_errors(args.plan, errors)
    kind_counts: dict[str, int] = {}
    for step in document["steps"]:
        kind = step["kind"]
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
    _json_output(
        {
            "dry_run": "offline_valid",
            "execution_ready": False,
            "execution_authorized": False,
            "network_calls": 0,
            "mutation_calls": 0,
            "plan_sha256": document["plan_sha256"],
            "step_count": len(document["steps"]),
            "step_kinds": kind_counts,
            "blocked_phases": [
                phase["phase_id"] for phase in document["phases"] if phase["state"] == "blocked"
            ],
            "blockers": document["blockers"],
            "next_required_artifact": "digest-bound target context and contract-bound operation references",
        }
    )
    return 0


def _contract_check(args: argparse.Namespace) -> int:
    """Delegate exact contract/catalog checks to the repository validator."""

    for label, path in (("OpenAPI contract", args.spec), ("operation catalog", args.catalog)):
        try:
            document, _ = load_strict_json(path)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        if not isinstance(document, Mapping):
            print(f"error: {path}: {label} root must be a JSON object", file=sys.stderr)
            return 1
    command = [
        sys.executable,
        str(SCRIPT_ROOT / "validate_machine_docs.py"),
        "--spec",
        str(args.spec),
        "--catalog",
        str(args.catalog),
    ]
    completed = subprocess.run(command, cwd=REPOSITORY_ROOT, check=False)
    return completed.returncode


def _target_validate(args: argparse.Namespace) -> int:
    profile, profile_digest, errors = _profile(args.profile, args.manifest)
    if errors or profile is None or profile_digest is None:
        return _report_errors(args.profile, errors)
    try:
        checked_in_template = args.context.resolve(strict=True) == DEFAULT_TARGET_TEMPLATE.resolve(strict=True)
        document = strict_load_json(args.context, private=not checked_in_template)
    except (OSError, ValueError) as exc:
        return _report_errors(args.context, [str(exc)])
    errors = validate_target_context(
        document,
        args.context,
        profile,
        args.profile,
        profile_digest,
    )
    if errors:
        return _report_errors(args.context, errors)
    status = document["context_status"]
    bindings = document["bindings"]
    print(
        f"valid: university target context is {status}; "
        f"semantic_role_status={bindings['semantic_role_status']}; "
        "execution_authorized=false and no credential was read"
    )
    return 0


def _add_profile_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate and compile strictly offline CampusWeave runtime artifacts."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    profile = commands.add_parser("profile", help="work with commit-safe university profiles")
    profile_commands = profile.add_subparsers(dest="profile_command", required=True)
    validate = profile_commands.add_parser("validate")
    _add_profile_options(validate)
    validate.set_defaults(handler=_profile_validate)
    status = profile_commands.add_parser("status")
    _add_profile_options(status)
    status.set_defaults(handler=_profile_status)
    instantiate = profile_commands.add_parser("instantiate")
    instantiate.add_argument("--template", type=Path, default=DEFAULT_PROFILE)
    instantiate.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    instantiate.add_argument("--institution-code", required=True)
    instantiate.add_argument("--institution-label", required=True)
    instantiate.add_argument("--output", type=Path, required=True)
    instantiate.set_defaults(handler=_profile_instantiate)

    plan = commands.add_parser("plan", help="compile or validate an offline execution-intent plan")
    plan_commands = plan.add_subparsers(dest="plan_command", required=True)
    build = plan_commands.add_parser("build")
    _add_profile_options(build)
    build.add_argument("--output", type=Path, required=True)
    build.set_defaults(handler=_plan_build)
    validate_plan = plan_commands.add_parser("validate")
    _add_profile_options(validate_plan)
    validate_plan.add_argument("--plan", type=Path, required=True)
    validate_plan.add_argument(
        "--allow-nonprivate",
        action="store_true",
        help="accept a plan that is not current-user mode 0600 (unsafe local override)",
    )
    validate_plan.set_defaults(handler=_plan_validate)

    dry_run = commands.add_parser("dry-run", help="verify and render a plan without HTTP")
    _add_profile_options(dry_run)
    dry_run.add_argument("--plan", type=Path, required=True)
    dry_run.add_argument(
        "--allow-nonprivate",
        action="store_true",
        help="accept a plan that is not current-user mode 0600 (unsafe local override)",
    )
    dry_run.set_defaults(handler=_dry_run)

    target = commands.add_parser("target", help="validate a private digest-bound target context")
    target_commands = target.add_subparsers(dest="target_command", required=True)
    target_validate = target_commands.add_parser("validate")
    _add_profile_options(target_validate)
    target_validate.add_argument("--context", type=Path, required=True)
    target_validate.set_defaults(handler=_target_validate)

    contract = commands.add_parser("contract", help="check an exact target catalog offline")
    contract_commands = contract.add_subparsers(dest="contract_command", required=True)
    check = contract_commands.add_parser("check")
    check.add_argument("--spec", type=Path, required=True)
    check.add_argument("--catalog", type=Path, required=True)
    check.set_defaults(handler=_contract_check)
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    return int(args.handler(args))

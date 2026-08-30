"""Pure offline profile compilation and reference-profile use cases."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from . import profiles
from .json_snapshot import decode_strict_json
from .planning import build_execution_plan, instantiate_profile, validate_execution_plan
from .private_artifacts import canonical_json_bytes, canonical_sha256, load_json_with_sha256
from .resources import CONCEPT_MANIFEST, REFERENCE_PROFILE

PROFILE_PATH = REFERENCE_PROFILE
MANIFEST_PATH = CONCEPT_MANIFEST
SAFE_DETAIL_PATH = re.compile(
    r"^\$\.(?:package|provenance|commit_boundary|locations|organization_units|"
    r"functional_cohorts|department_persona_rules|policy_layers|policy_units|"
    r"group_blueprints|rollout_rings|assignment_intents|activation_gates|"
    r"api_workflows|unresolved_inputs)(?:\[\d+\])?"
)


class CampusWeaveInputError(ValueError):
    """A deliberately non-sensitive client input failure."""

    def __init__(self, message: str, details: list[dict[str, str]] | None = None) -> None:
        super().__init__(message)
        self.details = details or [{"path": "$", "message": "request is not valid"}]


def _validation_message(error: str) -> str:
    lowered = error.lower()
    if "missing keys" in lowered or "required" in lowered:
        return "a required field is missing"
    if "unknown keys" in lowered:
        return "an unknown field is not allowed"
    if "forbidden" in lowered:
        return "value is not permitted in a commit-safe profile"
    if "reference" in lowered:
        return "reference does not resolve within the profile"
    return "value does not satisfy the offline university contract"


def _safe_validation_details(errors: list[str]) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    for error in errors[:16]:
        raw_path, separator, raw_message = error.partition(":")
        path_match = (
            SAFE_DETAIL_PATH.match(raw_path) if separator and len(raw_path) <= 256 else None
        )
        details.append(
            {
                "path": path_match.group(0) if path_match else "$",
                "message": _validation_message(raw_message),
            }
        )
    return details or [
        {"path": "$", "message": "profile does not satisfy the offline university contract"}
    ]


def _counts(profile: Mapping[str, Any], plan: Mapping[str, Any]) -> dict[str, int]:
    return {
        "organization_units": len(profile["organization_units"]),
        "locations": len(profile["locations"]),
        "functional_cohorts": len(profile["functional_cohorts"]),
        "policy_units": len(profile["policy_units"]),
        "group_blueprints": len(profile["group_blueprints"]),
        "assignment_intents": len(profile["assignment_intents"]),
        "api_workflows": len(profile["api_workflows"]),
        "plan_steps": len(plan["steps"]),
    }


def _dry_run_facts(plan: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "mode": "offline_planning_only",
        "execution_authorized": plan["execution_authorized"],
        "network_capable": plan["network_capable"],
        "mutation_capable": plan["mutation_capable"],
        "network_calls": 0,
        "mutation_calls": 0,
        "all_steps_unbound": all(step.get("state") == "unbound" for step in plan["steps"]),
    }


def _concept_ids() -> set[str]:
    errors: list[str] = []
    concepts = profiles.concept_ids_from_manifest(MANIFEST_PATH, errors)
    if errors:
        raise RuntimeError("the checked-in university registry is not available")
    return concepts


@lru_cache(maxsize=1)
def _reference_source() -> tuple[bytes, str]:
    profile, source_digest = load_json_with_sha256(PROFILE_PATH)
    return canonical_json_bytes(profile), source_digest


def _reference_profile() -> Mapping[str, Any]:
    profile = decode_strict_json(_reference_source()[0], Path("reference-profile.json"))
    if not isinstance(profile, Mapping):  # pragma: no cover - checked-in profile invariant
        raise RuntimeError("the checked-in university profile is not an object")
    return profile


def _assert_supported_rebinding(profile: Mapping[str, Any]) -> None:
    package = profile.get("package")
    if not isinstance(package, Mapping):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must be a supported reference rebinding"}],
        )
    code, label = package.get("institution_code"), package.get("institution_label")
    if not isinstance(code, str) or not isinstance(label, str):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must declare a supported institution identity"}],
        )
    try:
        expected = instantiate_profile(_reference_profile(), code, label)
    except ValueError as exc:
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$.package", "message": "must declare a supported institution identity"}],
        ) from exc
    if canonical_json_bytes(profile) != canonical_json_bytes(expected):
        raise CampusWeaveInputError(
            "profile is not a supported rebinding",
            [{"path": "$", "message": "must exactly match a supported reference rebinding"}],
        )


def compile_profile(
    profile: Any,
    *,
    source_profile_sha256: str | None = None,
    source_profile_filename: str | None = None,
) -> dict[str, Any]:
    """Validate and compile one commit-safe profile without touching a target."""
    if not isinstance(profile, Mapping):
        raise CampusWeaveInputError(
            "profile must be an object", [{"path": "$.profile", "message": "must be an object"}]
        )
    errors = profiles.validate_package(profile, _concept_ids())
    if errors:
        raise CampusWeaveInputError(
            "profile does not satisfy the offline university contract",
            _safe_validation_details(errors),
        )
    _assert_supported_rebinding(profile)
    digest = canonical_sha256(profile)
    plan = build_execution_plan(profile, digest)
    if validate_execution_plan(plan, profile, digest):
        raise RuntimeError("the offline planner produced an invalid plan")
    return {
        "profile": profile,
        "profile_sha256": digest,
        "profile_filename": "university-profile.canonical.json",
        "plan": plan,
        "plan_sha256": plan["plan_sha256"],
        "plan_filename": "university-plan.canonical.json",
        "counts": _counts(profile, plan),
        "dry_run": _dry_run_facts(plan),
        "source_profile_sha256": source_profile_sha256,
        "source_profile_filename": source_profile_filename,
    }


@lru_cache(maxsize=1)
def _reference_response_bytes() -> bytes:
    _, source_digest = _reference_source()
    return canonical_json_bytes(
        compile_profile(
            _reference_profile(),
            source_profile_sha256=source_digest,
            source_profile_filename=PROFILE_PATH.name,
        )
    )


def reference_response() -> dict[str, Any]:
    """Return a fresh view of the cached, authoritative canonical export."""
    response = decode_strict_json(_reference_response_bytes(), Path("reference-response.json"))
    if not isinstance(response, dict):  # pragma: no cover - compiler invariant
        raise RuntimeError("the cached reference response is not an object")
    return response


def _compile_profile_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, Mapping) or set(request) != {"profile"}:
        raise CampusWeaveInputError("unexpected request shape")
    return compile_profile(request["profile"])


def _identity_failure_details(failure: str) -> list[dict[str, str]]:
    if failure.startswith("institution code"):
        return [
            {
                "path": "$.institution_code",
                "message": "must use at most 48 lowercase letters, digits, or hyphens",
            }
        ]
    if failure.startswith("institution label"):
        return [
            {
                "path": "$.institution_label",
                "message": "must contain 1 through 200 non-whitespace characters",
            }
        ]
    return [{"path": "$.profile", "message": "must be a supported reference-derived profile"}]


def _instantiate_profile_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, Mapping) or set(request) != {
        "profile",
        "institution_code",
        "institution_label",
    }:
        raise CampusWeaveInputError("unexpected request shape")
    profile, code, label = (
        request["profile"],
        request["institution_code"],
        request["institution_label"],
    )
    if not isinstance(profile, Mapping):
        raise CampusWeaveInputError("profile must be an object")
    if not isinstance(code, str) or not isinstance(label, str):
        raise CampusWeaveInputError("institution identity must be strings")
    try:
        return compile_profile(instantiate_profile(profile, code, label))
    except ValueError as exc:
        raise CampusWeaveInputError(
            "institution identity is not valid", _identity_failure_details(str(exc))
        ) from exc


def compile_endpoint_request(path: str, request: Any) -> dict[str, Any]:
    """Run the fixed endpoint use case without HTTP transport concerns."""
    if path == "/api/v1/compile-profile":
        return _compile_profile_request(request)
    if path == "/api/v1/import-profile":
        return compile_profile(request)
    return _instantiate_profile_request(request)

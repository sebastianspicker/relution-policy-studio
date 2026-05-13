from pathlib import Path
import sys


TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from compare_institution_policy_baseline import (  # noqa: E402
    baseline_target_matches_policy,
    compare_indexes,
    harvest_policy_file,
    read_json,
    write_outputs,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = REPO_ROOT / "example" / "institution-policy-comparison"


def test_institution_policy_file_harvest_extracts_policy_metadata(tmp_path: Path) -> None:
    institution_root = tmp_path / "sample_policy_docs"
    policy_path = institution_root / "docs/managed-devices/05-policies-catalog/windows-policies.md"
    policy_path.parent.mkdir(parents=True)
    policy_path.write_text(
        "\n".join(
            [
                "## Windows",
                "### WIN-TEST-010 - BitLocker und Kennwort",
                "",
                "Policy: `Institution Windows Security Baseline`",
                "",
                "| Setting | Value |",
                "| --- | --- |",
                "| Minimum password length | **12** |",
                "",
                "BitLocker und sichere Kennwortauthentisierung muessen aktiviert sein.",
                "",
                "Controls-Mapping: SYS.3.2.2.A23, MDM.2.2.06",
                "",
                "#### Verifikation",
                "",
                "Diese Sektion darf nicht in den Match-Text fallen: AuditCredentialValidation.",
            ]
        ),
        encoding="utf8",
    )

    policies = harvest_policy_file("WINDOWS", policy_path, institution_root)

    assert len(policies) == 1
    policy = policies[0]
    assert policy["id"] == "WIN-TEST-010"
    assert policy["sourcePath"] == "docs/managed-devices/05-policies-catalog/windows-policies.md"
    assert "WINDOWS_BITLOCKER" in policy["relutionTargets"]
    assert "WINDOWS_PASSCODE" in policy["relutionTargets"]
    assert policy["settings"]["WINDOWS_PASSCODE"]["minLength"] == 12
    assert "AuditCredentialValidation".lower() not in policy["matchText"]


def test_windows_custom_csp_matching_requires_specific_identifier_overlap() -> None:
    laps_policy = {
        "relutionTargets": ["WINDOWS_CUSTOM_CSP", "WINDOWS_PASSCODE"],
        "matchTerms": ["laps", "backup", "directory", "administrator", "password"],
    }
    vbs_policy = {
        "relutionTargets": ["WINDOWS_CUSTOM_CSP"],
        "matchTerms": ["virtualization", "hypervisor", "code", "integrity"],
    }

    assert baseline_target_matches_policy(
        laps_policy,
        {"target": "WINDOWS_CUSTOM_CSP", "targetName": "BackupDirectory (Disabled -> Error)"},
    )
    assert baseline_target_matches_policy(
        vbs_policy,
        {"target": "WINDOWS_CUSTOM_CSP", "targetName": "HypervisorEnforcedCodeIntegrity"},
    )
    assert not baseline_target_matches_policy(
        laps_policy,
        {"target": "WINDOWS_CUSTOM_CSP", "targetName": "AccountLogon_AuditCredentialValidation"},
    )


def test_compare_indexes_reports_institution_only_and_missing_baseline_targets() -> None:
    institution_index = {
        "policies": [
            {
                "id": "WIN-TEST-010",
                "platform": "WINDOWS",
                "title": "WIN-TEST-010 - Process only",
                "relutionTargets": [],
                "controls": [],
                "settings": {},
                "sourcePath": "windows.md",
                "lineStart": 1,
                "lineEnd": 10,
            }
        ]
    }
    baseline_index = {
        "generatedAt": "2026-04-24T20:01:33Z",
        "actionableTargets": [
            {
                "platform": "WINDOWS",
                "ruleId": "baseline-windows-update",
                "target": "WINDOWS_UPDATE",
                "targetName": None,
                "title": "Windows Update",
                "values": {},
            }
        ],
        "suppressedConflicts": [],
    }

    comparison = compare_indexes(institution_index, baseline_index)

    assert comparison["summary"]["statusCounts"] == {"institution-only": 1}
    assert comparison["summary"]["baselineMissingInInstitution"] == 1
    assert comparison["baselineMissingInInstitution"][0]["ruleId"] == "baseline-windows-update"


def test_write_outputs_creates_json_and_markdown_reports(tmp_path: Path) -> None:
    institution_index = {"policies": [], "summary": {"total": 0, "byPlatform": {}}}
    baseline_index = {"actionableTargets": [], "suppressedConflicts": [], "summary": {"total": 0, "byPlatform": {}}}
    comparison = {
        "generatedAt": "2026-04-24T20:01:33Z",
        "policyResults": [],
        "baselineMissingInInstitution": [],
        "summary": {
            "institutionPolicies": 0,
            "baselineActionableTargets": 0,
            "baselineMissingInInstitution": 0,
            "statusCounts": {},
        },
    }

    write_outputs(tmp_path, institution_index, baseline_index, comparison)

    assert (tmp_path / "institution-policy-index.json").exists()
    assert (tmp_path / "relution-baseline-index.json").exists()
    assert (tmp_path / "institution-vs-relution-baseline.json").exists()
    assert (tmp_path / "institution-vs-relution-baseline.md").read_text(encoding="utf8").startswith(
        "# Institution Policy Catalog vs Generated Relution Baseline"
    )


def test_generated_institution_comparison_artifacts_are_consistent() -> None:
    institution_index = read_json(OUTPUT_ROOT / "institution-policy-index.json")
    baseline_index = read_json(OUTPUT_ROOT / "relution-baseline-index.json")
    comparison = read_json(OUTPUT_ROOT / "institution-vs-relution-baseline.json")

    assert len(institution_index["policies"]) == 1
    assert len(baseline_index["actionableTargets"]) == 183
    assert comparison["summary"]["institutionPolicies"] == len(institution_index["policies"])
    assert comparison["summary"]["baselineActionableTargets"] == len(baseline_index["actionableTargets"])
    assert comparison["summary"]["baselineMissingInInstitution"] == len(comparison["baselineMissingInInstitution"])
    assert {"docs/managed-devices/05-policies-catalog/windows-policies.md"} == {
        policy["sourcePath"] for policy in institution_index["policies"]
    }
    assert set(comparison["summary"]["statusCounts"]) <= {"conflict", "covered", "documented-only", "institution-only"}

"""Tests for semantic concept matching in recommendation mapping."""

from pathlib import Path
import zipfile

from defusedxml import ElementTree as ET

from python_tool_helpers import evidence, expect, import_tool, semantic_concept_ids


bsi_module = import_tool("harvest_bsi_grundschutz")
cis_module = import_tool("harvest_cis_benchmarks")
recommendation_mapping_module = import_tool("recommendation_mapping")
BenchmarkDetails = cis_module.BenchmarkDetails
BenchmarkSpec = cis_module.BenchmarkSpec
build_setting_index = recommendation_mapping_module.build_setting_index
cis_semantic_candidates_for = cis_module.cis_semantic_candidates_for
cis_semantic_evidence_sources_for = cis_module.cis_semantic_evidence_sources_for
merge_candidates = cis_module.merge_candidates
parse_benchmark = cis_module.parse_benchmark
parse_module_description = bsi_module.parse_module_description
parse_module_threats = bsi_module.parse_module_threats
parse_shared_strings = bsi_module.parse_shared_strings
semantic_concepts_for = recommendation_mapping_module.semantic_concepts_for
semantic_concepts_for_field = recommendation_mapping_module.semantic_concepts_for_field
semantic_no_concept_reason = recommendation_mapping_module.semantic_no_concept_reason


DOCBOOK_NS_URI = "http://docbook.org/ns/docbook"


def test_generic_policy_audit_and_location_words_do_not_overmatch_management_concepts() -> (
    None
):
    """Verify generic audit/location wording does not imply management concepts."""

    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence(
            "Review the policy setting at the documented registry location during the audit.",
            source="vendor-reason",
        ),
    )

    ids = {concept["id"] for concept in concepts}
    expect("mdm_compliance" not in ids)
    expect("logging_compliance" not in ids)
    expect("location" not in ids)


def test_cis_semantic_evidence_uses_title_and_operational_sections() -> None:
    """Verify CIS evidence preserves source sections for semantic matching."""

    sources = cis_semantic_evidence_sources_for(
        "4.5",
        "Ensure all devices are marked as compliant",
        "Enabled",
        {
            "description": "All enrolled devices should report compliance state to the MDM.",
            "rationale": "Compliance makes policy drift visible.",
            "audit": "Verify device compliance in the management console.",
            "remediation": "Mark non-compliant devices and require the managed app.",
            "defaultValue": "Not configured.",
        },
    )

    expect(
        [source["source"] for source in sources]
        == [
            "cis-title",
            "cis-description",
            "cis-rationale",
            "cis-audit",
            "cis-remediation",
            "cis-default-value",
            "cis-recommended-value",
        ]
    )
    expect({source["sourceId"] for source in sources} == {"4.5"})


def test_cis_ios_compliance_wording_maps_to_semantic_partial_candidate() -> None:
    """Verify CIS compliance wording maps to partial MDM compliance candidates."""

    sources = cis_semantic_evidence_sources_for(
        "4.5",
        "Ensure all devices are marked as compliant",
        None,
        {
            "description": (
                "Devices must remain compliant with the organization mobile device management "
                "policy."
            )
        },
    )
    concepts = semantic_concepts_for("IOS", sources)

    expect("mdm_compliance" in {concept["id"] for concept in concepts})
    candidates = cis_semantic_candidates_for(
        "IOS", "4.5", "Ensure all devices are marked as compliant", concepts
    )
    expect(any(candidate["target"] == "IOS_APP_COMPLIANCE" for candidate in candidates))
    expect(
        all(
            candidate["match"]["valueCompatibility"] == "concept-candidate"
            for candidate in candidates
        )
    )


def test_cis_ios_latest_device_architecture_maps_to_hardened_device_candidates() -> (
    None
):
    """Verify high-value target wording maps to hardened-device candidates."""

    sources = cis_semantic_evidence_sources_for(
        "4.9",
        "Ensure the latest iOS device architecture is used by high-value targets",
        None,
        {
            "rationale": (
                "High-value targets should use current hardware architecture for stronger "
                "platform protections."
            )
        },
    )
    concepts = semantic_concepts_for("IOS", sources)

    expect("hardened_device_procurement" in {concept["id"] for concept in concepts})
    candidate_targets = {
        candidate["target"]
        for candidate in cis_semantic_candidates_for(
            "IOS",
            "4.9",
            "Ensure the latest iOS device architecture is used by high-value targets",
            concepts,
        )
    }
    expect(
        {"IOS_RESTRICTION", "IOS_SECURED_SHARED_DEVICE", "IOS_SHARED_DEVICE"}
        <= candidate_targets
    )


def test_cis_windows_service_and_user_rights_semantics_do_not_create_candidates() -> (
    None
):
    """Verify helper-only Windows service/user-rights entries stay unmapped."""

    service_sources = cis_semantic_evidence_sources_for(
        "5.1",
        "Ensure 'Bluetooth Audio Gateway Service (BTAGService)' is set to 'Disabled'",
        "Disabled",
        {"remediation": "Run Set-Service -Name BTAGService -StartupType Disabled."},
    )
    user_right_sources = cis_semantic_evidence_sources_for(
        "2.2.4",
        (
            "Ensure 'Adjust memory quotas for a process' is set to 'Administrators, LOCAL "
            "SERVICE, NETWORK SERVICE'"
        ),
        None,
        {"remediation": "Configure the User Rights Assignment policy."},
    )

    service_concepts = semantic_concepts_for("WINDOWS", service_sources)
    user_right_concepts = semantic_concepts_for("WINDOWS", user_right_sources)

    expect(
        cis_semantic_candidates_for(
            "WINDOWS",
            "5.1",
            "Ensure 'Bluetooth Audio Gateway Service (BTAGService)' is set to 'Disabled'",
            service_concepts,
        )
        == []
    )
    expect(
        cis_semantic_candidates_for(
            "WINDOWS",
            "2.2.4",
            (
                "Ensure 'Adjust memory quotas for a process' is set to 'Administrators, LOCAL "
                "SERVICE, NETWORK SERVICE'"
            ),
            user_right_concepts,
        )
        == []
    )


def test_cis_windows_helper_only_skip_is_visible(capsys: object) -> None:
    """Verify helper-only CIS skips are visible in generator diagnostics."""

    expect(
        cis_semantic_candidates_for(
            "WINDOWS", "5.1", "Ensure Bluetooth service is set to Disabled", []
        )
        == []
    )

    expect(
        "INFO: skipping helper-only CIS recommendation 5.1" in capsys.readouterr().err
    )


def test_cis_benchmark_parser_reports_helper_only_skip_count(capsys: object) -> None:
    """Verify parser diagnostics summarize helper-only CIS recommendations."""

    pdf_text = "\n".join(
        [
            "5.1 Ensure Bluetooth service is set to Disabled (Automated)",
            "Profile Applicability:",
            "Level 1",
            "Description:",
            "Disable Bluetooth service.",
            "Remediation:",
            "Run Set-Service -Name BTAGService -StartupType Disabled.",
            "",
            "18.1.1 Ensure normal password setting is Enabled (Automated)",
            "Profile Applicability:",
            "Level 1",
            "Description:",
            "Require password settings.",
        ]
    )
    benchmark = BenchmarkSpec(
        benchmark_id="cis-test",
        file_name="fake.pdf",
        benchmark_title="CIS Test Benchmark",
        platform="WINDOWS",
        family_source_id="cis-windows-test",
        management_surface="WINDOWS_GROUP_POLICY",
        details=BenchmarkDetails(
            os_family="WINDOWS", version="1.0.0", document_date="2026-05-28"
        ),
    )

    recommendations = parse_benchmark(
        benchmark, {}, {}, {}, pdf_text_extractor=lambda path: pdf_text
    )

    expect(len(recommendations) == 2)
    expect(
        "Skipped 1 helper-only items (not semantic candidates)"
        in capsys.readouterr().err
    )


def test_parse_shared_strings_warns_on_missing_xml(
    tmp_path: Path, capsys: object
) -> None:
    """Verify missing workbook shared strings are diagnostic, not silent."""

    workbook_path = tmp_path / "workbook.xlsx"
    with zipfile.ZipFile(workbook_path, "w") as archive:
        archive.writestr("xl/workbook.xml", "")

    with zipfile.ZipFile(workbook_path) as archive:
        expect(parse_shared_strings(archive) == [])

    expect(
        "WARNING: sharedStrings.xml not found in workbook" in capsys.readouterr().err
    )


def test_docbook_optional_sections_warn_when_missing(capsys: object) -> None:
    """Verify missing optional DocBook sections are visible in diagnostics."""

    module_section = ET.fromstring(
        f'<section xmlns="{DOCBOOK_NS_URI}"><title>SYS.2.1 Allgemeiner Client</title></section>'
    )

    expect(not parse_module_description(module_section))
    expect(not parse_module_threats(module_section))

    stderr = capsys.readouterr().err
    expect("expected DocBook section 'Beschreibung' not found" in stderr)
    expect("expected DocBook section 'Gefährdungslage' not found" in stderr)


def test_cis_candidate_merge_keeps_exact_and_curated_candidates_first() -> None:
    """Verify exact and inferred CIS candidates stay ahead of semantic fallbacks."""

    exact_candidate = {
        "kind": "relution-native",
        "target": "IOS_PASSCODE",
        "fieldPaths": ["minLength"],
    }
    inferred_candidate = {
        "kind": "apple-mobileconfig",
        "target": "com.apple.shareddeviceconfiguration",
        "fieldPaths": ["lockScreenFootnote"],
    }
    semantic_candidate = {
        "kind": "relution-native",
        "target": "IOS_APP_COMPLIANCE",
        "fieldPaths": ["requiredApps"],
        "semanticConceptId": "mdm_compliance",
    }

    expect(
        merge_candidates([exact_candidate, inferred_candidate], [semantic_candidate])
        == [
            exact_candidate,
            inferred_candidate,
            semantic_candidate,
        ]
    )


def test_relution_field_semantics_map_targets_back_to_concepts() -> None:
    """Verify Relution field metadata maps back to semantic concepts."""

    fields = build_setting_index()
    ios_min_length = next(
        field
        for field in fields["IOS"]
        if field.kind == "relution-native"
        and field.target == "IOS_PASSCODE"
        and field.field_path == "minLength"
    )
    windows_script_scan = next(
        field
        for field in fields["WINDOWS"]
        if field.kind == "relution-native"
        and field.target == "WINDOWS_ANTIVIRUS"
        and field.field_path == "allowScriptScanning"
    )

    expect(
        "passcode_authentication"
        in {
            concept["id"]
            for concept in semantic_concepts_for_field("IOS", ios_min_length)
        }
    )
    expect(
        "malware_protection"
        in {
            concept["id"]
            for concept in semantic_concepts_for_field("WINDOWS", windows_script_scan)
        }
    )


def test_generic_app_wording_does_not_overmatch_app_allowlist() -> None:
    """Verify generic app update wording does not imply app allowlisting."""

    expect(
        "app_allowlist"
        not in semantic_concept_ids("MACOS", "Automatically install app updates.")
    )
    expect(
        semantic_concept_ids(
            "ANDROID_ENTERPRISE", "Google Play Protect verify apps enforced"
        )
        == {"malware_protection"}
    )


def test_process_only_power_wording_stays_unmapped_without_relution_surface() -> None:
    """Verify physical power-process wording stays unmapped without a device setting."""

    sources = [
        {
            "source": "bsi-title",
            "text": "Unterbrechungsfreie und stabile Stromversorgung",
            "confidence": 0.9,
        },
        {
            "source": "bsi-requirement",
            "text": (
                "Clients SOLLTEN an eine unterbrechungsfreie Stromversorgung angeschlossen "
                "werden."
            ),
            "confidence": 0.78,
        },
    ]

    expect(not semantic_concepts_for("WINDOWS", sources))
    expect(semantic_no_concept_reason(sources).startswith("Process-only physical"))

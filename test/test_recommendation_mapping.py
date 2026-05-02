from pathlib import Path
import sys


TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

from build_relution_import_artifacts import (  # noqa: E402
    classify_mapping_update,
    classify_recommendation_mapping_change,
    classify_source_change,
    detect_mapping_language,
    exact_leaf_difference_is_hard,
    extracted_action,
    manual_promotion_ruleset_mapping,
    semantic_support_level,
)
from harvest_cis_benchmarks import cis_semantic_candidates_for, cis_semantic_evidence_sources_for, merge_candidates  # noqa: E402
from recommendation_mapping import build_setting_index, semantic_candidates_for, semantic_concepts_for, semantic_concepts_for_field, semantic_no_concept_reason  # noqa: E402


def evidence(text: str, *, source: str = "bsi-requirement", confidence: float = 0.8) -> list[dict[str, object]]:
    return [{"source": source, "text": text, "confidence": confidence}]


def concept_ids(platform: str, text: str) -> set[str]:
    return {concept["id"] for concept in semantic_concepts_for(platform, evidence(text))}


def test_german_bsi_passcode_wording_maps_to_canonical_concept() -> None:
    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence("Benutzende MUESSEN eine Bildschirmsperre verwenden und sich mit einem sicheren Kennwort authentisieren."),
    )

    assert "passcode_authentication" in {concept["id"] for concept in concepts}
    candidates = semantic_candidates_for("WINDOWS", concepts)
    assert any(candidate["target"] == "WINDOWS_PASSCODE" for candidate in candidates)


def test_english_vendor_wording_maps_to_same_concept() -> None:
    german_ids = concept_ids("IOS", "Der Geraetecode muss automatisch nach Inaktivitaet gesperrt werden.")
    english_ids = concept_ids("IOS", "Require a passcode and automatically lock the device after idle time.")

    assert "passcode_authentication" in german_ids
    assert "passcode_authentication" in english_ids
    assert german_ids.intersection(english_ids)


def test_camera_microphone_phrase_is_not_camera_only_exact_semantics() -> None:
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence("Die unautorisierte Nutzung von Rechnermikrofonen und Kameras muss verhindert werden."),
    )

    assert "camera_microphone" in {concept["id"] for concept in concepts}
    assert "camera" not in {concept["id"] for concept in concepts}
    candidates = semantic_candidates_for("ANDROID_ENTERPRISE", concepts)
    camera_candidates = [candidate for candidate in candidates if candidate["target"] == "ANDROID_ENTERPRISE_DISABLE_CAMERAS"]
    assert camera_candidates
    assert all(candidate["match"]["valueCompatibility"] == "concept-candidate" for candidate in camera_candidates)


def test_german_policy_mdm_and_admin_wording_maps_to_management_support_concepts() -> None:
    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence(
            "Lokale Sicherheitsrichtlinien muessen ueber ein Managementsystem verwaltet werden; "
            "Administrationsverfahren und Konfigurationsaenderungen sind zu dokumentieren.",
        ),
    )

    ids = {concept["id"] for concept in concepts}
    assert {"policy_governance", "administration_procedures", "reference_configuration_rollout"} <= ids

    candidates = semantic_candidates_for("WINDOWS", concepts)
    assert any(candidate["target"] == "WINDOWS_LOCAL_DEVICE_SECURITY" for candidate in candidates)
    assert any(candidate["target"] == "WINDOWS_CUSTOM_CSP" for candidate in candidates)
    assert any(candidate["target"] == "WINDOWS_COMPANION" for candidate in candidates)
    assert all(candidate["match"]["valueCompatibility"] == "concept-candidate" for candidate in candidates)


def test_hardened_device_wording_maps_to_security_candidates_without_exact_remediation() -> None:
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence("Institutionen SOLLTEN besonders abgesicherte mobile Endgeraete mit geeigneter sicherer Hardware einsetzen."),
    )

    assert "hardened_device_procurement" in {concept["id"] for concept in concepts}
    candidates = semantic_candidates_for("ANDROID_ENTERPRISE", concepts)
    assert any(candidate["target"] == "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES" for candidate in candidates)
    assert any(candidate["target"] == "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT" for candidate in candidates)
    assert all(candidate["match"]["valueCompatibility"] == "concept-candidate" for candidate in candidates)


def test_cis_semantic_evidence_uses_title_and_operational_sections() -> None:
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

    assert [source["source"] for source in sources] == [
        "cis-title",
        "cis-description",
        "cis-rationale",
        "cis-audit",
        "cis-remediation",
        "cis-default-value",
        "cis-recommended-value",
    ]
    assert {source["sourceId"] for source in sources} == {"4.5"}


def test_cis_ios_compliance_wording_maps_to_semantic_partial_candidate() -> None:
    sources = cis_semantic_evidence_sources_for(
        "4.5",
        "Ensure all devices are marked as compliant",
        None,
        {"description": "Devices must remain compliant with the organization mobile device management policy."},
    )
    concepts = semantic_concepts_for("IOS", sources)

    assert "mdm_compliance" in {concept["id"] for concept in concepts}
    candidates = cis_semantic_candidates_for("IOS", "4.5", "Ensure all devices are marked as compliant", concepts)
    assert any(candidate["target"] == "IOS_APP_COMPLIANCE" for candidate in candidates)
    assert all(candidate["match"]["valueCompatibility"] == "concept-candidate" for candidate in candidates)


def test_cis_ios_latest_device_architecture_maps_to_hardened_device_candidates() -> None:
    sources = cis_semantic_evidence_sources_for(
        "4.9",
        "Ensure the latest iOS device architecture is used by high-value targets",
        None,
        {"rationale": "High-value targets should use current hardware architecture for stronger platform protections."},
    )
    concepts = semantic_concepts_for("IOS", sources)

    assert "hardened_device_procurement" in {concept["id"] for concept in concepts}
    candidate_targets = {
        candidate["target"]
        for candidate in cis_semantic_candidates_for("IOS", "4.9", "Ensure the latest iOS device architecture is used by high-value targets", concepts)
    }
    assert {"IOS_RESTRICTION", "IOS_SECURED_SHARED_DEVICE", "IOS_SHARED_DEVICE"} <= candidate_targets


def test_cis_windows_service_and_user_rights_semantics_do_not_create_candidates() -> None:
    service_sources = cis_semantic_evidence_sources_for(
        "5.1",
        "Ensure 'Bluetooth Audio Gateway Service (BTAGService)' is set to 'Disabled'",
        "Disabled",
        {"remediation": "Run Set-Service -Name BTAGService -StartupType Disabled."},
    )
    user_right_sources = cis_semantic_evidence_sources_for(
        "2.2.4",
        "Ensure 'Adjust memory quotas for a process' is set to 'Administrators, LOCAL SERVICE, NETWORK SERVICE'",
        None,
        {"remediation": "Configure the User Rights Assignment policy."},
    )

    service_concepts = semantic_concepts_for("WINDOWS", service_sources)
    user_right_concepts = semantic_concepts_for("WINDOWS", user_right_sources)

    assert cis_semantic_candidates_for("WINDOWS", "5.1", "Ensure 'Bluetooth Audio Gateway Service (BTAGService)' is set to 'Disabled'", service_concepts) == []
    assert cis_semantic_candidates_for("WINDOWS", "2.2.4", "Ensure 'Adjust memory quotas for a process' is set to 'Administrators, LOCAL SERVICE, NETWORK SERVICE'", user_right_concepts) == []


def test_cis_candidate_merge_keeps_exact_and_curated_candidates_first() -> None:
    exact_candidate = {"kind": "relution-native", "target": "IOS_PASSCODE", "fieldPaths": ["minLength"]}
    inferred_candidate = {"kind": "apple-mobileconfig", "target": "com.apple.shareddeviceconfiguration", "fieldPaths": ["lockScreenFootnote"]}
    semantic_candidate = {
        "kind": "relution-native",
        "target": "IOS_APP_COMPLIANCE",
        "fieldPaths": ["requiredApps"],
        "semanticConceptId": "mdm_compliance",
    }

    assert merge_candidates([exact_candidate, inferred_candidate], [semantic_candidate]) == [
        exact_candidate,
        inferred_candidate,
        semantic_candidate,
    ]


def test_relution_field_semantics_map_targets_back_to_concepts() -> None:
    fields = build_setting_index()
    ios_min_length = next(
        field
        for field in fields["IOS"]
        if field.kind == "relution-native" and field.target == "IOS_PASSCODE" and field.field_path == "minLength"
    )
    windows_script_scan = next(
        field
        for field in fields["WINDOWS"]
        if field.kind == "relution-native" and field.target == "WINDOWS_ANTIVIRUS" and field.field_path == "allowScriptScanning"
    )

    assert "passcode_authentication" in {concept["id"] for concept in semantic_concepts_for_field("IOS", ios_min_length)}
    assert "malware_protection" in {concept["id"] for concept in semantic_concepts_for_field("WINDOWS", windows_script_scan)}


def test_generic_app_wording_does_not_overmatch_app_allowlist() -> None:
    assert "app_allowlist" not in concept_ids("MACOS", "Automatically install app updates.")
    assert concept_ids("ANDROID_ENTERPRISE", "Google Play Protect verify apps enforced") == {"malware_protection"}


def test_process_only_power_wording_stays_unmapped_without_relution_surface() -> None:
    sources = [
        {"source": "bsi-title", "text": "Unterbrechungsfreie und stabile Stromversorgung", "confidence": 0.9},
        {
            "source": "bsi-requirement",
            "text": "Clients SOLLTEN an eine unterbrechungsfreie Stromversorgung angeschlossen werden.",
            "confidence": 0.78,
        },
    ]

    assert semantic_concepts_for("WINDOWS", sources) == []
    assert semantic_no_concept_reason(sources).startswith("Process-only physical")


def test_generic_policy_audit_and_location_words_do_not_overmatch_management_concepts() -> None:
    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence("Review the policy setting at the documented registry location during the audit.", source="vendor-reason"),
    )

    ids = {concept["id"] for concept in concepts}
    assert "mdm_compliance" not in ids
    assert "logging_compliance" not in ids
    assert "location" not in ids


def test_bilingual_review_helpers_detect_german_and_english_mapping_language() -> None:
    assert detect_mapping_language("Benutzende MUSS eine Bildschirmsperre verwenden.") == "de"
    assert detect_mapping_language("Ensure the setting is set to Enabled.") == "en"
    assert extracted_action("Kameras und Mikrofone muessen deaktiviert werden.") == "restrict"
    assert extracted_action("Require FileVault encryption.") == "enforce"


def test_manual_promotion_ruleset_mapping_keeps_explicit_target_and_evidence() -> None:
    mapping = manual_promotion_ruleset_mapping(
        {
            "reviewerNote": "Reviewed against exact passcode reference.",
            "evidenceRefs": ["bsi:windows-sys-2-1-a1"],
            "mapping": {
                "kind": "relution-native",
                "target": "WINDOWS_PASSCODE",
                "values": {"enabled": True},
                "constraints": [{"path": "enabled", "operator": "equals", "value": True}],
            },
        }
    )

    assert mapping is not None
    assert mapping["kind"] == "relution-native"
    assert mapping["type"] == "WINDOWS_PASSCODE"
    assert mapping["values"] == {"enabled": True}
    assert mapping["match"]["valueCompatibility"] == "manual-reviewed"
    assert mapping["constraints"] == [{"path": "enabled", "operator": "equals", "value": True}]


def test_location_service_wording_still_maps_to_location_concept() -> None:
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence("Ensure location services and GPS are enabled for managed device recovery.", source="cis-title"),
    )

    assert "location" in {concept["id"] for concept in concepts}


def test_exact_leaf_difference_classifier_treats_compatible_thresholds_as_difference_not_contradiction() -> None:
    leaves = [
        {"value": 12, "constraints": [{"path": "minLength", "operator": "atLeast", "value": 12}]},
        {"value": 14, "constraints": [{"path": "minLength", "operator": "atLeast", "value": 14}]},
    ]

    assert exact_leaf_difference_is_hard(leaves) is False


def test_exact_leaf_difference_classifier_flags_unbounded_value_conflicts_as_hard() -> None:
    leaves = [
        {"value": True, "constraints": []},
        {"value": False, "constraints": []},
    ]

    assert exact_leaf_difference_is_hard(leaves) is True


def test_unified_analysis_support_levels_are_deterministic() -> None:
    assert semantic_support_level(["target-a"], ["target-b"]) == "exact"
    assert semantic_support_level([], ["target-b"]) == "candidate"
    assert semantic_support_level([], []) == "concept-only"


def test_source_change_classifier_distinguishes_content_metadata_and_parser_drift() -> None:
    previous = {
        "sha256": "source-a",
        "textSha256": "text-a",
        "title": "Previous title",
        "url": "https://example.invalid/a",
        "textPath": "example/vendor-references/downloads/text/a.txt",
    }

    assert classify_source_change(None, previous) == "new-source"
    assert classify_source_change(previous, None) == "removed-source"
    assert classify_source_change(previous, {**previous}) == "unchanged"
    assert classify_source_change(previous, {**previous, "title": "Updated title"}) == "metadata-only"
    assert classify_source_change(previous, {**previous, "textSha256": "text-b"}) == "text-changed"
    assert classify_source_change(previous, {**previous, "textSha256": ""}) == "parser-breaking"


def test_mapping_update_classifier_keeps_exact_promotions_review_gated() -> None:
    previous = {
        "kind": "relution-native",
        "type": "WINDOWS_PASSCODE",
        "values": {"enabled": True, "minLength": 12},
    }

    assert classify_mapping_update(previous, {**previous, "values": {"enabled": True, "minLength": 12}}) == "safe-retain"
    assert classify_mapping_update(previous, {**previous, "values": {"enabled": True, "minLength": 14}}) == "safe-mechanical-update"
    assert classify_mapping_update(previous, {**previous, "values": {"enabled": "true", "minLength": 14}}) == "manual-ledger-needed"
    assert classify_mapping_update(previous, {**previous, "type": "WINDOWS_FIREWALL"}) == "human-review-required"


def mapping_snapshot(
    *,
    status: str = "exact",
    exact_signature: str = "[exact-a]",
    candidate_signature: str = "[candidate-a]",
    semantic_signature: str = "[semantic-a]",
    title: str = "Use passcode",
    language: str = "en",
    source_hash: str = "source-a",
) -> dict[str, object]:
    return {
        "currentMappingStatus": status,
        "exactMappingSignature": exact_signature,
        "exactMappings": [{"kind": "relution-native", "target": "WINDOWS_PASSCODE", "fieldPaths": ["enabled"], "values": {"enabled": True}}],
        "candidateMappingSignature": candidate_signature,
        "semanticConceptSignature": semantic_signature,
        "title": title,
        "language": language,
        "sourceTextSha256": source_hash,
    }


def test_recommendation_mapping_change_classifier_separates_safe_metadata_from_review_drift() -> None:
    previous = mapping_snapshot()

    assert classify_recommendation_mapping_change(None, previous) == "new-recommendation"
    assert classify_recommendation_mapping_change(previous, None) == "removed-recommendation"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot()) == "unchanged"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot(status="partial")) == "status-changed"
    assert classify_recommendation_mapping_change(previous, {**mapping_snapshot(), "exactMappings": [{"kind": "relution-native", "target": "WINDOWS_FIREWALL", "fieldPaths": ["enabled"], "values": {"enabled": True}}]}) == "exact-target-changed"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot(exact_signature="[exact-b]")) == "exact-value-changed"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot(candidate_signature="[candidate-b]")) == "candidate-target-changed"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot(semantic_signature="[semantic-b]")) == "semantic-only"
    assert classify_recommendation_mapping_change(previous, mapping_snapshot(source_hash="source-b")) == "evidence-only"


def test_modal_verbs_and_gs_levels_affect_confidence_not_candidate_exactness() -> None:
    muss_concepts = semantic_concepts_for(
        "MACOS",
        [
            {
                "source": "grundschutz-plusplus-control",
                "gsControlId": "KONF.7.15",
                "modalVerb": "MUSS",
                "securityLevel": "erhoeht",
                "text": "Lokale Firewall muss aktiviert sein.",
                "confidence": 0.7,
            }
        ],
    )
    kann_concepts = semantic_concepts_for(
        "MACOS",
        [
            {
                "source": "grundschutz-plusplus-control",
                "gsControlId": "KONF.7.15",
                "modalVerb": "KANN",
                "securityLevel": "normal-SdT",
                "text": "Lokale Firewall kann aktiviert sein.",
                "confidence": 0.7,
            }
        ],
    )

    assert {concept["id"] for concept in muss_concepts} == {concept["id"] for concept in kann_concepts}
    muss_targets = {(candidate["kind"], candidate["target"], tuple(candidate["fieldPaths"])) for candidate in semantic_candidates_for("MACOS", muss_concepts)}
    kann_targets = {(candidate["kind"], candidate["target"], tuple(candidate["fieldPaths"])) for candidate in semantic_candidates_for("MACOS", kann_concepts)}
    assert muss_targets == kann_targets
    assert muss_concepts[0]["confidence"] > kann_concepts[0]["confidence"]

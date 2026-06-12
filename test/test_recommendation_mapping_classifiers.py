"""Tests for recommendation and mapping classifier helpers."""

from python_tool_helpers import expect, import_tool


artifact_module = import_tool("build_relution_import_artifacts")
recommendation_mapping_module = import_tool("recommendation_mapping")

classify_mapping_update = artifact_module.classify_mapping_update
classify_recommendation_mapping_change = (
    artifact_module.classify_recommendation_mapping_change
)
classify_source_change = artifact_module.classify_source_change
detect_mapping_language = artifact_module.detect_mapping_language
exact_leaf_difference_is_hard = artifact_module.exact_leaf_difference_is_hard
extracted_action = artifact_module.extracted_action
manual_promotion_ruleset_mapping = artifact_module.manual_promotion_ruleset_mapping
semantic_support_level = artifact_module.semantic_support_level
semantic_candidates_for = recommendation_mapping_module.semantic_candidates_for
semantic_concepts_for = recommendation_mapping_module.semantic_concepts_for


def evidence(
    text: str, *, source: str = "bsi-requirement", confidence: float = 0.8
) -> list[dict[str, object]]:
    """Build one semantic evidence record for classifier tests."""
    return [{"source": source, "text": text, "confidence": confidence}]


def test_bilingual_review_helpers_detect_german_and_english_mapping_language() -> None:
    """Detect German/English mapping language and extracted action intent."""
    expect(
        detect_mapping_language("Benutzende MUSS eine Bildschirmsperre verwenden.")
        == "de"
    )
    expect(detect_mapping_language("Ensure the setting is set to Enabled.") == "en")
    expect(
        extracted_action("Kameras und Mikrofone muessen deaktiviert werden.")
        == "restrict"
    )
    expect(extracted_action("Require FileVault encryption.") == "enforce")


def test_manual_promotion_ruleset_mapping_keeps_explicit_target_and_evidence() -> None:
    """Keep reviewer evidence and exact target data in manual promotion mappings."""
    mapping = manual_promotion_ruleset_mapping(
        {
            "reviewerNote": "Reviewed against exact passcode reference.",
            "evidenceRefs": ["bsi:windows-sys-2-1-a1"],
            "mapping": {
                "kind": "relution-native",
                "target": "WINDOWS_PASSCODE",
                "values": {"enabled": True},
                "constraints": [
                    {"path": "enabled", "operator": "equals", "value": True}
                ],
            },
        }
    )

    expect(mapping is not None)
    expect(mapping["kind"] == "relution-native")
    expect(mapping["type"] == "WINDOWS_PASSCODE")
    expect(mapping["values"] == {"enabled": True})
    expect(mapping["match"]["valueCompatibility"] == "manual-reviewed")
    expect(
        mapping["constraints"]
        == [{"path": "enabled", "operator": "equals", "value": True}]
    )


def test_location_service_wording_still_maps_to_location_concept() -> None:
    """Keep location-service wording mapped to the location semantic concept."""
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence(
            "Ensure location services and GPS are enabled for managed device recovery.",
            source="cis-title",
        ),
    )

    expect("location" in {concept["id"] for concept in concepts})


def test_compatible_thresholds_are_differences_not_contradictions() -> None:
    """Treat stricter compatible thresholds as differences, not hard conflicts."""
    leaves = [
        {
            "value": 12,
            "constraints": [{"path": "minLength", "operator": "atLeast", "value": 12}],
        },
        {
            "value": 14,
            "constraints": [{"path": "minLength", "operator": "atLeast", "value": 14}],
        },
    ]

    expect(exact_leaf_difference_is_hard(leaves) is False)


def test_exact_leaf_difference_classifier_flags_unbounded_value_conflicts_as_hard() -> (
    None
):
    """Treat unconstrained opposite exact values as hard contradictions."""
    leaves = [
        {"value": True, "constraints": []},
        {"value": False, "constraints": []},
    ]

    expect(exact_leaf_difference_is_hard(leaves) is True)


def test_unified_analysis_support_levels_are_deterministic() -> None:
    """Keep semantic support levels deterministic from exact/candidate targets."""
    expect(semantic_support_level(["target-a"], ["target-b"]) == "exact")
    expect(semantic_support_level([], ["target-b"]) == "candidate")
    expect(semantic_support_level([], []) == "concept-only")


def test_source_change_classifier_distinguishes_content_metadata_and_parser_drift() -> (
    None
):
    """Distinguish source metadata updates from content and parser drift."""
    previous = {
        "sha256": "source-a",
        "textSha256": "text-a",
        "title": "Previous title",
        "url": "https://example.invalid/a",
        "textPath": "example/vendor-references/downloads/text/a.txt",
    }

    expect(classify_source_change(None, previous) == "new-source")
    expect(classify_source_change(previous, None) == "removed-source")
    expect(classify_source_change(previous, {**previous}) == "unchanged")
    expect(
        classify_source_change(previous, {**previous, "title": "Updated title"})
        == "metadata-only"
    )
    expect(
        classify_source_change(previous, {**previous, "textSha256": "text-b"})
        == "text-changed"
    )
    expect(
        classify_source_change(previous, {**previous, "textSha256": ""})
        == "parser-breaking"
    )


def test_mapping_update_classifier_keeps_exact_promotions_review_gated() -> None:
    """Keep exact mapping changes review-gated when values or targets drift."""
    previous = {
        "kind": "relution-native",
        "type": "WINDOWS_PASSCODE",
        "values": {"enabled": True, "minLength": 12},
    }

    expect(
        classify_mapping_update(
            previous, {**previous, "values": {"enabled": True, "minLength": 12}}
        )
        == "safe-retain"
    )
    expect(
        classify_mapping_update(
            previous, {**previous, "values": {"enabled": True, "minLength": 14}}
        )
        == "safe-mechanical-update"
    )
    expect(
        classify_mapping_update(
            previous, {**previous, "values": {"enabled": "true", "minLength": 14}}
        )
        == "manual-ledger-needed"
    )
    expect(
        classify_mapping_update(previous, {**previous, "type": "WINDOWS_FIREWALL"})
        == "human-review-required"
    )


def mapping_snapshot(overrides: dict[str, object] | None = None) -> dict[str, object]:
    """Build a minimal mapping snapshot for recommendation-change classification."""
    values: dict[str, object] = {
        "status": "exact",
        "exactSignature": "[exact-a]",
        "candidateSignature": "[candidate-a]",
        "semanticSignature": "[semantic-a]",
        "title": "Use passcode",
        "language": "en",
        "sourceHash": "source-a",
    }
    values.update(overrides or {})
    return {
        "currentMappingStatus": values["status"],
        "exactMappingSignature": values["exactSignature"],
        "exactMappings": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_PASSCODE",
                "fieldPaths": ["enabled"],
                "values": {"enabled": True},
            }
        ],
        "candidateMappingSignature": values["candidateSignature"],
        "semanticConceptSignature": values["semanticSignature"],
        "title": values["title"],
        "language": values["language"],
        "sourceTextSha256": values["sourceHash"],
    }


def test_recommendation_mapping_change_classifier_separates_safe_metadata_from_review_drift() -> (
    None
):
    """Separate safe evidence drift from status, exact, candidate, and semantic drift."""
    previous = mapping_snapshot()

    expect(
        classify_recommendation_mapping_change(None, previous) == "new-recommendation"
    )
    expect(
        classify_recommendation_mapping_change(previous, None)
        == "removed-recommendation"
    )
    expect(
        classify_recommendation_mapping_change(previous, mapping_snapshot())
        == "unchanged"
    )
    expect(
        classify_recommendation_mapping_change(
            previous, mapping_snapshot({"status": "partial"})
        )
        == "status-changed"
    )
    expect(
        classify_recommendation_mapping_change(
            previous,
            {
                **mapping_snapshot(),
                "exactMappings": [
                    {
                        "kind": "relution-native",
                        "target": "WINDOWS_FIREWALL",
                        "fieldPaths": ["enabled"],
                        "values": {"enabled": True},
                    }
                ],
            },
        )
        == "exact-target-changed"
    )
    expect(
        classify_recommendation_mapping_change(
            previous, mapping_snapshot({"exactSignature": "[exact-b]"})
        )
        == "exact-value-changed"
    )
    expect(
        classify_recommendation_mapping_change(
            previous, mapping_snapshot({"candidateSignature": "[candidate-b]"})
        )
        == "candidate-target-changed"
    )
    expect(
        classify_recommendation_mapping_change(
            previous, mapping_snapshot({"semanticSignature": "[semantic-b]"})
        )
        == "semantic-only"
    )
    expect(
        classify_recommendation_mapping_change(
            previous, mapping_snapshot({"sourceHash": "source-b"})
        )
        == "evidence-only"
    )


def test_modal_verbs_and_gs_levels_affect_confidence_not_candidate_exactness() -> None:
    """Let GS++ modal verbs affect confidence without changing candidate exactness."""
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

    expect(
        {concept["id"] for concept in muss_concepts}
        == {concept["id"] for concept in kann_concepts}
    )
    muss_targets = {
        (candidate["kind"], candidate["target"], tuple(candidate["fieldPaths"]))
        for candidate in semantic_candidates_for("MACOS", muss_concepts)
    }
    kann_targets = {
        (candidate["kind"], candidate["target"], tuple(candidate["fieldPaths"]))
        for candidate in semantic_candidates_for("MACOS", kann_concepts)
    }
    expect(muss_targets == kann_targets)
    expect(muss_concepts[0]["confidence"] > kann_concepts[0]["confidence"])

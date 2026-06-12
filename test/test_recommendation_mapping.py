"""Tests for recommendation mapping candidates and extracted evidence."""

from pathlib import Path

from python_tool_helpers import (
    TOOLS_DIR,
    evidence,
    expect,
    import_tool,
    semantic_concept_ids,
)


artifact_module = import_tool("build_relution_import_artifacts")
vendor_sources_module = import_tool("_harvest_vendor_guidance_modules.vendor_sources")
bsi_module = import_tool("harvest_bsi_grundschutz")
cis_module = import_tool("harvest_cis_benchmarks")
recommendation_mapping_module = import_tool("recommendation_mapping")
update_guideline_module = import_tool("update_guideline_mappings")

SourceConfig = artifact_module.SourceConfig
build_coverage_matrix = artifact_module.build_coverage_matrix
build_semantic_index = artifact_module.build_semantic_index
build_unified_recommendation_analysis = (
    artifact_module.build_unified_recommendation_analysis
)
build_source_change_rows = artifact_module.build_source_change_rows
ensure_manual_mapping_promotions_file = (
    artifact_module.ensure_manual_mapping_promotions_file
)
importable_native_mappings = artifact_module.importable_native_mappings
normalize_recommendations = artifact_module.normalize_recommendations
relution_mapping_snapshot = artifact_module.relution_mapping_snapshot
source_text_hash = artifact_module.source_text_hash
validate_manual_mapping_promotions = artifact_module.validate_manual_mapping_promotions
write_settings_files = artifact_module.write_settings_files
safe_vendor_source_id = vendor_sources_module.safe_vendor_source_id
validate_vendor_source_url = vendor_sources_module.validate_vendor_source_url
vendor_download_path = vendor_sources_module.vendor_download_path
BSI_ERRATA_TEXT_PATH = bsi_module.ERRATA_TEXT_PATH
BSI_GS_PLUSPLUS_CATALOG_PATH = bsi_module.GS_PLUSPLUS_CATALOG_PATH
BSI_GS_PLUSPLUS_METHOD_PATH = bsi_module.GS_PLUSPLUS_METHOD_PATH
BSI_INDIVIDUAL_CHECKLISTS_DIR = bsi_module.INDIVIDUAL_CHECKLISTS_DIR
BSI_XML_PATH = bsi_module.XML_PATH
BSI_XLSX_PATH = bsi_module.XLSX_PATH
bsi_harvest_main = bsi_module.main
CIS_BENCHMARKS = cis_module.BENCHMARKS
CIS_MANIFEST_PATH = cis_module.MANIFEST_PATH
CIS_PDF_DIR = cis_module.PDF_DIR
CIS_SOURCES_PATH = cis_module.SOURCES_PATH
cis_harvest_main = cis_module.main
semantic_candidates_for = recommendation_mapping_module.semantic_candidates_for
semantic_concepts_for = recommendation_mapping_module.semantic_concepts_for
assert_expected_outputs_written = (
    update_guideline_module.assert_expected_outputs_written
)


def test_vendor_source_ids_and_urls_reject_local_path_inputs(tmp_path: Path) -> None:
    """Reject vendor source identifiers and URLs that could read local files."""
    expect(
        safe_vendor_source_id("microsoft-windows-11-baseline")
        == "microsoft-windows-11-baseline"
    )
    try:
        safe_vendor_source_id("../escape")
    except ValueError as error:
        expect("Unsafe vendor source id" in str(error))
    else:
        raise AssertionError("unsafe vendor source id was accepted")

    for url in ("file:///etc/passwd", "http://127.0.0.1/source.html"):
        try:
            validate_vendor_source_url(url)
        except ValueError:
            pass
        else:
            raise AssertionError(f"unsafe vendor source URL was accepted: {url}")

    try:
        vendor_download_path(tmp_path, "raw", "../../escape.html")
    except ValueError as error:
        expect("escapes output directory" in str(error))
    else:
        raise AssertionError("escaping vendor download path was accepted")


def test_exact_relution_mappings_reject_path_like_target_types() -> None:
    """Drop exact native mappings whose target type is path-like."""
    recommendation = {
        "relutionMapping": {
            "status": "exact",
            "rulesetMappings": [
                {
                    "kind": "relution-native",
                    "type": "../../escape",
                    "values": {"enabled": True},
                },
                {
                    "kind": "relution-native",
                    "type": "IOS_PASSCODE",
                    "values": {"enabled": True},
                },
            ],
        },
    }

    expect(
        importable_native_mappings(recommendation)
        == [
            {
                "kind": "relution-native",
                "type": "IOS_PASSCODE",
                "values": {"enabled": True},
            },
        ]
    )


def test_setting_bundle_writer_rejects_paths_outside_settings_root(
    tmp_path: Path,
) -> None:
    """Prevent generated settings bundles from escaping the settings root."""
    config = SourceConfig(
        source="vendor",
        label="Vendor",
        root=tmp_path,
        recommendation_catalog_path=tmp_path / "recommendations.json",
        ruleset_path=tmp_path / "ruleset.json",
        settings_catalog_path=tmp_path / "settings.json",
        baseline_path=tmp_path / "baseline.json",
        readme_path=tmp_path / "README.md",
    )

    try:
        write_settings_files(
            config,
            {
                "bundles": [
                    {
                        "importFilePath": "../escape.json",
                        "details": {"type": "IOS_PASSCODE"},
                    }
                ]
            },
        )
    except ValueError as error:
        expect("escapes expected root" in str(error))
    else:
        raise AssertionError("escaping setting bundle path was accepted")


def test_bsi_generator_smoke_discovers_required_source_files() -> None:
    """Document which BSI source files are optional/missing in the test checkout."""
    expect(callable(bsi_harvest_main))
    required_sources = {
        "kompendium_xml": BSI_XML_PATH,
        "checklist_workbook": BSI_XLSX_PATH,
        "individual_checklists": BSI_INDIVIDUAL_CHECKLISTS_DIR,
        "errata_text": BSI_ERRATA_TEXT_PATH,
        "grundschutz_plusplus_catalog": BSI_GS_PLUSPLUS_CATALOG_PATH,
        "grundschutz_plusplus_method_pdf": BSI_GS_PLUSPLUS_METHOD_PATH,
    }
    expected_root = TOOLS_DIR.parent / "example" / "bsi-references"
    expect(all(expected_root in path.parents for path in required_sources.values()))
    expect(required_sources["grundschutz_plusplus_catalog"].is_file())

    missing_sources = {
        label for label, path in required_sources.items() if not path.exists()
    }
    expect(
        missing_sources
        == {
            "kompendium_xml",
            "checklist_workbook",
            "individual_checklists",
            "errata_text",
            "grundschutz_plusplus_method_pdf",
        }
    )


def test_cis_generator_smoke_discovers_required_source_files() -> None:
    """Document that CIS metadata exists while benchmark PDFs are local-only."""
    expect(callable(cis_harvest_main))
    expect(CIS_SOURCES_PATH.is_file())
    expect(CIS_MANIFEST_PATH.is_file())
    expect(len(CIS_BENCHMARKS) > 0)
    expect(all(benchmark.path.parent == CIS_PDF_DIR for benchmark in CIS_BENCHMARKS))

    missing_pdfs = [
        benchmark.file_name
        for benchmark in CIS_BENCHMARKS
        if not benchmark.path.exists()
    ]
    expect(missing_pdfs == [benchmark.file_name for benchmark in CIS_BENCHMARKS])


def test_coverage_matrix_fails_when_required_catalog_is_missing(
    tmp_path: Path, monkeypatch: object
) -> None:
    """Fail coverage generation with present/missing catalog counts."""
    present = tmp_path / "bsi-recommendations.json"
    missing = tmp_path / "cis-recommendations.json"
    present.write_text("[]", encoding="utf8")
    monkeypatch.setitem(
        build_coverage_matrix.__globals__,
        "SOURCE_CONFIGS",
        {
            "bsi": source_config("bsi", tmp_path, present),
            "cis": source_config("cis", tmp_path, missing),
        },
    )

    try:
        build_coverage_matrix()
    except FileNotFoundError as error:
        message = str(error)
        expect("Required recommendation catalogs missing" in message)
        expect("present=1" in message)
        expect("missing=1" in message)
        expect("cis:" in message)
    else:
        raise AssertionError(
            "missing recommendation catalog did not fail coverage generation"
        )


def test_semantic_index_fails_when_required_catalog_is_missing(
    tmp_path: Path, monkeypatch: object
) -> None:
    """Fail semantic-index generation with actionable missing-catalog detail."""
    present = tmp_path / "bsi-recommendations.json"
    missing = tmp_path / "vendor-recommendations.json"
    present.write_text("[]", encoding="utf8")
    monkeypatch.setitem(
        build_semantic_index.__globals__,
        "SOURCE_CONFIGS",
        {
            "bsi": source_config("bsi", tmp_path, present),
            "vendor": source_config("vendor", tmp_path, missing),
        },
    )
    monkeypatch.setitem(
        build_semantic_index.__globals__, "build_setting_index", lambda: {}
    )

    try:
        build_semantic_index()
    except FileNotFoundError as error:
        message = str(error)
        expect("Required recommendation catalogs missing" in message)
        expect("present=1" in message)
        expect("missing=1" in message)
        expect("vendor:" in message)
    else:
        raise AssertionError(
            "missing recommendation catalog did not fail semantic index generation"
        )


def test_unified_analysis_warns_when_semantic_index_is_missing(
    tmp_path: Path, monkeypatch: object, capsys: object
) -> None:
    """Warn instead of fabricating unified analysis when the semantic index is absent."""
    monkeypatch.setitem(
        build_unified_recommendation_analysis.__globals__,
        "SEMANTIC_INDEX_PATH",
        tmp_path / "missing-index.json",
    )

    build_unified_recommendation_analysis()

    expect("WARNING: skipping unified analysis" in capsys.readouterr().err)


def test_source_change_rows_fail_when_required_manifest_is_missing(
    tmp_path: Path, monkeypatch: object
) -> None:
    """Fail source-change generation when declared source manifests are absent."""
    present = tmp_path / "bsi-manifest.json"
    missing = tmp_path / "cis-manifest.json"
    present.write_text("[]", encoding="utf8")
    monkeypatch.setitem(
        build_source_change_rows.__globals__,
        "source_manifest_paths",
        lambda: {"bsi": present, "cis": missing},
    )
    monkeypatch.setitem(
        build_source_change_rows.__globals__, "previous_source_change_rows", lambda: []
    )

    try:
        build_source_change_rows({})
    except FileNotFoundError as error:
        message = str(error)
        expect("Required source manifests missing" in message)
        expect("present=1" in message)
        expect("missing=1" in message)
        expect("cis:" in message)
    else:
        raise AssertionError(
            "missing source manifest did not fail source-change generation"
        )


def test_source_change_rows_fail_when_required_manifest_is_malformed(
    tmp_path: Path, monkeypatch: object
) -> None:
    """Fail source-change generation when a manifest is not a list."""
    malformed = tmp_path / "manifest.json"
    malformed.write_text("{}", encoding="utf8")
    monkeypatch.setitem(
        build_source_change_rows.__globals__,
        "source_manifest_paths",
        lambda: {"bsi": malformed},
    )
    monkeypatch.setitem(
        build_source_change_rows.__globals__, "previous_source_change_rows", lambda: []
    )

    try:
        build_source_change_rows({})
    except ValueError as error:
        expect("Required source manifest malformed" in str(error))
        expect("expected list" in str(error))
    else:
        raise AssertionError(
            "malformed source manifest did not fail source-change generation"
        )


def test_source_text_hash_raises_when_declared_text_file_is_missing(
    tmp_path: Path, monkeypatch: object
) -> None:
    """Fail hash generation when a manifest-declared text file is missing."""
    monkeypatch.setitem(source_text_hash.__globals__, "REPO_ROOT", tmp_path)

    try:
        source_text_hash({"textPath": "downloads/text/missing.txt"})
    except FileNotFoundError as error:
        expect("source_text_hash: file not found" in str(error))
    else:
        raise AssertionError("missing declared source text file did not fail")


def test_update_guideline_mappings_asserts_expected_outputs(tmp_path: Path) -> None:
    """Report every missing expected update artifact after generation."""
    present = tmp_path / "present.json"
    missing = tmp_path / "missing.json"
    present.write_text("{}", encoding="utf8")

    try:
        assert_expected_outputs_written((present, missing))
    except AssertionError as error:
        expect("Expected update artifact(s) not written" in str(error))
        expect(str(missing) in str(error))
    else:
        raise AssertionError("missing update artifact did not fail")


def test_validate_manual_mapping_promotions_missing_file_has_no_create_side_effect(
    tmp_path: Path,
) -> None:
    """Validate that missing promotion ledgers fail without creating files."""
    promotions_path = tmp_path / "manual-mapping-promotions.json"

    try:
        validate_manual_mapping_promotions([], promotions_path)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError(
            "missing manual mapping promotions file did not fail validation"
        )

    expect(not promotions_path.exists())


def test_ensure_manual_mapping_promotions_file_creates_empty_ledger(
    tmp_path: Path,
) -> None:
    """Create a valid empty manual-promotion ledger for later validation."""
    promotions_path = tmp_path / "manual-mapping-promotions.json"

    ensure_manual_mapping_promotions_file(promotions_path)

    expect(not validate_manual_mapping_promotions([], promotions_path))


def source_config(
    source: str, root: Path, recommendation_catalog_path: Path
) -> SourceConfig:
    """Build a temporary source config for generated-artifact tests."""
    return SourceConfig(
        source=source,
        label=source.upper(),
        root=root,
        recommendation_catalog_path=recommendation_catalog_path,
        ruleset_path=root / f"{source}-ruleset.json",
        settings_catalog_path=root / f"{source}-settings.json",
        baseline_path=root / f"{source}-baseline.json",
        readme_path=root / "README.md",
    )


def test_normalize_recommendations_reports_dropped_optional_mapping_evidence() -> None:
    """Preserve valid optional mapping evidence and report dropped malformed items."""
    normalized = normalize_recommendations(
        "vendor",
        [
            {
                "id": "candidate-evidence",
                "platform": "IOS",
                "title": "Candidate evidence",
                "relutionMapping": {
                    "status": "partial",
                    "candidates": [
                        {"kind": "relution-native", "target": "IOS_PASSCODE"},
                        "not-a-candidate",
                    ],
                    "rulesetMappings": ["not-a-mapping"],
                },
                "fallbackTranslations": [
                    {"kind": "helper", "text": "Use helper"},
                    "not-a-helper",
                ],
            },
            {
                "id": "malformed-fallback",
                "platform": "IOS",
                "title": "Malformed fallback",
                "relutionMapping": {"status": "none"},
                "fallbackTranslations": "not-a-list",
            },
        ],
    )

    first_fields = diagnostics_by_field(normalized[0]["normalizationDiagnostics"])
    expect(first_fields["relutionMapping.candidates"]["droppedCount"] == 1)
    expect(first_fields["relutionMapping.rulesetMappings"]["droppedCount"] == 1)
    expect(first_fields["fallbackTranslations"]["droppedCount"] == 1)
    expect(
        first_fields["relutionMapping.candidates"]["recommendationId"]
        == "candidate-evidence"
    )
    expect(
        normalized[0]["relutionMapping"]["candidates"]
        == [{"kind": "relution-native", "target": "IOS_PASSCODE"}]
    )
    expect(
        normalized[0]["fallbackTranslations"]
        == [{"kind": "helper", "text": "Use helper"}]
    )

    second_fields = diagnostics_by_field(normalized[1]["normalizationDiagnostics"])
    expect(second_fields["fallbackTranslations"]["droppedCount"] == 1)
    expect(
        second_fields["fallbackTranslations"]["recommendationId"]
        == "malformed-fallback"
    )
    expect(normalized[1]["fallbackTranslations"] == [])


def test_relution_mapping_snapshot_reports_dropped_ranked_candidate_evidence() -> None:
    """Report malformed ranked-candidate review evidence in mapping snapshots."""
    snapshot = relution_mapping_snapshot(
        {
            "_source": "vendor",
            "_globalId": "vendor:candidate-snapshot",
            "id": "candidate-snapshot",
            "platform": "IOS",
            "title": "Candidate snapshot",
            "reason": "Candidate evidence should stay attributable.",
            "relutionMapping": {"status": "partial"},
            "implementation": {"category": "relution-partial"},
        },
        [],
        {
            "rankedCandidates": [
                {
                    "kind": "relution-native",
                    "target": "IOS_PASSCODE",
                    "fieldPaths": ["minLength", 4],
                    "referenceMappingIds": ["ref-1", None],
                    "semanticConceptId": "passcode_authentication",
                },
                "not-a-candidate",
            ],
        },
    )

    expect(
        snapshot["candidateMappings"]
        == [
            {
                "kind": "relution-native",
                "target": "IOS_PASSCODE",
                "fieldPaths": ["minLength"],
                "referenceMappingIds": ["ref-1"],
                "semanticConceptId": "passcode_authentication",
            }
        ]
    )
    fields = diagnostics_by_field(snapshot["normalizationDiagnostics"])
    expect(fields["review.rankedCandidates"]["droppedCount"] == 1)
    expect(fields["candidateMappings[0].fieldPaths"]["droppedCount"] == 1)
    expect(fields["candidateMappings[0].referenceMappingIds"]["droppedCount"] == 1)
    expect(
        fields["review.rankedCandidates"]["recommendationId"] == "candidate-snapshot"
    )


def diagnostics_by_field(diagnostics: object) -> dict[str, dict[str, object]]:
    """Index normalization diagnostics by field for focused assertions."""
    expect(isinstance(diagnostics, list))
    return {
        str(entry["field"]): entry for entry in diagnostics if isinstance(entry, dict)
    }


def test_normalize_recommendations_without_provider_does_not_apply_promotions() -> None:
    """Leave recommendations unpromoted when no manual-promotion provider is given."""
    normalized = normalize_recommendations("bsi", [promotable_recommendation()])

    expect(normalized[0]["relutionMapping"]["status"] == "none")
    expect(normalized[0]["relutionMapping"]["rulesetMappings"] == [])


def test_normalize_recommendations_applies_explicit_promotions() -> None:
    """Apply validated manual promotions as exact importable mappings."""
    mapping = {
        "kind": "relution-native",
        "type": "IOS_PASSCODE",
        "values": {"enabled": True},
    }
    normalized = normalize_recommendations(
        "bsi",
        [promotable_recommendation()],
        get_promotions=lambda source: {"rec-1": [mapping]} if source == "bsi" else {},
    )

    relution_mapping = normalized[0]["relutionMapping"]
    expect(relution_mapping["status"] == "exact")
    expect(relution_mapping["mergeableInImportableRuleset"] is True)
    expect(relution_mapping["rulesetMappings"] == [mapping])
    expect(
        "Exact mapping promoted by validated manual mapping ledger."
        in relution_mapping["notes"]
    )


def promotable_recommendation() -> dict[str, object]:
    """Return the minimal recommendation shape used by promotion tests."""
    return {
        "id": "rec-1",
        "platform": "IOS",
        "title": "Require passcode",
        "relutionMapping": {"status": "none"},
    }


def test_german_bsi_passcode_wording_maps_to_canonical_concept() -> None:
    """Map German BSI passcode wording to the canonical authentication concept."""
    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence(
            (
                "Benutzende MUESSEN eine Bildschirmsperre verwenden und sich mit einem sicheren "
                "Kennwort authentisieren."
            )
        ),
    )

    expect("passcode_authentication" in {concept["id"] for concept in concepts})
    candidates = semantic_candidates_for("WINDOWS", concepts)
    expect(any(candidate["target"] == "WINDOWS_PASSCODE" for candidate in candidates))


def test_english_vendor_wording_maps_to_same_concept() -> None:
    """Keep English and German passcode wording on the same semantic concept."""
    german_ids = semantic_concept_ids(
        "IOS", "Der Geraetecode muss automatisch nach Inaktivitaet gesperrt werden."
    )
    english_ids = semantic_concept_ids(
        "IOS", "Require a passcode and automatically lock the device after idle time."
    )

    expect("passcode_authentication" in german_ids)
    expect("passcode_authentication" in english_ids)
    expect(german_ids.intersection(english_ids))


def test_camera_microphone_phrase_is_not_camera_only_exact_semantics() -> None:
    """Avoid treating combined camera/microphone wording as camera-only exact intent."""
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence(
            "Die unautorisierte Nutzung von Rechnermikrofonen und Kameras muss verhindert werden."
        ),
    )

    expect("camera_microphone" in {concept["id"] for concept in concepts})
    expect("camera" not in {concept["id"] for concept in concepts})
    candidates = semantic_candidates_for("ANDROID_ENTERPRISE", concepts)
    camera_candidates = [
        candidate
        for candidate in candidates
        if candidate["target"] == "ANDROID_ENTERPRISE_DISABLE_CAMERAS"
    ]
    expect(camera_candidates)
    expect(
        all(
            candidate["match"]["valueCompatibility"] == "concept-candidate"
            for candidate in camera_candidates
        )
    )


def test_german_policy_mdm_and_admin_wording_maps_to_management_support_concepts() -> (
    None
):
    """Map German MDM/admin governance wording to support candidates only."""
    concepts = semantic_concepts_for(
        "WINDOWS",
        evidence(
            "Lokale Sicherheitsrichtlinien muessen ueber ein Managementsystem verwaltet werden; "
            "Administrationsverfahren und Konfigurationsaenderungen sind zu dokumentieren.",
        ),
    )

    ids = {concept["id"] for concept in concepts}
    expect(
        {
            "policy_governance",
            "administration_procedures",
            "reference_configuration_rollout",
        }
        <= ids
    )

    candidates = semantic_candidates_for("WINDOWS", concepts)
    expect(
        any(
            candidate["target"] == "WINDOWS_LOCAL_DEVICE_SECURITY"
            for candidate in candidates
        )
    )
    expect(any(candidate["target"] == "WINDOWS_CUSTOM_CSP" for candidate in candidates))
    expect(any(candidate["target"] == "WINDOWS_COMPANION" for candidate in candidates))
    expect(
        all(
            candidate["match"]["valueCompatibility"] == "concept-candidate"
            for candidate in candidates
        )
    )


def test_hardened_device_wording_maps_to_security_candidates_without_exact_remediation() -> (
    None
):
    """Map hardened-device procurement wording to non-exact security candidates."""
    concepts = semantic_concepts_for(
        "ANDROID_ENTERPRISE",
        evidence(
            (
                "Institutionen SOLLTEN besonders abgesicherte mobile Endgeraete mit geeigneter "
                "sicherer Hardware einsetzen."
            )
        ),
    )

    expect("hardened_device_procurement" in {concept["id"] for concept in concepts})
    candidates = semantic_candidates_for("ANDROID_ENTERPRISE", concepts)
    expect(
        any(
            candidate["target"] == "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES"
            for candidate in candidates
        )
    )
    expect(
        any(
            candidate["target"] == "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT"
            for candidate in candidates
        )
    )
    expect(
        all(
            candidate["match"]["valueCompatibility"] == "concept-candidate"
            for candidate in candidates
        )
    )

BSI_MANDATORY_LEDGER_PATH = REPO_ROOT / "example" / "bsi-references" / "bsi-mandatory-mapping-ledger.json"
MANDATORY_MODAL_RE = re.compile(r"\b(MUSS|MÜSSEN|DARF|DÜRFEN)\b", re.IGNORECASE)


def write_bsi_mandatory_mapping_ledger(recommendations: list[dict[str, Any]], settings_catalog: dict[str, Any]) -> None:
    rows = [bsi_mandatory_ledger_row(entry) for entry in recommendations if is_bsi_mandatory_basis(entry)]
    summary = {
        "totalMandatoryBasisRequirements": len(rows),
        "byPlatform": count_ledger_values(rows, "platform"),
        "bySolutionStatus": count_ledger_values(rows, "solutionStatus"),
        "byMappingStatus": count_ledger_values(rows, "mappingStatus"),
        "settingBundleCount": len(settings_catalog.get("bundles", [])),
    }
    write_json(
        BSI_MANDATORY_LEDGER_PATH,
        {
            "version": 1,
            "name": "BSI Mandatory Basis Relution Mapping Ledger",
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "scope": {
                "source": "BSI IT-Grundschutz Kompendium Edition 2023",
                "requirements": "Active Basis requirements containing mandatory modal verbs.",
                "target": "Relution-managed Windows, macOS, iOS, and Android Enterprise client configuration.",
            },
            "summary": summary,
            "rows": rows,
        },
    )


def is_bsi_mandatory_basis(recommendation: dict[str, Any]) -> bool:
    return (
        recommendation.get("status") == "active"
        and recommendation.get("protectionLevel") == "B"
        and MANDATORY_MODAL_RE.search(str(recommendation.get("requirementText", ""))) is not None
    )


def bsi_mandatory_ledger_row(recommendation: dict[str, Any]) -> dict[str, Any]:
    mapping = recommendation.get("relutionMapping", {})
    implementation = recommendation.get("implementation", {})
    exact_targets = [mapping_target(entry) for entry in exact_mappings(recommendation)]
    exact_target_values = [
        {
            "kind": entry.get("kind"),
            "target": mapping_target(entry),
            "values": entry.get("values", {}),
        }
        for entry in exact_mappings(recommendation)
    ]
    parameter_requirements = list(mapping.get("parameterRequirements", [])) if isinstance(mapping.get("parameterRequirements"), list) else []
    process_support = list(mapping.get("processSupport", [])) if isinstance(mapping.get("processSupport"), list) else []
    candidate_targets = unique_preserving_order(
        str(candidate.get("target"))
        for candidate in mapping.get("candidates", [])
        if isinstance(candidate, dict) and isinstance(candidate.get("target"), str)
    )
    return {
        "id": recommendation["id"],
        "platform": recommendation["platform"],
        "moduleId": recommendation["moduleId"],
        "requirementId": recommendation["requirementId"],
        "title": recommendation["title"],
        "protectionLevel": recommendation["protectionLevel"],
        "mandatoryClauses": mandatory_clauses(str(recommendation.get("requirementText", ""))),
        "mappingStatus": mapping.get("status", "none"),
        "solutionStatus": bsi_solution_status(mapping, implementation),
        "exactTargets": [target for target in exact_targets if target is not None],
        "exactTargetValues": exact_target_values,
        "candidateTargets": candidate_targets,
        "parameterRequirements": parameter_requirements,
        "processSupport": process_support,
        "blockingReasons": list(implementation.get("blockingReasons", [])),
        "notes": list(mapping.get("notes", [])),
    }


def bsi_solution_status(mapping: dict[str, Any], implementation: dict[str, Any]) -> str:
    if mapping.get("status") == "exact":
        return "exact"
    if isinstance(mapping.get("parameterRequirements"), list) and mapping["parameterRequirements"]:
        return "parameterized"
    if isinstance(mapping.get("processSupport"), list) and mapping["processSupport"]:
        return "process-supported"
    if implementation.get("category") == "gap":
        return "gap"
    if mapping.get("candidates"):
        return "partial"
    return "gap"


def mandatory_clauses(text: str) -> list[str]:
    clauses: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        normalized = " ".join(sentence.split())
        if normalized and MANDATORY_MODAL_RE.search(normalized):
            clauses.append(normalized)
    return clauses or ([" ".join(text.split())] if text.strip() else [])


def count_ledger_values(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key, ""))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))

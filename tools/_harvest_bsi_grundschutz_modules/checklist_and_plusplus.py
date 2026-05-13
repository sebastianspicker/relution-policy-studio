

def parse_individual_checklist_workbooks(directory: Path) -> dict[str, dict[str, Any]]:
    checklists: dict[str, dict[str, Any]] = {}
    for path in sorted(directory.glob("Checkliste_*.xlsx")):
        rows_by_sheet = read_xlsx_rows(path)
        for sheet_name, rows in rows_by_sheet.items():
            module_id = normalize_space(sheet_name)
            if not module_id:
                continue
            module_title = ""
            edition = ""
            header_index = -1
            for index, row in enumerate(rows):
                marker = normalize_space(str(row.get(2, "")))
                if marker.startswith("Baustein:"):
                    module_title = marker.removeprefix("Baustein:").strip()
                    continue
                if marker.startswith("Kompendium:"):
                    edition = marker.removeprefix("Kompendium:").strip()
                    continue
                if marker == "ID-Anforderung":
                    header_index = index
                    break
            requirements: dict[str, dict[str, str]] = {}
            if header_index >= 0:
                for row in rows[header_index + 1:]:
                    requirement_id = normalize_space(str(row.get(2, "")))
                    if not requirement_id.startswith(f"{module_id}.A"):
                        continue
                    requirements[requirement_id] = {
                        "requirementId": requirement_id,
                        "title": normalize_space(str(row.get(3, ""))),
                        "text": normalize_space(str(row.get(4, ""))),
                        "type": normalize_space(str(row.get(5, ""))),
                    }
            checklists[module_id] = {
                "moduleId": module_id,
                "moduleTitle": module_title or module_id,
                "edition": edition,
                "sourcePath": relative_repo_path(path),
                "sheetName": sheet_name,
                "requirements": requirements,
            }
    return checklists


def build_checklist_comparison(module_catalog: dict[str, dict[str, Any]], checklists: dict[str, dict[str, Any]]) -> dict[str, Any]:
    platform_module_ids = {module.module_id for platform in PLATFORM_TARGETS for module in platform.modules}
    workbook_rows: list[dict[str, Any]] = []
    compared_modules: list[dict[str, Any]] = []
    for module_id, checklist in sorted(checklists.items()):
        requirements = checklist["requirements"]
        workbook_rows.append(
            {
                "moduleId": module_id,
                "moduleTitle": checklist["moduleTitle"],
                "sourcePath": checklist["sourcePath"],
                "requirementCount": len(requirements),
            }
        )
        if module_id not in module_catalog:
            continue
        docbook_requirements = module_catalog[module_id]["requirements"]
        missing_in_checklist = sorted(set(docbook_requirements) - set(requirements))
        missing_in_docbook = sorted(set(requirements) - set(docbook_requirements))
        text_differences = []
        for requirement_id in sorted(set(docbook_requirements) & set(requirements)):
            docbook = normalize_space(str(docbook_requirements[requirement_id].get("requirementText", "")))
            checklist_text = normalize_space(str(requirements[requirement_id].get("text", "")))
            if docbook != checklist_text:
                text_differences.append(
                    {
                        "requirementId": requirement_id,
                        "docbookText": shorten(docbook, 220),
                        "checklistText": shorten(checklist_text, 220),
                    }
                )
        compared_modules.append(
            {
                "moduleId": module_id,
                "moduleTitle": checklist["moduleTitle"],
                "sourcePath": checklist["sourcePath"],
                "docbookRequirementCount": len(docbook_requirements),
                "checklistRequirementCount": len(requirements),
                "missingInChecklist": missing_in_checklist,
                "missingInDocbook": missing_in_docbook,
                "textDifferenceCount": len(text_differences),
                "sampleTextDifferences": text_differences[:5],
                "usedForPlatformPolicies": module_id in platform_module_ids,
            }
        )
    policy_relevant = build_policy_relevant_checklist_items(checklists)
    return {
        "version": 1,
        "name": "BSI IT-Grundschutz Kompendium Individual Checklist Comparison",
        "sourceDirectory": relative_repo_path(INDIVIDUAL_CHECKLISTS_DIR),
        "consolidatedThreatWorkbookPath": relative_repo_path(XLSX_PATH),
        "individualWorkbookCount": len(checklists),
        "individualRequirementCount": sum(len(entry["requirements"]) for entry in checklists.values()),
        "workbooks": workbook_rows,
        "comparedPlatformModules": compared_modules,
        "policyRelevantRequirementCount": len(policy_relevant),
        "policyRelevantRequirements": policy_relevant,
    }


def build_policy_relevant_checklist_items(checklists: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for module_id, checklist in sorted(checklists.items()):
        if not module_id.startswith(("APP.", "OPS.", "SYS.")):
            continue
        for requirement_id, requirement in sorted(checklist["requirements"].items()):
            text = f'{requirement.get("title", "")} {requirement.get("text", "")}'
            matches = matching_plusplus_rules(text)
            if not matches:
                continue
            items.append(
                {
                    "moduleId": module_id,
                    "moduleTitle": checklist["moduleTitle"],
                    "requirementId": requirement_id,
                    "title": requirement["title"],
                    "text": requirement["text"],
                    "type": requirement["type"],
                    "sourcePath": checklist["sourcePath"],
                    "matchedReasons": unique_preserving_order([match["reason"] for match in matches]),
                    "relatedGrundschutzPlusPlusControlIds": unique_preserving_order(
                        control_id for match in matches for control_id in match["controlIds"]
                    ),
                }
            )
    return items


def read_xlsx_rows(path: Path) -> dict[str, list[dict[int, str]]]:
    with zipfile.ZipFile(path) as archive:
        shared_strings = parse_shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(f"{{{PACKAGE_RELATIONSHIP_NS}}}Relationship")
        }
        rows_by_sheet: dict[str, list[dict[int, str]]] = {}
        for sheet in workbook.findall("x:sheets/x:sheet", SHEET_NS):
            name = sheet.attrib["name"]
            relation_id = sheet.attrib[f"{{{RELATIONSHIP_NS}}}id"]
            target = relationship_targets[relation_id].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            rows_by_sheet[name] = parse_sheet_rows(archive, target, shared_strings)
        return rows_by_sheet


def parse_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return [normalize_space("".join(string.itertext())) for string in shared_root.findall("x:si", SHEET_NS)]


def parse_sheet_rows(archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[dict[int, str]]:
    sheet_root = ET.fromstring(archive.read(sheet_path))
    rows: list[dict[int, str]] = []
    for row in sheet_root.findall(".//x:sheetData/x:row", SHEET_NS):
        values: dict[int, str] = {}
        for cell in row.findall("x:c", SHEET_NS):
            ref = cell.attrib.get("r", "")
            column_match = CELL_REF_RE.match(ref)
            if column_match is None:
                continue
            column_index = excel_column_to_index(column_match.group("column"))
            values[column_index] = read_cell_value(cell, shared_strings)
        rows.append(values)
    return rows


def read_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value_text = cell.findtext("x:v", default="", namespaces=SHEET_NS)
        if value_text.isdigit():
            return shared_strings[int(value_text)]
        return normalize_space(value_text)
    if cell_type == "inlineStr":
        inline = cell.find("x:is", SHEET_NS)
        return normalize_space("".join(inline.itertext()) if inline is not None else "")
    return normalize_space(cell.findtext("x:v", default="", namespaces=SHEET_NS))


def excel_column_to_index(column: str) -> int:
    index = 0
    for character in column:
        index = index * 26 + (ord(character) - 64)
    return index


def build_errata_map(errata_text: str, requirement_ids: set[str]) -> dict[str, list[dict[str, str]]]:
    normalized = normalize_space(errata_text)
    errata: dict[str, list[dict[str, str]]] = {}
    for requirement_id in sorted(requirement_ids):
        matches = list(re.finditer(re.escape(requirement_id), normalized))
        if not matches:
            continue
        excerpts: list[dict[str, str]] = []
        seen = set()
        for match in matches:
            start = max(0, match.start() - 320)
            end = min(len(normalized), match.end() + 520)
            excerpt = normalized[start:end].strip()
            if excerpt in seen:
                continue
            seen.add(excerpt)
            excerpts.append({"sourceId": "it-grundschutz-errata-2023", "excerpt": excerpt})
        errata[requirement_id] = excerpts
    return errata


def parse_grundschutz_plusplus_catalog(path: Path) -> dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf8"))
    catalog = raw["catalog"]
    controls = parse_plusplus_controls(catalog)
    controls_by_id = {control["id"]: control for control in controls}
    practice_groups = parse_plusplus_practice_groups(catalog.get("groups", []), controls)
    systematics = {
        "version": 1,
        "name": "BSI Grundschutz++ Systematics",
        "catalog": {
            "title": catalog.get("metadata", {}).get("title"),
            "version": catalog.get("metadata", {}).get("version"),
            "lastModified": catalog.get("metadata", {}).get("last-modified"),
            "oscalVersion": catalog.get("metadata", {}).get("oscal-version"),
            "sourcePath": relative_repo_path(path),
            "remarks": catalog.get("metadata", {}).get("remarks"),
        },
        "methodology": GS_PLUSPLUS_METHOD_CONTEXT,
        "counts": {
            "controls": len(controls),
            "practiceGroups": len(practice_groups),
            "bySecurityLevel": count_values(control.get("securityLevel") for control in controls),
            "byModalVerb": count_values(control.get("modalVerb") for control in controls),
            "byEffortLevel": count_values(control.get("effortLevel") for control in controls),
        },
        "practiceGroups": practice_groups,
        "policyRelevantControlIds": sorted(policy_relevant_plusplus_control_ids(controls_by_id)),
        "controls": controls,
    }
    return {"systematics": systematics, "controlsById": controls_by_id}


def parse_plusplus_controls(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []

    def walk_group(group: dict[str, Any], path: tuple[dict[str, str], ...]) -> None:
        group_entry = {"id": str(group.get("id", "")), "title": str(group.get("title", ""))}
        next_path = (*path, group_entry)
        for control in group.get("controls", []):
            if not isinstance(control, dict):
                continue
            controls.append(parse_plusplus_control(control, next_path))
        for child in group.get("groups", []):
            if isinstance(child, dict):
                walk_group(child, next_path)

    for group in catalog.get("groups", []):
        if isinstance(group, dict):
            walk_group(group, ())
    controls.sort(key=lambda entry: natural_control_sort_key(entry["id"]))
    return controls


def parse_plusplus_control(control: dict[str, Any], group_path: tuple[dict[str, str], ...]) -> dict[str, Any]:
    statement = first_part(control, "statement")
    guidance = first_part(control, "guidance")
    statement_props = statement.get("props", []) if isinstance(statement, dict) else []
    control_props = control.get("props", [])
    top_group = group_path[0] if group_path else {"id": "", "title": ""}
    leaf_group = group_path[-1] if group_path else {"id": "", "title": ""}
    target_categories = split_values(prop_values(statement_props, "target_object_categories"))
    return {
        "id": str(control.get("id", "")),
        "title": str(control.get("title", "")),
        "class": control.get("class"),
        "practiceId": top_group["id"],
        "practiceTitle": top_group["title"],
        "controlGroupId": leaf_group["id"],
        "controlGroupTitle": leaf_group["title"],
        "securityLevel": prop_value(control_props, "sec_level"),
        "effortLevel": prop_value(control_props, "effort_level"),
        "modalVerb": prop_value(statement_props, "modal_verb"),
        "actionWord": prop_value(statement_props, "action_word"),
        "result": prop_value(statement_props, "result"),
        "resultSpecification": prop_value(statement_props, "result_specification"),
        "targetObjectCategories": target_categories,
        "documentation": prop_values(statement_props, "documentation"),
        "tags": split_values(prop_values(control_props, "tags")),
        "parameters": [
            {
                "id": str(parameter.get("id", "")),
                "label": str(parameter.get("label", "")),
                "values": [str(value) for value in parameter.get("values", []) if isinstance(value, str)],
            }
            for parameter in control.get("params", [])
            if isinstance(parameter, dict)
        ],
        "statement": normalize_space(str(statement.get("prose", ""))) if isinstance(statement, dict) else "",
        "guidance": normalize_space(str(guidance.get("prose", ""))) if isinstance(guidance, dict) else "",
    }


def parse_plusplus_practice_groups(groups: list[Any], controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    controls_by_practice: dict[str, list[dict[str, Any]]] = {}
    for control in controls:
        controls_by_practice.setdefault(str(control["practiceId"]), []).append(control)
    parsed: list[dict[str, Any]] = []
    for group in groups:
        if not isinstance(group, dict):
            continue
        practice_id = str(group.get("id", ""))
        child_groups = []
        for child in group.get("groups", []):
            if not isinstance(child, dict):
                continue
            child_id = str(child.get("id", ""))
            child_groups.append(
                {
                    "id": child_id,
                    "title": str(child.get("title", "")),
                    "controlCount": sum(1 for control in controls_by_practice.get(practice_id, []) if control.get("controlGroupId") == child_id),
                }
            )
        parsed.append(
            {
                "id": practice_id,
                "title": str(group.get("title", "")),
                "remarks": prop_remark(group.get("props", []), "label"),
                "controlCount": len(controls_by_practice.get(practice_id, [])),
                "groups": child_groups,
            }
        )
    return parsed


def policy_relevant_plusplus_control_ids(controls_by_id: dict[str, dict[str, Any]]) -> set[str]:
    control_ids = {control_id for rule in GS_PLUSPLUS_RELATED_CONTROL_RULES for control_id in rule["controlIds"]}
    return {control_id for control_id in control_ids if control_id in controls_by_id}


def plusplus_context_for(
    platform: str,
    requirement: dict[str, Any],
    plusplus: dict[str, Any],
) -> dict[str, Any]:
    controls_by_id = plusplus["controlsById"]
    text = f'{requirement.get("title", "")} {requirement.get("category", "")} {requirement.get("requirementText", "")}'
    matched_rules = matching_plusplus_rules(text)
    related_controls = []
    for rule in matched_rules:
        for control_id in rule["controlIds"]:
            control = controls_by_id.get(control_id)
            if control is not None:
                related_controls.append(slim_plusplus_control(control, rule["reason"]))
    if not related_controls:
        related_controls = lexical_plusplus_controls(text, controls_by_id)
    return {
        "methodDocument": GS_PLUSPLUS_METHOD_CONTEXT["documentTitle"],
        "methodVersion": GS_PLUSPLUS_METHOD_CONTEXT["documentVersion"],
        "catalogVersion": plusplus["systematics"]["catalog"]["version"],
        "policyEditorRole": "realization-monitoring-context",
        "processSteps": [
            {"step": 2, "name": "Anforderungsanalyse", "pdcaPhase": "Plan"},
            {"step": 3, "name": "Realisierung", "pdcaPhase": "Do"},
            {"step": 4, "name": "Überwachung", "pdcaPhase": "Check"},
        ],
        "platformTargetObjectCategories": list(PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES.get(platform, ())),
        "relatedControls": merge_plusplus_controls(related_controls)[:5],
        "notes": [
            "GS++ controls enrich policy context and comparison only; they do not create exact Relution mappings without concrete setting evidence.",
            "Local asset scope, target-object-category selection, parameter values, ownership, and risk exceptions remain institution decisions.",
        ],
    }


def checklist_context_for(
    module_id: str,
    requirement_id: str,
    requirement: dict[str, Any],
    individual_checklists: dict[str, dict[str, Any]],
    policy_relevant_requirements: list[dict[str, Any]],
) -> dict[str, Any]:
    checklist = individual_checklists.get(module_id)
    checklist_requirement = checklist.get("requirements", {}).get(requirement_id) if checklist else None
    related_items = related_checklist_items_for(requirement, policy_relevant_requirements)
    context: dict[str, Any] = {
        "individualChecklistSourcePath": checklist.get("sourcePath") if checklist else None,
        "individualChecklistRequirementType": checklist_requirement.get("type") if checklist_requirement else None,
        "individualChecklistMatchesDocBook": None,
        "differences": [],
        "relatedChecklistItems": related_items,
    }
    if checklist_requirement is not None:
        docbook_text = normalize_space(str(requirement.get("requirementText", "")))
        checklist_text = normalize_space(str(checklist_requirement.get("text", "")))
        differences = []
        if normalize_space(str(requirement.get("title", ""))) != normalize_space(str(checklist_requirement.get("title", ""))):
            differences.append("title")
        if docbook_text != checklist_text:
            differences.append("text")
        context["individualChecklistMatchesDocBook"] = len(differences) == 0
        context["differences"] = differences
        context["individualChecklistTitle"] = checklist_requirement.get("title")
        context["individualChecklistText"] = checklist_text
    return context


def semantic_evidence_sources_for(
    requirement: dict[str, Any],
    checklist_context: dict[str, Any],
    plusplus_context: dict[str, Any],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = [
        {
            "source": "bsi-title",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("title", "")),
            "confidence": 0.9,
        },
        {
            "source": "bsi-requirement",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("requirementText", "")),
            "confidence": 0.78,
        },
        {
            "source": "bsi-category",
            "sourceId": str(requirement.get("requirementId", "")),
            "text": str(requirement.get("category", "")),
            "confidence": 0.58,
        },
    ]
    checklist_text = checklist_context.get("individualChecklistText")
    if isinstance(checklist_text, str) and checklist_text:
        sources.append(
            {
                "source": "kompendium-checklist",
                "sourceId": str(requirement.get("requirementId", "")),
                "text": checklist_text,
                "confidence": 0.74,
            }
        )
    for item in checklist_context.get("relatedChecklistItems", []):
        if not isinstance(item, dict):
            continue
        sources.append(
            {
                "source": "related-kompendium-checklist",
                "sourceId": str(item.get("requirementId", "")),
                "text": f'{item.get("title", "")} {item.get("text", "")}',
                "confidence": 0.62,
            }
        )
    for control in plusplus_context.get("relatedControls", []):
        if not isinstance(control, dict):
            continue
        sources.append(
            {
                "source": "grundschutz-plusplus-control",
                "sourceId": str(control.get("id", "")),
                "gsControlId": str(control.get("id", "")),
                "modalVerb": str(control.get("modalVerb", "")),
                "securityLevel": str(control.get("securityLevel", "")),
                "text": " ".join(
                    str(part)
                    for part in (
                        control.get("title", ""),
                        control.get("statement", ""),
                        control.get("matchReason", ""),
                        " ".join(str(tag) for tag in control.get("tags", []) if isinstance(tag, str)),
                    )
                    if part
                ),
                "confidence": 0.7,
            }
        )
    return sources


def related_checklist_items_for(requirement: dict[str, Any], policy_relevant_requirements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    text = f'{requirement.get("title", "")} {requirement.get("category", "")} {requirement.get("requirementText", "")}'
    matched_reasons = {match["reason"] for match in matching_plusplus_rules(text)}
    if not matched_reasons:
        return []
    related = []
    current_id = str(requirement.get("requirementId", ""))
    for item in policy_relevant_requirements:
        if item["requirementId"] == current_id:
            continue
        if not matched_reasons.intersection(item["matchedReasons"]):
            continue
        related.append(
            {
                "moduleId": item["moduleId"],
                "moduleTitle": item["moduleTitle"],
                "requirementId": item["requirementId"],
                "title": item["title"],
                "type": item["type"],
                "sourcePath": item["sourcePath"],
                "matchedReasons": item["matchedReasons"],
                "relatedGrundschutzPlusPlusControlIds": item["relatedGrundschutzPlusPlusControlIds"],
                "text": shorten(item["text"], 500),
            }
        )
    related.sort(key=lambda entry: (entry["moduleId"], entry["requirementId"]))
    return related[:5]


def matching_plusplus_rules(text: str) -> list[dict[str, Any]]:
    normalized = normalize_for_match(text)
    matches = []
    for rule in GS_PLUSPLUS_RELATED_CONTROL_RULES:
        if any(normalize_for_match(term) in normalized for term in rule["terms"]):
            matches.append(rule)
    return matches


def lexical_plusplus_controls(text: str, controls_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    tokens = token_set(text)
    if not tokens:
        return []
    scored = []
    for control in controls_by_id.values():
        if control.get("practiceId") not in {"ASST", "ARCH", "BER", "DET", "KONF", "NOT", "TEST"}:
            continue
        control_tokens = token_set(f'{control.get("title", "")} {control.get("statement", "")} {control.get("result", "")}')
        overlap = tokens.intersection(control_tokens)
        if len(overlap) < 2 and not any(len(token) >= 9 for token in overlap):
            continue
        scored.append((len(overlap), str(control.get("id", "")), control, sorted(overlap)))
    scored.sort(key=lambda entry: (-entry[0], natural_control_sort_key(entry[1])))
    return [slim_plusplus_control(control, f"lexical overlap: {', '.join(overlap[:4])}") for _, _, control, overlap in scored[:3]]


def slim_plusplus_control(control: dict[str, Any], match_reason: str) -> dict[str, Any]:
    return {
        "id": control["id"],
        "title": control["title"],
        "practiceId": control["practiceId"],
        "practiceTitle": control["practiceTitle"],
        "controlGroupId": control["controlGroupId"],
        "controlGroupTitle": control["controlGroupTitle"],
        "securityLevel": control["securityLevel"],
        "effortLevel": control["effortLevel"],
        "modalVerb": control["modalVerb"],
        "actionWord": control["actionWord"],
        "targetObjectCategories": control["targetObjectCategories"],
        "documentation": control["documentation"],
        "tags": control["tags"],
        "parameters": control["parameters"],
        "statement": control["statement"],
        "matchReason": match_reason,
    }


def merge_plusplus_controls(controls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for control in controls:
        control_id = str(control.get("id", ""))
        if not control_id or control_id in seen:
            continue
        seen.add(control_id)
        merged.append(control)
    return merged


def build_recommendations(
    module_catalog: dict[str, dict[str, Any]],
    threat_catalog: dict[str, str],
    checklist_threats: dict[str, list[str]],
    individual_checklists: dict[str, dict[str, Any]],
    policy_relevant_requirements: list[dict[str, Any]],
    plusplus: dict[str, Any],
    errata_map: dict[str, list[dict[str, str]]],
    field_index: dict[str, list[Any]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []
    for platform in PLATFORM_TARGETS:
        for module in platform.modules:
            module_data = module_catalog[module.module_id]
            for requirement_id, requirement in module_data["requirements"].items():
                threat_ids = checklist_threats.get(requirement_id, [])
                source_ids = [module.source_id, "it-grundschutz-checklists-2023"]
                if requirement_id in errata_map:
                    source_ids.append("it-grundschutz-errata-2023")
                source_ids.extend(list(module.supporting_source_ids))
                plusplus_context = plusplus_context_for(platform.platform, requirement, plusplus)
                checklist_context = checklist_context_for(
                    module.module_id,
                    requirement_id,
                    requirement,
                    individual_checklists,
                    policy_relevant_requirements,
                )
                semantic_evidence_sources = semantic_evidence_sources_for(requirement, checklist_context, plusplus_context)
                semantic_concepts = semantic_concepts_for(platform.platform, semantic_evidence_sources)
                semantic_candidates = semantic_candidates_for(platform.platform, semantic_concepts)
                mapping = mapping_for(
                    platform.platform,
                    requirement_id,
                    requirement,
                    field_index,
                    apple_mobileconfig_evidence,
                    semantic_candidates,
                )
                semantic_metadata: dict[str, Any]
                if semantic_concepts:
                    semantic_metadata = {"semanticConcepts": semantic_concepts}
                else:
                    semantic_metadata = {"semanticNoConceptReason": semantic_no_concept_reason(semantic_evidence_sources)}
                recommendations.append(
                    {
                        "id": slugify(f"{platform.platform}-{requirement_id}"),
                        "platform": platform.platform,
                        "osFamily": platform.os_family,
                        "policyName": platform.policy_name,
                        "moduleId": module.module_id,
                        "moduleTitle": module.module_title,
                        "moduleRole": module.role,
                        "sourceIds": unique_preserving_order(source_ids),
                        "supportingSourceIds": list(module.supporting_source_ids),
                        "category": requirement["category"],
                        "requirementId": requirement_id,
                        "title": requirement["title"],
                        "status": requirement["status"],
                        "protectionLevel": requirement["protectionLevel"],
                        "actors": requirement["actors"],
                        "paragraphs": requirement["paragraphs"],
                        "requirementText": requirement["requirementText"],
                        "reason": requirement["requirementText"],
                        "descriptionContext": module_data["description"],
                        "checklistThreatIds": threat_ids,
                        "checklistThreatTitles": [threat_catalog[threat_id] for threat_id in threat_ids if threat_id in threat_catalog],
                        "moduleThreatContext": module_data["moduleThreats"],
                        "errata": errata_map.get(requirement_id, []),
                        "grundschutzKompendium": checklist_context,
                        "grundschutzPlusPlus": plusplus_context,
                        **semantic_metadata,
                        "relutionMapping": mapping,
                    }
                )
    recommendations.sort(key=lambda entry: (entry["platform"], entry["moduleId"], entry["requirementId"]))
    return recommendations

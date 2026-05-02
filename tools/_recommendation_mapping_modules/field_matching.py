

def apple_schema_mapping(
    schema_id: str,
    values: dict[str, Any],
    field_paths: tuple[str, ...],
    *,
    constraints: tuple[tuple[str, str, Any], ...] = (),
    reason: str,
) -> dict[str, Any]:
    mapping: dict[str, Any] = {
        "kind": "apple-schema-profile",
        "schemaId": schema_id,
        "values": values,
        "match": {
            "score": 100,
            "matchedTerms": list(field_paths),
            "valueCompatibility": "curated-analog",
            "reason": reason,
        },
    }
    if constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in constraints
        ]
    return mapping


def merge_apple_schema_mappings(mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_schema: dict[str, dict[str, Any]] = {}
    for mapping in mappings:
        schema_id = str(mapping.get("schemaId", ""))
        values = mapping.get("values")
        if not schema_id or not isinstance(values, dict):
            continue
        existing = by_schema.get(schema_id)
        if existing is None:
            by_schema[schema_id] = dict(mapping)
            continue
        merged_values = merge_without_conflict(existing.get("values", {}), values)
        if merged_values is None:
            continue
        existing["values"] = merged_values
        existing["match"] = merge_match_metadata(existing.get("match"), mapping.get("match"))
        existing_constraints = existing.setdefault("constraints", [])
        if isinstance(mapping.get("constraints"), list):
            existing_constraints.extend(mapping["constraints"])
    return list(by_schema.values())


def merge_without_conflict(left: Any, right: Any) -> dict[str, Any] | None:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return None
    merged = dict(left)
    for key, value in right.items():
        if key not in merged:
            merged[key] = value
            continue
        if isinstance(merged[key], dict) and isinstance(value, dict):
            child = merge_without_conflict(merged[key], value)
            if child is None:
                return None
            merged[key] = child
            continue
        if merged[key] != value:
            return None
    return merged


def merge_match_metadata(left: Any, right: Any) -> dict[str, Any]:
    left_match = left if isinstance(left, dict) else {}
    right_match = right if isinstance(right, dict) else {}
    return {
        "score": max(int(left_match.get("score", 0)), int(right_match.get("score", 0))),
        "matchedTerms": unique_preserving_order([
            *[str(term) for term in left_match.get("matchedTerms", []) if isinstance(term, str)],
            *[str(term) for term in right_match.get("matchedTerms", []) if isinstance(term, str)],
        ]),
        "valueCompatibility": "curated-analog",
        "reason": "Curated Apple schema analogs matched managed-device recommendation wording.",
    }


def normalize_search_text(value: str) -> str:
    normalized = value.lower()
    normalized = normalized.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    normalized = normalized.replace("–", "-").replace("—", "-")
    normalized = re.sub(r"[^a-z0-9/+-]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def phrase_groups_match(haystack: str, required: tuple[tuple[str, ...], ...]) -> bool:
    return all(any(normalize_search_text(phrase) in haystack for phrase in group) for group in required)


def matched_rule_terms(haystack: str, required: tuple[tuple[str, ...], ...]) -> list[str]:
    matched: list[str] = []
    for group in required:
        for phrase in group:
            normalized = normalize_search_text(phrase)
            if normalized in haystack:
                matched.append(normalized)
                break
    return matched


def values_from_pairs(pairs: tuple[tuple[str, Any], ...]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for path, value in pairs:
        values.update(value_at_path(path, value))
    return values


def flatten_leaf_items(value: Any, prefix: tuple[str, ...] = ()) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        items: list[tuple[str, Any]] = []
        for key in sorted(value):
            items.extend(flatten_leaf_items(value[key], (*prefix, str(key))))
        return items
    return [(".".join(prefix), value)]


def stable_match_value(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def first_int(value: str) -> int | None:
    match = re.search(r"\d+", value)
    return int(match.group(0)) if match is not None else None


def unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def load_windows_custom_csp_evidence(evidence_path: Path) -> dict[frozenset[str], list[dict[str, Any]]]:
    if not evidence_path.exists():
        return {}
    evidence = read_json(evidence_path)
    entries = evidence.get("customCspSettings", []) if isinstance(evidence, dict) else []
    by_signature: dict[frozenset[str], list[dict[str, Any]]] = {}
    seen: set[tuple[frozenset[str], str, str]] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for value in (entry.get("name"), loc_uri_leaf(entry.get("locUri"))):
            if not isinstance(value, str):
                continue
            signature = windows_policy_signature(value)
            if not signature:
                continue
            marker = (signature, str(entry.get("name", "")), str(entry.get("locUri", "")))
            if marker in seen:
                continue
            seen.add(marker)
            by_signature.setdefault(signature, []).append(entry)
    return by_signature


def windows_custom_csp_mapping_for(
    title: str,
    recommended_value: Any,
    evidence_index: dict[frozenset[str], list[dict[str, Any]]],
    *,
    parent_title: str | None = None,
    require_simple_state_match: bool = False,
) -> dict[str, Any] | None:
    if not evidence_index:
        return None
    setting_name, state = extract_setting_state(title, recommended_value)
    if require_simple_state_match and not is_simple_windows_state(recommended_value, state):
        return None
    search_terms = [setting_name, title]
    if parent_title:
        search_terms.append(parent_title)
    for term in search_terms:
        signature = windows_policy_signature(term)
        if not signature:
            continue
        matches = evidence_index.get(signature, [])
        if len(matches) != 1:
            continue
        evidence = matches[0]
        if require_simple_state_match and not windows_csp_state_matches(state, evidence.get("state")):
            continue
        values = evidence.get("values")
        if not isinstance(values, dict):
            continue
        return {
            "kind": "relution-native",
            "type": "WINDOWS_CUSTOM_CSP",
            "values": values,
            "match": {
                "sourceFile": evidence.get("sourceFile", ""),
                "policyName": evidence.get("policyName", ""),
                "settingName": evidence.get("name", ""),
                "locUri": evidence.get("locUri", ""),
                "matchedSignature": sorted(signature),
                "reason": "Exact Windows Custom CSP mapping verified against the Relution Windows security baseline .rexp exports.",
            },
        }
    return None


def score_fields(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    *,
    extra_texts: tuple[str, ...] = (),
    recommended_value: Any = None,
    allowed_kinds: set[str] | None = None,
    field_kinds: set[str] | None = None,
    minimum_score: int = 8,
) -> list[ScoredField]:
    query_tokens = tokenize(section, title, *(str(text) for text in extra_texts), str(recommended_value or ""))
    if not query_tokens:
        return []
    value_state = normalized_state(recommended_value)
    scored: list[ScoredField] = []
    for field in field_index.get(platform, []):
        if allowed_kinds is not None and field.kind not in allowed_kinds:
            continue
        if field_kinds is not None and field.field_kind not in field_kinds:
            continue
        matched = query_tokens & field.tokens
        important = matched - LOW_SIGNAL_TOKENS
        if not important:
            continue
        score = sum(4 if token not in LOW_SIGNAL_TOKENS else 1 for token in matched)
        important_label = set(field.label_tokens) - LOW_SIGNAL_TOKENS
        if len(important_label) >= 2 and field.label_tokens <= query_tokens:
            score += 10
        compatibility = value_compatibility(field, value_state, recommended_value)
        if compatibility != "unknown":
            score += 2
        if score >= minimum_score:
            scored.append(ScoredField(score, tuple(sorted(matched)), compatibility, field))
    scored.sort(key=lambda entry: (-entry.score, kind_priority(entry.field.kind), entry.field.target, entry.field.field_path))
    return scored


def relution_fields(template_bundle_path: Path) -> list[FieldEntry]:
    bundle = read_json(template_bundle_path)
    fields: list[FieldEntry] = []
    for config in bundle.get("configurationTypes", []):
        if not isinstance(config, dict):
            continue
        target = str(config.get("type", ""))
        if not target or target.startswith(("ANDROID_IFP", "RELUTION_")):
            continue
        platforms = relution_platforms(target, config.get("platforms", []))
        if not platforms:
            continue
        target_label = str(config.get("label", target))
        for raw_field in config.get("fields", []):
            if not isinstance(raw_field, dict):
                continue
            path = str(raw_field.get("path", ""))
            if path in {"", "type", "uuid"}:
                continue
            label = str(raw_field.get("label", path))
            enum_values = tuple(str(value) for value in raw_field.get("enumValues", []) if isinstance(value, str))
            enum_labels = " ".join(str(value) for value in (raw_field.get("enumLabels", {}) or {}).values())
            field_kind = str(raw_field.get("kind", ""))
            fields.append(
                FieldEntry(
                    kind="relution-native",
                    target=target,
                    field_path=path,
                    label=label,
                    field_kind=field_kind,
                    platforms=frozenset(platforms),
                    tokens=frozenset(tokenize(target, target_label, path, label, field_kind, " ".join(enum_values), enum_labels)),
                    label_tokens=frozenset(tokenize(label)),
                    enum_values=enum_values,
                )
            )
    return fields


def apple_schema_fields(apple_schema_catalog_path: Path) -> list[FieldEntry]:
    catalog = read_json(apple_schema_catalog_path)
    fields: list[FieldEntry] = []
    for entry in catalog.get("entries", []):
        if not isinstance(entry, dict) or entry.get("kind") != "profile" or entry.get("deprecated") is True:
            continue
        target = str(entry.get("id") or f"profile:{entry.get('identifier', '')}")
        platforms = apple_platforms(entry.get("availability", {}).get("platforms", []))
        if not target or not platforms:
            continue
        entry_title = str(entry.get("title", ""))
        identifier = str(entry.get("identifier", ""))
        for raw_field in entry.get("fields", []):
            if not isinstance(raw_field, dict):
                continue
            path = str(raw_field.get("path", ""))
            if not path:
                continue
            label = str(raw_field.get("title") or path)
            field_kind = str(raw_field.get("kind", ""))
            enum_values = tuple(str(value) for value in raw_field.get("enumValues", []) if isinstance(value, str))
            fields.append(
                FieldEntry(
                    kind="apple-schema-profile",
                    target=target,
                    field_path=path,
                    label=label,
                    field_kind=field_kind,
                    platforms=frozenset(platforms),
                    tokens=frozenset(tokenize(target, identifier, entry_title, path, label, field_kind, " ".join(enum_values))),
                    label_tokens=frozenset(tokenize(label)),
                    enum_values=enum_values,
                )
            )
    return fields


def relution_platforms(target: str, platforms: Any) -> set[str]:
    raw = {str(platform).upper() for platform in platforms if isinstance(platform, str)}
    logical: set[str] = set()
    if "ANDROID_ENTERPRISE" in raw or target.startswith("ANDROID_ENTERPRISE"):
        logical.update({"ANDROID", "ANDROID_ENTERPRISE"})
    elif "ANDROID" in raw or target.startswith("ANDROID"):
        logical.add("ANDROID")
    if "IOS" in raw or target.startswith("IOS"):
        logical.add("IOS")
    if "MACOS" in raw or target.startswith("MACOS"):
        logical.add("MACOS")
    if "WINDOWS" in raw or target.startswith("WINDOWS"):
        logical.add("WINDOWS")
    if target.startswith("APPLE_"):
        if "IOS" in raw:
            logical.add("IOS")
        if "MACOS" in raw:
            logical.add("MACOS")
    return logical


def apple_platforms(platforms: Any) -> set[str]:
    logical: set[str] = set()
    for platform in platforms if isinstance(platforms, list) else []:
        normalized = str(platform).upper()
        if normalized in {"IOS", "IPADOS", "TVOS"}:
            logical.add("IOS")
        if normalized == "MACOS":
            logical.add("MACOS")
    return logical


def extract_setting_state(title: str, recommended_value: Any) -> tuple[str, str | None]:
    quoted_match = re.search(r"[\"'“”](?P<setting>.+?)[\"'“”]\s+(?:is\s+)?(?:set\s+to|configured\s+to|is)\s+[\"'“”]?(?P<state>[^\"'“”]+?)[\"'“”]?$", title, re.IGNORECASE)
    if quoted_match is not None:
        return normalize_setting_name(quoted_match.group("setting")), normalized_state(quoted_match.group("state"))

    state = normalized_state(recommended_value)
    setting = re.sub(r"^ensure\s+", "", title, flags=re.IGNORECASE)
    setting = re.sub(r"\s+is\s+(?:configured|enabled|disabled)$", "", setting, flags=re.IGNORECASE)
    return normalize_setting_name(setting), state


def windows_policy_signature(value: str) -> frozenset[str]:
    tokens: set[str] = set()
    for raw in split_identifier(value):
        if len(raw) < 2:
            continue
        normalized = WINDOWS_POLICY_SIGNATURE_SYNONYMS.get(raw, raw)
        if normalized.endswith("s") and len(normalized) > 4:
            normalized = WINDOWS_POLICY_SIGNATURE_SYNONYMS.get(normalized[:-1], normalized[:-1])
        if normalized and normalized not in WINDOWS_POLICY_SIGNATURE_STOP_WORDS:
            tokens.add(normalized)
    return frozenset(tokens)


def split_identifier(value: str) -> list[str]:
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", value)
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", spaced)
    spaced = re.sub(r"([A-Za-z])([0-9])", r"\1 \2", spaced)
    spaced = re.sub(r"([0-9])([A-Za-z])", r"\1 \2", spaced)
    return [raw for raw in re.split(r"[^A-Za-z0-9]+", spaced.lower()) if raw]


def loc_uri_leaf(value: Any) -> str | None:
    if not isinstance(value, str) or "/" not in value:
        return None
    return value.rsplit("/", 1)[-1]


def is_simple_windows_state(recommended_value: Any, state: str | None) -> bool:
    if isinstance(recommended_value, bool):
        return True
    if state not in POSITIVE_STATES | NEGATIVE_STATES:
        return False
    text = re.sub(r"\s+", " ", str(recommended_value or "").strip().lower())
    return text in POSITIVE_STATES | NEGATIVE_STATES


def windows_csp_state_matches(state: str | None, evidence_state: Any) -> bool:
    if not isinstance(evidence_state, str):
        return False
    if state in POSITIVE_STATES:
        return evidence_state == "enabled"
    if state in NEGATIVE_STATES:
        return evidence_state == "disabled"
    return False


def normalize_setting_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    value = value.strip("\"'“”")
    return value


def normalized_state(value: Any) -> str | None:
    if isinstance(value, bool):
        return "true" if value else "false"
    text = re.sub(r"\s+", " ", str(value or "").strip().lower())
    if not text:
        return None
    if text in POSITIVE_STATES | NEGATIVE_STATES | CONFIGURED_STATES:
        return text
    if text in {"enable"}:
        return "enabled"
    if text in {"disable"}:
        return "disabled"
    if text in BLOCK_STATES or text.startswith("force deny") or text.startswith("block"):
        return "block"
    if text.startswith("enabled"):
        return "enabled"
    if text.startswith("disabled"):
        return "disabled"
    return None


def boolean_value_for_field(setting_name: str, state: str, field: FieldEntry) -> bool | None:
    field_tokens = tokenize(field.label, field.field_path)
    setting_tokens = tokenize(setting_name)
    negative_field = bool(field_tokens & NEGATIVE_TERMS)
    allow_field = bool(field_tokens & ALLOW_TERMS)
    negative_setting = bool(setting_tokens & NEGATIVE_TERMS)

    if state in POSITIVE_STATES:
        return True
    if state in NEGATIVE_STATES:
        return True if negative_field and not allow_field else False
    if state == "block":
        return False if allow_field and not negative_field else True
    if state in CONFIGURED_STATES:
        if negative_field or negative_setting:
            return True
        return None
    return None


def value_compatibility(field: FieldEntry, value_state: str | None, recommended_value: Any) -> str:
    if field.field_kind == "boolean" and value_state is not None:
        return "boolean-state"
    if field.enum_values and isinstance(recommended_value, str):
        normalized_value = token_string(tokenize(recommended_value))
        for enum_value in field.enum_values:
            if token_string(tokenize(enum_value)) == normalized_value:
                return "enum-value"
    if field.field_kind in {"integer", "number"} and re.search(r"\d+", str(recommended_value or "")):
        return "numeric-value"
    return "unknown"


def is_exact_label_match(setting_tokens: set[str], label_tokens: frozenset[str]) -> bool:
    if not setting_tokens or not label_tokens:
        return False
    important_setting = setting_tokens - LOW_SIGNAL_TOKENS
    important_label = set(label_tokens) - LOW_SIGNAL_TOKENS
    if important_setting == important_label:
        return True
    if important_setting.symmetric_difference(important_label) <= EXACT_IGNORABLE_TOKENS:
        return True
    return False


def candidate_from_score(entry: ScoredField) -> dict[str, Any]:
    return {
        "kind": entry.field.kind,
        "target": entry.field.target,
        "fieldPaths": [entry.field.field_path],
        "match": {
            "score": entry.score,
            "matchedTerms": list(entry.matched_terms),
            "valueCompatibility": entry.value_compatibility,
            "reason": "Bilingual normalized setting-name match against Relution/Apple field metadata.",
        },
    }


def candidate_key(candidate: dict[str, Any]) -> tuple[str, str, tuple[str, ...]]:
    return (str(candidate.get("kind", "")), str(candidate.get("target", "")), tuple(str(path) for path in candidate.get("fieldPaths", [])))


def kind_priority(kind: str) -> int:
    return {"relution-native": 0, "apple-schema-profile": 1, "apple-mobileconfig": 2}.get(kind, 9)


def tokenize(*values: str) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
        spaced = spaced.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
        for raw in re.split(r"[^A-Za-z0-9]+", spaced.lower()):
            if len(raw) < 2:
                continue
            normalized = SYNONYMS.get(raw, raw)
            if normalized.endswith("s") and len(normalized) > 4:
                normalized = SYNONYMS.get(normalized[:-1], normalized)
            if normalized and normalized not in STOP_WORDS:
                tokens.add(normalized)
    return tokens


def token_string(tokens: set[str] | frozenset[str]) -> str:
    return " ".join(sorted(tokens))


def value_at_path(path: str, value: Any) -> dict[str, Any]:
    parts = [part for part in path.split(".") if part]
    if not parts:
        return {}
    current: Any = value
    for part in reversed(parts):
        current = {part: current}
    return current


def flatten_value_paths(value: Any, prefix: tuple[str, ...] = ()) -> list[str]:
    if isinstance(value, dict):
        paths: list[str] = []
        for key in sorted(value):
            paths.extend(flatten_value_paths(value[key], (*prefix, str(key))))
        return paths
    return [".".join(prefix)]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf8"))

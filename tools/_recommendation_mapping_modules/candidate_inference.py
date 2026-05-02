
ANDROID_ANALOG_RULES: tuple[AndroidAnalogRule, ...] = (
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("developerSettings", "DEVELOPER_SETTINGS_DISABLED"),),
        (("developer options", "developer mode", "entwicklermodus"), ("disabled", "deaktiviert", "deaktivieren")),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("untrustedAppsPolicy", "DISALLOW_INSTALL"),),
        (("install unknown apps", "unknown sources", "unbekannte quellen", "untrusted apps"), ("disabled", "block", "disallow", "deaktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("googlePlayProtectVerifyApps", "VERIFY_APPS_ENFORCED"),),
        (("scan device for security threats", "google play protect", "verify apps"), ("enabled", "enforced", "erzwingen")),
    ),
    AndroidAnalogRule(
        ANDROID_ADVANCED_SECURITY,
        (("googlePlayProtectVerifyApps", "VERIFY_APPS_ENFORCED"),),
        (("play protect", "verify apps"), ("turn on", "enabled", "enforced")),
    ),
    AndroidAnalogRule(
        "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
        (("cameraDisabled", True),),
        (("camera", "kamera"), ("disabled", "deaktiviert", "block")),
        excluded=("microphone", "mikrofon"),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("safeBootDisabled", True),),
        (("safe boot", "sicherer start"), ("disabled", "block", "deaktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("androidAutoDateAndTimeZoneSetting", "AUTO_DATE_AND_TIME_ZONE_ENFORCED"),),
        (("network-provided time", "network provided time", "automatic date", "auto date", "automatische uhrzeit"), ("enabled", "enforced", "aktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_PLAY_STORE,
        (("appAutoUpdatePolicy", "ALWAYS"),),
        (("keep device apps up to date", "apps up to date", "app updates", "install app updates"), ("update apps", "always", "immediately")),
    ),
    AndroidAnalogRule(
        ANDROID_LOCATION,
        (("locationMode", "LOCATION_ENFORCED"),),
        (("location is set to enabled", "location"), ("enabled", "enforced")),
        excluded=("location history", "remotely locate", "find my device", "geofencing"),
    ),
    AndroidAnalogRule(
        ANDROID_RESTRICTION,
        (("microphoneAccessPermission", "MICROPHONE_ACCESS_ENFORCED"),),
        (("microphone", "mikrofon"), ("enabled", "enforced", "aktiviert")),
    ),
    AndroidAnalogRule(
        ANDROID_KEYGUARD,
        (("keyguardDisabledFeatures", ["TRUST_AGENTS"]),),
        (("smart lock", "trust agent", "trust agents"), ("disabled", "deaktiviert")),
        constraints=(("keyguardDisabledFeatures", "containsAll", ["TRUST_AGENTS"]),),
    ),
    AndroidAnalogRule(
        ANDROID_KEYGUARD,
        (("keyguardDisabledFeatures", ["NOTIFICATIONS"]),),
        (("lock screen", "sperrbildschirm"), ("notifications", "benachrichtigungen"), ("don t show notifications at all", "do not show notifications", "disabled")),
        constraints=(("keyguardDisabledFeatures", "containsAll", ["NOTIFICATIONS"]),),
    ),
)

ANDROID_CANDIDATE_RULES: tuple[tuple[str, tuple[str, ...], tuple[tuple[str, ...], ...], str], ...] = (
    ("ANDROID_ENTERPRISE_DEVICE_PASSCODE", ("quality", "minLength", "maxFailedPasswordsForWipe"), (("geraetesperrcode", "gerätesperrcode", "zugriffsschutz", "passcode", "screen lock"),), "Relution can enforce Android Enterprise passcode requirements, but the recommendation needs concrete complexity values before it is exact."),
    ("ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE", ("quality", "minLength", "unifiedLockSettings"), (("work profile", "arbeitsumgebung", "arbeitsumgebungen", "container"),), "Relution can enforce a separate Android work-profile challenge, but organization scope determines the exact value."),
    ("ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY", ("usbDataAccess", "configureWifi", "wifiDirectSettings", "tetheringSettings", "bluetoothSharing"), (("kommunikationsschnittstellen", "schnittstellen", "connectivity", "bluetooth", "wifi", "wlan", "usb", "tethering"),), "Relution exposes Android Enterprise connectivity controls; disabling only unused interfaces remains organization-specific."),
    ("ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY", ("apnPolicy", "apnPolicy.overrideApns", "apnPolicy.apnSettings"), (("apn", "zugangspunkt", "mobilfunknetz"),), "Relution can configure Android Enterprise APN policy, but APN values are organization-specific."),
    ("ANDROID_ENTERPRISE_ALWAYS_ON_VPN", ("lockdownEnabled", "alwaysOnVpnApp.packageName"), (("vpn",),), "Relution can enforce always-on VPN and lockdown behavior, but the VPN app and gateway values are organization-specific."),
    ("ANDROID_ENTERPRISE_RECOMMENDED_GLOBAL_PROXY", ("proxyType", "host", "port", "pacUri"), (("proxy", "web filter", "webseiten", "reputationsdienst"),), "Relution exposes a global proxy recommendation, but proxy hosts and bypass policy are organization-specific."),
    ("ANDROID_ENTERPRISE_WIFI_MANAGEMENT", ("ssid", "securityType", "passphrase"), (("wifi", "wlan", "wi-fi"),), "Relution can configure Android Enterprise Wi-Fi profiles, but SSID and credential values are organization-specific."),
    ("ANDROID_ENTERPRISE_LOCK_SCREEN_MESSAGES", ("deviceOwnerLockScreenInfo.defaultMessage", "shortSupportMessage.defaultMessage", "longSupportMessage.defaultMessage"), (("lock screen message", "if lost return", "support message"),), "Relution can configure Android Enterprise lock-screen/support messages, but the visible message text is organization-specific."),
    ("ANDROID_ENTERPRISE_SYSTEM_CLOCK_MANAGEMENT", ("autoTimeRequired",), (("time service", "network-provided time", "automatic date", "auto date", "automatische uhrzeit"),), "Relution can require Android Enterprise automatic time, but timezone and exception policy remain organization-specific."),
    ("ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT", ("restrictedPlayStoreMode", "appAutoUpdatePolicy"), (("app installation", "installation von apps", "allowlist", "freigegebene apps", "apps"),), "Relution can restrict managed Play and app updates, but app allowlists are organization-specific."),
    ("ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT", ("defaultPermissionPolicy", "wellKnownPermissions", "customPermissions"), (("permission", "permissions", "berechtigungen", "datenschutz"),), "Relution can set Android Enterprise permission policy, but per-app permissions are organization-specific."),
    ("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", ("googlePlayProtectVerifyApps",), (("schadprogramme", "schadprogrammen", "malware", "play protect", "security threats"),), "Relution can enforce Google Play Protect verification for Android Enterprise devices."),
    ("ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT", ("configurationEnforcementRules",), (("compliance", "manipulation", "regelungen", "policy violation"),), "Relution exposes compliance enforcement rules, but concrete actions and thresholds are organization-specific."),
    ("ANDROID_ENTERPRISE_CERTIFICATE", ("certificate", "certificateTemplate", "certificateUsage"), (("certificate", "certificates", "zertifikat", "zertifikate"),), "Relution can distribute Android Enterprise certificates, but certificate material and trust choices are organization-specific."),
    ("ANDROID_ENTERPRISE_PERSONAL_USAGE", ("cameraDisabled", "screenCaptureDisabled", "personalPlayStoreMode", "allowBluetoothSharing"), (("personal", "private", "privat", "screen capture", "screensharing", "casting"),), "Relution exposes personal-usage controls for company-owned work-profile devices, but policy scope is organization-specific."),
    ("ANDROID_ENTERPRISE_SYSTEM_UPDATE", ("systemUpdateType", "startMinutes", "endMinutes", "freezePeriods"), (("system update", "betriebssystem", "updates", "aktualisierung"),), "Relution can manage Android Enterprise system-update policy, but cadence and maintenance windows are organization-specific."),
)


def build_setting_index(
    template_bundle_path: Path = TEMPLATE_BUNDLE_PATH,
    apple_schema_catalog_path: Path = APPLE_SCHEMA_CATALOG_PATH,
) -> dict[str, list[FieldEntry]]:
    indexed: dict[str, list[FieldEntry]] = {}
    for field in relution_fields(template_bundle_path):
        for platform in field.platforms:
            indexed.setdefault(platform, []).append(field)
    if apple_schema_catalog_path.exists():
        for field in apple_schema_fields(apple_schema_catalog_path):
            for platform in field.platforms:
                indexed.setdefault(platform, []).append(field)
    for platform in indexed:
        indexed[platform].sort(key=lambda field: (field.kind, field.target, field.field_path))
    return indexed


def mapping_candidates(
    platform: str,
    title: str,
    section: str,
    field_index: dict[str, list[FieldEntry]],
    exact_mapping: Any = None,
    *,
    extra_texts: tuple[str, ...] = (),
    recommended_value: Any = None,
    limit: int = 5,
    allowed_kinds: set[str] | None = None,
) -> list[dict[str, Any]]:
    scored = score_fields(platform, title, section, field_index, extra_texts=extra_texts, recommended_value=recommended_value, allowed_kinds=allowed_kinds)
    candidates = [candidate_from_score(entry) for entry in scored[:limit]]
    if isinstance(exact_mapping, tuple):
        target, values = exact_mapping
        for path in flatten_value_paths(values):
            exact_candidate = {"kind": "relution-native", "target": target, "fieldPaths": [path]}
            candidates = [exact_candidate, *[candidate for candidate in candidates if candidate_key(candidate) != candidate_key(exact_candidate)]]
    return candidates[:limit]


def infer_exact_boolean_mapping(
    platform: str,
    title: str,
    recommended_value: Any,
    field_index: dict[str, list[FieldEntry]],
    *,
    section: str = "",
    extra_texts: tuple[str, ...] = (),
    allowed_kinds: set[str] | None = None,
) -> dict[str, Any] | None:
    setting_name, state = extract_setting_state(title, recommended_value)
    if state is None:
        return None
    setting_tokens = tokenize(setting_name)
    if not setting_tokens:
        return None

    scored = score_fields(
        platform,
        setting_name,
        section,
        field_index,
        extra_texts=extra_texts,
        recommended_value=recommended_value,
        allowed_kinds=allowed_kinds,
        field_kinds={"boolean"},
        minimum_score=1,
    )
    exact_matches = [
        entry
        for entry in scored
        if is_exact_label_match(setting_tokens, entry.field.label_tokens)
    ]
    if not exact_matches:
        return None

    exact_matches.sort(key=lambda entry: (kind_priority(entry.field.kind), -entry.score, entry.field.target, entry.field.field_path))
    best = exact_matches[0]
    next_best = exact_matches[1] if len(exact_matches) > 1 else None
    if next_best is not None and best.field.kind == next_best.field.kind and best.field.label_tokens == next_best.field.label_tokens:
        return None

    desired = boolean_value_for_field(setting_name, state, best.field)
    if desired is None:
        return None

    mapping = {
        "kind": best.field.kind,
        "values": value_at_path(best.field.field_path, desired),
        "match": {
            "score": best.score,
            "matchedTerms": list(best.matched_terms),
            "valueCompatibility": best.value_compatibility,
            "reason": "Exact boolean mapping inferred from matching setting label and recommended state.",
        },
    }
    if best.field.kind == "relution-native":
        mapping["type"] = best.field.target
    elif best.field.kind == "apple-schema-profile":
        mapping["schemaId"] = best.field.target
    elif best.field.kind == "apple-mobileconfig":
        mapping["payloadType"] = best.field.target
    else:
        return None
    return mapping


def apple_schema_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack = normalize_search_text(" ".join((title, *(str(text) for text in extra_texts), str(recommended_value or ""))))
    mappings: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[tuple[str, str], ...]]] = set()

    for rule in APPLE_ANALOG_RULES:
        if platform not in rule.platforms or not phrase_groups_match(haystack, rule.required) or any(phrase in haystack for phrase in rule.excluded):
            continue
        values = values_from_pairs(rule.values)
        key = (rule.schema_id, tuple(sorted((path, stable_match_value(value)) for path, value in rule.values)))
        if key in seen:
            continue
        seen.add(key)
        mapping: dict[str, Any] = {
            "kind": "apple-schema-profile",
            "schemaId": rule.schema_id,
            "values": values,
            "match": {
                "score": 100,
                "matchedTerms": matched_rule_terms(haystack, rule.required),
                "valueCompatibility": "curated-analog",
                "reason": rule.reason,
            },
        }
        if rule.constraints:
            mapping["constraints"] = [
                {"path": path, "operator": operator, "value": value}
                for path, operator, value in rule.constraints
            ]
        mappings.append(mapping)

    numeric = apple_numeric_analog_mappings_for(platform, haystack)
    for mapping in numeric:
        key = (str(mapping.get("schemaId", "")), tuple(sorted((path, stable_match_value(value)) for path, value in flatten_leaf_items(mapping.get("values", {})))))
        if key in seen:
            continue
        seen.add(key)
        mappings.append(mapping)
    return merge_apple_schema_mappings(mappings)


def apple_mobileconfig_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
    evidence_index: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if platform not in {"IOS", "MACOS"}:
        return []
    haystack = normalize_search_text(" ".join((title, *(str(text) for text in extra_texts))))
    available_payloads = set(evidence_index or load_apple_mobileconfig_evidence())
    candidates: list[dict[str, Any]] = []
    for platforms, payload_type, field_paths, required, note in APPLE_MOBILECONFIG_CANDIDATE_RULES:
        if platform not in platforms or payload_type not in available_payloads or not phrase_groups_match(haystack, required):
            continue
        candidates.append(
            {
                "kind": "apple-mobileconfig",
                "target": payload_type,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 90,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-mobileconfig",
                    "reason": note,
                },
            }
        )
    return candidates


def android_relution_analog_mappings_for(
    platform: str,
    title: str,
    recommended_value: Any,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack = normalize_search_text(" ".join((title, *(str(text) for text in extra_texts), str(recommended_value or ""))))
    mappings: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[tuple[str, str], ...]]] = set()

    for rule in ANDROID_ANALOG_RULES:
        if not phrase_groups_match(haystack, rule.required) or any(normalize_search_text(phrase) in haystack for phrase in rule.excluded):
            continue
        key = (rule.target, tuple(sorted((path, stable_match_value(value)) for path, value in rule.values)))
        if key in seen:
            continue
        seen.add(key)
        mappings.append(android_relution_mapping(rule, haystack))
    return mappings


def android_relution_candidates_for(
    platform: str,
    title: str,
    *,
    extra_texts: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    if platform not in {"ANDROID", "ANDROID_ENTERPRISE"}:
        return []
    haystack = normalize_search_text(" ".join((title, *(str(text) for text in extra_texts))))
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for target, field_paths, required, note in ANDROID_CANDIDATE_RULES:
        if not phrase_groups_match(haystack, required):
            continue
        key = (target, field_paths)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "kind": "relution-native",
                "target": target,
                "fieldPaths": list(field_paths),
                "match": {
                    "score": 80,
                    "matchedTerms": matched_rule_terms(haystack, required),
                    "valueCompatibility": "org-specific-android-enterprise",
                    "reason": note,
                },
            }
        )
    return candidates


def semantic_concepts_for(platform: str, evidence_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if is_process_only_evidence(evidence_sources):
        return []

    normalized_sources = normalized_semantic_sources(evidence_sources)
    if not normalized_sources:
        return []

    all_text = " ".join(source["normalized"] for source in normalized_sources)
    concepts: list[dict[str, Any]] = []
    for rule in SEMANTIC_CONCEPT_RULES:
        if any(normalize_search_text(term) in all_text for term in rule.exclusions):
            continue
        source_matches = []
        pending_gs_text_matches = []
        related_control_ids: list[str] = []
        for source in normalized_sources:
            matched_terms = matched_semantic_terms(source["normalized"], rule.terms)
            gs_control_id = source.get("gsControlId")
            gs_control_match = isinstance(gs_control_id, str) and gs_control_id in rule.gs_controls
            if not matched_terms and not gs_control_match:
                continue
            if source["source"] == "grundschutz-plusplus-control" and not gs_control_match:
                pending_gs_text_matches.append((source, matched_terms))
                continue
            if gs_control_match:
                related_control_ids.append(gs_control_id)
            source_matches.append(
                {
                    "source": source["source"],
                    **({"sourceId": source["sourceId"]} if source.get("sourceId") else {}),
                    **({"gsControlId": gs_control_id} if isinstance(gs_control_id, str) and gs_control_id else {}),
                    **({"modalVerb": source["modalVerb"]} if source.get("modalVerb") else {}),
                    **({"securityLevel": source["securityLevel"]} if source.get("securityLevel") else {}),
                    "matchedTerms": matched_terms or [gs_control_id],
                    "confidence": semantic_source_confidence(source, matched_terms, gs_control_match),
                    "excerpt": shorten_text(source["text"], 260),
                }
            )
        if source_matches and any(source["source"] != "grundschutz-plusplus-control" for source in source_matches):
            for source, matched_terms in pending_gs_text_matches:
                source_matches.append(
                    {
                        "source": source["source"],
                        **({"sourceId": source["sourceId"]} if source.get("sourceId") else {}),
                        **({"gsControlId": source["gsControlId"]} if source.get("gsControlId") else {}),
                        **({"modalVerb": source["modalVerb"]} if source.get("modalVerb") else {}),
                        **({"securityLevel": source["securityLevel"]} if source.get("securityLevel") else {}),
                        "matchedTerms": matched_terms,
                        "confidence": semantic_source_confidence(source, matched_terms, False),
                        "excerpt": shorten_text(source["text"], 260),
                    }
                )
        if not source_matches:
            continue
        matched = unique_preserving_order([
            term
            for source in source_matches
            for term in source["matchedTerms"]
            if isinstance(term, str)
        ])
        confidence = max(float(source["confidence"]) for source in source_matches)
        candidate_targets = semantic_candidate_targets_for(platform, rule)
        concepts.append(
            {
                "id": rule.concept_id,
                "label": {"de": rule.label_de, "en": rule.label_en},
                "matchedTerms": matched,
                "evidence": source_matches,
                "confidence": round(confidence, 2),
                "relatedGrundschutzPlusPlusControlIds": unique_preserving_order(related_control_ids),
                "candidateTargets": candidate_targets,
            }
        )

    concepts.sort(key=semantic_concept_sort_key)
    return concepts


def semantic_candidates_for(platform: str, concepts: list[dict[str, Any]], *, limit: int = 12) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for concept in concepts:
        for target in concept.get("candidateTargets", []):
            if not isinstance(target, dict) or target.get("platform") != platform:
                continue
            field_paths = tuple(str(path) for path in target.get("fieldPaths", []) if isinstance(path, str))
            candidate = {
                "kind": str(target.get("kind", "")),
                "target": str(target.get("target", "")),
                "fieldPaths": list(field_paths),
                "semanticConceptId": str(concept.get("id", "")),
                "match": {
                    "score": int(round(float(concept.get("confidence", 0.0)) * 100)),
                    "matchedTerms": [str(term) for term in concept.get("matchedTerms", []) if isinstance(term, str)],
                    "valueCompatibility": "concept-candidate",
                    "reason": f"{BSI_CONCEPT_MATCH_REASON}: {target.get('reason', '')}",
                },
            }
            key = candidate_key(candidate)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(candidate)
    concept_order = {str(concept.get("id", "")): index for index, concept in enumerate(concepts)}
    candidates.sort(key=lambda candidate: semantic_candidate_sort_key(candidate, concept_order))
    return candidates[:limit]


def semantic_concepts_for_field(platform: str, field: FieldEntry) -> list[dict[str, Any]]:
    source = "apple-schema-field" if field.kind == "apple-schema-profile" else "relution-field"
    text_parts = [
        field.target,
        field.field_path,
        field.label,
        field.field_kind,
        " ".join(field.enum_values),
    ]
    return semantic_concepts_for(
        platform,
        [
            {
                "source": source,
                "sourceId": f"{field.kind}:{field.target}:{field.field_path}",
                "text": " ".join(part for part in text_parts if part),
                "confidence": 0.72,
            }
        ],
    )


def semantic_no_concept_reason(evidence_sources: list[dict[str, Any]]) -> str:
    if is_process_only_evidence(evidence_sources):
        return "Process-only physical, power, or emergency-planning wording; no concrete Relution policy candidate was emitted by the semantic layer."
    return "No curated shared security concept matched the available evidence."


def is_process_only_evidence(evidence_sources: list[dict[str, Any]]) -> bool:
    for source in evidence_sources:
        if source.get("source") in {"bsi-title", "cis-title"}:
            title = normalize_search_text(str(source.get("text", "")))
            return any(normalize_search_text(term) in title for term in PROCESS_ONLY_TITLE_TERMS)
    return False


def semantic_concept_sort_key(concept: dict[str, Any]) -> tuple[int, int, float, str]:
    concept_id = str(concept.get("id", ""))
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        semantic_concept_source_rank(concept),
        -float(concept.get("confidence", 0.0)),
        concept_id,
    )


def semantic_concept_source_rank(concept: dict[str, Any]) -> int:
    evidence = concept.get("evidence", [])
    sources = {str(entry.get("source", "")) for entry in evidence if isinstance(entry, dict)}
    if sources.intersection(DIRECT_SEMANTIC_SOURCES):
        return 0
    if sources.intersection(RELATED_SEMANTIC_SOURCES):
        return 1
    if sources.intersection(GS_PLUSPLUS_SEMANTIC_SOURCES):
        return 2
    return 3


def semantic_candidate_sort_key(candidate: dict[str, Any], concept_order: dict[str, int]) -> tuple[int, int, int, str, str]:
    concept_id = str(candidate.get("semanticConceptId", ""))
    match = candidate.get("match", {})
    score = int(match.get("score", 0)) if isinstance(match, dict) else 0
    return (
        1 if concept_id in MANAGEMENT_SUPPORT_CONCEPT_IDS else 0,
        concept_order.get(concept_id, 999),
        -score,
        str(candidate.get("kind", "")),
        str(candidate.get("target", "")),
    )


def normalized_semantic_sources(evidence_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_sources: list[dict[str, Any]] = []
    for source in evidence_sources:
        text = str(source.get("text", ""))
        normalized = normalize_search_text(text)
        if not normalized:
            continue
        normalized_sources.append(
            {
                "source": str(source.get("source", "unknown")),
                "sourceId": str(source.get("sourceId", "")),
                "gsControlId": str(source.get("gsControlId", "")),
                "modalVerb": str(source.get("modalVerb", "")),
                "securityLevel": str(source.get("securityLevel", "")),
                "confidence": float(source.get("confidence", 0.7)),
                "text": text,
                "normalized": normalized,
            }
        )
    return normalized_sources


def matched_semantic_terms(haystack: str, terms: tuple[str, ...]) -> list[str]:
    matched = []
    for term in terms:
        normalized = normalize_search_text(term)
        if normalized and normalized in haystack:
            matched.append(normalized)
    return unique_preserving_order(matched)


def semantic_source_confidence(source: dict[str, Any], matched_terms: list[str], gs_control_match: bool) -> float:
    confidence = float(source.get("confidence", 0.7))
    if len(matched_terms) >= 2:
        confidence += 0.05
    if gs_control_match:
        confidence += 0.08
    if source.get("modalVerb") == "MUSS":
        confidence += 0.05
    elif source.get("modalVerb") == "SOLLTE":
        confidence += 0.03
    if normalize_search_text(str(source.get("securityLevel", ""))) == "erhoeht":
        confidence += 0.04
    return min(confidence, 0.99)


def semantic_candidate_targets_for(platform: str, rule: SemanticConceptRule) -> list[dict[str, Any]]:
    targets = []
    for target in rule.targets:
        if platform not in target.platforms:
            continue
        targets.append(
            {
                "platform": platform,
                "kind": target.kind,
                "target": target.target,
                "fieldPaths": list(target.field_paths),
                "reason": target.note,
            }
        )
    return targets


def shorten_text(value: str, limit: int) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3].rstrip()}..."


def android_relution_mapping(rule: AndroidAnalogRule, haystack: str) -> dict[str, Any]:
    mapping: dict[str, Any] = {
        "kind": "relution-native",
        "type": rule.target,
        "values": values_from_pairs(rule.values),
        "match": {
            "score": 100,
            "matchedTerms": matched_rule_terms(haystack, rule.required),
            "valueCompatibility": "curated-android-analog",
            "reason": rule.reason,
        },
    }
    if rule.constraints:
        mapping["constraints"] = [
            {"path": path, "operator": operator, "value": value}
            for path, operator, value in rule.constraints
        ]
    return mapping


def load_apple_mobileconfig_evidence(evidence_path: Path = APPLE_MOBILECONFIG_EVIDENCE_PATH) -> dict[str, dict[str, Any]]:
    if not evidence_path.exists():
        return {}
    evidence = read_json(evidence_path)
    settings = evidence.get("settings", []) if isinstance(evidence, dict) else []
    loaded: dict[str, dict[str, Any]] = {}
    for setting in settings:
        if not isinstance(setting, dict) or setting.get("status") != "mobileconfig-backed":
            continue
        payload_type = setting.get("payloadType")
        if isinstance(payload_type, str) and payload_type:
            loaded[payload_type] = setting
    return loaded


def apple_numeric_analog_mappings_for(platform: str, haystack: str) -> list[dict[str, Any]]:
    mappings: list[dict[str, Any]] = []
    if platform == "IOS":
        if "require alphanumeric value" in haystack and "enabled" in haystack:
            mappings.append(apple_schema_mapping(APPLE_PASSCODE, {"requireAlphanumeric": True}, ("requireAlphanumeric",), reason="Curated Apple passcode analog matched alphanumeric requirement."))
        if ("minimum passcode length" in haystack or "minimum password length" in haystack) and (minimum := first_int(haystack)) is not None:
            mappings.append(
                apple_schema_mapping(
                    APPLE_PASSCODE,
                    {"minLength": minimum},
                    ("minLength",),
                    constraints=(("minLength", "atLeast", minimum),),
                    reason="Curated Apple passcode analog matched minimum length requirement.",
                )
            )
        if ("maximum auto-lock" in haystack or "maximum minutes of inactivity until screen locks" in haystack) and (maximum := first_int(haystack)) is not None:
            mappings.append(
                apple_schema_mapping(
                    APPLE_PASSCODE,
                    {"maxInactivity": maximum},
                    ("maxInactivity",),
                    constraints=(("maxInactivity", "atMost", maximum),),
                    reason="Curated Apple passcode analog matched auto-lock maximum requirement.",
                )
            )
        if "maximum grace period for device lock" in haystack and "immediately" in haystack:
            mappings.append(apple_schema_mapping(APPLE_PASSCODE, {"maxGracePeriod": 0}, ("maxGracePeriod",), reason="Curated Apple passcode analog matched immediate device-lock grace period."))
        if "maximum number of failed attempts" in haystack and (attempts := first_int(haystack)) is not None:
            mappings.append(apple_schema_mapping(APPLE_PASSCODE, {"maxFailedAttempts": attempts}, ("maxFailedAttempts",), reason="Curated Apple passcode analog matched failed-attempt limit."))
    if platform == "MACOS":
        if "inactivity interval" in haystack and "screen saver" in haystack and (minutes := first_int(haystack)) is not None:
            seconds = minutes * 60
            mappings.append(
                apple_schema_mapping(
                    APPLE_SCREEN_SAVER,
                    {"idleTime": seconds},
                    ("idleTime",),
                    constraints=(("idleTime", "atMost", seconds),),
                    reason="Curated Apple screen-saver analog matched inactivity interval requirement.",
                )
            )
        if "require password after screen saver begins" in haystack or "display is turned off" in haystack:
            delay = 0 if "immediately" in haystack else first_int(haystack)
            if delay is not None:
                mappings.append(
                    apple_schema_mapping(
                        APPLE_SCREEN_SAVER,
                        {"askForPassword": True, "askForPasswordDelay": delay},
                        ("askForPassword", "askForPasswordDelay"),
                        constraints=(("askForPasswordDelay", "atMost", delay),),
                        reason="Curated Apple screen-saver analog matched password-after-saver requirement.",
                    )
                )
    return mappings

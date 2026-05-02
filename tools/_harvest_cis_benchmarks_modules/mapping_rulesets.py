

def extract_powershell_commands(text: str) -> list[str]:
    commands: list[str] = []
    for match in POWERSHELL_COMMAND_START_RE.finditer(text):
        end = len(text)
        next_command = POWERSHELL_COMMAND_START_RE.search(text, match.end())
        if next_command is not None:
            end = min(end, next_command.start())
        for marker in POWERSHELL_STOP_MARKERS:
            marker_index = text.find(marker, match.start())
            if marker_index != -1:
                end = min(end, marker_index)
        candidate = normalize_space(text[match.start() : end]).rstrip(".")
        if candidate:
            commands.append(candidate)
    return unique_preserving_order(commands)


def build_helper_fallback(
    recommendation_id: str,
    *,
    method: str,
    role: str,
    title: str,
    raw_text: str,
    commands: list[str] | None = None,
    group_policy_paths: list[str] | None = None,
    registry_paths: list[str] | None = None,
    profile_payload_type: str | None = None,
    profile_keys: list[dict[str, str]] | None = None,
    index: int = 1,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": slugify(f"{recommendation_id}-{method}-{index}"),
        "role": role,
        "method": method,
        "title": title,
        "rawText": raw_text.strip(),
        "commands": commands or [],
    }
    if group_policy_paths:
        payload["groupPolicyPaths"] = group_policy_paths
    if registry_paths:
        payload["registryPaths"] = registry_paths
    if profile_payload_type is not None:
        payload["profilePayloadType"] = profile_payload_type
    if profile_keys:
        payload["profileKeys"] = profile_keys
    return payload


def extract_excerpt(text: str, needle: str, radius: int = 220) -> str:
    index = text.find(needle)
    if index == -1:
        return text.strip()
    start = max(0, index - radius)
    end = min(len(text), index + len(needle) + radius)
    return text[start:end].strip()


def trim_at_markers(text: str, markers: tuple[str, ...]) -> str:
    end = len(text)
    for marker in markers:
        index = text.find(marker)
        if index != -1:
            end = min(end, index)
    return text[:end]


def is_terminal_stop_line(line: str) -> bool:
    return any(
        line.startswith(prefix)
        for prefix in (
            "The output",
            "Software Update Tool",
            "Software Update found",
            "Finding available software",
            "Note:",
            "Or run the following command",
            "example:",
            "Example:",
            "Profile Method:",
            "Graphical Method:",
            "Default Value:",
            "References:",
            "CIS Controls:",
        )
    )


def unique_profile_keys(keys: list[dict[str, str]]) -> list[dict[str, str]]:
    seen = set()
    unique: list[dict[str, str]] = []
    for entry in keys:
        marker = (entry["key"], entry["value"])
        if marker in seen:
            continue
        seen.add(marker)
        unique.append(entry)
    return unique


def mapping_for(
    benchmark: BenchmarkSpec,
    recommendation_id: str,
    title: str,
    recommended_value: str | None,
    sections: dict[str, Any],
    field_index: dict[str, list[Any]],
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
    apple_mobileconfig_evidence: dict[str, dict[str, Any]],
    semantic_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized_title = title.lower()
    exact_mappings: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    notes: list[str] = []
    extra_texts = (
        str(sections.get("description", "")),
        str(sections.get("rationale", "")),
    )

    def add_exact(kind: str, target: str, field_paths: list[str], values: dict[str, Any], constraints: list[dict[str, Any]] | None = None) -> None:
        candidates.append({"kind": kind, "target": target, "fieldPaths": field_paths})
        mapping: dict[str, Any] = {"kind": kind, "values": values}
        if constraints:
            mapping["constraints"] = constraints
        if kind == "relution-native":
            mapping["type"] = target
        elif kind == "apple-schema-profile":
            mapping["schemaId"] = target
        elif kind == "apple-mobileconfig":
            mapping["payloadType"] = target
        exact_mappings.append(mapping)

    def add_candidate(kind: str, target: str, field_paths: list[str], note: str) -> None:
        candidates.append({"kind": kind, "target": target, "fieldPaths": field_paths})
        notes.append(note)

    if benchmark.platform == "ANDROID_ENTERPRISE":
        if "developer options" in normalized_title and recommended_value == "Disabled":
            add_exact("relution-native", "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", ["developerSettings"], {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"})
        elif "install unknown apps" in normalized_title and recommended_value == "Disabled":
            add_exact("relution-native", "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", ["untrustedAppsPolicy"], {"untrustedAppsPolicy": "DISALLOW_INSTALL"})
        elif "scan device for security threats" in normalized_title and recommended_value == "Enabled":
            add_exact("relution-native", "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", ["googlePlayProtectVerifyApps"], {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"})
        elif "camera" in normalized_title and recommended_value == "Disabled":
            add_exact("relution-native", "ANDROID_ENTERPRISE_DISABLE_CAMERAS", ["cameraDisabled"], {"cameraDisabled": True})
        if not exact_mappings:
            for mapping in android_relution_analog_mappings_for(benchmark.platform, title, recommended_value):
                candidates.append(candidate_from_mapping(mapping))
                exact_mappings.append(mapping)

    if benchmark.platform == "IOS":
        if "force encrypted backup" in normalized_title and recommended_value in {"Enabled", "Yes"}:
            add_exact("relution-native", "IOS_RESTRICTION", ["forceEncryptedBackup"], {"forceEncryptedBackup": True})
        elif ("allow icloud backup" in normalized_title and recommended_value == "Disabled") or ("block icloud backup" in normalized_title and recommended_value == "Yes"):
            add_exact("relution-native", "IOS_RESTRICTION", ["allowCloudBackup"], {"allowCloudBackup": False})
        elif ("allow icloud documents & data" in normalized_title and recommended_value == "Disabled") or ("block icloud document and data sync" in normalized_title and recommended_value == "Yes"):
            add_exact("relution-native", "IOS_RESTRICTION", ["allowCloudDocumentSync"], {"allowCloudDocumentSync": False})
        elif ("allow managed apps to store data in icloud" in normalized_title and recommended_value == "Disabled") or ("block managed apps from storing data in icloud" in normalized_title and recommended_value == "Yes"):
            add_exact("relution-native", "IOS_RESTRICTION", ["allowManagedAppsCloudSync"], {"allowManagedAppsCloudSync": False})
        elif "minimum password length" in normalized_title:
            minimum_match = re.search(r"(\d+)", recommended_value or title)
            if minimum_match is not None:
                minimum = int(minimum_match.group(1))
                add_exact("relution-native", "IOS_PASSCODE", ["minLength"], {"minLength": minimum}, [{"path": "minLength", "operator": "atLeast", "value": minimum}])
        elif "block simple passwords" in normalized_title and recommended_value == "Yes":
            add_exact("relution-native", "IOS_PASSCODE", ["allowSimple"], {"allowSimple": False})
        elif "block touch id and face id unlock" in normalized_title and recommended_value == "Yes":
            add_exact("relution-native", "IOS_RESTRICTION", ["allowFingerprintForUnlock"], {"allowFingerprintForUnlock": False})
        elif "require safari fraud warnings" in normalized_title and recommended_value == "Yes":
            add_exact("apple-schema-profile", "profile:com.apple.applicationaccess", ["safariForceFraudWarning"], {"safariForceFraudWarning": True})
        elif "block icloud photos sync" in normalized_title and recommended_value == "Yes":
            add_exact("apple-schema-profile", "profile:com.apple.applicationaccess", ["allowCloudPhotoLibrary"], {"allowCloudPhotoLibrary": False})
        elif "require airplay outgoing requests pairing password" in normalized_title and recommended_value == "Yes":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["forceAirPlayOutgoingRequestsPairingPassword"],
                {"forceAirPlayOutgoingRequestsPairingPassword": True},
            )
        elif "require password" in normalized_title and recommended_value == "Yes":
            add_exact("apple-schema-profile", "profile:com.apple.mobiledevice.passwordpolicy", ["forcePIN"], {"forcePIN": True})
        elif "required password type" in normalized_title and recommended_value == "Alphanumeric":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.mobiledevice.passwordpolicy",
                ["requireAlphanumeric"],
                {"requireAlphanumeric": True},
            )
        elif "maximum minutes after screen lock before password is required" in normalized_title and recommended_value == "Immediately":
            add_exact("apple-schema-profile", "profile:com.apple.mobiledevice.passwordpolicy", ["maxGracePeriod"], {"maxGracePeriod": 0})
        elif "block icloud keychain sync" in normalized_title and recommended_value == "Yes":
            add_exact("apple-schema-profile", "profile:com.apple.applicationaccess", ["allowCloudKeychainSync"], {"allowCloudKeychainSync": False})
        elif (
            "block password proximity requests" in normalized_title and recommended_value == "Yes"
        ) or (
            "allow proximity based password sharing requests" in normalized_title and recommended_value == "Disabled"
        ):
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["allowPasswordProximityRequests"],
                {"allowPasswordProximityRequests": False},
            )
        elif ("block password sharing" in normalized_title and recommended_value == "Yes") or (
            "allow password sharing" in normalized_title and recommended_value == "Disabled"
        ):
            add_exact("apple-schema-profile", "profile:com.apple.applicationaccess", ["allowPasswordSharing"], {"allowPasswordSharing": False})
        elif "authentication for autofill" in normalized_title and recommended_value == "Yes":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["forceAuthenticationBeforeAutoFill"],
                {"forceAuthenticationBeforeAutoFill": True},
            )

    if benchmark.platform == "MACOS":
        if title == "Ensure Firewall Is Enabled":
            add_exact("relution-native", "MACOS_FIREWALL", ["enableFirewall"], {"enableFirewall": True})
        elif title == "Ensure FileVault Is Enabled":
            add_exact("relution-native", "MACOS_FILE_VAULT", ["enabled"], {"enabled": True})
        elif title == "Ensure Download New Updates When Available Is Enabled":
            add_exact("apple-schema-profile", "profile:com.apple.SoftwareUpdate", ["AutomaticDownload"], {"AutomaticDownload": True})
        elif title == "Ensure Install of macOS Updates Is Enabled":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.SoftwareUpdate",
                ["AutomaticallyInstallMacOSUpdates"],
                {"AutomaticallyInstallMacOSUpdates": True},
            )
        elif title == "Ensure Install Application Updates from the App Store Is Enabled":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.SoftwareUpdate",
                ["AutomaticallyInstallAppUpdates"],
                {"AutomaticallyInstallAppUpdates": True},
            )
        elif title == "Ensure Install Security Responses and System Files Is Enabled":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.SoftwareUpdate",
                ["CriticalUpdateInstall", "ConfigDataInstall"],
                {"CriticalUpdateInstall": True, "ConfigDataInstall": True},
            )
        elif title == "Ensure Firewall Stealth Mode Is Enabled":
            add_exact(
                "apple-schema-profile",
                "profile:com.apple.security.firewall",
                ["EnableFirewall", "EnableStealthMode"],
                {"EnableFirewall": True, "EnableStealthMode": True},
            )
        elif title == "Ensure Login Window Displays as Name and Password Is Enabled":
            add_exact("apple-schema-profile", "profile:com.apple.loginwindow", ["SHOWFULLNAME"], {"SHOWFULLNAME": True})
        elif "password history is set to at least 24" in normalized_title:
            add_exact("relution-native", "IOS_PASSCODE", ["pinHistory"], {"pinHistory": 24}, [{"path": "pinHistory", "operator": "atLeast", "value": 24}])
        elif "software update deferment" in normalized_title:
            add_candidate(
                "relution-native",
                "MACOS_RESTRICTION",
                ["forceDelayedSoftwareUpdates", "enforcedSoftwareUpdateDelay"],
                "Relution exposes deferral controls, but the CIS recommendation allows any value up to 30 days and may require organization-specific update cadence decisions.",
            )

    if benchmark.platform in {"IOS", "MACOS"} and not exact_mappings:
        for mapping in apple_schema_analog_mappings_for(
            benchmark.platform,
            title,
            recommended_value,
            extra_texts=(),
        ):
            candidates.append(candidate_from_mapping(mapping))
            exact_mappings.append(mapping)

    if benchmark.benchmark_id == "cis-microsoft-windows-11-standalone-5-0-0":
        if "enforce password history" in normalized_title:
            add_exact("relution-native", "WINDOWS_PASSCODE", ["history"], {"history": 24}, [{"path": "history", "operator": "atLeast", "value": 24}])
        elif "minimum password length" in normalized_title and "relax minimum password length limits" not in normalized_title:
            add_exact("relution-native", "WINDOWS_PASSCODE", ["minLength"], {"minLength": 14}, [{"path": "minLength", "operator": "atLeast", "value": 14}])
        elif "allow use of camera" in normalized_title and recommended_value == "Disabled":
            add_exact("relution-native", "WINDOWS_RESTRICTION", ["allowCamera"], {"allowCamera": False})

    if benchmark.benchmark_id == "cis-microsoft-defender-antivirus-1-0-0":
        if "turn on behavior monitoring" in normalized_title and recommended_value == "Enabled":
            add_exact("relution-native", "WINDOWS_ANTIVIRUS", ["allowBehaviorMonitoring"], {"allowBehaviorMonitoring": True})
        elif "turn on script scanning" in normalized_title and recommended_value == "Enabled":
            add_exact("relution-native", "WINDOWS_ANTIVIRUS", ["allowScriptScanning"], {"allowScriptScanning": True})
        elif "potentially unwanted applications" in normalized_title and "block" in (recommended_value or "").lower():
            add_exact("relution-native", "WINDOWS_ANTIVIRUS", ["puaProtection"], {"puaProtection": "ON"})
        elif "dangerous websites" in normalized_title and "block" in (recommended_value or "").lower():
            add_exact("relution-native", "WINDOWS_ANTIVIRUS", ["enableNetworkProtection"], {"enableNetworkProtection": "ON"})
        elif "join microsoft maps" in normalized_title:
            add_candidate(
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["allowCloudProtection"],
                "MAPS enrollment is related to cloud protection, but the Relution Windows antivirus template only exposes a coarse cloud-protection toggle rather than the CIS MAPS membership level.",
            )

    if benchmark.platform == "WINDOWS" and not exact_mappings:
        rexp_mapping = windows_custom_csp_mapping_for(
            title,
            recommended_value,
            windows_rexp_evidence,
            require_simple_state_match=True,
        )
        if rexp_mapping is not None:
            candidates.append(candidate_from_mapping(rexp_mapping))
            exact_mappings.append(rexp_mapping)

    allowed_kinds = {"relution-native", "apple-schema-profile"} if benchmark.platform in {"IOS", "MACOS"} else {"relution-native"}
    windows_service_control = benchmark.platform == "WINDOWS" and "service" in normalized_title
    if not exact_mappings and not windows_service_control:
        inferred_exact = infer_exact_boolean_mapping(
            benchmark.platform,
            title,
            recommended_value,
            field_index,
            extra_texts=extra_texts,
            allowed_kinds=allowed_kinds,
        )
        if inferred_exact is not None:
            candidates.append(candidate_from_mapping(inferred_exact))
            exact_mappings.append(inferred_exact)

    if exact_mappings:
        return {
            "status": "exact",
            "mergeableInImportableRuleset": True,
            "candidates": merge_candidates(candidates, semantic_candidates),
            "rulesetMappings": exact_mappings,
            "notes": notes,
        }

    mobileconfig_candidates = apple_mobileconfig_candidates_for(
        benchmark.platform,
        title,
        extra_texts=(str(sections.get("remediation", "")), *extra_texts),
        evidence_index=apple_mobileconfig_evidence,
    )
    android_candidates = android_relution_candidates_for(
        benchmark.platform,
        title,
        extra_texts=extra_texts,
    )
    inferred_candidates = [] if windows_service_control else mapping_candidates(
        benchmark.platform,
        title,
        benchmark.benchmark_title,
        field_index,
        None,
        extra_texts=extra_texts,
        recommended_value=recommended_value,
        allowed_kinds=allowed_kinds,
    )
    matched_candidates = merge_candidates([*candidates, *mobileconfig_candidates, *android_candidates, *inferred_candidates])
    candidates = merge_candidates(matched_candidates, semantic_candidates)
    if matched_candidates and not notes:
        notes.append("Bilingual/type-aware setting matching found related Relution/Apple settings, but this recommendation is not exact without a verified value/polarity match.")
    if candidates:
        if semantic_candidates and not matched_candidates:
            notes.append("Semantic concept matching found related Relution support surfaces, but no exact CIS remediation value was inferred.")
        return {
            "status": "suggested" if matched_candidates else "partial",
            "mergeableInImportableRuleset": False,
            "candidates": candidates,
            "rulesetMappings": [],
            "notes": notes,
        }
    return {
        "status": "none",
        "mergeableInImportableRuleset": False,
        "candidates": [],
        "rulesetMappings": [],
        "notes": [],
    }


def candidate_from_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    if mapping.get("kind") == "relution-native":
        target = str(mapping.get("type", ""))
    elif mapping.get("kind") == "apple-schema-profile":
        target = str(mapping.get("schemaId", ""))
    else:
        target = str(mapping.get("payloadType", ""))
    candidate: dict[str, Any] = {
        "kind": mapping.get("kind", ""),
        "target": target,
        "fieldPaths": flatten_value_paths(mapping.get("values", {})),
    }
    if isinstance(mapping.get("match"), dict):
        candidate["match"] = mapping["match"]
    return candidate


def merge_candidates(*candidate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()
    for candidate in [candidate for group in candidate_groups for candidate in group]:
        key = (
            str(candidate.get("kind", "")),
            str(candidate.get("target", "")),
            tuple(str(path) for path in candidate.get("fieldPaths", [])),
        )
        if key in seen:
            continue
        seen.add(key)
        merged.append(candidate)
    return merged[:8]


def build_ruleset(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    policies: list[dict[str, Any]] = []
    by_benchmark: dict[str, list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        by_benchmark.setdefault(recommendation["benchmarkId"], []).append(recommendation)

    for benchmark in BENCHMARKS:
        entries = by_benchmark[benchmark.benchmark_id]
        aggregate_rules = build_aggregate_rules(benchmark, entries)
        informational_rules = [
            {
                "id": entry["id"],
                "title": f'{entry["recommendationId"]} {entry["title"]}',
                "informational": True,
                "reason": entry["rationale"] or entry["description"],
                "recommendedValue": entry["recommendedValue"],
                "assessmentStatus": entry["assessmentStatus"],
                "mappingStatus": entry["relutionMapping"]["status"],
                "sourceIds": entry["sourceIds"],
                "mappings": [],
            }
            for entry in entries
        ]
        policies.append(
            {
                "platform": benchmark.platform,
                "name": benchmark.benchmark_title,
                "description": f"{benchmark.benchmark_title} v{benchmark.version} harvested from the saved PDF corpus.",
                "benchmarkId": benchmark.benchmark_id,
                "sourcePdfPath": benchmark.source_pdf_path,
                "rules": informational_rules + aggregate_rules,
            }
        )

    return {
        "version": 1,
        "name": "CIS Benchmark OS Baselines",
        "verifiedAsOf": "2026-04-24",
        "sourceIndexPath": "example/cis-references/sources.json",
        "recommendationCatalogPath": "example/cis-references/cis-recommendations.json",
        "policies": policies,
    }


def build_aggregate_rules(benchmark: BenchmarkSpec, recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for recommendation in recommendations:
        relution_mapping = recommendation["relutionMapping"]
        if relution_mapping["status"] != "exact":
            continue
        for mapping in relution_mapping["rulesetMappings"]:
            if mapping["kind"] != "relution-native":
                continue
            target = mapping["type"]
            group = groups.setdefault(
                target,
                {
                    "kind": mapping["kind"],
                    "type": mapping["type"],
                    "values": {},
                    "recommendationIds": [],
                    "titles": [],
                },
            )
            conflict = False
            for key, value in mapping["values"].items():
                if key in group["values"] and group["values"][key] != value:
                    conflict = True
                    break
            if conflict:
                continue
            group["values"].update(mapping["values"])
            group["recommendationIds"].append(recommendation["recommendationId"])
            group["titles"].append(recommendation["title"])
    rules: list[dict[str, Any]] = []
    for target, group in groups.items():
        if not group["values"]:
            continue
        rules.append(
            {
                "id": f"{benchmark.benchmark_id}-aggregate-{slugify(target)}",
                "title": f"Relution aggregate: {target}",
                "informational": False,
                "reason": f"Aggregates exact Relution mappings from {', '.join(group['recommendationIds'])}.",
                "sourceIds": [benchmark.benchmark_id],
                "mappings": [
                    {
                        "kind": group["kind"],
                        "type": group["type"],
                        "values": group["values"],
                    }
                ],
            }
        )
    return rules


def build_baseline_summary(sources: dict[str, dict[str, Any]], recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    current_families = {
        "windows": {
            "familySourceId": "cis-windows-desktop-family",
            "currentVersions": sources["cis-windows-desktop-family"]["current_versions"],
        },
        "android": {
            "familySourceId": "cis-google-android-family",
            "currentVersions": sources["cis-google-android-family"]["current_versions"],
        },
        "ios": {
            "familySourceId": "cis-apple-ios-family",
            "currentVersions": sources["cis-apple-ios-family"]["current_versions"],
        },
        "macos": {
            "familySourceId": "cis-apple-macos-family",
            "currentVersions": sources["cis-apple-macos-family"]["current_versions"],
        },
    }
    recommendation_counts: dict[str, int] = {}
    helper_fallback_counts: dict[str, Any] = {
        "total": 0,
        "byPlatform": {},
        "byMethod": {},
    }
    for recommendation in recommendations:
        recommendation_counts[recommendation["platform"]] = recommendation_counts.get(recommendation["platform"], 0) + 1
        for fallback in recommendation.get("helperFallbacks", []):
            helper_fallback_counts["total"] += 1
            helper_fallback_counts["byPlatform"][recommendation["platform"]] = helper_fallback_counts["byPlatform"].get(recommendation["platform"], 0) + 1
            helper_fallback_counts["byMethod"][fallback["method"]] = helper_fallback_counts["byMethod"].get(fallback["method"], 0) + 1
    return {
        "verifiedAsOf": "2026-04-23",
        "sourceIndexPath": "example/cis-references/sources.json",
        "downloadManifestPath": "example/cis-references/downloads/manifest.json",
        "harvestedBenchmarkPdfs": [
            {
                "benchmarkId": benchmark.benchmark_id,
                "benchmarkTitle": benchmark.benchmark_title,
                "sourcePdfPath": benchmark.source_pdf_path,
                "version": benchmark.version,
                "documentDate": benchmark.document_date,
                "platform": benchmark.platform,
                "managementSurface": benchmark.management_surface,
            }
            for benchmark in BENCHMARKS
        ],
        "currentFamilies": current_families,
        "recommendationCatalogPath": "example/cis-references/cis-recommendations.json",
        "importableRulesetPath": "example/cis-references/cis-relution-ruleset.json",
        "recommendationCounts": {
            "total": len(recommendations),
            "byPlatform": recommendation_counts,
        },
        "helperFallbackCounts": helper_fallback_counts,
    }


def update_readme() -> None:
    readme = README_PATH.read_text(encoding="utf8")
    readme = readme.replace(
        "- `cis-relution-baseline.json`: machine-readable CIS family summary plus harvested PDF coverage and recommendation counts.",
        "- `cis-relution-baseline.json`: machine-readable CIS family summary plus harvested PDF coverage, recommendation counts, and helper fallback counts.",
    )
    readme = readme.replace(
        "- `cis-recommendations.json`: full recommendation catalog harvested from the saved benchmark PDFs, including profile applicability, description/rationale/audit/remediation text, and Relution mapping metadata.",
        "- `cis-recommendations.json`: full recommendation catalog harvested from the saved benchmark PDFs, including profile applicability, description/rationale/audit/remediation text, helper fallback methods for Windows/macOS, and Relution mapping metadata.",
    )
    README_PATH.write_text(readme, encoding="utf8")


def unique_preserving_order(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def normalize_space(value: str) -> str:
    return " ".join(value.split())


def slugify(value: str) -> str:
    slug = value.lower().replace(".", "-").replace("_", "-")
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()

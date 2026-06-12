"""Map harvested CIS benchmark recommendations to Relution artifacts."""

from __future__ import annotations

import re
from typing import Any

from recommendation_mapping import (
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    apple_mobileconfig_candidates_for,
    apple_schema_analog_mappings_for,
    candidate_from_mapping,
    infer_exact_boolean_mapping,
    mapping_candidates,
    merge_candidate_lists,
    windows_custom_csp_mapping_for,
)

from _harvest_cis_benchmarks_modules.common import (
    BENCHMARKS,
    BenchmarkSpec,
    build_helper_fallback,
    extract_excerpt,
    extract_powershell_commands,
    is_terminal_stop_line,
    normalize_space,
    slugify,
    trim_at_markers,
    unique_preserving_order,
    unique_profile_keys,
    write_json,
)
from _harvest_cis_benchmarks_modules.mapping_outputs import (
    build_baseline_summary,
    update_readme,
)

__all__ = [
    "build_baseline_summary",
    "build_helper_fallback",
    "extract_excerpt",
    "extract_powershell_commands",
    "is_terminal_stop_line",
    "mapping_for",
    "normalize_space",
    "slugify",
    "trim_at_markers",
    "unique_preserving_order",
    "unique_profile_keys",
    "update_readme",
    "write_json",
]


def mapping_for(context: dict[str, Any]) -> dict[str, Any]:
    """Build the Relution mapping response for one harvested CIS recommendation."""
    benchmark = context["benchmark"]
    title = context["title"]
    recommended_value = context["recommendedValue"]
    sections = context["sections"]
    normalized_title = title.lower()
    acc: dict[str, list[dict[str, Any]] | list[str]] = {
        "exactMappings": [],
        "candidates": [],
        "notes": [],
    }
    extra_texts = (
        str(sections.get("description", "")),
        str(sections.get("rationale", "")),
    )

    add_curated_exact_mappings(
        acc, benchmark, normalized_title, title, recommended_value
    )
    add_analog_mappings(acc, benchmark, title, recommended_value)
    add_windows_rexp_mapping(
        acc, benchmark, title, recommended_value, context["windowsRexpEvidence"]
    )

    allowed_kinds = (
        {"relution-native", "apple-schema-profile"}
        if benchmark.platform in {"IOS", "MACOS"}
        else {"relution-native"}
    )
    windows_service_control = (
        benchmark.platform == "WINDOWS" and "service" in normalized_title
    )
    if not acc["exactMappings"] and not windows_service_control:
        inferred_exact = infer_exact_boolean_mapping(
            benchmark.platform,
            title,
            recommended_value,
            context["fieldIndex"],
            {"extraTexts": extra_texts, "allowedKinds": allowed_kinds},
        )
        if inferred_exact is not None:
            add_mapping(acc, inferred_exact)

    if acc["exactMappings"]:
        return {
            "status": "exact",
            "mergeableInImportableRuleset": True,
            "candidates": merge_candidates(
                acc["candidates"], context["semanticCandidates"]
            ),
            "rulesetMappings": acc["exactMappings"],
            "notes": acc["notes"],
        }

    return suggested_mapping_response(
        {
            "acc": acc,
            "benchmark": benchmark,
            "title": title,
            "recommendedValue": recommended_value,
            "sections": sections,
            "fieldIndex": context["fieldIndex"],
            "appleMobileconfigEvidence": context["appleMobileconfigEvidence"],
            "semanticCandidates": context["semanticCandidates"],
            "allowedKinds": allowed_kinds,
            "windowsServiceControl": windows_service_control,
            "extraTexts": extra_texts,
        }
    )


def add_exact(
    acc: dict[str, list[dict[str, Any]] | list[str]], spec: tuple[Any, ...]
) -> None:
    """Add a curated exact mapping and its candidate target to the accumulator."""
    kind, target, field_paths, values, *rest = spec
    constraints = rest[0] if rest else None
    acc["candidates"].append(
        {"kind": kind, "target": target, "fieldPaths": field_paths}
    )
    mapping: dict[str, Any] = {"kind": kind, "values": values}
    if constraints:
        mapping["constraints"] = constraints
    if kind == "relution-native":
        mapping["type"] = target
    elif kind == "apple-schema-profile":
        mapping["schemaId"] = target
    elif kind == "apple-mobileconfig":
        mapping["payloadType"] = target
    acc["exactMappings"].append(mapping)


def add_candidate(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    kind: str,
    target: str,
    field_paths: list[str],
    note: str,
) -> None:
    """Add a non-exact candidate target and explanatory note."""
    acc["candidates"].append(
        {"kind": kind, "target": target, "fieldPaths": field_paths}
    )
    acc["notes"].append(note)


def add_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]], mapping: dict[str, Any]
) -> None:
    """Add an already rendered exact mapping to the accumulator."""
    acc["candidates"].append(candidate_from_mapping(mapping))
    acc["exactMappings"].append(mapping)


def add_curated_exact_mappings(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply benchmark-family-specific curated exact mapping rules."""
    if benchmark.platform == "ANDROID_ENTERPRISE":
        add_android_curated_mapping(
            acc, normalized_title, title, recommended_value, benchmark.platform
        )
    if benchmark.platform == "IOS":
        add_ios_curated_mapping(acc, normalized_title, title, recommended_value)
    if benchmark.platform == "MACOS":
        add_macos_curated_mapping(acc, normalized_title, title)
    if benchmark.benchmark_id == "cis-microsoft-windows-11-standalone-5-0-0":
        add_windows_standalone_mapping(acc, normalized_title, recommended_value)
    if benchmark.benchmark_id == "cis-microsoft-defender-antivirus-1-0-0":
        add_windows_defender_mapping(acc, normalized_title, recommended_value)


def add_android_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
    platform: str,
) -> None:
    """Apply curated Android Enterprise exact and analog mapping rules."""
    if "developer options" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["developerSettings"],
                {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"},
            ),
        )
    elif "install unknown apps" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["untrustedAppsPolicy"],
                {"untrustedAppsPolicy": "DISALLOW_INSTALL"},
            ),
        )
    elif (
        "scan device for security threats" in normalized_title
        and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                ["googlePlayProtectVerifyApps"],
                {"googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"},
            ),
        )
    elif "camera" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
                ["cameraDisabled"],
                {"cameraDisabled": True},
            ),
        )
    if not acc["exactMappings"]:
        for mapping in android_relution_analog_mappings_for(
            platform, title, recommended_value
        ):
            add_mapping(acc, mapping)


def add_ios_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply direct iOS/iPadOS restriction and passcode mapping rules."""
    ios_rules = [
        (
            "force encrypted backup",
            {"forceEncryptedBackup": True},
            "relution-native",
            "IOS_RESTRICTION",
            ["forceEncryptedBackup"],
            {"Enabled", "Yes"},
        ),
        (
            "block simple passwords",
            {"allowSimple": False},
            "relution-native",
            "IOS_PASSCODE",
            ["allowSimple"],
            {"Yes"},
        ),
        (
            "block touch id and face id unlock",
            {"allowFingerprintForUnlock": False},
            "relution-native",
            "IOS_RESTRICTION",
            ["allowFingerprintForUnlock"],
            {"Yes"},
        ),
        (
            "require safari fraud warnings",
            {"safariForceFraudWarning": True},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["safariForceFraudWarning"],
            {"Yes"},
        ),
        (
            "block icloud photos sync",
            {"allowCloudPhotoLibrary": False},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["allowCloudPhotoLibrary"],
            {"Yes"},
        ),
        (
            "require password",
            {"forcePIN": True},
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
            ["forcePIN"],
            {"Yes"},
        ),
        (
            "required password type",
            {"requireAlphanumeric": True},
            "apple-schema-profile",
            "profile:com.apple.mobiledevice.passwordpolicy",
            ["requireAlphanumeric"],
            {"Alphanumeric"},
        ),
        (
            "block icloud keychain sync",
            {"allowCloudKeychainSync": False},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["allowCloudKeychainSync"],
            {"Yes"},
        ),
        (
            "authentication for autofill",
            {"forceAuthenticationBeforeAutoFill": True},
            "apple-schema-profile",
            "profile:com.apple.applicationaccess",
            ["forceAuthenticationBeforeAutoFill"],
            {"Yes"},
        ),
    ]
    for phrase, values, kind, target, field_paths, accepted_values in ios_rules:
        if phrase in normalized_title and recommended_value in accepted_values:
            add_exact(acc, (kind, target, field_paths, values))
            return
    add_ios_special_mapping(acc, normalized_title, title, recommended_value)


def add_ios_special_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    title: str,
    recommended_value: str | None,
) -> None:
    """Apply iOS/iPadOS mappings that need phrase-specific handling."""
    if add_ios_icloud_mapping(acc, normalized_title, recommended_value):
        return
    if "minimum password length" in normalized_title:
        add_minimum_ios_password_length(acc, recommended_value, title)
    elif (
        "require airplay outgoing requests pairing password" in normalized_title
        and recommended_value == "Yes"
    ):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["forceAirPlayOutgoingRequestsPairingPassword"],
                {"forceAirPlayOutgoingRequestsPairingPassword": True},
            ),
        )
    elif (
        "maximum minutes after screen lock before password is required"
        in normalized_title
        and recommended_value == "Immediately"
    ):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.mobiledevice.passwordpolicy",
                ["maxGracePeriod"],
                {"maxGracePeriod": 0},
            ),
        )
    elif ios_password_proximity_disabled(normalized_title, recommended_value):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["allowPasswordProximityRequests"],
                {"allowPasswordProximityRequests": False},
            ),
        )
    elif ios_password_sharing_disabled(normalized_title, recommended_value):
        add_exact(
            acc,
            (
                "apple-schema-profile",
                "profile:com.apple.applicationaccess",
                ["allowPasswordSharing"],
                {"allowPasswordSharing": False},
            ),
        )


def add_ios_icloud_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> bool:
    """Map CIS iCloud allow/block phrasing to Relution restriction fields."""
    icloud_rules = [
        (
            ("allow icloud backup", "Disabled"),
            ("block icloud backup", "Yes"),
            ["allowCloudBackup"],
            {"allowCloudBackup": False},
        ),
        (
            ("allow icloud documents & data", "Disabled"),
            ("block icloud document and data sync", "Yes"),
            ["allowCloudDocumentSync"],
            {"allowCloudDocumentSync": False},
        ),
        (
            ("allow managed apps to store data in icloud", "Disabled"),
            ("block managed apps from storing data in icloud", "Yes"),
            ["allowManagedAppsCloudSync"],
            {"allowManagedAppsCloudSync": False},
        ),
    ]
    for disabled_phrase, block_phrase, field_paths, values in icloud_rules:
        if phrase_value_matches(
            normalized_title, recommended_value, disabled_phrase
        ) or phrase_value_matches(normalized_title, recommended_value, block_phrase):
            add_exact(acc, ("relution-native", "IOS_RESTRICTION", field_paths, values))
            return True
    return False


def phrase_value_matches(
    normalized_title: str, recommended_value: str | None, phrase_value: tuple[str, str]
) -> bool:
    """Return whether title and recommended value match one phrase/value pair."""
    phrase, expected = phrase_value
    return phrase in normalized_title and recommended_value == expected


def ios_password_proximity_disabled(
    normalized_title: str, recommended_value: str | None
) -> bool:
    """Recognize CIS phrasings that disable password proximity requests."""
    return phrase_value_matches(
        normalized_title,
        recommended_value,
        ("block password proximity requests", "Yes"),
    ) or phrase_value_matches(
        normalized_title,
        recommended_value,
        ("allow proximity based password sharing requests", "Disabled"),
    )


def ios_password_sharing_disabled(
    normalized_title: str, recommended_value: str | None
) -> bool:
    """Recognize CIS phrasings that disable password sharing."""
    return phrase_value_matches(
        normalized_title, recommended_value, ("block password sharing", "Yes")
    ) or phrase_value_matches(
        normalized_title, recommended_value, ("allow password sharing", "Disabled")
    )


def add_minimum_ios_password_length(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    recommended_value: str | None,
    title: str,
) -> None:
    """Add iOS passcode minimum-length mapping when a numeric value is present."""
    minimum_match = re.search(r"(\d+)", recommended_value or title)
    if minimum_match is not None:
        minimum = int(minimum_match.group(1))
        add_exact(
            acc,
            (
                "relution-native",
                "IOS_PASSCODE",
                ["minLength"],
                {"minLength": minimum},
                [{"path": "minLength", "operator": "atLeast", "value": minimum}],
            ),
        )


def add_macos_curated_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]], normalized_title: str, title: str
) -> None:
    """Apply direct macOS native and Apple profile mapping rules."""
    macos_rules = {
        "Ensure Firewall Is Enabled": (
            "relution-native",
            "MACOS_FIREWALL",
            ["enableFirewall"],
            {"enableFirewall": True},
        ),
        "Ensure FileVault Is Enabled": (
            "relution-native",
            "MACOS_FILE_VAULT",
            ["enabled"],
            {"enabled": True},
        ),
        "Ensure Download New Updates When Available Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticDownload"],
            {"AutomaticDownload": True},
        ),
        "Ensure Install of macOS Updates Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticallyInstallMacOSUpdates"],
            {"AutomaticallyInstallMacOSUpdates": True},
        ),
        "Ensure Install Application Updates from the App Store Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["AutomaticallyInstallAppUpdates"],
            {"AutomaticallyInstallAppUpdates": True},
        ),
        "Ensure Install Security Responses and System Files Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.SoftwareUpdate",
            ["CriticalUpdateInstall", "ConfigDataInstall"],
            {"CriticalUpdateInstall": True, "ConfigDataInstall": True},
        ),
        "Ensure Firewall Stealth Mode Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.security.firewall",
            ["EnableFirewall", "EnableStealthMode"],
            {"EnableFirewall": True, "EnableStealthMode": True},
        ),
        "Ensure Login Window Displays as Name and Password Is Enabled": (
            "apple-schema-profile",
            "profile:com.apple.loginwindow",
            ["SHOWFULLNAME"],
            {"SHOWFULLNAME": True},
        ),
    }
    if title in macos_rules:
        kind, target, field_paths, values = macos_rules[title]
        add_exact(acc, (kind, target, field_paths, values))
    elif "password history is set to at least 24" in normalized_title:
        add_exact(
            acc,
            (
                "relution-native",
                "IOS_PASSCODE",
                ["pinHistory"],
                {"pinHistory": 24},
                [{"path": "pinHistory", "operator": "atLeast", "value": 24}],
            ),
        )
    elif "software update deferment" in normalized_title:
        add_candidate(
            acc,
            "relution-native",
            "MACOS_RESTRICTION",
            ["forceDelayedSoftwareUpdates", "enforcedSoftwareUpdateDelay"],
            (
                "Relution exposes deferral controls, but the CIS recommendation allows any "
                "value up to 30 days and may require organization-specific update cadence "
                "decisions."
            ),
        )


def add_windows_standalone_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> None:
    """Apply curated Windows standalone password and camera mappings."""
    if "enforce password history" in normalized_title:
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_PASSCODE",
                ["history"],
                {"history": 24},
                [{"path": "history", "operator": "atLeast", "value": 24}],
            ),
        )
    elif (
        "minimum password length" in normalized_title
        and "relax minimum password length limits" not in normalized_title
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_PASSCODE",
                ["minLength"],
                {"minLength": 14},
                [{"path": "minLength", "operator": "atLeast", "value": 14}],
            ),
        )
    elif "allow use of camera" in normalized_title and recommended_value == "Disabled":
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_RESTRICTION",
                ["allowCamera"],
                {"allowCamera": False},
            ),
        )


def add_windows_defender_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    normalized_title: str,
    recommended_value: str | None,
) -> None:
    """Apply curated Microsoft Defender Antivirus mappings."""
    if (
        "turn on behavior monitoring" in normalized_title
        and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["allowBehaviorMonitoring"],
                {"allowBehaviorMonitoring": True},
            ),
        )
    elif (
        "turn on script scanning" in normalized_title and recommended_value == "Enabled"
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["allowScriptScanning"],
                {"allowScriptScanning": True},
            ),
        )
    elif (
        "potentially unwanted applications" in normalized_title
        and "block" in (recommended_value or "").lower()
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["puaProtection"],
                {"puaProtection": "ON"},
            ),
        )
    elif (
        "dangerous websites" in normalized_title
        and "block" in (recommended_value or "").lower()
    ):
        add_exact(
            acc,
            (
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                ["enableNetworkProtection"],
                {"enableNetworkProtection": "ON"},
            ),
        )
    elif "join microsoft maps" in normalized_title:
        add_candidate(
            acc,
            "relution-native",
            "WINDOWS_ANTIVIRUS",
            ["allowCloudProtection"],
            (
                "MAPS enrollment is related to cloud protection, but the Relution Windows "
                "antivirus template only exposes a coarse cloud-protection toggle rather than "
                "the CIS MAPS membership level."
            ),
        )


def add_analog_mappings(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    title: str,
    recommended_value: str | None,
) -> None:
    """Add curated Apple analog mappings when no exact mapping exists."""
    if benchmark.platform in {"IOS", "MACOS"} and not acc["exactMappings"]:
        for mapping in apple_schema_analog_mappings_for(
            benchmark.platform, title, recommended_value, extra_texts=()
        ):
            add_mapping(acc, mapping)


def add_windows_rexp_mapping(
    acc: dict[str, list[dict[str, Any]] | list[str]],
    benchmark: BenchmarkSpec,
    title: str,
    recommended_value: str | None,
    windows_rexp_evidence: dict[frozenset[str], list[dict[str, Any]]],
) -> None:
    """Add Windows custom-CSP evidence mappings when they match exactly."""
    if benchmark.platform != "WINDOWS" or acc["exactMappings"]:
        return
    rexp_mapping = windows_custom_csp_mapping_for(
        title, recommended_value, windows_rexp_evidence, require_simple_state_match=True
    )
    if rexp_mapping is not None:
        add_mapping(acc, rexp_mapping)


def suggested_mapping_response(context: dict[str, Any]) -> dict[str, Any]:
    """Build suggested or partial mapping output from inferred candidates."""
    benchmark = context["benchmark"]
    title = context["title"]
    extra_texts = context["extraTexts"]
    mobileconfig_candidates = apple_mobileconfig_candidates_for(
        benchmark.platform,
        title,
        extra_texts=(str(context["sections"].get("remediation", "")), *extra_texts),
        evidence_index=context["appleMobileconfigEvidence"],
    )
    android_candidates = android_relution_candidates_for(
        benchmark.platform, title, extra_texts=extra_texts
    )
    inferred_candidates = (
        []
        if context["windowsServiceControl"]
        else mapping_candidates(
            benchmark.platform,
            title,
            benchmark.benchmark_title,
            context["fieldIndex"],
            {
                "extraTexts": extra_texts,
                "recommendedValue": context["recommendedValue"],
                "allowedKinds": context["allowedKinds"],
            },
        )
    )
    matched_candidates = merge_candidates(
        [
            *context["acc"]["candidates"],
            *mobileconfig_candidates,
            *android_candidates,
            *inferred_candidates,
        ]
    )
    candidates = merge_candidates(matched_candidates, context["semanticCandidates"])
    notes = context["acc"]["notes"]
    if matched_candidates and not notes:
        notes.append(
            (
                "Bilingual/type-aware setting matching found related Relution/Apple settings, "
                "but this recommendation is not exact without a verified value/polarity match."
            )
        )
    if candidates:
        if context["semanticCandidates"] and not matched_candidates:
            notes.append(
                (
                    "Semantic concept matching found related Relution support surfaces, but no "
                    "exact CIS remediation value was inferred."
                )
            )
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


def merge_candidates(*candidate_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge candidate groups using the shared deduplication policy."""
    return merge_candidate_lists(*candidate_groups)


def build_ruleset(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the CIS benchmark ruleset from harvested recommendations."""
    policies: list[dict[str, Any]] = []
    by_benchmark: dict[str, list[dict[str, Any]]] = {}
    for recommendation in recommendations:
        by_benchmark.setdefault(recommendation["benchmarkId"], []).append(
            recommendation
        )

    for benchmark in BENCHMARKS:
        entries = by_benchmark[benchmark.benchmark_id]
        aggregate_rules = build_aggregate_rules(benchmark, entries)
        informational_rules = [
            {
                "id": entry["id"],
                "title": f"{entry['recommendationId']} {entry['title']}",
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
                "description": (
                    f"{benchmark.benchmark_title} v{benchmark.version} harvested "
                    "from the saved PDF corpus."
                ),
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


def build_aggregate_rules(
    benchmark: BenchmarkSpec, recommendations: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Build aggregate native Relution rules for non-conflicting exact mappings."""
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
                "reason": (
                    "Aggregates exact Relution mappings from "
                    f"{', '.join(group['recommendationIds'])}."
                ),
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

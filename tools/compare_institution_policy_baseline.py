#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
import re
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INSTITUTION_ROOT = REPO_ROOT / "example" / "sample-policy-docs"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "example" / "institution-policy-comparison"
BASELINE_TEMPLATE_INDEX_PATH = REPO_ROOT / "example" / "relution-baseline-templates" / "index.json"

PLATFORMS = ("WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE")
PLATFORM_SLUGS = {
    "WINDOWS": "windows",
    "MACOS": "macos",
    "IOS": "ios",
    "ANDROID_ENTERPRISE": "android-enterprise",
}
INSTITUTION_POLICY_FILES = {
    "WINDOWS": "docs/managed-devices/05-policies-catalog/windows-policies.md",
    "MACOS": "docs/managed-devices/05-policies-catalog/macos-policies.md",
    "IOS": "docs/managed-devices/05-policies-catalog/ios-ipados-policies.md",
    "ANDROID_ENTERPRISE": "docs/managed-devices/05-policies-catalog/android-policies.md",
}

POLICY_ID_RE = re.compile(r"\b(?:WIN|MAC|IOS|AND)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}\b")
HEADING_RE = re.compile(r"^(#{2,4})\s+(.+)$", re.MULTILINE)
CONTROL_RE = re.compile(r"\b(?:SYS(?:\.\d+)+\.A\d+|MDM(?:\.\d+){2,3})\b")
POLICY_NAME_RE = re.compile(r"(?:Policy(?:-Name)?|Baseline|Overrides?|Policy)\s*:\s*`([^`]+)`", re.IGNORECASE)
BACKTICK_POLICY_RE = re.compile(r"`((?:Institution|POL|Windows|MAC|IOS|AND)[^`]{2,120})`")

TARGET_KEYWORDS = {
    "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES": ("advanced security", "entwickler", "developer", "unknown sources", "integrität"),
    "ANDROID_ENTERPRISE_DEVICE_PASSCODE": ("passcode", "passwort", "geräteentsperrung", "gerätesperre"),
    "ANDROID_ENTERPRISE_DISPLAY": ("display", "lockscreen", "bildschirm"),
    "ANDROID_ENTERPRISE_KEYGUARD_FEATURE_MANAGEMENT": ("keyguard", "trust agents", "smart lock", "lockscreen"),
    "ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT": ("permissions", "berechtigung", "runtime permission"),
    "ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT": ("managed play", "play store", "app-management", "app auto update"),
    "ANDROID_ENTERPRISE_RESTRICTION": ("restriction", "restriktion", "dlp", "schnittstellen", "kamera", "microphone", "mikrofon"),
    "ANDROID_ENTERPRISE_SYSTEM_UPDATE": ("update", "patch", "freeze"),
    "ANDROID_ENTERPRISE_WORK_PROFILE_PASSCODE": ("work profile", "cope"),
    "IOS_PASSCODE": ("passcode", "geräteentsperrung", "password"),
    "IOS_RESTRICTION": ("restriction", "restriktion", "icloud", "airdrop", "kamera", "siri", "managed"),
    "IOS_UPDATE": ("update", "patch", "software update"),
    "IOS_WIFI": ("wi-fi", "wifi", "wlan", "ssid"),
    "APPLE_DEVICE_SETTINGS": ("activation lock", "branding", "lock screen", "lost mode"),
    "MACOS_FILE_VAULT": ("filevault", "encryption", "verschlüsselung"),
    "MACOS_FIREWALL": ("firewall",),
    "MACOS_RESTRICTION": ("restriction", "restriktion", "icloud", "apple services", "siri"),
    "MACOS_SYSTEM_POLICY_CONTROL": ("gatekeeper", "system policy", "security options", "extensions"),
    "APPLE_SOFTWARE_UPDATE_SETTINGS": ("update", "patch", "software update"),
    "WINDOWS_ANTIVIRUS": ("defender", "antivirus", "malware", "asr", "network protection"),
    "WINDOWS_BITLOCKER": ("bitlocker", "encryption", "verschlüsselung"),
    "WINDOWS_CUSTOM_CSP": ("custom csp", "policy csp", "csp", "mdmwinsovergpo", "vbs", "credential guard", "lsa", "audit"),
    "WINDOWS_FIREWALL": ("firewall",),
    "WINDOWS_HELLO": ("hello", "biometric", "pin"),
    "WINDOWS_LOCAL_DEVICE_SECURITY": ("local device security", "vbs", "secure boot", "dma"),
    "WINDOWS_PASSCODE": ("passcode", "password", "kennwort"),
    "WINDOWS_RESTRICTION": ("restriction", "restriktion", "smartscreen", "camera", "consumer features"),
    "WINDOWS_UPDATE": ("update", "wufb", "windows update", "patch"),
}

CSP_GENERIC_TERMS = {
    "account",
    "accounts",
    "allow",
    "audit",
    "based",
    "client",
    "configure",
    "credential",
    "device",
    "disable",
    "disabled",
    "enable",
    "enabled",
    "local",
    "logoff",
    "logon",
    "management",
    "maximum",
    "microsoft",
    "minimum",
    "network",
    "password",
    "policy",
    "prevent",
    "require",
    "security",
    "server",
    "turn",
    "user",
    "users",
    "windows",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare Institution managed-device policy docs with generated Relution baselines.")
    parser.add_argument("--institution-root", type=Path, default=DEFAULT_INSTITUTION_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    institution_index = harvest_institution_policy_index(args.institution_root)
    baseline_index = harvest_relution_baseline_index(BASELINE_TEMPLATE_INDEX_PATH)
    comparison = compare_indexes(institution_index, baseline_index)
    write_outputs(args.output_root, institution_index, baseline_index, comparison)


def harvest_institution_policy_index(institution_root: Path) -> dict[str, Any]:
    policies = []
    for platform, relative_path in INSTITUTION_POLICY_FILES.items():
        path = institution_root / relative_path
        policies.extend(harvest_policy_file(platform, path, institution_root))
    return {
        "version": 1,
        "name": "Institution Managed Device Policy Catalog Index",
        "sourceRoot": str(institution_root),
        "policies": policies,
        "summary": summarize_by_platform(policies),
    }


def harvest_policy_file(platform: str, path: Path, institution_root: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf8")
    line_starts = line_start_offsets(text)
    headings = [
        {"level": len(match.group(1)), "title": match.group(2).strip(), "start": match.start(), "line": offset_to_line(line_starts, match.start())}
        for match in HEADING_RE.finditer(text)
    ]
    policies = []
    for index, heading in enumerate(headings):
        policy_id_match = POLICY_ID_RE.search(heading["title"])
        if policy_id_match is None:
            continue
        end = len(text)
        for next_heading in headings[index + 1:]:
            if next_heading["level"] <= heading["level"]:
                end = next_heading["start"]
                break
        block = text[heading["start"]:end]
        signal_text = extract_signal_text(block)
        policies.append(
            {
                "id": policy_id_match.group(0),
                "platform": platform,
                "title": heading["title"],
                "sourcePath": path.relative_to(institution_root).as_posix(),
                "lineStart": heading["line"],
                "lineEnd": offset_to_line(line_starts, end),
                "policyNames": extract_policy_names(block),
                "controls": sorted(set(CONTROL_RE.findall(block))),
                "relutionTargets": infer_targets(platform, signal_text),
                "matchText": normalize_text(signal_text),
                "matchTerms": sorted(set(identifier_tokens(signal_text))),
                "settings": infer_setting_values(signal_text),
                "status": "planned" if "PLANNED/Target" in block or "planned" in block.lower() else "unknown",
                "excerpt": one_line(block.splitlines()[0] if block.splitlines() else heading["title"]),
            }
        )
    return policies


def harvest_relution_baseline_index(index_path: Path) -> dict[str, Any]:
    template_index = read_json(index_path)
    actionable_targets = []
    suppressed_conflicts = []
    for entry in template_index["consolidatedTemplates"]:
        ruleset = read_json(REPO_ROOT / entry["path"])
        platform = entry["platform"]
        for policy in ruleset.get("policies", []):
            for rule in policy.get("rules", []):
                if rule.get("conflict") is not None:
                    suppressed_conflicts.append({"platform": platform, **rule["conflict"]})
                if not is_actionable(rule):
                    continue
                for mapping in rule.get("mappings", []):
                    target = mapping_target(mapping)
                    if target is None:
                        continue
                    actionable_targets.append(
                        {
                            "platform": platform,
                            "ruleId": rule["id"],
                            "title": rule["title"],
                            "kind": mapping.get("kind"),
                            "target": target,
                            "targetName": mapping.get("values", {}).get("name") if isinstance(mapping.get("values"), dict) else None,
                            "fieldPaths": sorted(path_to_string(path) for path in flatten_values(mapping.get("values", {}))),
                            "values": mapping.get("values", {}),
                            "sources": sorted({source_rule.get("source") for source_rule in rule.get("sourceRules", []) if source_rule.get("source")}),
                            "sourceRules": rule.get("sourceRules", []),
                        }
                    )
    return {
        "version": 1,
        "name": "Generated Relution Baseline Index",
        "baselineTemplateIndexPath": index_path.relative_to(REPO_ROOT).as_posix(),
        "generatedAt": template_index.get("generatedAt"),
        "actionableTargets": actionable_targets,
        "suppressedConflicts": suppressed_conflicts,
        "summary": summarize_by_platform(actionable_targets),
    }


def compare_indexes(institution_index: dict[str, Any], baseline_index: dict[str, Any]) -> dict[str, Any]:
    results = []
    matched_baseline_ids = set()
    targets_by_platform = defaultdict(list)
    for target in baseline_index["actionableTargets"]:
        targets_by_platform[target["platform"]].append(target)

    for policy in institution_index["policies"]:
        candidates = targets_by_platform[policy["platform"]]
        target_matches = [target for target in candidates if baseline_target_matches_policy(policy, target)]
        conflicts = [conflict_for(policy, target) for target in target_matches]
        conflicts = [conflict for conflict in conflicts if conflict is not None]
        for target in target_matches:
            matched_baseline_ids.add(target["ruleId"])
        results.append(
            {
                "policyId": policy["id"],
                "platform": policy["platform"],
                "title": policy["title"],
                "status": comparison_status(policy, target_matches, conflicts),
                "matchedTargets": target_matches,
                "conflicts": conflicts,
                "controls": policy["controls"],
                "relutionTargets": policy["relutionTargets"],
                "sourcePath": policy["sourcePath"],
                "lineStart": policy["lineStart"],
                "lineEnd": policy["lineEnd"],
            }
        )

    missing = [
        target
        for target in baseline_index["actionableTargets"]
        if target["ruleId"] not in matched_baseline_ids
    ]
    status_counts = Counter(result["status"] for result in results)
    return {
        "version": 1,
        "name": "Institution Policy Catalog vs Generated Relution Baseline",
        "generatedAt": baseline_index.get("generatedAt"),
        "inputs": {
            "institutionPolicyIndexPath": "example/institution-policy-comparison/institution-policy-index.json",
            "relutionBaselineIndexPath": "example/institution-policy-comparison/relution-baseline-index.json",
        },
        "policyResults": sorted(results, key=lambda row: (platform_rank(row["platform"]), row["policyId"])),
        "baselineMissingInInstitution": sorted(missing, key=lambda row: (platform_rank(row["platform"]), row["target"], row["ruleId"])),
        "suppressedBaselineConflicts": baseline_index["suppressedConflicts"],
        "summary": {
            "institutionPolicies": len(results),
            "baselineActionableTargets": len(baseline_index["actionableTargets"]),
            "baselineMissingInInstitution": len(missing),
            "statusCounts": dict(sorted(status_counts.items())),
            "byPlatform": comparison_summary_by_platform(results, missing),
        },
    }


def comparison_status(policy: dict[str, Any], matches: list[dict[str, Any]], conflicts: list[dict[str, Any]]) -> str:
    if conflicts:
        return "conflict"
    if matches:
        return "covered"
    if policy["relutionTargets"] or policy["controls"]:
        return "documented-only"
    return "institution-only"


def conflict_for(policy: dict[str, Any], target: dict[str, Any]) -> dict[str, Any] | None:
    policy_values = policy["settings"].get(target["target"], {})
    if not isinstance(policy_values, dict) or not policy_values:
        return None
    baseline_values = flatten_values(target["values"])
    conflicts = []
    for path, expected in policy_values.items():
        path_tuple = tuple(path.split("."))
        if path_tuple not in baseline_values:
            continue
        observed = baseline_values[path_tuple]
        if stable_json(observed) != stable_json(expected):
            conflicts.append({"path": path, "institutionValue": expected, "baselineValue": observed})
    if not conflicts:
        return None
    return {"target": target["target"], "ruleId": target["ruleId"], "differences": conflicts}


def baseline_target_matches_policy(policy: dict[str, Any], target: dict[str, Any]) -> bool:
    if target["target"] not in policy["relutionTargets"]:
        return False
    if target["target"] != "WINDOWS_CUSTOM_CSP":
        return True
    target_name = str(target.get("targetName") or "")
    target_terms = [
        term
        for term in identifier_tokens(target_name)
        if len(term) >= 4 and term not in CSP_GENERIC_TERMS
    ]
    if not target_terms:
        return False
    match_terms = set(policy.get("matchTerms", []))
    matches = match_terms.intersection(target_terms)
    return len(matches) >= min(2, len(target_terms))


def infer_targets(platform: str, block: str) -> list[str]:
    haystack = normalize_text(block)
    targets = []
    for target, keywords in TARGET_KEYWORDS.items():
        if target_platform(target) != platform:
            continue
        if target in block or any(keyword in haystack for keyword in keywords):
            targets.append(target)
    return sorted(set(targets))


def extract_signal_text(block: str) -> str:
    lines = []
    for line in block.splitlines():
        if re.match(r"^#{3,4}\s+(?:Nebenwirkungen|Voraussetzungen|Verifikation|Rollback|Quellen|Controls-Mapping)", line):
            break
        lines.append(line)
    return "\n".join(lines)


def infer_setting_values(block: str) -> dict[str, dict[str, Any]]:
    values: dict[str, dict[str, Any]] = {}
    min_length = first_int(block, r"Minimum (?:passcode|password) length\s*\|\s*(?:\*\*)?(\d+)")
    if min_length is not None:
        for target in ("IOS_PASSCODE", "WINDOWS_PASSCODE", "ANDROID_ENTERPRISE_DEVICE_PASSCODE"):
            values.setdefault(target, {})["minLength"] = min_length
    history = first_int(block, r"Passcode history\s*\|\s*(?:\*\*)?(\d+)")
    if history is not None:
        for target in ("IOS_PASSCODE", "WINDOWS_PASSCODE", "ANDROID_ENTERPRISE_DEVICE_PASSCODE"):
            values.setdefault(target, {})["history"] = history
    if "FileVault" in block:
        values.setdefault("MACOS_FILE_VAULT", {})["enabled"] = True
    if "BitLocker" in block:
        values.setdefault("WINDOWS_BITLOCKER", {})["enabled"] = True
    return values


def write_outputs(output_root: Path, institution_index: dict[str, Any], baseline_index: dict[str, Any], comparison: dict[str, Any]) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    write_json(output_root / "institution-policy-index.json", institution_index)
    write_json(output_root / "relution-baseline-index.json", baseline_index)
    write_json(output_root / "institution-vs-relution-baseline.json", comparison)
    (output_root / "institution-vs-relution-baseline.md").write_text(render_markdown(comparison), encoding="utf8")


def render_markdown(comparison: dict[str, Any]) -> str:
    lines = [
        "# Institution Policy Catalog vs Generated Relution Baseline",
        "",
        f"Generated from baseline snapshot: `{comparison['generatedAt']}`",
        "",
        "## Summary",
        "",
        f"- Institution policies indexed: `{comparison['summary']['institutionPolicies']}`",
        f"- Generated actionable baseline targets: `{comparison['summary']['baselineActionableTargets']}`",
        f"- Baseline targets missing in institution catalog: `{comparison['summary']['baselineMissingInInstitution']}`",
        f"- Policy status counts: `{stable_json(comparison['summary']['statusCounts'])}`",
        "",
        "## Platform Results",
        "",
    ]
    for platform in PLATFORMS:
        platform_results = [row for row in comparison["policyResults"] if row["platform"] == platform]
        missing = [row for row in comparison["baselineMissingInInstitution"] if row["platform"] == platform]
        lines.append(f"### {platform}")
        lines.append("")
        lines.append(f"- Institution policies: `{len(platform_results)}`")
        lines.append(f"- Missing generated actionable targets: `{len(missing)}`")
        for result in platform_results[:25]:
            lines.append(
                f"- `{result['status']}` `{result['policyId']}`: "
                f"{', '.join(target['target'] for target in result['matchedTargets'][:4]) or 'no actionable target match'}"
            )
        if len(platform_results) > 25:
            lines.append(f"- ... `{len(platform_results) - 25}` more Institution policies in JSON report.")
        if missing:
            lines.append("")
            lines.append("Missing generated actionable targets:")
            for target in missing[:20]:
                lines.append(f"- `{target['target']}` via `{target['ruleId']}`")
            if len(missing) > 20:
                lines.append(f"- ... `{len(missing) - 20}` more missing targets in JSON report.")
        lines.append("")
    return "\n".join(lines)


def extract_policy_names(block: str) -> list[str]:
    names = [match.strip() for match in POLICY_NAME_RE.findall(block)]
    names.extend(match.strip() for match in BACKTICK_POLICY_RE.findall(block) if " " not in match[:12])
    return sorted(set(names))


def is_actionable(rule: dict[str, Any]) -> bool:
    return rule.get("informational") is not True and isinstance(rule.get("mappings"), list) and len(rule["mappings"]) > 0


def mapping_target(mapping: dict[str, Any]) -> str | None:
    for key in ("type", "payloadType", "schemaId"):
        if isinstance(mapping.get(key), str):
            return mapping[key]
    return None


def target_platform(target: str) -> str:
    if target.startswith("WINDOWS_"):
        return "WINDOWS"
    if target.startswith("MACOS_") or target in {"APPLE_SOFTWARE_UPDATE_SETTINGS"}:
        return "MACOS"
    if target.startswith("IOS_") or target == "APPLE_DEVICE_SETTINGS":
        return "IOS"
    if target.startswith("ANDROID_ENTERPRISE_"):
        return "ANDROID_ENTERPRISE"
    return ""


def flatten_values(value: Any, prefix: tuple[str, ...] = ()) -> dict[tuple[str, ...], Any]:
    if not isinstance(value, dict):
        return {prefix: value}
    flattened = {}
    for key in sorted(value):
        child = value[key]
        child_prefix = prefix + (str(key),)
        if isinstance(child, dict):
            flattened.update(flatten_values(child, child_prefix))
        else:
            flattened[child_prefix] = child
    return flattened


def summarize_by_platform(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_platform = Counter(row["platform"] for row in rows)
    return {"total": len(rows), "byPlatform": dict(sorted(by_platform.items()))}


def comparison_summary_by_platform(results: list[dict[str, Any]], missing: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {}
    for platform in PLATFORMS:
        platform_results = [row for row in results if row["platform"] == platform]
        summary[platform] = {
            "institutionPolicies": len(platform_results),
            "statusCounts": dict(sorted(Counter(row["status"] for row in platform_results).items())),
            "baselineMissingInInstitution": len([row for row in missing if row["platform"] == platform]),
        }
    return summary


def first_int(text: str, pattern: str) -> int | None:
    match = re.search(pattern, text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def normalize_text(value: str) -> str:
    return value.lower().replace("‑", "-").replace("–", "-")


def identifier_tokens(value: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return [token.lower() for token in re.split(r"[^A-Za-z0-9]+", spaced) if len(token) >= 3]


def one_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def path_to_string(path: tuple[str, ...]) -> str:
    return ".".join(path)


def line_start_offsets(text: str) -> list[int]:
    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def offset_to_line(offsets: list[int], offset: int) -> int:
    line = 1
    for index, start in enumerate(offsets, start=1):
        if start > offset:
            break
        line = index
    return line


def platform_rank(platform: str) -> int:
    return PLATFORMS.index(platform) if platform in PLATFORMS else 99


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf8"))


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()

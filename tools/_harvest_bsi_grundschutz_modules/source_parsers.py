#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET
from build_relution_import_artifacts import build_source_artifacts
from recommendation_mapping import (
    MANAGEMENT_SUPPORT_CONCEPT_IDS,
    android_relution_analog_mappings_for,
    android_relution_candidates_for,
    apple_mobileconfig_candidates_for,
    apple_schema_analog_mappings_for,
    build_setting_index,
    flatten_value_paths,
    load_apple_mobileconfig_evidence,
    mapping_candidates,
    semantic_candidates_for,
    semantic_concepts_for,
    semantic_no_concept_reason,
)


DOCBOOK_NS = {"db": "http://docbook.org/ns/docbook"}
SHEET_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

REPO_ROOT = Path(__file__).resolve().parents[1]
BSI_DIR = REPO_ROOT / "example" / "bsi-references"
XML_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "XML_Kompendium_2023.xml"
XLSX_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "krt2023_Excel.xlsx"
INDIVIDUAL_CHECKLISTS_DIR = BSI_DIR / "downloads" / "pdf-xlsx-html" / "Checklisten zum IT-Grundschutz-Kompendium (Edition 2023)"
ERRATA_TEXT_PATH = BSI_DIR / "downloads" / "text" / "it-grundschutz-errata-2023.txt"
GS_PLUSPLUS_CATALOG_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "Grundschutz++-catalog.json"
GS_PLUSPLUS_METHOD_PATH = BSI_DIR / "downloads" / "pdf-xlsx-html" / "Methodik_Grundschutz_PlusPlus.pdf"
BASELINE_PATH = BSI_DIR / "bsi-relution-baseline.json"
README_PATH = BSI_DIR / "README.md"
CATALOG_PATH = BSI_DIR / "bsi-recommendations.json"
RULESET_PATH = BSI_DIR / "bsi-relution-ruleset.json"
GS_PLUSPLUS_SYSTEMATICS_PATH = BSI_DIR / "bsi-grundschutz-plusplus-systematics.json"
CHECKLIST_COMPARISON_PATH = BSI_DIR / "bsi-grundschutz-kompendium-checklist-comparison.json"

REQUIREMENT_TITLE_RE = re.compile(
    r"^(?P<requirement_id>SYS\.\d+(?:\.\d+)*\.A\d+)\s+(?P<title>.*?)\s+\((?P<level>[BSH])\)(?:\s+\[(?P<actors>.+?)\])?$"
)
GENERIC_THREAT_RE = re.compile(r"^(?P<id>G \d+\.\d+)\s+(?P<title>.+)$")
CELL_REF_RE = re.compile(r"(?P<column>[A-Z]+)")


@dataclass(frozen=True)
class ModuleTarget:
    module_id: str
    module_title: str
    source_id: str
    role: str
    supporting_source_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlatformTarget:
    platform: str
    os_family: str
    policy_name: str
    policy_description: str
    modules: tuple[ModuleTarget, ...]


PLATFORM_TARGETS: tuple[PlatformTarget, ...] = (
    PlatformTarget(
        platform="WINDOWS",
        os_family="WINDOWS",
        policy_name="Windows BSI Grundschutz",
        policy_description="Edition 2023 client baseline plus Windows-specific BSI Grundschutz requirements for managed Windows devices.",
        modules=(
            ModuleTarget("SYS.2.1", "SYS.2.1 Allgemeiner Client", "sys-2-1-general-client", "shared-client-baseline"),
            ModuleTarget(
                "SYS.2.2.3",
                "SYS.2.2.3 Clients unter Windows",
                "sys-2-2-3-windows",
                "windows-specific-baseline",
                ("fd-aenderungen-2023",),
            ),
        ),
    ),
    PlatformTarget(
        platform="MACOS",
        os_family="MACOS",
        policy_name="macOS BSI Grundschutz",
        policy_description="Edition 2023 client baseline plus macOS-specific BSI Grundschutz requirements for managed macOS devices.",
        modules=(
            ModuleTarget("SYS.2.1", "SYS.2.1 Allgemeiner Client", "sys-2-1-general-client", "shared-client-baseline"),
            ModuleTarget(
                "SYS.2.4",
                "SYS.2.4 Clients unter macOS",
                "sys-2-4-macos",
                "macos-specific-baseline",
                ("umsetzungshinweis-sys-2-4-macos",),
            ),
        ),
    ),
    PlatformTarget(
        platform="IOS",
        os_family="IOS",
        policy_name="iOS BSI Grundschutz",
        policy_description="Edition 2023 smartphone/tablet and MDM baseline plus iOS-specific BSI Grundschutz requirements for managed iOS devices.",
        modules=(
            ModuleTarget("SYS.3.2.1", "SYS.3.2.1 Allgemeine Smartphones und Tablets", "sys-3-2-1-smartphones-tablets", "shared-mobile-baseline"),
            ModuleTarget(
                "SYS.3.2.2",
                "SYS.3.2.2 Mobile Device Management (MDM)",
                "sys-3-2-2-mdm",
                "shared-mobile-mdm-baseline",
                ("mdm-minimum-standard-v2",),
            ),
            ModuleTarget("SYS.3.2.3", "SYS.3.2.3 iOS (for Enterprise)", "sys-3-2-3-ios", "ios-specific-baseline"),
        ),
    ),
    PlatformTarget(
        platform="ANDROID_ENTERPRISE",
        os_family="ANDROID",
        policy_name="Android BSI Grundschutz",
        policy_description="Edition 2023 smartphone/tablet and MDM baseline plus Android-specific BSI Grundschutz requirements for managed Android Enterprise devices.",
        modules=(
            ModuleTarget("SYS.3.2.1", "SYS.3.2.1 Allgemeine Smartphones und Tablets", "sys-3-2-1-smartphones-tablets", "shared-mobile-baseline"),
            ModuleTarget(
                "SYS.3.2.2",
                "SYS.3.2.2 Mobile Device Management (MDM)",
                "sys-3-2-2-mdm",
                "shared-mobile-mdm-baseline",
                ("mdm-minimum-standard-v2",),
            ),
            ModuleTarget("SYS.3.2.4", "SYS.3.2.4 Android", "sys-3-2-4-android", "android-specific-baseline"),
        ),
    ),
)

GS_PLUSPLUS_METHOD_CONTEXT: dict[str, Any] = {
    "documentTitle": "Leitfaden zur Methodik Grundschutz++",
    "documentVersion": "März 2026",
    "documentDate": "2026-03-16",
    "status": "Einführungs- und Erprobungsphase",
    "sourcePath": "example/bsi-references/downloads/pdf-xlsx-html/Methodik_Grundschutz_PlusPlus.pdf",
    "processSteps": [
        {"step": 1, "name": "Erhebung und Planung", "pdcaPhase": "Plan", "practiceId": "GC", "practiceTitle": "Governance und Compliance"},
        {"step": 2, "name": "Anforderungsanalyse", "pdcaPhase": "Plan", "practiceId": "STM", "practiceTitle": "Strukturmodellierung"},
        {"step": 3, "name": "Realisierung", "pdcaPhase": "Do", "practiceId": "UMS", "practiceTitle": "Umsetzung"},
        {"step": 4, "name": "Überwachung", "pdcaPhase": "Check", "practiceId": "PERF", "practiceTitle": "Monitoring-Evaluation"},
        {"step": 5, "name": "kontinuierliche Verbesserung", "pdcaPhase": "Act", "practiceId": "VRB", "practiceTitle": "Verbesserung"},
    ],
    "modalVerbDefinitions": {
        "MUSS": "verpflichtend; keine Abweichung vorgesehen",
        "SOLLTE": "regelmäßig verpflichtend; begründete Ausnahme möglich",
        "KANN": "optional; situationsabhängig sinnvoll",
    },
    "securityLevels": {
        "normal-SdT": "normales Sicherheitsniveau gemäß Stand der Technik",
        "erhöht": "erhöhtes Sicherheitsniveau; Herabstufung auf normal ist risikobasiert zu begründen",
    },
    "policyEditorUse": {
        "scope": "Relution policies are realization and monitoring artifacts for already modeled assets.",
        "assetModeling": "GS++ builds a tailored requirement package from information federation, assets, target object categories, inherited parent categories, and risk/compliance additions.",
        "parameterization": "Parameterized GS++ requirements need local values; the editor must not invent thresholds.",
        "nonGoals": "GS++ context does not by itself create an exact Relution mapping or replace local scope, asset, owner, and risk decisions.",
    },
}

PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES: dict[str, tuple[str, ...]] = {
    "WINDOWS": ("IT-Systeme", "Endgeräte", "Anwendungen", "Webbrowser", "Daten"),
    "MACOS": ("IT-Systeme", "Endgeräte", "Anwendungen", "Webbrowser", "Daten"),
    "IOS": ("IT-Systeme", "Endgeräte", "Anwendungen", "Nutzende", "Mobiltelefone", "Daten"),
    "ANDROID_ENTERPRISE": ("IT-Systeme", "Endgeräte", "Anwendungen", "Nutzende", "Mobiltelefone", "Daten"),
}

GS_PLUSPLUS_RELATED_CONTROL_RULES: tuple[dict[str, Any], ...] = (
    {
        "reason": "developer and privileged system functions",
        "terms": ("entwicklermodus", "developer mode", "developer options", "privilegierte systemfunktionen"),
        "controlIds": ("KONF.2.4", "KONF.6.4"),
    },
    {
        "reason": "automatic updates and patch management",
        "terms": ("autoupdate", "automatische update", "sicherheitsupdate", "patchmanagement", "patch-management", "updates"),
        "controlIds": ("KONF.8.2", "DET.5.10"),
    },
    {
        "reason": "malware and schadcode protection",
        "terms": ("schadsoftware", "schadcode", "malware", "virenschutz", "echtzeitscanner"),
        "controlIds": ("KONF.7.1", "KONF.7.2", "KONF.7.6", "KONF.7.9", "KONF.7.10"),
    },
    {
        "reason": "password passcode lock and sign-in controls",
        "terms": ("passwort", "passcode", "gerätecode", "geraetecode", "kennwort", "anmeldeversuch", "inaktivität", "inaktivitaet", "sperrung"),
        "controlIds": ("BER.6.8", "BER.6.7", "BER.3.9", "BER.3.11"),
    },
    {
        "reason": "storage and transport encryption",
        "terms": ("verschlüssel", "verschluessel", "encryption", "filevault", "bitlocker", "transportverschlüssel"),
        "controlIds": ("KONF.3.2", "ASST.4.2"),
    },
    {
        "reason": "local firewall and network connection restriction",
        "terms": ("firewall", "netzverbindung", "netzzugriff"),
        "controlIds": ("KONF.7.15",),
    },
    {
        "reason": "interfaces peripheral ports and communication surfaces",
        "terms": ("schnittstelle", "schnittstellen", "kommunikationsschnittstellen", "usb", "bluetooth", "nfc", "peripherie"),
        "controlIds": ("ASST.4.1", "KONF.3.7", "KONF.11.8"),
    },
    {
        "reason": "camera microphone and mobile device physical interfaces",
        "terms": ("kamera", "camera", "mikrofon", "microphone", "siri", "assistant", "sprachassist"),
        "controlIds": ("KONF.3.7", "SENS.7.18"),
    },
    {
        "reason": "authorized time sources and time synchronization",
        "terms": ("zeitquelle", "zeitquellen", "zeitsynchronisation", "ntp", "uhrzeit", "timezone", "zeitzone"),
        "controlIds": ("KONF.4.5",),
    },
    {
        "reason": "remote lock wipe and loss handling",
        "terms": ("fernlöschung", "fernloeschung", "remote wipe", "remote lock", "abhandenkommen", "verlust"),
        "controlIds": ("KONF.3.6", "ASST.6.1"),
    },
    {
        "reason": "asset and application inventory",
        "terms": ("inventar", "inventarisierung", "asset", "anwendungsinventar", "systeminventar"),
        "controlIds": ("ASST.2.2", "ASST.2.3"),
    },
    {
        "reason": "application permissions and least privilege",
        "terms": ("berechtigung", "berechtigungen", "permission", "permissions", "privileg", "least privilege", "zugriff"),
        "controlIds": ("KONF.6.1", "KONF.6.4", "BER.5.1"),
    },
    {
        "reason": "browser and controlled data processing",
        "terms": ("browser", "webbrowser", "cookie", "historie", "sandbox", "webfilter"),
        "controlIds": ("KONF.6.14", "KONF.12.3", "KONF.12.6"),
    },
    {
        "reason": "cloud service and data location governance",
        "terms": ("cloud", "icloud", "datenlokation", "datenlokationen", "synchronisation"),
        "controlIds": ("ASST.3.10", "KONF.11.8"),
    },
    {
        "reason": "certificates keys and cryptographic trust",
        "terms": ("zertifikat", "certificate", "schlüssel", "schluessel", "keychain", "trust"),
        "controlIds": ("BER.7.10", "BER.7.14", "DEV.7.2"),
    },
    {
        "reason": "wireless vpn and secure network access",
        "terms": ("wlan", "wi-fi", "wifi", "vpn", "wireless", "mobilfunk", "apn"),
        "controlIds": ("ARCH.3.4", "ARCH.4.1", "ARCH.5.1"),
    },
    {
        "reason": "logging auditing and configuration change monitoring",
        "terms": ("protokoll", "protokollierung", "logging", "audit", "überwachung", "ueberwachung", "änderung", "aenderung"),
        "controlIds": ("DET.3.4", "DET.4.4", "KONF.2.5"),
    },
    {
        "reason": "backup and recovery controls",
        "terms": ("backup", "datensicherung", "sicherung", "wiederherstellung"),
        "controlIds": ("NOT.4.4", "NOT.4.8"),
    },
)

GS_PLUSPLUS_STOPWORDS = {
    "aber",
    "alle",
    "auch",
    "auf",
    "aus",
    "bei",
    "das",
    "der",
    "die",
    "ein",
    "eine",
    "einer",
    "eines",
    "for",
    "mit",
    "nicht",
    "oder",
    "sich",
    "sind",
    "soll",
    "sollen",
    "sollte",
    "the",
    "und",
    "von",
    "werden",
    "wird",
    "zur",
}


MAPPING_RULES: dict[tuple[str, str], dict[str, Any]] = {
    ("ANDROID_ENTERPRISE", "SYS.3.2.4.A2"): {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["developerSettings"],
            }
        ],
        "rulesetMappings": [
            {
                "kind": "relution-native",
                "type": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "values": {"developerSettings": "DEVELOPER_SETTINGS_DISABLED"},
            }
        ],
        "notes": ["BSI explicitly recommends that Android developer mode should be disabled on all Android-based devices."],
    },
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A8"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["untrustedAppsPolicy"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["Relution can block installation from unauthorized sources, but the BSI requirement also covers governance of approved apps and approved app sources."],
    },
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A11"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES",
                "fieldPaths": ["encryptionPolicy"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The Android Enterprise encryption policy covers storage encryption, but the BSI text is a broader mobile requirement that is not Android-only."],
    },
    ("ANDROID_ENTERPRISE", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
                "fieldPaths": ["cameraDisabled"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The BSI requirement covers microphones and cameras, while the Relution template only covers camera disablement."],
    },
    ("IOS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The BSI requirement covers microphones and cameras, while the Relution template only covers camera disablement."],
    },
    ("IOS", "SYS.3.2.3.A14"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_RESTRICTION",
                "fieldPaths": [
                    "allowCloudBackup",
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The iOS restriction payload can reduce iCloud usage, but the BSI requirement also depends on local policy decisions and two-factor authentication for allowed use."],
    },
    ("IOS", "SYS.3.2.3.A17"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "IOS_PASSCODE",
                "fieldPaths": ["pinHistory"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["BSI requires an appropriate device-code history value, but does not prescribe a concrete history depth."],
    },
    ("MACOS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The BSI requirement covers microphones and cameras, while the Relution template only covers camera disablement."],
    },
    ("MACOS", "SYS.2.4.A4"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_FILE_VAULT",
                "fieldPaths": ["enabled", "enableRecoveryKeyEscrow", "fdeFileVaultOptions.dontAllowFDEDisable"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["Relution can enforce FileVault, but the BSI requirement also covers recovery-key handling and banning Apple-hosted key storage."],
    },
    ("MACOS", "SYS.2.4.A10"): {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": [
            {
                "kind": "apple-schema-profile",
                "target": "profile:com.apple.security.firewall",
                "fieldPaths": ["EnableFirewall"],
            }
        ],
        "rulesetMappings": [
            {
                "kind": "apple-schema-profile",
                "schemaId": "profile:com.apple.security.firewall",
                "values": {"EnableFirewall": True},
            }
        ],
        "notes": ["The Apple firewall profile can enforce the built-in macOS personal firewall directly."],
    },
    ("MACOS", "SYS.2.4.A8"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "MACOS_RESTRICTION",
                "fieldPaths": [
                    "allowCloudDocumentSync",
                    "allowCloudKeychainSync",
                    "allowCloudPhotoLibrary",
                    "allowCloudDesktopAndDocuments",
                ],
            }
        ],
        "rulesetMappings": [],
        "notes": ["Relution can disable multiple iCloud synchronization surfaces, but the BSI requirement applies specifically to sensitive data and institution-operated services."],
    },
    ("WINDOWS", "SYS.2.1.A21"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": ["allowCamera"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The BSI requirement covers microphones and cameras, while the available Windows template candidate only covers camera disablement."],
    },
    ("WINDOWS", "SYS.2.2.3.A4"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": ["allowPrivacy", "allowPrivacyExperience", "allowSyncMySettings"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["Relution exposes Windows privacy-related settings, but the BSI telemetry requirement is broader than a single toggle set."],
    },
    ("WINDOWS", "SYS.2.2.3.A6"): {
        "status": "partial",
        "mergeableInImportableRuleset": False,
        "candidates": [
            {
                "kind": "relution-native",
                "target": "WINDOWS_RESTRICTION",
                "fieldPaths": ["allowAddingForeignAccountsManually", "allowAccounts", "allowYourAccount"],
            }
        ],
        "rulesetMappings": [],
        "notes": ["The BSI requirement limits online-account integration, but compliance still depends on directory-service and account-governance decisions outside a single template."],
    },
}


def main() -> None:
    root = ET.parse(XML_PATH).getroot()
    module_catalog = parse_docbook_modules(root)
    threat_catalog = parse_generic_threat_catalog(root)
    target_module_ids = {module.module_id for platform in PLATFORM_TARGETS for module in platform.modules}
    checklist_threats = parse_checklist_workbook(XLSX_PATH, target_module_ids)
    individual_checklists = parse_individual_checklist_workbooks(INDIVIDUAL_CHECKLISTS_DIR)
    errata_map = build_errata_map(ERRATA_TEXT_PATH.read_text(encoding="utf8"), {
        requirement_id
        for module_data in module_catalog.values()
        for requirement_id in module_data["requirements"]
    })
    plusplus = parse_grundschutz_plusplus_catalog(GS_PLUSPLUS_CATALOG_PATH)
    checklist_comparison = build_checklist_comparison(module_catalog, individual_checklists)
    write_json(GS_PLUSPLUS_SYSTEMATICS_PATH, plusplus["systematics"])
    write_json(CHECKLIST_COMPARISON_PATH, checklist_comparison)

    field_index = build_setting_index()
    apple_mobileconfig_evidence = load_apple_mobileconfig_evidence()
    recommendations = build_recommendations(
        module_catalog,
        threat_catalog,
        checklist_threats,
        individual_checklists,
        checklist_comparison["policyRelevantRequirements"],
        plusplus,
        errata_map,
        field_index,
        apple_mobileconfig_evidence,
    )
    write_json(CATALOG_PATH, recommendations)
    update_baseline_summary(recommendations, plusplus["systematics"], checklist_comparison)
    build_source_artifacts("bsi")


def parse_docbook_modules(root: ET.Element) -> dict[str, dict[str, Any]]:
    sections_by_title = {
        normalize_space(title_element.text or ""): section
        for section in root.findall(".//db:section", DOCBOOK_NS)
        if (title_element := section.find("db:title", DOCBOOK_NS)) is not None
    }
    modules: dict[str, dict[str, Any]] = {}
    for platform in PLATFORM_TARGETS:
        for module in platform.modules:
            if module.module_id in modules:
                continue
            section = sections_by_title[module.module_title]
            modules[module.module_id] = {
                "moduleId": module.module_id,
                "moduleTitle": module.module_title,
                "sourceId": module.source_id,
                "description": parse_module_description(section),
                "moduleThreats": parse_module_threats(section),
                "requirements": parse_module_requirements(section),
            }
    return modules


def parse_module_description(module_section: ET.Element) -> list[str]:
    for child_section in module_section.findall("db:section", DOCBOOK_NS):
        title = child_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        if normalize_space(title) == "Beschreibung":
            return collect_direct_blocks(child_section)
    return []


def parse_module_threats(module_section: ET.Element) -> list[dict[str, str]]:
    for child_section in module_section.findall("db:section", DOCBOOK_NS):
        title = child_section.findtext("db:title", default="", namespaces=DOCBOOK_NS)
        if normalize_space(title) != "Gefährdungslage":
            continue
        threats: list[dict[str, str]] = []
        for threat_section in child_section.findall("db:section", DOCBOOK_NS):
            threat_title = normalize_space(threat_section.findtext("db:title", default="", namespaces=DOCBOOK_NS))
            if not threat_title:
                continue
            threat_text = " ".join(collect_direct_blocks(threat_section))
            threats.append({"title": threat_title, "text": threat_text})
        return threats
    return []


def parse_module_requirements(module_section: ET.Element) -> dict[str, dict[str, Any]]:
    requirements_parent = next(
        child
        for child in module_section.findall("db:section", DOCBOOK_NS)
        if normalize_space(child.findtext("db:title", default="", namespaces=DOCBOOK_NS)) == "Anforderungen"
    )
    requirements: dict[str, dict[str, Any]] = {}
    for category_section in requirements_parent.findall("db:section", DOCBOOK_NS):
        category_title = normalize_space(category_section.findtext("db:title", default="", namespaces=DOCBOOK_NS))
        for requirement_section in category_section.findall("db:section", DOCBOOK_NS):
            raw_title = normalize_space(requirement_section.findtext("db:title", default="", namespaces=DOCBOOK_NS))
            match = REQUIREMENT_TITLE_RE.match(raw_title)
            if match is None:
                continue
            blocks = collect_direct_blocks(requirement_section)
            requirement_id = match.group("requirement_id")
            title = match.group("title")
            status = "retired" if title == "ENTFALLEN" else "active"
            requirements[requirement_id] = {
                "requirementId": requirement_id,
                "title": title,
                "protectionLevel": match.group("level"),
                "actors": [normalize_space(actor) for actor in (match.group("actors") or "").split(",") if normalize_space(actor)],
                "status": status,
                "category": category_title,
                "paragraphs": blocks,
                "requirementText": " ".join(blocks),
            }
    return requirements


def parse_generic_threat_catalog(root: ET.Element) -> dict[str, str]:
    threats: dict[str, str] = {}
    for title_element in root.findall(".//db:title", DOCBOOK_NS):
        title = normalize_space("".join(title_element.itertext()))
        match = GENERIC_THREAT_RE.match(title)
        if match is None or match.group("id") in threats:
            continue
        threats[match.group("id")] = match.group("title")
    return threats


def parse_checklist_workbook(xlsx_path: Path, module_ids: set[str]) -> dict[str, list[str]]:
    rows_by_sheet = read_xlsx_rows(xlsx_path)
    requirement_threats: dict[str, list[str]] = {}
    for module_id in sorted(module_ids):
        sheet_name = f"KRT_{module_id}.xlsx"
        rows = rows_by_sheet.get(sheet_name, [])
        if not rows:
            continue
        header = rows[0]
        threat_columns = {
            index: value
            for index, value in header.items()
            if isinstance(value, str) and value.startswith("G ")
        }
        for row in rows[1:]:
            requirement_id = normalize_space(str(row.get(1, "")))
            if not requirement_id.startswith(f"{module_id}.A"):
                continue
            requirement_threats[requirement_id] = [
                threat_id
                for index, threat_id in threat_columns.items()
                if normalize_space(str(row.get(index, ""))).upper() == "X"
            ]
    return requirement_threats

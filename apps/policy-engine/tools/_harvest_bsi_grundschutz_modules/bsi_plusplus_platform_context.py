"""Grundschutz++ methodology context and related-control metadata."""

from typing import Any

GS_PLUSPLUS_METHOD_CONTEXT: dict[str, Any] = {
    "documentTitle": "Leitfaden zur Methodik Grundschutz++",
    "documentVersion": "März 2026",
    "documentDate": "2026-03-16",
    "status": "Einführungs- und Erprobungsphase",
    "sourcePath": (
        "example/bsi-references/downloads/pdf-xlsx-html/Methodik_Grundschutz_PlusPlus.p"
        "df"
    ),
    "processSteps": [
        {
            "step": 1,
            "name": "Erhebung und Planung",
            "pdcaPhase": "Plan",
            "practiceId": "GC",
            "practiceTitle": "Governance und Compliance",
        },
        {
            "step": 2,
            "name": "Anforderungsanalyse",
            "pdcaPhase": "Plan",
            "practiceId": "STM",
            "practiceTitle": "Strukturmodellierung",
        },
        {
            "step": 3,
            "name": "Realisierung",
            "pdcaPhase": "Do",
            "practiceId": "UMS",
            "practiceTitle": "Umsetzung",
        },
        {
            "step": 4,
            "name": "Überwachung",
            "pdcaPhase": "Check",
            "practiceId": "PERF",
            "practiceTitle": "Monitoring-Evaluation",
        },
        {
            "step": 5,
            "name": "kontinuierliche Verbesserung",
            "pdcaPhase": "Act",
            "practiceId": "VRB",
            "practiceTitle": "Verbesserung",
        },
    ],
    "modalVerbDefinitions": {
        "MUSS": "verpflichtend; keine Abweichung vorgesehen",
        "SOLLTE": "regelmäßig verpflichtend; begründete Ausnahme möglich",
        "KANN": "optional; situationsabhängig sinnvoll",
    },
    "securityLevels": {
        "normal-SdT": "normales Sicherheitsniveau gemäß Stand der Technik",
        "erhöht": (
            "erhöhtes Sicherheitsniveau; Herabstufung auf normal ist risikobasiert zu "
            "begründen"
        ),
    },
    "policyEditorUse": {
        "scope": (
            "Relution policies are realization and monitoring artifacts for already modeled "
            "assets."
        ),
        "assetModeling": (
            "GS++ builds a tailored requirement package from information federation, "
            "assets, target object categories, inherited parent categories, and "
            "risk/compliance additions."
        ),
        "parameterization": (
            "Parameterized GS++ requirements need local values; the editor must not invent "
            "thresholds."
        ),
        "nonGoals": (
            "GS++ context does not by itself create an exact Relution mapping or replace "
            "local scope, asset, owner, and risk decisions."
        ),
    },
}

PLATFORM_GS_PLUSPLUS_TARGET_CATEGORIES: dict[str, tuple[str, ...]] = {
    "WINDOWS": ("IT-Systeme", "Endgeräte", "Anwendungen", "Webbrowser", "Daten"),
    "MACOS": ("IT-Systeme", "Endgeräte", "Anwendungen", "Webbrowser", "Daten"),
    "IOS": (
        "IT-Systeme",
        "Endgeräte",
        "Anwendungen",
        "Nutzende",
        "Mobiltelefone",
        "Daten",
    ),
    "ANDROID_ENTERPRISE": (
        "IT-Systeme",
        "Endgeräte",
        "Anwendungen",
        "Nutzende",
        "Mobiltelefone",
        "Daten",
    ),
}

GS_PLUSPLUS_RELATED_CONTROL_RULES: tuple[dict[str, Any], ...] = (
    {
        "reason": "developer and privileged system functions",
        "terms": (
            "entwicklermodus",
            "developer mode",
            "developer options",
            "privilegierte systemfunktionen",
        ),
        "controlIds": ("KONF.2.4", "KONF.6.4"),
    },
    {
        "reason": "automatic updates and patch management",
        "terms": (
            "autoupdate",
            "automatische update",
            "sicherheitsupdate",
            "patchmanagement",
            "patch-management",
            "updates",
        ),
        "controlIds": ("KONF.8.2", "DET.5.10"),
    },
    {
        "reason": "malware and schadcode protection",
        "terms": (
            "schadsoftware",
            "schadcode",
            "malware",
            "virenschutz",
            "echtzeitscanner",
        ),
        "controlIds": ("KONF.7.1", "KONF.7.2", "KONF.7.6", "KONF.7.9", "KONF.7.10"),
    },
    {
        "reason": "password passcode lock and sign-in controls",
        "terms": (
            "passwort",
            "passcode",
            "gerätecode",
            "geraetecode",
            "kennwort",
            "anmeldeversuch",
            "inaktivität",
            "inaktivitaet",
            "sperrung",
        ),
        "controlIds": ("BER.6.8", "BER.6.7", "BER.3.9", "BER.3.11"),
    },
    {
        "reason": "storage and transport encryption",
        "terms": (
            "verschlüssel",
            "verschluessel",
            "encryption",
            "filevault",
            "bitlocker",
            "transportverschlüssel",
        ),
        "controlIds": ("KONF.3.2", "ASST.4.2"),
    },
    {
        "reason": "local firewall and network connection restriction",
        "terms": ("firewall", "netzverbindung", "netzzugriff"),
        "controlIds": ("KONF.7.15",),
    },
    {
        "reason": "interfaces peripheral ports and communication surfaces",
        "terms": (
            "schnittstelle",
            "schnittstellen",
            "kommunikationsschnittstellen",
            "usb",
            "bluetooth",
            "nfc",
            "peripherie",
        ),
        "controlIds": ("ASST.4.1", "KONF.3.7", "KONF.11.8"),
    },
    {
        "reason": "camera microphone and mobile device physical interfaces",
        "terms": (
            "kamera",
            "camera",
            "mikrofon",
            "microphone",
            "siri",
            "assistant",
            "sprachassist",
        ),
        "controlIds": ("KONF.3.7", "SENS.7.18"),
    },
    {
        "reason": "authorized time sources and time synchronization",
        "terms": (
            "zeitquelle",
            "zeitquellen",
            "zeitsynchronisation",
            "ntp",
            "uhrzeit",
            "timezone",
            "zeitzone",
        ),
        "controlIds": ("KONF.4.5",),
    },
    {
        "reason": "remote lock wipe and loss handling",
        "terms": (
            "fernlöschung",
            "fernloeschung",
            "remote wipe",
            "remote lock",
            "abhandenkommen",
            "verlust",
        ),
        "controlIds": ("KONF.3.6", "ASST.6.1"),
    },
    {
        "reason": "asset and application inventory",
        "terms": (
            "inventar",
            "inventarisierung",
            "asset",
            "anwendungsinventar",
            "systeminventar",
        ),
        "controlIds": ("ASST.2.2", "ASST.2.3"),
    },
    {
        "reason": "application permissions and least privilege",
        "terms": (
            "berechtigung",
            "berechtigungen",
            "permission",
            "permissions",
            "privileg",
            "least privilege",
            "zugriff",
        ),
        "controlIds": ("KONF.6.1", "KONF.6.4", "BER.5.1"),
    },
    {
        "reason": "browser and controlled data processing",
        "terms": (
            "browser",
            "webbrowser",
            "cookie",
            "historie",
            "sandbox",
            "webfilter",
        ),
        "controlIds": ("KONF.6.14", "KONF.12.3", "KONF.12.6"),
    },
    {
        "reason": "cloud service and data location governance",
        "terms": (
            "cloud",
            "icloud",
            "datenlokation",
            "datenlokationen",
            "synchronisation",
        ),
        "controlIds": ("ASST.3.10", "KONF.11.8"),
    },
    {
        "reason": "certificates keys and cryptographic trust",
        "terms": (
            "zertifikat",
            "certificate",
            "schlüssel",
            "schluessel",
            "keychain",
            "trust",
        ),
        "controlIds": ("BER.7.10", "BER.7.14", "DEV.7.2"),
    },
    {
        "reason": "wireless vpn and secure network access",
        "terms": ("wlan", "wi-fi", "wifi", "vpn", "wireless", "mobilfunk", "apn"),
        "controlIds": ("ARCH.3.4", "ARCH.4.1", "ARCH.5.1"),
    },
    {
        "reason": "logging auditing and configuration change monitoring",
        "terms": (
            "protokoll",
            "protokollierung",
            "logging",
            "audit",
            "überwachung",
            "ueberwachung",
            "änderung",
            "aenderung",
        ),
        "controlIds": ("DET.3.4", "DET.4.4", "KONF.2.5"),
    },
    {
        "reason": "backup and recovery controls",
        "terms": ("backup", "datensicherung", "sicherung", "wiederherstellung"),
        "controlIds": ("NOT.4.4", "NOT.4.8"),
    },
)

GS_PLUSPLUS_STOPWORDS = set(
    "aber alle auch auf aus bei das der die ein eine einer eines for mit nicht "
    "oder sich sind soll sollen sollte the und von werden wird zur".split()
)

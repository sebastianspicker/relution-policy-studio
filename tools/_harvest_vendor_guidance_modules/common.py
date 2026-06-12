"""Shared constants and helpers for vendor guidance harvesting."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from recommendation_mapping import merge_candidate_lists as shared_merge_candidate_lists


REPO_ROOT = Path(__file__).resolve().parents[2]
VENDOR_DIR = REPO_ROOT / "example" / "vendor-references"
TEMPLATE_BUNDLE_PATH = REPO_ROOT / "data" / "relution-26.1.1" / "template-bundle.json"
WINDOWS_WORKBOOK_PATH = (
    VENDOR_DIR / "downloads" / "derived" / "windows-24h2-workbook.json"
)

VENDOR_VERIFIED_AS_OF = "2026-04-23"
WINDOWS_BASELINE_NAME = "Windows 11 version 25H2 Intune MDM security baseline"
SAFE_SOURCE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")

WINDOWS_EXACT_BY_ID: dict[str, dict[str, Any]] = {
    "windows-0329-allowarchivescanning": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"allowArchiveScanning": True},
    },
    "windows-0330-allowbehaviormonitoring": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"allowBehaviorMonitoring": True},
    },
    "windows-0331-allowcloudprotection": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"allowCloudProtection": True},
    },
    "windows-0334-allowrealtimemonitoring": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"allowRealtimeMonitoring": True},
    },
    "windows-0336-allowscriptscanning": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"allowScriptScanning": True},
    },
    "windows-0348-cloudblocklevel": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"cloudBlockLevel": "HIGH"},
    },
    "windows-0353-enablenetworkprotection": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"enableNetworkProtection": "ON"},
    },
    "windows-0357-puaprotection": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"puaProtection": "ON"},
    },
    "windows-0359-realtimescandirection": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"realTimeScanDirection": "ALL"},
    },
    "windows-0360-submitsamplesconsent": {
        "type": "WINDOWS_ANTIVIRUS",
        "values": {"submitSamplesConsent": "ALL"},
    },
    "windows-0373-enabledomainnetworkfirewall": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "domainProfile": {
                "profileType": "DOMAIN_PROFILE",
                "configureProfileProperties": True,
                "enableFirewall": True,
            }
        },
    },
    "windows-0375-defaultoutboundaction": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "domainProfile": {
                "profileType": "DOMAIN_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultOutboundAction": True,
            }
        },
    },
    "windows-0377-disableinboundnotifications": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "domainProfile": {
                "profileType": "DOMAIN_PROFILE",
                "configureProfileProperties": True,
                "disableInboundNotifications": True,
            }
        },
    },
    "windows-0379-defaultinboundactionfordomainprofile": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "domainProfile": {
                "profileType": "DOMAIN_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultInboundAction": False,
            }
        },
    },
    "windows-0380-enableprivatenetworkfirewall": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "privateProfile": {
                "profileType": "PRIVATE_PROFILE",
                "configureProfileProperties": True,
                "enableFirewall": True,
            }
        },
    },
    "windows-0382-defaultinboundactionforprivateprofile": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "privateProfile": {
                "profileType": "PRIVATE_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultInboundAction": False,
            }
        },
    },
    "windows-0385-defaultoutboundaction": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "privateProfile": {
                "profileType": "PRIVATE_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultOutboundAction": True,
            }
        },
    },
    "windows-0386-disableinboundnotifications": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "privateProfile": {
                "profileType": "PRIVATE_PROFILE",
                "configureProfileProperties": True,
                "disableInboundNotifications": True,
            }
        },
    },
    "windows-0387-enablepublicnetworkfirewall": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "publicProfile": {
                "profileType": "PUBLIC_PROFILE",
                "configureProfileProperties": True,
                "enableFirewall": True,
            }
        },
    },
    "windows-0390-defaultoutboundaction": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "publicProfile": {
                "profileType": "PUBLIC_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultOutboundAction": True,
            }
        },
    },
    "windows-0391-disableinboundnotifications": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "publicProfile": {
                "profileType": "PUBLIC_PROFILE",
                "configureProfileProperties": True,
                "disableInboundNotifications": True,
            }
        },
    },
    "windows-0392-defaultinboundactionforpublicprofile": {
        "type": "WINDOWS_FIREWALL",
        "values": {
            "publicProfile": {
                "profileType": "PUBLIC_PROFILE",
                "configureProfileProperties": True,
                "allowDefaultInboundAction": False,
            }
        },
    },
    "windows-0418-accountslimitlocalaccountuseofblankpasswordstoco": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"allowRemoteLogonWithoutPassword": False},
    },
    "windows-0420-interactivelogonsmartcardremovalbehavior": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"smartCardRemovalBehavior": "LOCK_WORKSTATION"},
    },
    "windows-0432-useraccountcontrolbehavioroftheelevationpromptfo": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"elevationPromptForAdmins": "PROMPT_CONSENT_SECURE_DESKTOP"},
    },
    "windows-0436-useraccountcontrolrunalladministratorsinadminapp": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"runAllAdminsInAdminApprovalMode": True},
    },
    "windows-0437-useraccountcontroluseadminapprovalmode": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"useAdminApprovalModeForAdminAcc": True},
    },
    "windows-0438-useraccountcontrolvirtualizefileandregistrywrite": {
        "type": "WINDOWS_LOCAL_DEVICE_SECURITY",
        "values": {"virtualizeFileRegistry": True},
    },
    "windows-0440-allowgamedvr": {
        "type": "WINDOWS_RESTRICTION",
        "values": {"allowGameDVR": False},
    },
}


def merge_candidate_lists(
    *candidate_groups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge candidate lists while preserving shared recommendation ordering."""

    return shared_merge_candidate_lists(*candidate_groups)

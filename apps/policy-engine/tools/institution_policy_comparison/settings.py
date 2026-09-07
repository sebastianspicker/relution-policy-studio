"""Control and setting extraction for institution policy comparisons."""

from __future__ import annotations

from typing import Any

from .identifiers import identifier_like_tokens
from .utils import first_int


def is_control_id(value: str) -> bool:
    """Check supported BSI SYS and MDM control id formats."""

    if value.startswith("SYS."):
        prefix, separator, requirement = value.rpartition(".A")
        return (
            separator != ""
            and requirement.isdigit()
            and all(part.isdigit() for part in prefix.removeprefix("SYS.").split("."))
        )
    if value.startswith("MDM."):
        parts = value.removeprefix("MDM.").split(".")
        return 2 <= len(parts) <= 3 and all(part.isdigit() for part in parts)
    return False


def find_control_ids(text: str) -> list[str]:
    """Return BSI/MDM control ids mentioned in text."""

    return [token for token in identifier_like_tokens(text) if is_control_id(token)]


def infer_setting_values(block: str) -> dict[str, dict[str, Any]]:
    """Infer simple setting values that can be compared against baselines."""

    values: dict[str, dict[str, Any]] = {}
    min_length = first_int(
        block, r"Minimum (?:passcode|password) length\s*\|\s*(?:\*\*)?(\d+)"
    )
    if min_length is not None:
        for target in (
            "IOS_PASSCODE",
            "WINDOWS_PASSCODE",
            "ANDROID_ENTERPRISE_DEVICE_PASSCODE",
        ):
            values.setdefault(target, {})["minLength"] = min_length
    history = first_int(block, r"Passcode history\s*\|\s*(?:\*\*)?(\d+)")
    if history is not None:
        for target in (
            "IOS_PASSCODE",
            "WINDOWS_PASSCODE",
            "ANDROID_ENTERPRISE_DEVICE_PASSCODE",
        ):
            values.setdefault(target, {})["history"] = history
    if "FileVault" in block:
        values.setdefault("MACOS_FILE_VAULT", {})["enabled"] = True
    if "BitLocker" in block:
        values.setdefault("WINDOWS_BITLOCKER", {})["enabled"] = True
    return values

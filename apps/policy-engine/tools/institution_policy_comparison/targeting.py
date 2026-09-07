"""Target platform classification for baseline comparisons."""

from __future__ import annotations


def target_platform(target: str) -> str:
    """Infer the logical platform represented by a mapping target id."""

    if target.startswith("WINDOWS_"):
        return "WINDOWS"
    if target.startswith("MACOS_") or target in {"APPLE_SOFTWARE_UPDATE_SETTINGS"}:
        return "MACOS"
    if target.startswith("IOS_") or target == "APPLE_DEVICE_SETTINGS":
        return "IOS"
    if target.startswith("ANDROID_ENTERPRISE_"):
        return "ANDROID_ENTERPRISE"
    return ""

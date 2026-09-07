"""Relution Platforms helpers for recommendation mapping."""


def android_relution_platforms(target: str, raw: set[str]) -> set[str]:
    """Resolve Android and Android Enterprise platform aliases."""

    if "ANDROID_ENTERPRISE" in raw or target.startswith("ANDROID_ENTERPRISE"):
        return {"ANDROID", "ANDROID_ENTERPRISE"}
    if "ANDROID" in raw or target.startswith("ANDROID"):
        return {"ANDROID"}
    return set()
def apple_relution_platforms(target: str, raw: set[str]) -> set[str]:
    """Resolve Apple aggregate targets to iOS or macOS families."""

    if not target.startswith("APPLE_"):
        return set()
    return {platform for platform in ("IOS", "MACOS") if platform in raw}

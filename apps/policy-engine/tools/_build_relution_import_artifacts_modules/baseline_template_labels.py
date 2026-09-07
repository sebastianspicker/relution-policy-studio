"""Display and path labels for generated baseline templates."""


def platform_label(platform: str) -> str:
    """Return the generated-artifact display label for a platform code."""
    return {
        "WINDOWS": "Windows",
        "MACOS": "macOS",
        "IOS": "iOS",
        "ANDROID_ENTERPRISE": "Android Enterprise",
    }[platform]


def platform_slug(platform: str) -> str:
    """Convert a platform code into a generated path slug."""
    return platform.lower().replace("_", "-")


def target_label(target: str) -> str:
    """Return a human-readable label for a Relution or Apple payload target."""
    if target.startswith("profile:"):
        return (
            target.removeprefix("profile:")
            .replace("com.apple.", "Apple ")
            .replace(".", " ")
            .title()
        )
    if target.startswith("com.apple."):
        return target.replace("com.apple.", "Apple ").replace(".", " ").title()
    if target.startswith("IOS_"):
        return "iOS " + target.removeprefix("IOS_").replace("_", " ").title()
    if target.startswith("IPADOS_"):
        return "iPadOS " + target.removeprefix("IPADOS_").replace("_", " ").title()
    if target.startswith("MACOS_"):
        return "macOS " + target.removeprefix("MACOS_").replace("_", " ").title()
    return target.replace("_", " ").title()

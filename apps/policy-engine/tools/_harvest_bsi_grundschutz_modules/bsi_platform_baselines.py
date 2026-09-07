"""Platform-specific BSI baseline module selections."""

from .bsi_platform_models import ModuleTarget, PlatformTarget


MOBILE_BASELINE_MODULES: tuple[ModuleTarget, ...] = (
    ModuleTarget(
        "SYS.3.2.1",
        "SYS.3.2.1 Allgemeine Smartphones und Tablets",
        "sys-3-2-1-smartphones-tablets",
        "shared-mobile-baseline",
    ),
    ModuleTarget(
        "SYS.3.2.2",
        "SYS.3.2.2 Mobile Device Management (MDM)",
        "sys-3-2-2-mdm",
        "shared-mobile-mdm-baseline",
        ("mdm-minimum-standard-v2",),
    ),
)


PLATFORM_TARGETS: tuple[PlatformTarget, ...] = (
    PlatformTarget(
        platform="WINDOWS",
        os_family="WINDOWS",
        policy_name="Windows BSI Grundschutz",
        policy_description=(
            "Edition 2023 client baseline plus Windows-specific BSI Grundschutz "
            "requirements for managed Windows devices."
        ),
        modules=(
            ModuleTarget(
                "SYS.2.1",
                "SYS.2.1 Allgemeiner Client",
                "sys-2-1-general-client",
                "shared-client-baseline",
            ),
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
        policy_description=(
            "Edition 2023 client baseline plus macOS-specific BSI Grundschutz requirements "
            "for managed macOS devices."
        ),
        modules=(
            ModuleTarget(
                "SYS.2.1",
                "SYS.2.1 Allgemeiner Client",
                "sys-2-1-general-client",
                "shared-client-baseline",
            ),
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
        policy_description=(
            "Edition 2023 smartphone/tablet and MDM baseline plus iOS-specific BSI "
            "Grundschutz requirements for managed iOS devices."
        ),
        modules=(
            *MOBILE_BASELINE_MODULES,
            ModuleTarget(
                "SYS.3.2.3",
                "SYS.3.2.3 iOS (for Enterprise)",
                "sys-3-2-3-ios",
                "ios-specific-baseline",
            ),
        ),
    ),
    PlatformTarget(
        platform="ANDROID_ENTERPRISE",
        os_family="ANDROID",
        policy_name="Android BSI Grundschutz",
        policy_description=(
            "Edition 2023 smartphone/tablet and MDM baseline plus Android-specific BSI "
            "Grundschutz requirements for managed Android Enterprise devices."
        ),
        modules=(
            *MOBILE_BASELINE_MODULES,
            ModuleTarget(
                "SYS.3.2.4",
                "SYS.3.2.4 Android",
                "sys-3-2-4-android",
                "android-specific-baseline",
            ),
        ),
    ),
)

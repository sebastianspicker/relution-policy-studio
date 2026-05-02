def relution_mapping(target_type: str, values: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "relution-native", "type": target_type, "values": {"enabled": True, **values}}


def apple_mapping(schema_id: str, values: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "apple-schema-profile", "schemaId": schema_id, "values": values}


def exact_rule(note: str, *mappings: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "exact",
        "mergeableInImportableRuleset": True,
        "candidates": [candidate_for_curated_mapping(mapping) for mapping in mappings],
        "rulesetMappings": list(mappings),
        "notes": [note],
    }


def parameterized_rule(
    note: str,
    candidates: tuple[tuple[str, str, tuple[str, ...]], ...],
    *,
    parameters: tuple[tuple[str, str, str, str], ...] = (),
    processes: tuple[tuple[str, str, str], ...] = (),
) -> dict[str, Any]:
    return {
        "status": "parameterized",
        "mergeableInImportableRuleset": False,
        "candidates": [{"kind": kind, "target": target, "fieldPaths": list(paths)} for kind, target, paths in candidates],
        "rulesetMappings": [],
        "parameterRequirements": [
            {"id": parameter_id, "path": path, "label": label, "description": description}
            for parameter_id, path, label, description in parameters
        ],
        "processSupport": [
            {"id": process_id, "relutionFunction": relution_function, "evidence": evidence}
            for process_id, relution_function, evidence in processes
        ],
        "notes": [note],
    }


def candidate_for_curated_mapping(mapping: dict[str, Any]) -> dict[str, Any]:
    if mapping["kind"] == "relution-native":
        target = str(mapping["type"])
    else:
        target = str(mapping["schemaId"])
    return {"kind": mapping["kind"], "target": target, "fieldPaths": flatten_value_paths(mapping.get("values", {}))}


def extra_relution_mapping_metadata(mapping: dict[str, Any]) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    if isinstance(mapping.get("parameterRequirements"), list):
        extra["parameterRequirements"] = list(mapping["parameterRequirements"])
    if isinstance(mapping.get("processSupport"), list):
        extra["processSupport"] = list(mapping["processSupport"])
    return extra


WINDOWS_PASSCODE_BASELINE = exact_rule(
    "Conservative BSI Basis default: require authentication, non-simple alphanumeric password, idle lock, and lock-screen privacy.",
    relution_mapping("WINDOWS_PASSCODE", {"allowSimplePassword": False, "quality": "ALPHANUMERIC", "minLength": 12, "history": 5, "maxFailAttempts": 10, "maxInactivityTime": 15}),
    relution_mapping("WINDOWS_LOCAL_DEVICE_SECURITY", {"inactivityTimeUntilScreenSaver": 900, "userInformationOnLockScreenConfiguration": "NO_USER_INFORMATION"}),
)
WINDOWS_UPDATE_BASELINE = exact_rule(
    "Conservative BSI Basis default: enable Windows Update with automatic install and daily checks.",
    relution_mapping("WINDOWS_UPDATE", {"enableWindowsUpdateAccess": True, "enablePauseUpdates": False, "autoUpdateType": "AUTO_INSTALL_AND_RESTART_AT_SPECIFIED_TIME", "installDay": "EVERY_DAY", "installTime": 3, "deadlineForQualityUpdates": 7, "deadlineForFeatureUpdates": 30}),
)
WINDOWS_DEFENDER_BASELINE = exact_rule(
    "Conservative BSI Basis default: enable Microsoft Defender real-time, cloud, archive, script, and IOAV protection.",
    relution_mapping("WINDOWS_ANTIVIRUS", {"allowRealtimeMonitoring": True, "allowBehaviorMonitoring": True, "allowCloudProtection": True, "allowArchiveScanning": True, "allowEmailScanning": True, "allowIOAVProtection": True, "allowScriptScanning": True, "puaProtection": "ON", "signatureUpdateInterval": 4, "realTimeScanDirection": "ALL"}),
)
WINDOWS_BOOT_BASELINE = exact_rule(
    "Conservative BSI Basis default: require device encryption and TPM-backed BitLocker protection where supported.",
    relution_mapping("WINDOWS_BITLOCKER", {"requireDeviceEncryption": True, "startAuthenticationRequired": True, "tpmOnIncompatibleDevices": False, "tpmStartup": "REQUIRED", "tpmStartupPin": "DISALLOWED", "tpmStartupKey": "DISALLOWED", "tpmStartupPinAndKey": "DISALLOWED", "encryptionTypeForOsDrives": "XTS_AES_256", "encryptionTypeForFixedDrives": "XTS_AES_256", "encryptionTypeForRemovableDrives": "XTS_AES_256", "osDrivesEncryptionType": "USED_SPACE_ONLY", "osDrivesConfigureRecovery": True, "osDrivesCreateRecoveryPassword": "REQUIRED"}),
)
WINDOWS_CLOUD_BASELINE = exact_rule(
    "Conservative BSI Basis default: reduce Microsoft account, sync, privacy, and diagnostic integration surfaces.",
    relution_mapping("WINDOWS_RESTRICTION", {"allowSyncMySettings": False, "allowAddingForeignAccountsManually": False, "allowAccounts": False, "allowYourAccount": False, "allowPrivacyExperience": False, "allowInputPersonalization": False, "appGetDiagnosticInfo": "DENY"}),
)

APPLE_PASSCODE_BASELINE_VALUES = {
    "allowSimple": False,
    "forcePIN": True,
    "minLength": 8,
    "requireAlphanumeric": True,
    "maxInactivity": 5,
    "maxGracePeriod": 0,
    "maxFailedAttempts": 10,
    "pinHistory": 5,
}
MACOS_AUTH_BASELINE = exact_rule(
    "Conservative BSI Basis default: require password authentication and screen-saver lock on macOS.",
    apple_mapping("profile:com.apple.mobiledevice.passwordpolicy", APPLE_PASSCODE_BASELINE_VALUES),
    relution_mapping("MACOS_SCREENSAVER", {"askForPassword": True, "askForPasswordDelay": 0, "loginWindowIdleTime": 900}),
)
MACOS_MALWARE_BASELINE = exact_rule(
    "Conservative BSI Basis default: enforce Gatekeeper assessment for identified developers.",
    relution_mapping("MACOS_SYSTEM_POLICY_CONTROL", {"allowIdentifiedDevelopers": True, "enableAssessment": True}),
)
MACOS_BOOT_BASELINE = exact_rule(
    "Conservative BSI Basis default: enforce FileVault and prevent users from disabling disk encryption.",
    relution_mapping("MACOS_FILE_VAULT", {"fdeFileVault": {"enable": "ON", "defer": True, "useRecoveryKey": True, "showRecoveryKey": True}, "fdeFileVaultOptions": {"dontAllowFDEDisable": True}, "enableRecoveryKeyEscrow": True}),
)
MACOS_CLOUD_BASELINE = exact_rule(
    "Conservative BSI Basis default: disable unmanaged cloud sync and continuity surfaces on macOS.",
    relution_mapping("MACOS_RESTRICTION", {"allowCloudDocumentSync": False, "allowCloudKeychainSync": False, "allowCloudPhotoLibrary": False, "allowCloudDesktopAndDocuments": False, "allowActivityContinuation": False, "allowAirDrop": False, "allowDiagnosticSubmission": False}),
)

IOS_PASSCODE_BASELINE = exact_rule(
    "Conservative BSI Basis default: require an alphanumeric device passcode, short auto-lock, and passcode history.",
    relution_mapping("IOS_PASSCODE", {"allowSimple": False, "requireAlphanumeric": True, "forcePIN": True, "minLength": 8, "maxInactivityMinutes": 5, "maxGracePeriodMinutes": 0, "maxFailedAttempts": 10, "pinHistory": 5}),
)
IOS_UPDATE_BASELINE = exact_rule(
    "Conservative BSI Basis default: install iOS updates as soon as possible.",
    relution_mapping("IOS_UPDATE", {"updateMode": "INSTALL_ASAP"}),
)
IOS_ASSISTANT_BASELINE = exact_rule(
    "Conservative BSI Basis default: disable Siri and Siri access while the device is locked.",
    relution_mapping("IOS_RESTRICTION", {"allowAssistant": False, "allowAssistantWhileLocked": False}),
)
IOS_PRIVACY_BASELINE = exact_rule(
    "Conservative BSI Basis default: reduce diagnostic, cloud, camera, lock-screen, and unmanaged data-transfer surfaces.",
    relution_mapping("IOS_RESTRICTION", {"allowDiagnosticSubmission": False, "allowCloudBackup": False, "allowCloudDocumentSync": False, "allowCloudKeychainSync": False, "allowCloudPhotoLibrary": False, "allowCloudPrivateRelay": False, "allowOpenFromManagedToUnmanaged": False, "allowAssistantWhileLocked": False, "allowLockScreenNotificationsView": False}),
)
IOS_APP_INSTALL_BASELINE = exact_rule(
    "Conservative BSI Basis default: block user-driven app installation/trust while allowing MDM-managed apps.",
    relution_mapping("IOS_RESTRICTION", {"allowAppInstallation": False, "allowUIAppInstallation": False, "allowEnterpriseAppTrust": False, "allowUIConfigurationProfileInstallation": False}),
)

ANDROID_PASSCODE_BASELINE = exact_rule(
    "Conservative BSI Basis default: require a complex Android Enterprise device passcode and enforced display timeout.",
    relution_mapping("ANDROID_ENTERPRISE_DEVICE_PASSCODE", {"quality": "ALPHANUMERIC", "minLength": 8, "passcodeHistory": 5, "maxFailedPasswordsForWipe": 10}),
    relution_mapping("ANDROID_ENTERPRISE_DISPLAY", {"screenTimeoutMode": "SCREEN_TIMEOUT_ENFORCED", "screenTimeout": 300000}),
)
ANDROID_UPDATE_BASELINE = exact_rule(
    "Conservative BSI Basis default: install Android system updates automatically and keep managed apps updated.",
    relution_mapping("ANDROID_ENTERPRISE_SYSTEM_UPDATE", {"systemUpdateType": "AUTOMATIC"}),
    relution_mapping("ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT", {"appAutoUpdatePolicy": "ALWAYS"}),
)
ANDROID_PRIVACY_BASELINE = exact_rule(
    "Conservative BSI Basis default: deny permissions by default and restrict privacy-sensitive interfaces unless explicitly allowed.",
    relution_mapping("ANDROID_ENTERPRISE_PERMISSION_MANAGEMENT", {"defaultPermissionPolicy": "DENY"}),
    relution_mapping("ANDROID_ENTERPRISE_RESTRICTION", {"shareLocationDisabled": True, "cameraAccessPermission": "CAMERA_ACCESS_USER_CHOICE", "microphoneAccessPermission": "MICROPHONE_ACCESS_USER_CHOICE", "screenCaptureDisabled": True}),
)
ANDROID_APP_INSTALL_BASELINE = exact_rule(
    "Conservative BSI Basis default: disallow untrusted app sources and restrict Play Store availability to managed scope.",
    relution_mapping("ANDROID_ENTERPRISE_ADVANCED_SECURITY_OVERRIDES", {"untrustedAppsPolicy": "DISALLOW_INSTALL", "googlePlayProtectVerifyApps": "VERIFY_APPS_ENFORCED"}),
    relution_mapping("ANDROID_ENTERPRISE_PLAY_STORE_MANAGEMENT", {"restrictedPlayStoreMode": True}),
)

PROCESS_CANDIDATES = {
    "WINDOWS": (("relution-native", "WINDOWS_CUSTOM_CSP", ("installSyncML",)), ("relution-native", "WINDOWS_APP_COMPLIANCE", ("requiredApps",))),
    "MACOS": (("relution-native", "MACOS_APP_COMPLIANCE", ("requiredApps",)), ("relution-native", "MACOS_RESTRICTION", ("allowCloudDocumentSync",))),
    "IOS": (("relution-native", "IOS_APP_COMPLIANCE", ("requiredApps",)), ("relution-native", "IOS_RESTRICTION", ("allowAppInstallation",))),
    "ANDROID_ENTERPRISE": (("relution-native", "ANDROID_ENTERPRISE_COMPLIANCE_ENFORCEMENT", ("configurationEnforcementRules",)), ("relution-native", "ANDROID_ENTERPRISE_APP_POLICY", ("applications",))),
}


def process_rule(platform: str, note: str) -> dict[str, Any]:
    return parameterized_rule(
        note,
        PROCESS_CANDIDATES[platform],
        parameters=(("local-scope", "scope.assetGroup", "Managed asset scope", "Define the device group, ownership model, and approved users for this BSI requirement."),),
        processes=(("relution-evidence", "Relution policy, enrollment, inventory, compliance, and reporting workflow", "Attach Relution policy/export/report evidence to the local BSI implementation record."),),
    )


MAPPING_RULES.update(
    {
        ("WINDOWS", "SYS.2.1.A1"): WINDOWS_PASSCODE_BASELINE,
        ("WINDOWS", "SYS.2.1.A3"): WINDOWS_UPDATE_BASELINE,
        ("WINDOWS", "SYS.2.1.A6"): WINDOWS_DEFENDER_BASELINE,
        ("WINDOWS", "SYS.2.1.A8"): WINDOWS_BOOT_BASELINE,
        ("WINDOWS", "SYS.2.1.A42"): WINDOWS_CLOUD_BASELINE,
        ("WINDOWS", "SYS.2.2.3.A1"): process_rule("WINDOWS", "BSI cloud planning requires local service, identity, and data-location decisions; Relution can enforce resulting policy settings."),
        ("WINDOWS", "SYS.2.2.3.A2"): process_rule("WINDOWS", "BSI Windows version selection is procurement and lifecycle governance; Relution inventory and policy targeting provide evidence."),
        ("WINDOWS", "SYS.2.2.3.A4"): WINDOWS_CLOUD_BASELINE,
        ("WINDOWS", "SYS.2.2.3.A5"): WINDOWS_DEFENDER_BASELINE,
        ("WINDOWS", "SYS.2.2.3.A6"): WINDOWS_CLOUD_BASELINE,
        ("MACOS", "SYS.2.1.A1"): MACOS_AUTH_BASELINE,
        ("MACOS", "SYS.2.1.A6"): MACOS_MALWARE_BASELINE,
        ("MACOS", "SYS.2.1.A8"): MACOS_BOOT_BASELINE,
        ("MACOS", "SYS.2.1.A42"): MACOS_CLOUD_BASELINE,
        ("MACOS", "SYS.2.4.A1"): process_rule("MACOS", "BSI macOS planning requires local deployment and support decisions; Relution can enforce the resulting profile baseline."),
        ("MACOS", "SYS.2.4.A2"): process_rule("MACOS", "BSI integrated macOS security functions require local enablement decisions plus Relution profile evidence."),
        ("MACOS", "SYS.2.4.A3"): process_rule("MACOS", "BSI account suitability requires local identity and admin-role decisions; Relution can enforce related account restrictions."),
        ("IOS", "SYS.3.2.1.A19"): IOS_ASSISTANT_BASELINE,
        ("IOS", "SYS.3.2.1.A4"): IOS_PASSCODE_BASELINE,
        ("IOS", "SYS.3.2.1.A5"): IOS_UPDATE_BASELINE,
        ("IOS", "SYS.3.2.1.A6"): IOS_PRIVACY_BASELINE,
        ("IOS", "SYS.3.2.1.A8"): IOS_APP_INSTALL_BASELINE,
        ("IOS", "SYS.3.2.3.A2"): IOS_PRIVACY_BASELINE,
        ("IOS", "SYS.3.2.3.A7"): process_rule("IOS", "BSI profile-removal protection depends on supervision/enrollment and Relution management state evidence."),
        ("ANDROID_ENTERPRISE", "SYS.3.2.1.A4"): ANDROID_PASSCODE_BASELINE,
        ("ANDROID_ENTERPRISE", "SYS.3.2.1.A5"): ANDROID_UPDATE_BASELINE,
        ("ANDROID_ENTERPRISE", "SYS.3.2.1.A6"): ANDROID_PRIVACY_BASELINE,
        ("ANDROID_ENTERPRISE", "SYS.3.2.1.A8"): ANDROID_APP_INSTALL_BASELINE,
    }
)

for _platform, _requirement in (
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A1"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A2"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A3"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.1.A7"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A1"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A2"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A20"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A3"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A4"),
    ("ANDROID_ENTERPRISE", "SYS.3.2.2.A5"),
    ("IOS", "SYS.3.2.1.A1"),
    ("IOS", "SYS.3.2.1.A2"),
    ("IOS", "SYS.3.2.1.A3"),
    ("IOS", "SYS.3.2.1.A7"),
    ("IOS", "SYS.3.2.2.A1"),
    ("IOS", "SYS.3.2.2.A2"),
    ("IOS", "SYS.3.2.2.A20"),
    ("IOS", "SYS.3.2.2.A3"),
    ("IOS", "SYS.3.2.2.A4"),
    ("IOS", "SYS.3.2.2.A5"),
    ("IOS", "SYS.3.2.3.A1"),
):
    MAPPING_RULES.setdefault(
        (_platform, _requirement),
        process_rule(_platform, "BSI mandatory Basis governance requirement: Relution provides policy, enrollment, inventory, compliance, and reporting evidence, but local scope decisions remain required."),
    )

del _platform, _requirement

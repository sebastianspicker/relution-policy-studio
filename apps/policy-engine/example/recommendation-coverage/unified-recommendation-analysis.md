# Unified Recommendation Semantic Analysis

Generated: `2026-09-07T10:51:30Z`

## Summary

- Common semantic groups: `104`
- Hard contradictions: `2`
- Differences noted: `107`
- BSI-authoritative differences: `107`
- Source recommendation counts: `{"bsi": 278, "cis": 1336, "vendor": 518}`

## BSI Precedence

BSI is authoritative for interpretation. This report annotates conflicts and differences; it does not rewrite CIS or vendor mappings.

## Common Groups

- `WINDOWS` `app_allowlist` - App allowlist and execution control: sources `bsi, cis, vendor`, recommendations `{"bsi": 11, "cis": 51, "vendor": 105}`, shared targets `10`
- `WINDOWS` `browser_restrictions` - Browser and web restrictions: sources `bsi, cis, vendor`, recommendations `{"bsi": 12, "cis": 23, "vendor": 38}`, shared targets `3`
- `WINDOWS` `camera_microphone` - Camera and microphone: sources `bsi, cis, vendor`, recommendations `{"bsi": 3, "cis": 11, "vendor": 1}`, shared targets `3`
- `WINDOWS` `certificates` - Certificates and keys: sources `bsi, cis, vendor`, recommendations `{"bsi": 11, "cis": 45, "vendor": 18}`, shared targets `6`
- `WINDOWS` `cloud_sync` - Cloud and sync functions: sources `bsi, cis, vendor`, recommendations `{"bsi": 12, "cis": 44, "vendor": 110}`, shared targets `6`
- `WINDOWS` `device_attestation_posture` - Device integrity and attestation: sources `bsi, cis, vendor`, recommendations `{"bsi": 2, "cis": 5, "vendor": 1}`, shared targets `2`
- `WINDOWS` `dns_resolution` - DNS and name resolution: sources `bsi, cis, vendor`, recommendations `{"bsi": 23, "cis": 7, "vendor": 3}`, shared targets `2`
- `WINDOWS` `encryption` - Encryption: sources `bsi, cis, vendor`, recommendations `{"bsi": 14, "cis": 121, "vendor": 61}`, shared targets `11`
- `WINDOWS` `exploit_mitigation` - Exploit mitigation and runtime protection: sources `bsi, cis, vendor`, recommendations `{"bsi": 4, "cis": 51, "vendor": 12}`, shared targets `3`
- `WINDOWS` `external_media` - External media and peripherals: sources `bsi, cis, vendor`, recommendations `{"bsi": 5, "cis": 41, "vendor": 37}`, shared targets `6`
- `WINDOWS` `firewall` - Firewall and packet filtering: sources `bsi, cis, vendor`, recommendations `{"bsi": 3, "cis": 131, "vendor": 113}`, shared targets `22`
- `WINDOWS` `kiosk` - Kiosk and app lock: sources `bsi, cis, vendor`, recommendations `{"bsi": 1, "cis": 8, "vendor": 4}`, shared targets `2`
- `WINDOWS` `lock_idle` - Lock and idle timeout: sources `bsi, cis, vendor`, recommendations `{"bsi": 7, "cis": 11, "vendor": 11}`, shared targets `2`
- `WINDOWS` `lock_screen_message` - Lock-screen and login messages: sources `bsi, cis, vendor`, recommendations `{"bsi": 2, "cis": 3, "vendor": 2}`, shared targets `2`
- `WINDOWS` `logging_compliance` - Logging and compliance: sources `bsi, cis, vendor`, recommendations `{"bsi": 14, "cis": 63, "vendor": 39}`, shared targets `7`
- `WINDOWS` `malware_protection` - Malware protection: sources `bsi, cis, vendor`, recommendations `{"bsi": 4, "cis": 229, "vendor": 129}`, shared targets `27`
- `WINDOWS` `mdm_compliance` - MDM and compliance: sources `bsi, cis, vendor`, recommendations `{"bsi": 1, "cis": 4, "vendor": 89}`, shared targets `2`
- `WINDOWS` `mfa` - Multi-factor authentication: sources `bsi, cis, vendor`, recommendations `{"bsi": 9, "cis": 40, "vendor": 9}`, shared targets `4`
- `WINDOWS` `network_connectivity` - VPN, Wi-Fi, proxy, and connectivity: sources `bsi, cis, vendor`, recommendations `{"bsi": 32, "cis": 97, "vendor": 43}`, shared targets `14`
- `WINDOWS` `passcode_authentication` - Authentication and passcode: sources `bsi, cis, vendor`, recommendations `{"bsi": 13, "cis": 123, "vendor": 27}`, shared targets `9`
- `WINDOWS` `permissions_privacy` - Permissions and privacy: sources `bsi, cis, vendor`, recommendations `{"bsi": 13, "cis": 45, "vendor": 25}`, shared targets `2`
- `WINDOWS` `secure_boot_hardware` - Secure boot and hardware protection: sources `bsi, cis, vendor`, recommendations `{"bsi": 10, "cis": 14, "vendor": 2}`, shared targets `2`
- `WINDOWS` `updates` - Updates and patching: sources `bsi, cis, vendor`, recommendations `{"bsi": 4, "cis": 88, "vendor": 147}`, shared targets `10`
- `MACOS` `camera_microphone` - Camera and microphone: sources `bsi, cis, vendor`, recommendations `{"bsi": 4, "cis": 10, "vendor": 1}`, shared targets `3`
- `MACOS` `certificates` - Certificates and keys: sources `bsi, cis, vendor`, recommendations `{"bsi": 13, "cis": 54, "vendor": 3}`, shared targets `3`
- `MACOS` `device_attestation_posture` - Device integrity and attestation: sources `bsi, cis, vendor`, recommendations `{"bsi": 6, "cis": 6, "vendor": 1}`, shared targets `2`
- `MACOS` `encryption` - Encryption: sources `bsi, cis, vendor`, recommendations `{"bsi": 11, "cis": 28, "vendor": 5}`, shared targets `3`
- `MACOS` `exploit_mitigation` - Exploit mitigation and runtime protection: sources `bsi, cis, vendor`, recommendations `{"bsi": 5, "cis": 50, "vendor": 2}`, shared targets `2`
- `MACOS` `mfa` - Multi-factor authentication: sources `bsi, cis, vendor`, recommendations `{"bsi": 9, "cis": 6, "vendor": 1}`, shared targets `3`
- `MACOS` `passcode_authentication` - Authentication and passcode: sources `bsi, cis, vendor`, recommendations `{"bsi": 9, "cis": 70, "vendor": 3}`, shared targets `11`

## Hard Contradictions

- `ANDROID_ENTERPRISE` `ANDROID_ENTERPRISE_RESTRICTION` `microphoneAccessPermission`: sources `bsi, cis`. BSI wins; mappings are unchanged.
- `ANDROID_ENTERPRISE` `ANDROID_ENTERPRISE_SYSTEM_UPDATE` `systemUpdateType`: sources `bsi, vendor`. BSI wins; mappings are unchanged.

## Differences

- `IOS` `IOS_PASSCODE` `minLength` differs across `bsi, cis`.
- `WINDOWS` `WINDOWS_PASSCODE` `history` differs across `bsi, cis`.
- `WINDOWS` `WINDOWS_PASSCODE` `minLength` differs across `bsi, cis`.
- `ANDROID_ENTERPRISE` `browser_restrictions` support differs: `{"bsi": "exact", "cis": "candidate", "vendor": "candidate"}`. BSI wins for interpretation.
- `ANDROID_ENTERPRISE` `location` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `ANDROID_ENTERPRISE` `passcode_authentication` support differs: `{"bsi": "exact", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `ANDROID_ENTERPRISE` `policy_governance` support differs: `{"bsi": "candidate", "vendor": "concept-only"}`. BSI wins for interpretation.
- `IOS` `app_allowlist` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `encryption` support differs: `{"bsi": "candidate", "cis": "concept-only"}`. BSI wins for interpretation.
- `IOS` `external_media` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `network_connectivity` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `remote_lock_wipe` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `telemetry` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `time_sync` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `IOS` `updates` support differs: `{"bsi": "exact", "cis": "candidate"}`. BSI wins for interpretation.
- `MACOS` `browser_restrictions` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `MACOS` `camera_microphone` support differs: `{"bsi": "candidate", "cis": "exact", "vendor": "candidate"}`. BSI wins for interpretation.
- `MACOS` `certificates` support differs: `{"bsi": "exact", "cis": "candidate", "vendor": "candidate"}`. BSI wins for interpretation.
- `MACOS` `encryption` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `MACOS` `exploit_mitigation` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "concept-only"}`. BSI wins for interpretation.
- `MACOS` `mdm_compliance` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `MACOS` `mdm_strategy_selection` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `MACOS` `network_connectivity` support differs: `{"bsi": "exact", "cis": "candidate"}`. BSI wins for interpretation.
- `MACOS` `passcode_authentication` support differs: `{"bsi": "exact", "cis": "exact", "vendor": "candidate"}`. BSI wins for interpretation.
- `MACOS` `telemetry` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `MACOS` `time_sync` support differs: `{"bsi": "candidate", "cis": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `app_allowlist` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `browser_restrictions` support differs: `{"bsi": "candidate", "cis": "exact", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `camera_microphone` support differs: `{"bsi": "candidate", "cis": "exact", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `certificates` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `device_attestation_posture` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `exploit_mitigation` support differs: `{"bsi": "candidate", "cis": "exact", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `external_media` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `firewall` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `lock_idle` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `mdm_compliance` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `mfa` support differs: `{"bsi": "candidate", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `network_connectivity` support differs: `{"bsi": "candidate", "cis": "exact", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `permissions_privacy` support differs: `{"bsi": "exact", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.
- `WINDOWS` `secure_boot_hardware` support differs: `{"bsi": "exact", "cis": "candidate", "vendor": "exact"}`. BSI wins for interpretation.

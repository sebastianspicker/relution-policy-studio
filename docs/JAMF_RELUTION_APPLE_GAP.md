# Jamf / Relution Apple Gap Matrix

Relution APPLE_MOBILECONFIG transport: present
Mobileconfig-backed gap settings: 22
Not wireable via mobileconfig: 1

Settings marked with `*` in the editor are generated as Relution `APPLE_MOBILECONFIG` configurations.

## Settings

| Setting | Jamf feature | Apple payload | Platforms | Status | Relution transport |
| --- | --- | --- | --- | --- | --- |
| Privacy Preferences Policy Control | Privacy Preferences Policy Control payload | `com.apple.TCC.configuration-profile-policy` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Managed Preferences | Custom settings / managed preferences payload | `com.apple.ManagedClient.preferences` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Associated Domains | Associated Domains payload | `com.apple.associated-domains` | IOS, MACOS, TVOS, VISIONOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Managed Login Items | Managed Login Items payload | `com.apple.servicemanagement` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Network Relay | Network Relay payload | `com.apple.relay.managed` | IOS, MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Certificate Transparency | Certificate Transparency payload | `com.apple.security.certificatetransparency` | IOS, MACOS, TVOS, WATCHOS, VISIONOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Smart Card | Smart Card payload | `com.apple.security.smartcard` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Printing | Printing payload | `com.apple.mcxprinting` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Network Usage Rules | Network Usage Rules payload | `com.apple.networkusagerules` | IOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| System Migration | System Migration payload | `com.apple.systemmigration` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| ACME Certificate | ACME Certificate payload | `com.apple.security.acme` | IOS, MACOS, TVOS, WATCHOS, VISIONOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Autonomous Single App Mode | Autonomous Single App Mode payload | `com.apple.asam` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Cellular Private Network | Cellular Private Network payload | `com.apple.cellularprivatenetwork.managed` | IOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Certificate Preference | Certificate Preference payload | `com.apple.security.certificatepreference` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Certificate Revocation | Certificate Revocation payload | `com.apple.security.certificaterevocation` | IOS, VISIONOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Exchange Web Services | Exchange Web Services payload | `com.apple.ews.account` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Identity Preference | Identity Preference payload | `com.apple.security.identitypreference` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Lights Out Management | Lights Out Management payload | `com.apple.lom` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Lock Screen Message | Lock Screen Message payload | `com.apple.shareddeviceconfiguration` | IOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| TV Remote | TV Remote payload | `com.apple.tvremote` | IOS, TVOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Xsan | Xsan payload | `com.apple.xsan` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Xsan Preferences | Xsan Preferences payload | `com.apple.xsan.preferences` | MACOS | mobileconfig-backed | APPLE_MOBILECONFIG |
| Declarative Management Declarations | Declarative Device Management declarations | `declarative-management` | IOS, MACOS, TVOS, WATCHOS, VISIONOS | not-mobileconfig-wireable | - |

## Sources

- https://developer.apple.com/documentation/devicemanagement/profile-specific-payload-keys
- https://support.apple.com/guide/deployment/intro-to-device-management-payloads-depd73c1b83c/web
- https://learn.jamf.com/en-US/bundle/jamf-pro-documentation-current/page/Mobile_Device_Configuration_Profiles.html
- https://learn.jamf.com/en-US/bundle/jamf-pro-documentation-current/page/Computer_Configuration_Profiles.html
- https://hub.relution.io/en/docs/apple-tvos/policies/apple-configurator-2/

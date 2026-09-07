"""Semantic concept rules for authentication, updates, and network controls."""

from ._semantic_matching_metadata import ANDROID_ADVANCED_SECURITY
from ._mapping_models import SemanticConceptRule
from ._mapping_models import semantic_target


SEMANTIC_CONCEPT_RULES_NETWORK_AND_ENDPOINT_PROTECTION: tuple[SemanticConceptRule, ...] = (
    SemanticConceptRule(
        "malware_protection",
        "Schutz vor Schadsoftware",
        "Malware protection",
        (
            "schadsoftware",
            "schadprogramme",
            "schadcode",
            "malware",
            "antivirus",
            "virenschutz",
            "defender",
            "smartscreen",
            "play protect",
            "script scanning",
            "reputation",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_ANTIVIRUS",
                (
                    "signatureUpdateInterval",
                    "allowArchiveScanning",
                    "realTimeScanDirection",
                ),
                "Windows Antivirus policy covers Microsoft Defender-related settings.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Relution Windows CSP evidence includes Defender and SmartScreen policy nodes.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_SYSTEM_POLICY_CONTROL",
                ("allowIdentifiedDevelopers", "enableAssessment"),
                "macOS system policy controls are relevant to Gatekeeper-style protection.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_WEB_CONTENT_FILTER",
                ("filterType", "autoFilterEnabled"),
                "iOS web filtering is a candidate for reputation-based web protection.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                ANDROID_ADVANCED_SECURITY,
                ("googlePlayProtectVerifyApps",),
                "Android Enterprise can enforce Google Play Protect verification.",
            ),
        ),
        ("KONF.7.1", "KONF.7.2", "KONF.7.6", "KONF.7.9", "KONF.7.10"),
    ),
    SemanticConceptRule(
        "firewall",
        "Firewall und Paketfilter",
        "Firewall and packet filtering",
        (
            "firewall",
            "paketfilter",
            "netzkommunikation",
            "netzzugriff",
            "incoming",
            "inbound",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_FIREWALL",
                (
                    "domainProfile.enableFirewall",
                    "privateProfile.enableFirewall",
                    "publicProfile.enableFirewall",
                ),
                "Windows Firewall policy can enforce profile-level firewall settings.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                "Relution Windows CSP evidence includes Firewall MdmStore policy nodes.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_FIREWALL",
                ("enableFirewall", "blockAllIncoming", "enableStealthMode"),
                "macOS native firewall policy covers built-in firewall settings.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.security.firewall",
                ("EnableFirewall", "BlockAllIncoming", "EnableStealthMode"),
                "Apple firewall profile can enforce built-in firewall settings.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_WEB_CONTENT_FILTER",
                ("filterType", "autoFilterEnabled"),
                (
                    "iOS has no host firewall profile, but web/content filtering can be "
                    "relevant to network restriction goals."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_RECOMMENDED_GLOBAL_PROXY",
                ("proxyType", "host", "port", "pacUri"),
                (
                    "Android Enterprise has no host firewall template here; proxy policy is a "
                    "related candidate."
                ),
            ),
        ),
        ("KONF.7.15",),
    ),
    SemanticConceptRule(
        "network_connectivity",
        "VPN, WLAN, Proxy und Konnektivität",
        "VPN, Wi-Fi, proxy, and connectivity",
        (
            "vpn",
            "wlan",
            "wi-fi",
            "wifi",
            "wireless",
            "proxy",
            "apn",
            "mobilfunk",
            "schnittstelle",
            "schnittstellen",
            "bluetooth",
            "nfc",
            "tethering",
            "rdp",
            "remote desktop",
            "fernzugriff",
            "dns",
            "mdns",
            "multicast dns",
            "llmnr",
            "netbios",
            "smb",
            "nfs",
            "printer sharing",
            "internet sharing",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_VPN",
                ("alwaysOn", "serverNames", "vpnType"),
                (
                    "Windows VPN policy can enforce VPN profile properties once local values are "
                    "known."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_WIFI",
                ("ssid", "authenticationType", "encryptionType"),
                "Windows Wi-Fi policy can configure institution networks.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_NETWORK_PROXY",
                ("useProxyServer", "proxyServer", "proxyServerPort"),
                "Windows proxy policy can configure concrete proxy values.",
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_REMOTE_DESKTOP",
                ("allowToConnectRemotely",),
                "Windows Remote Desktop policy is relevant to RDP exposure decisions.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.vpn.managed",
                ("VPNType", "VPNSubType", "OnDemandEnabled"),
                "Apple VPN profile can configure managed VPN.",
            ),
            semantic_target(
                ("MACOS",),
                "apple-schema-profile",
                "profile:com.apple.wifi.managed",
                ("SSID_STR", "EncryptionType"),
                "Apple Wi-Fi profile can configure managed Wi-Fi.",
            ),
            semantic_target(
                ("MACOS",),
                "relution-native",
                "MACOS_NETWORK_PROXY",
                (
                    "proxies.httpEnable",
                    "proxies.httpsEnable",
                    "proxies.proxyAutoConfigURLString",
                ),
                "macOS proxy policy can configure concrete proxy values.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_VPN",
                ("vpnOnDemand", "vpnType", "server"),
                "iOS VPN policy can enforce managed VPN profiles.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_WIFI",
                ("ssid", "encryptionType", "autoJoin"),
                "iOS Wi-Fi policy can configure institution networks.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_GLOBAL_HTTP_PROXY",
                ("proxyType", "proxyServer", "proxyServerPort", "proxyPacUrl"),
                "iOS global HTTP proxy can configure proxy enforcement.",
            ),
            semantic_target(
                ("IOS",),
                "relution-native",
                "IOS_CELLULAR",
                ("attachAPN", "apns"),
                "iOS cellular payload can configure APN values.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY",
                (
                    "usbDataAccess",
                    "configureWifi",
                    "wifiDirectSettings",
                    "tetheringSettings",
                    "apnPolicy",
                ),
                "Android Enterprise connectivity policy covers interfaces and APN values.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_ALWAYS_ON_VPN",
                ("lockdownEnabled", "alwaysOnVpnApp.packageName"),
                "Android Enterprise can enforce always-on VPN once the VPN app is known.",
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_WIFI_MANAGEMENT",
                ("ssid", "securityType", "passphrase"),
                "Android Enterprise Wi-Fi policy can configure institution networks.",
            ),
        ),
        ("ARCH.3.4", "ARCH.4.1", "ARCH.5.1", "ASST.4.1", "KONF.3.7", "KONF.11.8"),
    ),
    SemanticConceptRule(
        "dns_resolution",
        "DNS und Namensauflösung",
        "DNS and name resolution",
        (
            "dns",
            "dns-server",
            "dns server",
            "private dns",
            "dns proxy",
            "dns settings",
            "namensaufloesung",
            "namensauflösung",
            "mdns",
            "multicast dns",
            "llmnr",
            "netbios name",
            "name resolution",
            "multicast name resolution",
        ),
        (
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_CUSTOM_CSP",
                ("installSyncML",),
                (
                    "Relution Windows CSP evidence can carry Windows DNS, LLMNR, mDNS, and "
                    "name-resolution policy nodes."
                ),
            ),
            semantic_target(
                ("WINDOWS",),
                "relution-native",
                "WINDOWS_VPN",
                ("dnsSuffixes",),
                (
                    "Windows VPN settings can scope managed DNS suffixes when the recommendation "
                    "concerns managed network profiles."
                ),
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "relution-native",
                "APPLE_DNS_SETTINGS",
                (
                    "dnsSettings.dnsProtocol",
                    "dnsSettings.serverAddresses",
                    "dnsSettings.serverName",
                    "prohibitDisablement",
                ),
                (
                    "Apple DNS Settings can configure managed encrypted or explicit DNS resolvers "
                    "once local resolver values are known."
                ),
            ),
            semantic_target(
                ("IOS", "MACOS"),
                "relution-native",
                "IOS_DNS_PROXY",
                (
                    "appBundleIdentifier",
                    "providerBundleIdentifier",
                    "providerConfiguration",
                ),
                (
                    "Apple DNS Proxy payloads can route DNS through a managed provider, but "
                    "the app identifiers are organization-specific."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_STRONG_SWAN_PROFILE",
                ("dnsServers",),
                (
                    "Android Enterprise VPN profiles can carry DNS server values for managed VPN "
                    "contexts."
                ),
            ),
            semantic_target(
                ("ANDROID_ENTERPRISE", "ANDROID"),
                "relution-native",
                "ANDROID_ENTERPRISE_DEVICE_CONNECTIVITY",
                ("configureWifi", "wifiDirectSettings"),
                (
                    "Android Enterprise connectivity settings can support DNS-related network "
                    "architecture decisions only indirectly."
                ),
            ),
        ),
        ("ARCH.3.4", "ARCH.4.1", "ARCH.5.1"),
    ),
)

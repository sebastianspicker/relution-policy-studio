"""CIS benchmark metadata and checked-in source catalog."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CIS_DIR = REPO_ROOT / "example" / "cis-references"
PDF_DIR = CIS_DIR / "downloads" / "pdf"
README_PATH = CIS_DIR / "README.md"

@dataclass(frozen=True)
class BenchmarkDetails:
    """Version and OS-family metadata extracted from a CIS benchmark."""

    os_family: str
    version: str
    document_date: str


@dataclass(frozen=True)
class BenchmarkSpec:
    """Checked-in CIS benchmark source and target-platform metadata."""

    benchmark_id: str
    file_name: str
    benchmark_title: str
    platform: str
    family_source_id: str
    management_surface: str
    details: BenchmarkDetails

    @property
    def os_family(self) -> str:
        """Operating-system family covered by the benchmark."""

        return self.details.os_family

    @property
    def version(self) -> str:
        """Version string published for the benchmark document."""

        return self.details.version

    @property
    def document_date(self) -> str:
        """Publication date recorded for the benchmark document."""

        return self.details.document_date

    @property
    def source_pdf_path(self) -> str:
        """Repository-relative path to the benchmark PDF sample."""

        return f"example/cis-references/downloads/pdf/{self.file_name}"

    @property
    def path(self) -> Path:
        """Filesystem path to the checked-in benchmark PDF sample."""

        return PDF_DIR / self.file_name


BENCHMARKS: tuple[BenchmarkSpec, ...] = (
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-17-ipados-17-intune-1-0-0",
        file_name="CIS_Apple_iOS_17_and_iPadOS_17_Intune_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 17 and iPadOS 17 Intune Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="MICROSOFT_INTUNE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2024-04-04"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-18-2-0-0",
        file_name="CIS_Apple_iOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iOS 18 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ios-26-1-0-0",
        file_name="CIS_Apple_iOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iOS 26 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-18-2-0-0",
        file_name="CIS_Apple_iPadOS_18_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 18 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-ipados-26-1-0-0",
        file_name="CIS_Apple_iPadOS_26_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple iPadOS 26 Benchmark",
        platform="IOS",
        family_source_id="cis-apple-ios-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="IOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-15-sequoia-2-0-0",
        file_name="CIS_Apple_macOS_15.0_Sequoia_Benchmark_v2.0.0.pdf",
        benchmark_title="CIS Apple macOS 15.0 Sequoia Benchmark",
        platform="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="MACOS", version="2.0.0", document_date="2026-01-12"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-apple-macos-26-tahoe-1-0-0",
        file_name="CIS_Apple_macOS_26_Tahoe_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Apple macOS 26 Tahoe Benchmark",
        platform="MACOS",
        family_source_id="cis-apple-macos-family",
        management_surface="APPLE_CONFIGURATION_PROFILE",
        details=BenchmarkDetails(
            os_family="MACOS", version="1.0.0", document_date="2026-03-06"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-google-android-1-6-0",
        file_name="CIS_Google_Android_Benchmark_v1.6.0.pdf",
        benchmark_title="CIS Google Android Benchmark",
        platform="ANDROID_ENTERPRISE",
        family_source_id="cis-google-android-family",
        management_surface="ANDROID_MANUAL",
        details=BenchmarkDetails(
            os_family="ANDROID", version="1.6.0", document_date="2025-09-30"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-defender-antivirus-1-0-0",
        file_name="CIS_Microsoft_Defender_Antivirus_Benchmark_v1.0.0.pdf",
        benchmark_title="CIS Microsoft Defender Antivirus Benchmark",
        platform="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_GROUP_POLICY",
        details=BenchmarkDetails(
            os_family="WINDOWS", version="1.0.0", document_date="2025-11-26"
        ),
    ),
    BenchmarkSpec(
        benchmark_id="cis-microsoft-windows-11-standalone-5-0-0",
        file_name="CIS_Microsoft_Windows_11_Stand-alone_Benchmark_v5.0.0.pdf",
        benchmark_title="CIS Microsoft Windows 11 Stand-alone Benchmark",
        platform="WINDOWS",
        family_source_id="cis-windows-desktop-family",
        management_surface="WINDOWS_STANDALONE",
        details=BenchmarkDetails(
            os_family="WINDOWS", version="5.0.0", document_date="2026-03-25"
        ),
    ),
)

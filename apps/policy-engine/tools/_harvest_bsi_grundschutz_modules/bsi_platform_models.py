"""Declare BSI module selections used for platform-specific baselines."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ModuleTarget:
    """BSI module metadata selected for one platform baseline."""

    module_id: str
    module_title: str
    source_id: str
    role: str
    supporting_source_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class PlatformTarget:
    """Relution policy target assembled from BSI module selections."""

    platform: str
    os_family: str
    policy_name: str
    policy_description: str
    modules: tuple[ModuleTarget, ...]

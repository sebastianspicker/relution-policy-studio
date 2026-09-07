"""Curated semantic recommendation concepts grouped by policy domain."""

from ._mapping_models import SemanticConceptRule
from .semantic_rules_administration_and_hardware import (
    SEMANTIC_CONCEPT_RULES_ADMINISTRATION_AND_HARDWARE,
)
from .semantic_rules_certificates_applications_and_privacy import (
    SEMANTIC_CONCEPT_RULES_CERTIFICATES_APPLICATIONS_AND_PRIVACY,
)
from .semantic_rules_data_governance import SEMANTIC_CONCEPT_RULES_DATA_GOVERNANCE
from .semantic_rules_device_lifecycle import SEMANTIC_CONCEPT_RULES_DEVICE_LIFECYCLE
from .semantic_rules_endpoint_hardening import SEMANTIC_CONCEPT_RULES_ENDPOINT_HARDENING
from .semantic_rules_identity_and_encryption import (
    SEMANTIC_CONCEPT_RULES_IDENTITY_AND_ENCRYPTION,
)
from .semantic_rules_management_strategy import SEMANTIC_CONCEPT_RULES_MANAGEMENT_STRATEGY
from .semantic_rules_network_and_endpoint_protection import (
    SEMANTIC_CONCEPT_RULES_NETWORK_AND_ENDPOINT_PROTECTION,
)
from .semantic_rules_privacy_and_assessment import (
    SEMANTIC_CONCEPT_RULES_PRIVACY_AND_ASSESSMENT,
)


SEMANTIC_CONCEPT_RULES: tuple[SemanticConceptRule, ...] = (
    *SEMANTIC_CONCEPT_RULES_IDENTITY_AND_ENCRYPTION,
    *SEMANTIC_CONCEPT_RULES_NETWORK_AND_ENDPOINT_PROTECTION,
    *SEMANTIC_CONCEPT_RULES_CERTIFICATES_APPLICATIONS_AND_PRIVACY,
    *SEMANTIC_CONCEPT_RULES_ENDPOINT_HARDENING,
    *SEMANTIC_CONCEPT_RULES_PRIVACY_AND_ASSESSMENT,
    *SEMANTIC_CONCEPT_RULES_DATA_GOVERNANCE,
    *SEMANTIC_CONCEPT_RULES_MANAGEMENT_STRATEGY,
    *SEMANTIC_CONCEPT_RULES_DEVICE_LIFECYCLE,
    *SEMANTIC_CONCEPT_RULES_ADMINISTRATION_AND_HARDWARE,
)

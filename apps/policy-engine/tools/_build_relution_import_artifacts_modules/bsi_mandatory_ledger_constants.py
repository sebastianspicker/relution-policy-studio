"""Constants for BSI mandatory-mapping ledger generation."""

import re

from .artifact_paths import REPO_ROOT

BSI_MANDATORY_LEDGER_PATH = (
    REPO_ROOT / "example" / "bsi-references" / "bsi-mandatory-mapping-ledger.json"
)
MANDATORY_MODAL_RE = re.compile(r"\b(MUSS|MÜSSEN|DARF|DÜRFEN)\b", re.IGNORECASE)

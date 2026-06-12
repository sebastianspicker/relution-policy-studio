"""Assemble semantic concept rule shards into the public rule tuple."""

from .mapping_types_and_constants import SemanticConceptRule
from ._semantic_concept_rules_part1 import SEMANTIC_CONCEPT_RULES_PART_1
from ._semantic_concept_rules_part2 import SEMANTIC_CONCEPT_RULES_PART_2
from ._semantic_concept_rules_part3 import SEMANTIC_CONCEPT_RULES_PART_3
from ._semantic_concept_rules_part4 import SEMANTIC_CONCEPT_RULES_PART_4
from ._semantic_concept_rules_part5 import SEMANTIC_CONCEPT_RULES_PART_5


SEMANTIC_CONCEPT_RULES: tuple[SemanticConceptRule, ...] = (
    *SEMANTIC_CONCEPT_RULES_PART_1,
    *SEMANTIC_CONCEPT_RULES_PART_2,
    *SEMANTIC_CONCEPT_RULES_PART_3,
    *SEMANTIC_CONCEPT_RULES_PART_4,
    *SEMANTIC_CONCEPT_RULES_PART_5,
)

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping

FIXED_HTTP_METHOD_FIELDS: tuple[str, ...] = (
    "get",
    "put",
    "post",
    "delete",
    "options",
    "head",
    "patch",
    "trace",
)
OAS_32_FIXED_HTTP_METHOD_FIELDS = (*FIXED_HTTP_METHOD_FIELDS, "query")
PATH_ITEM_METADATA_KEYS = {"$ref", "summary", "description", "servers", "parameters"}
HTTP_TOKEN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
SUPPORTED_OPENAPI_VERSION = re.compile(r"^3\.(0|1|2)\.\d+(?:[-+].*)?$")


@dataclass(frozen=True)
class Operation:
    """One top-level API operation from the contract."""

    surface: str
    path: str
    method: str
    path_item: Mapping[str, Any]
    operation: Mapping[str, Any]
    lineage: str | None = None
    location: str = ""

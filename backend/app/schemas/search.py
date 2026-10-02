from typing import Literal

from pydantic import BaseModel

SEARCH_LIMIT = 8


class SearchHit(BaseModel):
    kind: Literal["agent", "page"]
    key: str  # agent code or page key
    label: str | None  # agent name; pages are labelled client-side via title_key
    title_key: str | None
    sublabel: str | None  # agent: region / district
    path: str | None  # frontend route; null when the role has no page for it


class SearchResponse(BaseModel):
    q: str
    items: list[SearchHit]  # at most SEARCH_LIMIT, pages first

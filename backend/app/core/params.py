"""Bounded request numbers: ids fit a Postgres INTEGER, so an oversized id is a 422, not a 500."""

from typing import Annotated

from fastapi import Path, Query
from pydantic import Field

MAX_ID = 2_147_483_647
MAX_PAGE = 10_000

DbId = Annotated[int, Field(ge=1, le=MAX_ID)]
IdPath = Annotated[int, Path(ge=1, le=MAX_ID)]
PageQuery = Annotated[int, Query(ge=1, le=MAX_PAGE)]

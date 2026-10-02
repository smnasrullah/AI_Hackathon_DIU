"""CSV downloads, safe against spreadsheet formula injection.

Any text cell starting with = + - @ (or tab / carriage return) is prefixed with an apostrophe,
so Excel / Sheets show it as text instead of evaluating it. Numbers we format are left alone.
"""

import csv
import io
from collections.abc import Iterable, Sequence
from datetime import datetime

from fastapi import Response

Cell = str | int | float | bool | datetime | None
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
CSV_MEDIA = "text/csv; charset=utf-8"
# Documents the CSV body in OpenAPI for `responses=` on export routes.
CSV_RESPONSES: dict[int | str, dict[str, object]] = {
    200: {"content": {"text/csv": {"schema": {"type": "string"}}}, "description": "CSV file"},
}


def safe_cell(value: Cell) -> str | int | float:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, int | float):
        return value
    return "'" + value if value.startswith(FORMULA_PREFIXES) else value


def csv_response(filename: str, header: Sequence[str], rows: Iterable[Sequence[Cell]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows([safe_cell(c) for c in row] for row in rows)
    # BOM: Excel then opens Bangla text as UTF-8.
    return Response(content="﻿" + buf.getvalue(), media_type=CSV_MEDIA,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"',
                             "Cache-Control": "no-store"})

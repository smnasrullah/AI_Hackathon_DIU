"""Numbers guard: every number and clock time in LLM output must come from the evidence pack.

Both sides are normalised first: Bangla digits -> ASCII, digit-group commas dropped (lakh or
thousands grouping), times read as (hour, minute) so ৩:৪০ == 3:40 == 15:40 (12 h clock).
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

BDT = timezone(timedelta(hours=6), "Asia/Dhaka")
_BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_GROUP = re.compile(r"(?<=\d),(?=\d)")
_TOKEN = re.compile(r"(?<![\d.])(\d{1,2}):(\d{2})(?!\d)|\d+(?:\.\d+)?")
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")

Time = tuple[int, int]


def normalise(text: str) -> str:
    return _GROUP.sub("", text.translate(_BN_TO_ASCII))


def _key(x: float) -> float:
    return round(x, 2)


def tokens(text: str) -> tuple[list[float], list[Time]]:
    numbers: list[float] = []
    times: list[Time] = []
    for m in _TOKEN.finditer(normalise(text)):
        if m.group(1) is not None:
            times.append((int(m.group(1)) % 24, int(m.group(2))))
        else:
            numbers.append(float(m.group(0)))
    return numbers, times


@dataclass
class Allowed:
    numbers: set[float] = field(default_factory=set)
    times: set[Time] = field(default_factory=set)

    def add_number(self, x: float) -> None:
        x = abs(x)  # text quotes magnitudes ("BDT 1,200 less"); tokens carry no sign
        for v in (x, round(x), round(x, 1)):
            self.numbers.add(_key(v))
        if 0 <= x <= 1:  # probabilities / confidences quoted as percent
            self.numbers.update({_key(round(x * 100)), _key(round(x * 100, 1))})

    def add_time(self, h: int, m: int) -> None:
        self.times.update({(h % 24, m), (h % 12 or 12, m)})
        self.numbers.update({_key(h), _key(h % 12 or 12), _key(m)})

    def add_datetime(self, ts: datetime) -> None:
        local = ts.astimezone(BDT) if ts.tzinfo else ts
        self.add_time(local.hour, local.minute)
        for v in (local.day, local.month, local.year):
            self.numbers.add(_key(v))

    def add_text(self, text: str) -> None:
        if _ISO.match(text):
            try:
                self.add_datetime(datetime.fromisoformat(text))
                return  # its raw UTC clock time is not what the UI shows
            except ValueError:
                pass
        numbers, times = tokens(text)
        for x in numbers:
            self.add_number(x)
        for h, m in times:
            self.add_time(h, m)

    def add(self, value: Any) -> None:
        """Walk a JSON-like value (the evidence pack)."""
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, int | float):
            self.add_number(float(value))
        elif isinstance(value, str):
            self.add_text(value)
        elif isinstance(value, dict):
            for v in value.values():
                self.add(v)
        elif isinstance(value, list | tuple):
            for v in value:
                self.add(v)


def allowed_from(pack: dict[str, Any], drafts: Iterable[str] = ()) -> Allowed:
    """Numbers of the pack plus the deterministic template draft built from that same pack."""
    allowed = Allowed()
    allowed.add(pack)
    for d in drafts:
        allowed.add_text(d)
    return allowed


def unknown(text: str, allowed: Allowed) -> list[str]:
    """Numbers / times in `text` that the evidence does not contain (empty = guard passes)."""
    numbers, times = tokens(text)
    bad = [f"{x:g}" for x in numbers if _key(x) not in allowed.numbers]
    bad += [f"{h}:{m:02d}" for h, m in times if (h, m) not in allowed.times]
    return bad

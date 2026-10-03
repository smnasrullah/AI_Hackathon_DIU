"""A deadline as people say it, in Asia/Dhaka time and the reader's language.

"today at 7:45 PM", "tomorrow at 9:05 AM", "Sat 10 Oct at 1:00 PM" / "আজ সন্ধ্যা 7:45",
"আগামীকাল সকাল 9:05", "10 অক্টোবর দুপুর 1:00". Digits stay Latin: the app shows them in the
reader's digit setting (Bangla or Latin), like every other notification number.
"""

from datetime import datetime, timedelta, timezone

from app.core.clock import as_utc
from app.models.enums import Lang

DHAKA = timezone(timedelta(hours=6), "Asia/Dhaka")  # no daylight saving
BN_MONTHS = ("জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট",
             "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর")
EN_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
EN_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# Bangla names the part of the day instead of AM / PM: (first hour, word).
BN_PARTS = ((0, "রাত"), (4, "ভোর"), (6, "সকাল"), (12, "দুপুর"), (15, "বিকেল"), (18, "সন্ধ্যা"),
            (20, "রাত"))


def _bn_part(hour: int) -> str:
    return [word for start, word in BN_PARTS if hour >= start][-1]


ASAP = {Lang.en: "as soon as possible", Lang.bn: "যত তাড়াতাড়ি সম্ভব"}


def deadline_text(ts: datetime, now: datetime, lang: Lang, asap: bool = False) -> str:
    """asap: the deadline would be later than the forecast stock-out, so no time is shown."""
    if asap:
        return ASAP[lang]
    local, today = as_utc(ts).astimezone(DHAKA), as_utc(now).astimezone(DHAKA).date()
    days = (local.date() - today).days
    h12 = local.hour % 12 or 12
    clock = f"{h12}:{local.minute:02d}"
    if lang is Lang.bn:
        day = {0: "আজ", 1: "আগামীকাল"}.get(days, f"{local.day} {BN_MONTHS[local.month - 1]}")
        return f"{day} {_bn_part(local.hour)} {clock}"
    day = {0: "today", 1: "tomorrow"}.get(
        days, f"{EN_DAYS[local.weekday()]} {local.day} {EN_MONTHS[local.month - 1]}")
    return f"{day} at {clock} {'AM' if local.hour < 12 else 'PM'}"

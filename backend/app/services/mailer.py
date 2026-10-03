"""Outgoing mail behind a small interface. Only a development implementation exists today:
it writes the message to the server log. Add an SMTP class here and select it in get_mailer."""

import logging
from typing import Protocol

from app.core.config import Settings

log = logging.getLogger("app.mailer")


class Mailer(Protocol):
    def send_password_reset(self, to: str, link: str, ttl_min: int) -> None: ...


class DevLogMailer:
    """DEVELOPMENT ONLY. Sends nothing; the reset link goes to the backend log."""

    def send_password_reset(self, to: str, link: str, ttl_min: int) -> None:
        log.warning("[DEV ONLY MAILER - no email sent] Password reset link for %s "
                    "(valid %d min, single use): %s", to, ttl_min, link)


def get_mailer(settings: Settings) -> Mailer:
    # settings.mailer has a single value today ("dev_log"); SMTP slots in here later.
    return DevLogMailer()

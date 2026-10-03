"""Background loop for the help trigger: one tick every interval (HELP_TRIGGER_INTERVAL_S).

Every tick is idempotent (dedupe, compare-and-set wave moves), so several workers may run it.
Interval 0 turns the loop off. main.py starts it outside tests.
"""

import logging
import threading

from app.services import help_trigger_run

log = logging.getLogger(__name__)
_stop = threading.Event()
_thread: threading.Thread | None = None


def _loop(interval_s: int) -> None:
    while not _stop.is_set():
        try:
            counts = help_trigger_run.tick()
            if any(counts.values()):
                log.info("help trigger tick: %s", counts)
        except Exception:  # noqa: BLE001 - one bad tick must not stop the loop
            log.exception("help trigger tick failed")
        _stop.wait(interval_s)


def start(interval_s: int) -> None:
    global _thread
    if interval_s <= 0 or _thread is not None:
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(interval_s,), name="help-trigger",
                               daemon=True)
    _thread.start()


def stop() -> None:
    global _thread
    _stop.set()
    _thread = None

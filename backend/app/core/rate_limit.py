"""In-process sliding-window rate limiter (single uvicorn process; durable caps live in the DB)."""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Hashable

from starlette.requests import HTTPConnection

WINDOW_S = 60.0
MAX_KEYS = 10_000


class RateLimiter:
    def __init__(self, window_s: float = WINDOW_S) -> None:
        self._window_s = window_s
        self._hits: dict[Hashable, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: Hashable, per_window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self._window_s:
                hits.popleft()
            if len(hits) >= per_window:
                return False
            hits.append(now)
            if len(self._hits) > MAX_KEYS:
                self._prune(now)
            return True

    def _prune(self, now: float) -> None:
        """Drops keys with no hit inside the window, so per-client keys cannot grow unbounded."""
        stale = [k for k, h in self._hits.items() if not h or now - h[-1] >= self._window_s]
        for k in stale:
            del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(conn: HTTPConnection) -> str:
    # nginx overwrites X-Real-IP with the peer address, so a client cannot choose it.
    forwarded = conn.headers.get("x-real-ip", "").strip()
    if forwarded:
        return forwarded[:64]
    return conn.client.host if conn.client else "unknown"


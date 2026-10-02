"""In-process sliding-window rate limiter (single uvicorn process; durable caps live in the DB)."""

import threading
import time
from collections import defaultdict, deque
from collections.abc import Hashable

WINDOW_S = 60.0


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
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

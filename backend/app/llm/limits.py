"""Per-user sliding-window rate limit on live LLM calls (in process; the daily cap is in the DB)."""

import threading
import time
import uuid
from collections import defaultdict, deque

WINDOW_S = 60.0


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[uuid.UUID, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, user_id: uuid.UUID, per_minute: int) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[user_id]
            while hits and now - hits[0] >= WINDOW_S:
                hits.popleft()
            if len(hits) >= per_minute:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


user_limiter = RateLimiter()

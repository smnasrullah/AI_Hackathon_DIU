"""Per-user sliding-window rate limit on live LLM calls (in process; the daily cap is in the DB)."""

from app.core.rate_limit import RateLimiter

user_limiter = RateLimiter()

"""Settings refuse to start with a short JWT secret outside APP_ENV=test."""

import pytest

from app.core.config import Settings

STRONG = "a" * 64


@pytest.mark.parametrize("secret", ["", "change-me-in-real-deployments", "x" * 31])
def test_short_jwt_secret_refused(monkeypatch: pytest.MonkeyPatch, secret: str) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", secret)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings()


def test_strong_jwt_secret_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", STRONG)
    assert Settings().jwt_secret.get_secret_value() == STRONG


def test_test_env_skips_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("JWT_SECRET", "short")
    assert Settings().app_env == "test"

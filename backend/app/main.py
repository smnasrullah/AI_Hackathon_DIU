from fastapi import FastAPI

from app.api.v1 import api_router
from app.api.v1.auth import demo_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.include_router(api_router)
    if settings.demo_mode:  # POST /api/v1/auth/demo-login exists only in demo mode
        app.include_router(demo_router, prefix="/api/v1")
    return app


app = create_app()

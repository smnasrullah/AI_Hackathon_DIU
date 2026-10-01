from fastapi import APIRouter

from app.core.config import get_settings
from app.core.db import get_engine
from app.schemas.system import HealthResponse, SystemStatus
from app.services.system_status import build_status

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
@router.get("/system/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/system/status", response_model=SystemStatus)
def system_status() -> SystemStatus:
    return build_status(get_settings(), get_engine())

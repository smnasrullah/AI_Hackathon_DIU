"""Admin console operations: synthetic data, model registry + drift, background jobs, LLM log.
Admin role only."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.core.deps import SessionDep, require_roles
from app.core.params import IdPath, PageQuery
from app.models import User
from app.models.enums import GeneratedBy, GuardResult, LlmIntent, UserRole
from app.schemas.admin_ops import (
    AssumptionsDoc,
    DataSummary,
    DriftReport,
    LlmLogPage,
    LlmUsage,
    ModelRegistry,
)
from app.schemas.jobs import JobIn, JobList, JobOut
from app.services import admin_data, admin_llm, admin_overview, drift, jobs
from app.services.admin_llm import LlmLogFilter
from app.services.jobs import JobError

router = APIRouter(prefix="/admin", tags=["admin"])

Admin = Annotated[User, Depends(require_roles(UserRole.admin))]


@router.get("/data", response_model=DataSummary)
def get_data(_user: Admin, session: SessionDep) -> DataSummary:
    """Seed, data version, period (holdout, SIM_NOW) and row counts of the synthetic dataset."""
    return admin_data.summary(session, get_settings())


@router.get("/data/assumptions", response_model=AssumptionsDoc)
def get_assumptions(_user: Admin) -> AssumptionsDoc:
    """docs/SYNTHETIC_ASSUMPTIONS.md as Markdown text."""
    doc = admin_data.assumptions()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="assumptions_missing")
    return doc


@router.get("/models", response_model=ModelRegistry)
def get_models(_user: Admin, session: SessionDep) -> ModelRegistry:
    """Every registered model version (active first) with its stored holdout metrics."""
    return admin_overview.registry(session)


@router.get("/drift", response_model=DriftReport)
def get_drift(_user: Admin, session: SessionDep) -> DriftReport:
    """Forecast-error drift: cached forecast vs logged demand, against the holdout MAE."""
    return drift.report(session)


# --- background jobs --------------------------------------------------------------------------

@router.get("/jobs", response_model=JobList)
def list_jobs(_user: Admin, session: SessionDep) -> JobList:
    """The 20 most recent jobs and the one running, if any."""
    result = jobs.recent(session)
    session.commit()  # stale jobs are marked interrupted on read
    return result


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: IdPath, _user: Admin, session: SessionDep) -> JobOut:
    try:
        job = jobs.get(session, job_id)
    except JobError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=exc.code) from exc
    session.commit()
    return jobs.to_out(session, job)


@router.post("/jobs", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def start_job(body: JobIn, user: Admin, session: SessionDep,
              background: BackgroundTasks) -> JobOut:
    """Start generate_data, retrain_forecast, retrain_anomaly or help_trigger (one tick of the
    liquidity help trigger, same as the background loop) in the background; poll
    GET /admin/jobs/{id} for progress. One job at a time (409 job_running). Retrained models are
    recorded inactive; serving keeps the committed model."""
    try:
        job = jobs.start(session, user, body.kind)
    except JobError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=exc.code) from exc
    session.commit()
    out = jobs.to_out(session, job)
    background.add_task(jobs.run, job.id, body.kind)
    return out


# --- LLM --------------------------------------------------------------------------------------

@router.get("/llm/logs", response_model=LlmLogPage)
def llm_logs(
    _user: Admin,
    session: SessionDep,
    intent: LlmIntent | None = None,
    generated_by: GeneratedBy | None = None,
    guard_result: GuardResult | None = None,
    cache_hit: bool | None = None,
    page: PageQuery = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> LlmLogPage:
    """llm_call_log newest first: tokens, latency, generated_by, cache hit, guard result."""
    f = LlmLogFilter(intent=intent, generated_by=generated_by, guard_result=guard_result,
                     cache_hit=cache_hit)
    return admin_llm.log_page(session, f, page, page_size)


@router.get("/llm/usage", response_model=LlmUsage)
def llm_usage(_user: Admin, session: SessionDep,
              days: Annotated[int, Query(ge=1, le=30)] = 7) -> LlmUsage:
    """Calls per UTC day by outcome, tokens, latency, cache hit rate and today's cap usage."""
    return admin_llm.usage(session, get_settings(), days)

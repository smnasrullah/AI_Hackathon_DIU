from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import ScopedAgent, SessionDep, require_roles, scoped_agents_query
from app.models import User
from app.models.enums import UserRole
from app.schemas.agent import AgentProfile

router = APIRouter(prefix="/agents", tags=["agents"])

ListViewer = Annotated[User, Depends(require_roles(UserRole.distributor, UserRole.admin))]


@router.get("", response_model=list[AgentProfile])
def list_agents(user: ListViewer, session: SessionDep) -> list[AgentProfile]:
    rows = session.scalars(scoped_agents_query(user)).all()
    return [AgentProfile.model_validate(a) for a in rows]


@router.get("/{agent_id}", response_model=AgentProfile)
def get_agent(agent: ScopedAgent) -> AgentProfile:
    return AgentProfile.model_validate(agent)

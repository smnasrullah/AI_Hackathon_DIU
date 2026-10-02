"""Global search (command palette): the caller's agents + the pages the caller's role can open."""

from dataclasses import dataclass

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import scoped_agents_query
from app.models import Agent, User
from app.models.enums import UserRole
from app.schemas.search import SEARCH_LIMIT, SearchHit, SearchResponse

MAX_PAGES = 3


@dataclass(frozen=True)
class Page:
    key: str
    path: str
    keywords: tuple[str, ...]  # lower-case English + Bangla terms matched by substring


SHARED = (
    Page("settings", "/settings", ("settings", "preferences", "theme", "language", "সেটিংস")),
    Page("profile", "/profile", ("profile", "account", "avatar", "প্রোফাইল")),
    Page("notifications", "/notifications", ("notifications", "alerts", "নোটিফিকেশন")),
    Page("help", "/help", ("help", "faq", "shortcuts", "সাহায্য")),
    Page("responsible_ai", "/responsible-ai", ("responsible ai", "model card", "fairness")),
)
PAGES: dict[UserRole, tuple[Page, ...]] = {
    UserRole.agent: (
        Page("agent_home", "/agent", ("home", "balance", "stockout", "হোম")),
        Page("agent_forecast", "/agent/forecast", ("forecast", "what-if", "পূর্বাভাস")),
        Page("agent_swap", "/agent/swap", ("swap", "সোয়াপ")),
        Page("agent_copilot", "/agent/copilot", ("copilot", "ask", "chat", "কোপাইলট")),
    ),
    UserRole.distributor: (
        Page("distributor_home", "/distributor", ("control room", "map", "dashboard", "ম্যাপ")),
        Page("distributor_swaps", "/distributor/swaps", ("swaps", "approve", "সোয়াপ")),
        Page("distributor_anomalies", "/distributor/anomalies", ("anomalies", "risk detection")),
        Page("distributor_impact", "/distributor/impact", ("impact", "baseline", "savings")),
        Page("distributor_briefing", "/distributor/briefing", ("briefing", "summary")),
    ),
    UserRole.admin: (
        Page("admin_home", "/admin", ("admin", "overview")),
        Page("admin_users", "/admin/users", ("users", "accounts")),
        Page("admin_models", "/admin/models", ("models", "versions", "metrics")),
        Page("admin_llm", "/admin/llm", ("llm", "language model", "calls")),
        Page("admin_audit", "/admin/audit", ("audit", "log", "decisions")),
    ),
}


def _agent_path(user: User, agent: Agent) -> str | None:
    if user.role == UserRole.agent:
        return "/agent"
    if user.role == UserRole.distributor:
        return f"/distributor/agents/{agent.id}"
    return None


def _pages(user: User, term: str) -> list[SearchHit]:
    needle = term.casefold()
    found = [p for p in PAGES[user.role] + SHARED
             if needle in p.key.replace("_", " ") or any(needle in k for k in p.keywords)]
    return [SearchHit(kind="page", key=p.key, label=None, title_key=f"search.page.{p.key}",
                      sublabel=None, path=p.path) for p in found[:MAX_PAGES]]


def search(session: Session, user: User, q: str) -> SearchResponse:
    term = q.strip()
    if not term:
        return SearchResponse(q=term, items=[])
    hits = _pages(user, term)
    query = scoped_agents_query(user).where(or_(*(col.icontains(term, autoescape=True) for col in (
        Agent.code, Agent.name, Agent.region, Agent.district, Agent.upazila))))
    for a in session.scalars(query.limit(SEARCH_LIMIT - len(hits))):
        hits.append(SearchHit(kind="agent", key=a.code, label=a.name, title_key=None,
                              sublabel=f"{a.region} / {a.district}", path=_agent_path(user, a)))
    return SearchResponse(q=term, items=hits)

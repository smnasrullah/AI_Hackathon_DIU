// TanStack Query keys. One place, so invalidation after a mutation can target a whole domain.
import type {
  AnomalyListQuery,
  EventListQuery,
  ExplanationQuery,
  FloatType,
  ForecastQuery,
  Lang,
  ImpactQuery,
  NotificationListQuery,
  RiskListQuery,
  SwapListQuery,
} from "./types";

export const qk = {
  agent: {
    all: ["agent"] as const,
    summary: (id: number) => ["agent", id, "summary"] as const,
    forecast: (id: number, q: ForecastQuery = {}) => ["agent", id, "forecast", q] as const,
    stockout: (id: number) => ["agent", id, "stockout"] as const,
    risk: (id: number) => ["agent", id, "risk"] as const,
    explanations: (id: number, q: ExplanationQuery = {}) => ["agent", id, "explanations", q] as const,
    recommendation: (id: number) => ["agent", id, "recommendation"] as const,
    runway: (id: number, float: FloatType) => ["agent", id, "runway", float] as const,
    narration: (id: number, float: FloatType, lang: Lang) => ["agent", id, "narration", float, lang] as const,
  },
  events: (q: EventListQuery = {}) => ["events", q] as const,
  riskList: (q: RiskListQuery = {}) => ["risk-list", q] as const,
  swaps: { all: ["swaps"] as const, list: (q: SwapListQuery = {}) => ["swaps", q] as const },
  anomalies: {
    all: ["anomalies"] as const,
    list: (q: AnomalyListQuery = {}) => ["anomalies", "list", q] as const,
    detail: (id: number) => ["anomalies", id] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (q: NotificationListQuery = {}) => ["notifications", q] as const,
  },
  system: { freshness: ["system", "freshness"] as const, llm: ["llm", "status"] as const },
  modelCard: (lang: string) => ["responsible-ai", "model-card", lang] as const,
  search: (q: string) => ["search", q] as const,
  profile: ["users", "me", "profile"] as const,
  impact: (q: ImpactQuery = {}) => ["impact", "summary", q] as const,
};

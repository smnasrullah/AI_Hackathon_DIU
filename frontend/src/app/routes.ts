// Sitemap from docs/ARCHITECTURE.md §1. Paths are relative to the role base.

export interface PageDef {
  path: string;
  title: string;
  summary: string;
  features: string;
}

export const agentPages: PageDef[] = [
  { path: "", title: "Home", summary: "Cash and e-money runway, countdown, reasons and the next action.", features: "F1–F4, F7" },
  { path: "forecast", title: "72h forecast", summary: "Runway strip with event ribbons and the what-if slider.", features: "F1, F2, F6, F8" },
  { path: "stockout", title: "Stockout time", summary: "When each float could run out, with confidence and 6/24/72h risk.", features: "F2, F3" },
  { path: "swap", title: "Swap offers", summary: "Nearby agent swap offers and recommendation status. Your distributor approves.", features: "F4, F5" },
  { path: "copilot", title: "Ask", summary: "Bangla/English chat and voice, grounded in your own data.", features: "LLM" },
  { path: "settings", title: "Settings", summary: "Language, digits and theme.", features: "—" },
];

export const distributorPages: PageDef[] = [
  { path: "", title: "Control room", summary: "Map of agents by risk, swap droplets and the inspector.", features: "F3, F10" },
  { path: "agents/:id", title: "Agent detail", summary: "Forecast, risk, reasons and recommendation for one agent.", features: "F1–F4, F7" },
  { path: "swaps", title: "Swap queue", summary: "Approve or reject proposed swaps with a note.", features: "F5" },
  { path: "anomalies", title: "Anomalies", summary: "Isolation Forest flags for human review.", features: "F9" },
  { path: "anomalies/:id", title: "Investigation", summary: "Evidence, AI-written narrative and your review.", features: "F9, LLM" },
  { path: "impact", title: "Impact", summary: "Model versus fixed-threshold baseline: stockout hours, BDT saved, van trips.", features: "F11" },
  { path: "briefing", title: "Daily briefing", summary: "Briefing written from today's evidence pack.", features: "LLM" },
];

export const adminPages: PageDef[] = [
  { path: "", title: "System status", summary: "Database, migrations, data version, models and LLM mode.", features: "—" },
  { path: "users", title: "Users", summary: "Users and roles.", features: "—" },
  { path: "models", title: "Models", summary: "Model registry, holdout metrics and drift.", features: "—" },
  { path: "llm", title: "LLM log", summary: "Provider, tokens, latency and guard result per call.", features: "LLM" },
  { path: "audit", title: "Audit log", summary: "Every human decision with user and note.", features: "—" },
];

export const responsibleAiPage: PageDef = {
  path: "/responsible-ai",
  title: "Responsible AI",
  summary: "Model cards, fairness by group, limitations and the synthetic data notice.",
  features: "F12",
};

export const settingsPage: PageDef = {
  path: "/settings",
  title: "Settings",
  summary: "Account settings and password change.",
  features: "—",
};

export const loginPage: PageDef = {
  path: "/login",
  title: "Sign in",
  summary: "Sign in with a demo account: agent, distributor or admin.",
  features: "—",
};

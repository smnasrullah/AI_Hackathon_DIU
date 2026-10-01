# Idea Development Framework (hackathon guideline §10)

Problem statement: For MFS agents and their distributors, unplanned cash or e-money stockouts cause turned-away transactions and costly emergency van trips. We will build AgentPulse AI that uses hourly transaction history, calendar events and weather to forecast dual-float demand and recommend rebalancing or nearby agent-to-agent swaps with human approval, with success measured by stockout hours reduced, transaction value saved and van trips avoided versus a fixed-threshold alert baseline.

| Step | Answer |
|---|---|
| 1 User | MFS agent (primary); distributor / field-ops officer (secondary) |
| 2 Problem | Agent runs out of cash or e-money, customer is turned away. Today: reactive, fixed-threshold alerts, van trips |
| 3 Why now | Digital transaction logs exist; quantile ML is cheap on CPU; LLMs make Bangla guidance and voice accessible |
| 4 Solution | Agent app (forecast, countdown, what-if, copilot) + distributor map dashboard (risk, swaps, anomalies, impact) |
| 5 AI role | LightGBM quantile forecast; scipy optimisation for swaps; Isolation Forest for agent risk; SHAP for reasons; LLM + RAG for Bangla/English explanations, copilot and briefings (language only) |
| 6 Impact | Stockout hours, transaction value saved (BDT), van trips avoided, vs baseline. Targets set after P11 backtest |
| 7 Data | Fully synthetic, fixed seed, documented patterns (docs/SYNTHETIC_ASSUMPTIONS.md); last 14 days held out |
| 8 Validation | Pinball loss + MAE vs same-hour-last-week; stockout recall; anomaly precision/recall; fairness by group; walkthrough demo |
| 9 Scale | Same API contract can ingest upay data via adapter; shadow mode; governed anonymised data; retrain + drift monitoring; human approval retained |

Guideline "good project test": What happened? (stockout predicted for 3:40 PM) Why risky? (salary day, 2.3x cash-out) What should upay do next? (swap with nearby agent, distributor approves).

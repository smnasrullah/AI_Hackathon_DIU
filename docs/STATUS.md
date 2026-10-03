# STATUS — AgentPulse AI (2026-10-03)

প্রমাণভিত্তিক, রিড-অনলি অডিট। যাচাই করা যায়নি এমন কিছুকে "unverified" লেখা হয়েছে। প্রমাণ: `git log`, `/openapi.json` (চলমান ব্যাকএন্ড থেকে), `pytest --collect-only`, grep, `scripts/check.ps1` (ডিফল্ট fast tier)।

## ১. কাজের অবস্থা (প্রম্পট অনুসারে)

| প্রম্পট | অবস্থা | প্রমাণ |
|---|---|---|
| Initial/New/Promt2-5 | done | `058a51b`..`9632595`: কোর স্ক্যাফোল্ড, rules/ML/LLM কাঠামো তৈরি |
| Po7-Po18 | done | `7a8717f`..`d56aff4`: ফিচার পেজ, API, টেস্ট ক্রমান্বয়ে যোগ |
| P19 (agent actions, copilot UI) | done | `00fb2fe`: copilot/requests/swaps hooks + UI |
| copilot suggestion chips | done | `d8728cc`: `CopilotPage`, suggestions API |
| demo-login hardening (২ কমিট) | done | `241cff2`,`df24570`: rate limit, lockout, `demo-login` রুট, audit nullable user |
| fast checks/flaky tests/housekeeping | done | `9f80444`: session-scoped DB templates, `slow` marker, check.ps1 ফ্ল্যাগ, bootstrap fixtures |
| recommendation channels/requests | done | `recommendation_requests.py`, `test_recommendation_requests_api.py` (৪টি টেস্ট) বিদ্যমান ও পাস |
| P21 | done | `379baec`: control-room e2e, map/briefing hooks, bangladesh.geojson |
| Admin ops (jobs/drift/data/models/llm usage) | done, **uncommitted** | working tree-তে নতুন ফাইল (admin_ops.py, drift.py, jobs.py ইত্যাদি), লাইভ `/openapi.json`-এ সব ৯টি রুট active, টেস্ট পাস (২২টি: admin_api ১৩ + admin_ops_api ৯) |
| Hardening/prompt-injection/route-security/query-count টেস্ট | done, **uncommitted** | `test_hardening.py`(১৭), `test_prompt_injection.py`(৩৪), `test_route_security.py`(৭১), `test_query_counts.py`(৯) — সব collect হয়, ডিফল্ট fast tier-এ পাস |
| DEMO_SCRIPT / JUDGING_MAP / PATH_TO_PRODUCTION / RESPONSIBLE_AI_CHECKLIST ডকুমেন্ট | done, **uncommitted** | `docs/` এ ফাইল আছে কিন্তু `git status`-এ untracked |

## ২. ১২টি ফিচার + LLM লেয়ার

| # | ফিচার | ব্যাকএন্ড এন্ডপয়েন্ট | ফ্রন্টএন্ড পেজ | টেস্ট | অবস্থা |
|---|---|---|---|---|---|
| F1 | Dual-float forecast | `GET /agents/{id}/forecast` | `agent/forecast` | `test_forecast.py`(৯) | done |
| F2 | Time-to-stockout+confidence | `GET /agents/{id}/stockout` | `agent/stockout` | `test_stockout_projection.py`(৮) | done |
| F3 | Risk 6/24/72h | `GET /agents/{id}/risk`, `/agents/risk` | distributor control room, agents list | `test_risk_api.py`(৯), `test_risk_rules.py`(১৫) | done |
| F4 | Rebalance recommendation | `GET /agents/{id}/recommendation`, request/decision রুট | `agent/rebalance` | `test_recommendation_api.py`(৫), `test_rebalance_rules.py`(৬) | done |
| F5 | Agent swap matching | `GET /swaps`, decision/respond | `agent/swap`, distributor swaps queue | `test_swap_rules.py`(৫), `test_swaps_api.py`(৭) | done |
| F6 | Event-aware | `GET/POST/PUT/DELETE /events` | `admin/events` | `test_events_api.py`(৪), `test_channel_rules.py`(৯) | done |
| F7 | "Why?" explanation | `GET /agents/{id}/explanations`, `POST /explanations/narrate` | `agent/explain` | `test_explanations.py`(৭), `test_explain_templates.py`(৪৬) | done |
| F8 | What-if slider | `POST /agents/{id}/whatif` | `agent/what-if` | `test_whatif_api.py`(৭), `test_whatif_projection.py`(১১) | done |
| F9 | Agent risk/anomaly | `GET /anomalies`, review, narrative | distributor anomalies | isolation forest কোড আছে (`backend/ml/training/anomaly.py`) | done |
| F10 | Distributor map | `GET /map/agents` | distributor control room (RiskMap) | `test_map_api.py`(৫) | done |
| F11 | Impact calculator | `GET /impact/summary`, `/impact/comparison` | `distributor/impact` | `test_impact_api.py`(৮), `test_impact_rules.py`(১৪), `test_impact_sim.py`(৭) | done |
| F12 | Responsible AI panel | `GET /responsible-ai/fairness`, `/model-card` | `/responsible-ai` | `test_explanations.py` আংশিক কভার | done |
| LLM | Copilot/briefing/narrative/explain wording | `/copilot/chat`, `/copilot/suggestions`, `/agents/{id}/briefing`, `/distributor/briefing`, `/anomalies/{id}/narrative` | `agent/copilot`, `distributor/briefing` | `test_copilot_api.py`(১৪), `test_copilot_routing.py`(৪৯), `test_llm_api.py`(১৫), `test_llm_guard.py`(৬) | done |

RAG/Playbook reindex (`POST /admin/knowledge/reindex`, ARCHITECTURE.md §2-এ documented) **লাইভ openapi.json-এ নেই** — unverified/সম্ভবত অপ্রয়োগিত।

## ৩. পুরনো ব্লকার: সমাধান বনাম খোলা

| ব্লকার | উৎস | অবস্থা |
|---|---|---|
| Drift metric `/admin/models`-এ (METHODS.md open question ১১) | docs/PATH_TO_PRODUCTION.md:৬৫ "placeholder" বলে উল্লেখ | **সমাধান হয়েছে** (uncommitted): `backend/app/services/drift.py`-তে বাস্তব হিসাব (`_float_report`, `report`), `GET /admin/drift` লাইভ |
| LLM লাইভ ব্যর্থ হলে fallback ক্রম (open question ১৩) | METHODS.md:১৮৮ | **কোডে সমাধান** (`service.py:192-200`: live→replay→template), কিন্তু METHODS.md এখনও "open" হিসেবে লেখা — ডকুমেন্টেশন lag |
| Replay demo ফাইল রেকর্ড করা (LLM_SPEC অনুযায়ী) | — | **এখনও খোলা**: `backend/app/llm/cache/demo_replay.json` ফাইলটি ডিস্কে নেই, তাই replay mode resolve হয় না, auto mode `template`-এ পড়ে |
| Scale/retrain/observability (PATH_TO_PRODUCTION Stage 3) | — | এখনও খোলা, ইচ্ছাকৃতভাবে post-hackathon স্কোপ হিসেবে ডকুমেন্টেড |

## ৪. বাগ ও ঝুঁকি

| # | বিষয় | severity | প্রমাণ |
|---|---|---|---|
| ১ | ১৩টি নতুন ব্যাকএন্ড ফাইল, ৬টি নতুন টেস্ট ফাইল, ৪টি নতুন ডক এবং ২টি নতুন migration **কমিট করা হয়নি** (untracked) | high | `git status`: `backend/app/api/v1/admin_ops.py`, `backend/migrations/versions/0013_admin_jobs.py`, `0014_hardening_indexes.py` ইত্যাদি untracked; জমা দেওয়ার আগে কমিট না করলে judge-দের ক্লোনে এই কাজ থাকবে না |
| ২ | Replay demo ফাইল নেই → ইন্টারনেট/key ছাড়া judge মেশিনে LLM mode সবসময় `template`, কখনো `replay` পরীক্ষা হয়নি | medium | `backend/app/llm/cache/` dir-ই নেই; `mode.py:13` শুধুমাত্র `is_file()` চেক করে |
| ৩ | ARCHITECTURE.md ডকুমেন্টেড কিন্তু লাইভে অনুপস্থিত: `GET /distributor/overview`, `GET /copilot/history`, `GET /admin/audit`, `POST /admin/knowledge/reindex` | medium | লাইভ ৬৭-এন্ডপয়েন্ট তালিকার সাথে ARCHITECTURE.md §2 তুলনা — এই ৪টি নেই (সম্ভবত রুট rename: `/admin/audit`→`/admin/audit-log`, `/distributor/overview`→`/distributor/briefing`) |
| ৪ | লাইভে আছে কিন্তু ARCHITECTURE.md-এ ডকুমেন্টেড নয়: `/admin/data*`, `/admin/drift`, `/admin/jobs*`, `/admin/llm/usage`, `/admin/org`, `/admin/overview`, `PATCH /admin/users/{id}`, `/agents/risk/export.csv`, `/swaps/export.csv`, `/audit-log/export.csv`, `/notifications*`, `/search`, `/system/freshness`, `/users/me/*`, `/health` | low | একই তুলনা; ফিচার কাজ করছে, শুধু ডক আপডেট বাকি |
| ৫ | Secret-shaped string বা ট্র্যাকড `.env` — tracked ফাইল ও সম্পূর্ণ git history-তে পাওয়া যায়নি | — (কোনো ঝুঁকি নয়, নিশ্চিত করা হলো) | `git grep` + সব কমিট জুড়ে প্যাটার্ন স্ক্যান: 0 hit; `.gitignore:2` → `.env` ignored |
| ৬ | pytest slow marker-এ মাত্র ১৭টি টেস্ট (ML gate, data-gen patterns সহ); বাকি ৫৫৯টি ফাস্ট | low, info | `pytest --collect-only -m slow` সমষ্টি ১৭, `-m "not slow"` সমষ্টি ৫৫৯ |
| ৭ | TODO/FIXME/NotImplemented কোনো সোর্স ফাইলে নেই | — (ভালো লক্ষণ) | grep ফলাফল শূন্য |
| ৮ | Demo-login lockout ও rate limit কোডে আছে (৫ ফেইল/১৫ মিনিট), কিন্তু প্রকৃত multi-worker deployment-এ in-process rate limiter (`rate_limit.py:1` কমেন্ট) কার্যকর থাকবে না | low | `rate_limit.py` ডকস্ট্রিং নিজেই বলছে "single uvicorn process" |

## ৫. ডক বনাম বাস্তবায়ন অসঙ্গতি (সারসংক্ষেপ, বিস্তারিত ৩ ও ৪ নং-এ)

- ডকে আছে, লাইভে নেই: `/distributor/overview`, `/copilot/history`, `/admin/audit`, `/admin/knowledge/reindex`।
- লাইভে আছে, ডকে নেই: admin ops গ্রুপ (data/drift/jobs/llm-usage/org/overview), export.csv রুটসমূহ, `/notifications*`, `/search`, `/system/freshness`, `/users/me/*`, `/health`।
- e2e/routes.ts নতুন admin ops-সম্পর্কিত কোনো আলাদা পেজ-রুট প্রত্যাশা করে না (jobs/drift শেয়ার্ড কম্পোনেন্ট হিসেবে models পেজে এমবেডেড, unverified যে এটি ইচ্ছাকৃত)।

## ৬. জমা দেওয়ার আগে নিজে যা করতে হবে

- [ ] সব untracked ফাইল রিভিউ করে কমিট করা (admin ops, নতুন টেস্ট, নতুন ডক) — নইলে judge ক্লোনে এই কাজ অনুপস্থিত থাকবে
- [ ] `scripts\check.ps1 -Full` (e2e সহ) একবার সম্পূর্ণ চালানো — এই অডিটে শুধু ডিফল্ট fast tier চালানো হয়েছে
- [ ] ক্লিন ক্লোনে `run.bat --reset` দিয়ে judge-এর পরিবেশ পুনরুৎপাদন করে পরীক্ষা
- [ ] থাকলে, যেকোনো ব্যক্তিগত/টেস্ট LLM API key রোটেট করা (এই অডিটে কোনো key value দেখা/প্রিন্ট করা হয়নি)
- [ ] GitHub-এ পুশ করে PR/রিপো লিঙ্ক চূড়ান্ত করা
- [ ] হ্যাকাথনের সাবমিশন ফরম্যাট (ফাইল/লিঙ্ক/ডেডলাইন) যাচাই করা — this repo-তে unverified
- [ ] পিচ ডেক তৈরি/আপডেট — unverified, এই রিপোতে পাওয়া যায়নি
- [ ] `backend/app/llm/cache/demo_replay.json` রেকর্ড করা (চাইলে) যাতে অফলাইন demo replay mode-এ wording দেখানো যায়

## ৭. কপি-পেস্ট ফিক্স প্রম্পট (অগ্রাধিকার অনুসারে)

**১. (high) সব uncommitted কাজ কমিট করুন**
```
Review every untracked file under backend/app, backend/migrations, backend/tests,
docs/, e2e/tests, and frontend/src/features/admin and frontend/src/api for admin
ops, hardening tests, and new docs. Stage them with git add, grouped logically if
you split into multiple commits. Do not modify their content beyond what's needed
to pass checks.
Run the default fast check tier, then git add -A and commit with a clear message. Do not push.
```

**২. (medium) Replay demo ফাইল রেকর্ড করুন বা ARCHITECTURE/LLM_SPEC-এ স্পষ্ট করুন যে replay অনুপস্থিত**
```
backend/app/llm/cache/demo_replay.json does not exist, so auto LLM mode always
resolves to template, never replay. Either run backend/scripts/record_replay.py
against a real key once and commit the output, or update docs/LLM_SPEC.md and
docs/ARCHITECTURE.md to state that replay mode is unrecorded and template is the
offline default. Pick whichever is true; do not fabricate a replay file.
Run the default fast check tier, then git add -A and commit with a clear message. Do not push.
```

**৩. (medium) ARCHITECTURE.md-এর এন্ডপয়েন্ট টেবিল লাইভ API-এর সাথে মেলান**
```
docs/ARCHITECTURE.md section 2's endpoint table is stale versus the running API.
Compare it against GET /openapi.json on the live backend. Remove or correct rows
for routes that no longer exist (/distributor/overview, /copilot/history,
/admin/audit, /admin/knowledge/reindex — check if renamed or removed), and add
rows for implemented-but-undocumented routes (the /admin/data, /admin/drift,
/admin/jobs, /admin/llm/usage, /admin/org, /admin/overview group; export.csv
routes; /notifications*; /search; /system/freshness; /users/me/*; /health).
Run the default fast check tier, then git add -A and commit with a clear message. Do not push.
```

**৪. (medium) METHODS.md-এর open question ১১ ও ১৩ আপডেট করুন**
```
docs/METHODS.md lists open questions 11 (drift metric) and 13 (live-provider
failure fallback order) as undecided, but the code already resolves both:
backend/app/services/drift.py implements a real drift report (not a
placeholder), and backend/app/llm/service.py:192-200 already falls back
live -> replay -> template. Update METHODS.md to mark these as decided, citing
the implementing files.
Run the default fast check tier, then git add -A and commit with a clear message. Do not push.
```

**৫. (low) rate limiter-এর সীমাবদ্ধতা ডকুমেন্ট করুন**
```
backend/app/core/rate_limit.py implements an in-process sliding-window limiter
that only works correctly with a single uvicorn worker. Add a one-line note in
docs/PATH_TO_PRODUCTION.md's operational-hardening section that multi-worker or
multi-replica deployment needs a shared store (e.g. Redis) for this limiter, and
that today's single-process demo deployment is unaffected.
Run the default fast check tier, then git add -A and commit with a clear message. Do not push.
```

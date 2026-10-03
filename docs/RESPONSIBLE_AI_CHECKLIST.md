# Responsible AI Checklist

A compliance-style checklist for this submission. The live numbers behind the "Fairness" and
"Measured" rows are served in-app (`/responsible-ai`, F12) and derived in docs/METHODS.md §6 —
this file does not restate them with different figures, only points at where each is enforced in
code so a reviewer can verify rather than take it on trust.

## Human oversight

- [x] No endpoint moves money. Every action that matters goes through a human decision recorded
      with a required note: swap approve/reject (`POST /swaps/{id}/decision`), recommendation
      approve/decline/fulfil (`recommendation_requests`), anomaly review confirmed/dismissed
      (`POST /anomalies/{id}/review`) — all write to `audit_log` with user id + note
      (`backend/app/services/`, docs/METHODS.md §3).
- [x] Approval is a deliberate action, not a click: `HoldToApprove`, 1-second press-and-hold,
      releasing early approves nothing (`frontend/src/components/signature/HoldToApprove.tsx`).
- [x] An anomaly flag is a lead, not an accusation: agents never see their own flags; a flag only
      changes state after a distributor/admin reviews it with a note (docs/METHODS.md §3).

## Transparency and explainability

- [x] Every prediction response carries `model_version` + `generated_at`
      (docs/ARCHITECTURE.md §2).
- [x] Every LLM response is labelled `generated_by: llm|template|replay` and shown with a distinct
      UI chip kept apart from the model's numbers — "Model prediction" vs "AI-generated wording"
      vs "AI-generated wording (recorded)" vs "Template wording"
      (`frontend/src/components/signature/WhyStones.tsx`, docs/PRODUCT_CHECKLIST.md §4).
- [x] "Why?" reasons are exact TreeSHAP factors with the BDT impact, not a free-form LLM guess;
      the LLM may only reword the already-computed sentence (docs/METHODS.md §2, F7).
- [x] Model card in the running app, not a separate document: active models, held-out metrics,
      data, intended use, out-of-scope, limitations, human oversight, `advisory_only: true`
      (`GET /responsible-ai/model-card?lang`, `backend/app/services/model_card_text.py`).
- [x] `/about` states in plain language that data is synthetic, how the forecast works, and links
      to `/responsible-ai` (`frontend/src/features/about/AboutPage.tsx`).

## Fairness (measured, not assumed)

- [x] Forecast accuracy and stockout-recall measured by group (urban/rural, tier, region) on the
      held-out period, with the largest group-to-group gap reported alongside
      (`GET /responsible-ai/fairness?groupBy=`, docs/METHODS.md §6).
- [x] Result: stockout recall — the safety-relevant metric — is even across groups (97-99%,
      gap ≤ 1.4 points); relative forecast error is higher for small/rural agents (noisier,
      lower-volume demand) but the *gain* over the naive baseline is the same for every group, so
      no group is served by a structurally weaker model (docs/METHODS.md §6 reading).
- [x] Precision (false-alarm rate) is lowest for urban agents, reported as a burden on those
      agents rather than hidden — docs/METHODS.md §6.
- [ ] Not yet measured: fairness on real upay data. Synthetic groups only; flagged explicitly as a
      limitation (docs/METHODS.md §6, docs/PATH_TO_PRODUCTION.md).

## Safety and robustness

- [x] Numbers guard: every number or time an LLM output contains must already exist in the
      evidence pack it was given, checked by regex; a mismatch discards the LLM output and falls
      back to the template (docs/LLM_SPEC.md §4).
- [x] Prompt-injection and cross-agent-data requests are refused deterministically, before any LLM
      call — not relying on the model to behave (`backend/app/llm/copilot/intents.py`,
      `Route.blocked`). Verified live in docs/DEMO_SCRIPT.md's last beat.
- [x] Off-topic requests are refused with a fixed, polite message, no LLM call
      (`backend/app/llm/copilot/answers.py`, `Route.off_topic`).
- [x] Timeout (8s) + 1 retry, then template; the LLM can never block a page from loading
      (docs/LLM_SPEC.md §4).
- [x] Output schema (`{text, lang, cited_factors[]}`) validated by Pydantic before use
      (docs/LLM_SPEC.md §4).
- [x] Every LLM call logged (`llm_call_log`: provider, model, tokens, latency, `generated_by`,
      `guard_result`) and visible to admins (`GET /admin/llm/logs`).

## Privacy and data governance

- [x] Fully synthetic data; every generation assumption documented, not claimed as measured upay
      behaviour (docs/SYNTHETIC_ASSUMPTIONS.md).
- [x] Role-scoped data everywhere: agent sees only their own `agent_id`; distributor only their
      own agents; no cross-agent data ever enters an LLM prompt (docs/LLM_SPEC.md §2,
      `backend/app/core/deps.py`).
- [x] No tokens in `localStorage`; refresh token is an httpOnly, rotating, revocable cookie
      (docs/PRODUCT_CHECKLIST.md §8).
- [x] LLM API key lives only in the backend environment, never sent to the frontend; `.env` is
      git-ignored and `scripts/check.ps1`'s `secrets` step fails the build on a tracked `.env` or
      key-shaped string (docs/COMMANDS.md).
- [x] JWT secret must be at least 32 bytes or the backend refuses to start; `run.bat`/`run.sh`
      generate a random one on first run (README.md, CLAUDE.md).

## Known limitations (stated, not hidden)

- [ ] Stockout timing ignores scheduled/ad-hoc refills (answers "if nothing is done") and the
      coupling between the two floats; the correlation parameter (ρ=0.6) is an assumption, not
      fitted (docs/METHODS.md §2).
- [ ] The impact backtest's AI plan forecasts from logged (status-quo) history, not a true
      counterfactual, and doesn't yet know about an agent's own routine refills, so it over-orders
      small amounts (docs/METHODS.md §3).
- [ ] The AI plan uses *more* van trips than the fixed-threshold baseline for its service level
      (+279); reported plainly as a trade-off, not optimised away (docs/IDEA_CHAIN.md step 6).
- [ ] Anomaly detection tested against only three synthetic fraud patterns; real fraud looks
      different (docs/METHODS.md §3).
- [ ] One synthetic data seed; bit-identical retraining across CPUs is not guaranteed, so
      committed artifacts (not a fresh retrain) are the canonical model (docs/METHODS.md §5,
      open question 12).

This list is reviewed again whenever a METHODS.md number changes; it is not a one-time sign-off.

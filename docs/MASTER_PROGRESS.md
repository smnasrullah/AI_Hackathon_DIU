# Master finish pass: progress

| Phase | Status | Result |
|---|---|---|
| 0 Git hygiene | done | Artifacts untracked (b3003b1), ignore rules present, no secrets in tree or history, fast tier green |
| 1 Reject signup | done | POST /admin/users/{id}/reject, is_rejected (migration 0020), generic login/signup errors, audit, UI + tests |
| 2 Demo-safe help requests | done | simulate bypasses cap/cooldown/recent-ask (admin call only), demo reset, demo defaults + banner, auto cap 1/agent/float/day, start delay only after fresh bootstrap; e2e story uses reset (verified in phase 5) |
| 3 Frontend follow-up | done | owner-only cancel, Urgent/last-wave flags (list, detail, map), Help tab + badge, opt-out toggle, scheduler card, dry-run list, Load more, 12 s/60 s polls, a11y + e2e green |
| 4 npm audit | done | 3 findings (maplibre-gl critical, react-router moderate x2), all need major upgrades: not applied, decision needed; not exploitable as used |
| 5 Full verification | todo | |
| 6 Docs | todo | |

## Open problems
- Old commit 73ec93d still holds the local .db / logs in history (no secrets found in them; synthetic data only).
- Patiya (AGT-0002, DST-CTG) and Sunamganj (AGT-0003, DST-SYL) are far from Mirpur and in other distributors by design: they can never help AGT-0001. The e2e story uses the Mirpur helper logins.
- Admin help-settings wording moved to a lazy i18n namespace (helpAdmin) to keep /login under the 250 KB JS budget.
- npm audit: maplibre-gl <=6.4.0 XSS in DOM.sanitize (fix = 6.x major), react-router <7.18 open redirect + SSR (fix = 7.x major; stack pins RR6). No lockfile change.

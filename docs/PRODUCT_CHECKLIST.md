# Product Checklist — what a professional app must have

Every frontend prompt names the sections it must satisfy. A section is done only when covered by a test (vitest or e2e).

## §1 Auth and session
- Login with inline validation, loading state, generic errors (no user enumeration), lockout message after repeated failures.
- **Logout** in the avatar menu: calls API (revokes refresh token), clears Zustand stores + TanStack cache + storage, redirects to /login, other tabs log out too (BroadcastChannel), back button cannot reopen protected pages.
- Silent refresh on load; single-flight refresh on 401; if it fails -> clean redirect with "session expired" notice.
- Idle timeout warning modal (stay signed in / log out).
- Change password (old + new, strength hint, revokes other sessions).
- Role-based redirect after login; 403 page for wrong role; server enforces roles.

## §2 App shell
- Top bar: logo + PulseLine, breadcrumbs, global search / command palette (Ctrl+K), notification bell with unread badge, language switch, theme toggle, avatar menu (Profile, Settings, Help, Log out).
- Sidebar (distributor/admin) collapsible with tooltips; bottom nav (agent, mobile).
- Data freshness chip ("Updated 2 min ago · model v3") on prediction pages.
- Offline banner and request-timeout handling with retry.
- Page titles, favicon, theme-color, meta description, 404/403/500 pages (animated, with next step).
- Keyboard shortcut help (press ?).

## §3 Account and settings
- /profile: display name, role, linked agent/distributor, last login, avatar colour (no real PII).
- /settings: language (bn/en), digits (bn/en), theme (light/dark/system) with live preview, in-app notification toggle, reset onboarding tour, change password.
- Preferences saved to server and applied instantly.

## §4 Data UX
- Tables: sticky header, sorting, filtering, pagination, URL-synced state, column chooser, row expand, CSV export (safe against formula injection), empty/error states, keyboard navigation.
- Skeleton for every async block, optimistic updates where safe, toasts for every mutation result.
- Confirm dialogs for anything irreversible; HoldToApprove for swap approval.
- Every prediction shows source chips: MODEL (number), RULE/ASSUMPTION, AI-GENERATED (wording).

## §5 Notifications
- Bell panel: grouped by day, mark read / read all, deep-link to the relevant page, severity icon, bn/en text from i18n keys.
- /notifications full page with filters.

## §6 Content pages
- /help: FAQ, how to read the runway/gauges, keyboard shortcuts, replay tour, contact placeholder.
- /about (methodology): data is synthetic, how the forecast works, model card summary, limits, responsible-AI statement, version info.
- Privacy/synthetic-data notice in footer on every page.

## §7 Reliability and quality gates
- Error boundary per route with retry; no unhandled promise rejections; no console errors on any route.
- `scripts/check.ps1` (ruff, pytest, tsc, eslint, vitest) green; `scripts/check.ps1 -E2E` green (login/logout flows, every route loads, no console errors, no failed requests, no blank screens, axe has no serious violations).
- Mobile (390px) and desktop (1440px) checked in e2e for the main routes.
- Bundle: route-split, initial JS < 250 KB gzip.

## §8 Security UX
- No tokens in localStorage; refresh token httpOnly cookie only.
- Output from the LLM never rendered as raw HTML.
- Sensitive actions logged to audit_log and visible to admin.

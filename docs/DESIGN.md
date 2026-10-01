# Design Brief v2 — "Liquid Runway" (Bangla-first, rich, animated)

Idea: liquidity is a vessel draining along a runway of hours. The UI makes time-to-empty **physical, alive and calm**. Precise runway grid + organic liquid motion. Never a dashboard of grey cards.
Two personalities: **Daylight** (agent: warm, sunlit, mobile, one-thumb) and **Control Room** (distributor/admin: dark, glass, glow, desktop three-pane).

## 1. Tokens (CSS vars, light + dark)
- Ink: ink-950 #0A0F1F, ink-900 #121A33, ink-800 #1A2340, ink-600 #4A5578. Paper: #F7F3EA, paper-2 #EFE8D8, paper-3 #E4DAC4.
- Brand: upay-yellow #FFC20E (primary CTA, sparingly), pulse-blue #2F5BFF (links, focus, data accent).
- Floats: cash #7C5CFF with diagonal stripes, e-money #00B8D9 with dot grid (identity by texture + hue).
- Risk: safe #1FA971, watch #F2A900, act #E5484D. ALWAYS colour + icon + word (Safe / Watch / Act now; নিরাপদ / নজরে রাখুন / এখনই করুন).
- Glass (Control Room): bg rgba(18,26,51,.55), blur 18px, 1px inner line rgba(255,255,255,.08), glow shadow 0 0 40px rgba(47,91,255,.18).
- Aurora mesh (hero + empty states only): 3 blurred radial blobs (yellow 12%, blue 14%, cyan 10% opacity) drifting 40-60s. Grain overlay 3-4% (pre-rendered tiling PNG, no live filter).
- Radius 20 cards / 12 inputs / 999 chips. 4pt spacing. Shadows soft + 1px line.
- Type (self-hosted @fontsource, subsets latin + bengali, woff2): display Bricolage Grotesque, body Inter, Bangla Hind Siliguri (fallback Noto Sans Bengali), numbers JetBrains Mono tabular-nums. Scale: display-xl 72/0.95, display 48, h1 32, h2 24, body 16 (Bangla 17, line-height 1.6), small 14. Bangladeshi digit grouping (৳১,২০,০০০), bn/en digit toggle.

## 2. Motion language (motion/framer-motion)
- Springs: soft {stiffness 120, damping 18}, snappy {300, 28}. Durations 120 / 200 / 320 / 600 ms; loops 6s+. Easing cubic-bezier(.2,.8,.2,1). Define once in `src/styles/motion.ts`; no ad-hoc values.
- Animate only transform + opacity (plus SVG path length). Stagger 40ms. Reveal on scroll once (IntersectionObserver). Pause loops when `document.hidden` or off-screen.
- Page transitions: fade + 12px rise (220ms), route-change progress via PulseLine in the top bar. Shared-element transition from list row to detail where cheap.
- Numbers count up (600ms) on first load and tick on change. Lists stagger in. Buttons: press scale .97, liquid ripple from click point, primary CTA has subtle magnetic hover (desktop only).
- `prefers-reduced-motion`: no waves, no parallax, no loops; keep 120ms opacity fades. Low-end flag (`hardwareConcurrency <= 4`) disables aurora, particles and blur.

## 3. Signature components (build once, reuse)
1. **VesselGauge**: liquid level with two-layer wave top (6s loop), translucent low/high tide marks, texture per float, bubbles on level rise. Tap expands to hourly forecast.
2. **RunwayStrip**: 72h strip; fan chart (low/expected/high) draws in left-to-right (700ms); "now" cursor pulses; stockout flag drops in with a bounce ("3:40 PM · 82%"); event ribbons (Salary, Eid, Hat-bazar, Rain) slide in; dragging the what-if slider lifts the level live and leaves a ghost of the "before" line.
3. **CountdownCard**: "Cash runs dry in 5h 20m" with flip-digit ticker, confidence ring that fills, one primary action; card border glows by risk.
4. **PulseLine**: brand ECG line; calm slow green when safe, faster amber/red when risk rises; also the loader and route progress.
5. **WhyStones**: reasons as stackable "because" stones with SHAP bars growing in; "AI-generated wording" chip kept visually separate from "Model prediction" chip.
6. **SwapFlow**: droplets flow along arrows donor -> receiver (map layer, requestAnimationFrame offset along line); amount chips travel with them.
7. **HoldToApprove**: 1-second press-and-hold button with a filling ring and haptic-style shake on release too early; used for swap approval (shows deliberate human oversight).
8. **TimeScrubber**: 0-72h slider with play; map dots recolour as time moves; swap arrows appear when relevant.
9. **CopilotSheet**: bottom sheet (mobile) / right drawer (desktop); mic button (Web Speech bn-BD / en-US, graceful fallback); typing shimmer; answers render as mini-cards (gauge, chart, action) not walls of text; template text first, LLM wording fades in.
10. **Command palette** (Ctrl+K): jump to page/agent, filter Red, open swaps; animated results.
11. **BentoTile**: KPI tile with count-up, sparkline drawing in, 3D tilt on hover (max 6deg, desktop).
12. **RiskPill**: icon pulses only for Act now; colour + icon + word.
13. **Toasts**: spring-stacked, swipe to dismiss, aria-live.
14. **Skeletons**: brand-tinted shimmer shaped like the final content.
15. **Empty states**: custom animated SVG (cracked vessel, empty runway, quiet pulse), each with a next-step button. No stock art.
16. **ThemeToggle**: circular reveal via View Transitions API (fallback: fade).
17. **NotificationBell**: shakes once on new, badge pops, panel slides in.
18. **OnboardingTour**: spotlight cutout stepping through 4-5 key UI parts, once per user, replayable from Help.
19. **Charts**: Recharts with custom tooltip (glass), animate-in once, gradient fill + texture, axis labels in current digit style.
20. **ConfidenceRing, StatChip, DataTable (sticky header, row hover glow), Tabs (sliding underline), SegmentedControl (sliding pill)**.

## 4. Page blueprints
- **Landing `/`**: full-bleed aurora hero. Interactive runway: pointer X scrubs "time of day", the vessel drains, flag appears at stockout, headline updates ("আজ বিকেল ৩:৪০-এ ক্যাশ শেষ হতে পারে"). Below: 3-step story (Predict -> Explain -> Swap) with scroll-driven reveals, live demo numbers, role cards ("Try as Agent / Distributor"), responsible-AI strip, footer with notices.
- **Login `/login`**: split layout; left animated vessel + PulseLine, right form (floating labels, show-password, inline validation, caps-lock hint, demo-role chips when DEMO_MODE, loading button state, error shake).
- **Agent home (390px)**: top bar (PulseLine + language + bell + avatar menu) -> CountdownCard -> 2 VesselGauges -> RunwayStrip -> Why -> primary action. Bottom nav (Home, Forecast, Swap, Ask) with sliding indicator.
- **Agent forecast**: big fan chart, float switch (segmented), event ribbons, hour-by-hour list with mini bars.
- **Agent what-if**: slider dominates the screen; vessel and runway react live; result sentence updates.
- **Distributor control room (>=1280px)**: left filters + virtual list, centre map (dark, glow dots, droplets, TimeScrubber), right inspector (RunwayStrip, Why, actions), top KPI bento row (Red/Watch/Safe counts, pending swaps, open anomalies), bottom stripe with data freshness chip.
- **Agents table**: sticky header, URL-synced filters/sort/pagination, column chooser, CSV export, row expand with sparkline.
- **Agent detail**: hero (name, region, tier, risk), tabs (Overview, Forecast, Swaps, Anomalies, Activity).
- **Swaps**: kanban-like columns (Pending / Approved / Rejected) + handshake approval card with HoldToApprove and required note.
- **Anomalies**: list + peer comparison chart (violin or box style) + AI narrative + review dialog.
- **Impact**: bento grid; big count-up numbers (stockout hours, ৳ saved, van trips), AI vs baseline animated bars.
- **Responsible AI**: fairness chart per group, model card accordion, permanent notices ("Advisory only — a human approves", "Synthetic data only").
- **Admin / Settings / Profile / Help**: calm dense layouts using the same tokens; settings with live preview of theme, language, digits.

## 5. Map
Offline-first: bundled simplified Bangladesh boundary GeoJSON (Natural Earth, public domain) on a solid dark style; online raster tiles only as an optional toggle. Risk dots glow and breathe by level; clustering at low zoom; selected agent gets a ripple ring.

## 6. Iconography and imagery
lucide-react only plus custom animated risk glyphs. No emoji, no stock illustrations, no lorem ipsum. Favicon + app title + theme-color per role.

## 7. Microcopy (Bangla-first, short, human)
"আজ বিকেল ৩:৪০-এ ক্যাশ শেষ হতে পারে" / "Cash may run out around 3:40 PM". Errors say what happened and what to do. Footer notices always visible where relevant: "Advisory only — a human approves" and "Synthetic data only".

## 8. Performance budget
Route-split; initial JS < 250 KB gzip; map, charts and heavy motion lazy-loaded; no layout shift (reserve sizes); LCP < 2.5s on a mid laptop; 60fps animations; images are SVG or none; fonts `font-display: swap`.

## 9. Accessibility
Contrast >= 4.5:1, visible focus ring, full keyboard use, aria-live polite for countdown and toasts, targets >= 44px, never colour-only meaning, reduced-motion respected, screen-reader labels for gauges and charts (text summary).

## 10. Anti-patterns
Purple-gradient hero, equal-sized grey card grids, default shadcn look, stock illustrations, emoji icons, dense tables as the first thing an agent sees, heavy particle effects, auto-playing loops that ignore reduced-motion, lorem ipsum.

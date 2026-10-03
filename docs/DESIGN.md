# Design Brief v3 — calm, light fintech (Bangla-first)

Idea: liquidity is a vessel draining along a runway of hours. The UI makes time-to-empty clear and calm: light, airy surfaces, quiet depth, one accent colour, data first. Easy for non-technical users.
Light theme is the default for every role; dark theme mirrors every token (user setting, or "system").

Source of truth: `frontend/src/styles/tokens.css` (tokens), `index.css` (Tailwind mapping, base type), `components.css` (shared classes), `motion.ts` (motion). Components use tokens only, never raw hex.

## 1. Tokens
- **Surfaces (light):** bg `#F4F6FA` (cool mist), surface `#FFFFFF`, surface-2 `#F1F4F9`, surface-3 `#E4E9F2`. Text fg ink-950 `#0B1324`, muted `#4A5670` (solid, AA on every surface). Lines: hairline 9% ink, strong 24% ink (inputs, 3:1).
- **Surfaces (dark):** bg `#0A1120`, surface `#111A2E`, surface-2 `#18233B`, fg `#E9EEF7`, muted `#A3ADC2`.
- **Primary action:** deep blue `--primary` `#2952E3` (dark `#3B63F5`), white text. pulse-blue `#2F5BFF` for links, focus, data accents. upay-yellow `#FFC20E` is an accent only (AI-wording chip, event ribbons, skip link).
- **Floats:** cash `#7C5CFF` (diagonal stripes), e-money `#00B8D9` (dot grid): identity by texture + hue.
- **Shape:** radius sm 8 / input 10 / card 16 / chip 999.
- **Depth:** `--elev-xs` (inputs, chips), `--elev-soft` (cards), `--elev-lift` (dialogs, toasts, auth card). Hairline border + soft ambient shadow, no glow.
- **Spacing:** 4pt grid (`--space-1..12`, same as Tailwind's scale). Page frame `--page-max` 1440px; prose `--prose-max` 42rem. Page padding 16 (phone) / 24 (md) / 32 (xl).
- **Z-index:** `--z-raised` 10, `--z-sticky` 40 (top bar), `--z-overlay` / `--z-modal` / `--z-toast` 50, `--z-tour` 60, `--z-skip` 70. Use `z-(--z-*)`, no ad-hoc numbers above 10.

## 2. Background
`PageBackdrop` (app shell, auth and status pages): a fixed layer behind content with a static three-stop radial gradient mesh (blue / cyan / warm, 5–8% opacity) and two faint wave-line bands (SVG mask filled with `--wave-color`, 7%). Waves drift 140–180s, linear, transform-only; stopped for `prefers-reduced-motion`, the low-end flag and hidden tabs; hidden in print. Content sits on opaque cards, so text contrast never depends on the backdrop. Aurora blobs remain only in empty states and the landing hero.

## 3. Typography
- Latin: **Inter** (400/500/600/700) for display and body. Bangla: **Hind Siliguri** (400–700), fallback Noto Sans Bengali. Self-hosted via @fontsource, latin + bengali subsets, `font-display: swap`.
- Scale: display-xl 72, display 48, h1 28/1.2, h2 20/1.35, h3 17/1.4, body 16/1.55, small 14/1.5.
- Bangla (`:lang(bn)`): body 17px, line-height 1.7 (never below 1.6), headings 1.35; **letter-spacing is forced to normal on every element** (tracking breaks conjuncts and vowel signs). Latin headings use -0.012em.
- Numbers: `.num` = Inter tabular figures (Bangla digits shape with Hind Siliguri). Money via `MoneyText` / `formatMoney`: ৳ with Bangladeshi lakh grouping (৳১,২০,০০০), bn/en digit setting.
- Eyebrow: `.ap-eyebrow` 12px semibold uppercase muted (Latin tracking 0.08em; none in Bangla).

## 4. Risk colours
Safe `#1FA971`, Watch `#F2A900`, Act now `#E5484D`; text tones for AA on light: `#0F6B47`, `#7D5400`, `#B4272C` (dark theme has lighter tones). Defined once in `components/ui/risk.ts`. **Always colour + icon + word** (Safe / Watch / Act now; নিরাপদ / নজরে রাখুন / এখনই করুন): `RiskPill` (ShieldCheck / Eye / Siren, icon pulses only for Act now), admin `Badge`. Never use raw risk hues as text colour.

## 5. Components
- `.ap-card`: surface, hairline border, card radius, soft shadow. Opaque for data; glass (`.glass`, 74% white + 16px blur) only for the sticky top bar, sidebar, toasts and map overlays.
- `PageHeader`: optional eyebrow, h1, one-sentence description, right-aligned actions (wrap under on phones). Used on every page with a visible title; the Control Room keeps an `sr-only` h1 because its map height is `calc(100dvh - 18rem)`.
- Buttons (`LiquidButton`): primary (blue), secondary (white + strong border), ghost, danger (`--act-solid`). Min height 44px (sm 36px), press scale .97.
- Inputs: white, strong border, xs shadow; hover darkens border; focus = blue border + 4px 20% blue ring. Floating labels on auth forms.
- Tables (`DataTable`): solid surface-2 sticky header with small uppercase labels, row hover tint + blue left bar, keyboard rows.
- Tabs: sliding blue underline. SegmentedControl: sliding white pill. Badges/chips: tinted fill + ring + icon.
- Dialogs / side panels: Radix, 40% ink overlay with 2px blur, card radius, lift shadow, close button top-right.
- Toasts: glass card + lift shadow, icon per tone, swipe to dismiss, aria-live polite.
- Skeletons: neutral shimmer shaped like the final content. Every data block has skeleton, empty (with next action) and error (with retry) states.
- Shell: sidebar (distributor/admin) is glass with a blue-tinted active item and a 3px left accent bar; collapsible to icons with tooltips; drawer on phones. Agent: top bar + bottom nav, max width 2xl.

## 6. Map (Control Room)
Offline-first: bundled Natural Earth Bangladesh boundary, no glyphs or sprites; optional online CARTO tiles (light_all / dark_all by theme). Colours are read from tokens at runtime (`mapPalette.ts`) and re-applied on theme switch: water `--map-water`, land `--map-land`, region borders `--map-border`.
Markers never rely on colour alone: dot size grows with risk (5 / 6.5 / 8px), Act-now dots carry an extra red ring, every dot has a dark outline (`--map-outline`) and a halo (`--map-halo`) so yellow stays visible on white land. Hover: larger dot, heavier outline. Selected: ink ring. Clusters: dark edge, ring in the worst level's colour, light centre with the count, and a "!" badge when an Act-now agent is inside. The legend shows the same shapes plus icon and word.

## 7. Motion
Defined once in `src/styles/motion.ts`: springs soft {120, 18} and snappy {300, 28}; durations 120 / 200 / 320 / 600ms; easing cubic-bezier(.2,.8,.2,1). Animate transform + opacity only. Page enter: fade + 12px rise. Loops 6s+ and paused off-screen or when the tab is hidden. `prefers-reduced-motion`: no loops, no waves, 120ms fades only. Low-end flag disables blur, aurora and wave drift.

## 8. Accessibility
Contrast >= 4.5:1 text, 3:1 for input borders and map markers; visible 2px blue focus ring; full keyboard use; targets >= 44px; aria-live for countdown and toasts; never colour-only meaning; screen-reader text summaries for gauges, charts and the map.

## 9. Imagery and copy
lucide-react icons only; no emoji, stock art or lorem ipsum. Bangla-first, short, human copy; errors say what happened and what to do. Footer notices: "Advisory only — a human approves" and "Synthetic data only".

## 10. Performance
Route-split; map, charts and heavy motion lazy-loaded; initial JS < 250 KB gzip; no layout shift; backdrop is CSS + inline SVG only (no images).

## 11. Anti-patterns
Dark slabs on light pages, glow shadows, purple-gradient hero, default shadcn look, equal grey card grids, colour-only status, letter-spacing on Bangla, hard-coded colours in components, loops that ignore reduced motion.

# Design Brief — "Liquidity Runway"

Concept: liquidity is a vessel that drains along a runway of hours. The UI makes time-to-empty physical and calm, not a dashboard of grey cards.
Two moods: Agent app = warm, sunlit, mobile, one-thumb. Distributor = dark "control room", desktop, three-pane.

## Tokens (CSS vars, light + dark)
- ink-950 #0A0F1F, ink-800 #1A2340, paper #F7F3EA, paper-2 #EFE8D8, line rgba(10,15,31,.12)
- brand: upay-yellow #FFC20E (primary CTA, sparingly), pulse-blue #2F5BFF (links, focus)
- floats: cash = #7C5CFF (violet) with diagonal-stripe fill, e-money = #00B8D9 (cyan) with dot-grid fill (identity by texture, not only hue)
- risk: green #1FA971, amber #F2A900, red #E5484D. ALWAYS colour + icon + word (Safe / Watch / Act now; নিরাপদ / নজরে রাখুন / এখনই করুন)
- radius 20 cards, 999 chips; shadow soft + 1px inner line; spacing 4pt grid
- Default theme: Agent = light(paper), Distributor/Admin = dark(ink). User toggle persisted.

## Type (self-hosted @fontsource)
Display "Bricolage Grotesque", body Latin "Inter", Bangla "Hind Siliguri" (fallback Noto Sans Bengali), numbers "JetBrains Mono" tabular-nums. Hero numbers 56-72px. bn/en digit toggle. Bangla line-height 1.6.

## Signature components (build once, reuse everywhere)
1. VesselGauge: animated liquid level with wave top, translucent low/high tide marks, texture per float. Tap to expand to hourly forecast.
2. RunwayStrip: 72h horizontal runway; fan chart (low-expected-high), "now" cursor, stockout flag with time ("3:40 PM · 82%"), event ribbons on top (Salary, Eid, Hat-bazar, Rain). Dragging the what-if slider lifts the level live.
3. CountdownCard: "Cash runs dry in 5h 20m" ticking, confidence ring, one primary action button.
4. PulseLine: brand ECG line in the top bar; calm when Green, fast + amber/red when risk rises.
5. WhyStones: reasons as stackable "because" stones with SHAP bar; "AI-generated wording" chip + "Model prediction" chip kept visually separate.
6. SwapFlow: on the map, droplets flow along arrows donor -> receiver; approval is a "handshake" card with amount, distance, van trip saved, note field.
7. CopilotSheet: bottom sheet (mobile) / right drawer (desktop), mic button (Web Speech bn-BD / en-US, graceful fallback), answers render as mini-cards (gauge, chart, action) not walls of text.
8. Command palette (Ctrl+K) for distributor: jump to agent, filter Red, open swaps.

## Layout
- Agent (mobile-first, 390px): top PulseLine + language switch, vertical story: CountdownCard -> 2 VesselGauges -> RunwayStrip -> Why -> Action. Bottom nav (Home, Forecast, Swap, Ask). Min tap 44px. Works one-handed.
- Distributor (>=1280px): left filters/list, centre map (dark canvas, risk dots, swap droplets), right inspector, bottom RunwayStrip of selected agent.
- Map must work offline: bundled Bangladesh boundary GeoJSON on a solid dark style; online OSM tiles only as optional toggle.

## Motion (motion/framer-motion)
150-300ms springs, liquid wave 6s loop, number count-up on load, stagger list entry. Honour prefers-reduced-motion (static fallback). No parallax, no confetti.

## Microcopy
Human and short, Bangla-first. Example: "আজ বিকেল ৩:৪০-এ ক্যাশ শেষ হতে পারে" / "Cash may run out around 3:40 PM". Footer notices always visible on relevant pages: "Advisory only — a human approves" and "Synthetic data only".

## States and a11y
Every data block: skeleton, empty (with next step), error (with retry). Contrast >= 4.5:1, visible focus ring, keyboard everything, aria-live for countdown changes (polite), no colour-only meaning.

## Anti-patterns
Purple-gradient hero, equal-sized grey card grids, default shadcn look, stock illustrations, emoji icons, dense tables as the first thing an agent sees, lorem ipsum.

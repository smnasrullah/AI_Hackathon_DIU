import { Aurora, Grain } from "../../components/backdrop/Backdrop";
import { PulseLine } from "../../components/signature/PulseLine";
import { DUR, SPRING, STAGGER } from "../../styles/motion";
import { KitSection, KitState } from "./KitFrame";

const SWATCHES = [
  ["ink-950", "var(--ink-950)"],
  ["ink-800", "var(--ink-800)"],
  ["ink-600", "var(--ink-600)"],
  ["paper", "var(--paper)"],
  ["paper-3", "var(--paper-3)"],
  ["upay-yellow", "var(--upay-yellow)"],
  ["pulse-blue", "var(--pulse-blue)"],
  ["cash", "var(--float-cash)"],
  ["e-money", "var(--float-emoney)"],
  ["safe", "var(--risk-safe)"],
  ["watch", "var(--risk-watch)"],
  ["act", "var(--risk-act)"],
] as const;

const SEMANTIC = ["bg", "surface", "surface-2", "fg", "muted", "line"] as const;

export function FoundationSections() {
  return (
    <>
      <KitSection id="tokens" title="Tokens" note="Palette, semantic surfaces, float textures, radii">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SWATCHES.map(([name, value]) => (
            <div key={name} className="overflow-hidden rounded-xl border border-line">
              <div className="h-12" style={{ background: value }} />
              <p className="px-2 py-1 font-mono text-[11px] text-muted">{name}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SEMANTIC.map((name) => (
            <div key={name} className="rounded-xl border border-line p-2">
              <div className="h-8 rounded-lg border border-line" style={{ background: `var(--${name})` }} />
              <p className="mt-1 font-mono text-[11px] text-muted">--{name}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="h-16 w-28 rounded-[var(--radius-card)]" style={{ background: "repeating-linear-gradient(45deg, var(--float-cash) 0 6px, color-mix(in srgb, var(--float-cash) 70%, white) 6px 9px)" }} />
          <div className="h-16 w-28 rounded-[var(--radius-card)]" style={{ background: "radial-gradient(circle, rgba(255,255,255,.45) 1.3px, transparent 1.6px) 0 0 / 8px 8px, var(--float-emoney)" }} />
          <div className="glass grid h-16 w-40 place-items-center rounded-[var(--radius-card)] text-small">Glass</div>
          <div className="grid h-16 w-24 place-items-center rounded-[var(--radius-input)] border border-line text-xs text-muted">radius 12</div>
          <div className="grid h-16 w-24 place-items-center rounded-full border border-line text-xs text-muted">radius 999</div>
        </div>
      </KitSection>

      <KitSection id="type" title="Type scale" note="Inter display and body, Hind Siliguri Bangla, tabular Inter numbers">
        <div className="space-y-2">
          <p className="font-display text-display-xl font-bold">৳১,২০,০০০</p>
          <p className="font-display text-display font-bold">Runway 48</p>
          <p className="font-display text-h1 font-bold">Heading 1 · শিরোনাম</p>
          <p className="font-display text-h2 font-bold">Heading 2 · উপশিরোনাম</p>
          <p className="text-body">Body 16: Cash may run out around 3:40 PM.</p>
          <p lang="bn" className="text-[17px] leading-[1.6]">বাংলা ১৭: আজ বিকেল ৩:৪০-এ ক্যাশ শেষ হতে পারে</p>
          <p className="text-small text-muted">Small 14: secondary text and captions</p>
          <p className="num text-body">1,20,000 · 0123456789 · ০১২৩৪৫৬৭৮৯</p>
        </div>
      </KitSection>

      <KitSection id="backgrounds" title="Aurora + grain" note="Hero and empty states only; off for low-end and reduced motion">
        <div className="relative isolate h-44 overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg">
          <Aurora />
          <Grain />
          <div className="relative grid h-full place-items-center">
            <p className="font-display text-h1 font-bold">Liquid Runway</p>
          </div>
        </div>
      </KitSection>

      <KitSection id="motion" title="Motion presets" note="src/styles/motion.ts">
        <dl className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
          <div><dt className="text-muted">spring soft</dt><dd>{SPRING.soft.stiffness} / {SPRING.soft.damping}</dd></div>
          <div><dt className="text-muted">spring snappy</dt><dd>{SPRING.snappy.stiffness} / {SPRING.snappy.damping}</dd></div>
          <div><dt className="text-muted">durations</dt><dd>{[DUR.fast, DUR.base, DUR.slow, DUR.reveal].map((d) => d * 1000).join(" / ")} ms</dd></div>
          <div><dt className="text-muted">stagger</dt><dd>{STAGGER * 1000} ms</dd></div>
        </dl>
      </KitSection>

      <KitSection id="pulse" title="PulseLine" note="Calm when safe, faster as risk rises; also loader and route progress">
        <div className="grid gap-4 sm:grid-cols-3">
          <KitState label="Safe"><PulseLine level="green" /></KitState>
          <KitState label="Watch"><PulseLine level="amber" /></KitState>
          <KitState label="Act now"><PulseLine level="red" /></KitState>
          <KitState label="Loader"><PulseLine mode="loader" /></KitState>
          <KitState label="Route progress" className="sm:col-span-2"><PulseLine mode="progress" /></KitState>
        </div>
      </KitSection>
    </>
  );
}

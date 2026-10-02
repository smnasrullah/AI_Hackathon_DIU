import { Banknote, ShieldAlert, Timer, Truck, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { BentoTile } from "../../components/signature/BentoTile";
import { CountdownCard } from "../../components/signature/CountdownCard";
import { RunwayStrip } from "../../components/signature/RunwayStrip";
import { VesselGauge } from "../../components/signature/VesselGauge";
import { WhyStones } from "../../components/signature/WhyStones";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { SkeletonCard, SkeletonGauge, SkeletonRunway } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/StatePanel";
import { formatMoney } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { KitSection, KitState } from "./KitFrame";
import { KIT_CAPACITY, KIT_EVENTS, KIT_HOURLY, KIT_REASONS, makeSeries, stockoutOf } from "./kitData";

const START = 46_000;
const BASE = makeSeries(START);

function RunwayDemo() {
  const { lang, digits } = useLocale();
  const [delta, setDelta] = useState(0);
  const series = useMemo(() => (delta ? makeSeries(START + delta) : BASE), [delta]);
  return (
    <div className="space-y-3">
      <RunwayStrip series={series} capacity={KIT_CAPACITY} ghost={delta ? BASE : null} stockout={stockoutOf(series, 0.82)} events={KIT_EVENTS} />
      <label className="block text-small">
        <span className="flex justify-between">
          <span>What-if: add cash</span>
          <span className="num">{formatMoney(delta, digits, { lang, signed: true })}</span>
        </span>
        <input
          type="range"
          min={0}
          max={120_000}
          step={5_000}
          value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--pulse-blue)]"
        />
      </label>
    </div>
  );
}

function GaugeDemo() {
  const [balance, setBalance] = useState(START);
  return (
    <div className="space-y-2">
      <VesselGauge floatType="cash" balance={balance} capacity={KIT_CAPACITY} lowMark={30_000} highMark={160_000} level={balance < 60_000 ? "amber" : "green"} hourly={KIT_HOURLY} />
      <div className="flex gap-2">
        <LiquidButton size="sm" variant="secondary" onClick={() => setBalance((b) => Math.min(KIT_CAPACITY, b + 40_000))}>Refill</LiquidButton>
        <LiquidButton size="sm" variant="ghost" onClick={() => setBalance((b) => Math.max(0, b - 25_000))}>Drain</LiquidButton>
      </div>
    </div>
  );
}

function CountdownDemo() {
  const [hours, setHours] = useState(5.333);
  return (
    <div className="space-y-2">
      <CountdownCard floatType="cash" hoursToStockout={hours} confidence={0.82} level="red" action={{ label: "Ask distributor for cash", onClick: () => undefined, icon: Banknote }} />
      <LiquidButton size="sm" variant="secondary" icon={Timer} onClick={() => setHours((h) => Math.max(0.25, h - 0.25))}>
        Tick 15 min
      </LiquidButton>
    </div>
  );
}

export function SignatureSections() {
  const { lang } = useLocale();
  return (
    <>
      <KitSection id="vessel" title="VesselGauge" note="Two-layer wave, tide marks, texture per float, bubbles on rise; tap to expand">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KitState label="Cash, interactive"><GaugeDemo /></KitState>
          <KitState label="e-money, safe"><VesselGauge floatType="emoney" balance={142_000} capacity={KIT_CAPACITY} level="green" /></KitState>
          <KitState label="Cash, act now"><VesselGauge floatType="cash" balance={9_500} capacity={KIT_CAPACITY} lowMark={30_000} level="red" /></KitState>
          <KitState label="Loading"><SkeletonGauge /></KitState>
        </div>
      </KitSection>

      <KitSection id="runway" title="RunwayStrip" note="Fan chart draws in, stockout flag drops, events slide in; slider leaves a ghost line" wide>
        <div className="grid gap-4 lg:grid-cols-2">
          <KitState label="Stockout + events + what-if" className="lg:col-span-2"><RunwayDemo /></KitState>
          <KitState label="No stockout"><RunwayStrip series={makeSeries(180_000)} capacity={KIT_CAPACITY} /></KitState>
          <KitState label="Loading"><SkeletonRunway /></KitState>
          <KitState label="Error"><ErrorState onRetry={() => undefined} compact /></KitState>
        </div>
      </KitSection>

      <KitSection id="countdown" title="CountdownCard" note="Flip-digit ticker, confidence ring, border glows by risk">
        <div className="grid gap-4 md:grid-cols-2">
          <KitState label="Act now (tick it)"><CountdownDemo /></KitState>
          <KitState label="Watch"><CountdownCard floatType="emoney" hoursToStockout={19.5} confidence={0.64} level="amber" action={{ label: "Plan a swap", onClick: () => undefined }} /></KitState>
          <KitState label="Safe"><CountdownCard floatType="cash" hoursToStockout={null} confidence={0.9} level="green" /></KitState>
          <KitState label="Loading"><SkeletonCard /></KitState>
        </div>
      </KitSection>

      <KitSection id="why" title="WhyStones" note="Model chip kept apart from the wording chip">
        <div className="grid gap-4 lg:grid-cols-3">
          <KitState label="Template wording"><WhyStones reasons={KIT_REASONS[lang]} generatedBy="template" modelVersion="lgbm-q-2026.10" /></KitState>
          <KitState label="LLM wording"><WhyStones reasons={KIT_REASONS[lang]} generatedBy="llm" modelVersion="lgbm-q-2026.10" /></KitState>
          <KitState label="Replay wording"><WhyStones reasons={KIT_REASONS[lang].slice(0, 1)} generatedBy="replay" modelVersion="lgbm-q-2026.10" /></KitState>
        </div>
      </KitSection>

      <KitSection id="bento" title="BentoTile" note="Count-up, sparkline draws in, 3D tilt on hover (desktop)">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <BentoTile title="BDT saved" value={18_40_000} format="money" icon={Wallet} sparkline={[4, 6, 5, 8, 9, 12, 14]} tone="green" />
          <BentoTile title="Agents at risk" value={37} icon={ShieldAlert} sparkline={[12, 18, 22, 30, 28, 35, 37]} tone="red" />
          <BentoTile title="Stockout hours avoided" value={126.5} format="hours" icon={Timer} />
          <BentoTile title="Van trips avoided" value={0.31} format="percent" icon={Truck} sparkline={[0.1, 0.14, 0.2, 0.22, 0.31]} />
          <SkeletonCard />
        </div>
      </KitSection>
    </>
  );
}

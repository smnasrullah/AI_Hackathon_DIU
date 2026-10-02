import { ArrowRight, Banknote, Check, Clock, Trash2, Truck } from "lucide-react";
import { useState } from "react";

import { HoldToApprove } from "../../components/signature/HoldToApprove";
import { ConfidenceRing } from "../../components/ui/ConfidenceRing";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { MoneyText } from "../../components/ui/MoneyText";
import { RiskPill } from "../../components/ui/RiskPill";
import { StatChip } from "../../components/ui/StatChip";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { TimeText } from "../../components/ui/TimeText";
import { KitSection, KitState } from "./KitFrame";
import { KIT_NOW } from "./kitData";

const LEVELS = ["green", "amber", "red"] as const;

export function PrimitiveSections() {
  const [approvals, setApprovals] = useState(0);
  const [amount, setAmount] = useState(1_20_000);

  return (
    <>
      <KitSection id="risk-pill" title="RiskPill" note="Colour + icon + word; only Act now pulses">
        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map((l) => <RiskPill key={l} level={l} />)}
          {LEVELS.map((l) => <RiskPill key={`${l}-sm`} level={l} size="sm" />)}
        </div>
      </KitSection>

      <KitSection id="stat-chip" title="StatChip">
        <div className="flex flex-wrap gap-2">
          <StatChip label="Pending swaps" value="12" icon={Clock} />
          <StatChip label="Van trips" value="8" icon={Truck} delta={{ text: "3", direction: "down", good: true }} />
          <StatChip label="Stockout hours" value="41" delta={{ text: "6", direction: "up", good: false }} />
        </div>
      </KitSection>

      <KitSection id="money" title="MoneyText" note="Lakh grouping, user digits, compact, signed, count-up">
        <div className="grid gap-3 sm:grid-cols-3">
          <KitState label="Zero"><MoneyText value={0} className="text-h2" /></KitState>
          <KitState label="Hundreds"><MoneyText value={950} className="text-h2" /></KitState>
          <KitState label="Lakh"><MoneyText value={120000} className="text-h2" /></KitState>
          <KitState label="Crore"><MoneyText value={12500000} className="text-h2" /></KitState>
          <KitState label="Compact"><MoneyText value={12500000} compact className="text-h2" /></KitState>
          <KitState label="Signed negative"><MoneyText value={-4100} signed className="text-h2" /></KitState>
          <KitState label="Forced English digits"><MoneyText value={120000} digits="en" className="text-h2" /></KitState>
          <KitState label="Forced Bangla digits"><MoneyText value={120000} digits="bn" className="text-h2" /></KitState>
          <KitState label="Count-up (tap to change)">
            <button type="button" className="text-left" onClick={() => setAmount((a) => (a === 1_20_000 ? 45_500 : 1_20_000))}>
              <MoneyText value={amount} animate className="font-display text-h2 font-bold" />
            </button>
          </KitState>
        </div>
      </KitSection>

      <KitSection id="time" title="TimeText" note="Asia/Dhaka clock, Bangla day-parts, durations">
        <div className="grid gap-3 sm:grid-cols-4">
          <KitState label="Clock"><TimeText at="2026-10-02T09:40:00Z" /></KitState>
          <KitState label="Date + time"><TimeText at="2026-10-02T09:40:00Z" mode="datetime" /></KitState>
          <KitState label="Relative"><TimeText at="2026-10-02T11:20:00Z" mode="relative" now={new Date(KIT_NOW)} /></KitState>
          <KitState label="Duration"><TimeText hours={5.333} /></KitState>
          <KitState label="Long duration"><TimeText hours={61.5} /></KitState>
          <KitState label="Past"><TimeText at="2026-10-02T04:30:00Z" mode="relative" now={new Date(KIT_NOW)} /></KitState>
        </div>
      </KitSection>

      <KitSection id="confidence" title="ConfidenceRing">
        <div className="flex gap-6">
          <ConfidenceRing value={0.35} stroke="var(--risk-act)" />
          <ConfidenceRing value={0.62} stroke="var(--risk-watch)" />
          <ConfidenceRing value={0.92} />
          <ConfidenceRing value={0.82} size={88} />
        </div>
      </KitSection>

      <KitSection id="button" title="LiquidButton" note="Press scale, ripple from the click point, magnetic hover on primary (desktop)">
        <div className="flex flex-wrap items-center gap-2">
          <LiquidButton icon={Banknote}>Request cash</LiquidButton>
          <LiquidButton variant="secondary" icon={ArrowRight}>View forecast</LiquidButton>
          <LiquidButton variant="ghost">Later</LiquidButton>
          <LiquidButton variant="danger" icon={Trash2}>Reject</LiquidButton>
          <LiquidButton size="sm">Small</LiquidButton>
          <LiquidButton size="lg" icon={Check}>Large</LiquidButton>
          <LiquidButton loading>Saving</LiquidButton>
          <LiquidButton disabled>Disabled</LiquidButton>
        </div>
      </KitSection>

      <KitSection id="hold" title="HoldToApprove" note="1 second press-and-hold; release early shakes. Keyboard: hold Space">
        <div className="flex flex-wrap items-start gap-6">
          <KitState label={`Default (approved ${approvals}x)`}>
            <HoldToApprove key={approvals} onApprove={() => window.setTimeout(() => setApprovals((n) => n + 1), 1200)} label="Hold to approve swap" />
          </KitState>
          <KitState label="Disabled">
            <HoldToApprove onApprove={() => undefined} disabled />
          </KitState>
        </div>
      </KitSection>

      <KitSection id="theme-toggle" title="ThemeToggle" note="Circular reveal via View Transitions; fade fallback; instant when reduced">
        <ThemeToggle />
      </KitSection>
    </>
  );
}

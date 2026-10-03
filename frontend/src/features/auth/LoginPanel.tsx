import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RiskLevel } from "../../api/types";
import { Aurora, Grain } from "../../components/backdrop/Backdrop";
import { LiquidVessel } from "../../components/signature/LiquidVessel";
import { PulseLine } from "../../components/signature/PulseLine";
import { useLoopActive } from "../../lib/motionPrefs";

/** A day in five tides: the vessel drains, gets refilled by a swap, drains again. */
const TIDES = [0.82, 0.61, 0.38, 0.19, 0.66];
const TIDE_MS = 2600;

const levelFor = (fill: number): RiskLevel => (fill > 0.5 ? "green" : fill > 0.3 ? "amber" : "red");

/** Left side of /login: animated vessel + PulseLine on an aurora. Decorative. */
export function LoginPanel() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const active = useLoopActive(ref);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % TIDES.length), TIDE_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const fill = TIDES[step] ?? 0.5;
  const level = levelFor(fill);

  return (
    <div
      ref={ref}
      className="ap-card relative isolate hidden overflow-hidden bg-surface/70 p-10 text-fg lg:flex lg:flex-col"
    >
      <Aurora className="-z-10" />
      <Grain className="-z-10" />
      <p className="ap-eyebrow">{t("login.eyebrow")}</p>
      <h2 className="mt-3 max-w-md font-display text-display font-bold">{t("login.panelTitle")}</h2>
      <p className="mt-4 max-w-sm text-body text-muted">{t("login.panelBody")}</p>
      <div className="mt-auto flex items-end gap-8 pt-10">
        <div className="w-36 shrink-0">
          <LiquidVessel fill={fill} level={level} />
        </div>
        <div className="mb-6 flex-1">
          <PulseLine level={level} className="h-12" />
        </div>
      </div>
    </div>
  );
}

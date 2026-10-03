import { ArrowLeftRight, Clock, MapPin } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { MoneyText } from "../../components/ui/MoneyText";
import { formatMoney, formatNumber } from "../../lib/format";
import { useLoopActive } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";

const AMOUNT = 40_000;
const DISTANCE_KM = 1.2;
const DROPS = [0, 1, 2];

function AgentNode({ name, fill, tone }: { name: string; fill: number; tone: "short" | "spare" }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="relative block h-20 w-12 overflow-hidden rounded-[14px] border-2 border-line-strong bg-surface-2">
        <span
          className={tone === "short" ? "absolute inset-x-0 bottom-0 bg-act/70" : "absolute inset-x-0 bottom-0 bg-cash/80"}
          style={{ height: `${fill * 100}%` }}
        />
      </span>
      <span className="text-xs font-semibold leading-tight">{name}</span>
    </div>
  );
}

/** Donor -> receiver droplets along the arrow; the distributor still approves. */
export function SwapDemo() {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const flowing = useLoopActive(ref);
  const amount = formatMoney(AMOUNT, digits, { lang });

  return (
    <div ref={ref} className="ap-card p-5 shadow-soft">
      <p className="sr-only">{t("landing.story.swapSummary", { amount })}</p>
      <div aria-hidden className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2">
        <AgentNode name={t("landing.story.swapTo")} fill={0.86} tone="spare" />
        <div className="relative flex flex-col items-center gap-2">
          <MoneyText value={AMOUNT} className="rounded-full bg-cash/15 px-3 py-1 text-small font-bold" />
          <div className="relative h-3 w-full overflow-hidden">
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line-strong" />
            {flowing
              ? DROPS.map((i) => (
                  <span key={i} className="ap-loop ap-flow absolute inset-0" style={{ animationDelay: `${i * 0.8}s` }}>
                    <span className="absolute left-0 top-1/2 block size-2.5 -translate-y-1/2 rounded-full bg-cash" />
                  </span>
                ))
              : null}
          </div>
          <ArrowLeftRight className="size-4 text-muted" />
        </div>
        <AgentNode name={t("landing.story.swapFrom")} fill={0.08} tone="short" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold">
          <MapPin aria-hidden className="size-3.5" />
          <span className="num">{t("landing.story.swapDistance", { km: formatNumber(DISTANCE_KM, digits, { fraction: 1 }) })}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-watch/15 px-2.5 py-1 font-semibold text-watch-fg">
          <Clock aria-hidden className="size-3.5" />
          {t("landing.story.swapPending")}
        </span>
      </div>
    </div>
  );
}

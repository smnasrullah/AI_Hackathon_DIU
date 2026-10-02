import { CircleCheck, CircleX, Clock, Download, RotateCw, Truck, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useSwaps } from "../../../api/hooks/swaps";
import { exportSwapsCsv } from "../../../api/services/swaps";
import type { SwapItem, SwapStatus } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { StatChip } from "../../../components/ui/StatChip";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { toast } from "../../../components/ui/toastStore";
import { formatNumber } from "../../../lib/format";
import { useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { listStagger, revealVariants } from "../../../styles/motion";
import { HandshakeDialog } from "./HandshakeDialog";
import { SwapCard } from "./SwapCard";

const COLUMNS: { status: SwapStatus; icon: LucideIcon; tone: string }[] = [
  { status: "pending", icon: Clock, tone: "text-watch-fg" },
  { status: "approved", icon: CircleCheck, tone: "text-safe-fg" },
  { status: "rejected", icon: CircleX, tone: "text-act-fg" },
];
const PAGE_SIZE = 100;

function Column({ status, icon: Icon, tone, onOpen }: { status: SwapStatus; icon: LucideIcon; tone: string; onOpen: (s: SwapItem) => void }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const reduced = useReducedMotionPref();
  const q = useSwaps({ status, page_size: PAGE_SIZE });
  const titleId = `swap-col-${status}`;

  return (
    <section aria-labelledby={titleId} className="glass flex min-h-48 flex-col gap-3 rounded-[var(--radius-card)] p-3" data-testid={`swap-column-${status}`}>
      <h2 id={titleId} className="flex items-center justify-between gap-2 px-1 text-small font-semibold">
        <span className={`inline-flex items-center gap-2 ${tone}`}>
          <Icon aria-hidden className="size-4" />
          {t(`swaps.status.${status}`)}
        </span>
        <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" data-testid={`swap-count-${status}`}>
          {q.data ? formatNumber(q.data.total, digits) : "–"}
        </span>
      </h2>
      {q.isPending ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : q.isError ? (
        <ErrorState compact onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          compact
          illustration="quiet-pulse"
          title={t(`swaps.empty.${status}`)}
          action={{ label: t("swaps.refresh"), icon: RotateCw, onClick: () => void q.refetch() }}
        />
      ) : (
        <motion.ul className="space-y-3" variants={listStagger} initial="hidden" animate="show">
          {q.data.items.map((s) => (
            <motion.li key={s.id} variants={revealVariants(reduced)}>
              <SwapCard swap={s} onOpen={status === "pending" ? () => onOpen(s) : undefined} />
            </motion.li>
          ))}
        </motion.ul>
      )}
      {q.data && q.data.total > q.data.items.length ? (
        <p className="px-1 text-xs text-muted">{t("swaps.more", { shown: q.data.items.length, total: q.data.total })}</p>
      ) : null}
    </section>
  );
}

/** Swap queue (F5): Pending / Approved / Rejected; a pending card opens the handshake (`?swap=` deep link). */
export function SwapsPage() {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const pending = useSwaps({ status: "pending", page_size: PAGE_SIZE });
  const openId = Number(params.get("swap"));
  const open = pending.data?.items.find((s) => s.id === openId) ?? null;

  function setOpen(swap: SwapItem | null): void {
    const next = new URLSearchParams(params);
    if (swap) next.set("swap", String(swap.id));
    else next.delete("swap");
    setParams(next, { replace: true });
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      await exportSwapsCsv();
      toast({ tone: "success", title: t("swaps.exported") });
    } catch {
      toast({ tone: "error", title: t("swaps.exportFailed") });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="swaps-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 font-bold">{t("swaps.title")}</h1>
          <p className="mt-1 text-small text-muted">{t("swaps.lead")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pending.data ? (
            <StatChip icon={Truck} label={t("swaps.vanTrips")} value={formatNumber(pending.data.van_trips_avoided, digits)} />
          ) : null}
          <LiquidButton variant="secondary" icon={Download} loading={exporting} onClick={() => void exportCsv()}>
            {t("swaps.export")}
          </LiquidButton>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <Column key={c.status} {...c} onOpen={setOpen} />
        ))}
      </div>

      <HandshakeDialog swap={open} onClose={() => setOpen(null)} />
    </div>
  );
}

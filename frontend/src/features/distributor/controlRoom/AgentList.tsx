import { FilterX } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { MapAgent } from "../../../api/types";
import { RiskPill } from "../../../components/ui/RiskPill";
import { Skeleton } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/StatePanel";
import { RISK_STYLE } from "../../../components/ui/risk";
import { cn } from "../../../lib/cn";
import { formatPercent } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { useControlRoomStore } from "./controlRoomStore";

export const ROW_H = 68;
const OVERSCAN = 6;
/** Until the list is measured (and in jsdom), assume this much height. */
const FALLBACK_H = 600;

interface AgentListProps {
  agents: MapAgent[];
  status: "pending" | "error" | "ready";
  onRetry: () => void;
  retrying: boolean;
  className?: string;
}

function rowId(id: number): string {
  return `agent-row-${id}`;
}

/** Virtualised list (fixed row height): only rows near the viewport are in the DOM. */
export function AgentList({ agents, status, onRetry, retrying, className }: AgentListProps) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const selectedId = useControlRoomStore((s) => s.selectedId);
  const select = useControlRoomStore((s) => s.select);
  const resetFilters = useControlRoomStore((s) => s.resetFilters);
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(FALLBACK_H);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight || FALLBACK_H));
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  // Keep the selected row in view when it is picked elsewhere (map, palette).
  const selectedIndex = agents.findIndex((a) => a.agent_id === selectedId);
  useEffect(() => {
    const el = ref.current;
    if (!el || selectedIndex < 0) return;
    const top = selectedIndex * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selectedIndex]);

  if (status === "pending") {
    return (
      <div role="status" aria-busy="true" className={cn("space-y-2", className)}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }
  if (status === "error") return <ErrorState compact onRetry={onRetry} retrying={retrying} className={className} />;
  if (agents.length === 0) {
    return (
      <EmptyState
        compact
        className={className}
        title={t("controlRoom.empty.title")}
        body={t("controlRoom.empty.body")}
        action={{ label: t("controlRoom.filters.reset"), icon: FilterX, onClick: resetFilters }}
      />
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const moves: Record<string, number> = { ArrowDown: selectedIndex + 1, ArrowUp: selectedIndex - 1, Home: 0, End: agents.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = agents[Math.min(agents.length - 1, Math.max(0, next))];
    if (target) select(target.agent_id);
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(agents.length, Math.ceil((scrollTop + height) / ROW_H) + OVERSCAN);

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={t("controlRoom.list.label")}
      aria-activedescendant={selectedIndex >= 0 ? rowId(selectedId ?? 0) : undefined}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      data-testid="agent-list"
      className={cn("relative min-h-0 overflow-y-auto rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-pulse", className)}
    >
      <div className="relative" style={{ height: agents.length * ROW_H }}>
        {agents.slice(first, last).map((a, i) => {
          const selected = a.agent_id === selectedId;
          const color = RISK_STYLE[a.level].stroke;
          return (
            <div
              key={a.agent_id}
              id={rowId(a.agent_id)}
              role="option"
              aria-selected={selected}
              onClick={() => select(a.agent_id)}
              data-testid="agent-row"
              data-agent-id={a.agent_id}
              className={cn(
                "absolute inset-x-0 flex cursor-pointer items-center gap-3 rounded-2xl px-3 transition-colors hover:bg-surface-2",
                selected && "bg-surface-2 ring-1 ring-inset ring-pulse",
              )}
              style={{ top: (first + i) * ROW_H, height: ROW_H - 4 }}
            >
              <span
                aria-hidden
                data-testid="agent-dot"
                data-level={a.level}
                className="size-3 shrink-0 rounded-full"
                style={{ background: color, boxShadow: `0 0 10px ${color}` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-semibold">{a.name}</span>
                <span className="num block truncate text-xs text-muted">
                  {a.code} · {a.upazila ? `${a.upazila}, ` : ""}
                  {a.district}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <RiskPill level={a.level} size="sm" />
                <span className="num text-xs text-muted">{formatPercent(a.probability, digits)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

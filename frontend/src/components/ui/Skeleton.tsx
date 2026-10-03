import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";

/** One brand-tinted shimmer block. Compose these into the shape of the final content. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{ ...style, background: "var(--skeleton-base)" }}
      className={cn("relative block overflow-hidden rounded-xl", className)}
    >
      <span
        className="ap-loop ap-shimmer absolute inset-0"
        style={{ background: "linear-gradient(90deg, transparent, var(--skeleton-shine), transparent)" }}
      />
    </span>
  );
}

function Loading({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={className}>
      {children}
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Loading className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? "62%" : "100%" }} />
      ))}
    </Loading>
  );
}

/** Shaped like a VesselGauge card: title, tall vessel, figure. */
export function SkeletonGauge({ className }: { className?: string }) {
  return (
    <Loading className={cn("ap-card p-4", className)}>
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="mt-3 h-40 rounded-[28px]" />
      <Skeleton className="mt-3 h-6 w-28" />
    </Loading>
  );
}

/** Shaped like a RunwayStrip: ribbon row, band, axis. */
export function SkeletonRunway({ className }: { className?: string }) {
  return (
    <Loading className={cn("ap-card p-4", className)}>
      <div className="flex gap-2">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-36" />
      <div className="mt-2 flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-2.5 w-6" />
        ))}
      </div>
    </Loading>
  );
}

/** Shaped like a titled panel with label / value rows (admin and settings sections). */
export function SkeletonPanel({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Loading className={cn("ap-card p-5", className)}>
      <Skeleton className="h-6 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

/** Shaped like a CountdownCard / BentoTile. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Loading className={cn("ap-card p-5", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="size-14 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-11 w-full rounded-xl" />
    </Loading>
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Loading className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-3.5" style={{ width: `${60 + ((r * 7 + c * 13) % 40)}%` }} />
          ))}
        </div>
      ))}
    </Loading>
  );
}

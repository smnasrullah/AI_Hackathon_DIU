import { AlertTriangle, Check, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useMarkNotificationRead } from "../../api/hooks/notifications";
import type { NotificationItem } from "../../api/types";
import { TimeText } from "../../components/ui/TimeText";
import { toast } from "../../components/ui/toastStore";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { useNow } from "../../lib/useNow";
import { listStagger, revealVariants } from "../../styles/motion";
import { useAuthStore } from "../auth/authStore";
import { groupByDay, notificationLink, notificationText } from "./notificationModel";

const SEVERITY: Record<NotificationItem["severity"], { icon: LucideIcon; tone: string }> = {
  info: { icon: Info, tone: "text-pulse-fg bg-pulse/10" },
  warning: { icon: AlertTriangle, tone: "text-watch-fg bg-watch/15" },
  critical: { icon: OctagonAlert, tone: "text-act-fg bg-act/12" },
};

function Row({ item, onOpen }: { item: NotificationItem; onOpen?: () => void }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const role = useAuthStore((s) => s.user?.role ?? "agent");
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const reduced = useReducedMotionPref();
  const { icon: Icon, tone } = SEVERITY[item.severity];
  const unread = item.read_at === null;
  const link = notificationLink(item, role);
  const text = notificationText(item, lang, digits);

  function read(): void {
    if (unread) markRead.mutate(item.id, { onError: () => toast({ tone: "error", title: t("inbox.failed") }) });
  }

  function open(): void {
    read();
    if (link) {
      onOpen?.();
      navigate(link);
    }
  }

  return (
    <motion.li variants={revealVariants(reduced)} className="group relative flex gap-3 rounded-xl px-3 py-3 hover:bg-surface-2" data-testid="notification-row" data-unread={unread}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone)}>
        <Icon aria-hidden className="size-4" />
        <span className="sr-only">{t(`inbox.severity.${item.severity}`)}</span>
      </span>
      <div className="min-w-0 flex-1">
        {link ? (
          <button type="button" onClick={open} className="text-left text-small font-semibold after:absolute after:inset-0">
            {text}
          </button>
        ) : (
          <p className="text-small font-semibold">{text}</p>
        )}
        <p className="mt-0.5 text-xs text-muted" title={formatDateTime(new Date(item.created_at), lang, digits)}>
          <TimeText at={item.created_at} mode="relative" />
        </p>
      </div>
      {unread ? (
        <div className="relative z-10 flex items-start gap-1">
          <span className="mt-1.5 size-2 rounded-full bg-pulse" aria-hidden />
          <button
            type="button"
            onClick={read}
            aria-label={`${t("inbox.markRead")}: ${text}`}
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
          >
            <Check aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </motion.li>
  );
}

/** Day-grouped notification rows (bell panel and /notifications). */
export function NotificationList({ items, onOpen }: { items: NotificationItem[]; onOpen?: () => void }) {
  const { t } = useTranslation();
  const { lang, digits } = useLocale();
  const now = useNow(60_000);
  const groups = groupByDay(items, now);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const label =
          g.day === "today" || g.day === "yesterday"
            ? t(`inbox.${g.day}`)
            : formatDateTime(new Date(`${g.day}T12:00:00+06:00`), lang, digits).split(",")[0];
        return (
          <section key={g.day} aria-label={label}>
            <h3 className="px-3 pb-1 font-mono text-xs uppercase tracking-[0.14em] text-muted">{label}</h3>
            <motion.ul variants={listStagger} initial="hidden" animate="show" className="space-y-0.5">
              {g.items.map((item) => (
                <Row key={item.id} item={item} onOpen={onOpen} />
              ))}
            </motion.ul>
          </section>
        );
      })}
    </div>
  );
}

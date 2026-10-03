import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ModelCard } from "../../api/types";
import { TimeText } from "../../components/ui/TimeText";
import { cn } from "../../lib/cn";
import { formatNumber, localizeDigits } from "../../lib/format";
import { useReducedMotionPref } from "../../lib/motionPrefs";
import { useLocale } from "../../lib/prefs";
import { DUR, tween } from "../../styles/motion";

function Item({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId();
  const reduced = useReducedMotionPref();
  return (
    <li className="border-b border-line last:border-b-0">
      <h3>
        <button
          type="button"
          id={`${id}-btn`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-semibold hover:bg-surface-2"
        >
          {title}
          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-btn`}
            initial={{ opacity: 0, y: reduced ? 0 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={tween(reduced ? DUR.fast : DUR.base)}
            className="px-4 pb-4 text-small"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-muted">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ul>
  );
}

type Section = "models" | "intended" | "outOfScope" | "limits" | "data" | "oversight";

/** Model card (server text in bn/en) as an accordion; the models section starts open. */
export function ModelCardAccordion({ card }: { card: ModelCard }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const [open, setOpen] = useState<Set<Section>>(() => new Set(["models"]));
  const toggle = (s: Section) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const d = card.data;

  return (
    <ul className="overflow-hidden ap-card" data-testid="model-card">
      <Item title={t("rai.card.models")} open={open.has("models")} onToggle={() => toggle("models")}>
        <ul className="space-y-3">
          {card.models.map((m) => (
            <li key={`${m.name}-${m.version}`} className="rounded-2xl border border-line p-3">
              <p className="font-semibold">{m.name}</p>
              <p className="num text-xs text-muted">
                {m.kind} · {m.version} · <TimeText at={m.trained_at} mode="datetime" />
              </p>
              <p className="mt-1 text-muted">{m.purpose}</p>
              {Object.keys(m.metrics).length ? (
                <dl className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(m.metrics).map(([k, v]) => (
                    <div key={k} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                      <dt className="inline text-muted">{k.replace(/_/g, " ")} </dt>
                      <dd className="num inline font-semibold">{formatNumber(v, digits, { fraction: 3 })}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      </Item>
      <Item title={t("about.intended")} open={open.has("intended")} onToggle={() => toggle("intended")}>
        <Bullets items={card.intended_use} />
      </Item>
      <Item title={t("about.outOfScope")} open={open.has("outOfScope")} onToggle={() => toggle("outOfScope")}>
        <Bullets items={card.out_of_scope} />
      </Item>
      <Item title={t("about.limitsTitle")} open={open.has("limits")} onToggle={() => toggle("limits")}>
        <Bullets items={card.limitations} />
      </Item>
      <Item title={t("rai.card.data")} open={open.has("data")} onToggle={() => toggle("data")}>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {(
            [
              [t("rai.card.source"), d.source],
              [t("about.seed"), d.seed === null ? "–" : String(d.seed)],
              [t("about.dataWindow"), d.start && d.end ? `${d.start} – ${d.end}` : "–"],
              [t("about.holdout"), d.holdout_start ?? "–"],
              [t("rai.card.size"), t("rai.card.sizeValue", { agents: d.n_agents, distributors: d.n_distributors })],
              [t("about.dataVersion"), d.data_version ?? "–"],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right font-semibold">{localizeDigits(v, digits)}</dd>
            </div>
          ))}
        </dl>
      </Item>
      <Item title={t("rai.card.oversight")} open={open.has("oversight")} onToggle={() => toggle("oversight")}>
        <p className="text-muted">{card.human_oversight}</p>
      </Item>
    </ul>
  );
}

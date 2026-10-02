import { BadgeCheck, FlaskConical, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useReducedMotionPref } from "../../lib/motionPrefs";
import { listStagger, revealVariants } from "../../styles/motion";

type Item = "advisory" | "synthetic" | "numbers" | "explained";

const ITEMS: { key: Item; icon: LucideIcon }[] = [
  { key: "advisory", icon: ShieldCheck },
  { key: "synthetic", icon: FlaskConical },
  { key: "numbers", icon: BadgeCheck },
  { key: "explained", icon: Scale },
];

/** Responsible-AI promises in one calm band. */
export function RaiStrip() {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  return (
    <section aria-labelledby="rai-title" className="border-y border-line bg-surface-2/60 px-4 py-12 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 id="rai-title" className="font-display text-h2 font-bold">
          {t("landing.rai.title")}
        </h2>
        <motion.ul
          variants={listStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {ITEMS.map(({ key, icon: Icon }) => (
            <motion.li key={key} variants={revealVariants(reduced)} className="flex gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-safe/12 text-safe-fg">
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{t(`landing.rai.${key}Title`)}</h3>
                <p className="mt-1 text-small text-muted">{t(`landing.rai.${key}Body`)}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

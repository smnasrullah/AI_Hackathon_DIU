import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { localizeDigits } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { cn } from "../../lib/cn";
import type { Crumb } from "./nav";

export function Breadcrumbs({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={t("shell.breadcrumbs")} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-small text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const label = `${t(`page.${c.page}`)}${c.id ? ` #${localizeDigits(c.id, digits)}` : ""}`;
          return (
            <li key={c.to} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" /> : null}
              {last ? (
                <span aria-current="page" className="truncate font-semibold text-fg">
                  {label}
                </span>
              ) : (
                <Link to={c.to} className="truncate rounded-md px-1 hover:text-fg">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

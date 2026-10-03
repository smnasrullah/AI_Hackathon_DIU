import * as Popover from "@radix-ui/react-popover";
import { Check, Columns3 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OPTIONAL_COLUMNS, type OptionalColumn } from "./agentsTableModel";

interface ColumnChooserProps {
  hidden: OptionalColumn[];
  onChange: (hidden: OptionalColumn[]) => void;
}

/** Show or hide the optional columns (agent and risk always stay). */
export function ColumnChooser({ hidden, onChange }: ColumnChooserProps) {
  const { t } = useTranslation();
  function toggle(col: OptionalColumn): void {
    onChange(hidden.includes(col) ? hidden.filter((c) => c !== col) : [...hidden, col]);
  }
  return (
    <Popover.Root>
      <Popover.Trigger
        data-testid="column-chooser"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-small font-semibold hover:bg-surface-2"
      >
        <Columns3 aria-hidden className="size-4" />
        {t("agentsTable.columns")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t("agentsTable.columnsHint")}
          className="ap-sheet z-(--z-overlay) w-56 ap-card p-2 text-fg shadow-lift"
        >
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("agentsTable.columnsHint")}</p>
          <ul>
            {OPTIONAL_COLUMNS.map((col) => {
              const on = !hidden.includes(col);
              return (
                <li key={col}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-small hover:bg-surface-2">
                    <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(col)} />
                    <span className="grid size-5 place-items-center rounded-md border border-line-strong peer-checked:border-pulse peer-checked:bg-pulse peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-pulse">
                      {on ? <Check aria-hidden className="size-3.5" /> : null}
                    </span>
                    {t(`agentsTable.col.${col}`)}
                  </label>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

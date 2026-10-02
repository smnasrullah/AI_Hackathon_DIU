import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { SHORTCUTS, type Shortcut } from "./shortcuts";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {keys.map((k) => (
        <kbd key={k} className="num min-w-7 rounded-lg border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center text-xs">
          {k}
        </kbd>
      ))}
    </span>
  );
}

function isSequence(keys: Shortcut["keys"]): keys is [string[], string[]] {
  return Array.isArray(keys[0]);
}

/** Keyboard shortcut table, shared by the "?" dialog and /help. */
export function ShortcutList({ includeSidebar = true }: { includeSidebar?: boolean }) {
  const { t } = useTranslation();
  return (
    <dl className="divide-y divide-line">
      {SHORTCUTS.filter((s) => includeSidebar || !s.sideOnly).map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-small">{t(`shortcuts.${s.label}`)}</dt>
          <dd className="flex items-center gap-1.5 text-xs text-muted">
            {isSequence(s.keys) ? (
              s.keys.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 ? <span>{t("shortcuts.then")}</span> : null}
                  <Keys keys={part} />
                </Fragment>
              ))
            ) : (
              <Keys keys={s.keys} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

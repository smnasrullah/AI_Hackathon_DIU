import { MessageCircleQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCopilotSuggestions } from "../../../api/hooks/copilot";
import { useLocale } from "../../../lib/prefs";

/**
 * Suggested questions for the current language. Quiet by design: nothing renders while loading
 * or when the call fails. `onPick` gets the suggestion text exactly as served (replay matches
 * exact text only), never trimmed or translated.
 */
export function SuggestionChips({ onPick, disabled = false }: { onPick: (question: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const q = useCopilotSuggestions(lang);
  const items = q.data?.items ?? [];
  if (q.isError || items.length === 0) return null;

  return (
    <div role="group" aria-label={t("copilot.suggestions")} data-testid="copilot-suggestions" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => onPick(item)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-left text-small font-semibold text-fg hover:bg-surface-3 disabled:opacity-50"
        >
          <MessageCircleQuestion aria-hidden className="size-4 shrink-0 text-pulse-fg" />
          {item}
        </button>
      ))}
    </div>
  );
}

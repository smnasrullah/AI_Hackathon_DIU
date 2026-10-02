import { FileText, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { streamCopilotChat } from "../../../api/services/copilot";
import type { GeneratedBy } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { cn } from "../../../lib/cn";
import { useLocale } from "../../../lib/prefs";
import { SuggestionChips } from "./SuggestionChips";

interface Turn {
  id: number;
  question: string;
  answer: string;
  generatedBy: GeneratedBy | null;
  state: "pending" | "done" | "failed";
}

const MAX_CHARS = 500;

/** Agent Copilot: ask about your own floats in Bangla or English. Advisory language only. */
export function CopilotPage() {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const busy = turns.some((x) => x.state === "pending");

  useEffect(() => () => abort.current?.abort(), []);

  function update(id: number, patch: Partial<Turn>): void {
    setTurns((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  /** Sends `question` exactly as given (suggestion chips rely on exact-text replay). */
  function ask(question: string): void {
    if (busy || question.length === 0) return;
    const id = nextId.current++;
    setTurns((all) => [...all, { id, question, answer: "", generatedBy: null, state: "pending" }]);
    abort.current = new AbortController();
    streamCopilotChat(
      { message: question, lang },
      {
        onDraft: (draft) => update(id, { answer: draft }),
        onDone: (reply) => update(id, { answer: reply.answer.text, generatedBy: reply.answer.generated_by, state: "done" }),
      },
      abort.current.signal,
    ).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      update(id, { state: "failed" });
    });
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    const typed = text.trim();
    if (!typed) return;
    setText("");
    ask(typed);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-h1 font-bold">{t("copilot.title")}</h1>
        <p className="mt-1 text-small text-muted">{t("copilot.lead")}</p>
      </header>

      {turns.length > 0 ? (
        <ol aria-live="polite" className="space-y-3" data-testid="copilot-log">
          {turns.map((x) => (
            <li key={x.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand/15 px-4 py-2 text-body" data-testid="copilot-question">
                {x.question}
              </p>
              <div className="max-w-[92%] rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-soft">
                {x.state === "failed" ? (
                  <p className="text-small text-act-fg">
                    {t("copilot.failed")}{" "}
                    <button type="button" onClick={() => ask(x.question)} disabled={busy} className="font-semibold underline disabled:opacity-50">
                      {t("common.retry")}
                    </button>
                  </p>
                ) : (
                  <p className={cn("whitespace-pre-line text-body", x.state === "pending" && "text-muted")}>{x.answer || t("copilot.thinking")}</p>
                )}
                {x.generatedBy ? <WordingLabel by={x.generatedBy} /> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <SuggestionChips onPick={ask} disabled={busy} />

      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor="copilot-input" className="sr-only">
          {t("copilot.inputLabel")}
        </label>
        <input
          id="copilot-input"
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("copilot.placeholder")}
          autoComplete="off"
          className="min-h-11 w-full rounded-[var(--radius-input)] border border-line-strong bg-bg px-3 text-body outline-none focus:border-pulse"
        />
        <LiquidButton type="submit" icon={Send} disabled={busy || text.trim().length === 0} loading={busy}>
          {t("copilot.send")}
        </LiquidButton>
      </form>
    </div>
  );
}

function WordingLabel({ by }: { by: GeneratedBy }) {
  const { t } = useTranslation();
  const Icon = by === "template" ? FileText : Sparkles;
  return (
    <span
      data-generated-by={by}
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        by === "template" ? "bg-surface-2 text-muted" : "bg-brand/20 text-fg",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`why.${by}`)}
    </span>
  );
}

import { Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { streamCopilotChat } from "../../../api/services/copilot";
import { CopilotSheet } from "../../../components/signature/CopilotSheet";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { useLocale } from "../../../lib/prefs";
import { AnswerCard, type Turn } from "./AnswerCard";
import { MicButton } from "./MicButton";
import { SuggestionChips } from "./SuggestionChips";
import { useSpeechInput } from "./useSpeechInput";

const MAX_CHARS = 500;

/** Agent Copilot: ask about your own floats in Bangla or English, by text or voice. Advisory language only. */
export function CopilotPage() {
  const { t } = useTranslation();
  const { lang } = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const busy = turns.some((x) => x.state === "pending");
  const hear = useCallback((heard: string) => setText(heard.slice(0, MAX_CHARS)), []);
  const speech = useSpeechInput(lang, hear);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = log.current?.parentElement;
    if (el && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight });
  }, [turns]);
  useEffect(() => {
    if (speech.problem === "unsupported" || speech.problem === "denied") input.current?.focus();
  }, [speech.problem]);

  function update(id: number, patch: (x: Turn) => Partial<Turn>): void {
    setTurns((all) => all.map((x) => (x.id === id ? { ...x, ...patch(x) } : x)));
  }

  /** Sends `question` exactly as given (suggestion chips rely on exact-text replay). */
  function ask(question: string): void {
    if (busy || question.length === 0) return;
    speech.stop();
    const id = nextId.current++;
    setTurns((all) => [...all, { id, question, meta: null, draft: "", streamed: "", final: null, state: "pending" }]);
    abort.current = new AbortController();
    streamCopilotChat(
      { message: question, lang },
      {
        onMeta: (meta) => update(id, () => ({ meta })),
        onDraft: (draft) => update(id, () => ({ draft })),
        onDelta: (part) => update(id, (x) => ({ streamed: x.streamed + part })),
        onDone: (reply) => update(id, () => ({ meta: reply, final: reply.answer, state: "done" })),
      },
      abort.current.signal,
    ).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      update(id, () => ({ state: "failed" }));
    });
  }

  function retry(turn: Turn): void {
    setTurns((all) => all.filter((x) => x.id !== turn.id));
    ask(turn.question);
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    const typed = text.trim();
    if (!typed) return;
    setText("");
    ask(typed);
  }

  const notice = (
    <p data-testid="copilot-notice" className="flex items-start gap-2 text-small">
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-safe-fg" />
      {t("copilot.notice")}
    </p>
  );

  const composer = (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex items-end gap-2">
        <MicButton listening={speech.listening} problem={speech.problem} disabled={busy} onStart={speech.start} onStop={speech.stop} />
        <label htmlFor="copilot-input" className="sr-only">
          {t("copilot.inputLabel")}
        </label>
        <input
          ref={input}
          id="copilot-input"
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(speech.listening ? "copilot.mic.listening" : "copilot.placeholder")}
          autoComplete="off"
          className="min-h-11 w-full min-w-0 rounded-[var(--radius-input)] border border-line-strong bg-bg px-3 text-body outline-none focus:border-pulse"
        />
        <LiquidButton type="submit" icon={Send} disabled={busy || text.trim().length === 0} loading={busy}>
          {t("copilot.send")}
        </LiquidButton>
      </div>
      <p aria-live="polite" data-testid="copilot-mic-status" className="min-h-4 text-xs text-muted">
        {speech.listening ? t("copilot.mic.listening") : speech.problem ? t(`copilot.mic.${speech.problem}`) : ""}
      </p>
    </form>
  );

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        <header>
          <h1 className="font-display text-h1 font-bold">{t("copilot.title")}</h1>
          <p className="mt-1 text-small text-muted">{t("copilot.lead")}</p>
        </header>
        <SuggestionChips onPick={ask} disabled={busy} />
      </div>

      <CopilotSheet label={t("copilot.sheet")} header={notice} footer={composer}>
        <div ref={log}>
          {turns.length === 0 ? (
            <p className="text-small text-muted">{t("copilot.empty")}</p>
          ) : (
            <ol aria-live="polite" className="space-y-3" data-testid="copilot-log">
              {turns.map((x) => (
                <li key={x.id} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand/15 px-4 py-2 text-body" data-testid="copilot-question">
                    {x.question}
                  </p>
                  <AnswerCard turn={x} onRetry={() => retry(x)} retryDisabled={busy} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </CopilotSheet>
    </div>
  );
}

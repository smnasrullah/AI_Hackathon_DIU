import { useCallback, useEffect, useRef, useState } from "react";

import type { Lang } from "../../../api/types";

// The Web Speech API is not in lib.dom for every browser; type only what is used here.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultEvent {
  readonly results: { readonly length: number; [index: number]: SpeechResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

export type SpeechProblem = "unsupported" | "denied" | "noSpeech" | "failed";

export const SPEECH_LANG: Record<Lang, string> = { bn: "bn-BD", en: "en-US" };

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function problemOf(code: string): SpeechProblem | null {
  if (code === "aborted") return null;
  if (code === "not-allowed" || code === "service-not-allowed") return "denied";
  if (code === "no-speech") return "noSpeech";
  return "failed";
}

/**
 * Voice to text in bn-BD or en-US via the browser's Web Speech API. Where it is missing or blocked,
 * `problem` says why and typing stays the way in. The text only fills the input; it is never sent on its own.
 */
export function useSpeechInput(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const rec = useRef<Recognition | null>(null);
  const textRef = useRef(onText);

  useEffect(() => {
    textRef.current = onText;
  }, [onText]);
  useEffect(() => () => rec.current?.abort(), []);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setProblem("unsupported");
      return;
    }
    rec.current?.abort();
    const r = new Ctor();
    r.lang = SPEECH_LANG[lang];
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i]?.[0]?.transcript ?? "";
      textRef.current(text.trim());
    };
    r.onerror = (e) => {
      setProblem(problemOf(e.error));
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setProblem(null);
    try {
      r.start();
      setListening(true);
    } catch {
      setProblem("failed");
    }
  }, [lang]);

  return { listening, problem, start, stop, supported: recognitionCtor() !== null };
}

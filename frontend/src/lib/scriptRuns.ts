// Bengali script (U+0980..U+09FF, plus ZWNJ/ZWJ inside words and the danda । ॥ that ends Bangla
// sentences). Neighbouring Bangla words with the spaces, digits and punctuation between them form one
// run, so a run is a phrase, never a character: Bangla glyph clusters are never split.
const LETTER = "(?:[\\u0980-\\u09FF\\u0964\\u0965]|\\u200C|\\u200D)";
const GLUE = "[\\s0-9.,:;!?'\"()%/\\-\\u2013\\u2014]";
const BN_RUN = new RegExp(`${LETTER}+(?:${GLUE}+${LETTER}+)*`, "gu");
const HAS_BN = /[ঀ-৿]/u;

export interface ScriptRun {
  text: string;
  bn: boolean;
}

export function hasBangla(text: string): boolean {
  return HAS_BN.test(text);
}

/** The text cut into Bangla and non-Bangla runs; joined back, it is the input unchanged. */
export function scriptRuns(text: string): ScriptRun[] {
  const out: ScriptRun[] = [];
  let at = 0;
  for (const m of text.matchAll(BN_RUN)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ text: text.slice(at, start), bn: false });
    out.push({ text: m[0], bn: true });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), bn: false });
  return out;
}

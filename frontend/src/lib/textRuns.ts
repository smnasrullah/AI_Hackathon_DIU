// Bangla is shaped per glyph cluster: a vowel sign or hasanta (্) rendered on its own gets a
// dotted circle (◌). Never split display text per character or code point; animate digits only.

const RUNS = /[0-9০-৯]|[^0-9০-৯]+/gu;
const DIGIT = /^[0-9০-৯]$/u;

export interface TextRun {
  text: string;
  digit: boolean;
}

/** Single digits (Latin or Bangla) and whole non-digit runs, so no glyph cluster is ever broken. */
export function digitRuns(text: string): TextRun[] {
  return Array.from(text.matchAll(RUNS), ([run]) => ({ text: run, digit: DIGIT.test(run) }));
}

// Initials by grapheme cluster, never by code point: "ক্ষমা" starts with ক্ষ (ক + ্ + ষ), not ক.

const VIRAMA = "্";
const BN_CONSONANT = /^[ক-হৎড়-য়ৰৱ]$/u;
// Vowel signs and other marks that belong to the letter before them, plus ZWNJ / ZWJ.
const BN_SIGN = /^[ঁ-ঃ়া-ৄেৈো-ৌৗৢৣ]$/u;
const JOINERS = new Set(["‌", "‍"]);
const BN_MARK = { test: (ch: string): boolean => BN_SIGN.test(ch) || JOINERS.has(ch) };

function segments(word: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(word), (s) => s.segment);
  }
  // No Segmenter: code points, with marks glued to the letter before them.
  const out: string[] = [];
  for (const ch of word) {
    if (out.length > 0 && (BN_MARK.test(ch) || ch === VIRAMA)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/**
 * First letter of a word as a whole cluster, vowel signs included ("কামাল" -> "কা"). Some engines
 * end the cluster at the virama, so a conjunct is rebuilt by hand: virama + consonant (+ marks)
 * after it stay in the same initial ("ষ্ট্রিট" -> "ষ্ট্রি").
 */
export function firstLetter(word: string): string {
  const parts = segments(word);
  let letter = parts[0] ?? "";
  for (const next of parts.slice(1)) {
    const head = Array.from(next)[0] ?? "";
    const joinsConjunct = letter.endsWith(VIRAMA) && BN_CONSONANT.test(head);
    if (!joinsConjunct && head !== VIRAMA && !BN_MARK.test(head)) break;
    letter += next;
  }
  return letter;
}

/** Up to two initials (first and last word), uppercased for Latin; "?" when there is no name. */
export function getInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/u).filter(Boolean);
  const picked = words.length > 1 ? [words[0] ?? "", words[words.length - 1] ?? ""] : words;
  return picked.map(firstLetter).join("").toUpperCase() || "?";
}

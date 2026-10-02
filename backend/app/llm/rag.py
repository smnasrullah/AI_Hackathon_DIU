"""Liquidity Playbook retrieval (RAG) over app/llm/knowledge/*.md.

Each file is one doc with a parallel `# en: <title>` and `# bn: <title>` section; paragraphs are
the passages. One TF-IDF index over character n-grams (Bangla needs no tokenizer) holds both
languages; a hit is returned in the answer language, so a Bangla question can cite the English
doc and vice versa. Built once per process, in memory, no extra services.
"""

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer

from app.models.enums import Lang

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
TOP_K = 3
MIN_SCORE = 0.12  # below this a passage is not considered relevant
_HEAD = re.compile(r"^#\s*(en|bn)\s*:\s*(.+?)\s*$")


@dataclass(frozen=True)
class Passage:
    slug: str
    title: str
    lang: Lang
    idx: int
    text: str


@dataclass(frozen=True)
class Hit:
    passage: Passage
    score: float


def parse(path: Path) -> list[Passage]:
    slug = path.stem.split("-", 1)[-1]
    out: list[Passage] = []
    lang: Lang | None = None
    title = ""
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8")):
        lines = block.strip().splitlines()
        if lines and (m := _HEAD.match(lines[0])):
            lang, title = Lang(m.group(1)), m.group(2)
            lines = lines[1:]
        text = " ".join(x.strip() for x in lines if x.strip())
        if text and lang is not None:
            idx = sum(1 for p in out if p.lang is lang)
            out.append(Passage(slug, title, lang, idx, text))
    return out


def load(directory: Path = KNOWLEDGE_DIR) -> list[Passage]:
    return [p for f in sorted(directory.glob("*.md")) for p in parse(f)]


@dataclass(frozen=True)
class _Index:
    passages: list[Passage]
    vectorizer: TfidfVectorizer
    matrix: csr_matrix

    def find(self, slug: str, lang: Lang, idx: int) -> Passage | None:
        same = [p for p in self.passages if p.slug == slug and p.lang is lang]
        return next((p for p in same if p.idx == idx), same[0] if same else None)


@lru_cache(maxsize=1)
def _index() -> _Index:
    passages = load()
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True)
    matrix = vectorizer.fit_transform([f"{p.title}. {p.text}" for p in passages])
    return _Index(passages, vectorizer, csr_matrix(matrix))


def search(query: str, lang: Lang, k: int = TOP_K) -> list[Hit]:
    """Top-k passages (answer language), best first; empty when nothing reaches MIN_SCORE."""
    index = _index()
    scores = (index.matrix @ index.vectorizer.transform([query]).T).toarray().ravel()
    hits: list[Hit] = []
    seen: set[tuple[str, int]] = set()
    for i in scores.argsort()[::-1]:
        score = float(scores[i])
        if score < MIN_SCORE or len(hits) >= k:
            break
        src = index.passages[i]
        p = index.find(src.slug, lang, src.idx)
        if p is not None and (p.slug, p.idx) not in seen:
            seen.add((p.slug, p.idx))
            hits.append(Hit(p, round(score, 3)))
    return hits


def top_score(query: str) -> float:
    index = _index()
    scores = index.matrix @ index.vectorizer.transform([query]).T
    return float(scores.max()) if scores.nnz else 0.0

// Minimal Markdown -> block model for docs we ship ourselves (headings, tables, lists,
// paragraphs, code fences; inline `code`, **bold**). Rendered as React text nodes, never as HTML.

export type Inline = { kind: "text" | "code" | "bold"; text: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: Inline[]; id: string }
  | { kind: "paragraph"; text: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "code"; text: string };

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function slug(text: string): string {
  return (
    "md-" +
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

const LIST = /^\s*(?:[-*]|\d+\.)\s+/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) body.push(lines[i++] ?? "");
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const text = (h[2] ?? "").trim();
      blocks.push({ kind: "heading", level: (h[1]?.length ?? 1) as 1 | 2 | 3, text: parseInline(text), id: slug(text) });
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) rows.push(cells(lines[i++] ?? ""));
      const [head = [], ...rest] = rows;
      const body = rest.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      blocks.push({ kind: "table", header: head.map(parseInline), rows: body.map((r) => r.map(parseInline)) });
      continue;
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: Inline[][] = [];
      while (i < lines.length && LIST.test(lines[i] ?? "")) {
        let item = (lines[i++] ?? "").replace(LIST, "");
        // Indented continuation lines belong to the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? "") && !LIST.test(lines[i] ?? "")) item += " " + (lines[i++] ?? "").trim();
        items.push(parseInline(item));
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim() === "" || /^#{1,3}\s/.test(l) || l.trim().startsWith("|") || l.startsWith("```") || LIST.test(l)) break;
      para.push(l.trim());
      i++;
    }
    blocks.push({ kind: "paragraph", text: parseInline(para.join(" ")) });
  }
  return blocks;
}

import { useMemo } from "react";

import { parseMarkdown, type Block, type Inline } from "./markdown";

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "code" ? (
          <code key={i} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">
            {p.text}
          </code>
        ) : p.kind === "bold" ? (
          <strong key={i}>{p.text}</strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading": {
      const cls = b.level === 1 ? "font-display text-h2 font-bold" : b.level === 2 ? "mt-6 font-display text-xl font-bold" : "mt-4 font-semibold";
      const Tag = b.level === 1 ? "h3" : b.level === 2 ? "h4" : "h5";
      return (
        <Tag id={b.id} className={cls}>
          <Text parts={b.text} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="mt-2 text-small leading-relaxed">
          <Text parts={b.text} />
        </p>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag className={`mt-2 space-y-1 pl-5 text-small ${b.ordered ? "list-decimal" : "list-disc"}`}>
          {b.items.map((item, i) => (
            <li key={i}>
              <Text parts={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line" tabIndex={0}>
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-surface-2">
              <tr>
                {b.header.map((h, i) => (
                  <th key={i} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold">
                    <Text parts={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-line px-3 py-2 align-top">
                      <Text parts={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return <pre className="mt-3 overflow-x-auto rounded-2xl bg-surface-2 p-3 font-mono text-xs" tabIndex={0}>{b.text}</pre>;
  }
}

/** Our own Markdown docs as plain React nodes (no HTML injection path). */
export function MarkdownDoc({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <article className="max-w-none" data-testid="markdown-doc">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </article>
  );
}

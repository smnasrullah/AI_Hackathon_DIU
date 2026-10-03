import { useParams } from "react-router-dom";

import type { PageDef } from "../../app/routes";

export function PlaceholderPage({ page }: { page: PageDef }) {
  const { id } = useParams();
  return (
    <section className="ap-card p-6 md:p-8">
      <p className="ap-eyebrow">{page.features}</p>
      <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
        {page.title}
        {id ? <span className="font-mono text-2xl text-muted"> #{id}</span> : null}
      </h1>
      <p className="mt-3 max-w-prose text-muted">{page.summary}</p>
      <p className="mt-6 inline-flex rounded-full border border-line px-3 py-1 text-xs text-muted">
        Scaffold — content arrives in a later step
      </p>
    </section>
  );
}

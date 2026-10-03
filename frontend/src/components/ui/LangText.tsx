import { Fragment } from "react";

import { hasBangla, scriptRuns } from "../../lib/scriptRuns";

/**
 * Plain text with every Bangla run wrapped in <span lang="bn">, so the :lang(bn) rules (Bangla font,
 * no letter-spacing, taller lines) apply inside English pages too. Text only: React escapes it, no
 * HTML is ever injected. Runs are whole phrases, never single characters.
 */
export function LangText({ text }: { text: string }) {
  if (!hasBangla(text)) return <>{text}</>;
  return (
    <>
      {scriptRuns(text).map((run, i) =>
        run.bn ? (
          <span key={i} lang="bn">
            {run.text}
          </span>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

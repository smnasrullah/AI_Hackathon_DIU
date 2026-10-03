import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDryRun } from "../../../api/hooks/helpRequests";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { formatMoney, formatNumber } from "../../../lib/format";
import { useLocale } from "../../../lib/prefs";
import { HELP_ADMIN_NS } from "../../../i18n/helpAdmin";

/** Shows who would get a request right now. The server writes and sends nothing for this call. */
export function DryRunPreview() {
  const { t } = useTranslation();
  const { t: th } = useTranslation(HELP_ADMIN_NS);
  const { lang, digits } = useLocale();
  const preview = useDryRun();
  const result = preview.data;

  return (
    <section aria-labelledby="preview-title" className="ap-card space-y-4 p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="preview-title" className="font-display text-h2 font-bold">
            {th("preview.title")}
          </h2>
          <p className="text-small text-muted">{th("preview.lead")}</p>
        </div>
        <LiquidButton variant="secondary" icon={ListChecks} loading={preview.isPending} disabled={preview.isPending} onClick={() => preview.mutate(null)}>
          {th("preview.run")}
        </LiquidButton>
      </div>

      {preview.isError ? (
        <p role="alert" className="text-small font-semibold text-act-fg">
          {th("preview.failed")}
        </p>
      ) : null}

      {result ? (
        <>
          <p role="status" data-testid="preview-summary" className="text-small font-semibold">
            {th("preview.summary", {
              creates: formatNumber(result.would_create, digits),
              asks: formatNumber(result.would_ask, digits),
            })}
          </p>
          {result.items.length === 0 ? (
            <p className="text-small text-muted">{th("preview.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-small" data-testid="preview-table">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">{th("preview.cols.agent")}</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">{th("preview.cols.float")}</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">{th("preview.cols.amount")}</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">{th("preview.cols.asks")}</th>
                    <th scope="col" className="py-2 font-semibold">{th("preview.cols.result")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((row) => (
                    <tr key={`${row.agent_id}-${row.float_type}`} className="border-t border-line align-top">
                      <th scope="row" className="py-2 pr-3 font-semibold">
                        {row.agent_code}
                      </th>
                      <td className="py-2 pr-3">{t(`float.${row.float_type}`)}</td>
                      <td className="num py-2 pr-3">{row.fires ? formatMoney(row.amount_bdt, digits, { lang }) : "—"}</td>
                      <td className="num py-2 pr-3">{row.asks.map((a) => a.display).join(", ") || "—"}</td>
                      <td className="py-2">
                        {row.fires ? th("preview.fires") : th("preview.holds")}
                        {!row.fires && row.reason_summary ? <span className="block text-xs text-muted">{row.reason_summary}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

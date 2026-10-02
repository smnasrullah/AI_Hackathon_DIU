import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FloatType } from "../../../api/types";
import { FloatSwitch } from "../../agent/FloatSwitch";
import { ForecastBody } from "../../agent/forecast/ForecastPage";
import { WhatIfBody } from "../../agent/whatif/WhatIfPage";

interface ForecastTabProps {
  agentId: number;
  floatType: FloatType;
  onFloatChange: (next: FloatType) => void;
}

/** The agent's 72h fan + hourly list, then the what-if simulator for the same float. */
export function ForecastTab({ agentId, floatType, onFloatChange }: ForecastTabProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <FloatSwitch value={floatType} onChange={onFloatChange} />
      <ForecastBody key={`f-${floatType}`} agentId={agentId} floatType={floatType} />
      <section aria-labelledby="detail-whatif" className="space-y-4 border-t border-line pt-4">
        <div>
          <h2 id="detail-whatif" className="font-display text-h2 font-bold">
            {t("whatif.title")}
          </h2>
          <p className="mt-1 text-small text-muted">{t("detail.whatifLead")}</p>
        </div>
        <WhatIfBody key={`w-${floatType}`} agentId={agentId} floatType={floatType} />
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <ShieldCheck aria-hidden className="size-3.5" />
          {t("detail.whatifNotice")}
        </p>
      </section>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { PageHeader } from "../../../components/ui/PageHeader";
import { HelpRequestDetail } from "./HelpRequestDetail";
import { HelpRequestList } from "./HelpRequestList";

/** /distributor/help-requests (list) and /distributor/help-requests/:id (one request). */
export function DistributorHelpPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const requestId = id === undefined ? null : Number(id);

  if (requestId !== null && Number.isInteger(requestId) && requestId > 0) {
    return <HelpRequestDetail id={requestId} />;
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t("liquidity.dist.title")} description={t("liquidity.dist.lead")} />
      <HelpRequestList />
    </div>
  );
}

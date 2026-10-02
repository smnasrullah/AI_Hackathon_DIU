import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuthStore } from "../auth/authStore";

/** Footer on every page: advisory + synthetic-data + privacy notices. */
export function Notices() {
  const { t } = useTranslation();
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-center text-xs text-muted">
      <ShieldCheck aria-hidden className="size-3.5" />
      <span>{t("common.advisory")}</span>
      <span aria-hidden>·</span>
      <span>{t("common.synthetic")}</span>
      <span aria-hidden>·</span>
      <span>{t("footer.privacy")}</span>
      {signedIn ? (
        <>
          <span aria-hidden>·</span>
          <Link to="/about" className="underline underline-offset-2 hover:text-fg">
            {t("footer.methodology")}
          </Link>
        </>
      ) : null}
    </footer>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigation } from "react-router-dom";

import { PulseLine } from "../../components/signature/PulseLine";

const MIN_VISIBLE_MS = 350;

/** PulseLine progress under the top bar: while a route chunk loads, and briefly on every page change. */
export function RouteProgress() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { key } = useLocation();
  const [pulse, setPulse] = useState<string | null>(null);

  useEffect(() => {
    const show = window.setTimeout(() => setPulse(key), 0);
    const hide = window.setTimeout(() => setPulse(null), MIN_VISIBLE_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [key]);

  const busy = navigation.state !== "idle" || pulse !== null;
  return (
    <div aria-hidden={!busy} className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden">
      {busy ? <PulseLine mode="progress" label={t("shell.routeLoading")} /> : null}
    </div>
  );
}

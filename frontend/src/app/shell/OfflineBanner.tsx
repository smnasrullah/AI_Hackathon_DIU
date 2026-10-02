import { useQueryClient } from "@tanstack/react-query";
import { RotateCw, Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReducedMotionPref } from "../../lib/motionPrefs";
import { revealVariants } from "../../styles/motion";

const BACK_ONLINE_MS = 3000;

function readOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** Offline: a calm banner with retry. Back online: refetch what is on screen, say so briefly. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const reduced = useReducedMotionPref();
  const [online, setOnline] = useState(readOnline);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    let timer = 0;
    const goOffline = () => {
      window.clearTimeout(timer);
      setRecovered(false);
      setOnline(false);
    };
    const goOnline = () => {
      setOnline(true);
      setRecovered(true);
      void client.refetchQueries({ type: "active" });
      timer = window.setTimeout(() => setRecovered(false), BACK_ONLINE_MS);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [client]);

  const show = !online || recovered;
  return (
    <div role="status" aria-live="polite">
      <AnimatePresence>
        {show ? (
          <motion.div
            key={online ? "on" : "off"}
            variants={revealVariants(reduced)}
            initial="hidden"
            animate="show"
            exit="hidden"
            className={`flex items-center justify-center gap-2 px-4 py-2 text-small font-semibold ${online ? "border-b border-line bg-surface text-safe-fg" : "bg-watch text-ink-950"}`}
          >
            {online ? <Wifi aria-hidden className="size-4" /> : <WifiOff aria-hidden className="size-4" />}
            <span>{online ? t("shell.backOnline") : t("shell.offline")}</span>
            {online ? null : (
              <button
                type="button"
                onClick={() => void client.refetchQueries({ type: "active" })}
                className="ml-2 inline-flex min-h-8 items-center gap-1 rounded-full border border-ink-950/30 px-3 text-xs"
              >
                <RotateCw aria-hidden className="size-3.5" />
                {t("common.retry")}
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

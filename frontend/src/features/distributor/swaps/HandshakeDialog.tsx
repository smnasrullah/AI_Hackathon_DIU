import * as Dialog from "@radix-ui/react-dialog";
import { Handshake, ShieldCheck, TriangleAlert, X, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDecideSwap } from "../../../api/hooks/swaps";
import type { SwapItem, SwapParty } from "../../../api/types";
import { HoldToApprove } from "../../../components/signature/HoldToApprove";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { MoneyText } from "../../../components/ui/MoneyText";
import { SourceChip } from "../../../components/ui/SourceChip";
import { toast } from "../../../components/ui/toastStore";
import { cn } from "../../../lib/cn";
import { formatNumber, localizeDigits } from "../../../lib/format";
import { useReducedMotionPref } from "../../../lib/motionPrefs";
import { useLocale } from "../../../lib/prefs";
import { DUR, tween } from "../../../styles/motion";
import { errorCode } from "../../../lib/apiError";
import { NOTE_MAX, NOTE_MIN } from "../decisionNote";

const RESPONSE_TONE = { accepted: "font-semibold text-safe-fg", declined: "font-semibold text-act-fg", none: "text-muted" } as const;

function Hand({ party, role, side }: { party: SwapParty; role: "donor" | "receiver"; side: -1 | 1 }) {
  const { t } = useTranslation();
  const reduced = useReducedMotionPref();
  const response = party.response ?? "none";
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: side * 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={tween(DUR.slow)}
      className="min-w-0 rounded-2xl border border-line bg-surface-2 p-3 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t(`swaps.role.${role}`)}</p>
      <p className="mt-1 truncate font-semibold">{party.name}</p>
      <p className="num text-xs text-muted">
        {party.code}
        {party.upazila ? ` · ${party.upazila}` : ""}
      </p>
      <p className={cn("mt-1 text-xs", RESPONSE_TONE[response])}>{t(`swaps.response.${response}`)}</p>
    </motion.div>
  );
}

interface HandshakeDialogProps {
  swap: SwapItem | null;
  onClose: () => void;
}

/** Handshake approval card: both agents, the amount, a required note, then HoldToApprove or reject. */
export function HandshakeDialog({ swap, onClose }: HandshakeDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={swap !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="ap-overlay fixed inset-0 z-50 bg-ink-950/50" />
        <Dialog.Content
          data-testid="handshake"
          className="ap-dialog fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[min(94vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-6 text-fg shadow-lift"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-h2 font-bold">{t("swaps.handshake.title")}</Dialog.Title>
            <Dialog.Close aria-label={t("common.close")} className="-m-2 grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-small text-muted">{t("swaps.handshake.lead")}</Dialog.Description>
          {swap ? <HandshakeBody key={swap.id} swap={swap} onClose={onClose} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HandshakeBody({ swap, onClose }: { swap: SwapItem; onClose: () => void }) {
  const { t } = useTranslation();
  const { digits } = useLocale();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const decide = useDecideSwap();
  const trimmed = note.trim();
  const noteOk = trimmed.length >= NOTE_MIN;
  const declined = swap.donor.response === "declined" || swap.receiver.response === "declined";

  function send(decision: "approve" | "reject"): void {
    decide.mutate(
      { id: swap.id, body: { decision, note: trimmed } },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t(`swaps.done.${decision}`), body: t("swaps.done.body") });
          onClose();
        },
        onError: (err) => {
          const code = errorCode(err);
          const key = code === "already_decided" ? "swaps.error.already" : code === "swap_declined" ? "swaps.error.declined" : "swaps.error.failed";
          toast({ tone: "error", title: t(key) });
          if (code === "already_decided") onClose();
        },
        onSettled: () => setRejecting(false),
      },
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <Hand party={swap.donor} role="donor" side={-1} />
        <span className="grid size-12 place-items-center rounded-full bg-brand/20 text-fg">
          <Handshake aria-hidden className="size-6" />
        </span>
        <Hand party={swap.receiver} role="receiver" side={1} />
      </div>

      <div className="rounded-2xl border border-line p-3 text-center">
        <MoneyText value={swap.amount_bdt} animate className="font-display text-h1 font-bold" />
        <p className="text-small text-muted">
          {t(`float.${swap.float_type}`)} ·{" "}
          <span className="num">{localizeDigits(t("swaps.distance", { km: formatNumber(swap.distance_km, digits, { fraction: 1 }) }), digits)}</span>
          {swap.van_trip_saved ? ` · ${t("swaps.vanSaved")}` : ""}
        </p>
        <div className="mt-2 flex justify-center gap-2">
          <SourceChip source="model" />
          <SourceChip source="rule" />
        </div>
      </div>

      {declined ? (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-act/12 p-3 text-small text-act-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("swaps.handshake.declined")}
        </p>
      ) : null}

      <div>
        <label htmlFor={noteId} className="text-small font-semibold">
          {t("dialog.note")}
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("dialog.notePlaceholder")}
          rows={3}
          aria-describedby={`${noteId}-hint`}
          data-testid="handshake-note"
          className="mt-1.5 w-full resize-none rounded-[var(--radius-input)] border border-line-strong bg-bg px-3 py-2 text-body outline-none focus:border-pulse"
        />
        <p id={`${noteId}-hint`} className="mt-1 text-xs text-muted">
          {t("dialog.noteHint", { count: NOTE_MIN })}
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <HoldToApprove onApprove={() => send("approve")} disabled={!noteOk || declined || decide.isPending} label={t("swaps.handshake.hold")} />
        <LiquidButton variant="ghost" icon={XCircle} disabled={!noteOk || decide.isPending} onClick={() => setRejecting(true)} data-testid="handshake-reject">
          {t("swaps.handshake.reject")}
        </LiquidButton>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="size-3.5" />
        {t("swaps.handshake.notice")}
      </p>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={t("swaps.reject.title")}
        description={t("swaps.reject.body", { donor: swap.donor.name, receiver: swap.receiver.name })}
        confirmLabel={t("swaps.reject.action")}
        tone="danger"
        pending={decide.isPending}
        onConfirm={() => send("reject")}
      />
    </div>
  );
}

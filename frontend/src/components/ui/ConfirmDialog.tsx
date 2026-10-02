import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LiquidButton } from "./LiquidButton";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Require a note (saved to the audit log) of at least this many characters. */
  noteMinLength?: number;
  pending?: boolean;
  onConfirm: (note: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  noteMinLength,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const noteId = useId();
  const needsNote = noteMinLength !== undefined;
  const noteOk = !needsNote || note.trim().length >= noteMinLength;

  function change(next: boolean) {
    if (!next) setNote("");
    onOpenChange(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="ap-overlay fixed inset-0 z-50 bg-ink-950/50" />
        <Dialog.Content className="ap-dialog fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] border border-line bg-surface p-6 text-fg shadow-lift">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-h2 font-bold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={t("common.close")}
              className="-m-2 grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-small text-muted">{description}</Dialog.Description>
          {needsNote ? (
            <div className="mt-4">
              <label htmlFor={noteId} className="text-small font-semibold">
                {t("dialog.note")}
              </label>
              <textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("dialog.notePlaceholder")}
                rows={3}
                aria-describedby={`${noteId}-hint`}
                className="mt-1.5 w-full resize-none rounded-[var(--radius-input)] border border-line-strong bg-bg px-3 py-2 text-body outline-none focus:border-pulse"
              />
              <p id={`${noteId}-hint`} className="mt-1 text-xs text-muted">
                {t("dialog.noteHint", { count: noteMinLength })}
              </p>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <LiquidButton variant="ghost">{cancelLabel ?? t("common.cancel")}</LiquidButton>
            </Dialog.Close>
            <LiquidButton
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={!noteOk}
              loading={pending}
              onClick={() => onConfirm(note.trim())}
            >
              {confirmLabel}
            </LiquidButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

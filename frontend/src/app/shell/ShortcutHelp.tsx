import * as Dialog from "@radix-ui/react-dialog";
import { Keyboard, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ShortcutList } from "./ShortcutList";
import { useShellStore } from "./shellStore";

/** The "?" dialog. */
export function ShortcutHelp({ includeSidebar }: { includeSidebar: boolean }) {
  const { t } = useTranslation();
  const open = useShellStore((s) => s.shortcutsOpen);
  const setOpen = useShellStore((s) => s.setShortcutsOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="ap-overlay fixed inset-0 z-(--z-overlay) bg-ink-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="ap-dialog fixed left-1/2 top-1/2 z-(--z-overlay) w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 ap-card p-6 text-fg shadow-lift"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="flex items-center gap-2 font-display text-h2 font-bold">
              <Keyboard aria-hidden className="size-5 text-muted" />
              {t("shortcuts.title")}
            </Dialog.Title>
            <Dialog.Close aria-label={t("common.close")} className="-m-2 grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          <div className="mt-3">
            <ShortcutList includeSidebar={includeSidebar} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

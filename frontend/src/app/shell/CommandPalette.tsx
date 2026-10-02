import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CircleHelp, FileText, Info, Search, Bell, Settings, Store, UserRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useSearch } from "../../api/hooks/search";
import type { SearchHit } from "../../api/types";
import { PulseLine } from "../../components/signature/PulseLine";
import { useAuthStore } from "../../features/auth/authStore";
import { translateKey } from "../../i18n/dynamic";
import { useDebounced } from "../../lib/useDebounced";
import { navFor, type PageKey } from "./nav";
import { usePageActionsStore } from "./pageActions";
import { useShellStore } from "./shellStore";
import { usePaletteActions } from "./usePaletteActions";

const ITEM =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-small data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50";
const GROUP = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted";

const SHARED: { to: string; page: PageKey; icon: LucideIcon }[] = [
  { to: "/notifications", page: "notifications", icon: Bell },
  { to: "/profile", page: "profile", icon: UserRound },
  { to: "/settings", page: "settings", icon: Settings },
  { to: "/help", page: "help", icon: CircleHelp },
  { to: "/about", page: "about", icon: Info },
];

function hitLabel(hit: SearchHit): string {
  if (hit.kind === "page") return translateKey(hit.title_key ?? "", undefined, hit.key);
  return hit.label ? `${hit.key} · ${hit.label}` : hit.key;
}

/** Ctrl+K: jump to a page or agent (GET /search), or run an action. */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role ?? "agent");
  const open = useShellStore((s) => s.paletteOpen);
  const setOpen = useShellStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), 200);
  const results = useSearch(open ? term : "");
  const pageActions = usePageActionsStore((s) => s.actions);
  const globalActions = usePaletteActions();
  const actions = [...pageActions, ...globalActions];

  function change(next: boolean): void {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(to: string): void {
    change(false);
    navigate(to);
  }

  function run(fn: () => void): void {
    change(false);
    fn();
  }

  const needle = query.trim().toLocaleLowerCase();
  const shownActions = needle ? actions.filter((a) => a.label.toLocaleLowerCase().includes(needle)) : actions;
  const hits = (results.data?.items ?? []).filter((h) => h.path);
  const searching = needle.length > 0 && (results.isFetching || term !== query.trim());

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="ap-overlay fixed inset-0 z-50 bg-ink-950/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="ap-dialog fixed left-1/2 top-[12vh] z-50 w-[min(94vw,36rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-fg shadow-lift"
          data-testid="command-palette"
        >
          <Dialog.Title className="sr-only">{t("palette.title")}</Dialog.Title>
          <Command shouldFilter={false} label={t("palette.title")} loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden className="size-5 text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t("palette.placeholder")}
                className="min-h-14 flex-1 bg-transparent text-body outline-none placeholder:text-muted"
              />
            </div>
            {searching ? <PulseLine mode="progress" label={t("palette.searching")} /> : <div className="h-1" />}
            <Command.List className={`max-h-[min(60vh,26rem)] overflow-y-auto p-2 ${GROUP}`}>
              {needle && results.isError ? <p className="px-3 py-2 text-small text-muted">{t("palette.error")}</p> : null}
              {needle && !searching && hits.length === 0 && shownActions.length === 0 ? (
                <p className="px-3 py-6 text-center text-small text-muted">{t("palette.empty")}</p>
              ) : null}
              {needle ? (
                hits.length > 0 ? (
                  <Command.Group heading={t("palette.results")}>
                    {hits.map((hit) => (
                      <Command.Item key={`${hit.kind}-${hit.key}`} value={`${hit.kind}-${hit.key}`} onSelect={() => go(hit.path ?? "/")} className={ITEM}>
                        {hit.kind === "agent" ? <Store aria-hidden className="size-4 text-muted" /> : <FileText aria-hidden className="size-4 text-muted" />}
                        <span className="min-w-0 flex-1 truncate">{hitLabel(hit)}</span>
                        {hit.sublabel ? <span className="truncate text-xs text-muted">{hit.sublabel}</span> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null
              ) : (
                <Command.Group heading={t("palette.pages")}>
                  {[...navFor(role), ...SHARED].map(({ to, page, icon: Icon }) => (
                    <Command.Item key={to} value={`page-${to}`} onSelect={() => go(to)} className={ITEM}>
                      <Icon aria-hidden className="size-4 text-muted" />
                      {t(`page.${page}`)}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {shownActions.length > 0 ? (
                <Command.Group heading={t("palette.actions")}>
                  {shownActions.map(({ id, label, icon: Icon, run: fn }) => (
                    <Command.Item key={id} value={`action-${id}`} onSelect={() => run(fn)} className={ITEM}>
                      <Icon aria-hidden className="size-4 text-muted" />
                      {label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">{t("palette.hint")}</p>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

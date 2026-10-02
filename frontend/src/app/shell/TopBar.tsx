import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useSavePreferences } from "../../api/hooks/users";
import { PulseLine } from "../../components/signature/PulseLine";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { toast } from "../../components/ui/toastStore";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { cn } from "../../lib/cn";
import { AvatarMenu } from "./AvatarMenu";
import { Breadcrumbs } from "./Breadcrumbs";
import { LanguageSwitch } from "./LanguageSwitch";
import type { Crumb } from "./nav";
import { RouteProgress } from "./RouteProgress";
import { useShellStore } from "./shellStore";

function Brand({ home, compact }: { home: string; compact: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to={home} aria-label={t("shell.home")} data-tour="brand" className="flex shrink-0 items-center gap-2 rounded-xl pr-1">
      <span className="w-12">
        <PulseLine className="h-7" />
      </span>
      <span className={cn("font-display text-lg font-bold", compact && "sr-only sm:not-sr-only")}>AgentPulse</span>
    </Link>
  );
}

interface TopBarProps {
  home: string;
  crumbs: Crumb[];
  /** Agent (mobile, one-thumb) vs Control Room (desktop). */
  compact: boolean;
}

export function TopBar({ home, crumbs, compact }: TopBarProps) {
  const { t } = useTranslation();
  const openPalette = useShellStore((s) => s.setPaletteOpen);
  const save = useSavePreferences();

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className={cn("flex min-h-16 items-center gap-2", compact ? "px-3" : "px-4 md:px-6")}>
        <Brand home={home} compact={compact} />
        {compact ? null : <Breadcrumbs crumbs={crumbs} className="ml-2 hidden flex-1 lg:block" />}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => openPalette(true)}
            aria-label={t("shell.searchHint")}
            aria-keyshortcuts="Control+K"
            data-tour="search"
            data-testid="search-button"
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface text-muted hover:bg-surface-2 hover:text-fg",
              compact ? "w-11 justify-center" : "w-11 justify-center md:w-64 md:justify-start md:px-3",
            )}
          >
            <Search aria-hidden className="size-5 shrink-0" />
            {compact ? null : (
              <>
                <span className="hidden flex-1 text-left text-small md:inline">{t("shell.search")}</span>
                <kbd className="num hidden rounded-md border border-line px-1.5 text-xs md:inline">Ctrl K</kbd>
              </>
            )}
          </button>
          <NotificationBell />
          <LanguageSwitch className={compact ? "px-2.5" : undefined} />
          <ThemeToggle
            className={compact ? "hidden sm:grid" : undefined}
            onSwitch={(theme) => save.mutate({ theme }, { onError: () => toast({ tone: "error", title: t("settings.saveFailed") }) })}
          />
          <AvatarMenu />
        </div>
      </div>
      <RouteProgress />
    </header>
  );
}

import { Monitor, Moon, Route, Sun } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useHelpOptOut, useSetHelpOptOut } from "../../api/hooks/helpRequests";
import { useUpdatePreferences } from "../../api/hooks/users";
import type { PreferencesUpdate } from "../../api/types";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/toastStore";
import { useShellStore } from "../../app/shell/shellStore";
import { cn } from "../../lib/cn";
import { usePrefsStore } from "../../lib/prefs";
import { useAuthStore } from "../auth/authStore";
import type { Lang, Theme } from "../auth/types";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { Section } from "./Section";
import { ThemePreview } from "./ThemePreview";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-small font-semibold">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-line-strong transition-colors",
        checked ? "bg-pulse" : "bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn("size-6 rounded-full bg-white shadow-soft transition-transform", checked ? "translate-x-7" : "translate-x-1")}
      />
    </button>
  );
}

/** Agents only: whether nearby shops may ask me for help (PUT /liquidity-requests/opt-out). */
function HelpOptOutRow() {
  const { t } = useTranslation();
  const q = useHelpOptOut(true);
  const save = useSetHelpOptOut();
  return (
    <Row label={t("settings.helpAllow")} hint={t("settings.helpAllowHint")}>
      {q.isPending ? (
        <span role="status" aria-busy="true">
          <Skeleton className="h-8 w-14 rounded-full" />
          <span className="sr-only">{t("common.loading")}</span>
        </span>
      ) : q.isError ? (
        <span className="flex items-center gap-2 text-xs text-muted">
          {t("settings.helpAllowError")}
          <LiquidButton variant="secondary" size="sm" onClick={() => void q.refetch()}>
            {t("common.retry")}
          </LiquidButton>
        </span>
      ) : (
        <Switch
          label={t("settings.helpAllow")}
          checked={!q.data.opted_out}
          onChange={(allow) =>
            save.mutate(!allow, {
              onSuccess: () => toast({ tone: "success", title: t("settings.saved"), duration: 2500 }),
              onError: () => toast({ tone: "error", title: t("settings.saveFailed") }),
            })
          }
        />
      )}
    </Row>
  );
}

/** Language, digits, theme (live preview), notifications, help requests (agents), tour replay,
 * password. Saved to the profile. */
export function SettingsPage() {
  const { t } = useTranslation();
  const headingId = useId();
  const lang = usePrefsStore((s) => s.lang);
  const digits = usePrefsStore((s) => s.digits);
  const theme = usePrefsStore((s) => s.theme);
  const user = useAuthStore((s) => s.user);
  const save = useUpdatePreferences();

  function set(body: PreferencesUpdate): void {
    save.mutate(body, {
      onSuccess: () => toast({ tone: "success", title: t("settings.saved"), duration: 2500 }),
      onError: () => toast({ tone: "error", title: t("settings.saveFailed") }),
    });
  }

  const langOptions = [
    { value: "bn" as Lang, label: t("lang.bn") },
    { value: "en" as Lang, label: t("lang.en") },
  ];
  const digitOptions = [
    { value: "bn" as Lang, label: t("digits.bn") },
    { value: "en" as Lang, label: t("digits.en") },
  ];
  const themeOptions = [
    { value: "light" as Theme, label: t("settings.themeLight"), icon: Sun },
    { value: "dark" as Theme, label: t("settings.themeDark"), icon: Moon },
    { value: "system" as Theme, label: t("settings.themeSystem"), icon: Monitor },
  ];

  return (
    <article className="mx-auto max-w-2xl space-y-5" aria-labelledby={headingId}>
      <PageHeader eyebrow={t("settings.eyebrow")} title={t("page.settings")} headingId={headingId} />

      <Section title={t("settings.display")}>
        <div className="divide-y divide-line">
          <Row label={t("settings.language")}>
            <SegmentedControl label={t("settings.language")} value={lang} onChange={(v) => set({ language: v })} options={langOptions} />
          </Row>
          <Row label={t("settings.digits")}>
            <SegmentedControl label={t("settings.digits")} value={digits} onChange={(v) => set({ digits: v })} options={digitOptions} />
          </Row>
          <Row label={t("settings.theme")}>
            <SegmentedControl label={t("settings.theme")} value={theme} onChange={(v) => set({ theme: v })} options={themeOptions} />
          </Row>
        </div>
        <div className="mt-4">
          <ThemePreview theme={theme} />
        </div>
      </Section>

      <Section title={t("settings.alerts")}>
        <Row label={t("settings.notifyInApp")} hint={t("settings.notifyInAppHint")}>
          <Switch label={t("settings.notifyInApp")} checked={user?.notify_in_app ?? true} onChange={(v) => set({ notify_in_app: v })} />
        </Row>
        {user?.role === "agent" ? <HelpOptOutRow /> : null}
        <Row label={t("settings.tour")} hint={t("settings.tourHint")}>
          <LiquidButton variant="secondary" icon={Route} onClick={() => useShellStore.getState().setTourReplay(true)}>
            {t("settings.tourReplay")}
          </LiquidButton>
        </Row>
      </Section>

      <Section title={t("settings.security")}>
        <ChangePasswordForm />
      </Section>
    </article>
  );
}

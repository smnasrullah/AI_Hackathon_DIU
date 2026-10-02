import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUpdatePreferences } from "../../api/hooks/users";
import { toast } from "../../components/ui/toastStore";
import { useAuthStore } from "../../features/auth/authStore";
import { cn } from "../../lib/cn";
import { usePrefsStore } from "../../lib/prefs";

/** One tap flips bn/en; saved to the profile when signed in. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const lang = usePrefsStore((s) => s.lang);
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  const save = useUpdatePreferences();
  const next = lang === "bn" ? "en" : "bn";

  function flip() {
    if (!signedIn) {
      usePrefsStore.getState().setLang(next);
      return;
    }
    save.mutate({ language: next }, { onError: () => toast({ tone: "error", title: t("settings.saveFailed") }) });
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={t(next === "bn" ? "lang.toBn" : "lang.toEn")}
      data-testid="language-switch"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-small font-semibold hover:bg-surface-2",
        className,
      )}
    >
      <Languages aria-hidden className="size-4" />
      <span lang={next}>{next === "bn" ? "বাং" : "EN"}</span>
    </button>
  );
}

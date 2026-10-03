import { Check, Save } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useProfile, useUpdateProfile } from "../../api/hooks/users";
import type { AvatarColor, ProfileOut } from "../../api/types";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { Skeleton, SkeletonText } from "../../components/ui/Skeleton";
import { ErrorState } from "../../components/ui/StatePanel";
import { TimeText } from "../../components/ui/TimeText";
import { toast } from "../../components/ui/toastStore";
import { cn } from "../../lib/cn";
import { Avatar } from "./Avatar";
import { AVATAR_COLORS, AVATAR_ORDER } from "./avatarColors";
import { Section } from "./Section";

// Mirrors the server rule: no e-mail addresses, no phone-number-like digit runs.
const PII = /@|\d[\d\s-]{5,}\d/u;

function validName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 40 && !PII.test(trimmed);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-small font-semibold">{children}</dd>
    </div>
  );
}

function ProfileForm({ profile }: { profile: ProfileOut }) {
  const { t } = useTranslation();
  const save = useUpdateProfile();
  const [name, setName] = useState(profile.display_name);
  const [color, setColor] = useState<AvatarColor>(profile.avatar_color ?? "slate");
  const ok = validName(name);
  const dirty = name.trim() !== profile.display_name || color !== (profile.avatar_color ?? "slate");

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (!ok) return;
    save.mutate(
      { display_name: name.trim(), avatar_color: color },
      {
        onSuccess: () => toast({ tone: "success", title: t("profile.saved") }),
        onError: () => toast({ tone: "error", title: t("profile.saveFailed") }),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={name || profile.display_name} color={color} size="lg" />
        <div className="min-w-0 flex-1">
          <label htmlFor="display-name" className="text-small font-semibold">
            {t("profile.displayName")}
          </label>
          <input
            id="display-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!ok}
            aria-describedby="display-name-hint"
            className="mt-1.5 min-h-11 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3 text-body shadow-xs outline-none transition-[border-color,box-shadow] hover:border-ink-600/50 focus:border-pulse focus:ring-4 focus:ring-pulse/20 aria-[invalid=true]:border-act"
          />
          <p id="display-name-hint" className={cn("mt-1 text-xs", ok ? "text-muted" : "text-act-fg")}>
            {ok ? t("profile.displayNameHint") : t("profile.displayNameInvalid")}
          </p>
        </div>
      </div>
      <fieldset>
        <legend className="text-small font-semibold">{t("profile.avatar")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AVATAR_ORDER.map((c) => (
            <label key={c} className="relative cursor-pointer" title={t(`profile.color.${c}`)}>
              <input type="radio" name="avatar" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
              <span className="sr-only">{t(`profile.color.${c}`)}</span>
              <span
                aria-hidden
                style={{ background: AVATAR_COLORS[c] }}
                className="grid size-11 place-items-center rounded-full text-white ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:outline-2 peer-focus-visible:outline-pulse"
              >
                {color === c ? <Check className="size-4" /> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <LiquidButton type="submit" icon={Save} disabled={!ok || !dirty} loading={save.isPending}>
        {t("profile.save")}
      </LiquidButton>
    </form>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const q = useProfile();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader eyebrow={t("profile.eyebrow")} title={t("page.profile")} />
      {q.isPending ? (
        <Section title={t("page.profile")}>
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <SkeletonText lines={2} className="flex-1" />
          </div>
          <SkeletonText lines={4} className="mt-6" />
        </Section>
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <Section title={t("profile.displayName")}>
            <ProfileForm key={q.data.id} profile={q.data} />
          </Section>
          <Section title={t("profile.eyebrow")}>
            <dl className="divide-y divide-line">
              <Fact label={t("profile.role")}>{t(`role.${q.data.role}`)}</Fact>
              <Fact label={t("profile.agent")}>{q.data.agent ? `${q.data.agent.code} · ${q.data.agent.name}` : t("profile.none")}</Fact>
              <Fact label={t("profile.distributor")}>
                {q.data.distributor ? `${q.data.distributor.code} · ${q.data.distributor.name}` : t("profile.none")}
              </Fact>
              <Fact label={t("profile.lastLogin")}>
                {q.data.last_login_at ? <TimeText at={q.data.last_login_at} mode="datetime" /> : t("profile.never")}
              </Fact>
              <Fact label={t("profile.memberSince")}>
                <TimeText at={q.data.created_at} mode="datetime" />
              </Fact>
              <Fact label={t("profile.login")}>
                <span className="font-mono text-xs">{q.data.email}</span>
              </Fact>
            </dl>
            <p className="mt-3 text-xs text-muted">{t("profile.privacy")}</p>
          </Section>
        </>
      )}
    </div>
  );
}

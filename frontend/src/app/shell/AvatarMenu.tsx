import * as Menu from "@radix-ui/react-dropdown-menu";
import { CircleHelp, Info, LogOut, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Avatar } from "../../features/account/Avatar";
import { useAuthStore } from "../../features/auth/authStore";
import { useLogout } from "../../features/auth/useLogout";

const ITEM =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-small outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-60";

export function AvatarMenu() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const logout = useLogout();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const name = user.display_name || user.full_name;

  const links: { to: string; label: string; icon: LucideIcon }[] = [
    { to: "/profile", label: t("page.profile"), icon: UserRound },
    { to: "/settings", label: t("page.settings"), icon: Settings },
    { to: "/help", label: t("page.help"), icon: CircleHelp },
    { to: "/about", label: t("page.about"), icon: Info },
  ];

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t("shell.account")}
        data-testid="avatar-menu"
        data-tour="account"
        className="grid size-11 place-items-center rounded-full outline-offset-2 hover:ring-2 hover:ring-line-strong"
      >
        <Avatar name={name} color={user.avatar_color} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="ap-dialog z-(--z-overlay) w-64 ap-card p-2 text-fg shadow-lift"
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={name} color={user.avatar_color} />
            <div className="min-w-0">
              <p className="truncate text-small font-semibold">{name}</p>
              <p className="text-xs text-muted">{t(`role.${user.role}`)}</p>
            </div>
          </div>
          <Menu.Separator className="my-1 h-px bg-line" />
          {links.map(({ to, label, icon: Icon }) => (
            <Menu.Item key={to} className={ITEM} onSelect={() => navigate(to)}>
              <Icon aria-hidden className="size-4 text-muted" />
              {label}
            </Menu.Item>
          ))}
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item
            className={`${ITEM} text-act-fg`}
            disabled={busy}
            data-testid="logout"
            onSelect={() => {
              setBusy(true);
              void logout();
            }}
          >
            <LogOut aria-hidden className="size-4" />
            {busy ? t("shell.loggingOut") : t("shell.logout")}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

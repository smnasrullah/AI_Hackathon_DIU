import { Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useAdminUsers, useUpdateUser } from "../../../api/hooks/admin";
import type { AdminUser, UserRole } from "../../../api/types";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { Pagination } from "../../../components/ui/Pagination";
import { TimeText } from "../../../components/ui/TimeText";
import { toast } from "../../../components/ui/toastStore";
import { useAuthStore } from "../../auth/authStore";
import { errorCode } from "../../../lib/apiError";
import { SearchBox } from "../shared/SearchBox";
import { AdminHeader, Badge, FilterSelect } from "../shared/ui";
import { UserFormDialog } from "./UserFormDialog";
import { ROLES } from "./userForm";

const PAGE_SIZE = 25;
type RoleFilter = UserRole | "all";
type StatusFilter = "active" | "disabled" | "all";

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === raw) ?? fallback;
}

/** /admin/users: list with role / status / search in the URL; create, edit, disable / enable. */
export function AdminUsersPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user?.id);
  const [params, setParams] = useSearchParams();
  const role = pick<RoleFilter>(params.get("role"), ["all", ...ROLES], "all");
  const status = pick<StatusFilter>(params.get("status"), ["all", "active", "disabled"], "all");
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useAdminUsers({
    ...(role === "all" ? {} : { role }),
    ...(status === "all" ? {} : { status }),
    ...(search ? { q: search } : {}),
    page,
    page_size: PAGE_SIZE,
  });
  const update = useUpdateUser();
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);

  const setQuery = useCallback(
    (next: { role?: RoleFilter; status?: StatusFilter; q?: string; page?: number }) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          const set = (key: string, value: string, empty: string) => (value === empty ? out.delete(key) : out.set(key, value));
          if (next.role !== undefined) set("role", next.role, "all");
          if (next.status !== undefined) set("status", next.status, "all");
          if (next.q !== undefined) set("q", next.q, "");
          const p = next.page ?? 1;
          set("page", String(p), "1");
          return out;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onSearch = useCallback((value: string) => setQuery({ q: value }), [setQuery]);

  function confirmToggle(note: string) {
    if (!toggling) return;
    const enable = !toggling.is_active;
    update.mutate(
      { id: toggling.id, body: { is_active: enable, ...(note ? { note } : {}) } },
      {
        onSuccess: () => toast({ tone: "success", title: t(enable ? "admin.users.enabled" : "admin.users.disabled") }),
        onError: (err) => {
          const code = errorCode(err);
          toast({ tone: "error", title: t(code === "cannot_change_self" ? "admin.users.error.cannot_change_self" : "admin.users.error.generic") });
        },
        onSettled: () => setToggling(null),
      },
    );
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "user",
      header: t("admin.users.col.user"),
      cell: (u) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2 font-semibold">
            {u.full_name}
            {u.id === me ? <Badge tone="neutral">{t("admin.users.you")}</Badge> : null}
            {u.is_demo ? <Badge tone="neutral">{t("admin.users.demo")}</Badge> : null}
          </span>
          <span className="block truncate text-xs text-muted">{u.email}</span>
        </span>
      ),
      sortValue: (u) => u.email,
    },
    { key: "role", header: t("admin.users.col.role"), cell: (u) => t(`role.${u.role}`), sortValue: (u) => u.role },
    {
      key: "link",
      header: t("admin.users.col.link"),
      cell: (u) => <span className="font-mono text-xs">{u.role === "agent" ? u.agent_code : u.role === "distributor" ? u.distributor_code : "—"}</span>,
    },
    {
      key: "status",
      header: t("admin.users.col.status"),
      cell: (u) => <Badge tone={u.is_active ? "good" : "bad"}>{t(u.is_active ? "admin.users.status.active" : "admin.users.status.disabled")}</Badge>,
      sortValue: (u) => (u.is_active ? 1 : 0),
    },
    {
      key: "lastLogin",
      header: t("admin.users.col.lastLogin"),
      cell: (u) => (u.last_login_at ? <TimeText at={u.last_login_at} mode="relative" className="text-xs" /> : <span className="text-xs text-muted">{t("admin.common.never")}</span>),
      sortValue: (u) => u.last_login_at ?? "",
    },
    {
      key: "actions",
      header: t("admin.common.actions"),
      align: "right",
      cell: (u) => (
        <span className="inline-flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(u)}
            aria-label={`${t("admin.common.edit")}: ${u.email}`}
            className="ap-press grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
          {u.id === me ? null : (
            <button
              type="button"
              onClick={() => setToggling(u)}
              aria-label={`${t(u.is_active ? "admin.users.disable" : "admin.users.enable")}: ${u.email}`}
              data-testid="toggle-user"
              className="ap-press grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            >
              {u.is_active ? <UserX aria-hidden className="size-4" /> : <UserCheck aria-hidden className="size-4" />}
            </button>
          )}
        </span>
      ),
    },
  ];

  const filtered = role !== "all" || status !== "all" || search !== "";
  return (
    <div className="space-y-4" data-testid="admin-users">
      <AdminHeader
        title={t("admin.users.title")}
        lead={t("admin.users.lead")}
        actions={
          <LiquidButton icon={UserPlus} onClick={() => setEditing("new")} data-testid="add-user">
            {t("admin.users.add")}
          </LiquidButton>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SearchBox label={t("admin.users.search")} value={search} onSettled={onSearch} testId="user-search" />
        <FilterSelect<RoleFilter>
          label={t("admin.users.filterRole")}
          value={role}
          onChange={(v) => setQuery({ role: v })}
          options={[{ value: "all", label: t("admin.common.all") }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]}
        />
        <FilterSelect<StatusFilter>
          label={t("admin.users.filterStatus")}
          value={status}
          onChange={(v) => setQuery({ status: v })}
          options={[
            { value: "all", label: t("admin.common.all") },
            { value: "active", label: t("admin.users.status.active") },
            { value: "disabled", label: t("admin.users.status.disabled") },
          ]}
        />
      </div>
      <DataTable
        caption={t("admin.users.title")}
        columns={columns}
        rows={q.data?.items}
        getRowId={(u) => u.id}
        loading={q.isPending}
        error={q.isError && !q.data}
        onRetry={() => void q.refetch()}
        empty={{
          title: t("admin.users.empty.title"),
          body: t("admin.users.empty.body"),
          action: filtered
            ? { label: t("admin.common.clearFilters"), onClick: () => setParams(new URLSearchParams(), { replace: true }) }
            : { label: t("admin.users.add"), onClick: () => setEditing("new") },
        }}
        maxHeight={640}
      />
      {q.data && q.data.total > 0 ? <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPageChange={(p) => setQuery({ page: p })} /> : null}
      <UserFormDialog target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => (open ? undefined : setToggling(null))}
        title={t(toggling?.is_active ? "admin.users.disableTitle" : "admin.users.enableTitle", { email: toggling?.email ?? "" })}
        description={t(toggling?.is_active ? "admin.users.disableBody" : "admin.users.enableBody")}
        confirmLabel={t(toggling?.is_active ? "admin.users.disable" : "admin.users.enable")}
        tone={toggling?.is_active ? "danger" : "default"}
        noteMinLength={toggling?.is_active ? 3 : undefined}
        pending={update.isPending}
        onConfirm={confirmToggle}
      />
    </div>
  );
}

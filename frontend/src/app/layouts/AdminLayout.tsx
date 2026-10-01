import { Activity, Boxes, Bot, ScrollText, ShieldCheck, Users } from "lucide-react";

import { SideNavShell, type SideNavItem } from "./SideNavShell";

const NAV: SideNavItem[] = [
  { to: "/admin", label: "System status", icon: Activity, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/models", label: "Models", icon: Boxes },
  { to: "/admin/llm", label: "LLM log", icon: Bot },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText },
  { to: "/responsible-ai", label: "Responsible AI", icon: ShieldCheck },
];

export function AdminLayout() {
  return <SideNavShell area="Admin" items={NAV} />;
}

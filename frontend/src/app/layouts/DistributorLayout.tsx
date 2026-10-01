import { ArrowLeftRight, Map as MapIcon, Newspaper, ScanSearch, ShieldCheck, TrendingUp } from "lucide-react";

import { SideNavShell, type SideNavItem } from "./SideNavShell";

const NAV: SideNavItem[] = [
  { to: "/distributor", label: "Control room", icon: MapIcon, end: true },
  { to: "/distributor/swaps", label: "Swap queue", icon: ArrowLeftRight },
  { to: "/distributor/anomalies", label: "Anomalies", icon: ScanSearch },
  { to: "/distributor/impact", label: "Impact", icon: TrendingUp },
  { to: "/distributor/briefing", label: "Daily briefing", icon: Newspaper },
  { to: "/responsible-ai", label: "Responsible AI", icon: ShieldCheck },
];

export function DistributorLayout() {
  return <SideNavShell area="Distributor" items={NAV} />;
}

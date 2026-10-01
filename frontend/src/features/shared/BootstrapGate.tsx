import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { fetchSystemStatus, systemStatusKey } from "../../lib/systemStatus";
import { PreparingScreen } from "./PreparingScreen";

const POLL_MS = 2000;

export function BootstrapGate({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: systemStatusKey,
    queryFn: fetchSystemStatus,
    retry: false,
    refetchInterval: (query) => (query.state.data?.ready ? false : POLL_MS),
  });

  if (data?.ready) return <>{children}</>;
  return <PreparingScreen state={data?.bootstrap_state ?? "starting"} />;
}

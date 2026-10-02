import { useEffect } from "react";

const SUFFIX = "AgentPulse AI";

/** "<page> · AgentPulse AI" while the page is shown. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
}

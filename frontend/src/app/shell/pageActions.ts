import { useEffect } from "react";
import { create } from "zustand";

import { registerStoreReset } from "../../lib/storeRegistry";
import type { PaletteAction } from "./usePaletteActions";

interface PageActionsState {
  /** Commands the current page adds to the Ctrl+K palette (listed before the global ones). */
  actions: PaletteAction[];
  setActions: (actions: PaletteAction[]) => void;
}

export const usePageActionsStore = create<PageActionsState>()((set) => ({
  actions: [],
  setActions: (actions) => set({ actions }),
}));

registerStoreReset(() => usePageActionsStore.setState({ actions: [] }));

/** Register page commands while the page is mounted. Pass a memoised array. */
export function usePageActions(actions: PaletteAction[]): void {
  useEffect(() => {
    usePageActionsStore.getState().setActions(actions);
    return () => usePageActionsStore.getState().setActions([]);
  }, [actions]);
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { FloatType, RiskLevel } from "../../../api/types";
import { registerStoreReset, STORAGE_PREFIX } from "../../../lib/storeRegistry";

export const ALL_LEVELS: readonly RiskLevel[] = ["red", "amber", "green"];
export const MAX_HOUR = 72;

export type FloatFilter = FloatType | "all";

interface ControlRoomState {
  /** Time scrubber position, hours from the forecast's as-of. */
  hour: number;
  playing: boolean;
  levels: RiskLevel[];
  query: string;
  district: string | null;
  float: FloatFilter;
  selectedId: number | null;
  /** Persisted: online raster tiles under the bundled boundary (off = fully offline). */
  onlineTiles: boolean;
  setHour: (hour: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleLevel: (level: RiskLevel) => void;
  setLevels: (levels: RiskLevel[]) => void;
  setQuery: (query: string) => void;
  setDistrict: (district: string | null) => void;
  setFloat: (float: FloatFilter) => void;
  select: (id: number | null) => void;
  setOnlineTiles: (on: boolean) => void;
  resetFilters: () => void;
}

const filters = { levels: [...ALL_LEVELS], query: "", district: null, float: "all" as FloatFilter };
const initial = { hour: 0, playing: false, selectedId: null, onlineTiles: false, ...filters };

export const useControlRoomStore = create<ControlRoomState>()(
  persist(
    (set) => ({
      ...initial,
      setHour: (hour) => set({ hour: Math.min(MAX_HOUR, Math.max(0, Math.round(hour))) }),
      setPlaying: (playing) => set({ playing }),
      toggleLevel: (level) =>
        set((s) => ({
          levels: s.levels.includes(level) ? s.levels.filter((l) => l !== level) : ALL_LEVELS.filter((l) => l === level || s.levels.includes(l)),
        })),
      setLevels: (levels) => set({ levels }),
      setQuery: (query) => set({ query }),
      setDistrict: (district) => set({ district }),
      setFloat: (float) => set({ float }),
      select: (selectedId) => set({ selectedId }),
      setOnlineTiles: (onlineTiles) => set({ onlineTiles }),
      resetFilters: () => set({ ...filters, levels: [...ALL_LEVELS] }),
    }),
    {
      name: `${STORAGE_PREFIX}-control-room`,
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ onlineTiles }) => ({ onlineTiles }),
    },
  ),
);

registerStoreReset(() => useControlRoomStore.setState({ ...initial, levels: [...ALL_LEVELS] }));

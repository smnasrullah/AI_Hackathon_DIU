import { ArrowLeftRight, Clock, FilterX, Globe, Pause, Play, Siren, Target } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { usePageActions } from "../../../app/shell/pageActions";
import type { PaletteAction } from "../../../app/shell/usePaletteActions";
import { useControlRoomStore } from "./controlRoomStore";

/** Ctrl+K commands while the control room is open: filter Red, play the scrubber, open swaps... */
export function useControlRoomPalette(riskiestId: number | null): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const playing = useControlRoomStore((s) => s.playing);
  const onlineTiles = useControlRoomStore((s) => s.onlineTiles);

  const actions = useMemo<PaletteAction[]>(() => {
    const store = useControlRoomStore.getState;
    const list: PaletteAction[] = [
      { id: "cr-red", label: t("controlRoom.palette.red"), icon: Siren, run: () => store().setLevels(["red"]) },
      { id: "cr-all", label: t("controlRoom.palette.all"), icon: FilterX, run: () => store().resetFilters() },
      {
        id: "cr-play",
        label: t(playing ? "controlRoom.palette.pause" : "controlRoom.palette.play"),
        icon: playing ? Pause : Play,
        run: () => store().setPlaying(!store().playing),
      },
      { id: "cr-now", label: t("controlRoom.palette.now"), icon: Clock, run: () => store().setHour(0) },
      { id: "cr-24", label: t("controlRoom.palette.day"), icon: Clock, run: () => store().setHour(24) },
      {
        id: "cr-tiles",
        label: t(onlineTiles ? "controlRoom.palette.tilesOff" : "controlRoom.palette.tilesOn"),
        icon: Globe,
        run: () => store().setOnlineTiles(!store().onlineTiles),
      },
      { id: "cr-swaps", label: t("controlRoom.palette.swaps"), icon: ArrowLeftRight, run: () => navigate("/distributor/swaps") },
    ];
    if (riskiestId !== null) {
      list.splice(2, 0, { id: "cr-riskiest", label: t("controlRoom.palette.riskiest"), icon: Target, run: () => store().select(riskiestId) });
    }
    return list;
  }, [t, navigate, playing, onlineTiles, riskiestId]);

  usePageActions(actions);
}

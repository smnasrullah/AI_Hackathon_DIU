import type { AvatarColor } from "../../api/types";

export const AVATAR_COLORS: Record<AvatarColor, string> = {
  teal: "#0f7f78",
  indigo: "#4f46e5",
  amber: "#9a5b00",
  rose: "#c2255c",
  emerald: "#13774f",
  sky: "#0369a1",
  violet: "#6d4aff",
  slate: "#4a5578",
};

export const AVATAR_ORDER = Object.keys(AVATAR_COLORS) as AvatarColor[];

export function isAvatarColor(value: string | null | undefined): value is AvatarColor {
  return !!value && value in AVATAR_COLORS;
}

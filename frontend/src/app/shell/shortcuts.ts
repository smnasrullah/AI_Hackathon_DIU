import type en from "../../i18n/en.json";

type ShortcutKey = Exclude<keyof (typeof en)["shortcuts"], "title" | "then">;

export interface Shortcut {
  /** Key caps; a nested array is a sequence ("g" then "h"). */
  keys: string[] | [string[], string[]];
  label: ShortcutKey;
  sideOnly?: boolean;
}

/** Shown on "?" and on /help. */
export const SHORTCUTS: Shortcut[] = [
  { keys: ["Ctrl", "K"], label: "palette" },
  { keys: ["?"], label: "help" },
  { keys: [["G"], ["H"]], label: "home" },
  { keys: [["G"], ["N"]], label: "notifications" },
  { keys: [["G"], ["S"]], label: "settings" },
  { keys: ["["], label: "sidebar", sideOnly: true },
  { keys: ["Esc"], label: "close" },
];

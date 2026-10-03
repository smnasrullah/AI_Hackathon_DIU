import { LangText } from "../../components/ui/LangText";
import { cn } from "../../lib/cn";
import { getInitials } from "../../lib/initials";
import { AVATAR_COLORS, isAvatarColor } from "./avatarColors";

/** Initials on the chosen colour token (no photos: no real PII). */
export function Avatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: string | null | undefined;
  size?: "md" | "lg";
  className?: string;
}) {
  const bg = AVATAR_COLORS[isAvatarColor(color) ? color : "slate"];
  return (
    <span
      aria-hidden
      style={{ background: bg }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-white",
        size === "lg" ? "size-16 text-h2" : "size-9 text-small",
        className,
      )}
    >
      <LangText text={getInitials(name)} />
    </span>
  );
}

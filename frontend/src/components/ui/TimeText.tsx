import { useLocale } from "../../lib/prefs";
import { formatClock, formatDateTime, formatDuration, formatRelative } from "../../lib/format";
import { cn } from "../../lib/cn";

type TimeTextProps =
  | { at: Date | string; mode?: "clock" | "datetime" | "relative"; now?: Date; className?: string; hours?: never }
  | { hours: number; className?: string; at?: never; mode?: never; now?: never };

/** A point in time (Asia/Dhaka) or a duration, in the user's language and digits. */
export function TimeText(props: TimeTextProps) {
  const { lang, digits } = useLocale();
  if (props.hours !== undefined) {
    return <span className={cn("num whitespace-nowrap", props.className)}>{formatDuration(props.hours, lang, digits)}</span>;
  }
  const at = typeof props.at === "string" ? new Date(props.at) : props.at;
  const mode = props.mode ?? "clock";
  const text =
    mode === "clock"
      ? formatClock(at, lang, digits)
      : mode === "datetime"
        ? formatDateTime(at, lang, digits)
        : formatRelative(at, props.now ?? new Date(), lang, digits);
  return (
    <time dateTime={at.toISOString()} className={cn("num whitespace-nowrap", props.className)}>
      {text}
    </time>
  );
}

import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { useLocale } from "../../lib/prefs";
import { useCountUp } from "../../lib/useCountUp";

/** A whole number that counts up on first render and ticks on change (600ms), in the user's digits. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const { digits } = useLocale();
  const shown = useCountUp(value);
  // Screen readers get the final value once; the ticking digits are visual only.
  return (
    <span className={cn("num", className)}>
      <span className="sr-only">{formatNumber(value, digits)}</span>
      <span aria-hidden>{formatNumber(Math.round(shown), digits)}</span>
    </span>
  );
}

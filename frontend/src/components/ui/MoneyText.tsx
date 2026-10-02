import { useLocale } from "../../lib/prefs";
import { formatMoney, type Digits, type MoneyOptions } from "../../lib/format";
import { useCountUp } from "../../lib/useCountUp";
import { cn } from "../../lib/cn";

interface MoneyTextProps extends Omit<MoneyOptions, "lang"> {
  value: number;
  /** Override the user's digit preference. */
  digits?: Digits;
  /** Count up on first render and tick on change. */
  animate?: boolean;
  className?: string;
}

/** BDT with lakh grouping (৳1,20,000) in the user's digits (৳১,২০,০০০). */
export function MoneyText({ value, digits, animate = false, className, ...opts }: MoneyTextProps) {
  const locale = useLocale();
  const d = digits ?? locale.digits;
  const shown = useCountUp(value, animate);
  const text = formatMoney(animate ? Math.round(shown) : value, d, { ...opts, lang: locale.lang });
  const full = formatMoney(value, d, { ...opts, lang: locale.lang });
  return (
    <span className={cn("num whitespace-nowrap", className)} aria-label={animate ? full : undefined}>
      {text}
    </span>
  );
}

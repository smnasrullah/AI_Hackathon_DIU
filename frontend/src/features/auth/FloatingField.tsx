import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn";

interface FloatingFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  id: string;
  label: string;
  error?: string;
  /** Extra control inside the field (show-password toggle). */
  trailing?: ReactNode;
  /** Hint under the field when there is no error (caps lock). */
  hint?: ReactNode;
}

/** Input whose label sits inside and floats up on focus or when filled (transform only). */
export const FloatingField = forwardRef<HTMLInputElement, FloatingFieldProps>(function FloatingField(
  { id, label, error, trailing, hint, className, ...rest },
  ref,
) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "peer block h-14 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface px-3.5 pb-1.5 pt-5 text-body text-fg transition-colors duration-200 shadow-xs hover:border-ink-600/50 focus:border-pulse focus:outline-none focus:ring-4 focus:ring-pulse/20 aria-[invalid=true]:border-act",
            trailing ? "pr-12" : undefined,
            className,
          )}
          {...rest}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-3.5 top-4 origin-left text-body text-muted transition-[transform,color] duration-200 ease-brand peer-focus:-translate-y-2.5 peer-focus:scale-[0.78] peer-focus:text-pulse-fg peer-[:not(:placeholder-shown)]:-translate-y-2.5 peer-[:not(:placeholder-shown)]:scale-[0.78] peer-aria-[invalid=true]:text-act-fg"
        >
          {label}
        </label>
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-small text-act-fg">
          {error}
        </p>
      ) : hint ? (
        <div id={hintId} className="mt-1.5">
          {hint}
        </div>
      ) : null}
    </div>
  );
});

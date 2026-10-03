import { useId, type InputHTMLAttributes } from "react";

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  help: string;
  error?: string;
}

/** A labelled number input with its helper text and error wired up for screen readers. */
export function NumberField({ label, help, error, ...input }: NumberFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-small font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        className="min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 text-body outline-none focus-visible:border-pulse aria-invalid:border-act-solid num"
        {...input}
      />
      <p id={helpId} className="text-xs text-muted">
        {help}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-semibold text-act-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useDebounced } from "../../../lib/useDebounced";

interface SearchBoxProps {
  label: string;
  /** Value in the URL; the box writes back once typing settles. */
  value: string;
  onSettled: (value: string) => void;
  testId?: string;
}

export function SearchBox({ label, value, onSettled, testId }: SearchBoxProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const settled = useDebounced(text, 300);
  const pushed = useRef(settled);
  useEffect(() => {
    if (settled === pushed.current) return;
    pushed.current = settled;
    if (settled.trim() !== value) onSettled(settled.trim());
  }, [settled, value, onSettled]);
  return (
    <div className="min-w-56 flex-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <span className="relative mt-0.5 block">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={80}
          data-testid={testId}
          className="min-h-10 w-full rounded-[var(--radius-input)] border border-line-strong bg-surface pl-9 pr-3 text-small shadow-xs outline-none transition-[border-color,box-shadow] hover:border-ink-600/50 focus:border-pulse focus:ring-4 focus:ring-pulse/20"
        />
      </span>
    </div>
  );
}

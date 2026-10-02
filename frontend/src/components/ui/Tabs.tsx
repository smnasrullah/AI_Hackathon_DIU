import * as RadixTabs from "@radix-ui/react-tabs";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { SPRING } from "../../styles/motion";

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label: string;
  className?: string;
}

/** Radix tabs with a sliding underline. */
export function Tabs({ items, value, defaultValue, onValueChange, label, className }: TabsProps) {
  const layoutId = useId();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value ?? "");
  const current = value ?? inner;

  function change(next: string) {
    setInner(next);
    onValueChange?.(next);
  }

  return (
    <RadixTabs.Root value={current} onValueChange={change} className={className}>
      <RadixTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map(({ value: v, label: l, icon: Icon }) => (
          <RadixTabs.Trigger
            key={v}
            value={v}
            className={cn(
              "relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-small font-semibold transition-colors",
              v === current ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon aria-hidden className="size-4" /> : null}
            {l}
            {v === current ? (
              <motion.span
                layoutId={layoutId}
                transition={SPRING.snappy}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-pulse"
              />
            ) : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map(({ value: v, content }) => (
        <RadixTabs.Content key={v} value={v} className="pt-4 outline-none">
          {content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

import type { HTMLAttributes } from "react";
import { cn } from "../host/util";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/**
 * A small segmented toggle, drawn the way the host draws its Tabs list: a
 * muted track with the active option lifted onto the page background (in dark
 * mode, the host's input tint and border). Plica's toggles sit inside dense
 * headers where Radix Tabs' roving focus and tabpanel wiring would be wrong —
 * these filter or reorder a list, they do not swap panels — so they stay
 * `aria-pressed` buttons in a labelled group, and only the look is the host's.
 */
export function PlicaSegmented<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
  optionProps,
}: {
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onChange: (value: V) => void;
  /** Accessible name for the group, e.g. "Queue grouping". */
  label: string;
  className?: string;
  /** Extra attributes per option — test hooks such as `data-portfolio-sort`. */
  optionProps?: (value: V) => HTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string>;
}) {
  return (
    <span
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center rounded-md bg-muted p-0.5 normal-case tracking-normal", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            {...optionProps?.(option.value)}
            className={cn(
              "rounded-sm border border-transparent px-1.5 py-px font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-1 focus-visible:outline-ring",
              MICRO,
              active
                ? "bg-background text-foreground shadow-xs dark:border-input dark:bg-input/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </span>
  );
}

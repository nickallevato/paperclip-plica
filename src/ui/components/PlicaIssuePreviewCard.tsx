import { useEffect, useRef, type ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { Popover, PopoverAnchor, PopoverContent } from "../host/ui-kit";
import { IssueStatusBadge } from "../host/ui-kit";

/**
 * Shared hover/focus popover shell for Plica's lazy previews (issue hover,
 * approval linked-issue preview). Built on the app's portaled Radix Popover so
 * cards never clip against pane edges or the triage list's overflow-hidden,
 * collision-flip near viewport edges, and close on Escape. Open/closed state
 * stays with the caller (queries gate on it via `enabled`).
 *
 * Hover uses an open delay (250ms) so grazing the wall doesn't flash cards,
 * and a short close delay (150ms) so the pointer can travel from the anchor
 * into the portaled card without it vanishing mid-flight. Focus within the
 * anchor (links/buttons inside) opens it for keyboard users.
 */
export function PlicaHoverPopover({
  open,
  onOpenChange,
  children,
  content,
  anchorClassName = "min-w-0",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  content: ReactNode;
  anchorClassName?: string;
}) {
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };
  // Pane rows unmount routinely on the 5s poll (run finishes, approval acted
  // on) — don't leave a timer firing into the void.
  useEffect(() => clearTimers, []);
  const show = () => {
    clearTimers();
    showTimer.current = setTimeout(() => onOpenChange(true), 250);
  };
  const hide = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => onOpenChange(false), 150);
  };
  // On touch screens every tap focuses its target with no way to "unhover";
  // opening a card over what was just tapped only obscures it. Keep the
  // focus-open path for keyboard/pointer environments.
  const showOnFocus = () => {
    if (typeof window !== "undefined" && window.matchMedia?.("(hover: none)")?.matches) return;
    show();
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          className={anchorClassName}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={showOnFocus}
          onBlur={hide}
        >
          {children}
        </div>
      </PopoverAnchor>
      {open && (
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={show}
          onMouseLeave={hide}
          className="w-80 max-w-[90vw] p-2.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
        >
          {content}
        </PopoverContent>
      )}
    </Popover>
  );
}

/** One issue inside a preview card: identifier, title, status, description. */
export function PlicaIssuePreviewBody({ issue }: { issue: Issue }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 font-mono text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
        <span className="truncate font-medium">{issue.title}</span>
        <span className="ml-auto shrink-0">
          <IssueStatusBadge status={issue.status} />
        </span>
      </div>
      {issue.description ? (
        <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
          {issue.description.length > 500 ? `${issue.description.slice(0, 500)}…` : issue.description}
        </p>
      ) : (
        <p className="mt-1 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">No description.</p>
      )}
    </div>
  );
}

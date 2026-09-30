import { useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "../host/util";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../host/ui-kit";
import { reorderPanes, TICKLER_PANES, type TicklerPaneKey } from "../lib/pane-order";

const MICRO = "text-[length:var(--tickler-fs-micro,11px)] leading-[1.45]";

/**
 * `CSS.Transform.toString` from `@dnd-kit/utilities`, which is a transitive
 * dependency and so not ours to import — pnpm links only direct dependencies
 * at the top of `node_modules`, and adding a third package for one template
 * string is not a trade. Sortable never scales, so the scale terms it emits
 * are always `1` and are left off.
 */
function translate(transform: { x: number; y: number } | null): string | undefined {
  return transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined;
}

function SortablePaneRow({ paneKey, label, editing }: { paneKey: TicklerPaneKey; label: string; editing: boolean }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: paneKey,
    disabled: !editing,
  });

  return (
    <DropdownMenuItem
      ref={setNodeRef}
      data-pane-row={paneKey}
      style={{ transform: translate(transform), transition, zIndex: isDragging ? 10 : undefined }}
      // Nothing here is an action — the list is the setting. Radix would still
      // close the menu on Enter or a click, which would drop you out of Edit
      // mode mid-reorder, so every select is refused.
      onSelect={(event) => event.preventDefault()}
      className={cn(MICRO, "px-2 py-1", editing && "cursor-grab", isDragging && "opacity-80")}
    >
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {/* No placeholder when the grip is away: these rows have nothing on the
          right to stay aligned with, unlike the host's checkmark column. */}
      {editing && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${label}`}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </DropdownMenuItem>
  );
}

/**
 * "Panes": the order of the board's stack, on the one layout where it is a
 * stack.
 *
 * The mechanic is the host's own Orgs switcher (ui/src/components/
 * SidebarCompanyMenu.tsx): a menu that is a plain list until you press **Edit**,
 * which reveals a grip on every row and makes the rows sortable, and **Done**
 * to put it away. Copied rather than invented because the gesture is already in
 * the user's hands one click up the page, and because a drag handle that only
 * exists while you are editing is what keeps a list you mostly read from
 * reordering itself under a stray drag.
 *
 * The sensors are the host's two, and that pairing is the point: `MouseSensor`
 * and `TouchSensor` instead of `PointerSensor`, because a pointer sensor inside
 * a Radix menu takes the press that Radix needs to track its own dismissal. The
 * 8px mouse distance and 180ms touch delay are what separate a drag from a tap
 * on a phone, which is the screen this whole control is for.
 *
 * Rendered by `TicklerBoardPage` only when the board is one column. Wide, the
 * panes' `order` is overridden away and this button would be a control over
 * nothing.
 */
export function TicklerPaneOrder({
  order,
  onOrder,
}: {
  order: readonly TicklerPaneKey[];
  onOrder: (order: TicklerPaneKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );
  const labels = new Map(TICKLER_PANES.map((pane) => [pane.key, pane.label]));

  function handleDragEnd({ active, over }: DragEndEvent) {
    const next = reorderPanes(order, active.id, over?.id);
    if (next.every((key, index) => key === order[index])) return;
    onOrder(next);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        // Edit is a mode inside one visit to the menu, like the host's: reopening
        // it should show the list, not the grips.
        if (!next) setEditing(false);
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-pane-order
          className={cn(
            MICRO,
            "rounded-md border px-2 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring",
          )}
        >
          Panes
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <DropdownMenuLabel
            className={cn(MICRO, "p-0 font-semibold uppercase tracking-(--tracking-label) text-muted-foreground")}
          >
            Panes
          </DropdownMenuLabel>
          <button
            type="button"
            data-pane-order-edit
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing((current) => !current);
            }}
            className={cn(
              MICRO,
              "rounded px-1.5 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-1 focus-visible:outline-ring",
            )}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
            {order.map((key) => (
              <SortablePaneRow key={key} paneKey={key} label={labels.get(key) ?? key} editing={editing} />
            ))}
          </SortableContext>
        </DndContext>
        <p className={cn(MICRO, "px-2 pt-1.5 pb-0.5 text-muted-foreground")}>
          Saved in this browser only.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

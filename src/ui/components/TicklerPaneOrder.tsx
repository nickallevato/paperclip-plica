import { useState } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
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
 *
 * The x term is dropped with them, which is `@dnd-kit/modifiers`'
 * `restrictToVerticalAxis` for free rather than a third package. It is not a
 * nicety: this is a one-column list inside a menu that clips its overflow, so a
 * thumb that wanders sideways — and on a phone every thumb does — carries the
 * row's label out under the menu's edge and leaves you dragging a bare grip.
 */
function translate(transform: { x: number; y: number } | null): string | undefined {
  return transform ? `translate3d(0, ${transform.y}px, 0)` : undefined;
}

function SortablePaneRow({ paneKey, label }: { paneKey: TicklerPaneKey; label: string }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: paneKey,
  });

  return (
    <DropdownMenuItem
      ref={setNodeRef}
      data-pane-row={paneKey}
      style={{ transform: translate(transform), transition, zIndex: isDragging ? 10 : undefined }}
      // Nothing here is an action — the list is the setting. Radix would still
      // close the menu on Enter or a click, which would put the list away
      // mid-reorder, so every select is refused.
      onSelect={(event) => event.preventDefault()}
      className={cn(MICRO, "cursor-grab px-2 py-1", isDragging && "opacity-80")}
    >
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
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
    </DropdownMenuItem>
  );
}

/**
 * "Pane order": the order of the board's stack, on the one layout where it is a
 * stack.
 *
 * Opening it *is* the edit mode. The host's Orgs switcher — which this borrowed
 * its grips from — hides them behind an **Edit** toggle because that menu's
 * usual job is switching orgs and reordering is the rare second errand. This
 * menu has no first errand: the five rows are not commands, there is nothing
 * else to come here for, so a toggle that only ever gets pressed is ceremony.
 * The grips are out on open and a row is draggable straight away.
 *
 * The trigger is an icon in the HUD header's toggle group, next to token
 * thresholds, alerts and kiosk. That is the family it belongs to — a control
 * over how the page is laid out rather than over any of the work on it — and it
 * costs the board none of its own height, which is the scarce thing on the only
 * screen this control appears on.
 *
 * The sensors are the host's two, and that pairing is the point: `MouseSensor`
 * and `TouchSensor` instead of `PointerSensor`, because a pointer sensor inside
 * a Radix menu takes the press that Radix needs to track its own dismissal. The
 * 8px mouse distance and 180ms touch delay are what separate a drag from a tap
 * on a phone, which is the screen this whole control is for.
 *
 * Rendered by `TicklerHud` only while the board reports itself one column. Wide,
 * the panes' `order` is overridden away and this would be a control over
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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {/* The header group's own recipe, not a variant of it: these three
            buttons read as one control only while they stay literally
            identical. */}
        <button
          type="button"
          data-pane-order
          aria-pressed={open}
          aria-label="Pane order"
          title="Pane order"
          className={cn(
            "rounded-md border p-1",
            open ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        <DropdownMenuLabel
          className={cn(MICRO, "px-2 pt-1 pb-0.5 font-semibold uppercase tracking-(--tracking-label) text-muted-foreground")}
        >
          Pane order
        </DropdownMenuLabel>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
            {order.map((key) => (
              <SortablePaneRow key={key} paneKey={key} label={labels.get(key) ?? key} />
            ))}
          </SortableContext>
        </DndContext>
        <p className={cn(MICRO, "px-2 pt-1.5 pb-0.5 text-muted-foreground")}>
          Drag to reorder. Saved in this browser only.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

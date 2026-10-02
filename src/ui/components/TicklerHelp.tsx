import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "../host/util";

const MICRO = "text-[length:var(--tickler-fs-micro,11px)] leading-[1.45]";

/** The Paperclip Discord's Tickler thread. */
export const TICKLER_DISCORD_URL =
  "https://discord.com/channels/1478750559191302299/1532477301004959846";

/**
 * "?" — where to go when Tickler does the wrong thing, or nearly the right one.
 *
 * Last in the HUD header's toggle group, after token thresholds, alerts and
 * kiosk, and wearing their recipe: it is not a control over the page, but it is
 * the same kind of small square affordance and the group only reads as one
 * while they stay identical.
 *
 * The panel is rendered inline and positioned against this wrapper rather than
 * portalled to `document.body` the way the host's dropdowns are. Kiosk mode
 * fullscreens the HUD root, and the fullscreen element is the only subtree the
 * browser paints — a body-level portal would open invisibly on exactly the
 * screen somebody is most likely to be staring at. Positioned here it travels
 * with the header into fullscreen.
 *
 * The one thing it has to say is that we are not Paperclip: a plugin's bug goes
 * to the plugin's thread, not to Paperclip's issue tracker, and somebody who
 * has just hit a rough edge is about to guess wrong about which of the two they
 * are annoyed at.
 */
export function TicklerHelp() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Pointer-down rather than click: a click that lands on another header
    // toggle should both close this and press that, which is what the default
    // ordering gives us once the panel is already gone.
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} data-tickler-help className="relative">
      {/* The header group's own recipe, not a variant of it. */}
      <button
        type="button"
        aria-expanded={open}
        aria-pressed={open}
        aria-label="Help and feedback"
        title="Help and feedback"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={cn(
          "rounded-md border p-1",
          open ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Help and feedback"
          // `right-0` because this is the last control on the right-hand end of
          // the header: a panel aligned left would hang off the window.
          className="absolute right-0 top-full z-50 mt-2 w-64 space-y-1.5 rounded-lg border bg-popover p-3 text-left text-popover-foreground shadow-md"
        >
          <p className="text-[length:var(--tickler-fs-body,14px)] leading-[1.45] font-semibold">
            Need a tweak or change?
          </p>
          <p className={cn(MICRO, "text-muted-foreground")}>
            Join the Paperclip Discord and hop into the Tickler thread — that is where feature
            requests and bug reports land.
          </p>
          <a
            href={TICKLER_DISCORD_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            className={cn(MICRO, "inline-flex font-semibold text-foreground underline underline-offset-2 hover:no-underline")}
          >
            Open the Tickler thread
          </a>
          <p className={cn(MICRO, "text-muted-foreground")}>
            Tickler is a community plugin, not an officially supported part of Paperclip.
          </p>
        </div>
      )}
    </div>
  );
}

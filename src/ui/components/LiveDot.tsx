/**
 * The app's canonical "live" indicator (matches the Agents page live-run
 * pill), with a slower halo — a board of a dozen dots throbbing at full
 * tailwind-pulse speed drowns out the actual alert channel.
 */
export function LiveDot() {
  return (
    <span data-live-dot className="relative flex h-2 w-2 shrink-0" aria-label="Agent live">
      <span className="absolute inline-flex h-full w-full animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-plica-live opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-plica-live" />
    </span>
  );
}

/**
 * The counterpart to {@link LiveDot} for a run that is live but not yet
 * moving: a hollow, still ring. Deliberately unanimated — the pulse is what
 * says "an agent is working right now", and a queued run isn't.
 */
export function QueuedDot() {
  return (
    <span
      data-queued-dot
      className="relative flex h-2 w-2 shrink-0 rounded-full border border-muted-foreground/60"
      aria-label="Run queued"
    />
  );
}

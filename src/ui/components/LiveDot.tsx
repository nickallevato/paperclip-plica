/**
 * The app's canonical "live" indicator (matches the Agents page live-run
 * pill), with a slower halo — a board of a dozen dots throbbing at full
 * tailwind-pulse speed drowns out the actual alert channel.
 */
export function LiveDot() {
  return (
    <span data-live-dot className="relative flex h-2 w-2 shrink-0" aria-label="Agent live">
      <span className="absolute inline-flex h-full w-full animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-blue-400 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
    </span>
  );
}

import { useEffect, useRef } from "react";

/**
 * Drafts survive closing a dialog or the tab, the way the host's comment
 * composers do: localStorage, debounced, cleared on send. Keyed per thing
 * being answered, so a half-written reply comes back as you left it.
 */
export const PLICA_DRAFT_DEBOUNCE_MS = 800;
export const draftKeyFor = (interactionId: string) => `plica.interactionDraft.${interactionId}`;

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown, empty: boolean) {
  try {
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled or full — drafts are a convenience, never an error
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Debounced write of `value` under `key`; skips the initial mount so loading a draft never re-saves it. */
export function useDraftSaver(key: string, value: unknown, empty: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => saveDraft(key, value, empty), PLICA_DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, value, empty]);
}

/**
 * Clears a stranded `pointer-events: none` from `<body>`.
 *
 * Radix's modal Dialog sets `document.body.style.pointerEvents = "none"` while
 * it is open and restores it on close. If the component that owns the dialog
 * is unmounted *while the dialog is still open*, that restore never runs and
 * the whole document — the host's sidebar included — silently stops accepting
 * clicks, with nothing visibly wrong.
 *
 * Plica hits this by design rather than by accident: the queue re-derives
 * every poll, so answering a question inside a dialog resolves the underlying
 * attention item, which removes its row on the next 5s refresh and takes the
 * open dialog down with it.
 *
 * Only acts when no modal is actually left on the page, so it can never fight
 * a dialog that is legitimately open.
 */
export function releaseStrandedPointerEvents(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.style.pointerEvents !== "none") return false;
  if (document.querySelector("[role=dialog],[role=alertdialog],[data-radix-popper-content-wrapper]")) return false;
  document.body.style.removeProperty("pointer-events");
  return true;
}

import { useEffect, useRef } from "react";

/**
 * Drafts survive closing a dialog or the tab, the way the host's comment
 * composers do: localStorage, debounced, cleared on send. Keyed per thing
 * being answered, so a half-written reply comes back as you left it.
 */
export const PLICA_DRAFT_DEBOUNCE_MS = 800;
export const draftKeyFor = (interactionId: string) => `plica.interactionDraft.${interactionId}`;
export const nudgeDraftKeyFor = (companyId: string, agentId: string) => `plica.nudgeDraft.${companyId}.${agentId}`;

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

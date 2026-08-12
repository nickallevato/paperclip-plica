/**
 * Vendored copies of the small Paperclip UI utilities Plica depends on.
 *
 * Plugin bundles cannot import from the host's `@/lib/*`, so these are copied
 * rather than referenced. Only what Plica actually uses is vendored — copying
 * the host's full `utils.ts` would drag in `@paperclipai/shared` and create a
 * drift liability for code Plica never calls.
 *
 * Sources (paperclip @ canary/v2026.807.0-canary.13):
 *   ui/src/lib/utils.ts          → cn
 *   ui/src/lib/status-colors.ts  → priorityColor, priorityColorDefault
 *   ui/src/lib/queryKeys.ts      → the plica + auth branches
 *   ui/src/lib/company-routes.ts → toCompanyRelativePath and its helpers
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Status / priority tokens
// ---------------------------------------------------------------------------

// `status-colors.ts` is vendored wholesale (it is self-contained and has no
// imports), so it stays the single source for these tokens rather than this
// module keeping a second copy that could drift from the one the vendored
// StatusBadge/StatusGlyph render against.
export { priorityColor, priorityColorDefault } from "./status-colors";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/**
 * Plica owns its own QueryClient, so these keys only need to be internally
 * consistent — they never have to match the host's cache.
 */
export const queryKeys = {
  plica: {
    summary: (companyId: string) => ["plica", "summary", companyId] as const,
    badges: (companyId: string) => ["plica", "badges", companyId] as const,
    attention: (companyId: string) => ["plica", "attention", companyId] as const,
    activity: (companyId: string) => ["plica", "activity", companyId] as const,
    liveRuns: (companyId: string) => ["plica", "live-runs", companyId] as const,
    projects: (companyId: string) => ["plica", "projects", companyId] as const,
    issues: (companyId: string) => ["plica", "issues", companyId] as const,
    approvals: (companyId: string) => ["plica", "approvals", companyId] as const,
    agents: (companyId: string) => ["plica", "agents", companyId] as const,
    company: (companyId: string) => ["plica", "company", companyId] as const,
    timeline: (companyId: string) => ["plica", "timeline", companyId] as const,
    briefingIssues: (companyId: string) => ["plica", "briefing-issues", companyId] as const,
  },
  auth: {
    session: ["auth", "session"] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Company-relative routing
// ---------------------------------------------------------------------------

const BOARD_ROUTE_ROOTS = new Set([
  "dashboard",
  "companies",
  "company",
  "skills",
  "teams-catalog",
  "org",
  "agents",
  "apps",
  "projects",
  "workspaces",
  "execution-workspaces",
  "issues",
  "routines",
  "goals",
  "artifacts",
  "tools",
  "approvals",
  "costs",
  "usage",
  "activity",
  "audit",
  "decisions",
  "inbox",
  "board-chat",
  "u",
  "design-guide",
  "search",
  "settings",
  "timeline",
]);

/**
 * Tracks upstream deliberately.
 *
 * The v4 customization added "plica" to this set because /plica was a
 * root-level global route. As a plugin page Plica lives at /:prefix/plica and
 * is company-scoped like any other board route, so the entry is omitted.
 */
const GLOBAL_ROUTE_ROOTS = new Set(["auth", "invite", "board-claim", "cli-auth", "docs", "instance"]);

export function normalizeCompanyPrefix(prefix: string): string {
  return prefix.trim().toUpperCase();
}

function splitPath(path: string): { pathname: string; search: string; hash: string } {
  const match = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match?.[1] ?? path,
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  };
}

export function toCompanyRelativePath(path: string): string {
  const { pathname, search, hash } = splitPath(path);
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length >= 2) {
    const second = segments[1]!.toLowerCase();
    if (!GLOBAL_ROUTE_ROOTS.has(segments[0]!.toLowerCase()) && BOARD_ROUTE_ROOTS.has(second)) {
      return `/${segments.slice(1).join("/")}${search}${hash}`;
    }
  }

  return `${pathname}${search}${hash}`;
}

/**
 * Typed client for the core Paperclip HTTP APIs that Plica reads.
 *
 * Plugin UI runs as same-origin trusted JavaScript, and manifest capabilities
 * gate worker-side host RPC only — they do not restrict plugin UI from calling
 * ordinary Paperclip HTTP APIs (PLUGIN_SPEC.md §24). So Plica keeps talking to
 * the same endpoints it always did, carrying the session cookie.
 *
 * This module deliberately implements ONLY the methods Plica calls. The host's
 * own api modules carry dozens more; copying them wholesale would create a
 * large surface that silently drifts from upstream without anything exercising
 * it. If Plica needs a new endpoint, add it here with a test.
 *
 * Mirrors ui/src/api/client.ts (paperclip @ canary/v2026.807.0-canary.13).
 */
import type {
  Agent,
  Approval,
  AttentionFeed,
  Company,
  CostByAgent,
  DashboardSummary,
  Issue,
  IssueComment,
  Project,
  RoutineListItem,
  SidebarBadges,
  SidebarOrderPreference,
  WorkTimelineResult,
} from "@paperclipai/shared";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
};

// ---------------------------------------------------------------------------
// Company-scoped reads
// ---------------------------------------------------------------------------

export const agentsApi = {
  list: (companyId: string) => api.get<Agent[]>(`/companies/${companyId}/agents`),
};

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
};

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
};

/**
 * Token usage. There is no company-level token total in the API — the
 * dashboard summary carries costs in cents only — so Plica sums the per-agent
 * breakdown, which is the coarsest endpoint that reports tokens at all.
 *
 * `from`/`to` are ISO dates; omitting them gives the endpoint's default range.
 */
export const costsApi = {
  byAgent: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${qs ? `?${qs}` : ""}`);
  },
};

/**
 * Routines. The list endpoint returns each routine with its triggers
 * (including nextRunAt / lastFiredAt / lastResult) and its last run, which is
 * everything Plica needs to say whether the schedule is actually firing —
 * no per-routine follow-up calls.
 */
export const routinesApi = {
  list: (companyId: string) => api.get<RoutineListItem[]>(`/companies/${companyId}/routines`),
};

export const sidebarBadgesApi = {
  get: (companyId: string) => api.get<SidebarBadges>(`/companies/${companyId}/sidebar-badges`),
};

export const attentionApi = {
  list: (companyId: string, options: { includeDismissed?: boolean } = {}) =>
    api.get<AttentionFeed>(
      `/companies/${companyId}/attention${options.includeDismissed ? "?includeDismissed=true" : ""}`,
    ),
};

// ---------------------------------------------------------------------------
// Live runs
// ---------------------------------------------------------------------------

/**
 * Mirrors ui/src/api/heartbeats.ts, minus `livenessState` and `outputSilence`.
 *
 * Those two are typed by indexing into `HeartbeatRun`, which drags in a long
 * chain of host-internal run types. Plica reads neither — it uses id, status,
 * invocationSource, triggerDetail, startedAt, createdAt, agentName, issueId,
 * currentStatusMessage, and nextAction — so they are omitted rather than
 * vendored along with their whole dependency chain.
 */
export interface LiveRunForIssue {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  contextCommentId?: string | null;
  contextWakeCommentId?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  logBytes?: number | null;
  lastOutputBytes?: number | null;
  issueId?: string | null;
  livenessReason?: string | null;
  continuationAttempt?: number;
  lastUsefulActionAt?: string | null;
  nextAction?: string | null;
  currentStatusMessage?: string | null;
  currentStatusUpdatedAt?: string | null;
  currentToolName?: string | null;
  lastAssistantSnippet?: string | null;
  lastEventAt?: string | null;
}

export const heartbeatsApi = {
  liveRunsForCompany: (
    companyId: string,
    options?: number | { minCount?: number; limit?: number },
  ) => {
    const searchParams = new URLSearchParams();
    if (typeof options === "number") {
      searchParams.set("minCount", String(options));
    } else if (options) {
      if (options.minCount) searchParams.set("minCount", String(options.minCount));
      if (options.limit) searchParams.set("limit", String(options.limit));
    }
    const qs = searchParams.toString();
    return api.get<LiveRunForIssue[]>(`/companies/${companyId}/live-runs${qs ? `?${qs}` : ""}`);
  },
};

// ---------------------------------------------------------------------------
// Work timeline
// ---------------------------------------------------------------------------

export interface WorkTimelineParams {
  from?: string;
  to?: string;
  limit?: number;
}

function timelineQuery(params: WorkTimelineParams): string {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const workTimelineApi = {
  get: (companyId: string, params: WorkTimelineParams = {}) =>
    api.get<WorkTimelineResult>(`/companies/${companyId}/timeline${timelineQuery(params)}`),
};

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

/** Only the filters Plica passes. See the module doc for why this is narrow. */
export interface IssueListFilters {
  status?: string;
  limit?: number;
}

function issueListSearchParams(filters?: IssueListFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.limit) params.set("limit", String(filters.limit));
  return params;
}

export const issuesApi = {
  list: (companyId: string, filters?: IssueListFilters) => {
    const qs = issueListSearchParams(filters).toString();
    return api.get<Issue[]>(`/companies/${companyId}/issues${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<Issue>(`/issues/${id}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Issue>(`/companies/${companyId}/issues`, data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Issue>(`/issues/${id}`, data),
  addComment: (id: string, body: string, reopen?: boolean, interrupt?: boolean) =>
    api.post<IssueComment>(`/issues/${id}/comments`, {
      body,
      ...(reopen === undefined ? {} : { reopen }),
      ...(interrupt === undefined ? {} : { interrupt }),
    }),
};

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const approvalsApi = {
  list: (companyId: string, status?: string) =>
    api.get<Approval[]>(
      `/companies/${companyId}/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  approve: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/approve`, { decisionNote }),
  reject: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/reject`, { decisionNote }),
  listIssues: (id: string) => api.get<Issue[]>(`/approvals/${id}/issues`),
};

// ---------------------------------------------------------------------------
// Auth + companies
// ---------------------------------------------------------------------------

export type AuthSession = {
  user?: { id: string; name?: string | null; email?: string | null } | null;
  session?: { userId: string } | null;
} | null;

export const authApi = {
  /**
   * Returns null rather than throwing when unauthenticated — Plica renders a
   * signed-out state instead of an error boundary.
   */
  getSession: async (): Promise<AuthSession> => {
    const res = await fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json().catch(() => null) as Promise<AuthSession>;
  },
};

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
};

/**
 * Read-only: Plica sorts panes by the user's sidebar company order but never
 * reorders it, so the update half of the host's sidebarPreferencesApi is not
 * carried.
 */
export const sidebarPreferencesApi = {
  getCompanyOrder: () => api.get<SidebarOrderPreference>("/sidebar-preferences/me"),
};

// `companiesListQueryOptions` lives in ./companies-query so that its call
// to companiesApi.list() crosses a module boundary and stays mockable.

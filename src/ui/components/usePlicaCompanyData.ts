import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Agent,
  Approval,
  AttentionFeed,
  DashboardSummary,
  Issue,
  Project,
  RoutineListItem,
} from "@paperclipai/shared";
import { attentionApi } from "../host/api";
import { costsApi } from "../host/api";
import { routinesApi } from "../host/api";
import { agentsApi } from "../host/api";
import { approvalsApi } from "../host/api";
import { dashboardApi } from "../host/api";
import { heartbeatsApi, type LiveRunForIssue } from "../host/api";
import { issuesApi } from "../host/api";
import { projectsApi } from "../host/api";
import {
  PLICA_FREEZE,
  deriveNeedsBreakdown,
  currentMonthRange,
  plicaRefetchInterval,
  pruneClosedIssueAttention,
  sumAgentTokens,
  type PlicaNeedsBreakdown,
} from "../lib/plica";
import { queryKeys } from "../host/util";

export interface PlicaCompanyData {
  summary: DashboardSummary | undefined;
  liveRuns: LiveRunForIssue[];
  projects: Project[];
  issues: Issue[];
  agents: Agent[];
  approvals: Approval[];
  attention: AttentionFeed | undefined;
  /** Company routines with their triggers and last run. */
  routines: RoutineListItem[];
  /** What Need-you is made of; undefined until the attention feed arrives. */
  needsBreakdown: PlicaNeedsBreakdown | undefined;
  /**
   * Month-to-date tokens across every agent, or undefined when the costs
   * endpoint is unavailable — it is permission-gated, so a viewer without cost
   * access sees no token figures rather than a misleading zero.
   */
  tokens: number | undefined;
  isLoading: boolean;
  /**
   * True when the pane's core summary query has failed and has never
   * received data (i.e. the very first poll failed) — as opposed to a
   * later poll failing after we already have something to show, which is
   * the `staleSince` ribbon case. An unavailable pane must not be rendered
   * as a healthy, empty pane.
   */
  unavailable: boolean;
  staleSince: number | null;
  invalidate: () => void;
}

/**
 * Poll cadences, set per dataset rather than one interval for everything.
 *
 * The HUD used to refetch all eight company queries every 5 seconds, which
 * meant re-downloading every company's issue list — the single heaviest
 * payload on the page — twelve times a minute to recompute counts that change
 * on human timescales. Only the things that are actually live run at LIVE;
 * everything else is paced to how fast it can really change.
 *
 * `staleTime` matches each interval so remounting the page (tab switch, route
 * hop) serves the cached copy instead of firing the whole fan-out again.
 *
 * None of these refetch in a hidden tab. Background polling kept committing
 * state into the shared React tree while the user was elsewhere, which is
 * exactly the pressure that starves a router transition.
 */
/**
 * Shared empty results.
 *
 * `?? []` mints a new array on every render, and these values feed effect
 * dependency arrays upstream — a fresh identity each render makes the effect
 * fire every render, which re-renders the parent, which renders again. One
 * frozen instance per type keeps "no data yet" a stable reference.
 */
const NO_RUNS: LiveRunForIssue[] = [];
const NO_PROJECTS: Project[] = [];
const NO_ISSUES: Issue[] = [];
const NO_AGENTS: Agent[] = [];
const NO_APPROVALS: Approval[] = [];
const NO_ROUTINES: RoutineListItem[] = [];

const LIVE = { refetchInterval: plicaRefetchInterval, staleTime: 4_000 } as const;
const BRISK = { refetchInterval: PLICA_FREEZE ? false : 15_000, staleTime: 14_000 } as const;
const STEADY = { refetchInterval: PLICA_FREEZE ? false : 30_000, staleTime: 29_000 } as const;
const SLOW = { refetchInterval: PLICA_FREEZE ? false : 60_000, staleTime: 59_000 } as const;


export function usePlicaCompanyData(companyId: string): PlicaCompanyData {
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: queryKeys.plica.summary(companyId),
    queryFn: () => dashboardApi.summary(companyId),
    ...LIVE,
  });
  const liveRuns = useQuery({
    queryKey: queryKeys.plica.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, { limit: 8 }),
    ...LIVE,
  });
  const projects = useQuery({
    queryKey: queryKeys.plica.projects(companyId),
    queryFn: () => projectsApi.list(companyId),
    ...SLOW,
  });
  const issues = useQuery({
    queryKey: queryKeys.plica.issues(companyId),
    queryFn: () => issuesApi.list(companyId, { limit: 200 }),
    ...SLOW,
  });
  const agents = useQuery({
    queryKey: queryKeys.plica.agents(companyId),
    queryFn: () => agentsApi.list(companyId),
    ...STEADY,
  });
  const approvals = useQuery({
    queryKey: queryKeys.plica.approvals(companyId),
    queryFn: () => approvalsApi.list(companyId, "pending"),
    ...BRISK,
  });

  const attention = useQuery({
    queryKey: queryKeys.plica.attention(companyId),
    queryFn: () => attentionApi.list(companyId),
    ...LIVE,
  });
  // Schedules change on human timescales, not agent ones — a minute-by-minute
  // poll would buy nothing. The countdown is computed from nextRunAt at render
  // time, so it stays live between fetches.
  const routines = useQuery({
    queryKey: queryKeys.plica.routines(companyId),
    queryFn: () => routinesApi.list(companyId),
    refetchInterval: PLICA_FREEZE ? false : 60_000,
    retry: false,
  });
  // Tokens move far more slowly than attention and cost a heavier query, so
  // this one polls on its own longer interval rather than riding POLL.
  const monthRange = currentMonthRange(Date.now());
  const tokens = useQuery({
    queryKey: queryKeys.plica.tokens(companyId, monthRange.from, monthRange.to),
    queryFn: () => costsApi.byAgent(companyId, monthRange.from, monthRange.to),
    refetchInterval: PLICA_FREEZE ? false : 5 * 60_000,
    retry: false,
  });

  // `tokens` is deliberately outside this list: it is permission-gated and
  // slow-moving, so a 403 there must not make the whole pane read as loading,
  // stale, or unavailable.
  const queries = [summary, liveRuns, projects, issues, agents, approvals, attention];
  const erroring = queries.filter((query) => query.isError && query.dataUpdatedAt > 0);
  const staleSince = erroring.length
    ? Math.min(...erroring.map((query) => query.dataUpdatedAt))
    : null;

  // Attention items on closed issues are noise the server doesn't filter;
  // pruned here, once, so the rail, the counts and the board rows agree.
  const attentionData = useMemo(
    () => pruneClosedIssueAttention(attention.data, issues.data ?? []),
    [attention.data, issues.data],
  );

  // Memoised on the feed it derives from. Without this it is a fresh object on
  // every render, and consumers that key an effect on it never settle — which
  // pinned React in a render loop and stopped route transitions committing.
  const needsBreakdown = useMemo(
    () => (attentionData === undefined ? undefined : deriveNeedsBreakdown(attentionData)),
    [attentionData],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["plica"], predicate: (query) => query.queryKey[2] === companyId });
  }, [companyId, queryClient]);

  return {
    summary: summary.data,
    liveRuns: liveRuns.data ?? NO_RUNS,
    projects: projects.data ?? NO_PROJECTS,
    issues: issues.data ?? NO_ISSUES,
    agents: agents.data ?? NO_AGENTS,
    approvals: approvals.data ?? NO_APPROVALS,
    attention: attentionData,
    routines: routines.data ?? NO_ROUTINES,
    needsBreakdown,
    tokens: tokens.isSuccess ? sumAgentTokens(tokens.data) : undefined,
    isLoading: queries.some((query) => query.isLoading),
    unavailable: summary.isError && summary.dataUpdatedAt === 0,
    staleSince,
    invalidate,
  };
}

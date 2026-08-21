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
  SidebarBadges,
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
import { sidebarBadgesApi } from "../host/api";
import { currentMonthRange, plicaRefetchInterval, pruneClosedIssueAttention, sumAgentTokens } from "../lib/plica";
import { queryKeys } from "../host/util";

export interface PlicaCompanyData {
  summary: DashboardSummary | undefined;
  liveRuns: LiveRunForIssue[];
  projects: Project[];
  issues: Issue[];
  agents: Agent[];
  approvals: Approval[];
  badges: SidebarBadges | undefined;
  attention: AttentionFeed | undefined;
  /** Company routines with their triggers and last run. */
  routines: RoutineListItem[];
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

const POLL = { refetchInterval: plicaRefetchInterval, refetchIntervalInBackground: true } as const;

export function usePlicaCompanyData(companyId: string): PlicaCompanyData {
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: queryKeys.plica.summary(companyId),
    queryFn: () => dashboardApi.summary(companyId),
    ...POLL,
  });
  const liveRuns = useQuery({
    queryKey: queryKeys.plica.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, { limit: 8 }),
    ...POLL,
  });
  const projects = useQuery({
    queryKey: queryKeys.plica.projects(companyId),
    queryFn: () => projectsApi.list(companyId),
    ...POLL,
  });
  const issues = useQuery({
    queryKey: queryKeys.plica.issues(companyId),
    queryFn: () => issuesApi.list(companyId, { limit: 200 }),
    ...POLL,
  });
  const agents = useQuery({
    queryKey: queryKeys.plica.agents(companyId),
    queryFn: () => agentsApi.list(companyId),
    ...POLL,
  });
  const approvals = useQuery({
    queryKey: queryKeys.plica.approvals(companyId),
    queryFn: () => approvalsApi.list(companyId, "pending"),
    ...POLL,
  });

  const badges = useQuery({
    queryKey: queryKeys.plica.badges(companyId),
    queryFn: () => sidebarBadgesApi.get(companyId),
    ...POLL,
  });
  const attention = useQuery({
    queryKey: queryKeys.plica.attention(companyId),
    queryFn: () => attentionApi.list(companyId),
    ...POLL,
  });
  // Schedules change on human timescales, not agent ones — a minute-by-minute
  // poll would buy nothing. The countdown is computed from nextRunAt at render
  // time, so it stays live between fetches.
  const routines = useQuery({
    queryKey: queryKeys.plica.routines(companyId),
    queryFn: () => routinesApi.list(companyId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  // Tokens move far more slowly than attention and cost a heavier query, so
  // this one polls on its own longer interval rather than riding POLL.
  const monthRange = currentMonthRange(Date.now());
  const tokens = useQuery({
    queryKey: queryKeys.plica.tokens(companyId, monthRange.from, monthRange.to),
    queryFn: () => costsApi.byAgent(companyId, monthRange.from, monthRange.to),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  // `tokens` is deliberately outside this list: it is permission-gated and
  // slow-moving, so a 403 there must not make the whole pane read as loading,
  // stale, or unavailable.
  const queries = [summary, liveRuns, projects, issues, agents, approvals, badges, attention];
  const erroring = queries.filter((query) => query.isError && query.dataUpdatedAt > 0);
  const staleSince = erroring.length
    ? Math.min(...erroring.map((query) => query.dataUpdatedAt))
    : null;

  // Attention items on closed issues are noise the server doesn't filter;
  // pruned here, once, so the rail, the counts and the classic panes agree.
  const attentionData = useMemo(
    () => pruneClosedIssueAttention(attention.data, issues.data ?? []),
    [attention.data, issues.data],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["plica"], predicate: (query) => query.queryKey[2] === companyId });
  }, [companyId, queryClient]);

  return {
    summary: summary.data,
    liveRuns: liveRuns.data ?? [],
    projects: projects.data ?? [],
    issues: issues.data ?? [],
    agents: agents.data ?? [],
    approvals: approvals.data ?? [],
    badges: badges.data,
    attention: attentionData,
    routines: routines.data ?? [],
    tokens: tokens.isSuccess ? sumAgentTokens(tokens.data) : undefined,
    isLoading: queries.some((query) => query.isLoading),
    unavailable: summary.isError && summary.dataUpdatedAt === 0,
    staleSince,
    invalidate,
  };
}

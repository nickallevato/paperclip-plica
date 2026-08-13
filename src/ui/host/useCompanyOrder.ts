import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Company } from "@paperclipai/shared";
import { sidebarPreferencesApi } from "./api";

/**
 * Read-only vendored copy of the host's `useCompanyOrder`.
 *
 * Plica sorts its panes by the user's sidebar company-switcher drag order so
 * the wall matches the curation they already did. It never reorders that list,
 * so the host hook's mutation and `persistOrder` are deliberately not carried —
 * copying write paths nothing exercises would be drift surface for no gain.
 *
 * Source: ui/src/hooks/useCompanyOrder.ts
 */
function areEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function sortCompaniesByOrder(companies: Company[], orderedIds: string[]): Company[] {
  if (companies.length === 0) return [];
  if (orderedIds.length === 0) return companies;

  const byId = new Map(companies.map((company) => [company.id, company]));
  const sorted: Company[] = [];

  for (const id of orderedIds) {
    const company = byId.get(id);
    if (!company) continue;
    sorted.push(company);
    byId.delete(id);
  }
  for (const company of byId.values()) {
    sorted.push(company);
  }
  return sorted;
}

function buildOrderIds(companies: Company[], orderedIds: string[]) {
  return sortCompaniesByOrder(companies, orderedIds).map((company) => company.id);
}

type UseCompanyOrderParams = {
  companies: Company[];
  userId: string | null | undefined;
};

export function useCompanyOrder({ companies, userId }: UseCompanyOrderParams) {
  const { data } = useQuery({
    queryKey: ["sidebar-preferences", "company-order", userId ?? "__anon__"],
    queryFn: () => sidebarPreferencesApi.getCompanyOrder(),
    enabled: Boolean(userId),
  });

  const [orderedIds, setOrderedIds] = useState<string[]>(() => buildOrderIds(companies, []));

  useEffect(() => {
    const nextIds = buildOrderIds(companies, data?.orderedIds ?? []);
    setOrderedIds((current) => (areEqual(current, nextIds) ? current : nextIds));
  }, [companies, data?.orderedIds]);

  const orderedCompanies = useMemo(
    () => sortCompaniesByOrder(companies, orderedIds),
    [companies, orderedIds],
  );

  return { orderedCompanies };
}

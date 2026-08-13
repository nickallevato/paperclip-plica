import { ApiError, companiesApi } from "./api";
import type { Company } from "@paperclipai/shared";

/**
 * Kept in its own module, mirroring the host's split between `api/companies`
 * and `api/companies-query`.
 *
 * This is a real seam, not organisational taste: `queryFn` calls
 * `companiesApi.list()` through a cross-module import, so a test that mocks
 * `host/api` actually reaches it. Defining these options alongside
 * `companiesApi` in one module would close over the module-local binding, and
 * mocking the export would silently have no effect — which is exactly what
 * happened when this lived in the barrel.
 */
export type CompanyListResult = { companies: Company[]; unauthorized: boolean };

export const companiesListQueryOptions = {
  queryKey: ["companies"] as const,
  queryFn: async (): Promise<CompanyListResult> => {
    try {
      return { companies: await companiesApi.list(), unauthorized: false };
    } catch (err) {
      // A signed-out or unauthorized viewer gets an explicit flag rather than
      // an error, so the HUD can render a signed-out state instead of an
      // error boundary.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        return { companies: [], unauthorized: true };
      }
      throw err;
    }
  },
  retry: false,
} as const;

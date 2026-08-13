import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PlicaHud } from "./PlicaHud";

/**
 * Root of the Plica plugin page.
 *
 * The host bridge shares only React with plugin bundles, so Plica owns its own
 * react-query client and cache. That cache is deliberately independent of the
 * host's: Plica polls its own cross-company aggregates and never needs to
 * invalidate host queries.
 */
export function PlicaPage() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1 },
    },
  }));

  return (
    <QueryClientProvider client={client}>
      <PlicaHud />
    </QueryClientProvider>
  );
}

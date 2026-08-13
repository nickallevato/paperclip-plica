import type { DashboardRunActivityDay } from "@paperclipai/shared";
import { sparklineDays } from "../lib/plica";

const BAR_WIDTH = 6;
const BAR_GAP = 2;
const HEIGHT = 24;

/**
 * Tiny inline stacked-bar SVG: 7 trailing days of run activity, succeeded
 * (emerald) stacked over failed (red), scaled to the busiest day in the
 * window. A day with zero runs still renders a 1px baseline mark so the
 * week reads as continuous rather than missing bars.
 */
export function PlicaSparkline({ runActivity, days = 7 }: { runActivity: DashboardRunActivityDay[]; days?: number }) {
  const bars = sparklineDays(runActivity, days);
  if (bars.length === 0) return null;
  const width = bars.length * BAR_WIDTH + Math.max(0, bars.length - 1) * BAR_GAP;

  return (
    <svg
      role="img"
      aria-label="7-day run activity"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      className="shrink-0"
    >
      {bars.map((day, index) => {
        const x = index * (BAR_WIDTH + BAR_GAP);
        const failedHeight = (day.failedHeightPct / 100) * HEIGHT;
        const succeededHeight = (day.succeededHeightPct / 100) * HEIGHT;
        return (
          <g key={day.date} data-testid="sparkline-day">

            <title>{day.title}</title>
            {day.hasActivity ? (
              <>
                <rect
                  data-testid="sparkline-bar-failed"
                  x={x}
                  y={HEIGHT - failedHeight}
                  width={BAR_WIDTH}
                  height={failedHeight}
                  className="fill-red-500"
                />
                <rect
                  data-testid="sparkline-bar-succeeded"
                  x={x}
                  y={HEIGHT - failedHeight - succeededHeight}
                  width={BAR_WIDTH}
                  height={succeededHeight}
                  className="fill-emerald-500"
                />
              </>
            ) : (
              <rect
                data-testid="sparkline-bar-empty"
                x={x}
                y={HEIGHT - 1}
                width={BAR_WIDTH}
                height={1}
                className="fill-muted-foreground/40"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

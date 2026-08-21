import { useState } from "react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  PLICA_TOKEN_DEFAULTS,
  formatTokens,
  thresholdsFor,
  tokenState,
  type PlicaCompanyStats,
  type PlicaTokenSettings as TokenSettings,
  type PlicaTokenThresholds,
} from "../lib/plica";

/** The slider's ceiling and step. A month of heavy fleet work lands well inside 1B. */
const SCALE_MAX = 1_000_000_000;
const STEP = 25_000_000;

/**
 * Token thresholds, at two scopes.
 *
 * The default applies to every company without one of its own; a company can
 * carry an override. Inheriting is the absence of a row, not a copy of the
 * default — so raising the default afterwards still moves everyone who never
 * opted out.
 *
 * Sliders rather than number fields because the useful question is not "what
 * number" but "where does this line fall relative to my companies", which the
 * rail below answers by showing each company's actual usage against the bands.
 */
export function PlicaTokenSettingsPanel({
  companies,
  statsById,
  settings,
  onChange,
  onClose,
}: {
  companies: Company[];
  statsById: Record<string, PlicaCompanyStats | undefined>;
  settings: TokenSettings;
  onChange: (next: TokenSettings) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<string>("default");
  const scopeCompany = companies.find((company) => company.id === scope) ?? null;
  const inherited = scopeCompany !== null && settings.overrides[scopeCompany.id] === undefined;
  const editing: PlicaTokenThresholds = scopeCompany
    ? (settings.overrides[scopeCompany.id] ?? settings.defaults)
    : settings.defaults;

  const apply = (next: PlicaTokenThresholds) => {
    if (!scopeCompany) {
      onChange({ ...settings, defaults: next });
      return;
    }
    onChange({ ...settings, overrides: { ...settings.overrides, [scopeCompany.id]: next } });
  };

  // Dragging one line past the other pushes it rather than clamping, so a drag
  // never silently stops moving.
  const setWarn = (warn: number) => apply({ warn, crit: Math.max(settingsCrit(editing, warn), warn + STEP) });
  const setCrit = (crit: number) => apply({ warn: Math.min(editing.warn, crit - STEP), crit });

  const toggleOverride = (on: boolean) => {
    if (!scopeCompany) return;
    const overrides = { ...settings.overrides };
    if (on) overrides[scopeCompany.id] = settings.defaults;
    else delete overrides[scopeCompany.id];
    onChange({ ...settings, overrides });
  };

  const warnPct = Math.min(100, (editing.warn / SCALE_MAX) * 100);
  const critPct = Math.min(100, (editing.crit / SCALE_MAX) * 100);

  const banded = companies.map((company) => ({
    company,
    tokens: statsById[company.id]?.tokens,
    state: statsById[company.id]?.tokens === undefined
      ? null
      : tokenState(statsById[company.id]!.tokens!, thresholdsFor(settings, company.id)),
  }));

  return (
    <div data-token-settings className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-semibold">Token thresholds</span>
        <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
          Monthly tokens · colours the Spend column on the board
        </span>
        <button
          type="button"
          onClick={() => onChange({ defaults: PLICA_TOKEN_DEFAULTS, overrides: {} })}
          className="ml-auto rounded-md border px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground hover:text-foreground"
        >
          Reset all
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close token settings"
          className="rounded-md border px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground hover:text-foreground"
        >
          Done
        </button>
      </div>

      <div role="group" aria-label="Threshold scope" className="flex flex-wrap items-center gap-1">
        <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">Editing</span>
        <div className="flex flex-wrap items-center rounded-md border p-0.5">
          <button
            type="button"
            aria-pressed={scope === "default"}
            onClick={() => setScope("default")}
            className={cn(
              "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
              scope === "default" ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Default
          </button>
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              aria-pressed={scope === company.id}
              title={company.name}
              onClick={() => setScope(company.id)}
              className={cn(
                "relative rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                scope === company.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {company.issuePrefix}
              {settings.overrides[company.id] && (
                <span aria-hidden className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className={cn("space-y-1", inherited && "opacity-60")}>
          {scopeCompany ? (
            <label className="flex items-center gap-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              <input
                type="checkbox"
                checked={!inherited}
                onChange={(event) => toggleOverride(event.target.checked)}
                className="h-3.5 w-3.5"
              />
              Override the default for {scopeCompany.name}
            </label>
          ) : (
            <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              Applies to every company without an override of its own.
            </p>
          )}

          <label
            htmlFor="plica-warn"
            className="flex items-baseline gap-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground"
          >
            <span aria-hidden className="h-2 w-2 self-center rounded-sm bg-amber-500" />
            Warn above
            <output className="ml-auto text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-semibold tabular-nums normal-case tracking-normal text-foreground">
              {formatTokens(editing.warn)}
            </output>
          </label>
          <input
            id="plica-warn"
            type="range"
            min={STEP}
            max={SCALE_MAX - STEP}
            step={STEP}
            value={editing.warn}
            disabled={inherited}
            onChange={(event) => setWarn(Number(event.target.value))}
            className="w-full accent-primary"
          />

          <label
            htmlFor="plica-crit"
            className="flex items-baseline gap-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground"
          >
            <span aria-hidden className="h-2 w-2 self-center rounded-sm bg-red-500" />
            Critical above
            <output className="ml-auto text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-semibold tabular-nums normal-case tracking-normal text-foreground">
              {formatTokens(editing.crit)}
            </output>
          </label>
          <input
            id="plica-crit"
            type="range"
            min={STEP * 2}
            max={SCALE_MAX}
            step={STEP}
            value={editing.crit}
            disabled={inherited}
            onChange={(event) => setCrit(Number(event.target.value))}
            className="w-full accent-primary"
          />

          {inherited && scopeCompany && (
            <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              Inheriting the default — {formatTokens(settings.defaults.warn)} / {formatTokens(settings.defaults.crit)}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <span className="block text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground">
            Where your companies land
          </span>
          {/* The bands at the scope being edited, with a tick per company's
              actual usage — the question is where the line falls, not what
              number it is. */}
          <div
            className="relative h-3 rounded border"
            style={{
              background: `linear-gradient(to right, var(--muted) 0 ${warnPct}%, rgb(245 158 11 / 0.7) ${warnPct}% ${critPct}%, rgb(239 68 68 / 0.75) ${critPct}% 100%)`,
            }}
          >
            {banded.map(({ company, tokens }) =>
              tokens === undefined ? null : (
                <span
                  key={company.id}
                  title={`${company.name} · ${formatTokens(tokens)}`}
                  className={cn(
                    "absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground",
                    scopeCompany?.id === company.id ? "opacity-100 w-1" : "opacity-40",
                  )}
                  style={{ left: `${Math.min(100, (tokens / SCALE_MAX) * 100)}%` }}
                />
              ),
            )}
          </div>
          <div className="flex justify-between text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums text-muted-foreground">
            <span>0</span>
            <span>{formatTokens(SCALE_MAX / 2)}</span>
            <span>{formatTokens(SCALE_MAX)}</span>
          </div>

          <div className="space-y-0.5 pt-1">
            {(["crit", "warn", "ok"] as const).map((state) => {
              const inBand = banded.filter((row) => row.state === state);
              return (
                <div
                  key={state}
                  className="flex items-center gap-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-sm",
                      state === "crit" ? "bg-red-500" : state === "warn" ? "bg-amber-500" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="w-14 shrink-0 uppercase tracking-wide text-muted-foreground">
                    {state === "crit" ? "Critical" : state === "warn" ? "Warn" : "Normal"}
                  </span>
                  <span className="w-4 shrink-0 text-right font-semibold tabular-nums">{inBand.length}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {inBand.length
                      ? inBand
                          .map(
                            (row) =>
                              `${row.company.issuePrefix} ${row.tokens === undefined ? "—" : formatTokens(row.tokens)}`,
                          )
                          .join(" · ")
                      : "none"}
                  </span>
                </div>
              );
            })}
          </div>
          {banded.every((row) => row.tokens === undefined) && (
            <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              No token figures yet — the costs endpoint needs cost read access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Keeps crit above warn when warn is dragged upward past it. */
function settingsCrit(current: PlicaTokenThresholds, nextWarn: number): number {
  return current.crit > nextWarn ? current.crit : nextWarn + STEP;
}

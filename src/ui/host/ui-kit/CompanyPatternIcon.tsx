import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../util";

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

interface CompanyPatternIconProps {
  companyName: string;
  logoUrl?: string | null;
  className?: string;
  logoFit?: "cover" | "contain";
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

const PATTERN_SIZE = 22;
const PATTERN_CELL = 2;
const DOT_RADIUS_RATIO = 0.46;

interface PatternParams {
  off: [number, number, number];
  on: [number, number, number];
  center: number;
  gradientDirX: number;
  gradientDirY: number;
  maxProjection: number;
  diagonalFrequency: number;
  antiDiagonalFrequency: number;
  diagonalPhase: number;
  antiDiagonalPhase: number;
}

/**
 * Every value the pattern is drawn from, in the exact order the PRNG yields
 * them. Both the canvas draw and the accent colour go through here so the two
 * can never drift apart.
 */
function patternParams(
  seed: string,
  logicalSize: number,
  hueOverride?: number,
): PatternParams {
  const rand = mulberry32(hashString(seed));

  // The drawn hue is consumed even when overridden, so every later value in
  // the sequence -- dither phases, gradient angle -- stays put and only the
  // colour moves.
  const drawnHue = Math.floor(rand() * 360);
  const hue = hueOverride ?? drawnHue;
  const off = hslToRgb(
    hue,
    54 + Math.floor(rand() * 14),
    36 + Math.floor(rand() * 12),
  );
  const on = hslToRgb(
    hue + (rand() > 0.5 ? 10 : -10),
    86 + Math.floor(rand() * 10),
    82 + Math.floor(rand() * 10),
  );

  const center = (logicalSize - 1) / 2;
  const half = Math.max(center, 1);
  const gradientAngle = rand() * Math.PI * 2;
  const gradientDirX = Math.cos(gradientAngle);
  const gradientDirY = Math.sin(gradientAngle);

  return {
    off,
    on,
    center,
    gradientDirX,
    gradientDirY,
    maxProjection: Math.abs(gradientDirX * half) + Math.abs(gradientDirY * half),
    diagonalFrequency: 0.34 + rand() * 0.12,
    antiDiagonalFrequency: 0.33 + rand() * 0.12,
    diagonalPhase: rand() * Math.PI * 2,
    antiDiagonalPhase: rand() * Math.PI * 2,
  };
}

/** Whether cell (x, y) gets an "on" dot, per the canonical 16-level Bayer dither. */
function isOnCell(p: PatternParams, x: number, y: number): boolean {
  const dx = x - p.center;
  const dy = y - p.center;

  // Side-to-side signal where visible gradient is produced by dither density.
  const projection = dx * p.gradientDirX + dy * p.gradientDirY;
  const gradient = (projection / p.maxProjection + 1) * 0.5;
  const diagonal =
    Math.sin((dx + dy) * p.diagonalFrequency + p.diagonalPhase) * 0.5 + 0.5;
  const antiDiagonal =
    Math.sin((dx - dy) * p.antiDiagonalFrequency + p.antiDiagonalPhase) * 0.5 + 0.5;
  const hatch = diagonal * 0.5 + antiDiagonal * 0.5;
  const signal = Math.max(0, Math.min(1, gradient + (hatch - 0.5) * 0.22));

  const level = Math.max(0, Math.min(15, Math.floor(signal * 16)));
  return level > BAYER_4X4[y & 3]![x & 3]!;
}

/**
 * A company's accent as a CSS colour: the pattern icon's dominant colour.
 *
 * The tile is an ordered dither of a saturated base against a pale tint, and
 * the base is what covers most of it -- so the base *is* the dominant colour,
 * and reading it straight off patternParams() keeps the accent and the avatar
 * in step by construction.
 *
 * Paperclip removed per-company brand colours in upstream #12291 (the column
 * is gone from the database), so the seed is the name alone.
 */
export function companyAccentColor(companyName: string, hue?: number): string {
  const [r, g, b] = patternParams(companyName.trim().toLowerCase(), PATTERN_SIZE, hue).off;
  return `rgb(${r} ${g} ${b})`;
}

const CompanyHueContext = createContext<ReadonlyMap<string, number> | null>(null);

/**
 * Hues spaced evenly around the wheel, one per company.
 *
 * Hashing each name on its own is what let two companies land on neighbouring
 * hues -- with a handful of companies a near-collision is likely, not unlucky.
 * Dealing the whole set out at equal intervals makes the worst separation the
 * best it can be. The set seeds the starting offset, so the wheel is stable
 * for a given roster; adding or removing a company reshuffles it.
 */
export function companyHues(names: readonly string[]): Map<string, number> {
  const unique = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))].sort();
  const hues = new Map<string, number>();
  if (unique.length === 0) return hues;

  const start = hashString(unique.join("\u0000")) % 360;
  const step = 360 / unique.length;
  unique.forEach((name, index) => {
    hues.set(name, Math.round((start + index * step) % 360));
  });
  return hues;
}

export function CompanyHueProvider({
  names,
  children,
}: {
  names: readonly string[];
  children: ReactNode;
}) {
  const key = names.map((name) => name.trim().toLowerCase()).sort().join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the roster
  const hues = useMemo(() => companyHues(names), [key]);
  return <CompanyHueContext.Provider value={hues}>{children}</CompanyHueContext.Provider>;
}

/** The spaced hue for a company, or undefined outside a provider (then the name hash stands). */
export function useCompanyHue(companyName: string): number | undefined {
  return useContext(CompanyHueContext)?.get(companyName.trim().toLowerCase());
}

/** The accent for a company, spaced against the rest of the roster when one is in scope. */
export function useCompanyAccentColor(companyName: string): string {
  const hue = useCompanyHue(companyName);
  return companyAccentColor(companyName, hue);
}

function makeCompanyPatternDataUrl(
  seed: string,
  hueOverride?: number,
  logicalSize = PATTERN_SIZE,
  cellSize = PATTERN_CELL,
): string {
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = logicalSize * cellSize;
  canvas.height = logicalSize * cellSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const p = patternParams(seed, logicalSize, hueOverride);
  const [offR, offG, offB] = p.off;
  const [onR, onG, onB] = p.on;

  // token-extraction: allowlisted — canvas 2D fillStyle computed at runtime from numeric channel props; not a static literal.
  ctx.fillStyle = `rgb(${offR} ${offG} ${offB})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = `rgb(${onR} ${onG} ${onB})`;
  const dotRadius = cellSize * DOT_RADIUS_RATIO;

  for (let y = 0; y < logicalSize; y++) {
    for (let x = 0; x < logicalSize; x++) {
      if (!isOnCell(p, x, y)) continue;

      const cx = x * cellSize + cellSize / 2;
      const cy = y * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toDataURL("image/png");
}

export function CompanyPatternIcon({
  companyName,
  logoUrl,
  className,
  logoFit = "cover",
}: CompanyPatternIconProps) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "?";
  const [imageError, setImageError] = useState(false);
  const logo = !imageError && typeof logoUrl === "string" && logoUrl.trim().length > 0 ? logoUrl : null;
  useEffect(() => {
    setImageError(false);
  }, [logoUrl]);
  const hue = useCompanyHue(companyName);
  const patternDataUrl = useMemo(
    () => makeCompanyPatternDataUrl(companyName.trim().toLowerCase(), hue),
    [companyName, hue],
  );

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-11 h-11 text-base font-semibold text-white overflow-hidden",
        className,
      )}
    >
      {logo ? (
        <img
          src={logo}
          alt={`${companyName} logo`}
          onError={() => setImageError(true)}
          className={cn(
            "absolute inset-0 h-full w-full",
            logoFit === "contain" ? "object-contain" : "object-cover",
          )}
        />
      ) : patternDataUrl ? (
        <img
          src={patternDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      {!logo && (
        <span className="relative z-10 drop-shadow-(--drop-shadow-extract-1)">
          {initial}
        </span>
      )}
    </div>
  );
}

#!/usr/bin/env node
/**
 * Shoots the board at whole screen sizes, for a before-and-after of the rail.
 *
 * `capture-screenshots.mjs` crops to an element, which is the right picture for
 * documentation and the wrong one for a question about height: a crop cannot
 * show that the bottom pane is below the fold, because the fold is the thing it
 * cropped away. This one takes the viewport, whole, at the two sizes the rail's
 * behaviour is argued about — a 13" laptop and a 27" monitor — so the fold is
 * in the picture.
 *
 * It drives the same instance `capture-screenshots.mjs` does; stand one up the
 * way `docs/screenshots/README.md` describes. To shoot a "before", build an
 * older `dist/` into the worktree the plugin was installed from and run it
 * again with a different label — the instance serves the plugin from there, so
 * no reinstall is needed.
 *
 * Usage:
 *   node scripts/capture-rail.mjs after
 *   node scripts/capture-rail.mjs before
 *
 * Environment: the same knobs as `capture-screenshots.mjs` —
 *   TICKLER_SHOT_URL, TICKLER_SHOT_PREFIX, TICKLER_PLAYWRIGHT, TICKLER_CHROME,
 *   TICKLER_SHOT_OUT (default docs/screenshots/rail), TICKLER_SHOT_THEME —
 *   plus TICKLER_SHOT_SCREENS to shoot sizes other than the two defaults,
 *   e.g. `390x844@3,820x1180@2`.
 */

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.TICKLER_SHOT_OUT
  ? resolve(process.env.TICKLER_SHOT_OUT)
  : join(root, "docs", "screenshots", "rail");
const baseUrl = (process.env.TICKLER_SHOT_URL ?? "http://127.0.0.1:3199").replace(/\/+$/, "");
const theme = process.env.TICKLER_SHOT_THEME === "light" ? "light" : "dark";
const label = process.argv[2] ?? "after";

/**
 * The two screens the argument is about. The laptop is shot at 2x so the rail's
 * text is legible where it is small; the monitor is already 2560 wide, and
 * doubling it makes a picture nobody can open.
 */
const DEFAULT_SCREENS = [
  { name: "laptop-1512x790", width: 1512, height: 790, scale: 2 },
  { name: "desktop-2560x1400", width: 2560, height: 1400, scale: 1 },
];

/**
 * `WxH` or `WxH@scale`, comma-separated — the narrow layout's argument is about
 * sizes neither default covers, and a phone wants a scale of its own.
 */
function parseScreens(spec) {
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(entry);
      if (!match) throw new Error(`capture-rail: TICKLER_SHOT_SCREENS entry "${entry}" is not WxH or WxH@scale`);
      const [width, height] = [Number(match[1]), Number(match[2])];
      return { name: `${width}x${height}`, width, height, scale: match[3] ? Number(match[3]) : 2 };
    });
}

const SCREENS = process.env.TICKLER_SHOT_SCREENS ? parseScreens(process.env.TICKLER_SHOT_SCREENS) : DEFAULT_SCREENS;

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`capture-rail: GET ${path} -> ${response.status}`);
  return response.json();
}

async function resolvePrefix() {
  if (process.env.TICKLER_SHOT_PREFIX) return process.env.TICKLER_SHOT_PREFIX.toLowerCase();
  const companies = await getJson("/api/companies");
  const list = Array.isArray(companies) ? companies : (companies.companies ?? []);
  const company = list.find((entry) => entry.status === "active") ?? list[0];
  if (!company) throw new Error("capture-rail: the instance has no company to mount the route under");
  return String(company.issuePrefix ?? company.prefix).toLowerCase();
}

/** The host's announcement card sits over the rail, which is the subject. */
async function dismissAnnouncement() {
  try {
    const current = await fetch(`${baseUrl}/api/announcements/current`);
    if (!current.ok) return;
    const announcement = await current.json();
    if (!announcement?.id) return;
    for (const company of await getJson("/api/companies")) {
      await fetch(`${baseUrl}/api/announcements/${announcement.id}/dismiss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
    }
  } catch {
    // Nothing to dismiss is the common case.
  }
}

const require = createRequire(join(process.env.TICKLER_PLAYWRIGHT ?? join(homedir(), "paperclip"), "package.json"));
const { chromium } = require("playwright");

const prefix = await resolvePrefix();
await dismissAnnouncement();
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.TICKLER_CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none"],
});

try {
  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
      colorScheme: theme,
      locale: "en-US",
      timeZoneId: "UTC",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate((value) => localStorage.setItem("paperclip.theme", value), theme);
      await page.goto(`${baseUrl}/${prefix}/tickler?demo=1`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForSelector("[data-tickler-queue] [data-queue-item]", { timeout: 60_000 });
      await page.waitForTimeout(3000);
      // The viewport, not `fullPage`: what is below the fold has to stay below
      // the fold, or the picture cannot answer the question it was taken for.
      await page.screenshot({ path: join(outDir, `${screen.name}-${label}.png`) });
      console.log(`✓ ${screen.name}-${label}.png`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

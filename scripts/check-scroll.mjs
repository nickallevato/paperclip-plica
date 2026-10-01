#!/usr/bin/env node
/**
 * Fails if any box on the board scrolls when it has nothing to scroll to.
 *
 * The claim in PLI-263 — a scrollbar where the layout does not need one — is
 * not a claim a unit test can settle. The rail's budget is arithmetic over
 * measurements, and the defect was in the measuring: `offsetHeight` is an
 * integer, a rail row is 28.297px, and three of them budgeted 28 apiece left
 * the pane a pixel short of its own contents. Only a browser laying the board
 * out can say whether that pixel is there, so this drives one.
 *
 * A pane that *is* holding rows back should scroll — that is the "+N more" in
 * its header, and it is the point. What must never happen is a box that scrolls
 * while its pane claims to be showing everything, or one that scrolls by less
 * than a row: nobody asked to scroll a fraction.
 *
 * It drives the same instance the capture scripts do; stand one up the way
 * `docs/screenshots/README.md` describes. Environment: TICKLER_SHOT_URL,
 * TICKLER_SHOT_PREFIX, TICKLER_PLAYWRIGHT, TICKLER_CHROME, plus
 * TICKLER_SHOT_SCREENS to check sizes other than the default sweep.
 *
 * Usage:
 *   node scripts/check-scroll.mjs
 *   TICKLER_SHOT_SCREENS=1920x1080 node scripts/check-scroll.mjs --verbose
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { homedir } from "node:os";

const baseUrl = (process.env.TICKLER_SHOT_URL ?? "http://127.0.0.1:3199").replace(/\/+$/, "");
const verbose = process.argv.includes("--verbose");

/**
 * The sweep. Width decides the layout — under 64rem the rail is one column and
 * has no budget to get wrong — and height is what the budget divides, so the
 * heights are the axis that matters and they are the common screens plus the
 * two the rail's behaviour is usually argued about.
 */
const WIDTHS = [1280, 1512, 1920, 2560];
const HEIGHTS = [700, 790, 860, 940, 1024, 1080, 1200, 1400];

function parseScreens(spec) {
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+)x(\d+)$/.exec(entry);
      if (!match) throw new Error(`check-scroll: TICKLER_SHOT_SCREENS entry "${entry}" is not WxH`);
      return { width: Number(match[1]), height: Number(match[2]) };
    });
}

const SCREENS = process.env.TICKLER_SHOT_SCREENS
  ? parseScreens(process.env.TICKLER_SHOT_SCREENS)
  : WIDTHS.flatMap((width) => HEIGHTS.map((height) => ({ width, height })));

async function resolvePrefix() {
  if (process.env.TICKLER_SHOT_PREFIX) return process.env.TICKLER_SHOT_PREFIX.toLowerCase();
  const response = await fetch(`${baseUrl}/api/companies`);
  if (!response.ok) throw new Error(`check-scroll: GET /api/companies -> ${response.status}`);
  const body = await response.json();
  const list = Array.isArray(body) ? body : (body.companies ?? []);
  const company = list.find((entry) => entry.status === "active") ?? list[0];
  if (!company) throw new Error("check-scroll: the instance has no company to mount the route under");
  return String(company.issuePrefix ?? company.prefix).toLowerCase();
}

/**
 * Every scroller on the board that cannot justify itself.
 *
 * Runs in the page. `scrollTop` is the test rather than
 * `scrollHeight - clientHeight`, because those two are rounded integers and can
 * differ by a pixel on a box whose fractional contents really do fit — a box
 * that will not take a scroll is not painting a scrollbar either.
 */
function findPhantoms() {
  const board = document.querySelector("[data-view=board]");
  if (!board) return [{ where: "board", why: "the board never rendered" }];
  const out = [];
  for (const el of (board.closest("main") ?? document.body).querySelectorAll("*")) {
    if (!["auto", "scroll", "overlay"].includes(getComputedStyle(el).overflowY)) continue;
    const held = el.scrollTop;
    el.scrollTop = 1e6;
    const reach = el.scrollTop;
    el.scrollTop = held;
    if (reach <= 0) continue;
    const pane = el.closest("[data-rail-pane]");
    const where = pane?.getAttribute("data-rail-pane") ?? (el.closest("[data-tickler-queue]") ? "queue" : el.tagName.toLowerCase());
    const more = pane?.querySelector("[data-rail-more]")?.textContent?.trim() ?? null;
    const rows = Array.from((pane ?? el).querySelectorAll("[data-rail-row]"));
    const row = rows.length ? Math.max(...rows.map((node) => node.getBoundingClientRect().height)) : null;
    // Holding rows back and scrolling by about a row's worth or more is the
    // pane doing its job. The pixel of slack is the integer `scrollTop`.
    if (more && row !== null && reach >= row - 1.5) continue;
    // The queue owns the main column and is as long as the work is; it is the
    // page's scroller by design, not a pane with a budget.
    if (where === "queue" || where === "main") continue;
    out.push({ where, why: more ? `scrolls ${reach}px, less than one ${Math.round(row)}px row` : `scrolls ${reach}px while claiming to show every row`, reach, more });
  }
  return out;
}

const require = createRequire(join(process.env.TICKLER_PLAYWRIGHT ?? join(homedir(), "paperclip"), "package.json"));
const { chromium } = require("playwright");

const prefix = await resolvePrefix();
const browser = await chromium.launch({
  executablePath: process.env.TICKLER_CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

const failures = [];
try {
  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: screen,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      locale: "en-US",
      timeZoneId: "UTC",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => localStorage.setItem("paperclip.theme", "dark"));
      await page.goto(`${baseUrl}/${prefix}/tickler?demo=1`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await page.waitForSelector("[data-tickler-queue] [data-queue-item]", { timeout: 60_000 });
      // The budget settles on the layout effect after the first poll paints.
      await page.waitForTimeout(2500);
      const phantoms = await page.evaluate(findPhantoms);
      const name = `${screen.width}x${screen.height}`;
      if (phantoms.length === 0) {
        if (verbose) console.log(`✓ ${name}`);
      } else {
        for (const phantom of phantoms) {
          console.log(`✗ ${name}: ${phantom.where} ${phantom.why}`);
          failures.push({ screen: name, ...phantom });
        }
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(
  failures.length === 0
    ? `\ncheck-scroll: ${SCREENS.length} screens, no scrollbar the layout did not need`
    : `\ncheck-scroll: ${failures.length} phantom scroller(s) over ${SCREENS.length} screens`,
);
process.exit(failures.length === 0 ? 0 : 1);

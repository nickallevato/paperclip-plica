#!/usr/bin/env node
/**
 * Shoots a standalone `docs/mockups/*.html` study, one image per layout ×
 * screen-size pair.
 *
 * The mockups are plain files with no server behind them, so unlike
 * `capture-screenshots.mjs` this needs no running Paperclip — it opens the
 * file over `file://`, clicks the study's own toggles, and crops to the
 * simulated screen. Playwright is resolved the same way, from the host
 * checkout, so this repo still installs nothing.
 *
 * Usage:
 *   node scripts/capture-mockup.mjs sidebar-v3
 *   node scripts/capture-mockup.mjs sidebar-v3 --only budget,tabs
 *
 * Environment:
 *   TICKLER_PLAYWRIGHT  package root to resolve `playwright` from
 *   TICKLER_CHROME      browser executable (default /usr/bin/google-chrome)
 *   TICKLER_SHOT_OUT    output directory (default docs/mockups/<name>)
 */

import { createRequire } from "node:module";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
if (!name) {
  console.error("usage: capture-mockup.mjs <mockup-name> [--only a,b]");
  process.exit(2);
}
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;

const page = join(root, "docs", "mockups", `${name}.html`);
if (!existsSync(page)) throw new Error(`no mockup at ${page}`);
const outDir = process.env.TICKLER_SHOT_OUT
  ? resolve(process.env.TICKLER_SHOT_OUT)
  : join(root, "docs", "mockups", name);
mkdirSync(outDir, { recursive: true });

const chrome = process.env.TICKLER_CHROME ?? "/usr/bin/google-chrome";
const require_ = createRequire(join(process.env.TICKLER_PLAYWRIGHT ?? join(homedir(), "paperclip"), "noop.js"));
const { chromium } = require_("playwright");

/** Layout × screen × org-count triples worth a picture; the rest is one click away. */
const SHOTS = [
  { layout: "current", screen: "1440x900" },
  { layout: "current", screen: "1512x790" },
  { layout: "current", screen: "1512x790", orgs: 12 },
  { layout: "budget", screen: "1440x900" },
  { layout: "budget", screen: "1512x790" },
  { layout: "budget", screen: "1512x790", orgs: 12 },
  { layout: "budget", screen: "2560x1400" },
  { layout: "budget", screen: "1180x600", orgs: 12 },
  { layout: "tabs", screen: "1440x900", orgs: 12 },
  { layout: "custom", screen: "1440x900" },
  { layout: "strip", screen: "1280x720" },
];

const browser = await chromium.launch({ executablePath: chrome });
const ctx = await browser.newContext({
  viewport: { width: 1700, height: 1200 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const tab = await ctx.newPage();
await tab.goto(pathToFileURL(page).href);

for (const shot of SHOTS) {
  const orgs = shot.orgs ?? 4;
  const id = `${shot.layout}-${shot.screen}${orgs === 4 ? "" : `-${orgs}orgs`}`;
  if (only && !only.has(shot.layout) && !only.has(id)) continue;
  await tab.click(`[data-orgs="${orgs}"]`);
  await tab.click(`[data-screen="${shot.screen}"]`);
  await tab.click(`[data-layout="${shot.layout}"]`);
  // The budget pass runs in a rAF after the rail has a height; give it a frame.
  await tab.waitForTimeout(200);
  const file = join(outDir, `${id}.png`);
  await tab.locator("#screen").screenshot({ path: file });
  console.log(`wrote ${file}`);
}

await browser.close();

# Troubleshooting

## The whole app is stuck in its mobile layout

Sidebars collapsed, desktop-only elements missing, everything in one column —
across the whole of Paperclip, not just the Plica page.

**Cause:** you upgraded Paperclip and did not rebuild Plica.

Plica usually tells you so itself. A **Stylesheet stale** badge sits in the
Plica header beside the Demo data badge whenever the stylesheet it was built
against is not the one the page is serving, and its hover text names the fix and
shows both stylesheets:

![The Stylesheet stale badge in the Plica header, its hover text naming `pnpm build` as the fix
and showing the stylesheet Plica was built against next to the one now being
served](screenshots/stale-stylesheet-warning.png)

The badge is deliberately silent when it cannot be certain — if the host's
stylesheet cannot be identified from the page, or Plica's bundle carries no
record of what it was built against, you get nothing rather than a warning that
might be wrong. So a missing badge is not proof the stylesheet is current, and
the symptom above can appear without it.

Plica injects its own Tailwind sheet after the host's. Tailwind emits every
class it scans, including ones Paperclip already defines, and a duplicate that
lands later wins on document order. A stray `.hidden{display:none}` beats
Paperclip's `@media(min-width:40rem){.sm\:flex{…}}`, which is exactly the
`hidden sm:flex` idiom the host's responsive layout is built on.

The build strips those duplicates by subtracting the host's own selectors — but
it computes the subtraction once, against whichever `index-*.css` existed at
build time. A host upgrade rebuilds that file under a new hash and the
subtraction goes stale.

**Fix:**

```bash
cd paperclip-plica
pnpm build
```

Then reload. Do this after every Paperclip upgrade — the badge reports the
problem, but nothing rebuilds Plica for you.

## The Plica page is blank

Work through, in order:

1. **Is the plugin loaded?**
   ```bash
   paperclipai plugin inspect nickallevato.plugin-plica
   ```
   Anything other than `status=ready` prints the last error.

2. **Has it been built?** `dist/ui/index.js` must exist. A fresh clone has no
   `dist` until `pnpm build` runs.

3. **Is the URL right?** The route is `/<COMPANY-PREFIX>/plica`, where the
   prefix is a company's issue prefix (`ACME`, not the company's name or id).

4. **Anything in the browser console?** A failed chunk load usually means the
   installed path moved, or `dist` was deleted after install.

## "Demo data" badge when you did not ask for it

Two ways it turns on, and either is enough:

- `?demo=1` was used at some point in this browser session. It sticks for the
  session. Load the page with `?demo=0` to leave.
- The **Demo mode** checkbox is ticked on the plugin settings page — for *any*
  company. Host plugin config is per company; Plica is not. Check each company's
  settings page, or clear it with:
  ```bash
  paperclipai plugin config:set <plugin id> \
    --company-id <company id> --payload-json '{"demoMode":false}'
  ```

Changing the checkbox drops the session override, so the setting always wins
last.

## Demo mode shows an error instead of data

Demo mode fails closed on purpose — it will not fall back to your real instance.
The fixture is fetched from the plugin's own asset directory, so an error there
means `dist/ui/demo-data.json` is missing. Run `pnpm build`.

## "polling degraded" in the header

At least one company's poll is erroring while still holding older data. Plica
keeps showing the last good figures and says so rather than blanking the row.

Usually a transient server error or a permission gap on one endpoint. Check the
instance's logs for that company. If a company's poll fails outright with no
data at all, its row is marked unavailable instead, and its numbers are blanked
rather than drawn as zeroes.

## A company shows no token figure

Token spend comes from a permission-gated costs endpoint. A viewer without cost
access sees the column blank rather than zero — an unknown is not a nought.

## Agents show as idle when you know they are running

Capacity state is derived from the live-run list. If an agent is genuinely
running but drawn idle, its run is not in that list — check that the run started
against the company you are looking at.

A **stalled** (amber) square is different: the run is live, but nothing has come
out of it for 20 minutes. That is the case worth chasing, because nothing else
alerts on it.

## Clicking through to another company leaves the sidebar on the old one

This is a known Paperclip core defect, not a Plica bug. After any manual company
switch, an in-app navigation to a different company prefix does not re-sync the
host's selected company.

Plica works around it by doing a full page load for every cross-company hop, so
you should not hit it from the queue's Open links. If you do hit it elsewhere,
reload the page.

## `pnpm test` fails on a fresh clone

`src/ui/styles.test.ts` fails to resolve `./plica.generated.css`. That file is a
build artifact and is gitignored. Run `pnpm build` first.

The same applies to the pre-commit hook and to any CI job that tests a clean
checkout.

## "Not implemented" errors during a passing test run

Expected noise. Tests run in jsdom, which implements neither
`HTMLCanvasElement.getContext` (used to draw company avatars) nor navigation.
Both log stack traces during a run that passes. Read the summary line, not the
output.

## `pnpm install` cannot resolve `@paperclipai/shared`

The two `@paperclipai/*` dev dependencies are `link:` references at
`../../paperclip/packages/...`, relative to this repo. They only resolve if the
Paperclip checkout is two directories above it. See
[Install → where the checkout has to live](install.md#where-the-checkout-has-to-live).

## The plugin installed into the wrong instance

The CLI targets whatever `PAPERCLIP_API_URL` points at, which is easy to inherit
from a shell you have forgotten about. It prints the target before installing:

```bash
paperclipai plugin target
```

Run that first if you are not certain.

## Something else

Open an issue at
<https://github.com/nickallevato/paperclip-plica/issues>. Include the Paperclip
version (`paperclipai plugin target` prints it), Plica's version, and whether
the Demo data badge was on.

# Screenshots

Every image in this directory is produced by `scripts/capture-screenshots.mjs`
against a real running Paperclip with Plica installed, in **demo mode**. None of
them is hand-cropped, and none contains anything from a real instance.

They are shot in **dark mode**. `PLICA_SHOT_THEME=light` shoots the light theme
instead, for a one-off comparison; commit the dark ones.

```bash
node scripts/capture-screenshots.mjs           # all of them
node scripts/capture-screenshots.mjs --list    # what each one is
node scripts/capture-screenshots.mjs --only board,queue-by-company
```

Refresh them whenever a UI change makes one wrong. A stale screenshot is the
documentation defect nobody files a bug for.

## The instance it needs

Do **not** point this at your working instance: it drives the browser, and in
demo mode it will happily click Approve on the fixture, which is confusing to
watch even though nothing reaches the server.

Stand up a throwaway one instead. Paperclip's `local_trusted` deployment mode
runs without authentication on loopback, which is what makes an unattended
capture possible at all:

```bash
export SHOT_HOME=$(mktemp -d)

# 1. A throwaway instance on its own port, with its own data directory.
cd ~/dev/paperclip
PAPERCLIP_HOME=$SHOT_HOME \
PAPERCLIP_INSTANCE_ID=plica-shots \
PAPERCLIP_CONFIG=$SHOT_HOME/instances/plica-shots/config.json \
PAPERCLIP_BIND=loopback \
PAPERCLIP_DEPLOYMENT_MODE=local_trusted \
PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
PORT=3199 \
  pnpm paperclipai onboard --yes --run

# 2. One company, so the /:companyPrefix/plica route has a prefix to mount under.
#    Demo mode replaces its data entirely; only the prefix is used.
curl -s -X POST -H 'content-type: application/json' \
  -d '{"name":"Demo Co"}' http://127.0.0.1:3199/api/companies

# 3. Install Plica into it. Note the explicit target — the CLI otherwise
#    installs into whatever PAPERCLIP_API_URL points at.
PAPERCLIP_API_URL=http://127.0.0.1:3199 \
  pnpm paperclipai plugin install /abs/path/to/paperclip-plica --local

# 4. Capture.
cd /abs/path/to/paperclip-plica
node scripts/capture-screenshots.mjs
```

Delete `$SHOT_HOME` afterwards.

If the CLI's post-install step fails on an `activity_log` insert, check that
`PAPERCLIP_RUN_ID` is not set in your shell — it is written to the log row and
will not resolve against a fresh database. The plugin itself installs fine;
`paperclipai plugin list` will show it as `ready`.

## Knobs

| Variable | Default | |
| --- | --- | --- |
| `PLICA_SHOT_URL` | `http://127.0.0.1:3199` | The instance to drive. |
| `PLICA_SHOT_PREFIX` | first active company | Company prefix for the route. |
| `PLICA_SHOT_PLUGIN_ID` | looked up from `/api/plugins` | Plugin row UUID, for the settings-page shot. |
| `PLICA_PLAYWRIGHT` | `~/paperclip` | Package root to resolve `playwright` from. |
| `PLICA_CHROME` | `/usr/bin/google-chrome` | Browser executable. |
| `PLICA_SHOT_OUT` | `docs/screenshots` | Where the PNGs go. |

Playwright is deliberately **not** a dependency of this repo. Adding it plus a
browser download would cost every contributor a couple of hundred megabytes for
a script most of them never run, and a `link:` dependency on the Paperclip
checkout is not allowed. It is resolved at runtime from the checkout that
already has it, read-only.

## Why the shots are the size they are

The viewport is 1600 × 1800 at 2× device scale. The height is not cosmetic: the
host scrolls an inner `<main>` rather than the document, so a `fullPage`
screenshot captures only what is painted, and anything below the fold is missing
rather than scrolled to. A viewport taller than the content is what gets the
queue and the rail's footer into one frame.

Crops are computed from element bounding boxes rather than fixed pixel
rectangles, so a layout change produces a taller image instead of a cut-off one.

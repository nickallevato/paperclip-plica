# Tickler documentation

Tickler is a cross-company HUD for [Paperclip](https://github.com/paperclipai/paperclip):
one page that answers "what needs me, across every company, right now."

Start here if you have never installed it:

| | |
| --- | --- |
| **[Install](install.md)** | Build it, register it with your instance, find it in the UI, upgrade it. |
| **[Configuration](configuration.md)** | Demo mode, updating to the latest version, token thresholds, alerts, kiosk mode, and everything Tickler remembers per browser. |
| **[The Board](board.md)** | One row per company: capacity, live runs, what is waiting on you, spend. |
| **[The Queue](queue.md)** | Every item across every company that wants a human, and how to answer it without leaving the page. |
| **[Troubleshooting](troubleshooting.md)** | The page is blank, the app looks broken, "polling degraded", and the rest. |
| **[Release notes](releases/)** | What changed in each version. The [changelog](../CHANGELOG.md) is the long form. |

Contributors want [CONTRIBUTING.md](../CONTRIBUTING.md) — in particular the rule
that Tickler never modifies Paperclip core.

## A note on the screenshots

Nearly every screenshot in these pages is Tickler's own **demo mode**: four
invented companies, invented tickets, invented agents, with the orange **DEMO
DATA** badge in the header. The exceptions are hand-captured and listed in
[screenshots/README.md](screenshots/README.md#hand-captured) — the two
inline-answer shots come from Tickler's own development org, which has nothing
private in it.

The demo shots are captured by `scripts/capture-screenshots.mjs` rather than by
hand, so refreshing them after a UI change is one command. See
[screenshots/README.md](screenshots/README.md).

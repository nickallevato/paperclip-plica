# Plica documentation

Plica is a cross-company HUD for [Paperclip](https://github.com/paperclipai/paperclip):
one page that answers "what needs me, across every company, right now."

Start here if you have never installed it:

| | |
| --- | --- |
| **[Install](install.md)** | Build it, register it with your instance, find it in the UI, upgrade it. |
| **[Configuration](configuration.md)** | Demo mode, token thresholds, alerts, kiosk mode, and everything Plica remembers per browser. |
| **[The Board](board.md)** | One row per company: capacity, live runs, what is waiting on you, spend. |
| **[The Queue](queue.md)** | Every item across every company that wants a human, and how to answer it without leaving the page. |
| **[Troubleshooting](troubleshooting.md)** | The page is blank, the app looks broken, "polling degraded", and the rest. |
| **[Release notes](releases/)** | What changed in each version. The [changelog](../CHANGELOG.md) is the long form. |

Contributors want [CONTRIBUTING.md](../CONTRIBUTING.md) — in particular the rule
that Plica never modifies Paperclip core.

## A note on the screenshots

Every screenshot in these pages is Plica's own **demo mode**: four invented
companies, invented tickets, invented agents. Nothing in an image came from a
real instance, which is why they can be published at all. The orange **DEMO
DATA** badge in the header is there in every shot for the same reason.

They are captured by `scripts/capture-screenshots.mjs` rather than by hand, so
refreshing them after a UI change is one command. See
[screenshots/README.md](screenshots/README.md).

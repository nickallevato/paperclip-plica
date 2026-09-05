<!--
Three questions, and the third is the one that gets skipped. Paste real output
under "How it was verified" — a reviewer cannot tell an asserted pass from a
remembered one.
-->

## What changed

<!-- One or two sentences. What a reader of `git log` needs to know. -->

## Why

<!--
The problem, not the patch. If it closes an issue, link it: "Closes PLI-4".
If it is a core limitation you worked around inside the plugin surface, say so
here and link the limitation issue — see CONTRIBUTING.md, "When the plugin
surface is not enough".
-->

## How it was verified

<!--
Paste the output. CI green is necessary, not sufficient — say what you actually
exercised, including anything CI cannot reach (the HUD in a running host, a
Paperclip upgrade, a screenshot).
-->

```
```

## Checklist

- [ ] Branched from `main`, named `<issue-key|type>/<kebab-slug>`.
- [ ] Does not modify Paperclip core (`pnpm check:surface`).
- [ ] `pnpm typecheck`, `pnpm build`, `pnpm test` pass locally.
- [ ] User-facing? Says so above, so it reaches the README and `CHANGELOG.md`.
- [ ] Someone other than the author merges this. Do not merge your own.

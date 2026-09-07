# Overnight Collection V2 — structure refresh + exact market refresh

Scope: `backend/src/market-refresh/autopilot` (structure collection) and
`backend/src/market-refresh/weekly` (exact-target market refresh). Terminology:
structure collection, source-page acquisition, market refresh, evidence
collection, incremental update, category traversal, source validation.

No CAPTCHA solving, access-control bypass, session bypass or stealth: every
login / 2FA / access-restriction page still stops the run (fail closed).

## 1. Measured baseline (run `structure-2026-09`)

| Phase | Measured |
|---|---|
| Completed targets | 8468 (6533 saved, 1935 already present, 3 failed exceptions) |
| Wall clock | 61.7 h, of which 43.0 h were 9 interruptions (>15 min idle) |
| Active runtime | 18.6 h |
| Full rebuilds | 131 (every 50 saved pages), 7.0 h = 37.5 % of active time |
| hierarchy:build | 22 s at start → 275 s at end (4.5 h total) |
| listings / coverage / validate | 23 s / 16 s / 31 s average |
| Acquisition + pacing | 11.7 h = 63 %; capture-to-capture gap avg 6.44 s, p50 6.23 s (5000 ms ± 40 % pacing + ~1.4 s capture) |

Root cause of the rebuild growth: `reconcileDirectNavPaths` used linear
`Array.find` scans over all observations (O(n²)); 119 s per call, called twice
per build (before/after listing discovery) = 242 s of the 300 s build. Fixed
with identity/file indexes; the real corpus builds an identical tree (9611
nodes, 0 differing) in 0.2 s per call.

## 2. Structure V2

### Light structure gate (`structure-light-gate.ts`)
In-memory check over the session's own target table every
`--light-check-every` accepted pages (default 50): breadcrumb present and
consistent (depth, make), own path == requested key, parent chain is a prefix
of the child chain (a deeper chain needs recorded refinement evidence), slug
descends from the parent slug, no two source URLs own the same exact path, no
saved file claimed twice, saved pages carry menu evidence, no BLOCKED target.
~100 ms for 8.5k targets. A failing gate stops the run (`LIGHT_GATE_FAIL`).
It never publishes.

Real-data result: on the completed checkpoint it reports exactly one finding,
`DUPLICATE_EXACT_PATH /audi-tts-2.0-tfsi vs /audi-tts-2.0-tfsi-2.0-tfsi`. This
is genuine: the corpus index matched the declared child by breadcrumb to a page
whose own URL differs, so the declared page was never fetched. `present()` now
requires the page's own path to equal the requested slug (1 of 1935 present
targets affected); the next incremental run fetches it.

### Full release gate
Unchanged chain (hierarchy:build → listings:build → coverage:manifest →
corpus:validate → atomic release). Cadence: `--full-rebuild-every` pages
(default 400) **or** `--full-rebuild-minutes` (default 40), whichever first,
and always once at the end. `--no-rebuild` is only accepted with `--dry-run`
or `--max-pages`. Changing the cadence does not change the final structure
(test: `benchmark fixture`).

### Pacing
`--pace-mode safe` (5000 ms ± 40 %, unchanged default) or `overnight`
(2200 ms ± 30 %). Hard floor 1000 ms in every mode. Backoff ×1.5 (max ×4) on
redirect mismatch, not-found, breadcrumb drift and slow responses (round trip
≥ 5 s and > 2× the rolling median of the last 20); recovers ×0.8 after 10
consecutive successes. Security pages stop the run instead of pacing.

### Already-present targets
Resolved locally from the corpus index (one file read + classification per
node, cached); they pay no network pacing. New: own-path identity check.

### Incremental structure mode
`--structure-mode incremental --stale-days N`: everything present resolves
locally; nonterminal pages whose corpus file is older than N days are
refetched and compared. Same breadcrumb + same direct children → `REVERIFIED`
(no duplicate corpus file). Children changed → `DRIFT CHILDREN_CHANGED`
(evidence under `evidence/drift/`, entry in `drift-registry.json`, corpus
copy kept, new children queued). Breadcrumb changed → `DRIFT
BREADCRUMB_CHANGED` (target FAILED, nothing expanded, human review). Redirect
mismatches and source not-found pages are also recorded in the drift
registry. History is never deleted.

### Instrumentation / status
Checkpoint and status carry: capture round trip, corpus scan time, light and
full gate time, persist time, average capture cycle, estimated remaining time,
light/full gate counts and last results, pace mode and current pace,
reverified/drift counts. The popup shows light gates, pace and ETA.

### Concurrency
`--concurrency` accepts only 1. Two-worker mode would need: one shared rate
limiter, target leases (no target IN_PROGRESS in two workers), serialized
checkpoint commits, atomic evidence writes, per-worker crash recovery, shared
security stop and a shared rebuild barrier. Benchmarking shows the overnight
target is reachable with one worker, so this is deliberately not enabled.

## 3. Market refresh V2 (`weekly/`)

State is keyed by the exact node id plus an identity hash of the root→target
chain and source path (`target-state.json`, checksummed, atomic). Fields:
previous boundary date, boundary-day ids, overlap anchor ids, page boundary,
proof, baseline policy, last run pages/new/status/failure, created/updated.
v1 files migrate in place.

### Safe boundary (`boundary-rule.ts`)
Stop only when the listing ends, or the boundary day is strictly passed
**and** either ≥ `--min-anchor-matches` (default 5) of the previous run's
anchor ids (first `--anchor-size` = 20 ids below the boundary day) are
re-observed, or the `--overlap-days` (default 1) window is exhausted (anchors
deleted at the source). Reaching the boundary day with only known ids is never
a stop: same-day late listings are collected. Exhausting `--max-pages`
without proof fails the target and holds the watermark.

Fresh targets follow an explicit baseline policy: `--initial-baseline-pages`
(default 20 = the source maximum) and/or `--initial-baseline-days`. No hidden
depth. The policy used is recorded in the target state.

### Pipeline per target
raw page (saved) → hardened parse → newest-first checks → JSONL evidence →
boundary decision → assignment (deepest proven exact node, dedup after
reconciliation, conflicts AMBIGUOUS) → validation → staged release + atomic
pointer swap (skipped when the market content is identical) → **watermark
commit last**. Any failure leaves the previous watermark untouched.

### Hierarchy mutation
`reconcileSnapshot`: same identity → carried; changed identity → INVALIDATED
(boundary reset); target no longer terminal → STALE (never inherited by
children); IN_PROGRESS → INCOMPLETE. Resume refuses a changed hierarchy
version. The publisher unresolves EXACT rows whose target identity changed.

## 4. Commands

Optimized full structure run (overnight):

```
npm run market:autopilot:bridge -- --mode structure --run-id structure-2026-10 --pace-mode overnight --light-check-every 50 --full-rebuild-every 400 --full-rebuild-minutes 40 --deadline 08:00
```

Incremental structure refresh:

```
npm run market:autopilot:bridge -- --mode structure --run-id structure-inc-2026-10 --structure-mode incremental --stale-days 30 --pace-mode overnight
```

One-target market smoke (run twice with different run ids):

```
npm run market:weekly:bridge -- --run-id weekly-a3-advanced-1 --target-id audi/a3/a3-sportback/35-tfsi/advanced --max-pages 20
```

Broad initial market baseline (do not start without reviewing the smoke):

```
npm run market:weekly:bridge -- --run-id market-baseline-2026-10 --all-targets --pace-mode overnight --initial-baseline-pages 20 --deadline 08:00
```

Weekly incremental market refresh:

```
npm run market:weekly:bridge -- --run-id market-weekly-2026-W41 --all-targets --pace-mode overnight --overlap-days 1 --min-anchor-matches 5
```

In every case: rebuild the extension in chrome://extensions, verify the
login, start the bridge, press START once in the popup.

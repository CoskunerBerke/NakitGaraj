# Published release retention — bounded disk for the weekly market artifact

Scope: `backend/src/market-refresh/weekly/artifact-publisher.ts` (publish),
`published-retention.ts` (retention), `disk-guard.ts` (pre-run disk check),
`published-prune-cli.ts` (operator tool). Nothing here changes pricing,
assignment, hierarchy or watermark behaviour.

## 1. Root cause

`AtomicWeeklyMarketPublisher.publishTarget()` writes the **entire merged
artifact** — every assignment and every pool — and then swaps `current.json`.
`WeeklyMarketSession` calls it **once per completed target**, so one broad run
produces one full snapshot per target. Nothing ever deleted them.

Measured on the live directory (2026-09-17 run):

| Measured | Value |
|---|---|
| Releases in `published/versions` | 65 files |
| Total size | 9.65 GB |
| Size of one release | 151–155 MB |
| Publish cadence during the run | 64 releases in 76 min (~1 per 71 s) |
| Historical peak reported by the operator | ~253 GB |

The publisher already skips a write when the merged content is byte-identical
to the live release (`marketFingerprint` + pool comparison → `unchanged:
true`). That only helps when a refresh finds nothing new; during a run every
target adds listings, so each publish is genuinely different content. Dedupe
was therefore never the missing piece — **retention was**.

## 2. Who reads the published directory

Every consumer resolves `current.json` → `versions/<pointer.release>` and none
of them enumerates history:

- `vehicle-hierarchy.service.ts` (`loadCurrent()`)
- `scripts/build_demo_dataset.ts`, `scripts/audit_demo_pools.ts`,
  `scripts/verify_demo_dataset.ts`
- `vehicle-hierarchy/demo-evidence.ts`, `vehicle-hierarchy/hierarchy-source.ts`

No reader depends on old releases, so deleting them cannot break a reader.
Old releases exist only for rollback and audit.

## 3. What retention keeps

Retention is a **keep-list**, not a cut-off. A file is retained when it is:

| Reason | Why |
|---|---|
| `CURRENT` | named by `current.json` — the live release |
| `RECENT` | one of the newest `keepCount` releases |
| `ROLLBACK_ANCHOR` | newest release at least `anchorHours` **older than the live release** — in weekly cadence this is the previous run's final state |
| `IN_FLIGHT` | newer than the live release and written within `graceMs` — a publish whose pointer swap has not happened yet (capped at 4 files) |
| `UNRECOGNISED` | name does not match the release pattern — never touched |

Deleted: obsolete releases outside that set, plus `.tmp-<pid>-<hex8>` leftovers
from a crashed publish that are older than `tempMaxAgeMs` **and** whose writing
process is no longer alive.

The anchor is measured against the live release, not against "now". Measured
against "now" with a weekly cadence every file is older than 24 h, so the
anchor degenerated to a file from the same run minutes earlier while the only
genuine previous-run release was deleted.

Refuses to delete anything at all when `current.json` is missing, unreadable,
or names a file that is not in the directory. Not knowing what is live is not
a reason to guess.

## 4. Defaults, and why

| Setting | Default | Reason |
|---|---|---|
| `MARKET_PUBLISHED_RETENTION_COUNT` | 3 | 3 × ~155 MB ≈ 465 MB. Per-target publishing makes "newest 3" minutes apart, so recency alone is a weak rollback story — hence the anchor below. |
| `MARKET_PUBLISHED_RETENTION_ANCHOR_HOURS` | 24 | Keeps one pre-run restore point (~155 MB) for a crawler running every 2–3 days. 0 disables. |
| `MARKET_PUBLISHED_PRUNE_GRACE_MINUTES` | 10 | Covers the window between writing a release and swapping the pointer. Only applies to files newer than the live release, capped at 4, so a fast publish rate cannot inflate the directory. |
| `MARKET_PUBLISHED_TEMP_MAX_AGE_HOURS` | 6 | A crashed publish's temp file. Combined with a liveness check on the pid in the name, so a slow-but-alive writer is never cut. |
| `MARKET_MIN_FREE_DISK_GB` | 20 | Measured: `runs/` (raw pages) is 2.9 GB, retained releases ≤ ~0.8 GB, and a run writes ~10 GB transiently. 20 GB is ~5× the steady need. 0 disables the guard. |

An empty or whitespace value means **unset**, not zero: `Number('')` is 0, and
a blank `MARKET_PUBLISHED_PRUNE_GRACE_MINUTES=` would otherwise switch off
every protection window.

Steady state with the defaults: 1 live + 3 recent + 1 anchor ≈ **5 files,
~775 MB**, plus at most 4 in-flight files during a run.

## 5. Commands

```bash
# Report only. Never deletes.
npm run market:published:prune

# Delete what the report listed.
npm run market:published:prune -- --apply

# Options: --retain N, --root DIR, --json
```

Deleting requires `--apply` on purpose. `npm run market:published:prune
--dry-run` (without `--`) hands the flag to npm, not to the script, so a
delete-by-default tool would silently delete for anyone who typed it that way.
Unknown flags and missing flag values are rejected instead of ignored.

## 6. When retention runs

Publish order is: validate → merge → validate merged → write release file
atomically → swap `current.json` → **then** retention. A failed validation
throws before anything is written, so a failed publish never prunes. Retention
itself is wrapped: a prune failure is reported in `PublishResult.retention` and
surfaced in the run summary, and can never invalidate a successful release.

## 7. Disk guard

`assertEnoughDisk()` runs before any autopilot mode starts (structure, market,
weekly). Below the threshold it refuses to start and points at the prune
command. It never deletes anything. If the free space cannot be measured it
allows the run rather than turning an infrastructure error into a run failure.

## 8. Known cost, not addressed here

Write amplification is unchanged: a run still writes and fsyncs ~155 MB per
completed target (~10 GB per run) to keep ~775 MB. Retention bounds what stays
on disk, not what is written. A follow-up could publish once per N targets with
an in-memory merge, keeping the per-target atomic write only where a
crash-resume point is genuinely needed.

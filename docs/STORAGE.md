# Local storage

This is the storage contract for OnPurpose: what is saved, how the change log,
projection and replay fit together, the event and backup formats, failure
handling, and the history of every event version. Read it before changing
persistence. Product rules live in [GOALS.md](GOALS.md),
[SETTINGS.md](SETTINGS.md), [HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md) and
[DESCRIPTIONS.md](DESCRIPTIONS.md).

## How storage works

OnPurpose keeps an **append-only event log** on the device. Every saved action
(a checkbox tap, a numeric total, a habit edit, a preference change, an Undo or a
Redo) becomes one immutable event with a contiguous sequence number. The log is
the source of truth. Normal use never rewrites or deletes an existing event.

Alongside the log, SQLite keeps a **projection**: one JSON copy of the state
after the last committed event. It is a cache that lets each new edit be checked
quickly. Every append writes the event and the new projection in one
transaction, and a missing or stale projection is rebuilt from the log.

At startup the app **replays** the whole log in sequence order. Replay validates
every event, rebuilds habits, entries and preferences, and reconstructs the Undo
and Redo stacks, so both survive closing the app, export and restore. Replay
never sorts by wall-clock time.

**Undo appends an inverse.** It writes an `undo` event carrying the reverse of
the target action, and Redo writes a `redo` event that reapplies it. Nothing is
erased: the raw history of every edit stays in the log and in backups.

Backups export that log as a checksummed JSON file of changes, not a snapshot of
values. A restore replays the whole file before replacing anything. Incremental
storage, change-based export and Undo are founder-confirmed requirements,
implemented on 4 October 2026; persistence across reloads was confirmed on the
physical iPhone.

### Example event

This entry event comes from [the v20 fixture](examples/storage-v20.json). It was
written at version 6 and still replays unchanged.

```json
{
  "version": 6,
  "id": "v6-check",
  "sequence": 2,
  "recordedAt": "2026-10-04T08:00:00.000Z",
  "timeZone": "Australia/Melbourne",
  "utcOffsetMinutes": 660,
  "type": "change",
  "groupId": "v6-check",
  "change": {
    "kind": "entry",
    "habitId": "walk",
    "date": "2026-10-04",
    "before": null,
    "after": 1
  }
}
```

- `version` is the event format at the time of writing. It never changes later.
- `id` is stable (a UUID in the app; fixtures use readable IDs), and `sequence`
  is the authoritative order.
- `recordedAt`, `timeZone` and `utcOffsetMinutes` record when and where the
  edit happened.
- `type: "change"` with a `groupId` is a habit action. This event starts its own
  correction group, so its group ID equals its ID.
- `change.date` is the habit day the value belongs to, independent of the edit
  time.
- `before: null` → `after: 1` checks an empty box. Replay rejects the event if
  the stored value is not `null`. The matching `undo` event in the same fixture
  carries the inverse, with `before` and `after` swapped.

### Three version numbers

Three independent numbers describe stored data. This table is the one place that
states their current values; the rest of this file says which version
introduced each feature.

| Number                     | Where it lives     | Current | Meaning                                                                                                                                            |
| -------------------------- | ------------------ | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL `PRAGMA user_version`  | SQLite database    |       1 | Table layout. Changes only through an explicit migration.                                                                                          |
| Event `version`            | Each event         |      20 | Format the event was written in. Old events keep their version and that version's rules. Replay accepts 1–20; a log never returns to an older one. |
| Export container `version` | Backup JSON header |      20 | Format of the export file. The importer accepts 1–20, and a container cannot hold events newer than its own version.                               |

### Glossary

- **Projection**: the derived current-state JSON in the `current_state` table.
  It can always be rebuilt from the log by replay.
- **Correction group**: consecutive edits to the same habit field (for entries,
  also the same date) that share a `groupId`. History shows them as one action,
  and Undo reverses them as one step.
- **Net-zero**: a group whose latest after-value equals its first before-value,
  such as check then uncheck. It disappears from History and Undo, while its raw
  events remain.
- **Before-value precondition**: every change states the value it expects to
  replace. Writes, replay and import reject an event whose `before` does not
  match the current state.
- **Inverse**: the same change with `before` and `after` swapped (for a group,
  its net change). Undo appends it rather than deleting anything.
- **Exact prefix**: a newer log or fixture whose events begin with every event of
  an older one, unchanged. The tests compare the parsed events with deep
  equality; the committed fixtures also serialize identically.

Fixtures in [docs/examples](examples/) are synthetic. They are recorded in
Australia/Melbourne during daylight saving time (UTC+11) to cover a positive
offset, and later fixtures add some UTC events. Each fixture from v7 onwards
extends the previous one as an exact prefix, as do v4 (from v3) and v5 (from
v4). Never edit an existing fixture; a new version adds a new one.

## What is saved

Habits and records:

- daily entries for all four habit types: checkbox, numeric daily total,
  multi-select categories and free text;
- habit definitions: name, type, colour, units, icon, start date, description,
  category options, effective-dated goals (weekday schedules, period quotas,
  on/off cycles and checkbox defaults) and archived state;
- habit order, archival, and undoable deletion of archived habits.

Global preferences, saved as `preference` events outside History and Undo (see
[SETTINGS.md](SETTINGS.md)):

- haptics;
- Hide completed today;
- checkbox style;
- week dividers and tap animations;
- grid sizes for the name column, day columns and rows, plus the earlier row
  spacing, column spacing/density and name-width choices they replaced;
- text size;
- theme mode and the dark and light backgrounds;
- week start, and date fading (still saved and replayed, but no longer shown).

Outside the log: recoverable description drafts and bookmarks (a separate local
store; see [Description drafts](#description-drafts)), Quick Undo receipts,
scroll positions, open panels, typing drafts, cancelled choices, no-op saves,
development sample data and diagnostics. Statistics are always derived from
saved values, never stored.

The 12 sample habits are written once, when a genuinely new database is created;
existing stores are never reseeded.

Habit/day records answer “What did I record for Tuesday?” Change records answer
“What changed, and in what order?” Correcting Tuesday on Wednesday uses Tuesday's
explicit `YYYY-MM-DD` key and Wednesday's edit timestamp. They are never
conflated.

## Code layout

`src/storage/` owns persistence. React subscribes through
`usePersistentStore.ts`.

| Module                                              | Responsibility                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `model.ts`                                          | Public facade: deterministic live/replay transitions, grouping and the exports other code imports       |
| `types.ts`                                          | Event, change, state and replay shapes only; no runtime logic                                           |
| `validation.ts`                                     | Strict fields, version gates, date/value/habit checks and precondition assertions; never imports replay |
| `changeUtils.ts`                                    | Preference classification, structural equality and inversion                                            |
| `repository.ts`                                     | SQL operations against a small SQL interface                                                            |
| `native.ts`                                         | Opens Expo SQLite and supplies native UUID/SHA-256                                                      |
| `native.web.ts`, `browserRepository.ts`             | Web preview adapter over `localStorage`                                                                 |
| `store.ts`                                          | `ChangeStore`: loading, immediate UI state, serialized write queue, Undo/Redo and exclusive backup work |
| `selection.ts`                                      | Per-cell and per-heading selectors                                                                      |
| `archive.ts`, `backups.ts`, `backups.web.ts`        | Backup encoding/validation and the share/pick file flows                                                |
| `presetIcons.ts`, `presetDescriptions.ts`           | One-time, requested, undoable updates to the original preset habits                                     |
| `descriptionDraftModel.ts`, `descriptionDraft.*.ts` | Separate recoverable description-draft store                                                            |
| `descriptionBookmarks.ts`                           | Reading/editing positions kept in the draft store                                                       |
| `profileSql.ts`                                     | Development-only SQL timing wrapper (see [PERFORMANCE.md](PERFORMANCE.md))                              |

Replay owns fresh mutable state to avoid copying the entire history on each
event; live UI updates remain immutable. On 7 October 2026 `types.ts`,
`validation.ts` and `changeUtils.ts` were split out of `model.ts` as a
responsibility refactor: function bodies, error messages, version gates and the
public exports stayed the same, with no schema, event or write-queue change.

The canvas grid (`canvasGrid/useGridModel.ts`) subscribes once to the store and
re-checks only its prepared days whose saved values changed; save
acknowledgements keep the same values object and do nothing. `selection.ts`
supplies the primitive Today completion mask used by Hide completed, so
unchanged selections ignore acknowledgements and unrelated edits. This is
notification filtering derived from the store snapshot, not another persisted
cache. Store timing can be enabled in development without changing events,
replay, serialized writes or the schema.

## Database (SQL schema 1)

Native data (iOS and Android) lives in `onpurpose.db` in Expo SQLite's
application database directory. It is local to the app; Expo Go and a future
standalone build have separate containers. Uninstalling or clearing the container
can remove the data. There is no server, account or automatic cross-device
transfer.

- `changes`: ordered immutable event JSON, integer sequence primary key, unique ID.
- `current_state`: one derived JSON projection with its last committed sequence.
- `recovery_archives`: complete pre-restore event logs retained locally.
- `PRAGMA user_version = 1`: database schema version, distinct from event/export versions.

SQLite uses WAL and requests FULL synchronous durability. Each normal append
inserts the event and advances the projection in one exclusive transaction.
Within that transaction the repository reapplies the event to the committed
projection and rejects a mismatch. User-controlled strings are bound SQL
parameters, not SQL fragments.

A genuinely new database gets its schema and initial-habit event in one
transaction. An unrecognized nonempty version-zero database, a newer database
version, an invalid log or a failed integrity check blocks loading. It is never
silently reset or reseeded. A valid log with a missing, stale or broken
projection rebuilds only that derived data. Native launch performance with long
histories still needs measurement.

Future database migrations must be explicit transactional steps that reject
newer versions. Future event reducers must continue to interpret all earlier
event versions. Do not rewrite old events to match a newer domain model. Keep
tests for old exports and migration fixtures. Schema 1 is the first schema, so
there is no migration from an earlier persisted OnPurpose version.

## Event structure and semantics

Every event carries:

| Field              | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `version`          | Event format version (see [Three version numbers](#three-version-numbers)) |
| `id`               | Stable identifier generated once, retained on save retry                   |
| `sequence`         | Contiguous order starting at `1`; authoritative even if the clock changes  |
| `recordedAt`       | UTC edit instant in ISO form with milliseconds                             |
| `timeZone`         | Device time-zone name at edit time, or `unknown` if unavailable            |
| `utcOffsetMinutes` | Local offset east of UTC at edit time                                      |
| `type`             | `initialize`, `change`, `undo`, `redo`, or `preference`                    |

`initialize` records the ordered habit definitions and starts with no entries and
haptics enabled. Each later edit includes `before` and `after` values.

- `change` events carry a habit action: an entry, colour, habit definition,
  order or archived-habit deletion. A new group's ID is its first event's ID;
  corrections retain that ID.
- `preference` events persist global settings in the same log and export,
  outside habit History and Undo/Redo.
- `undo` targets an active group ID and carries its inverse. `redo` targets the
  latest undo event ID and restores the original action.

Habit-definition changes record `habitId`, `index`, and `before`/`after`
definitions (null for creation/removal). Order changes record exact before/after
ID arrays. Definitions may include an explicit `type` and an `archived` boolean;
legacy numeric habits remain inferred from their units. Archiving preserves
entries. Undoing creation cannot remove a habit while it still has entries, and
type conversion is rejected while values exist. Definition equality ignores JSON
field order.

Definition and ordering edits are distinct actions and close correction groups.
Reordering validates the exact current order and a unique complete permutation;
archived positions remain present. Older builds must reject newer data rather
than discard unfamiliar events.

Daily entries use stable habit IDs and explicit calendar dates. Numeric zero is a
recorded value; `null` is absent or cleared. Checkbox values are `1` (On), `0`
(explicit Off, since v14) or `null` (no entry, which inherits the dated default).
Numeric values must be finite, nonnegative and no larger than JavaScript's
maximum safe integer; decimals are supported. Category and text values follow
the [version 10](#version-10-categorical-and-text-habits) rules. Colours are
six-digit sRGB hex.

The local-midnight boundary is the implementation default; a later cutoff
remains a separate founder decision. Recorded dates stay fixed after travel or
time-zone changes; the Today label follows the device's local date. Future
entries follow the same validation as past and today's entries. Completion,
schedules, period quotas and streaks are derived from effective-dated goals for
all habit types; see [GOALS.md](GOALS.md).

Replay rejects missing or reordered sequences, repeated event IDs, unknown
versions or fields, invalid dates/values/colours, unknown habits, failed
before-value preconditions, and incorrect undo targets or inverses. It does not
use wall-clock sorting. Duplicate events in an imported archive are rejected, not
merged. Retrying the exact same committed event is idempotent.

## Immediate feedback, saving, and failures

The grid updates immediately; native writes start immediately in a single queue.
Every action computes its before-value from the store's latest state, including
pending edits, rather than a stale render. Rapid taps retain their order. UI taps
and haptics do not wait for disk I/O. This is optimistic feedback, not a claim
that the tap is already durable.

History/Settings show pending saves and then “Saved on this device.” A failed
write retains that event and all later queued events in memory, pauses further
changes, and displays “Changes are not saved. Keep the app open and retry.”
Retry resumes in order using the original event IDs. A transaction failure
cannot leave the projection ahead of the log. If a commit succeeded but its
acknowledgement was lost, retry finds the identical event and does not duplicate
it. Foregrounding retries failed queued saves. Closing or force-killing during
pending writes can still lose the uncommitted queue; no JavaScript app can
guarantee completion after being killed. No background-task reliability claim is
made.

Loading shows a quiet loading view in the default dark theme before any editable
grid. Loading failure shows Retry, preserving the database. Permanent log
corruption currently requires developer-assisted recovery; there is no automatic
destructive reset or in-app corrupt-database replacement tool. Keep an external
export before relying on this preview for irreplaceable data.

## Undo, redo, and History

History is a virtualized sectioned list of active habit actions, newest first, grouped
by edit day in the viewing device's local time zone. Sticky day headings show
Today/Yesterday or a calendar date; rows show the edit time. Entry dates appear as
“For …” when different from the edit day. Compact rows pair action icons with
text, numeric before/after totals, and old/new colour swatches. Neighbouring
same-date entries within five minutes collapse into one expandable row, and
filters narrow the view; both are presentation only. Day headings fold, and a
calendar jumps to an edit day. A floating Undo/Redo bar
names the next Undo target; save failures and Retry stay above the list. Older
days load 40 at a time, retaining contiguous action order if a clock
adjustment causes a date to recur. Initialization and global preferences are not
shown. Habit colours remain visible and undoable. It is a change browser, not yet
a historical whole-screen snapshot/reconstruction interface.

Undo reverses the latest active action and appends an `undo` event referencing
it. Redo reapplies that action and appends a `redo` event. The visible row
disappears on Undo and returns with its original identity, order and edit time
on Redo; Undo and Redo never create extra rows. Both validate the exact net
change and current before-value. New habit edits clear the redo branch without
deleting its events. New preferences neither enter Undo nor clear Redo.

Consecutive edits to the same habit field coalesce while less than two minutes
have elapsed since its latest edit. Entries must also have the same effective
date. Each group shows the first before-value and latest after-value, with the
latest edit time. Check/uncheck returning to the original value removes the
active action (net-zero); another immediate check can resume that group. Every
individual edit still writes immediately to disk. The two-minute window is a
grouping rule, not a save delay. Undo reverses the whole net group in one atomic
transaction.

Editing another habit, date or field starts a separate action and closes the
previous group, preserving chronological undo. Undo/Redo also close the group,
as do midnight, time-zone/offset changes, a backwards clock or two minutes of
inactivity. Preferences do not break an otherwise eligible group. Reopening
within the window preserves the group; grouping rules use captured edit-zone
metadata, while list headings use the viewing local zone. Selective undo,
gesture batching, comments and permanent erasure would need further rules.

Undo is not permanent erasure. Settings → Archived habits offers confirmed,
undoable deletion (see [version 12](#version-12-undoable-archived-habit-deletion)).
It removes the current definition and daily records together; raw edits, earlier
notes/values, recoverable local description drafts/bookmarks, backups and
pre-restore copies remain. Permanent erasure still needs its own
privacy/retention rules.

## Portable backup format

Settings → Backups → Export backup opens the system share sheet (iOS and
Android); save the JSON to Files or another destination. The app first waits for
pending saves and captures a stable log. The export is a readable JSON container
of **changes**, not a replacement snapshot of habit/day values. Every event
version has a synthetic example in [docs/examples](examples/), from
[the unchanged version-1 fixture](examples/storage-v1.json) to
[the newest fixture](examples/storage-v20.json); see
[Version history](#version-history).

The container has `format: "onpurpose.changes"`, `version`, `exportedAt`,
`eventCount`, `sha256` and `events`. The exporter always writes the current
container version, and the importer accepts every version up to it (see
[Three version numbers](#three-version-numbers)). A container cannot hold events
newer than its own version. The digest is SHA-256 of UTF-8
`JSON.stringify(events)` with its existing property order. It detects accidental
modification or incompleteness; it is not an authenticated signature. Exports
are not encrypted and may reveal habit names, descriptions, dated values,
colours, and preference/edit metadata. Pre-restore copies are not bundled into
the active export. New containers retain legacy prefixes, including full raw
edits and undo/redo operations omitted from the active History view.

Restore backup opens the system document picker, reads the selected cached file,
checks format/version/count/checksum, and fully validates/replays it before asking
for confirmation. The native confirmation states the habit/change counts and
that current entries, colours, and settings will be replaced. Confirmed restore
runs exclusively, stores a complete pre-restore log in `recovery_archives`, replaces
the active log, and updates the projection in one transaction. Failure rolls back
all three. There is no automatic merge with current edits or other devices.
Settings → Backups → Restore previous data returns to the latest saved copy, preserving
another copy of the data it replaces. Copies survive reopening; repeated restores
retain older copies too, although the UI exposes only the latest. A retention and
permanent-removal policy must be designed before release.

Import/export is bounded to 20 MB and 100,000 events; oversized files
are rejected before replacing data. Native logging itself has no event-count cap.
Revisit the backup container/streaming limits before very large histories, and
measure native replay/write latency as daily records accumulate. Cache files from
export/import are removed when the action completes. Exporting or cancelling the
share sheet is not proof that the user saved an external copy.

## Requested preset icon update

After a successful app opening, `presetIcons.ts` recognizes the original complete
12-habit preset seed and adds missing preset icons via `ChangeStore.change`.
These are ordinary habit-definition edits in the serialized queue, with History,
Undo/Redo, visible failure/retry and backup support. They do not alter
initialization or reset/reseed the store. Current choices, names changed from
the preset, unrelated seeds, and any habit with a past icon assignment/removal
are skipped. Raw history prevents reapplication after Undo and reload. Fresh
initialization already includes icons, so no follow-up edits are needed. Restore
remains exact at the time it runs; an older preset archive without icon history
can receive this update on next launch.

## Description drafts

Recoverable description drafts are separate from applied habit state. A separate
native draft database or browser key keeps unfinished text outside the canonical
log, History and backups; sample drafts remain memory-only. Local v2 draft JSON
adds optional bounded selection/scroll positions; v1 draft records remain
readable. Clean, text-matched bookmarks use separate keys in the same store.
These draft-record versions are independent of event versions; the main SQL
schema, log/export and canonical Undo/Redo are unaffected. Draft failures do not
reset any database. See [DESCRIPTIONS.md](DESCRIPTIONS.md) for recovery and Done
semantics and the one-time, undoable placeholder-note update requested by the
founder.

## Development sample store

For statistics review, development builds can temporarily switch to a separate
in-memory `ChangeStore` (`src/dev/sampleData.ts`). It generates 180 days of
fictional entries for the 12 preset habits, with long fictional notes on some,
then appends fictional category/text records, effective-dated goals and
period/cycle examples (`sampleRecords.ts`, `sampleGoals.ts`, `sampleTiming.ts`).
It receives no real values and has no native/browser repository, so it cannot
replace or restore backups. Its writes and Undo/Redo use the normal event logic
but never reach SQLite, `localStorage`, exports or real History. Returning to
real data restores the original store; resetting or reloading discards only the
sample. Release builds exclude it.

## Browser preview

Platform-specific `native.web.ts`/`browserRepository.ts` keep the web layout
preview usable without Expo SQLite's WASM/server-header setup. The preview uses a
separate `localStorage` document and the same event/replay/queue logic; native
iOS and Android use SQLite. Browser quota/private mode, multiple tabs, downloads
and file-picker behaviour differ. Browser success is not native persistence
evidence.

## Verification and remaining scope

`npm test` runs real SQLite migration/transaction/reopen tests through Node's
SQLite binding, replay and malformed-import tests, rapid-write/failure/retry
tests, export round trips and an exact-prefix check for each fixture that
extends an earlier one. Tests inject
failure between event and projection writes, during initialization and during
restore. These exercise the production SQL and domain modules; they do not
substitute for Expo's native bridge, force-quit, or Files/share-sheet testing on
the phone. Follow [TESTING.md](TESTING.md) for that pass, and see
[DECISIONS.md](DECISIONS.md) for the status of an older Undo report and native
backup acceptance.

Still deferred: comments, permanent erasure, skipped/excused days, manual
success overrides, rolling windows (see [GOALS.md](GOALS.md)), launch snapshots,
encryption and sync. An incremental log alone is not a sync protocol. Each edit
currently revalidates and rewrites the whole projection; see
[PERFORMANCE.md](PERFORMANCE.md) before changing that.

## Version history

Each version adds fields or change kinds; earlier events keep their meaning.
Every new version leaves the SQL schema at 1, rewrites and reseeds nothing, and
makes older event versions reject the new fields or kinds. Once a log contains a
version, older events cannot follow it.

| Version | Added                                                                                    |
| ------: | ---------------------------------------------------------------------------------------- |
|       1 | Initial log: `initialize`, entry/colour/haptics changes, per-edit `undo`/`redo`          |
|       2 | Correction groups (`groupId`) and `preference` events outside habit History and Undo     |
|       3 | Habit management: `habit` definition and `order` changes, explicit `type` and `archived` |
|       4 | Optional habit `icon` (Phosphor, Tabler or emoji)                                        |
|       5 | Optional habit `startDate`; `rowSpacing` preference                                      |
|       6 | `columnSpacing`, `weekStart` and `dateFading` preferences                                |
|       7 | Optional Markdown `description` on habits                                                |
|       8 | `textScale` preference                                                                   |
|       9 | `hideCompleted` preference                                                               |
|      10 | `categorical` and `text` habit types, category options, multi-select and text values     |
|      11 | Effective-dated `goals` with weekday schedules                                           |
|      12 | `deleteHabit`: undoable deletion of archived habits                                      |
|      13 | Goal `period` quotas and repeating on/off `cycle`s                                       |
|      14 | Checkbox `unchecked` rule, dated `defaultChecked`, checkbox value `0`                    |
|      15 | `checkboxStyle` preference                                                               |
|      16 | `weekDividers` and `tapAnimations` preferences                                           |
|      17 | `nameColumnWidth` and revised `columnDensity` preferences                                |
|      18 | `gridNameWidth`, `gridColumnWidth` and `gridRowHeight` size preferences                  |
|      19 | `themeMode`, `darkBackground` and `lightBackground` preferences                          |
|      20 | Cell look preferences (`todayOutlines` … `connectorThickness`)                           |

### Version 1: the original log

Version-1 logs keep their original interpretation, including historical
preference undo/redo and abandoned redo branches. Their habit edits remain
individual undo steps, with settings and undo/redo rows filtered from the view.
[The unchanged version-1 fixture](examples/storage-v1.json) stays in the tests.

### Version 2: correction groups and preferences

Version-2 `change` events target an entry or habit colour and include a
`groupId`. Version-2 `preference` events persist global settings (haptics at
first) outside habit History and Undo/Redo. See
[the version-2 fixture](examples/storage-v2.json).

### Version 3: habit management

Introduced habit-definition (`habit`) and `order` changes, explicit
checkbox/number `type`, and the `archived` flag. Earlier versions reject these
changes. See [the version-3 example](examples/storage-v3.json) and
[HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md).

### Version 4: habit icons

Adds an optional flat `icon` string to habit definitions:
`phosphor:<stable-catalogue-id>`, `tabler:<stable-catalogue-id>`, or
`emoji:<single-emoji-sequence>`. No icon means an absent field, not null. Icons
are validated against the bundled stable catalogue or the pinned emoji
validator. Unknown packs/IDs, URLs, objects, plain text and multiple emoji are
rejected. Icons use the existing atomic before/after habit edit, including
Undo/Redo and archive restore. Emoji validation dependency versions affect replay
compatibility; retain accepted sequences and catalogue IDs when updating them.
Tabler extends the v4 catalogue without changing event shape or SQL schema.
Earlier builds reject unrecognized Tabler IDs rather than silently dropping them.
The [v4 fixture](examples/storage-v4.json) extends the v3 prefix.

### Version 5: start dates and row spacing

Adds an optional `startDate` (`YYYY-MM-DD`) to definitions and a `rowSpacing`
preference with `compact`, `standard` or `roomy` before/after values. Newly
created habits and fresh preset seeds explicitly store the local current date.
Existing definitions remain unchanged: the editor and statistics infer a default
from creation or the earliest past record. Applying a different date writes one
ordinary, undoable definition change. Unchanged legacy date drafts add no field
or event. Statistics use an explicit start as their lower bound while keeping
all older values; see [STATISTICS.md](STATISTICS.md). This calculation rule is an
assistant proposal, open to founder adjustment; it never deletes or migrates
records.

Absent row spacing means Standard, preserving legacy projection JSON. New
preferences validate their before-value against that effective default, persist
in the same atomic queue, and leave History, Undo/Redo and correction groups
intact. The [v5 fixture](examples/storage-v5.json) extends the v4 prefix with a
date edit, Undo, spacing preference and Redo. Row spacing is superseded for new
choices by the [version 18](#version-18-grid-size-sliders) sliders.

### Version 6: display preferences

Adds `columnSpacing` (compact/standard/roomy), `weekStart` (monday/sunday) and
`dateFading` (boolean) preference changes. Their original defaults are compact,
monday and true; absent projection fields resolve to these defaults.
Preferences validate before-values against effective defaults and retain all
habit groups and Undo/Redo. No existing events, entries, dates or projections
need migration. [SETTINGS.md](SETTINGS.md) documents the controls and their
rendering-only effects. The [v6 fixture](examples/storage-v6.json) starts a new
synthetic log that later fixtures extend.

### Version 7: descriptions

Adds an optional nonempty `description` string to habit definitions, limited to
20,000 UTF-16 characters. Blank editor text removes the field; null, empty,
oversized and non-string fields are rejected. Descriptions use ordinary
before/after habit changes, with atomic writes, Undo/Redo, archive/restore and
full export. The [v7 fixture](examples/storage-v7.json) extends the v6 prefix
with a Markdown edit.

### Version 8: text size

Adds `textScale`, a global preference from 0.85 to 1.50 in 0.05 steps,
defaulting to 1 when absent. It validates effective before-values, persists
through the ordinary atomic queue, and stays out of History/Undo. It preserves
Redo and does not close habit correction groups. The
[v8 fixture](examples/storage-v8.json) extends the v7 prefix.

### Version 9: hide completed

Adds `hideCompleted`, a strict boolean global preference. Missing fields resolve
to false, preserving existing row visibility. It persists as a `preference`
event outside History/Undo, preserving Redo and entry groups. The
[v9 fixture](examples/storage-v9.json) extends the v8 prefix. The completion
predicate itself is not stored: `habitCompletion.ts` evaluates each habit's
effective-dated goal (see [GOALS.md](GOALS.md)).

### Version 10: categorical and text habits

Adds explicit `categorical` and `text` habit types and mixed daily values.
Categories are a bounded list (1–40) of stable `id`, `label` (up to 60
characters), optional `shortLabel` (up to 12) and optional `archived` fields. At
least one option stays active. Entries are nonempty sorted unique ID arrays;
several options can be selected on one day. References must belong to that
habit. Archiving or renaming an option preserves its ID and selections;
referenced options cannot be removed from the definition. Text values are
nonblank plain strings, up to 10,000 UTF-16 characters; meaningful
whitespace/newlines are preserved. Empty selections or blank text clear to null.
Units belong only to numeric habits.

Array preconditions, group continuity, net-zero suppression and Undo/Redo
inverses compare content, including after JSON/SQLite round trips. Unchanged
entry arrays keep their references for per-cell subscriptions. Categorical/text
edits use the same serialized atomic queue and correction window. Habit type
changes with any entries remain forbidden, comparing all four effective types.
The [v10 fixture](examples/storage-v10.json) extends the v9 prefix with both
definitions, multi-selection, multiline text correction, Undo and Redo.

### Version 11: effective-dated success goals

Optional `Habit.goals` stores stable IDs, unique sorted effective dates, typed
conditions and nonempty weekday sets. Goal/schedule changes use ordinary undoable
definition edits; changing Today never rewrites earlier goals or daily entries.
Editing or removing an earlier version is explicit, confirmed and reversible.
Strict validation rejects malformed rules, unknown category IDs and date
collisions. No default goals are written to existing stores. See
[GOALS.md](GOALS.md) and the [v11 fixture](examples/storage-v11.json), which
extends the v10 prefix.

### Version 12: undoable archived-habit deletion

The founder chose Delete with Undo. `deleteHabit` is a distinct structural change
with a stable habit ID, exact current index, and a before-snapshot containing the
complete archived definition plus date-keyed entries; after is null. Undo swaps
before/after and restores every entry and the retained archived position in one
atomic transaction. Redo removes them again. Empty habits and deleting the last
habit are supported without reseeding. Definitions include notes, icons,
categories and effective-dated goals unchanged.

Validation requires an archived definition, matching ID/index, valid dates and
values, and the exact complete current entry set. Ordinary habit removal keeps
its prior restriction against removing habits with entries. Deletion closes
correction groups and uses the normal serialized queue/failure/retry path. The
[v12 fixture](examples/storage-v12.json) extends the v11 prefix with archive,
delete, Undo and Redo.

History shows one named deletion action. `historyDisplayState` supplies missing
habit definitions from active deletion snapshots solely for older action labels;
these definitions/entries do not return to the grid, archive or statistics.
Description comparisons remain readable, but note-only restore requires a
currently stored habit: undo the deletion first to restore an old description.
Local draft/bookmark storage is retained for that recovery and remains outside
backups.

### Version 13: fixed periods and repeating on/off cycles

Goal versions may include `period` (unit week/days, days, anchor, operator,
target, optional upper) and `cycle` (unit days/weeks, on, off, anchor). Shapes,
integer bounds and dates are strictly validated. Periods require an active daily
condition and all seven weekdays; cycles can narrow applicable dates.

Ordinary definition snapshots preserve period/cycle anchors through edits,
Undo/Redo, archiving/deletion and backup recovery. Preferences never
retroactively realign saved weeks. The [v13 fixture](examples/storage-v13.json)
extends the v12 prefix. No existing store is assigned inferred goals.

### Version 14: dated checkbox defaults and unchecked success

Goals allow `rule: {kind: 'unchecked'}` and optional boolean `defaultChecked`
(checkbox habits only). Absent means Off. Checkbox entry 0 explicitly means Off,
1 means On, and null removes an override to inherit the dated default. Earlier
versions reject the new condition, default field and checkbox zero. No bulk
synthetic entries are written.

Defaults are saved in ordinary dated habit definitions, so Undo/Redo, archive
restore/deletion snapshots and atomic backup recovery preserve them. Toggling
away from and back to the default uses normal net-zero grouping. The
[v14 fixture](examples/storage-v14.json) extends the v13 prefix. Its future
default does not alter earlier records.

### Version 15: checkbox appearance preference

`checkboxStyle` accepts exactly `boxes` or `marks`. Absent fields use `boxes`.
It is a global preference outside visible History and Undo/Redo; it preserves
Redo and does not interrupt entry correction groups. The
[v15 fixture](examples/storage-v15.json) extends the v14 prefix with this
setting.

### Version 16: optional grid dividers and tap feedback

`weekDividers` and `tapAnimations` are strict boolean preferences, both
defaulting to true when absent. They stay outside History/Undo, preserve Redo
and correction groups, and use the ordinary serialized write/retry and atomic
restore paths. The [v16 fixture](examples/storage-v16.json) extends the v15
prefix with both switches turned off.

### Version 17: name width and revised column spacing

`nameColumnWidth` validates narrow/standard/wide, default Standard.
`columnDensity` validates compact/standard/roomy for the revised 44/48/64-point
choices. It falls back through `effectiveColumnSpacing`: old absent/Compact to
Standard, old Standard/Roomy to Roomy. Old `columnSpacing` events still validate
with their original absent Compact precondition and retain their raw values.

Both preferences use the ordinary serialized atomic write/restore path, preserve
Redo and grouping, and remain outside habit History/Undo. The
[v17 fixture](examples/storage-v17.json) extends the v16 prefix. Both are
superseded for new choices by the [version 18](#version-18-grid-size-sliders)
sliders.

The temporary grid Undo (Quick Undo) is a normal guarded compensating entry
change, preserving append-only history and visible failure/retry. Its receipt
and timers are ephemeral and excluded from exports.

### Version 18: grid size sliders

`gridNameWidth`, `gridColumnWidth` and `gridRowHeight` replace the three-choice
geometry controls with stepped sizes in points at 100% text, or `auto`. Ranges:
name 96–240 in 4-point steps; day columns and rows 40–80 in 2-point steps.
`before` is `null` until the first v18 choice for that size, so Reset to
automatic works even after an earlier Compact/Narrow choice. Absent v18 fields
keep honouring earlier events: Compact/Roomy map to 44/64 points, Narrow/Wide to
80%/120% of the automatic name width, and Standard means automatic. Old events
keep their preconditions and raw values.

Automatic sizes adapt to the device (see [SETTINGS.md](SETTINGS.md)); that is a
rendering rule, not stored data. The preferences stay outside History/Undo,
preserve Redo and correction groups, and use the ordinary serialized
write/restore path. The [v18 fixture](examples/storage-v18.json) extends the v17
prefix.

### Version 19: theme and backgrounds

`themeMode` accepts exactly `system`, `dark` or `light`. `darkBackground` and
`lightBackground` store a normalized uppercase `#RRGGBB`. As with the v18 grid
sizes, `before` is `null` until the first choice, so the defaults are a
rendering rule that can change without touching stored events. Absent fields
currently display as Dark, black (`#000000`) and Paper (`#F6F3EC`). Replay also
accepts the earlier development defaults (`system`, `#000000` and `#FFFFFF`) as
the first `before`, because development builds on 10 October 2026 briefly wrote
them; logs from that day still load.

Validation checks only the stored shape. The readable lightness range for each
scheme is also a rendering rule (`fitBackground` in `src/theme.ts`), so a later
range change can never make an old event fail to replay.

The preferences stay outside History/Undo, preserve Redo and correction groups,
and use the ordinary serialized write/restore path. Saved habit colours are
never rewritten: other backgrounds only change how a colour is displayed. The
[v19 fixture](examples/storage-v19.json) extends the v18 prefix with Light
theme, a White light background and a custom navy dark background.

### Version 20: cell look

Six preferences choose how grid cells are drawn: the booleans `todayOutlines`,
`missedDays`, `joinedCheckboxes`, `streakNumbers` and `roundCheckboxes`, and
`connectorThickness`, an integer percent of the checkbox height from 20 to 100
in steps of 5. As with the v18 sizes and v19 theme, `before` is `null` until
the first choice, so the defaults (all off, 55%) are a rendering rule that can
change without touching stored events (`cellLookDefaults`). Older event
versions reject these kinds.

The preferences stay outside History/Undo, preserve Redo and correction groups,
and use the ordinary serialized write/restore path. The
[v20 fixture](examples/storage-v20.json) extends the v19 prefix by turning on
every cell look and setting a 50% connector.

## References

[Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/),
[Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/) and
[DocumentPicker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/).

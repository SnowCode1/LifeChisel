# Performance

How OnPurpose keeps the grid, History and notes responsive, how to measure it,
and the dated record of device investigations. The founder's test device is an
iPhone 16 Pro. Never infer iPhone frame rates from Node benchmarks, React
Profiler totals or JavaScript timer lateness; only phone runs, and ultimately
release-build profiling, establish device performance.

## Current design and open problems

### What keeps the grid responsive

- **Per-cell selectors.** Entry edits and save acknowledgements do not rerender
  the app root's grid or its columns. Each mounted cell subscribes to its own
  value through `storage/selection.ts`, and a date heading reads only whether its
  date has a recorded entry. See [Entry updates](#entry-updates).
- **UI-thread scroll synchronization.** Reanimated scroll handlers move the
  follower list (header or body) on the UI thread. Only discrete settled dates
  reach React. Never put per-frame list synchronization back on JavaScript.
- **FlashList on native.** FlashList 2.3.3 recycles date columns and headings on
  iOS and Android, drawing one date-viewport width beyond the visible area. Web
  keeps an RN Web FlatList (fixed item layout, `windowSize` 5), because inverted
  FlashList DOM offsets failed the layout review.
- **Bounded date windows.** Dates load in 90-day chunks; jumps build 120 dates
  around the target; windows over 360 dates compact to 270 after native settling.
  Date objects and labels are cached and reused.
- **Row windowing.** `gridRowWindow.ts` renders real cells only for the measured
  vertical viewport plus two rows of overscan, updating on two-row buckets. Names
  still measure every habit, and all rows render during menus, drags and for
  300 ms after an identity change.
- **One Pressable per date column.** `useGridColumnPress.ts` and
  `gridColumnHit.ts` map a touch to the measured row; each cell keeps its own
  accessible view and actions.
- **Batched checkbox drawing.** `GridCheckboxLayer.tsx` draws idle checkboxes in
  one SVG per column; only a locally accepted tap adds a short overlay.
- **Shared row motion.** `RowPositions` gives each displayed habit one animated
  style that names, cells and loading strips share; idle date rows use static
  transforms.
- **Cached derived values.** Per-habit colour levels (`gridAppearance.ts`), date
  labels, and a goal-policy cache bounded to 256 dates per definition. The
  completion mask is selected only while Hide completed today is on.
- **Fallback backdrop.** `GridLoadingBackdrop.tsx` paints read-only dates and
  dashes on the UI-thread offset, so a fast fling shows structure rather than
  black gaps.
- **Deferred presentation.** Grid size, style and theme choices wait until the
  Settings sheet closes, so the hidden grid is not rebuilt on every choice.
- **History and notes.** History groups only the whole days it shows; notes use
  virtualized passages, and the editor caches serialization.

### Measurement tools

- `EXPO_PUBLIC_DEV_PERFORMANCE` console aggregates
  ([Development timing](#development-timing)).
- Settings → Development → Grid diagnostics: Normal / No goal tint / Simple
  cells comparisons with anonymous reports to the paired receiver
  ([Grid diagnostics](#grid-diagnostics)).
- `npm run benchmark:grid` and `npm run benchmark:bottlenecks`: synthetic Node
  benchmarks ([Synthetic benchmarks](#synthetic-benchmarks)).
- `npm run start:compare-dev` and `npm run start:production-js`: paired Expo Go
  sessions comparing development and production JavaScript on the same saved
  data (see [DEVELOPMENT.md](DEVELOPMENT.md)).

### Known costs and open problems

- **Width changes remount both date lists.** The recycler has measured widths
  for old items that cannot safely be mixed with a new fixed width, so rotation
  and size changes reset both native lists. Development-build reports averaged
  0.5–0.85 seconds to grid readiness; half-second readiness is still
  unsatisfactory, and rendering remains the target.
- **Each edit rewrites the whole projection.** The SQLite adapter parses,
  reapplies, validates and rewrites the full JSON projection per edit, and live
  reducers copy value containers. A synthetic five-year store took about 17 ms
  per edit in Node. Per-entry projections with explicit migration and recovery
  tests are a candidate, not an approved change.
- **Startup replays the full log.** Native launch time with long histories is
  unmeasured.
- **Development overhead is unquantified.** The production-JavaScript comparison
  showed no visible loading, but on a shorter saved list. There is no
  matched-data comparison or compiled Release profiling yet; the EAS internal
  preview profile still needs account, signing and device setup.
- **Phone checks outstanding.** A fresh identical Normal-mode report after column
  batching, physical-phone accessibility of column press handling, and the
  Notes/Statistics tab layout with the editor's resume/keyboard matrix.

## Entry updates

The root still subscribes to the store for dialogs, errors and save status.
Its active habit list and grid callbacks retain their identities between
entry edits and save acknowledgements. HabitGrid receives the store, not the
entire values object, so its memo boundary can skip those root updates.

GridCells owns memoized date columns, cells and headings. Each mounted cell
subscribes to its own entry value through `storage/selection.ts`. A date heading
reads only the active habits for that date, including numeric zero. Unrelated
entries, preferences and successful save acknowledgements do not notify these
selected subscribers. Notifications still derive from the authoritative store
snapshot; no second mutable values cache exists. Undo/Redo, restore, pending
edits and re-subscription read current values directly. Disabled state and error
retry continue through root props, so save failures still block further editing.

A mounted grid behind statistics updates the affected cell without rebuilding
all columns. Statistics is memoized against unchanged props for save-status
updates. Statistics calculations themselves still run when their data changes.

## Horizontal scrolling preparation

- `gridAppearance.ts` precomputes five colour levels per habit. Grid rendering
  reads those levels instead of repeating OKLCH conversions/gamut searches per
  cell. Tests verify exact parity with the earlier formulas, including future
  cells.
- Each grid owns a local-date cache. Range expansion keeps existing date objects
  and formats only newly added days with reused Intl formatters. The cache is
  discarded on grid unmount or local-day rollover and is bounded to the loaded
  window or 512 dates, whichever is larger.
- Header and body requests at the same rendered history boundary share one
  extension, so they do not add two 90-day batches. Existing column geometry is
  reused; date columns and headings can skip unchanged React props when the month
  label changes.
- Native UI-thread header/body synchronization, Today animation, future reveal,
  reorder transforms, cancellation and completed-drop persistence are preserved.
  No per-frame synchronization runs on JavaScript.

## Loading fallback

`GridLoadingBackdrop` paints muted dashes per row beneath the body list, using a
viewport-width-plus-two-columns SVG pattern. It has no entry subscriptions or
press handlers. Its translation follows the native offset modulo column width on
the UI thread; reorder geometry remains shared. Two transform-only masks hide
dashes beyond the real content on edge pulls.

A separate read-only date strip pre-renders labels for the loaded date window. It
translates with the same native offset and preserves date-key identity while
extending history. This costs lightweight text for the loaded window, not
habit/day controls. Fallback content is hidden from VoiceOver, and real
columns/headings paint opaque backgrounds over it. A missing control is never
tappable or presented as an unchecked saved value. Fallback movement needs no
JavaScript scroll synchronization.

Superseded (7 October 2026): the first version of this work tuned
`VirtualizedList` batching (body batches of visibleDays + 1 dates, a 16 ms batch
delay, an 11-viewport header window and a 5-viewport body window; see React
Native's
[batch-size/frequency tradeoff](https://reactnative.dev/docs/optimizing-flatlist-configuration)).
Native date lists now use FlashList instead, and the web FlatList keeps only
`windowSize` 5.

## Development timing

Set `EXPO_PUBLIC_DEV_PERFORMANCE=true` in ignored `.env.local`, then fully reload
Expo Go. The example env file defaults it to false. Both `__DEV__` and the env
flag are required; production builds never collect or log these samples, even
with the local flag enabled.

React Native DevTools receives one aggregate console report per active
five-second window, prefixed `[OnPurpose performance]`. It includes counts, total
and maximum milliseconds; it never includes habit names, entry values, dates or
raw events. Automatic console aggregates stay local. Explicit development test
runs can send anonymous timing reports to the paired preview receiver (see
[Grid diagnostics](#grid-diagnostics)). Turn the flag off and reload for an
uninstrumented comparison.

- `grid.container.render`, `grid.cell.render`, `grid.heading.render`: render
  attempt counts, including initial mounting and newly virtualized columns.
  Duration zero for these counters is intentional; use Profiler records for
  actual render cost.
- `grid.render`, `statistics.render`: React Profiler commit actualDuration. These
  measure React work, not native display latency or full frame time.
- `store.apply`: synchronous event validation/reduction.
- `store.metadata`: change ID, edit timestamp and local-zone metadata creation.
- `store.publish`: event-array publication and subscriber callbacks.
- `store.append`: repository append through save-acknowledgement publication,
  including time waiting for native storage (or the sample memory adapter).

To isolate a checkbox edit, let initial mounting settle and wait for the initial
aggregate, tap one cell without scrolling, then inspect the next report. Expect
one changed cell; its heading changes only when that day's recorded/empty state
changes. The grid container should not rerender just for that entry or its
successful save. Strict Mode and concurrent render attempts can increase
counters. Use the DevTools performance trace to inspect JS stalls, and compare a
release build for final performance acceptance; Expo Go timing is not release
evidence.

## Grid diagnostics

Settings → Development → Grid diagnostics is gated by `__DEV__` and
`EXPO_PUBLIC_DEV_PERFORMANCE`. Start a run, close Settings, wait two seconds for
mode-switch/dismissal warmup, then perform the same date flings and three
portrait/landscape/portrait rotations. Return, Stop and send timings. Repeat each
mode with the same list and date range, and avoid editing during this
scroll/rotation comparison. A separate Normal run with ten check/uncheck actions
measures the edit/write path. Sample uses an in-memory repository; Saved uses the
native SQLite adapter on phones. Do not mix sources within a run. Changing or
resetting sample data stops the current test.

Modes are temporary, never preferences or events:

- Normal: current controls and goal evaluation.
- No goal tint: skips goal evaluation for cells, preserving values, dated
  checkbox defaults and native controls. Success colours and accessibility goal
  summaries are deliberately absent during this experiment; rules themselves are
  not edited.
- Simple cells: preserves values, checkbox defaults and goal evaluation, using
  static row views and native text marks instead of the batched checkbox shapes
  and animated row views. Name reordering is disabled. This is a diagnostic
  rendering comparison, not an accepted product appearance.

Runs stop automatically after 60 seconds of measurement or when the app becomes
inactive, and Normal is restored. The last numeric report stays in memory for
Retry. Only discrete start/stop changes notify React; the 100 ms event-loop
monitor does not update React. Its lateness measures JS scheduling, not UI/GPU
frame rate.

Metrics: `grid.ready` measures from the observed width-change layout event (or
the new-frame layout effect for other resets) until both current viewport/onLoad
signals are accepted. It is not proof of GPU presentation. `grid.header.load` and
`grid.body.load` use FlashList's `elapsedTimeInMs`; `grid.render` is React
Profiler's actualDuration. `grid.cell.mount`/`unmount`/`render` and
`grid.column.render` count work. `grid.goal` and `grid.checkbox.policy` isolate
synchronous policy/evaluation costs; they include both accessible cells and
drawing subscribers, so duplicated drawing work is not hidden.
`store.load`/`apply`/`publish`/`ack`/`append` keep their separate meanings. SQL
reads, writes and exclusive transactions are timed through their awaited
completion; these include bridge/wait/JS-resumption latency, not just SQLite
engine time. `repository.read.parse`/`replay` and
`append.validate`/`serialize`/`projection.serialize` measure CPU around the
existing production operations. Nested durations overlap; never add transaction,
SQL and validation totals as independent costs.

Instrumentation itself adds work, especially per-cell clocks and aggregates.
Treat No goal tint as an upper bound on the removed evaluation/reporting cost,
then confirm a proposed optimization with diagnostics disabled on the phone.
These development comparisons do not replace release-build profiling. Compare
work counts as well as elapsed totals, because manual flings cover different
ranges. A report collected entirely inside Settings can contain only JS timer
samples: absent render/ready metrics mean unmeasured, not zero-duration work.

Explicit reports POST to `/performance` on the existing paired receiver, keeping
its authentication/no-browser-origin policy. Both development env flags must be
on for sending. The receiver caps JSON at 64 KiB and rejects extra fields,
arbitrary metric names, non-finite numbers and habit-shaped payloads. Files are
ignored in `.dev/performance/` (latest.json plus dated reports), never habit
storage or backups. No raw SQL, names, descriptions, values or habit dates are
sent. Native controls, upload and the app-state listener are excluded from
release bundles.

## Synthetic benchmarks

Both benchmarks run fictional data in desktop Node (Node 24 is the version pinned
in `.nvmrc`), never open the real database, and write no user data. They measure
CPU, not native iPhone frames, React renders, SQLite bridge time or disk
durability. The tables below are single illustrative runs on one development
machine.

### Grid preparation benchmark

`npm run benchmark:grid` compares the earlier colour/date preparation with the production helpers and
exercises 40 edits with 480 selected subscribers at six months and five years of
synthetic 20-habit history. Each preparation figure comes from 60 timed
repetitions after five warm-up runs; each edit figure from 40 edits.

Run on 4 October 2026:

| Work                                                  |    Median | 95th percentile |
| ----------------------------------------------------- | --------: | --------------: |
| Earlier colour calculations, 288 cells                |  0.730 ms |        1.507 ms |
| Cached colour reads, 288 cells                        |  0.005 ms |        0.016 ms |
| Earlier rebuild of 540 date labels                    | 27.372 ms |       54.060 ms |
| Expand 450 to 540 dates, formatting only 90           |  0.161 ms |        0.169 ms |
| Memory-store edit + flush, 180 days / 2,401 events    |  1.047 ms |        1.346 ms |
| Memory-store edit + flush, 1,825 days / 24,334 events | 17.189 ms |       21.009 ms |

Both edit runs produced 40 cell-subscriber notifications for 40 edits, despite
480 subscribers and separate save acknowledgements. This verifies notification
scope, not native render counts. Palette construction happens when definitions
change and is outside the cached-read timing. Date setup for already-loaded days
is outside the incremental timing.

The five-year result exposes remaining data-processing cost: live reducers copy
value/history containers, and the memory adapter still validates full
projections. The production SQLite adapter also parses, checks and rewrites a
full JSON projection per edit. A data-engine pass should measure native timings
and consider per-entry SQLite projections plus more local in-memory updates, with
explicit migration and recovery tests. No remote backend is involved.

### Storage and read benchmark

`npm run benchmark:bottlenecks` exercises the actual repository/store code on Node SQLite with temporary
fictional disk files, within a 256 MiB heap. Use a hard 40-second timeout/memory
scope when diagnosing runaway work. It compares 20 habits at six months and two
years, the latter with three fictional notes, timing 25 read passes and 20
edits per fixture, and cleans its temporary directory.

Run on 7 October 2026:

| Fixture                                             | Reading/evaluating 960 cells, median | SQL calls for reading | Edit + flush median / p95 |
| --------------------------------------------------- | -----------------------------------: | --------------------: | ------------------------: |
| 180 days, 2,401 events, ~59 KiB projection          |                             0.370 ms |                     0 |          1.781 / 2.640 ms |
| 730 days + notes, 9,735 events, ~263 KiB projection |                             0.208 ms |                     0 |         8.739 / 13.506 ms |

For 20 edits in the larger fixture, append validation used 109.64 ms CPU in
total, projection serialization 20.36 ms and store reduction 40.97 ms; awaited
SQL reads used 2.74 ms in total and writes 1.24 ms. A full projection is
validated and serialized per edit. That is a candidate for a later
targeted-projection change, not evidence that SQL or rendering dominates on the
phone. Sequential warmup/cache/JIT differences mean the two read medians are not
a history-size scaling comparison.

## Optional completed-row filtering

Hide completed today is off by default. When it is on, the grid selects a
primitive mask through `completedHabitsSelection`, computed from each habit's
effective-dated goal at Today (all four habit types; see [GOALS.md](GOALS.md)).
Only edits that change whether a habit meets its goal at Today change the mask;
other edits, other dates, preferences and save acknowledgements leave it
unchanged. When the option is off, entry edits keep the per-cell update path
without notifying the container.

Filtering changes displayed row geometry, so a qualifying edit does rebuild the
visible rows. This is the cost of the explicitly requested optional behaviour,
not a replacement for stable rows by default. `useDelayedCompletionMask.ts` keeps
tap-burst targets in place for 700 ms of quiet; Undo and unchecking reveal rows
immediately. Names, cells and fallback geometry use the same displayed IDs;
date-heading recorded state reads the full active list. Native scrolling stays on
the UI thread. Hidden and archived order slots stay fixed when the displayed
subset is reordered.

## Large descriptions

Notes and Statistics are tabs in one sheet; the compact-card experiment is
superseded. The initial panel mounts alone, then its neighbour warms after 200 ms
or the first navigation. Both stay mounted in a fixed-width native horizontal
pager, excluded from touch and accessibility when inactive. `useHabitPages.ts`
sends no per-frame React updates: shared values move the floating selection
pill, and an aligned-offset reaction updates selection once. Native directional
locking handles horizontal/vertical interaction; orientation aligns the settled
page at the new width. Statistics does not render notes. Habit edit and Versions
use bounded excerpts, which the edit form memoizes. Full note reading uses
native FlatList passages with top-level list items split into individual rows,
preserving nested contents and numbering. Its disposable cache is capped at five
documents/100,000 characters.

The DOM editor memoizes startup parsing, prepares byte-preserving snapshots from
that content, and avoids transaction-driven whole-component renders. Toolbar
selectors remain immediate. Formatting-aware length validation still checks each
new immutable document, with per-editor weak serialization/snapshot caches
sharing results across validation, reporting and Done. Unchanged snapshot reads
do not serialize again. Text crosses the DOM/native bridge after 200 ms quiet or
a one-second deadline. Selection/scroll settles at 250 ms and sends only position
when text has already been reported. Background and exact Done/Close snapshots
remain explicit; native draft writes keep their 350 ms debounce.

First editor opens align caret and viewport at the start, with viewport/content
resize restoration until deliberate interaction. Existing matching bookmarks
remain. The writing area owns scrolling, with DOM roots clipped to prevent outer
scrolling; startup feedback does not imply the WebView/editor initialization cost
is gone.

## Categorical and free-text cells

Daily values include primitives and stable arrays of category IDs. Per-cell
subscriptions keep unchanged references through save acknowledgements; category
corrections compare array contents across SQLite serialization. Native
horizontal scroll synchronization and the loading backdrop are unchanged.

Grid previews collapse whitespace and cap measurement at 32 Unicode characters,
with a consistent 12-point font before app/OS scaling and native tail ellipsis.
`gridEntryText.ts` derives 1–3 lines from measured row height and combined scale.
Column width controls native wrapping, not font compression. Native fitting is
disabled for text/categories because our iOS renderer ignores
`minimumFontScale`. Full values remain in storage and the editor. Recording
statistics virtualize their dated entry list rather than mounting every full
text value. Browser checks cover layout, not native font fitting or iPhone frame
rates.

## Appearance changes behind Settings

The grid used to receive each new spacing value while hidden behind Settings: a
column-width change recreated the two keyed native lists, and row changes
propagated layout/measurement work. `useGridDisplayPreferences.ts` now holds
grid-only display values until native sheet dismissal, then releases the latest
choices together. Settings and the durable write queue remain current. An inner
TypographyProvider prevents app text-size choices from invalidating the hidden
grid through context. The grid stays mounted with its scroll state; cell/store
subscriptions and actual entry/definition changes remain live. Completion
filtering is prepared immediately behind Settings; only presentation geometry
waits for dismissal.

A bounded React regression counts one initial memoized grid render, no grid
renders for several hidden appearance choices/save acknowledgements, and one
render when the final preferences are released. Returning settings to their
original displayed values produces no grid render. This establishes the
presentation update boundary, not native latency or iPhone frame rates.

## History with long logs (10 October 2026)

History groups only the days it shows (40 at a time, never splitting a day) and
caches each action's local day and kind for the session, keyed by the action
object that replay keeps between updates. Local days reuse one time-zone offset
per quarter hour and one label per day. Only the open jump calendar scans the
whole log. Node timing for 20,000 synthetic actions: about 7 ms uncached, 2 ms
cached and 0.1 ms for 40 days. This is not a phone measurement; check scrolling
and the calendar on the iPhone.

## Investigation log

Dated device reports and the work that followed, oldest first. Statements marked
“Superseded” describe an earlier state. iPhone figures come from the iPhone 16
Pro running development JavaScript in Expo Go with in-memory Sample data, Normal
diagnostic mode and manual date flings plus rotations. Run lengths and work
differed, so they are indicative, not controlled benchmarks.

### 4 October 2026: entry feedback and fast flings

The founder reported slow check/uncheck feedback and problems with fast
horizontal scrolling. Per-cell selectors ([Entry updates](#entry-updates)) and
cached colour/date preparation
([Horizontal scrolling preparation](#horizontal-scrolling-preparation)) reduced
identified work; device smoothness still needed measurement. The founder confirmed the checkbox improvement but still saw
black gaps when native scrolling outran React rendering, which led to the
[loading fallback](#loading-fallback).

### 5 October 2026: long notes on the phone

The synthetic phone fixtures are Go for a walk (1,874), Read (7,723) and Meditate
(17,657 characters), only in Sample data. A bounded Node/jsdom diagnostic counted
75 → 25 serializations for 25 edits plus 25 unchanged snapshot reads at every
size. Node timings do not establish iPhone responsiveness. The founder confirmed
the long-note reader feels instant on the iPhone, then authorised a Notes-first
tab trial to avoid a second navigation tap. The founder confirmed the corrected
first editor opening starts at the beginning without a black jump. The tab
layout and wider resume/keyboard matrix still need device review, along with
opening stats, the reader and editor, rapid typing, selecting/formatting,
immediate Done, background recovery and long scrolling.

### 7 October 2026: dated goals, windowed navigation and rotation

The founder reported renewed fast-scroll stalls and several seconds of misplaced
columns after rotation. Each cell was repeating goal timeline/default lookups,
while keyed native lists rebuilt with delayed initial scrolling and the loading
backdrop briefly kept the old pixel offset. The read-only date strip also grew
with every loaded date. These were identified costs, not a measured allocation
of the device's frame time.

`habitGoals.ts` now caches date/definition policy in a WeakMap, at most 256
dates per live definition. It shares effective rule, default state and schedule
maths; it never caches daily values or completion results. Entry edits remain
live, and immutable definition changes/Undo/restore invalidate via identity.
Start/type/timeline reference changes also reset the policy cache. Non-checkbox
cells no longer ask for checkbox defaults. No quota/statistics computation
enters cells.

`createGridDayCache` accepts a signed date origin, keeps overlapping identities
and bounds its disposable cache to the loaded window or 512 dates, whichever is
larger. Date-picker jumps create 120 dates around the target rather than all
intervening years. Native older/newer boundary loading extends in 90-day chunks;
more than 360 loaded dates compact to 270 only after final native settling. The
fallback strip remains prepainted for that window and follows the UI-thread
offset. Newer historical dates load without future resistance/haptics; beyond
the current future edge keeps the pull.

Rotation captures the actual native offset once, translating it back to a date.
A stable frame supplies identical `initialScrollIndex`/`contentOffset` to header
and body, and sets the fallback's new pixel offset during layout. Old mount
offsets are ignored until both native viewports and first-visible-items onLoad
signals match that frame; stale generation callbacks cannot release it. The
existing list width keys remain. Font-dependent name wraps still measure
natively.

Name width and revised column density joined the Settings presentation deferral
here. Superseded (9 October 2026): the [v18 size sliders](SETTINGS.md) replaced
both and use the same deferral.

Hide completed gained its 700 ms quiet period, and numeric suggestions read only
30 date keys on opening, not the lifetime entry map. Neither feature delays
normal persistence.

### 7 October 2026: device feedback and recycled columns

The founder reported that the first cache/frame attempt improved neither
scrolling nor rotation. Native date lists moved to FlashList 2.3.3 to recycle
mounted column views. This JS library supports the existing new-architecture
Expo Go runtime; 2.0.2, selected by the SDK recommendation, lacked inverted-list
support. Native inversion uses the library's supported prop, without custom
mirrored cell wrappers. The founder then reported better scrolling and rotation,
with an approximately one-second intermediate rotation layout still visible,
especially landscape to portrait.

Row preview targets now animate as one shared record in useHabitReorder, rather
than starting a separate spring/reaction/shared value in every date cell.
Ordinary name-height/layout changes set row targets directly; hiding, archiving
and restoring rows animate the shared target record for 220 ms. Swaps and
completed drops keep their UI-thread springs. Unchanged measured root bounds do
not publish another React update. Checkbox feedback runs only on accepted taps,
with non-interaction animations and Reduce Motion; recycled identities stop or
reset an earlier pulse, and new columns never pulse on mount.

Rotation still resets lists when physical column width changes. Both lists start
at the captured date and expose only the existing fallback dates/dashes until
both viewports are current and native lists report their first visible items
drawn through onLoad. An exact estimated total content width must not gate
native readiness; web FlatList uses its fixed size. useMeasuredRowHeights batches
native name-wrap reports into one animation-frame update, rejecting stale
geometry callbacks and skipping unchanged measurements. Header/body
synchronization, fallback offsets and tap animations remain native/UI-thread.

Temporary Undo receipts notify only QuickUndoActions, not the grid container.
All accepted grid entry changes and archival offer four seconds of
specific-action Undo; preferences and unrelated edits stay intact.

The founder reported that the initial readiness mask left only dashes after
rotation. That check incorrectly depended on the recycler's estimated total
width matching an exact value. Native readiness now uses current viewport
layouts and onLoad for both lists, rejecting stale generations; focused callback
tests cover estimated width mismatch and event ordering. The founder accepted
four-second entry/archive Undo and filtering prepared behind Settings, then
requested smoother disappearance and row movement. Undo now fades out for
180 ms, and row identity changes animate one shared record with matching keys
rather than resetting it in the idle cancellation effect. Geometry changes and
cancellation of an active drag still reset immediately.

### 7 October 2026: phone acceptance and remaining rendering cost

The founder confirmed that Undo/row-removal animations feel good and rotations
now lay out correctly. The remaining concern was the delay filling the grid with
real entries. Entries are already read from the in-memory projection; rotation
does not reload SQLite.

Superseded (7 October 2026): at this point date columns built every habit row,
including vertically off-screen rows. Row windowing now limits real cells to the
vertical viewport; see
[renderer improvements](#7-october-2026-renderer-improvements-without-skia).
Width changes still remount both measured lists.

Assistant proposal at the time: measure visible-cell readiness, React commits and
native layout on the phone; simplify cell/row view trees and reduce work outside
the visible rectangle; investigate keeping recycled views through width changes
with a renderer that explicitly supports new geometry. The first two parts were
implemented in the renderer passes below; keeping recycled views through width
changes remains open. Do not simply remove width keys: that previously mixed old
measured widths with new ones. Compare release performance before choosing a
larger custom renderer. The loading fallback is a resilience feature, not the
performance goal.

### 7 October 2026: grid bottleneck investigation

The founder requested measurement before choosing Skia or a data-engine rewrite.
This added [Grid diagnostics](#grid-diagnostics), SQL profiling and
`npm run benchmark:bottlenecks`
([results](#storage-and-read-benchmark)). Device reports and
release profiling remain the deciding input. No Skia dependency or storage
schema/event change was made.

### 7 October 2026: first iPhone baseline

The founder sent a Normal-mode iOS/Sample run lasting 41.3 seconds. It recorded
11,158 cell renders, 797 date-column renders and 2,366 cell mounts/unmounts each.
React Profiler accumulated 8,405 ms across 818 commits, with a 296 ms maximum.
Cell goal evaluation totalled 34.8 ms; dated checkbox policy totalled 9.2 ms.
These synchronous calculations are small relative to the recorded rendering
work in this fixture. This does not establish costs for every possible rule set.

Four grid-ready measurements averaged 846 ms, maximum 1,169 ms. Header/body
onLoad averages were both about 585 ms; these measurements overlap, not add.
The JS timer saw a 5,129 ms maximum lateness, which establishes a scheduling
stall, not its cause or a native frame rate. The run also included statistics
renders, so it is an exploratory baseline rather than a controlled benchmark.
No SQL calls occurred, consistent with the in-memory Sample repository and the
grid read path. Saved-data write latency remains a separate unmeasured path.

Superseded (7 October 2026): Simple cells was planned as the next comparison
before changing the renderer. The founder instead authorised renderer
improvements directly (next entry); Simple cells remains available as a
diagnostic mode. Goal-free rendering was unlikely to explain most of this
baseline's delay.

### 7 October 2026: renderer improvements without Skia

The founder requested proceeding with the existing renderer. RowPositions owns
one keyed animated-style controller per displayed habit outside the resetting
date lists. The name, loading strip and every mounted date cell attach to that
same handle. Reanimated 4 explicitly supports
[sharing animated styles between components](https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedStyle/),
and the installed adapter detaches individual view descriptors on unmount.
Controllers register in a layout effect; the brief initial fallback uses the same
fixed top-zero/absolute translateY anchor. No mapper/animation setup runs in each
ReorderRow. Owners survive date recycling and portrait/landscape list resets,
keep stable IDs during preview swaps, and release removed habits. This reduces
controller setup, not the number of native views receiving moving-row
transforms.

GridCheckboxMark creates its native Animated.Value/scale graph on the first
accepted tap rather than on every checkbox mount. The first pulse starts after
the scale prop commits; pending requests are paired with the exact cell
identity. Recycling stops an old pulse without starting another. Rapid taps
restart the same short native, non-interaction sequence; reduced-motion taps
allocate nothing. The checkbox drawing, colours, dimensions and accessible cell
controls remain.

gridRowWindow/useGridRowWindow limit real date cells to the measured vertical
viewport plus two base rows of overscan at each edge. Offsets update the row set
only when crossing a two-row bucket in the existing vertical handler. Measured
wrapped heights and absolute tops determine membership; row definitions keep
their identities while a window is unchanged. Names still measure all habits,
total content height and full reordering remain intact, and all rows render
while a menu/drag/reorder mode is active or for 300 ms after an identity change
to cover the shared 220 ms removal/restoration motion. The read-only UI-thread
date/dash backdrop remains independent of the real-cell window. Horizontal
synchronization, width readiness, future pull and dated entry subscriptions are
unchanged. No dependency, event version, preference or SQLite schema changed.

Focused tests establish controller reuse and registration/removal, dynamic drag
coordinates, zero untouched checkbox allocations, recycling/reduced-motion
cancellation, wrapped/scaled window coverage, bucket-only updates and full-row
transition coverage. A synthetic four-row viewport initially renders six of 30
rows; this is a work-count assertion, not a native speed measurement.

### 7 October 2026: second iPhone report and column batching

The next Normal/iOS/Sample run lasted 22.1 seconds. Six grid-ready measurements
averaged 508 ms, maximum 893 ms; header/body onLoad averaged 175/163 ms. It
recorded 6,888 cell renders, 572 columns, 1,306 cell mounts/unmounts each and
4,545 ms of accumulated React work across 494 commits. Goals totalled 16.3 ms,
checkbox policy 5.6 ms and SQL calls remained absent. The JS timer's maximum
lateness was 925 ms. Compared with the first report, ready callbacks improved
from 846 to 508 ms (about 40%), but the runs differed in length and work and the
first included statistics. This is indicative, not a controlled speedup. Raw
render totals cannot be compared without work counts. Half-second readiness is
still unsatisfactory; rendering remains the target.

The founder requested a larger improvement. Native date columns now have one
ordinary Pressable rather than one per real row. useGridColumnPress captures the
habit/date at press-in, accounts for press-out-before-press and accepts only a
release on that same current row/date. gridColumnHit uses measured heights and
absolute content coordinates; omitted fallback rows cannot be edited. While rows
move, touch boundaries read current shared tops so input follows the visible row
rather than its final target. Idle taps and scrolling do not perform synchronous
UI-position reads. Disabled save/error state blocks both normal and accessible
activation. Native scrolling still owns press cancellation and UI-thread
synchronization.

Each native cell keeps an accessible row view, role, checked/disabled state,
label, hint and native activation handlers, using the documented
[View accessibility events](https://reactnative.dev/docs/view).
Numeric/text/category values remain native Text, including existing scaling,
numeric fitting and readable tail truncation. The browser keeps individual
Pressables. Accessibility correctness on the physical phone still needs review.

GridCheckboxLayer draws idle checkbox boxes/ticks/crosses inside one SVG per
column, keeping per-entry subscriptions and dated goal colours. This replaces
individual checkbox drawing roots/wrappers, not native text. Only a locally
accepted checkbox change creates a short native feedback overlay; its idle shape
is hidden while pulsing. The overlay is removed after 220 ms, rapid taps restart
it, and reduced motion/tap-disabled settings allocate none. External updates,
Undo and date recycling do not start feedback.

Stationary native date rows also stop attaching shared animated styles: they
keep the same Animated.View with an ordinary top-zero/translateY position.
Menu/drag/reorder and the identity-change window reconnect the shared row styles
and use the native checkbox marks so names and cells move together. No row-view
remount or sibling reorder is required for that switch. Names and loading strips
still use their shared styles. With eight real rows, ordinary Pressability
controllers fall from eight to one per date, and idle date-position attachments
fall from eight to zero. SVG root reduction depends on the number of checkbox
rows, style and values. These are structural counts, not an eightfold speedup
claim.

The diagnostic modes now operate on this optimized native control path. Normal
and No goal tint use the batched shapes; Simple cells still substitutes text
glyphs and static rows. The original native Normal renderer is not kept as a
runtime toggle. No Skia, native dependency, storage change or removal of
width-reset safety was introduced.

### 7 October 2026: development overhead comparison

The next received Normal/iOS/Sample run lasted 22.7 seconds. Five ready callbacks
averaged 737 ms, maximum 1,068 ms. It recorded 5,576 cell renders, 475 columns,
4,944 ms of React work over 386 commits, 17.3 ms of goals and a 1,734 ms maximum
JS timer delay. This does not demonstrate a further speed improvement; manual
work differs and the report has no renderer revision identifier.

The founder requested testing whether development mode explains much of the
delay. [React Native](https://reactnative.dev/docs/performance#running-in-development-mode-devtrue)
warns about development overhead, and
[FlashList](https://shopify.github.io/flash-list/docs/fundamentals/performance/)
explicitly requires release-mode profiling. Paired local launchers compare
unprofiled development and production/minified JS in Expo Go, on the same saved
store with sample history and preview capture disabled. This is qualitative
evidence within the native Expo Go host, not a fully compiled release test or an
FPS measurement. No development timing report is collected during either
session. The EAS internal preview profile specifies Release, but the cloud
project, Apple signing and device registration still need setup. Read
[DEVELOPMENT.md](DEVELOPMENT.md) and [RELEASING.md](RELEASING.md) for the
distinct workflows and matching-data requirements.

The founder then reported no visible loading while rotating or rapidly
swiping/scrolling in the production-JavaScript comparison. The saved list lacked
the long sample data, so this supports the development-overhead hypothesis but
cannot establish matched-data release performance. No frame-rate figure follows
from this observation.

The same day's organization pass moved numeric typing into NumericRecordDialog
instead of App. The dialog/controller test verifies that multiple keystrokes
cause no further host commits, while Done still reads the latest entry before
saving. This is a React ownership/work-count improvement; no new phone timing was
taken.

### 7 October 2026: grid controller organization

useGridDates now owns the bounded range, navigation and readiness state that
previously lived directly in HabitGrid. The hook runs in the same mounted owner;
useGridScroll's synchronization and streak/shared offsets stay on the UI thread.
DateColumns keeps native recycling, a stable initial index and the existing
width/range generation keys. Context-menu measurement moved to local component
state; a test confirms it causes no additional parent commits. Storage
validation was extracted with identical function bodies, not weakened or
optimized. This refactor makes future performance work easier to isolate; no phone
speedup is claimed.

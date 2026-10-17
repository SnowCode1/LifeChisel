# Architecture

How the OnPurpose app is put together: its layers, each subsystem's current
responsibilities and key files, platform differences, development tooling and
known limitations. [AGENTS.md](../AGENTS.md) holds the exhaustive file-level
ownership rules, and the topic documents linked from each section hold product
rules and formats.

## Overview

OnPurpose is one React Native screen written in strict TypeScript on Expo SDK 57.
The home view is the habit-by-day grid. History, Settings, Notes/Statistics and
the editors open as native sheets or dialogs above it, so the grid stays mounted
underneath. There is no navigation library, backend, account flow or
scheduler, and no analytics SDK yet (crash reporting and analytics are planned). It runs on iOS and Android devices (which launches first is
undecided). The Expo web build is a layout preview for the rest of the screen;
it shows a short notice in place of the habit grid.

The repository uses npm workspaces. The phone app stays at the root.
`packages/core` (`@onpurpose/core`) holds the platform-neutral logic: storage,
dates, entries, goals, completion, statistics, theme and icon catalogues. The
phone app and the separate browser app in `apps/web` both use it
(see [WEB.md](WEB.md)). Paths under `packages/core/src/` below are shared;
paths under `src/` are phone-only.

```text
UI       App.tsx: screen state, dialogs and nested native sheets
           HabitGrid (names, Skia canvas grid) · AppPanel (History, Settings)
           HabitDetailsScreen (Notes/Statistics) · editors and entry dialogs
             │
Hooks    useDailyEntryActions · usePersistentStore · useGridDates
         useCanvasGridScroll · useGridModel · useCanvasGrid
         useBackupActions · useQuickUndo · useGridDisplayPreferences
             │
Store    ChangeStore (storage/store.ts): immediate state, serialized write queue,
         Undo/Redo, backups · selectors (storage/selection.ts)
             │
Storage  repository.ts → native.ts → Expo SQLite        (iOS, Android)
         browserRepository.ts → native.web.ts → localStorage   (web)
```

**Startup.** `useStoreOpening` opens the store. The repository loads the whole
change log, and replay validates it and rebuilds the current state plus the
Undo/Redo stacks, repairing a stale projection from the log. `ChangeStore`
publishes a snapshot; `usePersistentStore` subscribes the app, and the grid's
`useGridModel` subscribes once and prepares drawing records for the days near the
visible dates.

**An edit.** A tap on the canvas goes through `useDailyEntryActions`, which reads
the before-value from the store's current state. `ChangeStore.change` builds the
event, applies it in memory and notifies subscribers; the grid model re-prepares
only the days whose saved values changed, so the cell redraws at once. The queue then appends the event and the new projection in one
SQLite transaction; a failure stays visible with Retry.

Theme and text scale wrap the tree: `ThemeContext.tsx` provides colours derived
from one background, and `Typography.tsx` applies app-wide text scaling.
`useLocalToday.ts` moves Today at local midnight and when the app returns to the
foreground.

## Code map

Grouped by subsystem; not every module is listed.

```text
index.ts, App.tsx      app registration; screen state, dialogs and nested sheets
app.json               Expo configuration (generated native folders stay ignored)

Grid
  src/HabitGrid.tsx            toolbar, names, measured width, rows, vertical scrolling
  src/useGridDates.ts          settled date, Today/date/future navigation, resize anchoring
  src/canvasGrid/
    useCanvasGrid.tsx          heading and cell canvases, taps, pressed highlight, pulse
    useCanvasGrid.web.tsx      web notice in place of the grid
    useCanvasGridScroll.ts     UI-thread pan, release and future pull
    gridMotion.ts              release planning: momentum that ends exactly on a column
    withFling.ts               runs a planned release as a Reanimated animation
    fillWave.ts                plans and evaluates a drag-to-fill's wave animation
    useGridModel.ts            JS-thread cell records in 30-day chunks, Skia paragraphs
    GridAccessibilityLayer.tsx invisible native views for screen readers
    cellAccessibility.ts       cell state, roles and labels
    gridGeometry.ts            offset ↔ day maths, snapping, rubber band, checkbox geometry
    gridDates.ts               worklet date keys, weekdays and week shading
  src/gridNavigation.ts        future-pull threshold, batch size and reveal target
  packages/core/src/gridSizing.ts            stored grid sizes, legacy mapping, automatic rules
  src/gridLayout.ts            adaptive name/day geometry with text scaling
  src/useMeasuredRowHeights.ts batched native row measurement
  packages/core/src/gridAppearance.ts        cached per-habit grid colours
  packages/core/src/gridEntryText.ts         text/category cell line count (both apps)
  packages/core/src/tapMotion.ts             tap/fill timing, bar contact time (both apps)
  packages/core/src/entryFill.ts             one change for a run filled along a row
  src/ReorderRow.tsx           RowPositions: shared row movement
  src/DateNavigationSheet.tsx  date picker sheet (src/DateCalendar.tsx on Android)
  packages/core/src/calendar.ts              local date keys and signed date arithmetic

Storage and History
  src/storage/                 event model, validation, replay, repositories, ChangeStore, backups
  src/usePersistentStore.ts    store opening, subscription and foreground retry
  src/useBackupActions.ts      backup confirmations, busy guard and errors
  src/AppPanel.tsx             History/Settings/archive sheet over the grid
  src/HistoryView.tsx          day sections, burst/action rows, jumps, floating Undo bar
  src/HistoryFilters.tsx       filter chips and habit picker
  src/HistoryCalendar.tsx      History's month and year calendar view
  packages/core/src/history.ts               cached edit-day grouping, filters, bursts, row text
  src/useQuickUndo.ts          four-second Undo receipts (quickUndo.ts, quickEntryUndo.ts)

Habits, entries and goals
  packages/core/src/habits.ts, packages/core/src/entries.ts  habit/entry types, demo habits, labels, previews
  src/useDailyEntryActions.ts    shared daily input/save controller
  src/NumericRecordDialog.tsx    numeric drafts and suggestions
  src/DailyRecordDialog.tsx      category and text entry
  src/HabitName.tsx              name taps, holds and drag recognition
  src/useHabitReorder.ts         drag geometry, preview order and drop
  src/HabitContextMenu.tsx       anchored hold menu
  src/HabitDialog.tsx            create/edit habit and colour drafts
  packages/core/src/habitCompletion.ts         completion rules for all habit types
  packages/core/src/habitGoals.ts              effective-dated goal timelines
  packages/core/src/goalTiming.ts              period quotas and on/off cycles
  src/HabitGoalsEditor.tsx       goal sheet and timeline (GoalVersionForm.tsx and others)
  src/ArchivedHabits.tsx         archive, restore and undoable delete

Notes
  src/HabitDetailsScreen.tsx     Notes/Statistics pager (with useHabitPages.ts)
  packages/core/src/notes.ts                   named notes: presets, rules, builders, versions
  packages/core/src/description.ts             Markdown parsing, validation and previews
  src/HabitNotes.tsx             note names and the shown note on the Notes page
  src/NoteSheet.tsx              add, rename, move or remove a note (in-sheet overlay)
  src/DescriptionReader.tsx      virtualized native note reading
  src/DescriptionEditor.tsx      full-screen editor host
  src/RichDescription.tsx        Expo DOM/Tiptap editing surface
  src/richText/                  document mapping, formatting, local Undo, editor theme
  src/DescriptionHistory.tsx     Before/After comparison and restore
  src/descriptionDrafts.ts       recoverable local drafts and bookmarks

Statistics
  src/HabitStatsScreen.tsx       checkbox and numeric statistics
  src/RecordStatsScreen.tsx      category and text recording statistics
  src/StatsLayout.tsx            range tabs, period stepping, sections, tiles
  src/ChartFrame.tsx             shared chart interaction and axes
  packages/core/src/statsSeries.ts             day outcomes, bins, trend and streak runs
  packages/core/src/statistics.ts              pure checkbox/numeric calculations
  packages/core/src/completionStatistics.ts    scheduled-opportunity counts and streaks
  packages/core/src/periodStatistics.ts        period progress, results and period streaks
  packages/core/src/recordStatistics.ts        logging counts and category frequency

Settings, theme and feedback
  src/SettingsScreen.tsx         settings index and detail pages
  packages/core/src/displayPreferences.ts      preference defaults
  src/useGridDisplayPreferences.ts  grid presentation deferral behind Settings
  src/GridSizeSettings.tsx       Name column / Day columns / Rows sliders
  src/BackgroundSettings.tsx     theme backgrounds, OKLCH sliders, preview
  packages/core/src/theme.ts                   pure theme derivation (ThemeContext.tsx provides it)
  packages/core/src/colors.ts                  OKLCH/sRGB conversion, gamut mapping, contrast
  src/ColourPicker.tsx           habit colour presets and custom colours
  src/Typography.tsx             app-wide Text/TextInput scaling (textSize.ts)
  src/haptics.ts                 nonblocking haptic feedback
  src/motion.ts                  reduced-motion-aware transitions
  src/SheetModal.tsx             iOS pageSheet / Android gesture sheet
  src/Icon.tsx                   outline icons rendered with react-native-svg

Development only (excluded from release JavaScript)
  src/dev/                       sample data, preview capture, performance controls
  packages/core/src/performance.ts             diagnostic runs and aggregates (performanceModel.ts)
  packages/core/src/developmentFeatures.ts     comparison-session override
  packages/core/src/storage/profileSql.ts      SQL timing wrapper

scripts/
  *.test.mjs                     node:test suites run by npm test
  benchmark-grid.mjs             synthetic grid preparation benchmark
  benchmark-bottlenecks.mjs      synthetic storage/read benchmark on Node SQLite
  start-comparison.mjs           paired development / production-JS Expo Go launchers
  preview-server.mjs             local preview and performance receiver
  android-screenshot.mjs         adb screenshot helper
  generate-phosphor.mjs, generate-tabler.mjs, generate-editor-icons.mjs  icon generators
  generate-app-icons.mjs         app icon, Android layers and favicons from one geometry

docs/                            project documentation; docs/examples holds storage fixtures
assets/                          app icon, Android icon layers, favicon and splash image
```

Generated icon catalogues (`phosphorPaths.ts`, `tablerPaths.ts`,
`editorIconPaths.ts`) are the largest files; regenerate them rather than editing
by hand. Do not split generated data or feature forms only to reach a line-count
target.

## Grid

The date area is drawn with Skia (`@shopify/react-native-skia` 2.6.2, bundled
in Expo Go SDK 57) on iOS and Android; it replaced the FlashList date lists on
12 October 2026 (founder decision, see [DECISIONS.md](DECISIONS.md)). Two
canvases share one horizontal offset: fixed date headings, and the cells inside
the vertical ScrollView at the grid's full height, beside the native habit
names. Both pictures are recorded in a Reanimated derived value from that
offset on the UI thread, so headings and cells cannot drift apart, and no React
component exists per cell or column. React hears only discrete events: a
settled day, a future reveal, an arrival and a cell tap. Never move per-frame
scrolling or drawing back to JavaScript. Smoothness must be judged on the phone;
see [PERFORMANCE.md](PERFORMANCE.md).

| Module                  | Responsibility                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| HabitGrid               | Measured outer width, names, rows, vertical scrolling, reorder controls, toolbar and the date picker            |
| useGridDates            | Settled rightmost day, unlocked future, month/year label, Today/date/future navigation and resize anchoring     |
| useCanvasGridScroll     | Gesture-handler pan on the UI thread: drag, release, rubber band, pull threshold and arrivals                   |
| gridMotion, withFling   | Release planning (momentum landing exactly on a column, springs, edge stops) and the animation that runs it     |
| useGridModel            | JS-thread cell records in 30-day chunks around the visible dates, Skia paragraphs, updates on changed days      |
| useCanvasGrid           | Heading and cell canvases, Today pill, week shading, streak, tap hit testing, pressed highlight, checkbox pulse |
| GridAccessibilityLayer  | Invisible native views giving visible cells and headings their roles, states, labels and actions                |
| gridGeometry, gridDates | Worklet maths: offset ↔ day, visible range, snapping, rubber band, checkbox geometry, date keys and weekdays    |
| HabitContextMenu        | Menu appearance, local height measurement and placement; held names remain reachable                            |

**Cells.** `useGridModel` prepares one record per habit and day on the JavaScript
thread, in 30-day chunks (two chunks either side of the visible position, keeping
up to eight chunks away), into a shared map keyed by day. Text and category
previews are Skia paragraphs with the line count from `gridEntryText.ts`, an
ellipsis and system font fallback for emoji; numbers use a paragraph shrunk to
fit, down to 65%. Store notifications re-check only the prepared days whose
saved values changed; save acknowledgements keep the same values and do nothing.
A change of font scale, column width, theme, row height or habits rebuilds the
prepared days. A day not prepared yet draws dashes for a moment. Cell
backgrounds follow pressed, then goal met, then Today, then plain; both checkbox
styles (boxes and marks) draw as paths.

**Taps.** A gesture-handler Tap races the horizontal Pan. Press-in hit tests the
row (reading live row positions) and shows the pressed highlight; release on the
same cell calls `useDailyEntryActions.pressCell`, so haptics, dialogs and Quick
Undo are unchanged. The checkbox pulse (scale 1 → 0.94 → 1 over 45 + 135 ms)
and join motion run only when the checked state actually flipped, gated by Tap
animations and Reduce Motion; their timing is in core `tapMotion.ts`. An
accepted tap keeps the pressed shade on the UI thread until `activate` applies
it, then fades it into the cell's new background (`drawCellBase`'s `fade`), or
clears it at once when nothing flipped. Taps are disabled while editing is blocked, during a drag and in
reorder mode; scrolling is locked while the menu is open or a drag is active.

**Accessibility.** The canvas itself is invisible to screen readers.
`GridAccessibilityLayer.tsx` keeps native views for every visible cell, with the
previous `cell-<habit>-<date>` test IDs, role, checked/disabled state, label,
hint, `activate` action and `onAccessibilityTap` (wording from
`cellAccessibility.ts`), plus header-role date headings and an adjustable
"Dates" strip that pages by the visible day count. It follows the shared offset
and takes touches only while a screen reader is on; otherwise it passes touches
to the canvas gestures. It has not yet been checked with VoiceOver or TalkBack.

The grid is one mounted state owner: `useGridDates` runs inside it rather than
adding another store, per-frame callback or remounted screen. Context-menu
height is local to the always-mounted menu, so menu measurement never updates
the grid parent.

### Dates and future pull

Every date is generated on the fly from the offset, so there are no date lists,
windows, remounts or anchoring. Offset 0 places Today in the rightmost column;
positive offsets show older days and negative offsets show unlocked future days
(day _d_ sits at x = width − (_d_ + 1) × column + offset). About a century of
past days is reachable. Dragging moves the offset directly, picking up under
the finger without jumping by the 10-point activation distance. Each release
is planned before it moves (`gridMotion.ts`): the natural stopping point under
iOS's fast deceleration (0.99 per millisecond) is projected from the release
velocity, the nearest column to it is chosen, and the exponential slowdown is
retuned to end exactly there, starting at the finger's speed. A release too
slow to reach a column eases onto the nearest one with a critically damped
spring. There is no separate correction after momentum. The curves are
functions of time, so 60 and 120 Hz screens trace the same path. Once the
remaining movement is under 2 points the settled day is sent to React for the
month/year label and the Today action. A touch on momentum faster than 0.15
points per millisecond only stops it; it never checks a box or opens a dialog.

The Today/future boundary sits at −unlocked future × column. A fling that would
pass it decelerates harder so it stops exactly at the boundary, easing out over
at least a 45 ms time constant, without overshooting or bouncing: momentum alone
never crosses it, only a finger pulling past. Both platforms use the same iOS-style pull: dragging past the
boundary moves the columns with rubber-band resistance, the heading streak grows
with the pull, and the threshold haptic fires once at 64 points. Releasing past
64 points unlocks 30 more future days (`FUTURE_BATCH`) and animates by the
release distance, normally to tomorrow beside today (`futureRevealDay`); a
shorter release settles back at the boundary. At the new edge another pull reveals the next
batch. Future entries use the same habit ID/local-date keys as past entries.

Navigation animates the offset on the UI thread for 280 ms (ease-out cubic,
following the system Reduce Motion setting); a new finger stops it. The Today
action appears only while browsing the past or future, in reserved space so
nothing shifts; returning to Today animates to it, then collapses the unlocked
future without deleting entries. The month/year button opens the date picker
(`DateNavigationSheet.tsx`), which jumps straight to any date, unlocking future
days as needed; this is also the gesture-free route to future dates. Rotation and
column-size or text-size changes keep the logical rightmost day
(`prepareResize`) and place it immediately at the new column width. A vertical
ScrollView moves names and cells together while date headings stay visible.

### Geometry and rows

Row heights are measured from habit names/units so wrapped names and larger text
stay aligned. Users can choose fixed name-column, day-column and row sizes or
Auto in Settings ([SETTINGS.md](SETTINGS.md)); `gridSizing.ts` stores those
choices and the automatic rules, and `gridLayout.ts` turns them into geometry.
Automatic day columns are at least 48 points (scaled for larger text), and the
automatic name width is bounded so landscape gives its extra space to dates. Day
columns are whole physical pixels on every platform (`gridLayout` receives
`PixelRatio.get()` in HabitGrid and the size-settings preview), with the name
column taking the remainder, so canvas edges stay crisp. The screen uses both
orientations and safe areas, including dialogs. The month/year beside the day
headings describes the visible period, including month/year boundaries.

The cell picture draws every row for the visible days only, so there
is no vertical row window. `RowPositions` in `ReorderRow.tsx` keeps each
displayed habit's position in shared values (row tops, the dragged row's Y, the
body top and the scroll offset). Names attach to them as before, and the canvas
reads the same values while drawing, with the dragged row drawn last, so
reorder, hide, archive and restore motion moves names and cells together.
[PERFORMANCE.md](PERFORMANCE.md) explains these choices and their measured
effects.

### Top bar and future-pull streak

The always-visible compact bar is a founder decision (see
[DECISIONS.md](DECISIONS.md)): ONPURPOSE at left, Today centred in reserved
space, and two 44-point History/Settings icon targets at right. Three equal flex
regions keep Today at the geometric centre. Month/year sits in the name-column
corner beside the day headings and opens the date menu. Month and year are
separate Text elements with a four-point gap inside one Pressable date button.

Future-pull feedback is text-free: a gradient streak, drawn in the heading
canvas, lies along the bottom edge of the headings, where habit rows start. No
new top border is added. Its right endpoint stays fixed while its width grows
leftwards with the pull, up to the date-area width at the threshold. It keeps
the last width during a 180 ms release fade. A single theme grey (`ink(0x8A)`)
with alpha ramping from zero at left to full at right gives monotonic
brightness, without a white hotspot or a dimmer right cap. There is no
translation or repeating shimmer. All updates run on the UI thread; the system
Reduce Motion policy applies to the fade. The single threshold haptic remains
and no overlay covers controls.

## Storage

SQLite stores an append-only ordered change log and a derived current-state JSON
projection, and one transaction commits both. `ChangeStore` updates the UI
immediately, serializes native writes, retains pending edits on failure and
exposes Retry. Loading never renders an editable demo over saved data; the
initial sample habits are seeded only when creating a genuinely new database.

Versioned events keep before/after values, explicit effective calendar dates,
UTC edit instants, stable IDs, sequence and time-zone metadata. Replay validates
causality and reconstructs the Undo/Redo stacks. Undo appends the inverse of the
latest active grouped action rather than deleting events. Global preferences are
saved in the same log without appearing in History or affecting habit Undo/Redo.
Settings exports and restores a checksum-validated JSON change archive; a
confirmed restore atomically retains a pre-restore copy. `useBackupActions.ts`
owns native confirmations, picker/share errors and a synchronous busy guard;
durable and exclusive work stays in `ChangeStore` and the backup adapters. Sample
mode cannot run backup actions.

`storage/model.ts` is the public facade; `types.ts`, `validation.ts` and
`changeUtils.ts` hold shapes, strict validation, and equality/inversion.
Validation never imports replay, so the split adds no runtime cycle. Recorded
date keys do not change during travel, and local midnight is the day boundary.
The browser preview uses a separate `localStorage` adapter.
[STORAGE.md](STORAGE.md) is the contract: event versions, schema, file format,
limits, failure policy and recovery.

## History

`AppPanel.tsx` hosts History in the native sheet. HistoryView uses React Native
SectionList with sticky day headings and compact, expandable rows (minimum 54
points at default text size). Icons distinguish checked, unchecked, numeric,
cleared and colour actions. Text retains meaning; each whole row exposes one
VoiceOver label, including old/new colour values and any effective entry date.
Dark custom colours use a neutral icon fallback so the action remains visible.
Rows have no fixed height or truncation.

Day/time labels use the viewing device's local zone consistently. The recorded
zone metadata and the original habit date remain intact in storage. Group adjacent
same-day records in reverse sequence; never sort the log by timestamps or move
an edit to a different position after a clock change. Loading older records can
extend the last section without changing its key or dropping entries. The local
midnight hook refreshes Today/Yesterday headings while History is open.

Neighbouring entries for one entry date, each within five minutes of the next,
collapse into one burst row (`historyRows`) that expands in place. Bursts only
merge neighbours, so log order is unchanged; the oldest member keys the burst.
Filter chips (All/Entries/Edits/Notes) and a habit picker narrow the rows before
sections and bursts are built; filters are local view state. Day headings show
counts and fold or open the day; Today and Yesterday start open (every day when
filtered). `historyDays` groups only whole days, loading 40 more as the list
nears its end, and caches each action's local day and kind in WeakMaps because
replay keeps earlier action objects. Only the shown calendar view scans every
day: core `historyCalendar` counts each day's changes and the habits changed
(most changes first) by the day they were made, with the same filters. The
header's calendar button switches History between the day list and that view,
a month with a dot per habit changed each day or a year with one dot per day in
its most-changed habit's colour. Choosing a day opens it in the day list (kept
mounted but hidden behind the calendar). Jumping opens the target day, extends the loaded days and scrolls with
`scrollToLocation`, retrying from an estimated offset until two passes land,
because rows have no fixed heights.

Undo/Redo live in a floating bottom bar (44-point targets) whose Undo button
names the next Undo target, which is always the newest action even when a filter
hides it. Save failure and Retry remain explicit above the filters; closing
preserves the grid. Actions come from replay's
active undo stack, with consecutive same-field/date corrections coalesced during
a two-minute inactivity window. Net-zero groups vanish; raw edits remain saved.
Redo restores the action's original time/order; its latest mutation sequence
marks it pending until the new event commits. Preferences never become rows.
Numeric corrections show before → after and units, and colour corrections show
a pair of swatches. Different effective dates get a small For-date caption;
regular same-day entry rows avoid repeating the date.

[React Native SectionList reference](https://reactnative.dev/docs/0.86/sectionlist).

## Habits, entries and goals

Habit names open full Notes when a habit has any note, and Statistics
otherwise; holding a name opens an anchored menu and drag-to-reorder. HabitName
combines Pressable taps/holds with native PanResponder drag recognition. The menu
overlay stays in the grid tree, so opening it does not transfer a held touch to
another native modal. `useHabitReorder` owns measured row/viewport geometry, an
unsaved order preview, edge scrolling and interruption cancellation. The real
rows move: `RowPositions` drives each name's shared `translateY` from a fixed
top-zero anchor, and the cell canvas draws each row at the same shared top, with
swap targets in shared values rather than React state.
Horizontal scrolling stays on its UI-thread path. One accepted drop persists one
complete order event. `displayedHabitOrder` keeps hidden and archived slots fixed
when a filtered subset is reordered.

`HabitDialog.tsx` owns create/edit and colour drafts as a full-screen editor.
`ArchivedHabits.tsx`, inside Settings, owns the archive, restore and the named
Delete confirmation; `ChangeStore.deleteArchivedHabit` captures the definition and
records for one atomic, undoable deletion. `archivedHabitDetails.ts` derives
per-habit counts and first/last dates in one pass, memoized with bounded note
excerpts so save acknowledgements do not repeat the work. History-only deleted
metadata never re-enters the grid or archive. See
[HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md).

Daily entry is shared by the grid and statistics. `useDailyEntryActions` owns the
selected habit/day editors and stable cell callbacks. Numeric, text and category
saves use one fresh-store precondition path with accepted-edit feedback and Quick
Undo; checkbox taps keep their dated defaults and on/off feedback. Numeric
validation, recent-total suggestions and keystrokes live inside the keyed
`NumericRecordDialog`, so typing never updates app-root state. Done closes only on
an accepted or unchanged save; Close discards the draft. Both entry dialogs stay
nested inside the statistics presentation when it is open.

`entries.ts` supplies `EntryValue` (number/string/string array), labels,
canonical category sets, text limits and bounded grid previews. `habits.ts`
centralizes the four effective types, keeping legacy unit inference.
`DailyRecordDialog` applies text and multiple selections only on Done.
`CategoryEditor` edits option drafts independently of daily selections.

Completion comes from effective-dated goals for all four habit types.
`habitCompletion.ts` delegates to `habitGoals.ts`, which owns strict timeline
validation, binary-search policy selection, rule summaries and evaluation, with a
bounded policy cache. `goalTiming.ts` validates and counts period quotas and
on/off cycles by bounded repeating blocks. `HabitGoalsEditor.tsx` hosts the goal
sheet and timeline; `GoalVersionForm.tsx` keeps the form while browsing it;
`goalEditing.ts` explains invalid drafts; `GoalSummary.tsx` is the shared Goal
entry point. Create/Edit and Goal are full-screen with staged subpages. See
[GOALS.md](GOALS.md).

Hide completed today is optional. When on, HabitGrid selects a primitive
completion mask for Today, offers Show completed, and restores all rows when
browsing other dates. `useDelayedCompletionMask.ts` keeps tap-burst targets for
700 ms. Quick Undo offers four seconds to reverse an accepted entry or archive
through an ordinary compensating edit; its receipts stay out of persistence and
off the grid's render path.

## Descriptions and editor

`HabitDetailsScreen.tsx` holds Notes and Statistics as tabs in one native sheet;
the earlier compact note card is superseded. `useHabitPages.ts` drives native
horizontal paging and the floating bottom switch. The initial panel mounts first
and its neighbour warms after 200 ms or input; both then keep fixed viewport
geometry, scroll and state side by side. Native directional locking handles the
gesture, and shared values move the island pill on the UI thread, with only
discrete aligned-page changes sent to React. Inactive panels are excluded from
touch and accessibility, and the measured island height reserves bottom padding
in both scrollers.

`description.ts` parses Markdown and supplies validation, summary/preview and
insertion helpers. `DescriptionText.tsx` renders native blocks and intentional OS
links without HTML execution or remote image requests. `descriptionReading.ts`
supplies bounded excerpts, balanced passages, top-level list-item virtualization
and a five-document/100,000-character cache; `DescriptionReader.tsx` renders the
Notes FlatList.

`DescriptionEditor.tsx` owns full-screen rich-text writing through the Expo DOM
component `RichDescription.tsx` (Tiptap) and `src/richText/`. The DOM editor
memoizes initial content, uses weak per-document serialization caches and keeps
length validation synchronous. `richText/descriptionUpdateQueue.ts` batches
native text reporting (200 ms quiet, one-second deadline); position-only
callbacks avoid resending unchanged Markdown. Background saves request exact
text, and draft writes stay serialized separately from main History.
`descriptionChangeNavigation.ts` owns Next change cycling with bounded retries
for unmeasured passages. Editor icons come from the generated fourteen-icon
`editorIconPaths.ts` subset rendered by `richText/EditorIcon.tsx`.

Each note is saved by its own v23 `note` change, apart from the habit
definition; a v7 description reads as the Info note until its first note
action moves it out (core `notes.ts`, [STORAGE.md](STORAGE.md)).
`DescriptionHistory.tsx` and `DescriptionVersions.tsx` compare and restore
one note's earlier versions (core `noteVersions`). Recoverable drafts live in a separate local store outside
History and backups: `storage/descriptionDraftModel.ts` is the pure model, and
platform modules select SQLite, browser storage or (in sample mode) memory. Keep
the pure model's name distinct from the platform adapters so Metro cannot
resolve it recursively. Sample-only long notes live in
`dev/sampleDescriptions.ts`. See [DESCRIPTIONS.md](DESCRIPTIONS.md).

## Statistics

`HabitStatsScreen.tsx` shows checkbox and numeric statistics, and
`RecordStatsScreen.tsx` shows category and text recording statistics (logging
counts, streaks, category frequency, an editable calendar and virtualized
entries) without treating text or categories as numbers. Both share
`StatsLayout.tsx` (range tabs, period stepping, titled sections with
explanations, tiles) and `ChartFrame.tsx`-based charts: `ValueChart`,
`SuccessChart`, `StreakChart`, `StatsCalendar`, `TimeOfDayChart` and
`CategoryMatrix`. The two screens never import each other.

Calculations are pure: `statsSeries.ts` (day outcomes, bins, smoothed trend,
streak runs), `statistics.ts`, `completionStatistics.ts` (scheduled
opportunities without lifetime calendars), `periodStatistics.ts` (period
progress, results and streaks, shown through `PeriodProgress.tsx`) and
`recordStatistics.ts`. `outcomeColours.ts` is the one outcome colour language,
and `statisticsFormatting.ts` holds shared display helpers. See
[STATISTICS.md](STATISTICS.md).

## Settings and theming

`AppPanel.tsx` hosts the native Settings sheet; `SettingsScreen.tsx` owns the
compact index and the appearance, tracking, backup and development detail pages.
App owns the selected panel and its visibility separately, so closing keeps panel
content through the native dismissal animation. The sheet has Close, iOS swipe
dismissal, its own safe-area provider and scrollable content for larger text and
landscape. The grid remains mounted behind it.

Preferences (haptics, Hide completed today, checkbox style, week dividers, tap
animations, grid sizes, text size, theme and backgrounds, and week start) are
saved outside History and Undo; `displayPreferences.ts` holds the
display defaults. `useGridDisplayPreferences.ts` holds grid presentation values (sizes,
styles, theme) while Settings is open and releases them together on dismissal,
so the hidden grid is not rebuilt on every choice. Completion filtering applies
immediately. See [SETTINGS.md](SETTINGS.md).

`theme.ts` derives every interface colour from one background, and
`ThemeContext.tsx` provides `useTheme` and cached themed styles. System, Dark and
Light themes (Dark by default) use pure black and warm Paper backgrounds by
default, and each background can be customised. Colours were designed on black; on other backgrounds, blends resolve
against that background. Saved colours never change;
display colours are derived.

Every date uses the same tone: empty cells show their habit colour blended
against the background, and recorded values keep full colour, including explicit
numeric zero. The earlier fade for older and future dates was removed (12 October
2026).

`ColourPicker.tsx` shows Presets and Custom tabs one at a time to avoid a tall
dialog; the 24 presets occupy four rows at the usual phone width. Native sliders
expose Hue, Colourfulness and Lightness, which map to OKLCH (the cylindrical form
of OKLab); tracks interpolate sampled gamut-mapped colours with native linear
gradients. Selections stay drafts until Done applies the colour and closes the
dialog; Close discards preset, slider and hex changes, and invalid hex disables
Done. The Done footer and Close header stay outside the scrolling body. Hex
accepts three or six RGB digits with an optional hash and stores a normalized
six-digit value. Out-of-sRGB colours reduce chroma while preserving OKLCH
hue/lightness. A colour below 4.5:1 on the current background is displayed with
adjusted lightness, and the picker says so. Filled checkmarks are white when
white reaches 3:1, otherwise black. Colour maths uses
[Ottosson's published OKLab matrices](https://bottosson.github.io/posts/oklab/).
This is sRGB output, not wide-gamut Display P3 storage.

No custom font family is loaded. iOS uses its system font
([San Francisco](https://developer.apple.com/fonts/)); names use medium 15-point
text, dates semibold 19-point text, and numeric cells medium 18-point tabular
figures. `Typography.tsx` supplies Text/TextInput wrappers and applies the app
text-size multiplier once, with nested spans inheriting and OS scaling preserved.
`useAppWindowDimensions` combines both multipliers for grid geometry and the DOM
description editor; `textSize.ts` validates the 85–150% steps.

### Haptic feedback

The existing Expo Haptics dependency supplies native feedback. `src/haptics.ts`
centralizes single-pulse confirmation (Medium), undo/clear (Soft), selection ticks,
and the future-pull threshold (Medium). Android plays short full-strength pulses
through React Native's Vibration (12 ms confirm/threshold, 5 ms undo/selection);
semantic view haptics are ignored when touch-interaction vibration is off.
Web previews stay silent. Calls catch native failures and never block
state changes. Haptics run from event handlers, not render, effects, or state
updaters, so replayed updater functions cannot duplicate them.

Checkbox feedback follows completion/undo. Opening numeric entry gets a selection
tick; changed numeric saves and clears use confirmation/undo. A changed colour's
Done confirms, while preset/tab changes get selection ticks. Unchanged saves,
unchanged selections, Close/Cancel, typing and continuous sliders are quiet. A
deliberate Today jump or date-picker choice gets a selection tick.

Future pulls track dragging and whether the threshold has ticked on the UI
thread, inside the canvas pan gesture, so the tick fires once per drag. A fling
or recrossing the same threshold cannot generate repeated ticks. Release after
that tick reveals dates without an extra pulse. Haptics use the JS bridge only
for this discrete threshold event; scrolling and drawing stay on the UI thread.

Settings exposes a saved haptic toggle, enabled by default; the module reads it at
each feedback event, including threshold events bridged from the UI thread.
Feedback follows both this preference and OS availability.
[Expo's haptics reference](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/)
documents cases such as iOS Low Power Mode and system settings suppressing
output.

## Platform differences

Android testing started on 8 October 2026. Which platform launches first is
undecided (see [DECISIONS.md](DECISIONS.md)). Keep iOS behaviour unchanged when
adapting a screen for Android. Since 12 October 2026 the habit grid is the same
Skia canvas on both phones, including scrolling, the iOS-style future pull and
far navigation. The Expo web preview (the last column below) shows a notice
instead of the grid. The browser product is a separate app in `apps/web`,
described in [WEB.md](WEB.md).

| Area               | iOS                                 | Android                                                     | Web (layout preview)      |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- | ------------------------- |
| Habit grid         | Skia canvas                         | Skia canvas                                                 | Notice ("runs on phones") |
| Sheets             | UIKit pageSheet and swipe dismissal | Gesture-handler sheet in `SheetModal.tsx`                   | Same sheet as Android     |
| Date pickers       | Native inline/compact pickers       | Dark `DateCalendar.tsx`                                     | Text field                |
| Dialog keyboard    | `autoFocus`                         | `useKeyboardFocus.ts`                                       | `autoFocus`               |
| Haptics            | Expo Haptics                        | Short `Vibration` pulses                                    | Silent                    |
| Storage            | Expo SQLite                         | Expo SQLite                                                 | `localStorage`            |
| Description editor | `@expo/dom-webview`                 | Falls back to `react-native-webview` where needed (Expo Go) | DOM                       |
| App root           | `GestureHandlerRootView`            | `GestureHandlerRootView`                                    | `GestureHandlerRootView`  |

Web is a development convenience: it checks the layout and controls around the
grid, not the grid itself, text fitting, persistence or frame rates. Skia on the
web would need CanvasKit and bundled fonts, which the project does not ship.

## Development tooling

Development tools require `__DEV__`; preview capture and grid diagnostics also
need their own `EXPO_PUBLIC_*` flag. Paired comparison sessions disable them, and
Metro removes them from release JavaScript. See
[DEVELOPMENT.md](DEVELOPMENT.md) for setup and [TESTING.md](TESTING.md) for phone
checks.

- **Preview capture.** With the preview flag on, turning the phone face down
  until a tap, then back and pausing, shares a screenshot with the local receiver
  (`npm run preview:server`). `DevPreviewCapture` mounts once above every screen
  and samples motion only while active. A long press on ONPURPOSE, the month/year
  date button, or a panel or dialog title also shares a preview; a short press on
  the date button still opens the date menu. Settings has an accessible
  development-only fallback.
- **Sample data.** `packages/core/src/dev/sampleData.ts` and its companions build an isolated
  in-memory store of fictional history, notes, goals and records for statistics
  review. `samplePresets.ts` adds five fictional people (one file each in
  `dev/presets/`) for marketing screenshots. It never touches real data or
  backups.
- **Grid diagnostics.** With the performance flag on, Settings → Development
  runs timed Normal sessions (the earlier No goal tint and Simple cells
  experiments were removed with the canvas grid) and can send anonymous timing
  reports to the paired receiver. These are JavaScript and storage timings, not
  canvas frame rates. See [PERFORMANCE.md](PERFORMANCE.md).
- **Comparison launchers.** `npm run start:compare-dev` and
  `npm run start:production-js` start paired Expo Go sessions on the same saved
  data with development or production JavaScript.
- **Android over USB.** `npm run android` and `npm run android:screenshot`; see
  DEVELOPMENT.md.

## Known limitations

- **Local only.** No backend, account or sync. Data lives on one device; backups
  are manual exports. Revisit a backend only if agreed requirements need it.
- **No store builds yet.** Both platforms currently run in Expo Go; no signed
  iOS or Android build exists.
- **Storage cost per edit.** Each edit revalidates and rewrites the whole
  projection JSON, and startup replays the full log. Native timing with long
  histories is unmeasured; see [PERFORMANCE.md](PERFORMANCE.md).
- **Grid accessibility unverified on phones.** The invisible accessibility layer
  over the canvas has not yet been checked with VoiceOver or TalkBack.
- **No grid on web.** The web preview shows a notice instead of the habit grid.
- **No release-build profiling yet.** Measurements so far come from development
  JavaScript and production JavaScript in Expo Go; the EAS internal build still
  needs account, signing and device setup ([RELEASING.md](RELEASING.md)).
- **Recovery.** Permanent log corruption needs developer-assisted recovery.
- **Deferred features.** Skipped/excused days, manual success overrides, rolling
  windows, comments, permanent erasure, and sync or a backend.
- **Native extensions.** Widgets and other extensions would need a development
  build and native configuration; evaluate them separately from the list.

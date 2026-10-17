# OnPurpose contributor and agent guidance

## Start here

Read `PROJECT_GOALS.md`, `docs/DEVELOPMENT.md`, and `docs/DECISIONS.md`;
`docs/README.md` lists every guide. OnPurpose is a provisional name. The founder
(project owner and maintainer) is new to the stack: explain technical choices in
plain language and connect them to the product goal.

Current storage writers and backup exports are v22 with SQL schema 1;
`docs/STORAGE.md` is the authority. Version numbers in the sections below record
when a feature's fields arrived, and each older version must keep replaying
unchanged.

Maintainer-only planning (launch, legal, business) lives in the gitignored
`private/` folder, for example `private/LAUNCH_PLAN.md`. Read it for launch
context when present. It is a working draft, not confirmed scope, so confirm with
the founder before acting on it, and never copy its contents into tracked files,
commit messages or pull requests.

## Duplicate messages

The Codex client sometimes repeats a user message. When a message clearly
repeats one already handled and adds no new instruction, ignore it or reply with
one brief acknowledgement. Do not repeat the explanation, restart completed work,
or run the same mutation twice. Continue when the next substantive message arrives.
Treat deliberate requests to retry or repeat an action as new instructions.

## Product direction

The core goal is minimising cognitive friction so tracking becomes a seamless
part of life. The home view is a habit-by-day grid with checkbox, numeric,
category and text cells, distinct name taps for the habit's Notes/Statistics
sheet, and user-chosen stable row order.
Protect stable row positions, direct access to the list, and immediate feedback.
Do not add navigation, dashboards, celebrations, login, or a backend without a
requirement. Distinguish founder decisions from assistant proposals in the docs.
Crash reporting and product analytics are planned; keep habit names, notes and
entry values out of them unless the founder decides otherwise. A Loop Habit
Tracker import is planned: write it against Loop's export formats and never copy
or port Loop's GPL code, because App Store publication depends on the founder
holding the copyright.
Incremental change storage and export are confirmed requirements; read
`docs/STORAGE.md` before implementing persistence. Entries, habit definitions and
preferences persist locally. Sample habits are initialized
once; never reset or reseed an existing store during loading or an error.
The 12 presets are for development only: release builds will start empty with
a short first-run walkthrough (not built yet).
`packages/core/src/storage/presetIcons.ts` applies preset icons as normal undoable edits;
preserve earlier icon choices/removals and raw history.

## Stack and layout

- npm workspaces in one repository. The phone app (React Native + Expo SDK 57)
  stays at the root (`App.tsx`, `src/`, `app.json`, `eas.json`).
  `packages/core/src` is `@onpurpose/core`: platform-neutral logic both apps
  share (storage model/replay/validation, ChangeStore, the SQLite repository,
  backups, dates, entries, goals, completion, statistics, theme/colours, icon
  catalogues, display preferences). Apps import it as `@onpurpose/core/<path>`.
  Core never imports React, React Native, Expo or app code, not even types.
  Module names below without a folder may live in either place; pure logic is
  in core. `apps/web` is the browser app (see the Web app section). Tests stay
  in `scripts/` and `apps/web/test/`.
- TypeScript strict mode, npm with one root package-lock.json.
- `packages/core/src/storage/` owns versioned events, replay, the SQLite
  repository, the write queue, undo/redo and backup restore; `newEvents.ts`
  holds the writer version and first-run event for both apps. `src/storage/`
  keeps the phone adapters (expo-sqlite opening, backup files, draft stores).
  Read STORAGE.md before changing these invariants.
- `App.tsx` owns screen state and dialogs; `src/HabitGrid.tsx` renders the grid.
  `useDailyEntryActions.ts` owns the shared daily input/save controller and stable
  cell callback; `NumericRecordDialog.tsx` owns numeric draft typing/validation and
  suggestions. Keep keystrokes out of app-root state, read save preconditions from
  the current store, and close only accepted/unchanged saves. Keep both entry
  dialogs inside the current native statistics presentation when open.
  `useBackupActions.ts` owns native confirmation/errors and the in-flight busy
  guard; exclusive restore and pre-restore copies remain in ChangeStore/adapters.
  Both statistics screens share `StatsLayout.tsx` (range tabs, ‹ › period
  stepping, titled sections with (i) explanations, tiles), `ChartFrame.tsx`
  (tap, hold-and-drag thumb tracking that pauses paging via `ChartScrubLock`,
  ‹ › and VoiceOver selection keyed by date, axes, ticks, one reading line), `ValueChart`, `SuccessChart`, `StreakChart`, `StatsCalendar`,
  `TimeOfDayChart` and `CategoryMatrix`; never import each other's screen.
  Pure `statsSeries.ts` owns day outcomes (walking the goal timeline without the
  shared goal cache), bins, observations, the centred smoothed trend and streak runs;
  `categoryColours.ts` derives OKLCH category hues; `outcomeColours.ts` is the
  one colour language. `statisticsFormatting.ts` owns shared display helpers.
- `src/canvasGrid/` draws the date area with Skia (founder decision, 12 October
  2026); there is no second renderer. `useCanvasGrid.tsx` returns two canvases
  (fixed headings; body inside the vertical ScrollView at full grid height),
  both drawn with `createPicture` from one shared offset so they cannot drift.
  `useCanvasGridScroll.ts` owns drag, release, the Today/future boundary, the
  iOS-style rubber-band future pull (both phones) and `scrollToDay`. Pure
  `gridMotion.ts` plans each release before it moves: it projects iOS fast
  deceleration (0.99), picks the nearest column and retunes the curve to end
  exactly there (springs for slow releases; momentum stops at the Today and
  history edges without bouncing, only a finger pulls past); `withFling.ts`
  runs that closed-form curve. Never add a separate snap after momentum. A
  touch on momentum faster than `TAP_STOP_SPEED` only stops it, never edits.
  Worklets do not capture default-parameter identifiers or call JS functions
  (resolve theme colours before drawing); a crash on first scroll usually means
  one of these.
  `gridGeometry.ts`/`gridDates.ts` hold worklet geometry and integer date maths.
  Keep all per-frame work on the UI thread; React receives only settles, reveals
  and arrivals. `useGridModel.ts` prepares cell records on JS in 30-day chunks
  and re-checks only prepared days whose saved values changed (acknowledgements
  do nothing); unprepared days draw dashes. Keep the drawing rules ported from
  the old renderer: background precedence pressed > goal met > Today > plain,
  rule hairline, both checkbox styles and fitted paragraphs. Day columns are
  whole physical pixels (`PixelRatio.get()` into `gridLayout`). Both canvases draw at
  the offset rounded to a physical pixel (`pixelOffset`), so cell edges never
  anti-alias into seams while scrolling.
  Keep grid callbacks/definitions stable across save acknowledgements. Cache colour
  levels in `gridAppearance.ts`.
  See `docs/PERFORMANCE.md`; never infer iPhone frame rates from Node benchmarks.
- Cell taps race a gesture-handler Tap with the Pan: press-in hit-tests live
  `rowTops`, and release on the same cell calls `onCellPress`. Disable taps when
  not editable, during a drag or in reorder mode; lock scrolling while the menu
  is open or a drag is active.
- Cell look (v20–21, Settings → Appearance): `CellLook` in `displayPreferences.ts`
  holds Missed day crosses (default on; from `CellState.schedule`: due, off or
  none; quotas and tracking-only habits are never missed per day), Round
  checkboxes (shown as the Circles checkbox style), Streak numbers
  (`checkedStreak` counts back from saved values; the model rebuilds newer
  prepared days after an edit), Joined checkboxes, Connector thickness
  (20–100% of the box) and v21 Streak ends only (`joinedEndsOnly`:
  `isHiddenMiddle` skips boxes between two checked neighbours; boxes a growing
  join makes middles shrink into the bar); all but Missed day crosses apply
  to the checkbox style only.
  `todayOutlines` is retired: replayed, never drawn. `canvasGrid/cellPainter.ts`
  owns all cell and heading drawing for both the grid and the Settings preview
  (`GridLivePreview`, pinned above Appearance on portrait phones); never draw
  cells separately in the preview. A tapped join grows from the neighbour
  (ease-out, 220 ms) or retracts into it (ease-in-out, 180 ms) and the reached box
  bumps to 1.07 the moment the bar touches it, gated like the pulse; core
  `tapMotion.ts` owns this timing for both apps. The tapped cell's background
  fades from the pressed shade (web: old background) to its new one, gated by
  tapAnimations but kept under Reduce Motion. App memoizes the look by its
  fields so acknowledgements keep its identity, and the grid defers it with the
  other presentation preferences. Never shade cells by goal progress.
- Drag to fill (v22 `entries` change): a second press on the cell just tapped
  (within `FILL_DOUBLE_TAP_MS`; web mice `FILL_DOUBLE_CLICK_MS`) that moves along the row draws a run across
  that habit's visible days, never down a column. The run stays highlighted
  (pressed shade) until applied. Checkboxes paint the state the first tap gave
  the start cell, applied on release; number/text/category runs open their
  dialog with the range (`dateRangeLabel`) and Done applies one value to every
  day. Core `entryFill.ts` builds one change (one Undo, one History row, a
  Quick Undo receipt). Value cells open their dialog `VALUE_OPEN_DELAY_MS`
  after a tap (a cancellable UI-thread delay; screen readers open at once) so
  the second press can land, and the number dialog card eases in. A fill
  animates as one stroke in drag order (core `fillStrokeMs`/`fillStrokeAtMs`,
  ease-in-out): one position grows bars behind it (ticking) or erases them
  ahead of it (clearing) through the cells, and each box keeps its old look
  and streak number until the stroke reaches it, then fills and bumps (or
  empties with a press); highlights fade as it passes (phone
  `canvasGrid/fillWave.ts`, web `grid/fillWave.ts` with one animated `--p`).
  Vertical scrolling pauses while drawing. On the web a plain mouse,
  trackpad or pen press-and-drag also fills (see docs/WEB.md).
- `GridAccessibilityLayer.tsx` stays mounted: invisible native views follow the
  shared offset with per-cell `cell-<habit>-<date>` testIDs, roles, checked/
  disabled states, labels, hints and activation (wording in pure
  `cellAccessibility.ts`), header dates and an adjustable Dates strip. Never
  collapse it into one element. It takes touches only while a screen reader is
  on. The Expo web preview is not developed: `useCanvasGrid.web.tsx` shows a
  notice instead. The browser product is `apps/web`, not this preview.
- Keep the compact top bar visible, with Today centred and History/Settings at right.
  Its left corner is the view menu (`src/GridModeMenu.tsx`, web `ModeMenu.tsx`)
  for core `gridModes.ts`: Grid, Compact (icons via `HabitName`'s `compact` and
  `compactGridLayout`; about a week of days), Today (`src/TodayTiles.tsx`: one
  tile per habit, the name cell over the Today cell with `habitSummary`'s
  line, the saved cell look on its checkbox, one "Usual" total from
  `numericSuggestions` recording in one tap through `onCellValue`/
  `recordValue`, core `todaySummary.ts` for "Not today" and the day count;
  every tile has one fixed height of about 2.5 rows) and Weeks (`canvasGrid/useWeekGrid.tsx` draws week columns
  with the same scroll engine; core `weekSummary.ts` gives each cell's number
  and seven day dots; a tap opens that week in Grid or Compact via
  `startDay`). `HabitGrid` keeps the day and week canvas hooks in their own
  components (`DayCanvas`/`WeekCanvas`); App keys the grid by view, so Grid and
  Compact share one mount. The view is per device (`storage/deviceView.ts`,
  `expo-sqlite/kv-store`), never in the log, History or backups.
  Month/year stays beside the day headings; future pull streak grows left from the
  fixed right edge of the existing divider beneath the headings. Do not add a border.
- `src/AppPanel.tsx` owns real change History/undo and the Settings/backup sheet; `src/SettingsScreen.tsx` owns the compact settings index and detail pages; `src/Icon.tsx` owns outline icons.
- `src/HistoryView.tsx` renders compact action rows and sticky edit-day groups;
  `packages/core/src/history.ts` keeps grouping separate from effective habit dates. Preserve
  reverse sequence order; do not reorder logged actions by their timestamps.
  `historyRows` collapses only neighbouring same-date entries within 5 minutes,
  keyed by their oldest member. Filters are unsaved view state; the floating
  Undo bar always names the newest action, even when filtered out.
  `historyDays` pages whole days and caches per-action day/kind; never rescan
  the full log per render (only the shown History calendar does, through core
  `historyCalendar`). Today/Yesterday start open; `HistoryFilters.tsx` owns the
  chips and habit picker. History has Days and Calendar views (the header
  calendar button switches them; `HistoryCalendar.tsx` draws a month with habit
  dots, its title opens the year of day dots, and `InfoNote` explains the dots
  below a separator); choosing a day opens it in the day list. The web History
  panel draws the same calendar from the same summary.
- `src/HabitName.tsx` and `src/useHabitReorder.ts` own hold/menu/drag interactions.
  Only completed drops persist. Keep cells distinct, support cancellation, and
  preserve archive entries. `src/HabitDialog.tsx` owns editor/colour drafts;
  `src/ArchivedHabits.tsx` owns the Settings archive/restore list. Add belongs at the
  end of the grid. `src/HabitStatsScreen.tsx` owns full-screen statistics, with pure
  calculations in `packages/core/src/statistics.ts`. Read HABIT_MANAGEMENT.md and STATISTICS.md.
  `src/HabitDetailsScreen.tsx`, `src/DescriptionReader.tsx`, `src/DescriptionEditor.tsx` and `src/DescriptionHistory.tsx`
  own description reading, full-screen draft editing and Before/After restore.
  `src/DescriptionVersions.tsx` lists that habit's active note actions using the pure
  `descriptionVersionFilter.ts` filter; retain repeated content and reverse sequence order.
  Restore only description onto the current definition. `richText/selection.ts`
  reads whole-selection highlight/link state; `descriptionLinks.ts` shares explicit
  native opening between reader/editor. `descriptionDiff.ts` compares intact Markdown
  passages with a bounded matrix; keep unchanged passages quiet and reader rows
  virtualized. `richText/clearFormatting.ts` preserves link marks when clearing styles.
  `richText/useEditorPosition.ts` restores once and debounces scroll/selection reporting;
  pair locations with exact text, outside History/backups. v2 local drafts/bookmarks
  retain v1 reads and the separate draft SQL schema. Read
  `docs/DESCRIPTIONS.md`. `src/RichDescription.tsx` is the offline Expo DOM/Tiptap
  editing surface; `src/richText/` owns safe document mapping, formatting, local
  Undo/Redo and bounded highlights. Preserve native readers and request a current
  DOM snapshot before applying. Applied descriptions use ordinary habit changes (introduced in v7);
  recoverable drafts stay outside History/backups in a separate local store. Keep
  `storage/descriptionDraftModel.ts` distinct from native/web adapters for Metro.
  `packages/core/src/dev/sampleData.ts` owns isolated mock history for statistics testing. Keep
  it in memory, excluded via `__DEV__` from release, and separate from real data.
  `dev/samplePresets.ts` builds five fictional marketing presets from `dev/presets/`
  under the same rules; the default sample set stays unchanged for tests.
  `src/HabitSymbol.tsx` renders optional emoji/Phosphor/Tabler icons; the editor owns
  selection drafts through `src/HabitIconPicker.tsx`. Read HABIT_ICONS.md.
  `src/ReorderRow.tsx` moves the actual name views during drag/drop and the canvas
  draws cells from the same `RowPositions` shared values (`rowTops`, `dragY`,
  `bodyTop`, `scrollOffset`; dragged row last); do not introduce a visually
  different floating placeholder. Keep native sibling
  order stable during preview swaps. Send swap targets through shared values, not
  React state that rerenders the grid during touch input. Use one absolute animated Y coordinate
  via translateY from a fixed top: 0 anchor. Do not animate layout top each frame
  or combine changing layout anchors with a compensating transform. Measure height on the inner
  name control so position animation does not report per-frame layout to JS.
  `src/motion.ts` shares reduced-motion-aware row/menu transitions; keep name and
  date-cell layout timing aligned.
- `packages/core/src/displayPreferences.ts` owns column spacing and week start defaults (the retired `dateFading` default
  stays only so saved changes replay); keep absent-field defaults compatible with old logs and all preferences outside History/Undo. Read docs/SETTINGS.md.
- `useGridDisplayPreferences.ts` holds only grid display preferences while the
  History/Settings/archive sheet is presented or dismissing. Settings and storage
  use current values immediately; native `AppPanel.onDismiss` releases the latest
  values together. Keep the mounted grid and its inner TypographyProvider stable.
  Do not defer durable writes, unmount the grid, or rebuild prepared days on
  every spacing/text-size choice.
- `packages/core/src/gridSizing.ts` owns v18 grid sizes (points or `auto`), legacy mapping and
  automatic rules; `gridLayout.ts`/`rowSpacing.ts` turn them into geometry with font
  scaling and measured row heights. `screenSize.ts` reads the physical screen for
  automatic rows; keep React Native imports out of gridSizing (storage imports it).
  `GridSizeSettings.tsx` owns the sliders and live preview; save on release only.
- Android has no inline system date picker and Expo Go's dialog is light, so
  DateNavigationSheet and StartDateField show the dark `DateCalendar.tsx` there;
  iOS keeps its native inline/compact pickers. `useKeyboardFocus.ts` replaces
  autoFocus in Android dialogs, where autoFocus inside a Modal shows no keyboard.
- `src/StartDateField.tsx` owns the native draft date picker; existing dates remain inferred until edited. Explicit start dates bound statistics without deleting entries. Start dates arrived in v5; keep older replay unchanged.
- Statistics uses the same native pageSheet/slide/swipe dismissal as History and
  Settings; UIKit owns its gesture on iOS. `SheetModal.tsx` keeps that iOS Modal
  unchanged and gives Android a react-native-gesture-handler sheet: a downward
  drag closes it when the touched content is at its top. Every vertical list in a
  sheet must spread `useSheetScroll()` (it reports scroll position; unknown waits,
  scrolled fails). React Native's Modal `onDismiss` is iOS-only, so SheetModal
  reports Android dismissal itself. `App.tsx` nests numeric, habit, description
  and version dialogs inside the statistics presentation and preserves visible
  save failure/retry. Keep an accessible Close button and the underlying grid.
  Do not reintroduce sideways entry or a separate JS overscroll threshold.
- `src/gridLayout.ts` calculates adaptive column geometry for both orientations.
- `src/gridNavigation.ts` owns `FUTURE_PULL_DISTANCE`, `FUTURE_BATCH` and
  `futureRevealDay`. The app root uses `GestureHandlerRootView` on all platforms.
- `src/ColourPicker.tsx` and `packages/core/src/colors.ts` own preset/custom colours and OKLCH.
- `src/haptics.ts` owns action feedback; never trigger it from state updaters
  or await it before updating UI. Keep routine scrolling quiet.
- `packages/core/src/calendar.ts` and `src/useLocalToday.ts` handle local dates and rollover.
- `packages/core/src/habits.ts` contains demo habits/colours. `index.ts` registers the app.
- `app.json` owns Expo configuration. Generated native folders stay ignored.
- Development happens on Linux and Windows (no Mac); a physical iPhone is the primary test device.
  Android testing over USB/adb started 8 October 2026. Which platform launches
  first is undecided; the iPhone release matters more. Keep iOS behaviour
  unchanged when adapting a screen for Android.
- Use `npx expo install <package>` for Expo/native dependencies to match the SDK.
- Keep dependencies and architecture small. Add structure when a feature needs it.
- Use functional state updates when new state depends on previous state.
- Preserve append-only normal edits, atomic log/projection transactions, serialized
  rapid writes, and visible save failure/retry. Undo adds events; it does not erase.
- Visible History contains active habit actions, not raw events. Global preferences
  persist outside History/Undo and must preserve Redo. Consecutive same-field/date
  edits group for two minutes of inactivity; Undo/Redo close the group and net-zero
  groups disappear. Keep legacy v1 replay semantics and fixtures unchanged.
- Restores validate fully, require a concrete native confirmation, and retain a
  pre-restore copy atomically. Never delete a database to recover silently.

- `src/Typography.tsx` shares app-wide Text/TextInput scaling and combined layout
  font scale; `textSize.ts` owns validated 85–150% steps. Use these wrappers for
  app text and preserve OS scaling/nested-span inheritance. Preferences remain
  outside History/Undo. The DOM editor uses the same combined font scale.
- `descriptionChangeNavigation.ts` owns cancellable Next change navigation; retain
  bounded retries for unmeasured passages and respect reduced motion. Editor
  outline SVGs use the generated small `editorIconPaths.ts` subset; regenerate with
  `scripts/generate-editor-icons.mjs`, not a full catalogue import into the DOM.

## Theme (v19)

`packages/core/src/theme.ts` (pure) derives all colours from one background; `ThemeContext.tsx`
provides `useTheme` and per-theme cached `themedStyles`. Never hardcode interface
colours: greys designed on black are `t.ink(0xNN)` (exact on black), dark tinted
surfaces `t.tint(hex)`, accents `t.accent`/`t.link`/`t.danger`, and habit or other
foreground colours `t.colour(hex)` (≥4.5:1, keeps hue). Display colours never
enter saved data. Blend with `t.mix`, fade with `t.fade`, and pass `theme` to
`createGridPalette`/`outcomeFill`/`categoryColours`/`dateTones`. Grid cells read
backgrounds from their palette, not context. The grid theme defers with other
presentation until Settings dismisses. The DOM editor gets CSS variables from
`richText/editorTheme.ts`. `themeMode`/`darkBackground`/`lightBackground` are v19
preferences outside History/Undo with `before: null` until first chosen; defaults
(Dark, #000000, Paper #F6F3EC) are display rules in displayDefaults. Backgrounds are
fitted to readable ranges at display time, never rejected. Theme fields arrived
in v19, retaining v1–v18 prefixes and SQL schema 1. Read docs/SETTINGS.md.
The description editor uses `@expo/dom-webview`, falling back to
`react-native-webview` where its native view is missing (Expo Go on Android).

## Web app

`apps/web` is a Vite + React DOM app written for browsers, not a port of the phone
screens. Read docs/WEB.md. It reuses `@onpurpose/core` for every rule and
format; never copy core logic into the web app, move it into core instead.
Storage is the shared `sqliteRepository` over SQLite WebAssembly in a worker on
OPFS (`opfs-sahpool`, no special headers), so the log, schema 1 and backups match
the phone. One tab holds a Web Lock on the database; never fall back to a
temporary or `localStorage` database, because unsaved data must look unsaved.
The grid is a DOM table, not Skia: browsers scroll, zoom and announce tables
natively. Keep layout A: a centred grid about three weeks wide so Today stays
near the names, scrolling inside its own area (never the page) with sticky
headings and names, a roving keyboard focus, and cells drawn from core
`cellAccessibility.ts` and the saved cell look. `habitSummary.ts` (core) owns
the line under each name. The font is set only in `--font-ui`. Web modules:
`grid/` (grid, rows, drag, keyboard, overlay `Scrollbars` that cover only the
scrolling area, `gridSizes` from the shared v18 sizes), `entry/` (cell popover on `ui/AnchoredDialog`),
`habits/` (editor, colour/icon pickers, menu, goal editor), `panel/` (the
habit page dialog `HabitDetails` (overview, notes and statistics cards; no
tabs), the docked and resizable History
panel with its calendar, SVG charts in `ChartFrame`, safe Markdown),
`notes/` (Markdown editor, Before/After), `settings/`, and `actions.ts`, which
reads every before-value from the current store. `Sidebar.tsx` holds what
surrounds the grid (the only page; no new views); phones keep the top bar.
Rows are memoized by a per-habit value signature; keep handlers stable. Tap
animations run only for grid taps, never Undo or loading. Dev-only sample
data (`?sample`) stays behind `import.meta.env.DEV`. Calculations stay in core;
the web draws them. The product rules above (stable rows, immediate feedback, no backend
or login without a requirement) apply to the web app too. Sync and the
web/phone pricing link are not built.

## Landing page

`apps/landing` is a static landing page (plain HTML/CSS through Vite, no
framework, small scripts for its pictures and examples); read docs/LANDING.md.
Its copy describes the product at launch (founder decision, 16 October 2026),
including the store apps and optional sync, in plain wording, and never copies
`private/` planning. `src/config.ts` holds the web app and store addresses.

## UI and accessibility

Keep completed rows in place by default. Optional Hide completed today filters rows meeting their effective-dated goals at Today. Preserve Show completed and full rows when browsing other dates. Avoid gesture-only essential actions. Expose
checkbox state and meaningful labels to accessibility services. Permit font
scaling, respect safe areas, and allow scrolling when content needs it.
Do not trade reliability or readable controls for the three-second aspiration.

## Verification

Run `npm run check` and relevant `npm test` suites after code changes, and `npm run export:ios` when changing
native-facing imports or Expo config. Web preview shows a notice instead of the
grid and is not evidence that iOS runs correctly. Report actual checks and any unverified device
behaviour. Follow `docs/TESTING.md` for phone and release testing.
Changes to `packages/core` affect both apps: run `npm run check` (it typechecks
both), `npm test`, both exports and `npm run web:build`. Browser checks of
`apps/web` are not phone evidence, and phone checks are not browser evidence.
Run `npm run export:android` as well when changing platform-specific code. With an
Android phone on adb, take your own screenshots with `npm run android:screenshot`
(read `.dev/android/latest.png`) and crash logs with `adb logcat -d`; see
"Android phone over USB" in `docs/DEVELOPMENT.md`. Do not install, uninstall or
clear app data on the phone without asking; it may hold the founder's real data.
Keep the npm test heap/concurrency/time limits. Diagnose runaway tests under a
hard memory limit; avoid DOM assertions that print entire jsdom browser graphs.
Add focused tests when persistence, date logic, event replay/export, or other consequential behaviour
arrives; avoid tests that merely duplicate trivial markup.

For phone screenshots, read `.dev/previews/latest.png` after the founder shares
a preview by turning the phone face down until a tap, then back toward them and
pausing (title holds remain optional); dated images are
alongside it. Preview settings are in ignored
`.env.local`. Use `npm run preview:server` for the local receiver. Do not commit
captures or pairing tokens. Run `npm run test:preview` after changing the receiver;
preserve both the env flag and `__DEV__` guard around preview capture.
`src/dev/DevPreviewCapture.tsx` mounts once for all screens, samples motion only
while active and never updates React per sample. `previewMotion.ts` validates
intentional holds/settling/deadlines/cooldown. `previewCapture.ts` shares one busy
gate and retains one failed image for Retry; `previewUpload.ts` distinguishes
network/capture/receiver errors. No sensor or screenshot data enters habit storage.
Settings exposes an accessible dev-only fallback. Keep all these modules out of
release JS and never print pairing tokens.

## Documentation and release

Update relevant docs when changing commands, architecture, or confirmed scope.
Guides describe current behaviour: edit the relevant section in place rather than
appending dated narrative, and mark replaced behaviour as superseded instead of
leaving contradictions. Record decisions in `docs/DECISIONS.md` and dated test
evidence in `docs/TEST_LOG.md`; `docs/TESTING.md` stays the current procedure.
State the current storage version only in `docs/STORAGE.md`. Keep chat/session
state (running terminals, received captures, local flags) out of the docs.
Keep credentials, signing files, tokens, local logs, and real user habit data out
of Git. `EXPO_PUBLIC_*` variables are public in the app, not secret storage.
Keep deployment and signing manual until release automation is deliberately set
up. Do not claim App Store readiness from a successful JavaScript bundle export.
Preserve the Expo template notice in `docs/licenses/EXPO_TEMPLATE_LICENSE.txt`.
The project is GPLv3-or-later (LICENSE; copyright notice in README). Pricing is a
free tier of five active habits (archived habits do not count) plus a one-time
US$9.99 unlock. Never paywall existing
records, export, backups, History or the Loop import. The final bundle
identifier and the final brand remain open.

`packages/core/src/habitCompletion.ts` centralizes completion rules; do not infer completion
from a record without an explicit rule; use its effective date and keep blank distinct from zero.
`completedHabitsSelection` uses a primitive today mask; disabled filtering,
non-crossing numeric edits and save acknowledgements must not rerender the grid container.
`displayedHabitOrder` fills only displayed slots and preserves hidden/archived
positions while saving a full undoable permutation. `hideCompleted` is a v9
preference outside History/Undo, defaulting to false for older logs.

`HabitDetailsScreen.tsx` owns the Notes/Statistics tab trial in one native sheet.
Name taps open full Notes when present, Statistics otherwise. `useHabitPages.ts`
owns native horizontal paging and the floating bottom switch. Mount the first
panel immediately, warm its neighbour after 200 ms or navigation, then retain
fixed viewport geometry/scroll/range state. Native directional locking handles
gesture arbitration, shared values animate the island pill, and React receives
only discrete aligned-page changes. Reserve bottom content padding from measured
island height, preserve font scaling, rotation and reduced motion; inactive panels
must not accept input or appear in accessibility. Copy native layout dimensions
synchronously before functional state updates; React Native pools the event.
The compact-card experiment is superseded. `descriptionReading.ts` bounds excerpts and
virtualizes top-level list items with intact nesting/numbering. Keep its disposable
cache capped at five documents/100,000 characters. `sampleDescriptions.ts` owns
long fictional notes on Walk/Read/Meditate only in the isolated sample store;
never migrate those into real habits. The DOM editor memoizes initial parsing and
uses weak immutable-document serialization caches. Full length validation stays
synchronous. `descriptionUpdateQueue.ts` batches bridge reporting only (200 ms
quiet, one-second deadline); keep exact Done/Close/background snapshots and
position-only reporting separate from local typing/Undo and main History.

First editor opens place caret and viewport at the start. Matching-text bookmarks
still resume. Observe writing viewport and editor content through keyboard resize,
stop restoration on deliberate user input, and keep scroll inside the writing
area. Opening editor feedback must stop on readiness or an explicit load error.

`entries.ts` owns daily value types (number/text/category IDs), canonical sorted
multi-selection, labels and bounded cell previews. `CategoryEditor.tsx` drafts
stable category IDs/labels/short labels and archives options without erasing
records. `DailyRecordDialog.tsx` applies text/multiple selections only on Done;
Close, Back and backdrop taps cancel. Its backdrop fades while the sheet slides.
Categories added there stay drafts until Done, which appends the still-selected
ones as one ordinary habit edit before saving the entry. `RecordStatsScreen.tsx` and pure `recordStatistics.ts` show logging
counts/streaks, category frequency, editable calendar and virtualized entries,
without claiming completion. `habitCompletion.ts` delegates all four types to effective-dated conditions in
`habitGoals.ts`; absent non-checkbox goals remain Track only. `sampleRecords.ts` appends
fictional Workout/Highlight examples only to the isolated sample store, leaving
the original v7 sample fixture and real presets untouched. Text/category entries
arrived in v10; keep older prefixes unchanged; array preconditions/grouping/inverses compare
values rather than references. SQL stays at schema 1. Grid text/category cells
use readable 12-point text with app/OS scaling, native tail truncation and
geometry-based 1–3 lines from core `gridEntryText.ts`. Only numeric cells may autosize;
our iOS renderer ignores the advertised `minimumFontScale` floor.
Do not infer native text fitting from browser captures. Comments remain deferred.

`HabitGoalsEditor.tsx` owns the native Goal sheet, timeline and draft navigation;
`GoalVersionForm.tsx` owns grouped condition/repeat/date inputs and local tests.
`goalEditing.ts` validates incomplete drafts without weakening storage validation.
`GoalSummary.tsx` is the shared Goal entry point. Open the form directly, preserve
drafts while browsing the timeline, confirm before replacing dirty drafts, and do
not persist unchanged default goals. Checkbox cells use the same completion tint
as the other types. The enclosing habit editor passes its draft identity and start date. Read `docs/GOALS.md` before
changing completion/statistics. Preserve dated rules/schedules, stable version and
category IDs, earlier-period confirmation, ordinary undoable definition edits,
unchanged values and v1–v10 prefixes. `completionStatistics.ts` counts scheduled
opportunities without allocating lifetime calendars; numeric averages still use
all calendar days. `dev/sampleGoals.ts` adds fictional goals only to the isolated
sample log. Skipping and manual overrides remain deferred; period quotas are below.

Archived habit Delete requires a named native confirmation and uses the v12
`deleteHabit` snapshot action through `ChangeStore.deleteArchivedHabit`.
Undo restores the full definition, every daily record and archived position in
one atomic write. Preserve append-only events, local note drafts/bookmarks,
legacy v1–v11 replay and schema 1. This is recoverable deletion, not permanent
erasure. `historyDisplayState` supplies deleted names/types only for History
labels; description restore still requires the real current habit.

## Period goals and cycles (v13)

Read docs/GOALS.md. `goalTiming.ts` owns strict fixed-period/cycle shapes and
bounded calendar arithmetic; `periodStatistics.ts` owns progress/results and
period streaks. Do not allocate lifetime calendars, infer quotas from entries,
count taps/categories as multiple successful days, or realign saved anchors when
weekStart changes. Off periods and boundary fragments are neutral; Today remains
open. `GoalTimingFields.tsx` owns compact schedule drafts; Try a value is removed.
Create/Edit habit and Goal are full-screen editors with short parent navigation,
fixed actions, safe areas and staged subpage edits. `PeriodProgress.tsx` keeps
quota progress out of the grid. Hide completed remains a daily predicate.
Period/cycle fields arrived in v13, retaining v1–v12 replay and schema 1. Older event
versions must reject period/cycle fields. `sampleTiming.ts` appends fictional
timing examples only in the isolated sample store.

Goal editing now starts with four summary sections owned by
`GoalEditorControls.tsx`; only one section opens at a time. Preserve mounted
drafts and hide inactive content from accessibility. Single-choice options open
short lists; keep multi-select weekdays/categories direct. InfoNote owns the
shared subtle top separator/spacing; do not add unrelated per-screen divider hacks.

Checkbox goals now support `unchecked` and dated optional `defaultChecked` in
`habitGoals.ts`. Use `checkboxChecked`/`toggleCheckboxValue` everywhere: saved 0
is an explicit Off override, 1 is On, absent inherits the dated default. These
fields arrived in v14; v1–v13 keep old validation and exact prefixes. SQL stays 1.
Default changes from habit editing use `withCheckboxDefault`; goal editing stages
the same timeline field. Count implicit successes arithmetically through policies
and repeating periods, never materialize lifetime daily values. Primary goal
section choices open directly; do not nest a duplicate selected-value dropdown.

v15 added `checkboxStyle`, a strict boxes/marks preference
(default boxes), outside History/Undo, retaining v1–v14 prefixes and SQL schema 1.
`useCanvasGrid.tsx` scales both styles and owns the tap-only UI-thread pulse
(1 → 0.94 → 1), run only when an accepted tap flipped the checked state.
Never animate on mount, store acknowledgements, Undo or scroll. Respect
ReduceMotion.System; rapid taps restart the short non-bouncy sequence.
Headings shade alternating calendar weeks only in the date headings using
`shadedWeekOf` (the fixed-date `isShadedWeek` rule). Keep the original
quiet header border and future-pull streak unchanged; never shade habit cells.
Defer checkboxStyle and weekStart with other grid presentation preferences until
Settings dismisses. A separate rest-day feature was declined; keep scheduling in
effective-dated habit goals.

v16 added `weekDividers` and `tapAnimations`, boolean
preferences defaulting On; keep v1–v15 prefixes, schema 1, History/Redo isolation
and grid-presentation deferral. Week dividers now controls faint alternating
header backgrounds; Today retains its own highlight. `HabitNameDivider.tsx` owns
the permanent quiet name/day separator.
Never reintroduce full-height week lines. The name/day separator is an overlay,
independent of the week toggle. Gate tap-only pulses with tapAnimations while
retaining Reduce Motion and immediate saves; haptics remains a separate setting.

v18 added `gridNameWidth`, `gridColumnWidth` and
`gridRowHeight`: stepped point sizes or `auto`, outside History/Undo, preserving
Redo, schema 1 and exact v1–v17 prefixes; `before` is null until first chosen.
Absent v18 fields still honour v5–v17 `rowSpacing`, `columnSpacing`/`columnDensity`
(via `effectiveColumnSpacing`) and `nameColumnWidth`, whose Standard means
automatic. Read docs/SETTINGS.md and STORAGE.md before changing sizing.

`DateNavigationSheet.tsx` owns the native date-picker draft. `useGridDates.ts` is
a small controller holding `rightmostDay`, `unlockedFuture` and the month/year
label: `revealFuture` unlocks `FUTURE_BATCH` and animates to tomorrow,
`returnToToday` animates to 0 then collapses the future, `navigateToDate` unlocks
the future as needed, and `prepareResize` keeps the rightmost day across width,
column and font changes. `HabitGrid.tsx` owns measured outer width, rows and
reorder cancellation; call prepareResize before changing that width. Keep the
controller in the same mounted grid, not a conditional component.
`HabitContextMenu.tsx` owns menu measurement/placement, staying mounted when closed
to retain its measured height. Keep the held name uncovered and close before
dispatching actions; measurement must not update the grid parent.
`habitGoals.ts` caches only bounded date/immutable-definition policies (256),
never entry values/results. Date cache bounds retain the loaded window and
limited overlap. Do not claim phone frame rates from mock worklets or Node.

`numericSuggestions.ts` reads 30 earlier dates and preserves explicit zero.
Suggestions fill drafts; Done applies and Close cancels.
`useDelayedCompletionMask.ts` keeps burst targets for 700 ms, revealing undone
rows immediately. `useQuickUndo.ts` owns a stable `quickUndo.ts` controller with
four-second entry/archive receipts and independent `QuickUndoActions.tsx` subscription; `quickEntryUndo.ts` validates the prefix, later retouches, current value
and active habit. Append ordinary compensating edits; never rewind unrelated
actions or erase raw History. Keep receipts/timers out of persistence/exports.

`useMeasuredRowHeights.ts` batches native wraps, rejects stale geometry and cancels
on unmount.
`useHabitReorder` animates the shared row-top record on swaps; ReorderRow and the
canvas consume it directly, without one spring/reaction per cell. Hide/archive/restore transitions
use one 220 ms shared record animation; geometry changes remain immediate. Idle
identity changes must not cancel/reset that animation. Quick Undo fades out for
180 ms after its four-second lifetime. Both respect system Reduce Motion.
Completion filtering applies behind Settings immediately, unlike
presentation size/style deferral. Quick Undo supports all entry dates independent
of filtering/goals, and archival reverses only the archived field on the current
habit. Preserve unrelated entries, definition edits and current order. Keep timers
and receipts outside persistence/export and keep their subscription off the grid.

## Grid bottleneck diagnostics

performanceModel.ts owns bounded anonymous metric/report validation; performance.ts
owns warmup-limited temporary runs and aggregate counts; the canvas grid has no
reduced renderer modes (`GridExperiment` stays only for report compatibility). Native DevPerformanceControls/transport/lifecycle require `__DEV__` and the
performance env flag and are excluded from release. Explicit uploads require the
preview flag too and use paired /performance; receiver rejects extra fields/data
and stores ignored .dev/performance/ reports separately from PNGs. Runs end on
stop, timeout, inactivity and sample source/reset changes.
profileSql.ts wraps existing SQL calls only when profiling is enabled, preserving
transaction, atomic log/projection and error/retry semantics. Time JSON validation
separately from awaited SQL, but do not add nested durations. JS timer lateness
is not native FPS. Keep run state outside preferences/history. benchmark:bottlenecks uses fictional temporary Node SQLite
files under 256 MiB; never infer iPhone performance from it. Read PERFORMANCE.md.

RowPositions (in ReorderRow.tsx) owns one keyed shared animated-style controller
per displayed habit at the grid root. Names attach to that handle and the canvas
reads the same shared values; ReorderRow must not recreate a mapper per row.
Register before paint and detach only the removed owner's ID; preserve the
top-zero translateY anchor, stable native sibling order and the real name views.
Keep all names measuring and full content height. Capture the habit and date at
press-in and reject a changed cell or disabled edit at release. External
edits/Undo never pulse.

developmentFeatures.ts supplies the temporary EXPO_PUBLIC_DEV_COMPARISON override
for paired Saved-data Expo Go sessions. Keep literal `__DEV__` guards on native dev
imports; comparison disables App sample/preview/performance mounts and recording
without changing env files or storage. scripts/start-comparison.mjs owns ports
8083 (unprofiled development) and 8082 (production JS), one worker and cleared cache.
Keep its override out of env files: SDK 57's virtual env merges local files over
runtime flags. Production JS in Expo Go is not a compiled native Release build.
eas.json's internal preview specifies Release without dev-client; cloud project,
bundle ID, signing and device enrolment remain manual setup, not completed builds.

Storage responsibility boundaries: `storage/model.ts` remains the public facade
and owns deterministic live/replay transitions and grouping. `storage/types.ts`
contains type-only shapes; `storage/validation.ts` owns exact fields/version gates,
date/daily/habit validation and precondition assertions; `storage/changeUtils.ts`
owns preference classification, structural equality and inversion. Validation
must not import replay/model at runtime. Preserve all public model exports,
legacy rejection semantics, mutable replay versus immutable live updates, the
current writer version and schema 1 when changing these modules. Do not bypass validation to
make the split appear faster.

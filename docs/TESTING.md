# Testing

This is the current test procedure: automated checks, device setup, a smoke
test, the regression checklist, the timed usability study and the beta gate.
Dated evidence of what was tested and found, including founder feedback and
superseded checklists, is in [TEST_LOG.md](TEST_LOG.md). Record new results
there and keep this file current.

## Automated checks

| Command                         | What it checks                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `npm run check`                 | TypeScript, ESLint and Prettier formatting                            |
| `npm test`                      | Every `scripts/*.test.mjs` suite (see below)                          |
| `npm run test:calendar`         | The calendar and local-date suite only                                |
| `npm run test:preview`          | The preview receiver only; run it after changing the receiver         |
| `npm run doctor`                | Expo Doctor dependency and configuration checks                       |
| `npm run export:ios`            | iOS bundle; run it when changing native-facing imports or Expo config |
| `npm run export:android`        | Android bundle; run it too when changing platform-specific code       |
| `npm run benchmark:bottlenecks` | Synthetic Node benchmarks; see [PERFORMANCE.md](PERFORMANCE.md)       |

`npm test` covers dates, goals, statistics, event replay and backups, real
SQLite storage in Node, the preview receiver, and bounded React/jsdom tests of
actual hooks and components. For the canvas grid, `canvas-grid.test.mjs` checks
its worklet date maths against the Date helpers, column geometry, the rubber
band, checkbox geometry and cell accessibility state and labels;
`grid-context-menu.test.mjs` covers the habit menu. Drawing, gestures and frame
rate are not covered: check those on the phones. Run `npm run check` and the
relevant suites after every code change; run one suite with the same limits as,
for example,
`node --max-old-space-size=256 --test --test-timeout=15000 scripts/storage.test.mjs`.
On a memory-constrained host, exports can use one bundler worker
(`npm run export:ios -- --max-workers 1`). Add focused tests when persistence,
date logic, event replay/export or other consequential behaviour changes; avoid
tests that only duplicate trivial markup.

What these checks do not prove:

- Node SQLite tests use memory and a reopened disk file, not Expo's native
  bridge; a clean test or browser run is not proof a habit was saved on a phone.
- An exported bundle does not validate native compilation, signing,
  installation, phone performance or App Store readiness.
- Mocked worklets, ready callbacks and JS timer lateness check alignment and work
  counts, not frame rates. The web preview shows a notice instead of the grid
  (phones only); it helps with other screens' layout but not native text
  fitting, keyboards, gestures, VoiceOver or speed.

### Memory and time limits

The npm test commands cap each Node process's JavaScript heap at 256 MB, set a
15-second per-test timeout and run at most two test files at a time, so a
runaway test cannot exhaust the development machine. Keep these bounds when
diagnosing a stalled test. Heap limits do not cap every native allocation. For
DOM checks, assert booleans or small values: asking Node to print an unexpected
jsdom element can make assertion output traverse a huge browser graph.

Optional, Linux only: for memory diagnostics, also run under a systemd user scope
with `MemoryMax=768M`, `MemorySwapMax=0`, a short `timeout` and core dumps
disabled, for example:

```sh
ulimit -c 0
systemd-run --user --scope -p MemoryMax=768M -p MemorySwapMax=0 \
  timeout 300 npm test
```

### Continuous integration

[`.github/workflows/check.yml`](../.github/workflows/check.yml) runs on every
push and pull request, on Ubuntu with the Node version from `.nvmrc`: `npm ci`,
`npm run check`, `npm test` and `npm run export:ios`. It does not run the
Android export, Expo Doctor or any device test.

### Release bundle exclusion

Preview capture, sample data, performance diagnostics and the comparison override
must stay out of release JavaScript. When changing them, turn their
`EXPO_PUBLIC_DEV_*` flags on in `.env.local`, run `npm run export:ios` and search
the bundle in `dist/`: no preview listener, accelerometer preview code,
`RNViewShot`, capture/upload code, receiver address, pairing token, sample
fixtures or performance controls. Expo Sensors may remain linked natively.

### Dependency audit

`npm audit` reports open transitive findings in the Expo/React Native toolchain.
Its automatic fixes downgrade Expo and React Native to incompatible versions, so
do not run `npm audit fix --force`; passing Expo Doctor does not resolve them.
See "Known dependency audit findings" in [DEVELOPMENT.md](DEVELOPMENT.md).

## Device testing setup

Connect a phone as described in [DEVELOPMENT.md](DEVELOPMENT.md) ("First run on
the iPhone" and "Android phone over USB"). Test devices so far:

- **iPhone 16 Pro** in Expo Go: the primary test device.
- **Samsung Galaxy S21** (SM-G991B), Android 15 (API 35), One UI 7, Expo Go
  57.0.9, over USB with adb since 8 October 2026.

Record the build or commit, device, OS and Expo Go versions, data mode, app text
size and orientation for each session.

- **Saved or sample data.** Settings → Development → Sample data loads fictional
  history in memory; its edits vanish on reload or Reset sample data. Use it for
  statistics, long notes and goals. Persistence, backup and upgrade checks need
  saved data. A phone may hold the founder's real habits: never replace
  irreplaceable data for a visual test, and do not install, uninstall or clear
  app data without asking.
- **Screenshots.** iPhone: the face-down-and-back preview gesture (DEVELOPMENT.md,
  "Share an app preview from the phone") saves `.dev/previews/latest.png`.
  Android: `npm run android:screenshot` saves `.dev/android/latest.png`.
- **Scripted Android checks.** adb can tap by accessibility label
  (`adb shell uiautomator dump`, then `adb shell input tap`) and read crash logs
  (`adb logcat -d -t 300 '*:E'`). Confirm Expo Go is focused first; a stray tap
  once landed on the home screen. adb cannot judge haptics, smoothness or gesture
  comfort; the person holding the phone reports those.
- **Performance.** Expo Go development mode is slow on both phones. Use the
  development/production JavaScript comparison (DEVELOPMENT.md) and
  [PERFORMANCE.md](PERFORMANCE.md); final timing needs a compiled Release build
  ([RELEASING.md](RELEASING.md)).

## Smoke test

Run this first on any new build or device.

- Connect via DEVELOPMENT.md; record the phone model and OS version.
- Content clears the notch or camera cutout and the home indicator or navigation
  bar, in both orientations.
- Tap several checkbox cells quickly: every intended change appears. Tap again
  to undo: other rows must not move, shrink or disappear (Hide completed off).
- Enter, edit, cancel and clear a numeric daily total; other cells stay unchanged.
- Tap a habit name: Notes (if it has a note) or Statistics opens; values are
  unchanged.
- With Theme on System, switch the phone between light and dark, then increase
  the system text size: everything stays readable and reachable.
- With VoiceOver (TalkBack on Android), each checkbox cell exposes its habit,
  date, role and state; numeric cells expose their value; names open details.
- Reload: saved-data changes persist. Sample-data changes are temporary by design.

## Regression checklist

Run the relevant areas after a change and all of them before a beta build,
repeating key checks in landscape and at larger text sizes. The linked feature
docs hold the design behind each check.

### Grid and entries

- Drag to fill: tap a cell, then press it again and drag along the row. Every
  day passed stays highlighted; releasing on checkboxes paints the state the
  first tap gave (start on empty to tick, on ticked to clear) as one stroke:
  the bar grows (or is erased) through the cells and each box fills, bumps and
  renumbers as it arrives, and one Undo reverses it all
  (one History row). On number, text and category rows the dialog shows the
  range and Done fills every day; Close leaves them unchanged. Dragging
  vertically scrolls as usual; a fill never leaves its row. A single tap on a
  value cell opens its dialog after a short delay with an eased entrance; a
  plain double tap on a checkbox still toggles twice. Try Tap animations off
  and Reduce Motion (fades only).
- Check/uncheck five habits rapidly: immediate feedback and one short haptic per
  accepted tap, nothing queued. A pressed cell highlights; a swipe starting on
  a cell, or releasing on a different cell, must not toggle it. Only a tapped
  mark whose state changed pulses; cells appearing through scrolling, reload or
  Undo do not. Tap animations off or Reduce Motion removes the pulse, not the
  change.
- Numbers: recent-total suggestions fill the draft only; Close cancels, Done
  saves. Try a decimal, an explicit zero (recorded) and a clear. Unchanged saves
  and Close give no haptic.
- Categories: select several, Done, reopen and reload. Close, Back and backdrop
  taps discard. A category added in the entry sheet saves on Done as a habit edit
  then the entry. Renamed or archived options keep earlier records; archiving
  every option is prevented.
- Free text: a multiline paragraph survives reload in full even when the cell
  preview is truncated; blank clears. Text and category cells keep readable
  12-point text with tail truncation over one to three lines, never shrinking;
  emoji draw. Long numbers shrink to fit, down to 65%.
- Hide completed today (Daily tracking, off by default): rows meeting their goal
  at Today hide after a 700 ms pause; Track only habits stay; Show completed
  reveals them; other dates show the full list; the next day uses its own results.
- Recording a value or archiving shows Undo for four seconds; it reverses only
  that action, whatever the filter, goal or date.
- Every date, past and future, uses the same tone; recorded values, including
  zero, stand out.
- Past midnight while open, and after an overnight background, the grid shows the
  new Today with entries on their original dates.
- A failed save shows Retry and blocks edits; Retry saves exactly once.

### Date navigation

- Fling across months on the body and the headings, and reverse: the grid
  decelerates and settles on whole columns; headings, cells and names stay
  aligned. Days not prepared yet show muted dashes briefly, then fill in with
  their values.
- Flings toward Today stop there until a deliberate pull.
- Today from history or future dates returns quickly and continuously; a drag
  interrupts it.
- Future pull (the same rubber band on iPhone and Android): a short pull bounces
  back. A farther pull gives one readiness haptic as the streak grows left from
  the right end of the divider below the dates (no extra tick when crossing back
  and forth). Release slides to tomorrow beside today without the grid redrawing;
  a fling alone unlocks nothing. Pull again at the new edge. Future values stay
  on their dates and outside statistics.
- The month/year button jumps to near and distant dates accurately.
- Rotate deep in history and in future dates: the rightmost date is kept and
  values stay on their dates.
- Flings slow straight into a column with no correction at the end; a slow
  release eases onto the nearest column; a drag picks up without a jump.
- A hard fling toward Today slows quickly but smoothly and stops exactly at
  Today without bouncing past it.
- Tap a box while a fling is still moving fast: the scroll stops and nothing is
  checked. Taps while it gently settles work normally.
- Settings → Appearance: the preview stays pinned in portrait and scrolls in
  landscape; every control (sizes while dragging, theme, checkbox style,
  streak numbers, joins and their thickness while dragging, missed day
  crosses, week dividers) changes it at once, and the grid when Settings
  closes. Choices survive a restart. Missed day crosses mark only past
  scheduled days (try a 5-on/2-off habit); Streak numbers count back across
  scrolled-off days and renumber after checking a gap; Joined checkboxes grow
  their bar (settling into the box) or ease it back into the neighbour, with a
  bump on contact, and the tapped cell's background fades rather than
  switching; Undo switches it instantly. With Streak ends only, a run of
  three or more shows only its end boxes and one bar; checking the gap
  between two runs shrinks the boxes that become middles into the bar, and
  clearing a middle day brings back the two new end boxes. The
  Squares/Circles-only rows hide for Ticks & crosses.
- Closing History, Settings or Statistics (button or swipe) keeps the grid's
  dates and vertical position.

### Reorder, archive and delete

- Hold a name: haptic and menu (Edit habit, Reorder, Archive) with the name
  uncovered. Releasing chooses nothing; tapping outside closes it.
- Drag without lifting, or release and drag the held name again: the real name
  and its cells move together, neighbours swap without flashing, no cell toggles.
  Drop saves one order action; Undo/Redo it and reload.
- With 20+ rows, edge auto-scroll works; fast sweeps reverse cleanly. A second
  finger, rotation or backgrounding cancels without saving. Reorder → Done and
  Move up/Move down also work. Hidden and archived rows keep their slots.
- Add habit at the end of the grid: create all four types. Close discards
  drafts, including nested colour, icon and goal changes.
- Archive a recorded habit: it leaves the grid with data and History intact;
  Settings → Archived habits → Restore returns it to its slot.
- Delete an archived habit: the confirmation names it and its count; Cancel keeps
  it. Delete adds a named Habit deleted action; Undo returns its definition,
  notes, goals and records to its archived slot; Redo deletes again. Reload after
  each. Deleting the last habit leaves an empty store with no sample reseeding.

### History and Undo

- Check then uncheck an empty cell: no row remains. Check again: one row; Undo
  and Redo restore it with its original time.
- Several corrections to one number show one first → final row and undo in one
  step. Two minutes idle, another habit or date, or Undo/Redo starts a new group.
- Preferences add no row, never change the Undo target and keep Redo.
- Rows keep logged order under sticky day headings, with before/after values,
  colour swatches and "For <date>" when the entry date differs.
- Entries within five minutes on one date form one "N entries" row (cleared
  items struck through). Expand it and Undo repeatedly: rows leave one by one.
- Filters (Entries, Edits, Notes, a habit) label archived and deleted habits; an
  empty result offers Show all changes. The floating Undo bar always names the
  next Undo, even when filtered out, and the last row scrolls clear of it.
- Today and Yesterday start open, older days fold with counts (a filter opens
  all). The calendar beside Close jumps to a dotted day, or the closest earlier
  one. Filters and folds reset on close. Long histories scroll smoothly.

### Backup export and restore

Use saved data; backups are unavailable in sample mode.

- Settings → Backups → Export backup after saving finishes; save to Files or the
  Android share sheet. Cancelling must not change data or claim a backup.
- Make a fresh entry, then Restore backup…: the confirmation shows counts; Cancel
  once first. Confirming restores the exported state and Undo stack; Restore
  previous data… brings the fresh entry back and survives reopening.
- A malformed file is rejected without changing the grid.
- Restore a current export and the synthetic fixtures in [`docs/examples/`](examples/)
  (`storage-v1.json` to the newest; [STORAGE.md](STORAGE.md) gives the current
  version). Absent newer preferences take their defaults.
- A current backup round-trips all four entry types, notes and versions, goals,
  icons, archived habits, a deleted habit (Undo afterwards restores it) and
  preferences. Unfinished note drafts are excluded; a conflicting draft asks first.
- Force quit after saving and straight after rapid edits, and repeat offline;
  record any loss honestly. Expo Go data does not move into a standalone app.

### Settings, appearance and themes

See [SETTINGS.md](SETTINGS.md).

- The index lists Appearance and Daily tracking, then Archived habits and
  Backups; Development appears only in development builds. Info disclosures
  expand, collapse and announce their state.
- Name column, Day columns and Rows sliders show "Auto · N" until moved. Dragging
  updates the preview; release saves. After Settings closes, the grid matches the
  preview once and keeps its position. Reset returns to Auto. Wrapped names,
  numbers, landscape and reordering stay aligned.
- Text size 85–150% with the phone's larger text scales the grid, statistics,
  History, menus, dialogs and editor; Reset returns to 100%.
- Checkbox style, Week dividers, Tap animations, Week starts on and Haptic
  feedback apply after Settings closes (Hide completed applies
  at once). Week shading stays in the date headings and keeps each week's shade
  while scrolling. With haptics off, everything works silently.
- Theme on System follows the phone's mode while open. Dark or Light with the
  phone in the opposite mode: alerts, keyboards and date pickers match the app.
- Every background preset and a custom colour, both schemes: names, cells, dates,
  Today, week shading, Quick Undo, History, charts, goals, entry dialogs
  and the note editor stay readable. A hex such as #808080 is adjusted, with a note.
- Preferences survive reload and restore, never enter History or consume Redo,
  and a failed save shows Retry.

### Statistics

See [STATISTICS.md](STATISTICS.md).

- Range tabs (30 days, 90 days, Year, All time) and ‹ › step through periods,
  stopping at the habit's start; tabs wrap at large text sizes.
- Charts: tap a bar, or hold about 0.2 s and drag (one haptic); ‹ › steps, ✕
  clears; the screen never shifts. A quick swipe still scrolls or pages.
- Four days of 10, blank, 0 and 20 give 7.5 per day and three recorded days.
  Unfinished today does not lower rates. Future and pre-start entries stay saved
  but outside statistics. Other habits never affect the results.
- Calendar taps on past, current and future days check, uncheck or enter values
  (decimal, zero, clear, Cancel) inside the sheet; grid, charts and History update.
- Move a start date forward (older entries stay in the grid but stop counting)
  and back; Undo/Redo and reload.
- Categories and text show recording, not completion; tapping a category row
  filters the calendar and entries.
- Sample data: Read improving totals, Drink water decimals/zeros/gaps, Go for a
  walk a current streak, Meditate a recent gap.
- Close or a drag down from the top returns to the same grid position; a fling up
  from deep content must not dismiss.

### Notes and the note editor

See [DESCRIPTIONS.md](DESCRIPTIONS.md). Sample data has long Info notes on Go
for a walk (1,874 characters), Read (7,723) and Meditate (17,657), plus Why and
Rules on Go for a walk, Links on Read and How on Meditate.

- Several notes: the note names wrap under the header (no sideways scrolling
  that fights the pager); tapping one shows it, holding one or Rename or move
  opens the note sheet. + opens New note with your own name or the
  suggestions (used names are not offered; a repeated name is refused). Done
  saves the new note even empty; Close creates nothing. Rename, Move earlier
  and later, and Remove (with its confirmation) work, and Undo reverses each.
  The sheet's keyboard stays clear of the name field, and Android Back closes
  it.
- Editing the sample walk's Info note for the first time keeps its place and
  text everywhere; Undo restores it; its Versions list includes the older
  description edits.
- Today view: every tile's bottom corners hold Notes (faint without notes) and
  Statistics; each opens the sheet on that page, even against the habit's
  usual first page. The buttons are easy to hit at three columns without
  recording by mistake, names keep their width, and VoiceOver offers Open
  notes, Open statistics and one action per note.
- Name taps open Notes when the habit has any note, Statistics otherwise. Swipe or use the
  floating island to switch: partial drags settle, vertical reading stays
  vertical, swipes over links/charts do not activate them, and each panel keeps
  its position. The final line clears the island at 150% text in landscape.
- Long notes open without delay and keep highlights, nested lists and numbering;
  links open only on a deliberate tap; no remote images load.
- The first Edit after reload starts at the top with no black region; Opening
  editor… shows briefly. Later opens resume a matching position; scrolling stops
  automatic restoration.
- Formatting is edited directly: Bold twice, headings, lists, quotes, links and
  highlights, with the selection kept. Highlight shows neutral, a colour or mixed.
  Clear formatting keeps links. Local Undo/Redo leave app History unchanged until
  Done.
- Links: the link sheet stays above the keyboard; pasting a URL over a selection
  links it; tapping link text offers Open, Edit, Remove and Close.
- Done straight after typing keeps the last keystroke as one undoable action.
  Close with changes asks first. Blank text clears. Try the character limit.
- Unfinished text survives backgrounding or force quit as a recoverable draft,
  per note; Discard is final. Add/Edit habit no longer has a Description field.
- Versions: Before/After marks changed passages; Changes off shows plain text;
  Next change wraps. Restore changes only that note's text (or brings a
  removed note back), is undoable and survives reload and backup; only the
  latest matching row says Current.
- With the keyboard up, in landscape and at larger text, toolbar targets work,
  Done/Close stay reachable and text never hides behind the keyboard.

### Goals and periods

See [GOALS.md](GOALS.md).

- Habit and Goal editors are full-screen with fixed actions. The goal form has
  Success condition, Repeat, Cycle and Applies from; one opens at a time. Drafts
  survive section changes and Goal timeline. Close cancels with the keyboard up;
  parent Close cancels staged goals. Unchanged default goals are not saved.
- Dated versions (sample Read: 15 then 30 minutes): add one from Today and older
  results stay; correcting an earlier version asks first and changes only it.
- Compare at most/exactly zero with a blank day; categories with All, counts and
  exclusions; text with case and whitespace; Track only.
- Checkbox: Unchecked success with default Off and On, from grid and calendar.
  Default On set in habit editing leaves earlier dates unchanged. All four types
  share the completion tint.
- Off days stay editable and bridge streaks; Hide completed follows the goal.
- Sample periods: Walk 5 days on/2 off, Meditate 3 weeks on/1 off, Workout a
  weekly range on alternate weeks. Off periods are neutral; the next boundary is
  suggested; Period results tell partial, rest and open periods from failures.
  Changing Week starts on leaves saved anchors unchanged.
- Save a goal on saved data, reload, Undo/Redo, export and restore.

### Android

- Statistics, History, Settings and category entry sheets close with a downward
  drag only when content is at its top; Back closes sheets.
- Number, text and new-habit dialogs open the keyboard; its Done key saves.
- Jump to date and start dates use the dark calendar with a month/year chooser.
- Date navigation and the future pull behave as on iPhone (see Date
  navigation); the grid opens on Today with columns aligned to their headings.
- Auto sizes on the S21: four days, 130-point names, 48-point rows. Landscape
  clears the camera cutout and navigation bar.
- Still unchecked: the description editor and toolbar above the keyboard; other
  `Platform.OS === 'ios'` branches (CategoryEditor, GoalVersionForm,
  DevPreviewCapture); reorder; rapid taps; saved-data reload; backup via share
  sheet and file picker; TalkBack; haptics.
- Expo Go's floating developer button covers part of the grid; real builds lack it.

### Accessibility

- **Screen readers:** the canvas grid has an invisible overlay with one element
  per visible cell (habit, date, role, state and value; never one combined
  column) and an activate action that edits it like a tap. Date headings read as
  headers with the full date, and an adjustable Dates strip pages by the visible
  days on swipe up/down. Not yet checked with VoiceOver or TalkBack on a phone;
  with neither on, the overlay must not block grid touches. Names offer Edit
  habit, Reorder habits, Move up, Move down and Archive habit; the background is
  hidden while the menu is open. Charts adjust item by item; History rows read
  once; bursts and day headings announce expansion; inactive panels are hidden.
- **Text size:** 85–150% app text with the phone's larger text, both
  orientations, every screen: content scrolls rather than clipping.
- **Reduce Motion:** Today return, future reveal, row movement, tap pulses,
  joins, island taps, Next change and menus follow it; direct gesture feedback
  and the tapped cell's background fade remain.
- **No gesture-only essentials:** reorder, close and page switching have buttons
  or accessibility actions. Check contrast in both themes, safe areas and long
  names.

### Development tools

- Preview capture: face down until a tap, then back and pause, saves one settled
  screen with no popup. Rotation, shaking, brief flips, long waits and uploads in
  progress cause no extra captures. With the receiver stopped a network error
  shows; Retry after restarting uploads the original screen. Title holds and
  Settings → Development → Share preview are fallbacks.
- Sample data shows SAMPLE DATA in the top bar; Reset sample data discards edits;
  turning it off returns saved data unchanged.

## Timed usability study

The goal is checking off five habits within about three seconds of tapping the
app icon ([PROJECT_GOALS.md](../PROJECT_GOALS.md)). It is an aspiration to
measure, not an achieved claim; acceptance thresholds are still to be agreed.

- Use the founder's familiar habit names in their chosen order. Learn the
  positions, then run at least ten trials checking five intended checkbox habits.
  A screen recording or external recording helps with timing.
- Record build, device, OS version, habit count, text size, cold or warm start,
  app-icon tap time, first usable list time, fifth check time, errors (wrong taps
  and corrections), scrolling, and whether the tester stopped to search.
- Report median and slowest icon-to-fifth-check time, list-ready-to-fifth-check
  time and the error count. The target includes opening the app; do not silently
  redefine it to exclude launch time.
- Compare 10, 15 and 20 habits, noting visual searching as well as time.
  Evaluate numeric entry separately.
- Use a preview or release build for performance conclusions. Repeat with
  realistic habit counts, one-handed use and accessibility settings, and document
  limitations.

## Before beta

- [ ] Completion survives force quit/relaunch and offline use. (Reload
      persistence is confirmed on the iPhone; force quit and offline are not.)
- [x] Rapid toggles cannot overwrite a later write with an earlier one.
      (Serialized writes; tests include 101 rapid same-cell edits.)
- [x] Storage errors are visible and retry/recovery does not erase records.
- [ ] Midnight while open, background/resume, daylight saving and travel follow
      the local-day policy without deleting history. (Automated; phone pending.)
- [x] Renaming, reordering and archiving preserve IDs and historical records.
- [ ] Schema upgrades retain data, including from an earlier installed version.
      (Every checked-in fixture replays; no installed standalone build exists.)
- [ ] No accidental input through edit controls; primary rows remain stable.
- [ ] Physical-device accessibility, contrast, safe areas and long names work.
- [x] Export/import round-trip and replay reproduce dated values and ordering.
      (Comments are deferred, so not yet part of this check.)
- [x] History preserves effective habit dates separately from edit timestamps.
- [ ] Dependency audit findings reassessed.

## Known open issues

- **Older actions that could not be undone** (4 October 2026): the founder
  reported changes from before a reload that seemed impossible to undo, possibly
  predating persistent History. Unresolved; see "Incremental persistence and
  backup" in TEST_LOG.md.
- **Grid rendering speed:** entry rendering felt noticeably slow on the iPhone in
  Expo Go development mode (7 October 2026), before the Skia canvas grid
  replaced that renderer on 12 October. No Release build has been measured; see
  [PERFORMANCE.md](PERFORMANCE.md).
- **Date-scrolling feel still being tuned:** the founder confirmed the canvas
  grid feels right on both phones apart from date-scrolling polish
  (12 October 2026).
- **Android number dialog:** with the keyboard open, Close/Done need scrolling.
  Decide whether that is acceptable or the dialog should be more compact.
- **Android over Wi-Fi:** Expo Go could not reach Metro over Wi-Fi (cause
  unknown; USB works), so the preview gesture is untested on Android.
- **iPhone review pending** for changes checked only on Android or in tests: v18
  size sliders, the category entry sheet, the 10 October statistics revision, v19
  themes, and History bursts, filters and day folding.
- **Phone review pending for statistics Customize (v25):** checked only by
  types, tests and the bundle exports, never on a phone. On both phones,
  check Customize this page at the end of Statistics (and of a Categories
  habit), ↑ ↓ and Hide/Show in each section's title row with larger text,
  Reset and Done, the Combine days by choice on a number habit (headline,
  tiles and weekday dots change; calendar days are not editable while
  customizing), the Daily values dots on their fitted axis with tap and
  hold-and-drag selection and VoiceOver/TalkBack, and that a layout made on
  the web arrives through sync once the phone syncs.

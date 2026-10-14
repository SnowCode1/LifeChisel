# Test log

Dated evidence of what was tested and what was found: automated results, browser
and device checks, founder observations, and what remained unchecked at the
time. Entries run oldest first. Older entries describe behaviour that later
changed; where an entry's checklist contradicts current behaviour it is marked
**Superseded:** with what replaced it. The current procedure and regression
checklist are in [TESTING.md](TESTING.md).

Test counts are the full `npm test` total at the time. "Founder" means the
project owner and maintainer; "assistant" means an AI coding assistant. Add new
entries at the end under a dated heading: what changed, automated and device
results, founder observations, and what is still unchecked.

## 4 October 2026

### Foundation verification

- TypeScript, ESLint, and Prettier checks passed.
- Expo Doctor passed all 21 checks.
- The iOS JavaScript/Hermes bundle exported successfully.
- No visual or browser interaction test was run. A successful bundle is not
  visual verification.
- iPhone runtime verification and all timing trials remain pending.
- npm audit findings remain open; see DEVELOPMENT.md.

The first iPhone smoke test (its current form is in TESTING.md) also included
two checks that no longer apply:

- **Superseded:** "Reload the demo; all changes reset." Data has persisted
  across reloads since incremental persistence (later on 4 October). The bottom
  demo notice was removed at the founder’s request; the grid should use the
  freed space while respecting the home-indicator safe area.
- **Superseded:** "Tap a habit name; the statistics placeholder opens without
  changing values." Name taps now open the Notes/Statistics sheet.

### Preview sharing

- The founder confirmed the original demo opens on the iPhone 16 Pro.
- TypeScript, ESLint, formatting, and all 21 Expo Doctor checks passed with the
  capture dependency installed.
- Seven receiver tests passed: saving/retention, pairing, browser-origin rejection,
  malformed payloads, upload size, route restrictions, and disk-write failures.
- An iOS release JS export with preview enabled contained no preview button,
  uploader, RNViewShot module, receiver address, or pairing token.
- The running Metro server's iOS development bundle includes the preview UI and
  local settings. The real receiver starts on the configured LAN address.
- The founder tapped Share preview on the iPhone 16 Pro and reported success.
  A 1206 × 2622 PNG arrived in `.dev/previews/`; it showed the dark-mode
  three-day grid and preview control. The full physical device
  capture/upload/read workflow is verified for the main screen.
- Dialog/keyboard capture and the phone's failure/retry UI remain manual checks.

The visible buttons were then replaced with a long press on the app heading or
dialog title. Verify that there is no added layout space, short taps do not
capture, and one sustained press produces only one upload. Successful uploads
provide haptics and a VoiceOver announcement; no success popup appears. The
founder subsequently reported that the gesture works on the physical phone.

Gesture update checks: TypeScript, lint, formatting, iOS bundle export, and all
21 Expo Doctor checks passed. The release bundle excludes the gesture hint,
uploader, RNViewShot module, receiver address, and pairing token. The configured
receiver responded successfully to an authenticated health check.

To check manually: share the grid, share a dialog, stop the receiver and verify
that an error appears instead of a success message, then restart and retry.
Set the flag false and fully reload to verify the headings stay visually
identical but no longer capture.

**Superseded:** the visible preview buttons and long-press-only capture. Since
5 October the face-down-and-back gesture captures any screen; title holds remain
optional shortcuts. The receiver error and Retry check is in TESTING.md.

### Scrollable date grid

- TypeScript, ESLint, formatting, and the iOS bundle export passed.
- All 12 automated tests passed, including five new calendar tests covering
  past-only dates, batch expansion without shifting existing day identities,
  leap days/month boundaries, Melbourne DST changes, and stable dates at rollover.
- Entries use habit ID plus local date; virtualized columns never own entry state.
- Main background was pure black at the time (now the default dark theme); eight
  selectable habit colours apply to row labels, units, checkbox states, numbers,
  and separators.
- The founder shared a phone screenshot of the three-column version. Its main
  grid rendering was inspected; scroll interaction verification remains pending.

Manual checks for the grid at this stage:

1. Open at today and as many preceding days as fit. Swiping past today cannot reveal
   future dates with a light pull. Pull farther and release to reveal future days.
   Swipe older dates through a month boundary and beyond 90 days.
2. Drag both the date headings and the cells: headings and cells should stay
   aligned while habit names stay fixed. Scroll down: headings stay visible and
   names/cells move vertically together.
3. Record different values on two dates, scroll away and return: both keep their
   original values. A swipe must not toggle a cell accidentally.
4. Tap Today to return from history. It should preserve vertical scroll position
   and row order. Try increasing system text size and confirm row alignment.
5. Tap a habit name, select a colour, then Done. Its name, units and entries across
   all dates should update together; its saved-in-memory values should stay put.
6. Check rollover while open and after backgrounding overnight. The grid should
   return to the new today and earlier entries should remain attached to their dates.

**Superseded:** step 5's name tap. Names now open Notes/Statistics; colours are
changed through Edit habit.

### Adaptive grid and visual polish

Responsive columns and portrait/landscape support implemented. The shared
portrait screenshot informed narrower names, a quieter calendar header, smaller
row gaps, and adjusted checkbox/number weights. The founder confirmed both
orientations work and columns stay aligned on the iPhone. No updated captures
had arrived at the time of that confirmation, so the latest visual details had
not been inspected from a new screenshot. Date retention when rotating, larger
text, and landscape dialogs still need explicit phone checks.

TypeScript, ESLint, formatting, all 15 automated tests, and the iOS release bundle
export passed. Three new geometry tests cover whole columns, portrait/landscape
widths, minimum touch widths, larger text, and unmeasured layouts. These tests do
not substitute for native gesture and rotation checks.

- Compare portrait/landscape: whole columns fill available width, today stays at
  the right, and all controls clear the notch/home indicator.
- Browse older dates, rotate both ways, and confirm the rightmost date is retained
  with headings/cells aligned. Tap Today and confirm it returns immediately.
- Change text size: fewer days should fit, names can wrap, rows stay aligned, and
  a previously recorded value remains attached to the same date.
- Cross month/year boundaries; the compact heading must describe both months/years.
- In landscape, open a numeric entry and the keyboard, save/cancel/clear it, then
  open colour details. Content and actions must remain reachable by scrolling.
- Compare screenshot density, blank/checked states, and numeric totals. Confirm
  that five rapid checkoffs still hit the intended cells without accidental swipes.

### UI-thread scrolling, future dates, and custom colours

The founder reported jitter in the prior grid. Source inspection identified
per-frame JavaScript follower scroll commands and React state updates. The
replacement uses native UI-thread synchronization. The founder confirmed
scrolling is smoother and the future pull works on the iPhone. The initial
picker needed layout improvements; the follow-up replaces stacked controls with
Presets/Custom tabs and a fixed Done action. The founder confirmed the shorter
layout is better, and requested one Done action that applies the choice plus a
close button that discards it. The founder subsequently confirmed scrolling and
Done/close work correctly on the phone.

All 23 automated tests passed, along with TypeScript, lint, formatting, the iOS
bundle export, and all 21 Expo Doctor checks. The running iOS development bundle
contains compiled worklets. Release export is still not native performance or
App Store validation. Dependency audit findings remain documented in DEVELOPMENT.md.

Automated coverage now includes signed future dates across DST/leap/year edges,
future batch identity, the pull threshold, scroll-to-date mapping before/after
rotation or batch changes, hex validation, OKLCH round-trips/reference values,
gamut mapping, preset contrast, and contrasting checkmarks.

Phone checks for this change:

1. Compare slow drag, quick fling, direction reversal, and a diagonal gesture on
   both header and body. Check alignment during motion, not just after settling.
2. Pull slightly past today and release: it should bounce back. Pull farther:
   progress fills and the label changes to Release for future dates. Release to
   reveal a screenful of future dates. A fling alone must not unlock them.
3. Enter a future checkbox and numeric total, return to Today, then reveal again.
   Both values must remain tied to their dates. Pull again at the future edge to
   extend the range. Try the month menu with VoiceOver as well.
4. Rotate in history and in future dates; confirm date and row alignment. Repeat
   at larger text sizes. Values must not migrate when column counts change.
5. Select presets; switch to Custom; adjust each slider; type valid shorthand
   and six-digit hex, then invalid text. Only Done commits any draft and closes.
   Close must discard preset, slider, and hex changes; reopening must show the
   last committed colour. Invalid hex disables Done. Check low-lightness contrast
   guidance and black/white checkmarks.
6. Test picker scrolling and hex keyboard in both orientations. Share a preview
   by holding the habit title. Reload still resets demo entries/colours.

**Superseded:** step 6's reload reset (data now persists) and the step 2
progress label (the future pull now shows a streak on the divider, with no
text; see Compact top bar below).

### Muted future and older empty cells

Implemented OKLCH muting while preserving habit hue. Empty future cells are
muted immediately. History fades smoothly after day 7, reaching maximum muting
at day 14. Checked boxes and recorded numeric totals retain their colour; any
recorded value also restores that date heading's brightness. Explicit numeric
zero counts as recorded. Phone visual confirmation for this treatment is pending.

TypeScript, lint, formatting, and the existing five colour tests passed. A numeric
check across the preset palette found the weakest fully-muted empty numeric mark
has 4.22:1 contrast against black; the fully-muted date number has 8.23:1. These
checks do not establish contrast for arbitrary custom choices, which already have
contrast guidance in the picker. The iOS export is checked before committing.

Phone checks:

- Reveal future dates: compare an empty cell, a checked box, and an entered total.
  Check that the cells remain usable, and their hue still relates to the habit.
- Check, then undo the last completion on a future date. Its heading should regain
  brightness and then return to muted. Repeat with entering/clearing numeric zero.
- Browse days 7–14: the transition should be gentle with no abrupt boundary.
  Recorded values should stand out against empty neighbours.
- Rotate and return to the same date. Its emphasis should follow age rather than
  position. Try at least one saturated preset and a darker custom colour.

**Superseded:** the desaturated treatment, by the lightness-only correction below.

### Lightness-only dimming correction

The founder rejected the desaturated appearance. Dimming now retains OKLCH
chroma/hue and changes only lightness, bounded by a visible floor and the sRGB
gamut. History fades from day 5 to day 8; future empty cells are fully dimmed.
The day-8 endpoint and dimming strength still need phone judgement. The contrast
measurements above describe the superseded desaturated treatment.

Check days 4–8 for the faster transition. Compare empty future/history controls
against a completed value in the same row: the hue should stay recognisable and
vivid while brightness decreases. Test a saturated custom colour and distant
history; colours must stop dimming rather than disappearing. Recorded zero,
undo/clear, date-heading emphasis, scrolling, and rotation should retain their
previous behaviour.

Correction verification: TypeScript, lint, formatting, five existing colour tests,
and the iOS export passed. A direct check across presets and saturated/dark custom
samples confirmed lower nonzero lightness with chroma preserved within 0.0013
of the original after hex rounding. Updated phone appearance remains to be judged.

### Stronger empty-cell dimming

Inspected the founder's 1206 × 2622 phone capture showing today beside tomorrow.
Future date text is visibly subdued; differences in empty cells are much less
consistent. Numeric checks identified the 0.5 lightness floor as the limiting
factor for the current palette (12–24% reduction rather than 30%). The
empty-cell floor is now 0.38; date text keeps its separate 0.56 floor.

A direct check confirmed all eight demo colours reach about 30% lower OKLCH
lightness while retaining chroma/hue. Judge the revised result on the phone,
particularly Read, Drink water, and the today/tomorrow boundary. Checked values
and recorded totals should continue to stand out. History still fades on days 5–8.

### Action haptics

Implemented single-pulse completion/confirmation, softer undo/clear, selection
ticks, and one future-ready threshold tick per direct drag. Physical feel and
first-tap latency need founder evaluation on the iPhone 16 Pro.

Phone checks:

- Check five separate habits quickly. Each accepted tap should get one short
  pulse and immediate visual feedback, with no queued pattern afterwards.
- Undo a check; compare its softer feedback. Swipe starting over a cell: cancelling
  the press to scroll must not produce a checkoff pulse or change its value.
- Open a numeric editor, save a changed value, save it again unchanged, clear it,
  and Cancel. Opening selects, changed save confirms, clear gives undo; unchanged
  save and Cancel are quiet. Include zero as a recorded value.
- Select different colour presets/tabs; repeated selection is quiet. Drag sliders
  and type hex: no per-step buzzing. Done confirms only an actual applied colour
  change, while Close stays quiet and discards it.
- From both header and body, pull to future readiness: one firmer tick. Move back
  and forth across the threshold without lifting: no extra tick. Release: no second
  pulse. A fling or an under-threshold pull must not produce the readiness tick.
- Return to Today: one selection tick for a real jump. Already at the normal
  Today boundary, the menu's no-op return should stay quiet.
- Repeat with iOS Low Power Mode or haptics disabled: UI actions must still work.
  Native feel cannot be established by tests or Linux bundle export.

Verification: TypeScript, ESLint, Prettier, all 23 existing automated tests, and
iOS production bundle export passed. The founder tested the first version on
the iPhone and found it slightly weak; completion/changed-save feedback was
raised from Light to Medium. The founder subsequently confirmed it was good.

### Continuous future reveal

Replaced the full-screen future jump with preserved native lists and an animated
continuation based on the released pull distance.

- From Today, release near the threshold: tomorrow should appear beside today
  without a blank frame, list reset, or header/body separation. A shorter pull
  must bounce back without unlocking dates.
- Pull farther: travel should follow the pull distance, then snap to a column.
  Portrait and landscape should reveal the same number of days for the same
  physical pull/column width, rather than jumping their different screen widths.
- Continue scrolling into the unlocked range, reach its far edge, and reveal a
  second batch. The previous edge date must retain its position as dates load.
- Interrupt the reveal with another drag. User control takes priority.
- Try the month menu’s future action from both Today and history. It should
  animate into the next future date, with the header staying aligned.
- Return to Today, pull again, rotate, then scroll back into history. Verify the
  normal Today boundary returns and values remain attached to the same dates.

TypeScript, ESLint, Prettier, all 24 tests, and iOS production export passed. The
new regression test verifies the first reveal brings tomorrow beside today at
different viewport/column sizes, plus larger pulls and successive future batches.
The founder evaluated the revised reveal on the iPhone and reported “Smooth and
intuitive”. The broader second-batch, interruption, menu, and rotation checks
above remain a regression checklist, not individually confirmed test results.

### Compact top bar and native panels

The founder chose an always-visible compact bar and then refined the first phone
preview. History/Settings icons and placement were approved; the initial
date/Today placement was rejected. The revised layout puts Today top-centre and
month/year back beside the day headings.

- Check portrait, landscape, and larger system text: the brand, centred Today,
  and right-hand icons must not overlap. Month/year remains beside date columns.
- Tap month/year: the existing date actions open. Long-press ONPURPOSE or
  month/year: save a preview without opening a date menu afterwards. Test the
  VoiceOver Share preview action too.
- Scroll back, reveal the future, and return via Today. Its appearance must not
  move controls, date columns, or habit rows.
- During a future pull, a gradient streak grows leftwards from a fixed right endpoint
  on the existing divider beneath the dates. No instruction text or new border
  appears. Brightness ramps smoothly from transparent left to muted grey right,
  without a white hotspot or a dimming right cap. On release/cancellation it
  fades at its last width. The single readiness haptic and smooth continuation
  into tomorrow must still work.
- Try with iOS Reduce Motion enabled: the release fade follows system policy;
  direct pull feedback remains visible. There should be no animation while idle.
- Open History/Settings from a scrolled position; close using Close and iOS swipe
  dismissal. The same dates and vertical position remain visible. Closing History
  must not flash Settings during dismissal.
- Turn haptics off: checkoffs, numeric saves, presets and future readiness are
  silent. Turn it on: the switch confirms and feedback resumes. Reload restores
  this temporary preference to its default.
- History clearly says it is coming next, without fabricated events or a
  nonfunctional undo control. Capture works by holding either panel title.

**Superseded:** the haptics preference now persists across reloads (incremental
persistence, below), and History is a real change list with Undo/Redo.

TypeScript, ESLint, Prettier, all 24 tests, iOS export, and all 21 Expo Doctor
checks passed for the panel/icon foundation. Static checks and iOS export also
passed after the revised placement and border animation. Revised native feel
remains under refinement. The founder confirmed the revised placement is right,
but requested tuning of the streak and normal date formatting. The final
correction anchors the streak on the existing divider and restores separate
month/year text within a single date button. The founder then identified a
bright hotspot and uneven gradient; the latest version replaces that with one
muted-grey alpha ramp. Final acceptance of this brightness adjustment is pending.
The initial screenshot proved month-label capture works, but does not establish
acceptance of the revised UI.

The colour picker destructures preset hex before JSX style use, avoiding
Worklets’ false-positive warning for plain objects named `.value` without
disabling actual animation diagnostics. A development Babel transform confirmed
no `getUseOfValueInStyleWarning` call is injected for these preset styles.

### Incremental persistence and backup

Automated: 45 tests passed, including 21 focused storage tests against the actual
SQL/replay/queue/archive modules. TypeScript/lint/format, iOS and web exports passed;
Expo Doctor passed 21/21. Node SQLite tests use memory and a reopened disk file;
they are not a test of Expo's native bridge. A separate development-host replay
check processed 50,001 synthetic events in approximately 191 ms; do not infer
native launch performance from this number.

Tests cover explicit zero/clear, backdated/future dates, malformed values and
versions, duplicate IDs/missing order, inverse targets, redo branching, 101 rapid
same-cell edits, persisted colours/settings/undo, failed projection writes,
idempotent retry after an uncertain commit, projection repair, protected corrupt
logs, rejected newer databases, atomic initial setup, checksum round-trip and
malformed archives, restore rollback, retained pre-restore copies, exclusive
backup work, startup retry, undoing every recorded edit after reopening, long-log
replay without source mutation, the checked-in example export, and browser quota
failure. No storage fixtures contain real founder data.

Phone evidence: the founder confirmed checkbox/numeric entries, colour, and the
haptic preference survive reloading, and said the feature works overall. They
reported some older changes appeared impossible to undo, from before refreshing.
Clarification is pending about whether those actions exist in the persisted
History or predate the transition from temporary state. Do not claim this undo
report resolved solely from automated tests. (Still open; listed under Known open
issues in TESTING.md.)

Remaining iPhone checks:

1. Record five checkbox changes rapidly, undo and redo them, fully close/reopen
   Expo Go, and repeat. The newest remaining habit action is the next undo; its
   row disappears on Undo and returns on Redo. Test another day and tomorrow,
   and a numeric explicit zero. See the grouped-action checks below.
2. In Settings wait for Saved, export via Save to Files, and verify a JSON file
   exists. Cancelling sharing must not alter data or claim an external backup.
3. Make a fresh entry after exporting, restore that file, and inspect the native
   count/replacement confirmation. Cancel once first. Confirming must restore the
   exported state and its undo stack. Restore pre-restore copy must bring back
   the fresh entry. Reopen to verify persistence of the copy.
4. Try a malformed file; validation must reject it without changing the grid.
5. Try force-quitting after Saved, and separately immediately after rapid edits.
   Record any uncommitted loss honestly; there is no guarantee after a force kill
   before writes finish. Test offline, midnight rollover, timezone changes, and
   larger accumulated histories in a development/release build.
6. Verify VoiceOver labels/disabled Undo/Redo, large text and landscape in History
   and Settings, safe-area dismissal, and no grid position change after closing.

Permanent corruption has no destructive auto-reset. Developer-assisted recovery
and external backups are the current recovery path for an unreadable log.
Uninstalling Expo Go/a standalone build may remove its container. Expo Go data
will not automatically appear in a standalone app; use export/restore.

The dependency audit reports 28 transitive findings (8 moderate/20 high), compared
with 27 before the storage dependencies. The extra report is expo-sharing through
the already-used @expo/config-plugins chain; npm proposes an incompatible older
major as its fix. No forced dependency downgrade was applied. Resolve the SDK's
audit findings before release; successful Doctor/export checks do not resolve them.

### Compact grouped History

Implemented on founder request: dense action-icon rows with time at right,
sticky edit-day headings, fixed save status and Undo/Redo controls. Numeric rows
show before/after values; colour rows show paired swatches. A differing entry
calendar date uses a For-date caption. Grouping uses the viewing local zone;
event sequence and stored data remain intact.

Automated: the full suite passes 53 tests, including eight new History tests for
local-midnight grouping, pagination into one day, clock rollback order, daylight
saving and travel, effective habit dates, numeric zero/clear, undo/redo, settings
and year-boundary headings. TypeScript/lint/format and iOS bundle checks pass.
The founder approved the appearance on the iPhone. No screenshots of this
revised layout have been inspected; large-text/VoiceOver and paging checks remain
to be confirmed. Behaviour changes to filtering settings, undo presentation, and
repeated-toggle grouping were subsequently authorized; see the following entry.

Phone checks: inspect normal and large text, long names, colour changes, explicit
numeric zero, past/future corrections, undo/redo, pending/retry status, sticky
heading readability, and older-record loading. VoiceOver should read a whole row
once with habit/action/effective date/time; icons and swatches are decorative.
Same-day rows should not repeat the date. Confirm closing History still preserves
horizontal grid position, and no changes to entries are made by browsing.

### Active actions and grouped Undo

Implemented: global preferences save outside visible History/Undo, retaining
habit Redo. Undo removes a row and Redo restores the original action. Consecutive
corrections to one entry/field coalesce within two minutes of inactivity, net-zero
groups disappear, and a target description explains the next Undo. Every raw edit
still writes immediately. New version-2 events/containers retain legacy v1 import
and replay; the SQLite schema stays version 1.

Automated: all 67 tests pass, along with TypeScript, lint, formatting, and an iOS
production bundle export. Coverage includes grouping/cancellation/resumption,
numeric net Undo, exact inactivity boundaries across reopen, separate
habits/dates/fields, midnight/zone/clock changes, preferences preserving Redo,
Undo/Redo boundaries, atomic grouped-undo failure/retry, backup round-trips,
legacy preferences and abandoned redo branches, rejected malformed groups, and
synthetic v1/v2 fixtures. Phone acceptance of the new behaviour remains pending;
prior persistence and History appearance approvals do not establish this
milestone's native behaviour.

Phone checks:

1. Check/uncheck an empty cell rapidly: no active row remains. Check again:
   one row returns. Undo removes it; Redo restores it with its original time.
2. Set a numeric total, then correct it several times: one row shows the initial
   value → final total. Undo restores the initial value in one step. Repeat after
   two minutes of inactivity: a separate correction appears. Test explicit zero.
3. Change another habit/date between corrections: they remain separate actions.
   Undo/Redo followed by a correction also starts a new group.
4. Toggle haptics: no History row, no changed Undo target, no lost Redo. Reload:
   values, preference, grouped actions, and Redo survive. Old v1 habit edits remain
   separate steps; their settings and undo/redo rows are hidden.
5. Export/restore through Files, verify both a v1 backup and a v2 backup. Inspect
   target labels and save/error status with large text, landscape, and VoiceOver.

### Habit actions and management

Implemented: tap-name statistics, held-name anchored menu, continuation into drag,
explicit Reorder mode, edge scrolling, cancellation, VoiceOver move actions,
creation/editing/archival/restoration, and version-3 persistent definition/order
changes. Statistics show recorded-day counts and a recent fourteen-day view;
future entries are excluded. Targets and streak rules remain undecided.

Automated: all 74 tests, TypeScript, lint, formatting, and iOS bundle export pass.
Coverage includes SQLite management reload/Undo/Redo and archive round-trips, exact
identity/position/order validation, unitless numeric zero, independent structural
Undo steps, empty v3 initialization, older format boundaries, unchanged v1/v2
fixtures, archived reorder slots, and variable-height drag destinations. Native
responder recognition, overlay placement, auto-scroll feel, and nested iOS sheets
remain phone checks; bundle success alone does not establish their behaviour.

Phone checks:

1. Tap a name: statistics opens. Tap cells: recording remains immediate. Hold
   without moving: haptic and menu; release leaves it open without selecting an
   option or opening statistics. Tap outside to dismiss. Try top/bottom rows.
2. Hold then drag without lifting: menu disappears, row follows, neighbours move,
   and cells do not toggle. Release saves one order action. Undo restores the
   original order without changing values; Redo restores the move. Reload.
3. Drag near both viewport edges with 20+ rows. Normal swipes before a hold should
   scroll. Add a second finger, rotate, or background the app during a drag:
   cancel without saving a partial order. Try explicit Reorder → Done too.
4. Settings → Manage habits → Add: create checkbox and unitless numeric habits,
   choose colours, and enter zero. Edit names/units/colours. Done applies; Close
   discards, including nested picker changes. Check keyboard and landscape.
5. Archive a recorded habit; it leaves the grid while History/data remain. Restore
   it at its retained position. Archive all rows; Add remains available. Export,
   edit, restore, reopen, and undo management actions without reseeding.
6. Inspect larger text and VoiceOver. Name actions include Move up/down and direct
   editing. Background controls should be hidden from VoiceOver while the menu is
   open. Confirm closing panels preserves the horizontal date position.

**Superseded:** step 4. Settings → Manage habits no longer exists; Add habit sits
at the end of the grid and archived habits are in Settings → Archived habits (next
entry). The basic statistics were replaced by full-screen statistics.

### Full-screen statistics, motion, and archive-only management

Supersedes the basic-statistics and Settings → Manage habits steps above.
Implementation complete; all 83 tests, TypeScript, lint, formatting, and iOS
production bundle export pass. Founder confirmed the context-menu transition is
smoother and Add/archive/restore retain entries and position on the phone. The
first drag animation felt harsh, and the selected name was not reachable after
leaving the menu open. A damped spring, a backdrop cutout over the selected name,
and a hold-state reset restricted to new touches address this feedback; these
follow-up gesture changes and statistics acceptance remain pending.

Automated coverage adds nine statistics tests to the previous 74, including daily
rate boundaries, zero versus missing, future exclusion, archive/restore and
Undo/Redo lifecycle, timezone/leap-day arithmetic, aggregation, clock rollback,
and all three unchanged storage fixtures. Existing SQLite reload, archive and
restore, reorder/Undo, and recovery tests remain in the full suite.

Phone checks:

1. Tap a checkbox name: full-screen statistics slides in. Try 30D/90D/1Y/All,
   inspect chart periods, browse months, and return Back. The grid should retain
   its date and vertical position. Edit a name/colour from statistics; closing
   the editor returns to updated statistics.
2. Compare a numeric habit with a recorded zero, a blank day, and a future value.
   Zero is included in averages, blanks are omitted, and the future value does
   not inflate totals or streaks. Checkbox rates exclude unfinished today.
3. Hold a name and release: menu appears without activating anything. Wait with
   the menu open before dragging; also release, then hold the selected name again
   and drag. Neighbours and their date cells should move together. Drop should
   settle smoothly and save one Undo step. Recheck edge scrolling, interrupted
   drags, quick successive drops, and rotation. Try system Reduce Motion too.
4. Add habit at the end of the list. Archive a recorded habit; Settings → Archived
   habits should list it with Restore. Restore, return to the grid, and check its
   entries and retained slot. Reload and verify persistence and History Undo.
5. Try the statistics screen and archive list in landscape, larger text, and
   VoiceOver. Check chart increment/decrement actions and calendar announcements.
   Holding Statistics, the habit title, or Archived habits sends a dev preview.

### Optional icons and actual-row dragging

Implemented after founder feedback: optional None/Phosphor/Emoji selection, saved
icons in grid/statistics/archive, version-4 events/backups, and dragging the actual
row with a faster spring. The earlier translation was confirmed smooth but too
slow; its visual swap was rejected. This revision awaits device acceptance.

Automated: 89 tests plus TypeScript, lint, formatting, and an iOS production export.
New coverage checks single emoji sequences, invalid inputs, stable pack IDs with
bundled glyphs, icon-only History descriptions, SQLite reload/removal, Undo/Redo,
archive restore, old-format rejection of icons, version downgrade protection,
and a new v4 backup fixture preserving the unchanged v3 prefix.

Phone checks:

1. Edit a habit → Icon → search Icons or enter Emoji. Inner Done updates the draft;
   outer Done saves. Close should discard the current draft. None removes the icon.
   Change colour and confirm pack icons follow it while emoji keep their colours.
2. Reload, Undo/Redo the icon edit, archive/restore, and export/restore via Files.
   Confirm the same icon and entries return. Try numeric habits with long units.
3. Hold/wait/drag and release/re-hold/drag from an open menu. The actual name,
   optional icon, units, and date cells should move together and retain their
   appearance when dropped. Neighbours should settle quicker than the prior build.
4. Recheck variable-height names, both viewport edges, large text, landscape,
   multi-touch cancellation, backgrounding, Reduce Motion, and VoiceOver move actions.

### Row-swap flicker

The founder confirmed the drag/drop appearance change was resolved, but observed
flashes of wrong positions during swaps. ReorderRow now uses a single absolute
animated Y position, with stable preview sibling order and shared preview/drop
geometry. Inner name controls provide height measurements. The context-menu
appearance and faster spring remain unchanged.

Automated: 91 tests, code checks, and iOS production export pass. New geometry
coverage exercises wrapped/taller rows, every drag destination, constant content
height, no gaps, and matching preview/committed positions. Native flicker removal
still needs phone verification.

Phone: hold a name until its menu is open, then drag slowly across three rows and
back; repeat with a quick drag, a tall name, and near both scroll edges. Check that
name and date cells move together without flashing at another Y position. Drop,
Undo, and reload to confirm only the completed order change persists. Check both
orientations and larger text, since row containers now use explicit total heights.

### Full Phosphor catalogue and drag frame cost

The founder confirmed swap flicker is fixed, but reported low FPS on the held row.
ReorderRow now uses a transform from a constant top: 0 layout anchor, preserving
stable siblings and shared preview/drop positions. Native drag FPS is not measured.
The icon picker now offers 1,512 Regular designs, Common/All browsing,
full-catalogue multiword search, and a bounded virtualized list outside the
editor ScrollView.

Phone acceptance pending:

1. Hold, wait for the menu, and drag slowly and quickly through several rows.
   Compare finger tracking, neighbour swaps, and drop; check no flicker returns.
   Repeat in landscape, with tall names/units, at scrolling edges, and Reduce Motion.
2. Open Icon → Icons. Common should be quick to scan. Search “acorn” or
   “stethoscope”; All icons should scroll through the complete catalogue. Test
   typing with the keyboard, landscape, larger text, and VoiceOver. Done and Close
   should retain their draft/save/discard behaviour without clipped controls.
3. Save an expanded choice, reload, Undo/Redo, and check grid/statistics/archive.
   Old icon choices remain valid; backup recipients need the expanded-catalogue build.

Automated: 92 tests, code checks, and iOS production export pass. Coverage adds
full catalogue/alias/category/multiword-search checks and uses an expanded icon
in the SQLite reopen/Undo/Redo/backup test. No UI automation was run; layout and
native FPS remain phone checks.

### Tabler and picker layout

Implemented: 5,166 Tabler Outline choices with attributed, generated local paths;
shared full-catalogue search; Common/All/Phosphor/Tabler browsing; Icons always
opens first; searching replaces browse filters with explicit all-icons/both-packs
status. Editor Icon/Colour controls share a compact row and wrap for larger text.

Automated: 95 tests cover both packs, complete Tabler glyph/attribute coverage,
namespace validation, habit search aliases, search overriding browse filters,
unique cross-pack identities, and Phosphor/Tabler SQLite reload, Undo/Redo,
archive restore and backup round-trips. Existing fixtures remain unchanged.
TypeScript, lint, formatting and iOS bundle export are required for this change.

Phone acceptance pending:

1. Open Edit for habits with no icon, emoji, and a pack icon. Icon/Colour should sit
   side by side; opening Icon always shows Icons without changing the current value.
   Check large text and landscape: controls should wrap and remain scrollable.
2. Common should include Yoga and other Tabler activities. Search “meditation” or
   “mindfulness” from Common and from Phosphor browsing. Both-pack results and the
   full search scope must be clear. Clear search to restore the previous filter.
3. Save Tabler Yoga, reload, Undo/Redo, then archive/restore and export/restore.
   Confirm the same choice and colour in grid, statistics and archive. Compare
   line weight against Phosphor. Exercise Done, Close, None and invalid emoji input.
4. Browse deep into All, select an icon, use the keyboard, and rotate. Check
   responsive scrolling, selected borders, fixed Done, and VoiceOver pack labels.

### Preset icons and fast drag swaps

The founder accepted the icons, requested preset assignments, and identified a
remaining fast-swap stutter. All 12 seed presets now have icons. Recognized
existing presets receive missing icons through normal v4 writes; user
choices/removals and renamed/custom habits are preserved. Drag swaps now publish
shared Y targets and keep preview order outside React state, avoiding a full grid
render per crossing.

Automated: 99 tests pass. New SQLite cases cover fresh/legacy/unrelated seeds,
unchanged seed/entries/order/archive state, preserving custom/removed icons,
reload, Undo without reapplication, Redo, backup, and failed-write retry without
duplication. Existing variable-height reorder geometry tests remain in place.
Native frame rate and appearance still require phone acceptance.

Phone checks:

1. Fully reload. Check icons on unchanged presets without custom choices. Existing
   choices and deliberate removals should survive. Undo a preset assignment, reload,
   and ensure it remains removed; Redo should restore it.
2. Hold a row until the context menu opens, then sweep quickly across several rows
   and reverse direction. Check finger tracking and neighbour transitions, plus
   slow movement and release immediately after a crossing.
3. Repeat with wrapped names, landscape, edge scrolling, Reduce Motion, multitouch
   cancellation, and backgrounding. Only completed drops should appear in History.

Founder follow-up: preset icons and fast-swap smoothness were confirmed working.
The selected habit-name background is now a subtle tint of that habit's colour
instead of grey. Spot-check the open context menu on several differently coloured
habits; the held/dragged row should retain its accepted appearance and motion.

### Statistics sample data

103 automated tests pass, including deterministic 180-day fixtures across DST/leap
dates, valid v4 replay, varied stats in all ranges, current/broken streaks, numeric
zero/gap/decimal coverage, in-memory isolation, Undo/Redo, reset, and rejected
sample restore. Code checks and an iOS production export pass. The exported
Hermes bundle was inspected for sample fixture/control markers: none are present
despite the local startup flag being true. The founder confirmed sample data and
populated statistics appear on the iPhone; detailed layout/interaction checks
remain.

Phone:

1. Fully reload with `EXPO_PUBLIC_DEV_MOCK_DATA=true`. SAMPLE DATA should replace
   the brand label, and all presets should contain mixed entries across six months.
2. Tap Read for numeric charts and improving totals; Drink water for decimals,
   zeros and missing days; Go for a walk for a current streak; Meditate for a gap.
   Inspect chart buckets, 30/90/year/all ranges, weekday patterns and past months.
3. Edit a sample value and try Undo/Redo. Reset sample data in Settings to discard
   those edits. Turn Sample data off to verify your real entries and settings return.
4. Backup controls should be absent in sample mode. History and archive status
   should identify sample changes as temporary. Test larger text and landscape.

### Animated Today and editable statistics calendar

- All 105 tests pass, including matching calendar/grid entry targets across time
  zones, daylight-saving transitions and leap days; dated corrections, zero/clear,
  future exclusion from statistics, and Undo/Redo are covered.
- TypeScript, ESLint, formatting, and the iOS JavaScript/Hermes export pass.
- UI-thread animation, interruption/rotation, Reduce Motion, calendar touch and
  VoiceOver behaviour await the founder's physical-iPhone check.

Checks (device acceptance pending):

- Scroll several weeks into history and tap Today: a quick continuous return,
  with date headings and entries aligned. Repeat from future dates, then pull
  again to confirm the future boundary has returned without losing any entries.
- Interrupt Today with a horizontal drag; the gesture takes over. Rotate during
  a return and test with Reduce Motion enabled. No stale completion should reset
  a newer gesture or navigation.
- Open a checkbox habit's stats and tap past/current/future days in its calendar.
  Check/uncheck should update immediately; future records remain outside totals.
- In numeric stats, tap a day and save a decimal, zero, then clear it. Cancel an
  edit too. Verify the dialog date, main-grid value, charts, and History/Undo/Redo.
- Repeat in landscape and with VoiceOver/larger text. Calendar padding is inert;
  only actual day cells record. Real-mode edits should survive a reload; sample
  mode edits remain temporary by design.

### Statistics polish

- All 105 existing tests, TypeScript, ESLint, formatting, and iOS bundle export pass.
- No storage/calculation changes or new dependencies. Chart selection and calendar
  contrast/border changes are UI behaviour, requiring the phone checklist below.
- No browser visual check was done.

Checks (device acceptance pending):

- Select a chart bar, tap it again, and select another then use Clear. All bars
  return to normal emphasis; inspection controls should not shift nearby content.
- Inspect a missing or zero period. Switch range and verify selection clears.
  Try VoiceOver previous/next period and Clear selection actions.
- Check long date ranges spanning a year boundary and numeric units; zero belongs
  to the value axis, not the rightmost date label.
- Monthly cells have no Today/selection border. Small numeric totals and zero
  retain readable date text. Checkbox toggles and numeric editing still work.

### Grid performance pass

- 110 tests pass, including exact cached-colour parity, date identity preservation,
  selected entry/heading notifications, numeric zero, Undo/Redo, restore and
  unsubscribe.
- TypeScript, ESLint, formatting and iOS JavaScript/Hermes export pass. Metro serves
  the new selectors/palette code and the locally enabled timing flag.
- Synthetic CPU benchmarks and their limits are recorded in PERFORMANCE.md.
  Native frame/interaction measurements remain pending.

Checks (device acceptance pending):

- In sample mode, rapidly check/uncheck five habits; then edit numeric zero/clear
  and use Undo/Redo. Only the edited cell and relevant date heading should change.
- Fling through several months in both orientations, return to Today, and reveal
  future dates. Check for blank columns, alignment problems and late taps.
- Repeat from statistics, return to the grid, change a colour, reorder, archive
  and restore. New memo boundaries must not leave values, colours or order stale.
- Test real-mode save/reload and failed-save disabling/retry. Capture development
  timing as described in PERFORMANCE.md; compare without timing enabled and in
  a release build before claiming native performance acceptance.

### Fast-fling loading structure

- 113 tests pass, including fractional/inverted placeholder alignment, portrait
  and landscape geometry, future/past edge masks, and viewport-sized batch budgets.
- TypeScript, ESLint, formatting and the iOS JavaScript/Hermes export pass.
- Native fallback visibility, memory at long ranges, and perceived fill speed
  remain unverified until the physical-iPhone check.

Checks (phone acceptance pending):

- Rapidly fling across months using both the body and headings. Any gap should
  retain correct dates and aligned muted dashes until actual entries render.
- Reverse direction, tap Today from past/future, rotate and use larger text.
  There must be no date mismatch, doubled labels, or placeholder showing through
  a loaded checkbox/number. Header dragging must remain available.
- Edge rubber-banding must not show dashes for unopened future/out-of-range days.
  Future reveal must still continue smoothly with the existing border streak.
- Loading dashes must not accept entry taps or appear as controls in VoiceOver.
  Once loaded, rapid toggles/numeric entry and row reordering must still work.

### Start dates, row spacing and statistics pull dismissal

- Create checkbox/numeric habits: no extra heading; date defaults to local Today.
  Change it to a previous month using the native date control, save, reopen and
  reload. Check keyboard, landscape and large-text layout. Close discards drafts.
- Backdate an existing habit, fill days in its statistics calendar, and verify
  rates/totals. Move the start forward: older entries remain in the grid but no
  longer count. Move it back, then Undo/Redo and reload; records return to metrics.
- At the top of statistics pull down and release; a deliberate pull dismisses
  to the same grid position. Short pulls and reversing before release cancel.
  Fling back from deep content: reaching the top must not dismiss. Try Reduce
  Motion, ordinary Back, editing and calendar taps.
- Settings → Row spacing: compare Compact, Standard and Roomy with numbers,
  wrapped names, large text, landscape, horizontal scrolling and reordering.
  Names, dates, checks and loading dashes must stay aligned. Real-store reload
  preserves the selection; sample-mode changes remain disposable.
- Undo a habit action, change spacing, then Redo: preferences must not consume
  the redo branch or appear in History. Export/restore a v5 backup and confirm
  both spacing and dates; retain a pre-restore copy as usual.

Automated coverage includes v1–v4 fixture upgrades without mutation, v5 fixture
replay, native SQL repository reload, date/preference validation, date editing
with Undo/Redo, archive-aware statistics, font-scaled minimum heights and pull
threshold/reversal rules. These do not establish native gesture or picker quality.

**Superseded:** Compact/Standard/Roomy row spacing, replaced by the v18 Rows
slider with Auto (9 October). The custom statistics pull was replaced by the
native page sheet on 5 October.

### Display preferences

Follow [SETTINGS.md](SETTINGS.md) for column-density, fading, week-order,
large-text and native scrolling checks. Confirm both orientations retain
header/body/loading alignment after changing density, including away from Today.
Real-store reload and v6 export/restore should retain all preferences without
changing History/Redo.

**Superseded:** column density, replaced by the v18 Day columns slider.

## 5 October 2026

### Habit descriptions

Native acceptance is pending; a successful bundle does not verify the keyboard,
nested full-screen modal presentation, Markdown touch targets or screen-reader flow.

- Reload Expo Go. In sample mode, each preset has fictional Markdown notes; in the
  real store older habits receive undoable placeholders once. Existing notes,
  entries, positions and archived habits must remain intact. Example links should
  be obvious placeholders. Undo a placeholder, reload, and confirm it stays absent.
- Add a habit: open Description, write text and a link, Preview, then Done. The
  creation dialog shows a compact summary. Outer Close creates no habit/history
  action; outer Done saves both. Repeat editing an existing habit; inner Done must
  not apply until outer Done. Colour-only dialogs must not discard unrelated drafts.
- Tap a name: notes appear before charts. Short notes fit without a Read more
  control; long paragraphs/lists can expand and collapse without blocking access
  to statistics. Try portrait, landscape and large text. Links open only when
  tapped and invalid/unavailable app links report errors. No remote images load.
- From statistics use Edit/Add description. Try typing, selecting text, toolbar
  shortcuts and scrolling with the keyboard. Formatting stays live. Close/Done
  stay visible. Close changed text asks before discard; Done saves one undoable
  action. Blank text clears the field. Try a long note near the character limit.
- Apply a note, force quit/reopen, then Undo/Redo. History shows Description edited
  or cleared. Tap its row, compare Before/After and restore an older/empty version.
  Restore changes only the description, preserving current name/colour/icon/date,
  entries and archive status. Undo/Redo the restore. Archive/restore retains notes.
- Leave writing unfinished for at least a second, background/force quit/reopen and
  re-enter its editor. Recover the draft. Change the saved note through Undo before
  opening an older draft: choose between current saved text and recovery. Discard
  should not return after reload; applied text must remain separate from unfinished
  writing. Abrupt termination before a debounce write can lose recent keystrokes.
- In the real store export a v8 backup, edit descriptions and restore with the
  existing confirmation. Applied notes and History survive; unfinished drafts are
  excluded, and a pre-restore copy remains. A retained conflicting draft prompts
  instead of silently replacing restored text. Sample mode cannot change real notes
  or drafts; sample notes/drafts disappear on full reload.

Automated tests cover Markdown/token/link rules, preview boundaries, selection
shortcuts, strict v7 validation, legacy v1–v6 imports without mutation, native SQL
reload/Undo/Redo/archive/clear/backup, failure rollback/retry, placeholder protection,
serialized draft writes/discard, draft validation and separate memory sample drafts.

**Superseded:** the separate Preview step (formatted text is now edited
directly, with no Write/Preview switch) and the notes-before-charts card (the
Notes/Statistics sheet now shows the full note; see the tab entries below).

### Live description editor and statistics checks

On 5 October 2026 the founder confirmed improvements to repeated formatting
selection and bottom-link-sheet spacing on the iPhone. Broader keyboard,
landscape, larger text, VoiceOver and draft recovery checks remain pending:

- Open a description from statistics and creation/Edit. Formatted text is directly
  editable without Write/Preview. Select words, apply Bold twice, and try local
  Undo/Redo. Confirm typing after Undo clears local Redo and app History is unchanged
  until Done. Save immediately after typing; the final keystroke must be retained.
- Try headings, lists, quotes, links and all highlight colours. Change/remove a
  highlight; remove a link while preserving its text. Reopen, reload, use app
  Undo/Redo and export/restore: native reading and History comparisons must agree.
- Keep a phrase selected while applying Bold, then a highlight and another colour.
  Repeated native draft/status updates must not move the selection to the end.
  Open the bottom link sheet: address focus, Cancel/Apply padding and accessible
  actions must remain usable above the keyboard, including landscape/larger text.
  Cancel/outside-tap must restore the selection; Apply must keep the link selected.
- The formatting strip sits at the bottom, above the keyboard during typing.
  Open text/highlight menus at different scroll positions: the document must not
  jump or resize. Rotate and increase text size with a menu open; its options
  must stay reachable by scrolling. Try Reduce Motion, menu toggle and Escape.
- Select a phrase, use iOS Paste with a copied HTTPS or app-note URL, and check
  that the phrase and formatting stay intact while becoming a link. Local Undo
  should remove just that link change; Redo restores it. Try changing an existing
  link by pasting another URL. Pasting normal prose, into code or at an empty
  cursor must retain normal paste behaviour. The link sheet still works.
- Select plain, uniformly highlighted and mixed text; the existing Highlight button
  must show neutral, that colour or mixed respectively without extra toolbar width.
  VoiceOver must identify the state, and the palette must agree.
- Tap link text while editing: a compact inspector must show the address without
  opening it. Try Open, Edit, Remove and Close with the keyboard visible and in
  landscape. Edit/Remove must include bold/italic portions of one link, preserve
  the label/other marks and support local Undo/Redo. Close must keep the caret and
  stay dismissed while typing there; leaving/re-entering restores inspection.
- Apply two different notes, then use Versions beside Edit in statistics. Read
  Before/After and restore older text. Name, colour, icon, start date and entries
  must remain intact. Restore is undoable in History and survives reload/backup;
  Undo/Redo remove/restore version rows. Repeated saved text retains its Before
  reader, and clearing the note must leave Versions available. Verify only the
  latest applied matching row says Current and current Restore is disabled.
- Select styled linked words and use Text options → Clear formatting. Links and
  labels must remain while styles clear; surrounding styles stay intact and local
  Undo/Redo restores them. At a caret, subsequent typing keeps the destination
  and loses the cleared style marks.
- Open a long note, select a phrase, scroll, Done and reopen. Check cursor/selection
  and scroll restoration, then reload and repeat. Test Close without changes,
  recovering an interrupted draft, both orientations and larger text. Initial
  keyboard resizing must keep the remembered position; interacting must stop
  automatic restoration. Format once after recovery to prove selection retention.
- Discard changed text: applied text/bookmark must survive. Restore a different
  note version: stale positions/clean buffers must not replace it or trigger a
  false unsaved-draft alert. A genuine conflicting unfinished draft still offers
  recovery. Repeat in Add/Edit and apply outer Done; the position must transfer
  to the created/edited habit. Outer Close must leave applied text alone.
- In Versions or History, open a description action and switch Before/After.
  Changed passages must be marked and unchanged ones quiet, including insertions,
  removals, formatting-only and link-destination changes. Lists/code stay intact
  and links still open. Changes off shows the original text without markers or
  layout jumps. Try long notes, large text and VoiceOver passage indicators.
- The note card now previews four complete blocks within a taller 220-point
  height limit. Short notes that fit need no Read more. Long paragraphs/lists
  remain bounded and expanded notes still offer Show less.
- Test keyboard selection, typing/scrolling, toolbar hit targets, link entry, Close
  discard, recoverable drafts, portrait/landscape, larger text and VoiceOver.
  Done/Close must stay reachable and text must not disappear behind the keyboard.
- Check checkbox rates and numeric averages against a short known start period.
  Four days with totals 10, blank, 0, 20 means 7.5/day and three recorded days.
  Editing another habit must not affect these results. Future entries and entries
  before the start remain saved but outside statistics.

**Superseded:** the note card bullet. The Notes/Statistics sheet now shows the
full note directly.

### App-wide text size and comparison navigation

- In Settings → Text size try 85%, 100% and 150% in portrait/landscape, and combine
  with iPhone Larger Text. Check the home heading, row names/numbers, date columns,
  statistics calendar/charts, history, habit/icon/colour menus and text inputs.
  Rows/columns should gain space; buttons must remain readable and tappable.
- Open a description with the keyboard visible. Text, outline toolbar icons, link
  fields and floating menus should scale consistently, wrap/scroll when needed
  and keep Done/Close available. Reset restores 100% without changing OS settings.
- Reload real data and export/restore a v8 backup. Text size persists without
  appearing in History, consuming Undo or clearing Redo. Sample preferences remain
  isolated and session-only. Older v1–v7 backups resolve absent text size to 100%.
- Make separated edits in a long note and open Before/After. Next change should
  navigate through changed passages and wrap. Try both tabs, repeated taps, a
  manual drag during navigation and a distant unmeasured passage. Closing must
  cancel retries. Reduce Motion should navigate without animated scrolling.

Automated coverage includes scale validation/nested styles and grid geometry,
v8 replay/reload/backups/rollback/retry, legacy-prefix preservation and navigation
cycling/cancellation. These checks do not establish native clipping or frame rates.

### Global preview capture and native statistics sheet

- Fully reload Expo Go after adding expo-sensors. On the grid, a colour/icon
  picker, statistics, description editor (keyboard open), Versions and a
  link/highlight menu, gently turn the phone face down until a tap, then back
  toward you within four seconds and pause. Each gesture should save one settled
  screen without a success popup. Check `.dev/previews/latest.png`.
- Rotate normally, shake, briefly flip, leave face down longer than four seconds
  after arming, background/resume, and repeat during an upload. These must not
  cause unexpected or overlapping captures. Sensors are foreground/dev-only.
- Stop the receiver, capture, and verify a clear network error. Restart it and
  choose Retry: the saved PNG should show the original menu, not the error alert.
  Test the title/accessibility shortcut and Settings → Development → Share preview
  fallback. Receiver/transport/motion tests use temporary synthetic images, not
  real data.
- Tap a habit: statistics enters upwards in an iOS page sheet. Drag the header or
  pull content down at the top; compare with Settings/History. Short/reversed
  drags should cancel naturally. Deeper scrolling, checkbox toggles and chart
  selections should work without dismissal. Check both orientations and Reduce Motion.
- Edit a numeric calendar cell, description, Versions and habit details from
  statistics. These must present above statistics and return to it. Close/swipe
  statistics must restore the grid's dates/scroll position. Save errors/retry stay
  visible; edits/history/archive behaviour must remain intact.

Release exports must contain no global preview listener, accelerometer preview
code, capture/upload code, receiver address or token even with the env flag on.
Expo Sensors may remain a linked native dependency; this test verifies release JS
exclusion rather than native binary stripping. Native gesture/capture acceptance
remains pending until observed on the physical iPhone.

Verification for this change: `npm run check`, all 198 `npm test` cases, seven
`npm run test:preview` receiver cases, iOS export and web export passed. The
focused receiver/transport/motion suite passed all thirteen cases. An
authenticated receiver health check returned 200/ready. Four iOS release assets
were inspected with the preview env flag on: RNViewShot, preview upload
messages, motion listener, ExponentAccelerometer, configured URL and pairing
token were absent. Checks/bundles ran under a 2 GB Linux cgroup and one bundler
worker. These are not physical-device performance or gesture acceptance results.

The founder subsequently confirmed the face-down gesture works and the statistics
sheet looks good on phone. A new 1206×2622 PNG arrived and was opened successfully.
They asked for stronger preview haptics: the final implementation uses one heavy
arming impact and two heavy save impacts 110 ms apart, without waiting before
capture/upload. This final strength remains a subjective device check.

### Settings redesign, statistics and hidden completed habits

- Reload Expo Go. Settings should open a short grouped index. Open Appearance,
  Daily tracking, Backups, Development and Archived habits; verify Back/Close,
  safe-area spacing, portrait/landscape, 150% app text and larger system text.
  Development/sample/preview tools must not crowd the main index.
- In sample statistics inspect a checkbox and number habit. Notes remain first;
  summary counts/totals, date range, compact streak rows and charts should read
  naturally. Select/clear chart bars and edit calendar days; ranges and calculated
  values must retain their previous meanings. Check empty/future-start habits.
- Hide completed today defaults off. Enable in Daily tracking: checked checkbox
  rows hide at Today; numeric totals/zero remain visible. Show completed reveals
  rows for correction/statistics, Hide completed resumes filtering. Other viewed
  dates show the full list. Returning to Today resumes hiding. Next local day
  must use that day's checks rather than yesterday's.
- Reorder while some rows are hidden, with an archived habit present. Reveal and
  restore the archive: hidden/archived saved slots must be preserved. Undo/Redo
  the reorder, and Undo a check through History to reveal that habit again.
- In real data reload and export/restore a v9 backup: hiding persists outside
  History/Undo, preserves an existing Redo and does not split rapid-toggle groups.
  Sample mode stays separate. Save failure/retry remains visible on all detail
  pages; a failed preference transaction must retry once without duplicate events.

**Superseded:** "checked checkbox rows hide; numeric totals remain visible".
Since success goals (6 October), Hide completed hides any habit meeting its
effective-dated goal at Today; Track only habits stay visible.

Automated coverage includes completion rules and calendar scope, selector
notification isolation, displayed-subset ordering, v9 validation/reload/backup/
rollback/retry, unchanged legacy fixtures and Undo/Redo preservation. Native
layout, gestures and animation remain physical-device checks.

The founder confirmed the grouped Settings/statistics layout is better and
hide/reveal feels right; three native previews were inspected. Final text cleanup
adds labelled info disclosures: check that they expand/collapse, announce expanded
state and remain readable at larger text. This interaction and the complete
reorder/restore/rollover matrix above are still device checks.

Final verification: `npm run check`, all 208 `npm test` cases, one-worker iOS
export and one-worker web export passed. An isolated headless Chrome preview
exercised Settings navigation, hidden development controls in release, info
expand/collapse, hiding/revealing completed habits and both habit statistics
screens. Nine web captures cover portrait, landscape and 150% text; larger-text
range buttons were adjusted to wrap. Tests/bundles used a 2 GB Linux cgroup,
Chrome a separate 1 GB cgroup, and test processes retain their 256 MB heap cap.
These results do not establish native frame rates or replace the remaining
phone matrix above.

### Large-note viewing/editing and compact Notes experiment

**Superseded:** this compact-card experiment was replaced the same day by the
Notes-first tab trial and then the floating Notes/Statistics switch (below).

Use Sample data and fully reload/reset it. Test Go for a walk (1,874 characters),
Read (7,723), Meditate (17,657), in that order. Real saved notes are not changed.

- Tap each habit for statistics. The Notes card must remain a compact three-line
  excerpt; opening should not become slower because hidden content was rendered.
  Check empty notes, long first paragraphs, code and long single lists as well.
- Open note, scroll deeply and quickly both ways. Paragraphs, highlights, nested
  lists, continued ordered numbering and intentional link taps must remain intact.
  Return to statistics with its previous scroll/range preserved.
- Edit from the card and from the reader. Type near the start, middle and end;
  select words, toggle formatting, use links/highlights and local Undo/Redo.
  Editing from the reader must open above it and return to its existing position.
- Type and immediately tap Done or Close, without waiting for draft reporting.
  Done must retain the last keystroke; Close must compare the actual current text.
  Open/close or Undo to the original must preserve original Markdown bytes.
- Type continuously for several seconds, background/reopen, and recover drafts.
  Also background immediately after first typing. Check position restoration,
  matching text and visible draft failures. Abrupt kills before report/write
  completion may still lose recent input; do not describe these as synchronous saves.
- Try 150% app text, Larger Text, keyboard and landscape. Share statistics and
  reader/editor previews via the global face-down-and-back gesture. Evaluate
  the compact-card/full-reader arrangement as a trial; the founder is undecided.

Automated coverage checks bounded excerpts, full passage retention/numbering,
long-list rows, cache eviction, exact serialization parity and original-byte
Undo, atomic length rejection, quiet/deadline/flush/cancel reporting, and isolated
progressive sample notes. All checks use existing process memory/time caps.

Verification: `npm run check`, all 218 `npm test` cases, and
one-worker iOS and web exports passed. An isolated headless Chrome session
opened statistics, the full reader and the nested editor for all three note
sizes. Typing followed immediately by Done retained the inserted text in each
case and returned to the reader. Twelve web captures were saved; the longest
note's statistics, reader and editor views were visually inspected. These
are web integration/layout results, not iPhone timing or native-modal evidence.
The physical-device checks above and the founder's judgement of the trial
layout remain pending. Checks used the existing 2 GB Linux scope, Chrome a
separate 1 GB scope.

### Notes-first tab trial and first editor opening

The founder confirmed long-note reading feels instant on all three samples, but
reported a black scroll position on the first Read/Meditate editor open. They
authorised Notes/Statistics tabs to keep the full note one habit-name tap away.
This supersedes the previous compact-card access test.

- Fully reload Sample data to clear its temporary bookmarks. Tap Walk, Read and
  Meditate: full Notes must appear directly with the common Close/Edit header.
  Open a habit without a description: Statistics is selected initially; Notes
  offers Add a note. Close or native downward dismissal returns to the grid.
- Scroll deeply in Notes, switch to Statistics, select a range/chart/month and
  scroll. Switching both ways must preserve each panel's position and selections.
  Inactive content must be absent to VoiceOver and never capture taps.
- On the first Edit after reload, caret and viewport should both start at the
  beginning, with no black region or jump when the keyboard appears. Brief
  startup shows Opening editor. Existing matching-text bookmarks should resume
  on later opens, including a deep editing position. Deliberate scrolling must
  cancel initial resize restoration. Check keyboard closing/rotation/large text.
- Type and immediately Done; check the final keystroke, note history/Versions and
  undoable restore. Check numeric calendar editing from Statistics and editor
  overlays from Notes still open above the same sheet and return correctly.

**Superseded:** the top tabs. The floating bottom switch with horizontal swipes
(next entry) replaced them.

A focused long-document regression test covers first-open caret/viewport alignment,
keyboard/content resize restoration, cancellation after user input, unchanged
Markdown and absence of a spurious Undo step. Existing tests retain matching
bookmark initialization across changing native callback proxies.

Verification: `npm run check`, all 219 tests, one-worker iOS and web exports
passed with the existing process memory caps. An isolated Chrome session exercised
all three sizes: Notes selected initially, note scroll and Statistics range
retained across switches, first editor caret/viewport at zero, no outer-page
scroll, immediately typed text retained by Done, and a 900-pixel editor bookmark
restored on reopening. An empty-description habit opened Statistics and offered
Add a note in Notes. Portrait, landscape and 150% text captures were generated;
selected views were visually inspected. Tab selection and inactive-panel hiding
also have explicit ARIA properties for web alongside native accessibility state.
These results do not reproduce an iPhone keyboard or establish native startup
latency. The founder confirmed first editor opens now start correctly without
the black jump on the iPhone. Perceived startup time and the wider
resume/keyboard matrix remain physical-device checks. They reported that tab
access/switching needs refinement; specifics and the wider phone matrix remain
pending.

### Floating habit switch and horizontal swipes

- Tap a habit: Notes is first if present, Statistics if empty. The compact
  floating island is near the bottom above the home indicator, with no top tabs.
  Check portrait/landscape and 150% app plus Larger Text. Read to the final line,
  then open Statistics guidance at the bottom: all content must scroll above it.
- Swipe left from Notes to Statistics, right to return. Slow partial drags should
  follow the finger and settle naturally. Small drags return to the same page;
  rapid swipes cannot go past either end. Island taps scroll to the matching page.
- Vertical/diagonal reading should remain vertical once locked. Swipe across a
  link, chart or calendar: it must not accidentally follow a link, select a bar
  or record a day. Normal taps must retain those actions. Native downward sheet
  dismissal at the top and Close must still work.
- Deeply scroll both panels, select range/bar/month and switch by both methods:
  positions and selections remain. Rotate on each page and during a swipe; the
  selected page should align with its new width. Inactive content stays hidden
  to VoiceOver. Tabs remain the accessible alternative to the gesture.
- Selection haptics should happen once per changed page, with Haptics off silent.
  Routine vertical scrolling stays quiet. Reduce Motion removes animated tab-tap
  scrolling, retaining interactive native paging. Edit/Versions/numeric dialogs
  must still open above the habit sheet and return to the selected page.

No storage/event schema changed. Native direction arbitration, gesture feel,
rotation during momentum and safe-area reachability require physical-device QA;
web captures/checks do not establish iPhone behaviour or frame rates.

Bounded Chrome checks passed on the three isolated sample notes: bottom control
placement and 44-point minimum tab targets, tab-tap alignment, retained note
positions and 90-day range, vertical touch scrolling, both horizontal touch
swipes, and Statistics-first positioning for an empty note. Layout captures
covered portrait, landscape and 150% app text. The final Meditate passage at
150% in landscape cleared the floating island by 41.5 pixels. Virtualized note
rows were allowed to finish measuring before checking end clearance; a single
jump to the estimated end is not a valid final-line test. These browser results
do not validate native gesture arbitration, OS Larger Text or device speed.

Validation: `npm run check` passed without warnings, `npm test` passed all 219
tests, and single-worker iOS and web exports succeeded. Checks/exports ran
sequentially in a 2 GiB memory/no-swap scope; the isolated Chrome review used a
1 GiB memory/no-swap scope. No dependencies or storage formats changed.

### Native habit-panel layout event regression

Opening the floating-switch habit panel produced a null-layout exception in the
connected iPhone Hermes console. `scripts/habit-panel-layout.test.mjs` extracts
and executes the actual two panel layout callbacks under bounded VM evaluation,
clears each native event, then applies deferred state updates. It covers initial
measurements, rotation, increased switch height and unchanged measurements. The
previous committed code fails with the same error; copying height during the
handler fixes it. The test compares primitive dimensions only, with no DOM graph
or native data. Verify opening Notes-first and Statistics-first habits, tab
switching and rotation after reloading Expo Go.

Validation after the fix: `npm run check` passed without warnings, all 220 tests
passed, and the single-worker iOS export succeeded under the existing 2 GiB
memory/no-swap scope. The founder confirmed the panel-opening fix on the iPhone
("All good now"). This does not establish the wider gesture/accessibility matrix.

### Categorical and free-text records

- Add a categorical habit, configure several names and optional short labels.
  Category editor Done returns to the draft; habit Done persists it. Close either
  editor must discard the appropriate draft. Rename and archive/restore an option;
  earlier records retain it, and archiving every option is prevented.
- Select several categories on one day, Done, reopen and reload. All selections
  must survive. Changing several options before Close saves nothing. Clear entry
  requires Done. Repeat in past/future grid dates and the statistics calendar.
- Add free text, enter short words and a multiline paragraph, apply/reopen/reload.
  Newlines and full text must survive even if grid preview is truncated. Close
  discards edits. Blank text clears, while explicit numeric zero still records.
- Try grid text at Compact/Standard/Roomy row/column spacing, portrait/landscape,
  85–150% app text and OS Larger Text. Letters must keep their configured
  size rather than squeeze to fit. Compact/Standard normally show two lines,
  Roomy three; wider columns reveal more text with native tail truncation. Full
  values remain available to the editor/accessibility. Browser captures cannot
  prove native text-fit or keyboard handling.
- Undo/Redo entries, corrections and option edits after reload. Export/restore
  both kinds with the normal confirmation/recovery copy. Older v1–v9 archives
  remain readable; v10 cannot be disguised in an older container.
- Statistics show recording, not completion. Category counts can overlap. Future
  and pre-start values are excluded from metrics but kept. Other habits must not
  affect denominators. Hide completed today must not hide new types until rules
  exist. Statistics/nested editors and main-sheet dismissal remain usable.
- Sample data has Workout/Highlight examples without adding them to the real
  list. Reset/reload the isolated sample to see both.

**Superseded:** Compact/Standard/Roomy spacing (now the v18 sliders, where line
count follows row height), and the Hide completed exclusion for new types (goals
on 6 October gave all four types completion rules).

`entry-types.test.mjs` exercises real SQLite round trips, multiselect corrections
after serialization/reload, net-zero grouping, Undo/Redo and preferences, backups
and atomic recovery, malformed/version/type rejection, stable option changes and
archival, per-cell subscriptions, recording calculations, bounded text and the
unchanged v9 prefix in the v10 portable fixture. The existing legacy suites and
fixtures remain part of full verification.

Validation: `npm run check` passed without warnings, all 229 tests passed, and
single-worker iOS and web exports succeeded within the existing 2 GiB memory /
no-swap scope. The release iOS bundle excludes the new sample-record identifiers
and preview capture module. No dependencies were added.

An isolated bounded Chrome review covered multi-selection, Done/Close, exact
multiline text and reload, new habit creation, option renaming/archival, recording
statistics and calendar editing. Layout captures covered portrait, landscape and
150% app text; an archived selection remained available after draft deselection.
The founder confirmed on the iPhone that multiple categorical selections persist
and Done/Close work. The initial 80% text fit felt too small; the revised trial
uses a 95% minimum and a 32-character preview cap. Native font fitting after this
revision, text keyboard placement, OS Larger Text and the remaining phone matrix
still require device review.

**Superseded:** the 95% minimum font scale. React Native's iOS renderer ignores
that floor, so text and category cells no longer autosize (next entry).

### Readable cell text after the native autosizing report

The founder reported unreadable compression of the sample phrase “A quiet
afternoon with a friend” despite the proposed 95% floor. Installed/upstream React
Native 0.86.3 Fabric iOS source ignores `minimumFontScale` in this autosizing
path. Text/category grid and calendar values now disable native autosizing and
use tail truncation. Grid line capacity follows measured height and combined
text scale (1–3 lines).

`grid-entry-text.test.mjs` executes the actual grid fitting prop expression with
text/numeric contexts: the former unconditional fitting fails the regression.
It checks the calendar avoids the same path and that line capacity fits actual
row geometry across app/system scale and spacing combinations, without DOM graphs.
`npm run check` passed, all 231 tests passed, and single-worker iOS/web exports
succeeded in the existing bounded memory scope.

An isolated Chrome review used all three sample phrases at 100%/150% app text
with Compact/Standard/Roomy rows and columns. It verified identical letter sizes
for every phrase (12/18 points respectively), two versus three-line capacity, and
captured layouts. This establishes web layout only; the revised iOS
truncation/readability requires phone acceptance.

### Settings appearance responsiveness

The founder reported slow row/column option feedback with the grid hidden behind
Settings. `grid-preferences.test.mjs` exercises the actual presentation hook in
bounded React/jsdom, checking immediate current Settings values, unchanged grid
render counts/font context while deferred, one latest-value update on dismissal,
retained mounted scroll state and no extra update after reverting choices. It
executes App's actual dismissal handler to cover a closed sheet and stale callbacks
after reopening. Assertions compare scalars/identity booleans only; the DOM is
closed in `finally`. Grid storage/entries remain live, with no new schema.

Validation: `npm run check` passed, all 233 tests passed, and single-worker iOS/web
exports succeeded in the existing 2 GiB memory/no-swap scope. An isolated 1 GiB
Chrome review verified saved preferences and immediate selection highlights,
unchanged hidden cell identity/width/height/font through several spacing choices
and a real text-size slider release, then final geometry on Close/dismissal.
Reopening/closing without edits retained the columns. Browser checks are not
iPhone timings.

Phone checks: tap repeatedly between spacing choices in Appearance; highlights
and haptics should respond promptly. Try text size/fading, then Close and repeat
with native downward dismissal. Check the final row heights, column widths,
header/cell alignment and readable text. Repeat while browsing past/future days,
with larger OS text and landscape; return should retain the viewed date/range.
Force a save failure through the existing test harness to confirm Settings still
shows Retry and blocks changes appropriately. Preferences remain outside Undo.

## 6 October 2026

### Archived-habit deletion

- Archive a habit with several recorded days, notes and goals. In Settings →
  Archived habits, check separate Restore/Delete buttons. Delete must name that
  habit and count in the native confirmation. Cancel keeps the row and values.
- Confirm Delete: that row disappears, other rows retain order, and saving remains
  visible. History shows a named Habit deleted action and earlier named entries.
  Undo returns the habit with its full notes/goals/entries to its archived slot;
  Restore returns it to the grid. Redo deletion removes it again.
- Reload after Delete and after Undo, then repeat. Test checkbox, numeric zero,
  multiple categories, free text, no recorded days, and the last remaining habit.
  An empty store must stay empty rather than reinitialize samples.
- Export/restore a v12 backup containing deletion, then Undo. Every record must
  return, and the pre-restore recovery copy must remain available. Earlier changes
  remain in exported logs: Delete with Undo is not permanent erasure.
- Try portrait/landscape, 150% app text, OS Larger Text, VoiceOver and Reduce Motion.
  Actions and confirmation must be readable/reachable. Check sample-mode deletion
  stays temporary and real data is untouched. Failed writes must show Retry and
  block new deletes/restores; retry must save exactly once.

`archived-deletion.test.mjs` covers real SQLite file reopen, all entry types,
complete definition snapshots, Undo/Redo, empty stores, stale confirmation,
exact record/index/inverse validation, atomic rollback, uncertain-commit retry,
serialized structural changes, preference Redo, History labels, native/web
confirmation callbacks, backup recovery and unchanged legacy fixture prefixes.
Phone presentation/gesture/accessibility checks remain pending.

The full working-tree integration passed 259 tests, static checks, seven preview
receiver tests and single-worker iOS/web exports. Browser checks passed cancel,
one-event deletion, reload, History Undo and 100%/150% portrait/landscape layouts.
The committed change was also verified in isolation from the then-unfinished goal
feature. Native confirmation, layout and accessibility remain phone checks.

### Success goals and timeline

The goal suite exercises numerical boundaries/zero versus absence, categorical
multi-selection/exclusions, normalized literal text, dates and policy changes,
weekday opportunities/streak grace, numeric calendar averages, category identity,
strict malformed timeline validation and threshold-only grid notification. Real
Node SQLite tests cover serialized changes, reopening, Undo/Redo, export/restore
and an atomic pre-restore copy. The v11 fixture extends the exact unchanged v10
prefix; memory sample goals preserve original preset events.

Browser interaction checks cover Statistics → Success, new target from Today,
retained old versions, canceled version drafts, reload persistence, category
All/exclusion/weekday controls and test values, phrase matching, staged creation
and parent Close cancellation. Portrait and landscape layouts are inspected.
These checks do not prove iPhone gesture, keyboard or performance behaviour.

Final automated pass: `npm run check`, all 259 tests, iOS bundle export and web
export passed under bounded memory scopes. Extended browser checks also covered
rejecting/accepting earlier-result confirmation, a future version retaining the
current Today version, and 150% text size. Release bundle inspection found no
sample-goal identifiers/helper or DevPreviewCapture module. Phone acceptance below
remains pending; these are not App Store or native interaction acceptance claims.

Phone acceptance remains pending:

- Read's sample timeline starts with 15 minutes, changes to 30 fourteen days ago;
  add 35 from Today and confirm older results/values remain intact.
- Undo/Redo the goal after reloading real data; export/restore retains every
  goal version and weekday schedule without altering dated values.
- Edit an earlier version, cancel its confirmation, then accept a correction;
  only that policy period changes evaluation. Remove/Undo restores it.
- Compare at-most/exactly-zero with a blank day, and test category All/count/
  exclusions, case/whitespace in text, and Track only.
- Off-day records remain editable; off-days bridge success streaks. Hide completed
  today respects explicit success goals and Show completed allows corrections.
- Test nested sheets, Apply from date picker, Done with keyboard visible,
  VoiceOver labels, portrait/landscape and 150% plus system text scaling.

### Checkbox feedback and goal editor refinement

The two phone previews exposed inconsistent completion feedback: checked checkbox
cells lacked the tint already used by other completed habits, and the goal test
looked like static text. All four types now share completion tint; the optional
Try a value panel has a real, labelled checkbox and a separate result.

`npm run check`, all 262 tests, and single-worker iOS/web exports pass within a
2 GiB memory/no-swap scope. New focused coverage exercises numeric draft parsing
and specific validation messages, plus checkbox scheduling through SQLite reopen,
Undo/Redo, completion filtering and statistics. Old log prefixes remain unchanged.

An isolated browser with synthetic data verifies check/uncheck tint, the test
checkbox, unchanged Done without a new event, schedule edits/Undo, Hide completed
and Show completed, direct editing, timeline draft retention and discard
confirmation, numeric range errors, category count/exclusions, text matching,
reload, historical correction confirmation and preserving Today when scheduling
a future version. Portrait, landscape and 150% text layouts were captured; the
final checkbox, category and large-text views were visually inspected. A separate
creation flow verifies draft habit identity, staged goals, parent Close cancellation,
parent Done persistence and retaining goals when tapping the already-selected type.
These checks do not establish native iPhone presentation, keyboard or VoiceOver behaviour.

Phone follow-up: reload, toggle a checkbox, then open its Goal and Try a value.
Confirm both feedback paths are clear. Change repeat days, visit Goal timeline
and Back, then save and Undo. Check the numeric/category editors and the native
Apply from date picker with the keyboard visible. Close must cancel drafts.

**Superseded:** Try a value. The test panel was removed with the period-goal
editors (next entry); the shared completion tint remains.

### Period goals, cycles and full-screen editors

Focused timing tests compare bounded arithmetic against day-by-day references
for day/week on/off cycles, weekday intersections, negative anchor offsets,
DST-adjacent dates, weekly/custom period lengths, upper/lower ranges and streaks.
They cover open last days, future records, rest weeks, boundary fragments,
distinct partial-row identities and a 0001–9999 blank history with eight UI rows.
Real SQLite tests cover v13 edits, reload, Undo/Redo and atomic restore/recovery.
The v13 fixture retains the exact v12 prefix. Older formats reject timing fields.

The final automated pass runs static checks, the full 273-test suite and iOS/web
bundle exports under a 2 GiB memory/no-swap scope. Browser checks use synthetic
sample data in a disposable 1 GiB Chrome scope: next-period defaults, weekly
Between, 3/1 and alternating-week presets, custom 10-day/restart and custom-cycle
inputs, timeline draft retention, save/reload, and parent create/Close/Done. The
removed test field stays absent. Repeated selected-option taps retain drafts, and
a blank period length disables boundary navigation without a render exception.
Release JS inspection found no sample-timing identifiers/helper or preview capture
module. Portrait/landscape and 150% app text screenshots are inspected. These
checks do not establish native keyboard or gesture behaviour.

Phone acceptance:

- Reload sample data: Walk uses 5 days on/2 off, Meditate 3 weeks on/1 off,
  Workout a weekly range on alternating weeks. Off periods are neutral.
- Create/Edit fills the screen; Close/Done stays reachable with keyboard visible.
  Goal Back names the parent, timeline Back retains drafts, parent Close cancels.
- Change a period goal: next boundary is suggested. New period today starts an
  anchored custom interval. Check the displayed dates before applying.
- Inspect current progress and expand Period results. Partial/rest/open periods
  must be distinguishable from finished failure; calendar cells remain editable.
- Change global week start: saved goal anchors/results must stay unchanged.
- Save a goal on real data, reload, Undo/Redo, export and restore. Do not replace
  irreplaceable data for a visual test; sample mode needs no restore.
- Test native date pickers, 150% plus OS scaling, landscape, VoiceOver and Close.

### Goal overview and info-row polish

The goal form now opens as four readable summaries with one expanded section.
Browser interaction checks cover selected-value lists, frequency/cycle/condition
edits, retained inputs across sections and timeline, combined saving, numeric
Close cancellation, shared info expansion, portrait/landscape and 150% app text.
The overview, repeat section, large-text overview and expanded Settings info were
visually inspected. All 273 existing tests and static checks pass; iOS/web bundle
exports validate the native-facing shared control imports. No persistence or
rule-evaluation logic changes in this refinement.

Phone follow-up: open a goal, expand Repeat then Cycle, and check that only the
requested controls are visible and easy to reach. Edit a value, switch sections,
then return before saving. Check the separator and expanded explanation in
Settings → Appearance and in Statistics. Native keyboard placement, VoiceOver
focus and perceived transition smoothness still need iPhone review.

### Checkbox conditions and defaults

On iPhone: open Goal → Repeat/Cycle/Success condition. Each should reveal choices
with one tap, with no repeated summary above its options. Try Unchecked success
with defaults Off and On; toggle a day from both the grid and statistics calendar.
Check success totals, Hide completed today and periodic progress. Set Default On
in habit editing, cancel once, then save; check the same dated goal in the goal
editor. Reload, Undo/Redo, and verify earlier dates retain their earlier default.
Test at large text size and landscape. Browser review is not evidence of native
switch feel or iPhone layout.

## 7 October 2026

### Tick/cross grid trial

Reload Expo Go and check/uncheck several checkbox cells quickly. Tick is On,
cross is Off; unchecked-success goals should retain their completion tint with a
cross. Test Default On, Undo, scrolling into history/future, and row dragging.
In Settings → Appearance try text size 85%, 100% and 150%, with Compact/Roomy row
and column spacing, then dismiss Settings. Marks should scale with the text,
remain centred and retain the full cell hit area. Test OS larger text and both
orientations on iPhone; browser layout does not establish native performance.

**Superseded:** Compact/Roomy spacing, now the v18 Rows and Day columns sliders.

### Saved styles, tap feedback and week boundaries

Appearance → Checkbox style should initially show Checkboxes. Select Ticks &
crosses, dismiss Settings and reload: it should persist without appearing in
History or clearing Redo. Try both at 85/100/150% text size and different spacing.
Rapidly check/uncheck five cells: recording must stay immediate; only tapped marks
should gently press/release. Scroll quickly, Undo and reload: newly mounted cells
must not animate. Enable iOS Reduce Motion and repeat; marks should change state
without the pulse. Check Monday/Sunday week boundaries stay aligned with their dates
during horizontal scrolling, future reveal, rotation and row reordering.
Device feel/performance and native Reduce Motion remain phone acceptance checks.

### Optional header markers and feedback

Appearance: Week dividers and Tap animations should both start On. Turn each Off
and close Settings; the date headings should be black except for Today.
Re-enable dividers: backgrounds alternate black and faint grey per week, confined
to the date headings, with no changes to habit cells or name backgrounds. The
quiet continuous header border and name/day hairline stay fixed in either mode.
Pull toward the future: the streak should retain its original contrast and fixed
right anchor. Fast-scroll, extend history/future and cross midnight: a given
calendar week must keep its shade. Today should stay distinct on either shade.
Change Monday/Sunday, rotate and try large text; boundaries must retain their dates.
With tap animation Off, check/uncheck rapidly in both styles: values still update
immediately and haptics retain their separate setting. Turn it On and repeat with
iOS Reduce Motion. Reload saved-data mode to check switches persist; neither
setting should enter History or clear Redo. Native visual feel remains phone QA.

(Since v19 themes, "black" here means the active background.)

The segmented-rule trial passed `npm run check`, all 287 tests and single-worker
iOS/web exports under a 2 GiB limit. Disposable browser review checked portrait,
landscape, 150% text, Monday/Sunday boundary gaps, the plain disabled hairline,
unchanged column geometry and independent name separator. Native rubber-band
pulling and the streak's appearance against the new rule still require iPhone
review; browser geometry is not evidence of that gesture.

**Superseded:** the segmented week rule, replaced by alternating header
backgrounds (below).

The alternating-header-background trial passed `npm run check`, all 287 tests
and single-worker iOS/web exports under a 2 GiB limit. Pure tests cover fixed
week shading across Monday/Sunday starts, DST-adjacent dates, leap/year boundaries
and pre-epoch dates. Browser review checked portrait/landscape, 150% text,
Monday/Sunday grouping, Today contrast, deferred toggle/reload, unchanged habit
cell backgrounds and column geometry. Native shade visibility and future-pull
contrast require phone review.

### Main-page shortcuts, v17 spacing and recycled columns

Run check, npm test and single-worker iOS/web exports under the documented memory
limits. Focused suites cover signed/bounded date windows, cached policy semantics,
new spacing/name preferences, unchanged legacy archive prefixes, numeric suggestion
bounds/explicit zero, delayed completion bursts and targeted Undo. Recycling tests
retain a row's native-view stand-in while changing entry subscriptions, accessible
values and tap dates; row-measurement tests batch wraps and reject stale generations.
Quick Undo tests use the real ChangeStore/replay, including archive restore after
unrelated colour/order/entry changes, expiry, retouches, restore/redo and deletion.
Mocked native scroll worklets verify alignment/readiness, not phone frame rates.

On the iPhone, test fast flings both ways, future pull/entry, Today arrival and a
far date-picker jump. Rotate from portrait to landscape and back while far into
history; dates/cells must remain paired, with temporary fallback instead of mixed
geometry. Check held-row reordering still moves the actual row smoothly. With Tap
animations on/off and Reduce Motion, only accepted taps should pulse.

Appearance order is Name width, Columns, Rows, Text size. Standard is the previous
Compact; new Compact is denser and Roomy is the previous Standard. Try large text,
wraps, both orientations and reload. Hidden presentation changes stay deferred.
Turn Hide completed on in Settings: already completed rows should be gone when
returning. New rapid checkoffs retain targets until a 700 ms quiet period.

**Superseded:** the v17 Narrow/Standard/Wide and Compact/Standard/Roomy choices,
replaced by the v18 Name column, Day columns and Rows sliders with Auto.

Recent numeric suggestions fill the draft only; Close cancels, Done writes.
Record a value or archive a habit: Undo should appear for four seconds with an
outline icon, independently of filtering/goals/date. Away from Today, navigation
stays available beside it. Undo restores only that action; History remains the
long-lived Undo route. After archiving and quick Undo, entries/notes/position remain.

The founder reported the first cache/frame attempt did not improve either native
issue. After recycled lists/shared animation changes, scrolling and rotation were
better, but an intermediate rotation layout persisted for about a second. The
first readiness mask then left only dashes after rotation. Native readiness now
uses first-visible-items onLoad plus current viewports, rather than an exact
estimated content width. This correction still requires device acceptance.

Final local validation: check passed, all 307 tests passed, and iOS/web exports
completed with one worker under a 2 GiB memory bound. Browser review passed recent
numeric draft/Close/Done, control ordering and deferred sizing, denser Compact,
bounded 2022 date jump, portrait/landscape alignment and Today, delayed hiding and
specific-entry Undo. This browser uses RN Web FlatList, not the native recycler.
The founder accepted four-second entry/archive Undo and filtering ready on return
from Settings. The added 180 ms Undo fade and 220 ms shared row movement need
phone review alongside the corrected native rotation gate. Callback regression
tests cover estimated width mismatch, stale generations and event ordering; row
transition tests cover surviving/restored targets and immediate geometry/drag
cancellation. Neither mock establishes native frame rates.

Phone follow-up, 7 October: founder accepted the Undo/row-removal animations and
confirmed correct rotation layout. Real entry rendering remains noticeably slow.
This establishes correctness/gesture acceptance, not satisfactory rendering
latency or a measured frame rate. Further performance work must separate React
render, native layout and release-versus-development costs.

### Grid diagnostic comparisons

Use DEVELOPMENT.md/PERFORMANCE.md for three identical phone scroll/rotation runs.
Confirm Timings saved and inspect `.dev/performance/` reports. Keep data source and
range fixed. A separate Normal run checks ten checkbox edits; source sample is
memory-only and cannot establish SQLite latency. Native ready callbacks include
JS delivery; React commits exclude native/GPU work. Never report these as FPS.

Automated cases cover strict anonymous report validation, warmup exclusion,
discrete notifications, one-minute stop, release/env guards, SQL-free entry reads,
real SQLite write counts, rollback/error/queued retry invariants, paired receiver
size/privacy/auth checks and preservation of PNG capture. Recycling tests also
verify that No goal tint skips evaluation and Simple cells retain values/goals,
subscriptions and correct dated taps. Browser dev review exercises all modes,
report generation, rotation and no persisted experiment events; transport is mocked
because native paired uploads intentionally reject browser origins. Production
web output excludes the native diagnostics UI/transport. Phone comparison remains
pending; no renderer-speed improvement is claimed yet.

Local validation: TypeScript, ESLint and formatting passed; all 315 tests and
eight preview-receiver tests passed. Single-worker iOS, production web and
development web exports completed under bounded memory. Browser review passed
all three modes, both rotations, report generation and unchanged stored values.
No iPhone timing report had arrived at this point; later reports are in
PERFORMANCE.md. Desktop fixture results are recorded in PERFORMANCE.md and cannot
establish native render/bridge latency.

### Shared row controllers and vertical cell windows

`grid-render-controllers.test.mjs` exercises the actual components/hooks through
bounded React mocks: controller count depends on habits rather than date views;
rotation/recycling retains handles, removal/restoration releases/recreates only
that owner, and drag coordinates read current shared values. Tap tests cover lazy
allocation, rapid restart, no animation on external updates/recycling and Reduce
Motion. Window cases cover wrapped heights/font scaling, every visible row across
bucket rounding, stable row identities and retention throughout reorder/removal.
These mocks establish behaviour and work counts, not native layout/frame rate.

On the phone, reload and send another Normal scroll/rotation report using the same
sample list as the baseline. Try portrait/landscape, vertical scrolling to the last
habit and back, then check a cell. Hold/drag past the bottom edge and cancel/drop;
all cells must follow their name with the existing appearance. Archive/Undo and
Hide completed/Show completed must retain smooth matching movements. Test larger
text/wrapped names, marks/boxes, quick repeated taps, numeric/text/categories and
Reduce Motion. Confirm no old date pulses after fast horizontal recycling.

Local checks passed with 319 tests and single-worker iOS/web exports under a
2 GiB memory scope. Browser review confirmed eight real rows of the 14-row sample
list in landscape, bottom-row refill and return, date/cell alignment, both
rotations, numeric draft/Close/Done, deferred appearance settings, Today, delayed
filtering and specific-entry Undo. Screenshots retained the existing appearance.
Browser FlatList does not establish native recycler latency. A fresh iPhone
report and reorder/animation acceptance remain pending.

### Native column input and batched checkbox shapes

The grid-column-rendering test (since removed) runs the actual native GridDateColumn branch,
GridCheckboxLayer and press hook with bounded native-control/SVG mocks. It checks
one ordinary control and drawing root, per-cell accessibility roles/states,
native text-fitting props, current dated defaults, explicit Off, press-out-before-
press, cross-row release cancellation, date recycling mid-gesture, accessible
activation and disabled save/error guards. It verifies a single temporary tap
overlay with the idle graphic hidden, cleanup, movement fallback on the same
accessible row view and disposal of subscriptions. During-motion touches follow
sampled native row tops; idle touches do not read UI positions. Pure hit tests
cover wrapped heights, omitted rows, exact boundaries and invalid coordinates.
Controller tests also verify stationary cells use static transforms and reconnect
existing handles for movement, retaining name/loading styles. Mocks do not
establish native touch arbitration, drawing parity, VoiceOver traversal or speed.

Phone review: reload, check five boxes rapidly, then edit number/text/categories.
Scroll horizontally and vertically, rotate in both directions and check the
labels/colours/marks; try a hold/drag, archive/Undo and Hide completed movement.
With VoiceOver enabled, focus individual cells and double-tap checkbox/numeric
actions; confirm the column itself is not exposed as one combined control. Test
larger text and Reduce Motion. Send the same Normal scroll/rotation report after
returning from Settings, without opening statistics during the measured run.

Local validation passed: TypeScript, ESLint and formatting, all 321 tests, and
single-worker iOS/web exports under a 2 GiB memory scope. Browser regression review
passed numeric drafts, deferred sizing, bounded date navigation, rotation/date
alignment, vertical row refill, Today and targeted Undo. This validates the web
control path; the native branch is covered by the focused mocks above. Fresh
iPhone timing, gesture/drawing and accessibility acceptance remain pending.

### Development / production JavaScript comparison

Use `npm run start:compare-dev` (port 8083) and `npm run start:production-js`
(port 8082), following DEVELOPMENT.md. Compare the same saved
list/range/appearance after bundling settles, without changing settings between
sessions. Sample mode and profiling/preview mounts are disabled by a separate
comparison override. `performance.test.mjs` now checks that this override
disables collection/timers and preserves SQL adapter identity even when the
normal performance flag is enabled. Literal `__DEV__` guards still remove native
development modules/fixtures from production.

Local checks passed with 321 tests and a one-worker iOS export under a 2 GiB
memory scope. An initial export with default worker count hit its overall timeout;
the explicit single-worker rerun completed. Served iOS bundles were verified:
development has dev=true with the comparison override present and no conflicting
local override; production has dev=false/minify=true, the feature and performance
gates folded false, and no fictional sample fixture content. Both manifests have
the same Expo Go scope key. This does not establish phone performance; comparison
observations are pending. The prepared EAS Release profile still requires cloud
project/signing/device setup before a standalone binary can be tested.

### Responsibility cleanup

`app-actions.test.mjs` executes the real daily-entry controller, numeric dialog,
backup controller and shared chart with bounded native/browser mocks. Cases
cover local draft commits, Close/no write, invalid numbers, explicit zero versus
blank, latest-store preconditions, rejected-save draft retention, default-On
checkbox overrides, grouped net-zero edits, same-value category arrays, disabled
store actions, stable cell callback identity, native restore Cancel/confirmation,
exclusive recovery, duplicate in-flight backup presses, errors/cancelled pickers,
sample isolation and dated/accessibly cleared chart selection.

All 326 tests, TypeScript/ESLint/format checks and a single-worker iOS export
passed under memory limits. Native dialogs/keyboard/sheet gestures still require
phone verification after refactoring: open a number from both the grid and
Statistics, type, Close/reopen and Done; try a recent-total suggestion, zero and
clear. Check a categorical entry and chart select/clear. Backup Cancel must leave
the current store untouched; restore remains an explicitly confirmed operation.
These mocks and the bundle export do not establish physical-iPhone behaviour.

### Grid/controller and model organization

The grid-coordination test (since removed) mounts the actual useGridDates hook with bounded
native-scroll mocks. It covers native-position rotation anchoring, rejection of
old-generation callbacks, ordered layout/draw readiness, shared date identities,
both-list future reveal, animated Today arrival before future collapse,
single-boundary history expansion, final-settle compaction and distant bounded
navigation. The actual DateColumns adapter retains its native initial index until
its generation key changes. The menu test covers uncovered held-name hit regions,
local measurement with no parent commits and close-before-action ordering.
The grid-readiness test (since removed) now extracts the unchanged handlers from useGridDates;
existing native/web readiness and useGridScroll tests still apply.

All 331 tests and the single-worker iOS export passed under memory limits.
Transpiled-function comparison against the preceding commit found all 26 storage
functions and 11 moved grid handlers identical; model's public runtime exports
also match. These supplement the existing legacy fixture, SQLite, save failure,
recovery, export and undo tests. Check/type/lint/format must remain clean.

Phone checks after reload: rotate in both directions at an older date, fling
through history and return to Today, pull into tomorrow, then hold a habit and
continue dragging with its menu open. Verify names/cells stay aligned and retain
the accepted animations. Local mocks/export do not establish native acceptance.

## 8–9 October 2026

### Android first run

`npm run export:android` first passed on 8 October 2026.

Connect the phone as described in DEVELOPMENT.md ("Android phone over USB").
First device: Samsung Galaxy S21 (SM-G991B), Android 15 (API 35), One UI 7,
Expo Go 57.0.9. With adb connected, screenshots (`npm run android:screenshot`),
taps by accessibility label (`adb shell uiautomator dump` plus
`adb shell input tap`) and crash logs (`adb logcat -d -t 300 '*:E'`) can be
scripted from the computer. Check that Expo Go is the focused app before
scripted taps: a stray tap once landed on the home screen. adb cannot judge
haptics, smoothness or gesture comfort; the founder reports those.

Founder observations: development-mode performance is slow, as it was on the
iPhone 16 Pro in Expo Go. The grid would not get more compact than 3 columns,
sheets could not be swiped closed, and the date picker looked out of place.

Fixed and checked on the Galaxy by assistant-driven adb tests:

- **Grid spacing.** Settings changes never reached the grid: React Native's Modal
  `onDismiss` is iOS-only, so deferred grid preferences were never released.
  `SheetModal` now reports dismissal on Android. Compact columns show 4 days on
  this 360-point-wide screen (Standard shows 3; the iPhone 16 Pro is 402 wide).
  **Superseded:** Compact/Standard columns, replaced by the v18 sliders (next item).
- **Sheets (gesture version, 9 October).** Statistics, History and Settings
  close with a downward drag anywhere when the touched content is at its top
  (150/300/600 ms drags all closed Settings). A scrolled History list scrolls
  back up instead of closing; at the top the next drag closes it. Statistics
  still pages sideways, and Back closes sheets.
- **Grid sizing (v18, 9 October).** Automatic sizes on the S21: four days,
  130-point names, 48-point rows. Appearance preview and sliders: Day columns 40
  plus Name column 96 previewed five days; after closing, the grid showed five
  days with a 96-point name column. Reset returned both to Auto and the preview
  to four days. History was unaffected. The preview mirrors grid name cells
  (icon, gap, name, unit) using the first three real habits; with a 96-point name
  and 40-point days it showed five days, matching the grid after closing.
  Not yet checked on the iPhone.
- **Category entry swipe.** Swiping the entry sheet down closed it at 150 and
  500 ms drags; category taps still toggle.
- **Category entry (9 October).** Backdrop fades in place while the sheet slides;
  tapping outside discards unapplied choices; New category added "Swim", which
  saved with the entry as two History actions (Habit edited, then the entry).
  The sheet stays above the keyboard. Not yet checked on the iPhone.
- **Date pickers.** Android has no inline system picker, and in Expo Go its
  dialog is always light-themed. Jump to date and start dates now use the dark
  `DateCalendar` inside our own card/editor, with a month/year chooser.
- **Far date jumps.** Jump to date and Today from far away stopped 3 days short:
  Android FlashList re-applies its initial index after the first layout, undoing
  the arrival animation. Android now lands directly on the date (no slide).
  Near jumps and Today still animate.
- **Keyboard.** Number, text and new-habit dialogs did not open the keyboard;
  `useKeyboardFocus` focuses after the dialog appears. Entering 30 and pressing
  the keyboard's Done saved it.
- **Landscape.** The grid shows 10 days and clears the camera cutout and the
  navigation bar; Settings fits.

Fixed in code but still to check on Android:

- **Future pull.** Pulling left at Today never worked on Android (no overscroll);
  an Android-only pan now drives it. The first version made date navigation
  drift after a reveal, so Android now remounts both lists at the revealed
  date. Not yet checked on the phone: release past the tick lands on tomorrow,
  then scrolling either way, Today, and a second pull at the new edge.

Other items still to check on Android:

- With the keyboard open, the number dialog's Close/Done buttons are below the
  keyboard and need scrolling (the keyboard Done key saves). Decide whether that
  is acceptable or the dialog should be more compact.
- Expo Go's floating developer button sits over today's second-row cell; it is
  Expo Go's own control and is absent from real builds.
- `Platform.OS === 'ios'` branches in DescriptionEditor, CategoryEditor,
  GoalVersionForm and DevPreviewCapture; the rich description editor and its
  bottom toolbar above the keyboard.
- Text fitting (`minimumFontScale` is iOS-only) with large values and system text.
- Hold-to-reorder, future pull, rapid taps, reload persistence in saved data,
  backup export/restore (Android share sheet and file picker), TalkBack, haptics.

## 10 October 2026

### Themes and backgrounds (v19)

The theme checklist added with v19 is below; its maintained form is in
TESTING.md ("Settings, appearance and themes"). No device result is recorded
here yet.

- With Theme on System, switch the phone between light and dark mode while the
  app is open: the grid, sheets and status bar follow without a restart.
- Choose Dark and Light with the phone in the opposite mode; alerts (archive
  Delete, restore), keyboards and date pickers should match the app.
- Try each preset and a custom slider colour for both backgrounds. Confirm that
  names, empty and filled cells, faded dates, Today, the week shading, Hide
  completed, Quick Undo, History, statistics charts, goals, category and text
  entry dialogs and the note editor (including highlights and links) all stay
  readable.
- Open Settings, change the background and dismiss: the grid should switch once,
  after the sheet closes, keeping its scroll position.
- Type an out-of-range hex (e.g. #808080) and check that it is adjusted, with
  the note shown.
- Reload and restore a backup: theme choices survive and do not appear in History
  or consume Redo.

### History bursts, filters and floating Undo

Automated: `scripts/history.test.mjs` covers filters, whole-day counts beyond
paging, burst gaps/dates/neighbours, stable burst keys through Undo, backwards
clocks and burst labels. Not yet checked on a phone.

- Tick several habits within a few minutes, then open History: one "N entries"
  row lists the habits in their colours; unchecked or cleared ones are struck
  through and numbers show their value. Tap to expand and collapse.
- With a burst expanded, Undo repeatedly: rows disappear one at a time, the card
  stays open and the last remaining entry becomes an ordinary row.
- Entries more than 5 minutes apart, for different dates, or separated by an edit
  stay separate. A backfilled burst shows "For <date>".
- Filters: Entries, Edits and Notes show only their rows; pick a habit, then
  All habits. Archived and deleted habits are labelled. Tap outside the picker
  to close it. An empty filter offers Show all changes.
- The floating bar names the next Undo target even when it is filtered out. It
  stays readable over rows at large text sizes, and the last row can scroll
  clear of it.
- Scroll far back: older days load without a button; day counts don't change as
  they load.
- VoiceOver: a burst reads its count, habits/values, date and time range, and
  says whether it is expanded; the picker can be dismissed with the escape
  gesture.
- Android: the habit picker scrolls, and a downward drag in the History list
  still closes the sheet only at the top.

### History day folding and date jump

Added the same day. Automated tests cover whole-day paging, stable day keys,
jump targets with filters, and cached days matching `localDateKey` through
daylight saving in Melbourne, Lord Howe and New York. Not yet checked on a phone.

- Open History: Today and Yesterday are open and older days are folded, one line
  each with counts. Tap a heading to open or fold it.
- Scroll into a long open day until its heading pins, then tap it: the day folds
  and its heading stays at the top rather than disappearing.
- Pick a filter: every day starts open. Close and reopen History: fold choices
  and filters reset.
- Tap the calendar beside Close: days with changes have dots and the rest are
  dimmed. Pick a dotted day weeks back: History lands with that day open at the
  top. Pick an empty day: the closest earlier day opens. Try it with a filter.
- With months of history (or the sample data), check scrolling stays smooth,
  older days keep loading, and the calendar opens without a visible pause.
- VoiceOver: headings remain headings and say whether they are expanded.

## 12 October 2026

### Canvas grid momentum

`scripts/grid-motion.test.mjs` samples planned releases at 120 Hz: flings end
exactly on a column inside the limits with no final jump, start at the release
velocity without reversing, land within half a column of the natural
projection, bounce back onto edges and settle slow releases without overshoot.

On the iPhone 16 Pro and Galaxy S21 (Expo Go, development JavaScript) the
founder found the first version crashed when scrolling past Today and had no
momentum. Causes, all fixed: a default parameter not captured by the release
worklet, the future-pull streak calling a theme function on the UI thread (an
older bug, reached by pulling past Today), and Reanimated skipping the custom
animation. The founder then confirmed the flings and tap-to-stop on both
phones, judged 0.998 and 0.995 deceleration too floaty and chose the earlier
0.99. The iPhone shows 60 fps in Expo Go; 120 Hz awaits our own build.

## 13 October 2026

### Shared core package and first web slice

Automated, on Windows after moving 67 modules into `packages/core`:
`npm run check` (phone and web typecheck, lint, formatting) passed; `npm test`
passed 361 of 361, including `apps/web/test/web-storage.test.mjs`, which runs
the shared `sqliteRepository` and `ChangeStore` over the web worker protocol on
SQLite WebAssembly in memory (schema 1 created, an entry kept across reopening,
a failed transaction rolled back). `npm run export:android` and
`npm run export:ios` bundled, and `npm run web:build` built.

Headless desktop Chrome against `npm run web:preview`: 12 sample habits
rendered with Today at the right edge; a checkbox tap saved, survived a reload
(OPFS), and Ctrl+Z undid it; a second tab showed "already open in another
tab"; at 390-point width Today stayed pinned after a resize.

The founder then confirmed the phone app still works on the iPhone after the
move, and the web app works in their browser. Not yet checked: the phone app on
Android after the move, Safari, iPhone Safari and Firefox.

## 14 October 2026

### Web home grid, layout A

Automated: `npm run check` passed; `npm test` passed 363 of 363, including the
new `scripts/habit-summary.test.mjs` (schedule, rule, quota progress and
dated goal changes) and the canvas grid tests against the moved
`cellAccessibility.ts`. `npm run web:build` built; Android and iOS bundles
exported.

Headless desktop Chrome against `npm run web:preview` at 1440×700 and 1440×900:
the page never scrolled while the grid scrolled vertically inside its own
area, with day headings and names pinned; Today sat at the right edge about
930 px from the names; the Today button focused Today, arrow keys moved focus,
Space ticked a checkbox and Ctrl+Z undid it; three consecutive ticks showed
streak numbers 1–2–3 joined by bars. At 390 px wide the page did not scroll
sideways and Today stayed in view. Not checked: Safari, Firefox, touch input,
and long lists of habits beyond the 12 presets.

### Web sidebar, overlay scrollbars and grid polish

Automated: `npm run check` passed; `npm test` passed 363 of 363 (the moved
`gridEntryText.ts` tests included); `npm run web:build` built without the
sample data code; Android and iOS bundles exported after `gridEntryText.ts`
moved to core.

Headless desktop Chrome with scrollbars shown, against the development
server with sample data and the production preview: the overlay bars began
below the headings and right of the names; scrolling left loaded 120 older
days while the same days stayed in view, Today read "Today →" and the corner
named the months in view; Home and End reached the oldest loaded day and
Today; a tick beside a checked day pulsed and grew both join halves, clearing
retracted them, and Undo animated nothing; the Rows slider resized the grid
live and saved on release, and Auto restored the default; `?`, `H` and `T`
worked; switching Sample data off returned to the saved data. All columns
measured 46 px with text cells present, and no width from 390 to 1440 px cut
a column. The earlier entry, habits, panel, History, Settings, goals and notes
checks passed again. Not checked: Safari, Firefox, touch, a real mouse wheel
or trackpad, and the founder's own data.

### Web grid scrollbars outside the cells; landing page scaffold

Automated: `npm run check` passed (now typechecking `apps/landing` too);
`npm run web:build` and `npm run landing:build` built.

Headless desktop Chrome: automatic cells measured 56 × 56 px (46 × 46 px at
390 px wide); the vertical scrollbar sat in the gutter right of the cells and
the horizontal one below the last row, neither overlapping a cell; no width
from 390 to 1440 px cut a column; history loading, tap animations and grid
sizes behaved as before. The landing page rendered in dark at 1440 px and light
at 390 px without sideways scrolling, and its web app links pointed at the
development server. Not checked: Safari, Firefox, touch, real hosting.

### History calendar, resizable panel, brand link

Automated: `npm run check` passed; `npm test` passed 365 of 365, including new
tests for core `historyCalendar` (days made, habit order by changes, filters,
empty range) and `addMonths`; `npm run web:build` built; Android and iOS bundles
exported after the core and phone History changes.

Headless desktop Chrome, web app with sample data: the brand linked to the
landing page; dragging the panel edge 160 px widened it from 440 to 600 px and
the grid refitted, arrow keys stepped it 24 px, the width was remembered and
Enter reset it; the month view showed habit-coloured dots and "+n", today
named its changes, month stepping stopped at the first month with changes and
the current month, the year view drew a dot per day with changes, choosing a
month opened it and choosing a day opened that day at the top of the list; a
habit filter narrowed the calendar to one dot per day; at 390 px the panel
covered the grid without the resize edge or sideways scrolling. The earlier
History, panel and notes checks passed.

Not checked: the phone calendar on iPhone or Android (typecheck, lint and both
exports only). The Expo browser preview could not be used: it stops at start-up
in the Skia grid drawing module (`cellPainter.ts`, unchanged here).

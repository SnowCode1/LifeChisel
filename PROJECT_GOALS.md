# OnPurpose — project goals

Status: living product brief. Last updated: 10 October 2026.
“OnPurpose” is a working name, not a final brand or reserved App Store name.

This brief states what OnPurpose is for and what has been confirmed. In these
docs the _founder_ is the project owner and maintainer, who makes product
decisions; the _assistant_ is an AI coding assistant, whose proposals remain
proposals until the founder accepts them. [DECISIONS.md](docs/DECISIONS.md)
records how and when each decision was made.

## Primary goal

**Minimise cognitive friction so habit tracking becomes a seamless part of life.**

Make the gap between remembering a completed habit and recording it as small as
possible. Open the app, tap familiar positions, and leave. Speed matters because
it reduces interruption; the app should also minimise reading, decisions, errors,
and uncertainty about whether something was saved.

## Confirmed by the founder

### Scope, licence and business model

- Build a habit tracker intended for actual store releases on iPhone and
  Android.
- Which platform launches first is undecided (12 October 2026): the iPhone
  release matters more, while launching on Android first is cheaper. An Android
  phone is used for testing alongside the iPhone. Development happens on Linux and Windows without a Mac,
  and the physical iPhone (an iPhone 16 Pro) is the primary test device.
- Release the source under GPLv3 or later, with the founder as sole copyright
  holder. The repository is public at https://github.com/SnowCode1/OnPurpose.
- Earn income through a free tier of five active habits (archived habits do
  not count) plus a one-time US$9.99
  unlock, with no subscription. The paywall appears when creating a sixth habit,
  never during onboarding. Payment never locks existing records, export,
  backups, History or the Loop import; reaching the limit only prevents adding
  more.
- Use [Loop Habit Tracker for Android](https://github.com/iSoron/uhabits) as a
  product reference. This is inspiration for behaviour, not a decision to copy
  its code, assets, scoring formula, or every feature.
- Import history from Loop Habit Tracker's CSV and SQLite exports, with a parser
  written against the export formats rather than adapted from Loop's code.
- Support crash reporting and product analytics, disclosed in the privacy policy
  and store forms.
- Offer an F-Droid build without proprietary libraries, at the lowest priority.
- Plan for approximately 10–20 habits.
- Maintain project goals, agent guidance including CLAUDE.md, and a docs folder.

### Home grid

- Use a compact, spreadsheet-like home screen: habits run vertically, dates run
  horizontally. Fit as many whole day columns as space and text size allow;
  support portrait and landscape, with more dates visible in landscape.
- Start at today and the recent past. Scroll horizontally into the past;
  ordinary scrolling stops at today, with an intentional extra pull to reveal
  future dates. Future entries are allowed. This supersedes the initial
  past-only rule. Adaptive density replaces the three-column idea.
- Jump to a chosen date through the month/year control.
- Offer four home views from a menu in the top bar's left corner, which
  replaced the app name there (16 October 2026): Grid (names beside days);
  Compact (icons instead of names, leaving room for about a week of days);
  Today (one tile per habit for Today, with no date or name axes: the name
  cell over the Today cell, the grid's schedule/goal line under the name,
  the most usual total recording a number in one tap, and a quiet "4 of 9
  done" count under the date, 17 October 2026); and Weeks
  (one column per week; each cell shows a number over seven day dots, and
  choosing one opens that week's days). Each device remembers its own view.
- Keep a compact top bar always visible, with Today in the centre and change
  history/settings at right. Keep the month/year date control beside the day
  headings. Future-pull feedback should grow leftwards from a fixed right edge
  on the existing divider beneath the day headings, without text or a new border.
- Let users arrange their own habit order. Completed habits stay in place by
  default; optional Hide completed today can filter them. With it on, keep newly
  completed rows in place during a tap burst, then collapse after a pause, and
  prepare existing completed rows while Settings is open.
- Design for muscle memory; the aspiration is opening the app and recording five
  checkbox habits in about three seconds.
- Offer recent numeric totals as explicit draft choices, applied only on Done.
  Offer a brief specific-action Undo for entries and archival without undoing
  unrelated changes; use an outline icon and a four-second duration, rather than
  the rejected twelve seconds.
- Add restrained haptic feedback to recording and deliberate selections. Keep
  rapid checkoff immediate and routine scrolling quiet.

### Appearance

- Offer System / Dark / Light themes; Dark and Light backgrounds are each
  customisable (pure black and warm Paper by default), Dark is the default, and
  the interface and habit colours adjust to stay readable on any chosen
  background.
- Use user-selectable habit colours across each row,
  including the habit name, checkboxes, and numeric entries. Provide more presets
  and a visual custom picker with optional hex input; use familiar user-facing
  labels rather than colour-space jargon.
- Optionally give a habit an emoji or a pack icon. Pack icons use the habit colour;
  icons remain optional. Give all 12 presets suitable icons; preserve user choices
  when adding them to an existing preset list. New custom habits start without one.
  Offer Phosphor and Tabler Outline with shared search and common habit choices.
  Open the picker on Icons and make its full search scope explicit.
- Show every date in the same tone. The earlier fade for older and future
  dates was removed as confusing (12 October 2026).
- Offer saved Name column, Day columns and Rows sizes, in that order, as stepped
  sliders with a live preview. Each starts at an automatic size that adapts to
  the device and text size, with Reset to automatic. These replace the earlier
  Narrow/Standard/Wide and Compact/Standard/Roomy choices, which keep applying
  until a slider is moved. Preserve usable tap targets and app/OS text scaling.
- One Settings text-size control applies throughout the app, including
  descriptions and their editor. Keep system accessibility scaling and adapt
  spacing accordingly.
- Group date headings with faint alternating week backgrounds, leaving habit cells
  unchanged; Today retains its clearer highlight. The founder accepted this look.
- Offer Checkboxes (default) or Ticks & crosses as the checkbox style, with
  optional tap animations; a separate rest-day feature was declined.

### Habits, entries and goals

- Support checkbox, numeric, categorical and free-text habits. Numeric entries
  are primarily a daily total, rather than repeated increments throughout the
  day. Categories have stable options with optional short grid labels, and
  several can be selected on one day. Free text is a daily value, separate from
  the habit description.
- Hold the habit name for a compact Colour/Edit/Reorder/Archive overlay. Continue
  holding and drag to reorder; include an explicit mode and accessible move actions.
  Keep date-cell recording gestures separate. Add habits at the end of the grid;
  Settings contains an archived-habit list with Restore and confirmed Delete;
  deletion is recoverable with History Undo, including all daily records.
- Give each habit an editable start date, initially Today, to support old records.
  Statistics use each habit's own continuous calendar period since its start;
  another habit's activity must not affect its denominator. Numeric averages divide
  by all calendar days in the selected period since the start, including blanks.
- Define per-habit success conditions for all four types, separate from recording.
  Support numeric comparisons, category Any/All/count/exclusion rules, literal text
  matching and selected weekdays. Use an editable effective-dated goal timeline: new
  goals default to Today, preserving earlier goals and results; backdated corrections
  are explicit and undoable. Share evaluation across grid, statistics and Hide completed
  today. Keep numeric averages based on all calendar days. See [GOALS.md](docs/GOALS.md).
- Separate successful-day conditions from frequency: every day, selected
  weekdays, or At least/At most/Between a number of successful days per week or
  custom interval. Support anchored repeating on/off cycles in days or weeks
  (including 5/2, 3 weeks on/1 off and alternating weeks). Preserve earlier
  timing in the goal timeline, show progress for open periods, and do not prorate
  partial periods automatically. Saved anchors are independent of later
  week-start preferences.
- Checkbox goals can count Unchecked as success, and a dated default can make
  untouched days On; explicit records override the default.
- Create/Edit habit and Goal use full screens with compact Back/Close/Done
  navigation.

### Notes and statistics

- Tapping a habit name opens its details sheet with Notes and Statistics tabs:
  Notes first when the habit has a note, Statistics otherwise. A floating bottom
  switch and horizontal swipes move between them. This tab arrangement is still
  a trial awaiting iPhone acceptance; it superseded a compact Notes card.
- Statistics comes up from the bottom and dismisses with the same native downward
  swipe as History/Settings. Preserve a direct Close button and full statistics content.
- Keep statistics calm and uncluttered: plain numbers rather than a dominant
  percentage, a slim goal row, and chart explanations behind info controls.
  Statistics retains streaks, completion charts and numeric charts.
- Tap days in the statistics calendar to toggle checkboxes or edit numeric totals
  using the same entry behaviour as the grid. Today navigation scrolls back quickly.
- Give each habit an optional Markdown/plain-text description with links, available
  during creation and editing. Keep the full note one name tap away through the
  Notes tab, with a full-screen live formatted editor, local temporary Undo/Redo,
  reversible formatting controls and optional highlight colours. Retain applied
  changes in incremental storage and Undo/Redo. Populate existing habits with
  editable placeholder notes while preserving any user-written text.
  Keep formatting controls above the keyboard, float text/colour menus without
  shifting the document, and let pasting a URL onto selected words create a link.
  Use consistent outline controls from an existing icon pack.
  Show current highlight colour, offer explicit link Open/Edit/Remove inspection,
  and provide description Versions beside Edit with undoable text-only restore.
  Clear formatting preserves links. Remember matching-text editing positions,
  including recoverable drafts, and highlight changed passages in Before/After,
  with Next change to find them quickly.

### Storage and History

- Store app changes incrementally. This is the underlying storage approach and
  export format, separate from the habit/day model; it also enables a separate
  history feature for browsing prior activity, checked boxes, and comments.
- Show change history in compact rows with action icons, grouped by edit day,
  with time per row. Preserve clarity about different habit-entry dates.
  Collapse neighbouring entries recorded within 5 minutes into one expandable
  row, offer compact filters, and keep Undo/Redo in a floating bottom bar.
  Day headings fold (older days start folded) and a calendar jumps to a date.
- Keep global preferences in incremental storage/export but outside visible
  History and Undo. Show active habit actions: Undo removes their rows and Redo
  restores them. Group rapid corrections to one entry and hide net-zero groups;
  show the next Undo target. Start with two minutes of inactivity between groups.

## Proposed interaction rules

1. Launch directly into the current grid after initial setup.
2. Tap a checkbox date cell once to toggle it; show the result immediately.
3. Tap a numeric date cell to enter/edit that day's total.
4. Tap the habit name to open notes/statistics. Names and date cells have distinct hit
   targets, so recording a value cannot accidentally open statistics.
5. Keep today at the right edge of the initial view. Scroll toward
   earlier dates while names stay fixed; offer a direct return to Today. Reveal
   future days after a deliberate pull-and-release, continuing by the pull distance
   rather than jumping a whole screen. Returning to Today restores
   that boundary; entries keep their dates.
6. Change ordering only through deliberate editing, not automatic sorting.
7. Save locally and work offline; do not require an account for everyday tracking.
8. Use restrained haptics for accepted actions, with no blocking celebration.
   Pulse choices are a phone experiment; visual state must remain sufficient.
9. Preserve readable text, VoiceOver support, and usable touch targets. Scroll
   when necessary instead of squeezing all 20 habits into uncomfortably small rows.

Manual ordering and stable completed positions by default are confirmed; the founder also requested an optional Hide completed today setting. The remaining
interaction details are proposals to validate on the phone.

## Two kinds of history

**Habit/day history** answers “What did I record for Tuesday?” and supports
statistics based on dated values. The home grid is a view of those records.

**Change history** answers “What changed, and in what order?” The incremental
storage system preserves mutations and supports export, restoration, and a
separate history-browsing feature. A correction made today to Tuesday's value
has two different dates: the date being recorded and the time of the edit.
Comments belong in this history design too. See [STORAGE.md](docs/STORAGE.md).

The architectural direction is confirmed and implemented: versioned events,
grouped compensating undo/redo, and JSON change-based backup/replay, with every
earlier event and backup version still readable. The visible History is an
active-action projection; the exported log retains every accepted edit. Comments
and permanent erasure still need design. [STORAGE.md](docs/STORAGE.md) states the
current version and format.

## How we will judge the experience

The three-second target is an aspiration to measure, not an achieved claim.

- On the iPhone 16 Pro, time from tapping the app icon to the fifth intended
  checkbox visibly becoming complete, after learning the layout.
- Record cold launch and warm return separately. Also measure from the grid
  becoming usable, to separate launch cost from interaction cost.
- Run at least ten trials. Record wrong taps, corrections, scrolling, and whether
  the user had to stop and search for the next habit. Report median and slowest.
- Repeat with 10, 15, and 20 habits; do not hide scrolling cost from the results.
- Evaluate numeric entry separately: entering a total is a different task from
  checking a box, and is not automatically subject to the five-in-three target.
- Use a preview/release build for final timing. Expo Go previews help
  layout iteration but do not establish release iOS performance.
- Check reliability: saved values survive reopening, offline use works, and
  completion never unexpectedly changes other rows' positions.

Final acceptance thresholds are still to be agreed. See [TESTING.md](docs/TESTING.md).

## Current state

The app runs on the founder's iPhone and an Android test phone through Expo Go.
Development builds start with 12 preset habits, seeded once, which can be edited and archived;
archived habits can be deleted, with Undo available. The grid shows as many day columns as fit (typically
four on the test iPhone in portrait, more in landscape, fewer with larger text).
It scrolls into the past, returns to Today, reveals future dates with a
deliberate pull, jumps to any date, and rolls over at local midnight. It records
checkbox, numeric, categorical and free-text values, with optional icons and
preset or custom row colours.

Tapping a name opens Notes and Statistics; holding it opens actions and drag
reordering. Goals support dated daily rules, period quotas and on/off cycles
([GOALS.md](docs/GOALS.md)); statistics rules are in
[STATISTICS.md](docs/STATISTICS.md). History lists active habit actions with
grouped Undo/Redo, filters and a date calendar. Everything persists locally in
SQLite; Settings offers themes, grid sizing, text size and full change-based
backup/restore.

Persistence is confirmed on the phone. Many newer features, an older Undo report
and backup restore still await iPhone acceptance; see [TESTING.md](docs/TESTING.md).

## First-release candidates and sequencing

The following capabilities are desired; their milestone order is proposed.

1. Validate the compact grid, distinct name/cell actions, and numeric daily
   entry. **Done:** confirmed on the iPhone.
2. Design versioned incremental storage and portable export/restoration.
   **Done:** see [STORAGE.md](docs/STORAGE.md).
3. Implement real habit creation, editing, manual reordering, archival, and durable
   checkbox/numeric entries, including date rollover and earlier-day corrections.
   **Done**, with some phone acceptance pending.
4. Add habit detail statistics and streaks with clearly specified calculations.
   **Done:** see [STATISTICS.md](docs/STATISTICS.md).
5. Add comments and the separate history browser on top of the same stored
   changes. **Partly done:** History is built; comments are open.
6. Validate accessibility, data recovery/upgrades, TestFlight, and App Store
   release. **Open.**

## Deferred candidates, not permanent exclusions

Cloud sync and any backend, accounts, social features, leaderboards, coaching,
AI features, reminders, widgets and Apple Watch. Each
needs a concrete reason to enter the first release. Statistics, numeric habits,
comments, and incremental history are desired scope, not excluded candidates.

Goal variants not yet designed: skipped/excused days, manual success overrides,
rolling windows and summed numeric period quotas (see [GOALS.md](docs/GOALS.md)).
Permanent erasure of deleted data is also deferred.

## Decisions to make together

| Question                                                               | Current status                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| How many dates and in which direction? How do we browse history?       | Adaptive columns; deliberate future reveal; future entries allowed; date jump      |
| All habits daily, selected weekdays, or frequency targets?             | Daily/selected weekdays, fixed periods and anchored cycles confirmed               |
| Do numeric habits have units, targets, and a “lower is better” option? | Daily totals, comparisons and period success-day quotas implemented                |
| What exactly counts toward a numeric or scheduled habit's streak?      | Dated daily rules; neutral off periods; finished-period streaks for quotas         |
| Midnight cutoff, late-night logging, backdating, and travel?           | Local midnight implemented; later cutoff/travel policy pending                     |
| Comments on a habit, a day, a particular entry, or multiple kinds?     | Comments desired; attachment semantics open                                        |
| Which app changes enter the history; how do deletion and undo work?    | Active habit actions; preferences excluded; archived Delete undoable; erasure open |
| Export/import format, backup location, and cross-device sync?          | Versioned JSON change-log backup; all older versions import; sync deferred         |
| Any reminders or widgets required for version one?                     | Open                                                                               |
| Free, paid, donations, or another model?                               | Five free habits plus a one-time US$9.99 unlock                                    |
| Licence and copyright holder?                                          | GPLv3 or later; LICENSE added, copyright Daniel Adams                              |
| Final name and visual personality?                                     | Name open; System/Dark/Light themes (Dark default) and habit colours confirmed     |
| iOS version, Expo account, Apple Developer membership?                 | iPhone 16 Pro confirmed; EAS preview profile prepared; account/OS status open      |

## Milestones

1. **Foundation:** local tooling, shared goals, phone setup guide, disposable grid.
   **Done.**
2. **Interaction validation:** actual phone testing and agreement on core
   behaviour. **Done** for the core grid; acceptance of newer features continues.
3. **Usable local app:** incremental storage, export/restore, management, dated
   entries. **Done**; backup restore awaits iPhone acceptance.
4. **History and insight:** statistics, comments, and browsing previous changes.
   **Partly done:** statistics and History are built; comments are open.
5. **Beta:** own builds, TestFlight, accessibility, reliability, timed usability
   trials. **Open:** an EAS internal preview profile is prepared.
6. **Open-source and App Store release:** licence, public repo, final assets,
   accurate privacy details, App Review, publication. **Partly done:** licence
   and public repo are done; the rest is open.

## Next suggested work

1. Decide which platform launches first; it sets the order of the steps below.
2. Work through the iPhone acceptance backlog in [TESTING.md](docs/TESTING.md),
   starting with backup restore and older Undo, before relying on the app daily.
3. Set up internal builds and store testing: the Expo project, a provisional
   bundle identifier, the developer accounts and signing.
4. Build the in-app unlock and five-habit limit, which need a development build
   rather than Expo Go, and the first-run walkthrough that replaces the
   development preset habits in release builds.
5. Build the Loop import, tested on real Loop backups.
6. Add crash reporting and analytics, with matching privacy disclosures.
7. Discuss an explicit “skipped/not applicable” value before relying on streaks,
   so intentionally skipping a habit need not look like a missed day.
8. Design comments, including whether they attach to a habit, a day or an entry.
9. Choose the final name and bundle identifier before store submission.
10. Last: an F-Droid build without proprietary libraries.

This ordering is an assistant proposal, not an approved requirement. Keep further
ideas connected to reducing cognitive friction rather than adding screen clutter.

## Decision discipline

Keep founder-confirmed requirements separate from proposals. Record meaningful
technical choices in [DECISIONS.md](docs/DECISIONS.md). Update this file as the
conversation develops; do not silently turn an experiment into a requirement.

# Habit statistics

Tap a habit name to see how it is going: a headline for the chosen period,
streaks, charts of success and totals, and a calendar where past days can be
corrected. Choose 30 days, 90 days, a year or all time, each ending today, and
step back through earlier periods with ‹ ›. The habit's note lives on the Notes
tab of the same sheet; see [DESCRIPTIONS.md](DESCRIPTIONS.md).

Full-screen statistics with streaks, success-rate charts and numeric charts were
a founder request, implemented 4 October 2026. The founder-directed layout and
chart revision of 10 October 2026 has been reviewed on the Android phone; iPhone
review is pending. Calculation rules are assistant implementation choices unless
marked founder-confirmed. Effective-dated goals, weekday schedules, period
quotas and on/off cycles are covered in [GOALS.md](GOALS.md). Skipped or excused
days, manual success overrides, rolling windows and comments remain deferred.

## Opening and dismissal

Statistics opens in a native sheet, matching History and Settings (founder
request for bottom-up entry and easy downward dismissal). On iOS this is the
UIKit page sheet, which owns the slide and interactive swipe dismissal; the
content is an ordinary native ScrollView. On Android, `SheetModal.tsx` provides
a gesture-handler sheet that a downward drag closes when the touched content is
at its top. Pull down from the header or the top of the content, or use the
accessible Close button; from deeper content, scroll back to the top first. The
founder confirmed the sheet on the iPhone. Short/reversed drag, nested-editor
and Reduce Motion checks are in [TESTING.md](TESTING.md).

The mounted grid keeps its viewed dates and scroll position beneath the sheet.
`App.tsx` hosts statistics and its numeric, habit, note editor, note sheet and
version dialogs in the same presentation tree, so nested editors present above it and
save failure/retry stays visible inside the sheet. Edits update derived
statistics without separate statistics events.

`HabitDetailsScreen.tsx` holds Notes and Statistics as two tabs in one sheet.
A name tap opens Notes when the habit has any note and Statistics
otherwise. The header has an X to close, the habit name, and a pencil that edits
the shown note on Notes and the habit on Statistics. A floating bottom
Notes/Statistics switch and horizontal swipes share native paging through
`useHabitPages.ts`. Panels keep their scroll, range and chart state, and the
measured height of the switch pads the bottom so the last controls stay
reachable. Notes never change statistical calculations.

## Screen layout

The founder found an earlier version cluttered, especially a goal card at the
top, and asked for chart explanations to sit behind an information control
because the screen is visited daily. Earlier, the founder had also asked for a
plain summary instead of a large marketing-style percentage. The current order
for checkbox and Daily total habits (`HabitStatsScreen.tsx`) is:

1. **Range tabs:** 30 days, 90 days, Year (365 days) and All time. They show two
   per row once the combined app/system text scale exceeds 130%.
2. **Period dates** with ‹ › to step back by whole ranges. A future start date
   shows “Starts” and the date instead.
3. **Headline** with a short note. Checkbox habits show, for example, “20 of 30
   days” and “67% successful”. Number habits show the period's figure for how
   their days combine (see [How number days combine](#how-number-days-combine)),
   for example “233 hours” and “Total · recorded on 28 of 30 days”, or “8.3
   hours” and “Average · recorded on 28 of 30 days”.
4. **Number tiles** in an even two-column grid. Number habits add Days meeting
   the goal (when a goal applies), then by combine choice: Total adds Average
   per day and Highest day; Average adds Change, first to last, Lowest and
   Highest; Highest and Lowest add Average and the other extreme. Current and
   Longest streak follow; without a goal, numeric habits show Days recorded in
   a row instead. When the count would be odd, current and longest streak
   share one tile. Daily streak tiles are hidden while a period goal is active.
   (“Best day” was renamed Highest day on 19 October 2026: for an “at most”
   goal or a fastest time, the highest day is not the best.)
5. **Goal row** (`GoalSummary compact`), opening the Goal editor. The habit
   editor keeps the full goal card.
6. **Period progress**, a compact card shown for the current window only.
7. **Charts**, by default in this order: Daily totals or Daily values
   (number habits), Success over time (Days recorded when there is no goal),
   Streaks, Calendar, By day of the week, then Time of day. Each habit can
   reorder and hide them (see [Customize](#customize)).
8. **Customize this page**, then **How statistics work**, a collapsed
   explanation.

On the web the page is wider (founder request, 19 October 2026): the
headline, goal and tiles form one band across the top, and the chart cards
flow below it in three columns (two at medium widths, one on a phone-sized
window). The earlier fixed overview column left empty space beside the
charts and is superseded.

Categories and Free text habits use `RecordStatsScreen.tsx` with the same range
tabs, dates, tiles, goal row, period progress and Customize. Their headline counts days
meeting the goal when one applies, otherwise days recorded. Recording tiles are
hidden when they would repeat the goal tiles. The sections are Categories
(Categories habits only), Success over time or Days recorded, Streaks, Calendar,
Time of day and a virtualized Entries list, followed by How recording statistics
work.

Every chart section has a title and an (i) button that expands its explanation;
nothing explanatory is shown by default. Live one-line facts, such as the
current trend, the longest streak in view or Most often 9 pm–10 pm, stay
visible. One reserved line under each chart names what the bars measure and
becomes the selected item's date and value, with ‹ › and an ✕ to clear it, so a
selection never shifts the screen. Metric values can wrap rather than push
labels off the screen. The previous-period comparison is no longer displayed;
its pure calculation remains available and tested.

Header Close and Edit are icons (X and pencil) in Notes and Statistics, and
header Close is an X in the other full-screen editors and sheets. Back links
keep text. The numeric entry dialog puts Close (X) at the top right and Done
beside the field, both above the keyboard.

`src/StatsLayout.tsx` owns the shared range tabs, ‹ › period stepping, titled
sections and tiles used by both statistics screens.

## How number days combine

Founder decision, 19 October 2026: a number habit is not always an amount
that adds up. Pages read or minutes walked add up, but sleep, weight, mood or
a resting heart rate are readings, where a total means nothing and a blank day
is not zero. Each number habit therefore chooses how its days combine, in
Customize (not when creating the habit, to keep that simple):

| Choice  | For                     | Period figure    | Weeks, months, weekdays  | Blank days    |
| ------- | ----------------------- | ---------------- | ------------------------ | ------------- |
| Total   | Pages, minutes, glasses | Total            | Average per calendar day | Count as zero |
| Average | Sleep, weight, mood     | Mean of recorded | Mean of recorded days    | Left out      |
| Highest | A personal best         | Highest day      | Highest day              | Left out      |
| Lowest  | A fastest time          | Lowest day       | Lowest day               | Left out      |

Total is the default and keeps every earlier rule, including the
founder-confirmed average over all calendar days. The choice applies to the
whole page (founder decision), so the headline, tiles, values chart, weekday
figures and calendar shading never disagree. Goals, success, streaks and
period quotas do not change with it: they judge each day against its goal.
Core `numberSummary.ts` owns the headline, note, tiles and wording;
`habitStatistics` takes the choice for weekday figures; `binValue` combines
weeks and months.

## Customize

Founder decision, 19 October 2026: the statistics page has an edit mode, so
each habit shows what matters for it (a weight habit can hide streaks).
Customize this page (at the end of the phone page; Customize in the web
toolbar) shows, for every section, ↑ ↓ to move it and Hide or Show; hidden
sections stay listed by title while editing. Number habits also get the
Combine days by choice, with one line explaining it. Reset returns the habit
to the default layout. Calendar days are not editable while customizing.

Each habit keeps its own layout (founder decision). It is a preference: saved
at once, outside History and Undo, and the same on every device through sync
(storage v25, [STORAGE.md](STORAGE.md#version-25-statistics-layouts)). Core
`statsLayout.ts` owns the section list per habit type, ordering, hiding and
normalization. The Entries list of Categories and Free text habits always
stays last. Per-section settings beyond Combine days by are not built.

## Windows and colour

- **Windows.** `statsWindow` gives the range ending today, stepped back by whole
  ranges; ‹ is disabled once the window reaches the habit's start. Charts and
  the calendar begin at the start when the window reaches further back. The
  headline, tiles, weekday and time-of-day figures follow the window. Current
  and longest streak tiles and current period progress always describe today.
- **One colour language** (`outcomeColours.ts`): met is the habit colour;
  scheduled but missed is the same hue faded; not scheduled is neutral grey.
  Combined weeks or months step brightness by the share of scheduled days met.

## Charts

Value axes sit in a shared 30-point column. Time ticks mark weeks (from the Week
starts on day) for windows up to about six weeks, months up to about 400 days,
and years beyond.

- **Daily totals** (number habits that add up): one bar per day for windows
  up to 100 days, coloured by that day's goal outcome. The effective goal is a
  dashed line that runs continuously across consecutive bars with the same
  target, or a faint band for a Between goal. Longer windows show the average
  per calendar day of each week (up to about 400 days) or month, counting
  blank days as zero, so the bars compare with the daily goal; brightness
  follows the share of scheduled days met. Bars always start at zero, because
  a bar's length is read as its value.
- **Daily values** (Average, Highest or Lowest): the same days, weeks or months
  as dots joined by a faint line, on an axis fitted to the values and the goal
  (two round steps, for example 7–9 hours, from core `fittedRange`), so 7.5 and
  9 hours look different (founder request, 19 October 2026). Longer windows
  show each week's or month's average, highest or lowest recorded day, titled
  for example Average each week.
- **Success over time:** faint columns are each week's share of scheduled days
  met (each month's beyond about 400 days). The line is a centred Gaussian
  smoothing of the success observations (sigma 7 calendar days, so about two
  weeks either side carry the weight). The founder found the first, one-sided
  weighted average jagged; the centred curve has no daily kinks, and at today
  only earlier days exist. It uses the whole history, so the value at a date
  never changes with the range. It skips days off, counts today only once it
  succeeds, and appears once about two observations are nearby. Period goals
  smooth finished whole periods over two periods. Habits without a goal show
  the share of days recorded.
- **Streaks:** a timeline (founder request, after a climbing-line chart broke
  down for long streaks). Each bar spans the calendar days a streak lasted and
  gaps are breaks, so 5-day and 500-day streaks read alike. The ongoing streak is
  brightest, a streak that began before the window is cut off square at the
  left edge, and bars wide enough show their length. Below it are the best three
  streaks of all time with dates. Runs carry across days off and rest periods,
  an unfinished today keeps the streak, and period goals count periods. The
  longest run equals the longest-streak tile and the ongoing run the current
  streak (tested). Windows up to about six weeks use one unlabelled full-width
  row. Longer ones get a row per month, and windows beyond about two years a row
  per quarter, so short streaks stay visible. Every row spans the full width
  with day 1 at the left, so days 1–31 line up down the rows; days outside the
  period or month stay darker. Row labels are short months in the same 30-point
  column as the other charts, with a year heading where rows cross into a new
  year. A streak crossing rows is one shape per row with square ends at the
  join, and shows its length on its last part.
- **Calendar:** windows up to 100 days show continuous week rows, starting on the
  Week starts on day, with values inside number days, category dots, and a dot
  for text. Successful days in a row join into one bar, bridged across days off
  within the row. Longer windows show compact months, three per row (four when
  there are more than 12 months); tapping a day there selects it and shows its
  reading with an Edit button. Met days use the habit colour, missed days a
  faint tint, days off stay close to the background, and today stays neutral
  until done. Without a goal, numeric intensity scales against the window's
  highest total, or for readings between its lowest and highest value (core
  `valueLevel`); zero stays coloured, blanks stay empty and future dates are
  dim. On the web, compact month days are squares that fill each column with
  the same small gap across and down. Day cells have no selection or Today border (founder request); Today is
  identified in its accessibility label. Numeric backgrounds dim separately from
  their text, and text contrast is chosen against the actual background so small
  totals and zero keep readable dates.
- **By day of the week** (checkbox and number habits): the share of each
  weekday's scheduled days that succeeded, or for numbers the weekday's
  figure by combine choice (Total: average per day with blank days as zero;
  otherwise the mean, highest or lowest recorded day), for the selected window,
  ordered by Week starts on. Shares and totals are bars from zero; readings
  are dots on a fitted track with its ends labelled.
- **Categories:** one row per category in saved order with automatic OKLCH
  colours (golden-angle hue steps from the habit colour, fixed lightness), as a
  timeline (days, or weeks/months shaded by how often) or by weekday. Rows never
  stack, because several categories can share a day. Tapping a row filters the
  calendar dots and the entries list; tapping again or the chip's ✕ clears it.
- **Entries:** a month-grouped journal, newest first: day number and weekday,
  category chips or text, goal status when an entry can miss its goal, and the
  entry time when it was made that day.

### Editing from the calendar

Tap a calendar day to toggle a checkbox or open the same daily editor as the
grid; the exact date goes to the same entry handler. In the current window,
future days that complete the last week row are shown and can be edited, but
stay out of every calculation until they arrive. Edits update charts and grid
values immediately and use normal saving, haptics, grouped History and
Undo/Redo. Numeric zero, blank-to-clear and Close keep their grid meanings. Save
failures disable edits and show the existing retry banner. Calendar checkboxes
expose their checked state to VoiceOver/TalkBack; other days announce the full
date and recorded value.

### Chart interaction

Every chart, including Time of day, uses `ChartFrame` (founder request). Tap a
bar to select it and tap it again to deselect. Hold for about 0.2 s and drag to
track through the chart with the thumb: a selection haptic confirms the hold,
the reading follows the finger (across rows on the streak timeline) and stays
after release. Step with ‹ ›, and clear with ✕. VoiceOver/TalkBack adjust item by
item, with a Clear selection action. A quick swipe still scrolls or pages: only
a hold starts tracking, and Notes/Statistics paging pauses while it lasts
(`ChartScrubLock`). Each chart has its own gesture-handler root view, because
the iOS page sheet has none. Selection follows a date key, not an array index,
so data changes never move it to another period; changing range or stepping
resets it. Tested in code and on Android; iPhone feel is pending.

`scripts/stats-series.test.mjs` checks day outcomes against `evaluateGoal` for
every sample habit and day, streak lines against the streak tiles, period
observations against period results, the trend weighting, bins, windows, axis
helpers and category colours.

## Calculation rules

- Read current values from the replayed projection, not a count of raw edit
  events. Corrections and Undo therefore affect a day only through its final
  current value.
- Future-dated values contribute to neither charts nor streaks until their day
  arrives.
- For legacy habits without an explicit start date, creation comes from
  initialization or the first saved definition. Use the event's captured UTC
  offset to identify its local edit day. Earlier dated entries extend the
  tracking start to their earliest date, including intervening days.
- Explicit start dates replace that inferred lower bound. Backdating includes
  empty elapsed days before app creation without needing a fabricated first
  entry. Moving the start forward excludes older records from all metrics,
  charts, comparisons and streaks, but never deletes values or events; moving it
  back includes them again. Future start dates show “Starts” and no eligible
  records until that date. Calendar and grid entries remain editable; entries
  before the start date stay saved, outside statistics. This is an
  implementation rule; the continuous calendar denominator is founder-confirmed.
- Founder-confirmed denominator: every calendar day from the habit's own start
  through today, intersected with the selected window. Activity in other habits
  never changes its start or denominator. Checkbox rates divide successful
  scheduled days by applicable scheduled days; the default schedule is every
  day. An unfinished today counts as a calendar day, so a new habit starting
  today shows 0% until checked. Days before the start and future days have no
  denominator. (This replaced an earlier unfinished-today grace for rates.)
- Archiving controls list visibility only; it does not pause the calendar
  denominator. Restoring, Undo/Redo or timestamp rollback in archive edits
  cannot change the period, and saved entries remain intact. (This replaced an
  earlier archive-pause implementation.)
- Checkbox streaks count consecutive successful scheduled dates; off-days are
  neutral. The current streak ends today if checked, otherwise yesterday, so an
  unfinished today has a grace period. A missing earlier day breaks the streak.
  Archiving does not bridge gaps.
- Founder-confirmed numeric averages for habits that add up (Total) divide
  the total by all calendar days in the period since the start, including
  blank days and today. Readings (Average, Highest, Lowest) use recorded days
  only; see [How number days combine](#how-number-days-combine). For example, 30
  minutes across four days averages 7.5 minutes/day even with only three
  records. Blanks stay blank in storage and daily charts; an explicit zero
  remains a recorded day. A period with calendar days but no records averages
  zero; a period before the start has no average. Without an explicit goal,
  numeric streaks mean consecutive days **recorded**. Explicit goals add a
  separate scheduled-day success rate and success streak.
- Current and best streaks use the entire history. Period totals, averages,
  rates, chart bins and weekday breakdowns use the selected window.
- Date arithmetic uses calendar-day ordinals rather than elapsed local hours,
  avoiding daylight-saving discontinuities.
- Settings → Week starts on (Monday by default, optionally Sunday) sets weekday
  order, calendar rows, week ticks and where weekly chart bins begin, so weekly
  columns and averages regroup when it changes. It never changes recording
  dates, window totals, rates or streaks, and saved goal periods keep their own
  anchors ([GOALS.md](GOALS.md)).

## Ownership and verification

`packages/core/src/statistics.ts` is pure derived logic. `src/HabitDetailsScreen.tsx` owns the
Notes/Statistics tabs and common header; `src/HabitStatsScreen.tsx` owns
checkbox and Daily total statistics, and `src/RecordStatsScreen.tsx` with pure
`packages/core/src/recordStatistics.ts` owns Categories and Free text. Pure `statsSeries.ts`
owns day outcomes, bins, observations, the smoothed trend and streak runs.
Nothing is stored separately; the change log and its replayed projection remain
authoritative (see [STORAGE.md](STORAGE.md)).

`node --max-old-space-size=256 --test --test-timeout=15000 scripts/statistics.test.mjs`
covers per-habit calendar denominators, unfinished today, streaks, zero versus
blank, future exclusion, archive/restore including Undo/Redo, backdating,
timezone offsets, DST dates, leap years, weekday/bin partitioning, previous
periods, independence from other habits, clock rollback, and unchanged legacy
backup fixtures. Native chart interaction, VoiceOver/TalkBack, larger text,
landscape and animation feel remain device acceptance checks in
[TESTING.md](TESTING.md).

## Reviewing with fictional history

Settings → Development → Sample data supplies 180 days for every preset without
mixing with real entries. Read has increasing minutes; Drink water has decimal
values, zeros, and missing days. Go for a walk has a recent uninterrupted streak;
Meditate has a recent gap. Stretch/Learn trend upward, while Write a little
trends downward; outdoor/cooking/contact habits vary by weekday. Today is partly
recorded, and no future sample entries are generated. These are synthetic UI
test scenarios, not proposed habit targets or product scoring rules.

Test all four ranges, ‹ › stepping, chart selection and tracking, weekday bars
and the calendar. Settings can reset the sample or return to real data. Sample
edits are session-only; see [DEVELOPMENT.md](DEVELOPMENT.md) for the startup env
switch.

## Categories and Free text

Both types show recorded days out of all eligible calendar days since the habit
start, logging streaks, the Days recorded (or Success over time) chart, an
editable calendar and a virtualized dated entry list. These are recording metrics; explicit goals add
separate scheduled-day success counts, rates and streaks. Streaks exclude
pre-start and future entries and allow an unfinished today, as other types do.

Categories show days each stable option was selected, including archived options
when they have records. Counts are not mutually exclusive: selecting several on
a day counts that day for each option. Shares divide by all eligible calendar
days of the selected window. Text entries preserve full strings; list previews
are bounded to three lines and open the same daily editor as the grid.
Corrections update all derived views and use normal Undo/Redo. Range and scroll
state stay within the Notes/Statistics sheet. Sample mode adds Workout and Daily
highlight with sixty days of fictional records, isolated from real data.

## Effective-dated goals

Goal opens the condition/repeat/date form from Statistics, with its timeline one
tap away. Each date uses its effective rule and schedule, retaining historical
results when a new goal starts today. Success charts and weekday rates use
applicable-day denominators; Track only and off-days contribute no failure.
Today counts toward rates with the existing streak grace. Numeric totals and
averages and category frequency/recording metrics remain separate. The Daily
totals chart draws the goal as described under [Charts](#charts). Calendar and
grid accessibility announce dated goal state. Editing an earlier goal is
explicit and undoable without replacing any entries. See [GOALS.md](GOALS.md)
for full semantics and tests.

## Fixed-period results and cycles

`goalTiming.ts` supplies anchored on/off eligibility to daily statistics. Off
dates are neutral; cycles may be in days or seven-day weeks.
`periodStatistics.ts` counts distinct dates meeting the daily condition into
saved fixed windows. `PeriodProgress.tsx` shows current progress plus expandable
recent results. Open periods, rest periods and boundary fragments are distinct
from failed finished periods. Only complete finished windows wholly in the
selected range enter its period totals. Period streaks are all-time; raw logging
metrics stay separate. Daily success streaks are hidden while a period goal is
active. See [GOALS.md](GOALS.md).

## Time of day

Added 10 October 2026 (founder request). Both statistics screens show a Time of
day section: 24 hourly bars for the selected window, the most common hour, and
how many of the window's recorded days the chart covers. Tap or track a bar, or
use the VoiceOver/TalkBack adjustable actions, to inspect an hour.
`packages/core/src/timeOfDay.ts` owns the pure calculation; `src/TimeOfDayChart.tsx` is the
shared chart.

Founder decisions:

- Only entries recorded on the same local day they belong to count. Backdated
  entries stay in every other statistic but are left out of this chart; the
  caption says how many were left out.
- Undone changes never count, here or in any other statistic.

Assistant choices:

- Times use the UTC offset captured with each edit, so an entry made while
  travelling keeps the local time where it was made (recommended and accepted
  by the founder).
- The time counted is when the entry last went from empty to recorded. Later
  corrections, such as raising a numeric total, keep that time; clearing and
  re-entering it later moves it. A correction group counts from its first edit.
- Checkbox Off (an explicit 0) is not a recorded entry; numeric zero, text and
  category selections are. Days that succeed only through a dated checkbox
  default have no tap and no time.
- The period is the selected window, bounded by the habit's start date.

The calculation reads the active History actions (`replay.undo`), which already
exclude undone groups and restore redone ones with their original time. No
event, preference, schema or backup format changes. Sample presets record
deterministic typical times of day (for example Meditate around 6:45, Read
around 21:30), sorted within each day so History stays in time order. Sample
Workout/Daily highlight records are entered on a later day and show the empty
state. `scripts/time-of-day.test.mjs` covers offsets, backdating, Undo/Redo,
corrections, checkbox Off, numeric zero, period bounds and the sample shapes.

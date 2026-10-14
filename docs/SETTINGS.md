# Settings

Settings adjusts how the grid looks and behaves: theme and background, grid
sizes, text size, checkbox style and a few daily-tracking options. These
preferences are saved on the device and included in backups, but never appear
in History or Undo. Archived habits and backups are also reached from Settings.

The first settings (row and column spacing) were a founder request, along with
“a couple of genuinely useful additional settings”; week start and date fading
were the assistant's choices within that scope. Date fading was later removed
(12 October 2026).

## Controls and defaults

In on-screen order. Defaults come from `displayDefaults` in
`displayPreferences.ts`, the `defaultBackgrounds` in `theme.ts`, and the
automatic rules in `gridSizing.ts`.

| Page           | Control              | Default | Purpose                                                                                                        |
| -------------- | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| Appearance     | Theme                | Dark    | System / Dark / Light. System follows the phone's light or dark mode.                                          |
| Appearance     | Dark background      | Black   | Six presets or a custom colour, fitted to a readable dark range.                                               |
| Appearance     | Light background     | Paper   | Six presets or a custom colour, fitted to a readable light range.                                              |
| Appearance     | Name column          | Auto    | Slider, 96–240 points in 4-point steps, with Reset to automatic.                                               |
| Appearance     | Day columns          | Auto    | Slider for the minimum day width, 40–80 points in 2-point steps. Whole days then fill the available width.     |
| Appearance     | Rows                 | Auto    | Slider for the minimum row height, 40–80 points in 2-point steps. Larger text and wrapped names can grow rows. |
| Appearance     | Text size            | 100%    | One app-wide slider, 85–150% in 5% steps, with Reset to 100%. Includes descriptions and their editor.          |
| Appearance     | Checkbox style       | Circles | Squares, Circles or Ticks & crosses (Circles saves Round checkboxes with the Checkboxes style).                |
| Appearance     | Streak numbers       | On      | Checked boxes show their place in the streak instead of a tick (Squares and Circles). See [Cells](#cells).     |
| Appearance     | Joined checkboxes    | On      | Consecutive checked boxes joined by a bar (Squares and Circles).                                               |
| Appearance     | Connector thickness  | 55%     | Bar height, 20–100% of the checkbox in 5% steps; shown with Joined checkboxes.                                 |
| Appearance     | Tap animations       | On      | A short pulse on the tapped checkbox or mark.                                                                  |
| Appearance     | Missed day crosses   | On      | A quiet cross on past scheduled days that missed; unscheduled days stay blank.                                 |
| Appearance     | Week dividers        | On      | Faint alternating week backgrounds in the date headings.                                                       |
| Daily tracking | Hide completed today | Off     | Hide rows meeting their dated success goal at Today, with Show completed for corrections.                      |
| Daily tracking | Haptic feedback      | On      | Enable or disable action feedback.                                                                             |
| Daily tracking | Week starts on       | Monday  | Monday or Sunday. See [Week start](#week-start).                                                               |

Appearance groups its controls as Theme, Size, Checkboxes and Days under one
live grid preview. On portrait phones the preview stays pinned above the
scrolling controls, so every grid setting changes something visible (its
Preview bar collapses it, remembered until the app restarts); in
landscape or on short screens it scrolls at the top of the page. It draws the
dates with the grid's own painter (`canvasGrid/cellPainter.ts`): real dates
ending Today, week shading, and sample days showing a streak, a missed day and
an unscheduled day, in the current theme. Slider drafts show while dragging.
The grid itself changes when Settings closes; see
[Changes while Settings is open](#changes-while-settings-is-open) and
[Grid sizes](#grid-sizes).

## Navigation

`SettingsScreen.tsx` owns a compact index (founder request for a calmer layout
with room for more settings). **Preferences** holds Appearance and Daily
tracking; **Your data** holds Archived habits (with a count) and Backups.
Development tools, including sample data and preview sharing, sit behind one
Development row and are excluded from release builds. Detail pages have a Back
control (the background pages return to Appearance) and Close, with grouped
rows, switches and segmented choices.

Save errors and Retry remain visible on every settings page, and controls are
disabled while saving is blocked or backup work owns the store. Backup
validation, confirmation and recovery are described in [STORAGE.md](STORAGE.md).

At the founder's request, explanations sit behind `InfoNote.tsx` disclosures
(About appearance, About daily tracking, About backups): labelled, 44-point
accessible controls, collapsed by default, that preserve text scaling. Save
status and errors stay direct.

## Persistence and History

Preferences are global and persist through the same queue and atomic
transactions as habit changes. They are included in backup/restore and remain
outside visible History and Undo/Redo. Corrections can still group across a
preference change, and settings do not clear Redo. Sample-mode preferences are
session-only in its isolated store; use real data to test persistence.

Each preference arrived with a storage version: row spacing in v5; column
spacing, week start and date fading in v6; text size in v8; Hide completed today
in v9; checkbox style in v15; week dividers and tap animations in v16; revised
column spacing and name width in v17; grid size sliders in v18; theme and
backgrounds in v19; and the cell look in v20. Absent fields preserve earlier behaviour without rewriting
old logs, and newer preferences disguised as older events or habit actions are
rejected. Grid sizes, theme and cell look preferences record `before: null`
until first chosen, so their defaults are display rules. See [STORAGE.md](STORAGE.md) for
the current version.

## Changes while Settings is open

Settings, History, statistics and dialogs use a new value at once, and every
change is saved immediately. The mounted grid behind the sheet holds its
presentation until the sheet finishes dismissing, so rapid choices cause one
final grid layout change instead of repeated hidden rebuilds (the founder had
reported slow spacing feedback when every choice relaid the hidden grid).

`useGridDisplayPreferences.ts` defers these grid preferences while
History/Settings/archive is open or dismissing: theme, Name column, Day columns,
Rows, text size, checkbox style, week dividers, tap animations and week start.
Hide completed today is not deferred: filtering is applied behind
Settings as soon as the switch changes, so completed rows have already gone on
return. Haptic feedback takes effect immediately.

`AppPanel`'s native `onDismiss` releases only the latest values, whether the
sheet closes by button or swipe. An inner TypographyProvider keeps the hidden
grid's font context stable while Settings scales. The grid stays mounted,
retaining its date range, viewed day and scrolling state; necessary
width-related list remounts happen after dismissal. Entry subscriptions, save
failure/retry and archive restores stay live, and native rotation or system text
changes are not frozen.

## Grid sizes

Founder request (9 October 2026): replace the three-choice spacing controls with
sliders, and stop narrower phones getting a sparser grid. `GridSizeSettings.tsx`
starts with a live preview (the first three active habits, or demo habits when
there are none, at the real grid width, scaled to fit, with “N days fit on this
screen”), then the Name column, Day columns and
Rows sliders. Dragging updates the preview only; releasing saves one preference.
Each slider shows “Auto · N” until moved and has Reset to automatic.

Automatic sizes (assistant rule, `gridSizing.ts`): name width is 40% of the grid
between 120 and 200 points; days are at least 48 points; rows are 6% of the
physical screen's longer side, rounded to 2 points, between 44 and 56. All scale
with text size. A 402-point iPhone 16 Pro keeps its earlier 146-point names,
48-point days and 52-point rows. A 360-point Galaxy S21 gets 130-point names,
four days and 48-point rows instead of three days and 52-point rows. The
physical screen, not the app window, sets row height, because Android windows
exclude system bars.

`gridLayout.ts` and `rowSpacing.ts` turn these into geometry. Day columns are
rounded to whole physical pixels on all platforms, with the name column taking
the remainder, so the canvas grid draws crisp edges. Sizes are shared by date
headings, cells, not-yet-prepared dashes and reordering. Measured names stay
authoritative: wrapped names and numeric units can make a row taller than its
setting. Changing day columns preserves the name-column width and keeps the
rightmost viewed date, as rotation does. Text scaling takes
precedence over fitting many days, so when only one readable column fits,
different sizes can converge. Changing sizes keeps habit order, entries and the
horizontal position.

### Legacy spacing values (v5–v17) and how they map to v18

Earlier choices keep applying until the matching slider is moved; raw backup
records and old replay preconditions are never rewritten.

- **Row spacing (v5):** Compact 44, Standard 52 and Roomy 64 minimum heights.
  Compact and Roomy now display as 44 and 64; Standard means automatic.
- **Column spacing (v6–v16):** Compact 48, Standard 64 and Roomy 80 target
  widths. When v17 relabelled the choices, an absent or old Compact value
  displays as the new Standard and old Standard/Roomy as the new Roomy
  (`effectiveColumnSpacing`); the old 80-point option was dropped.
- **Column density (v17):** Compact 44, Standard 48 and Roomy 64. Compact and
  Roomy now display as 44 and 64; Standard means automatic (48).
- **Name column width (v17):** Narrow, Standard and Wide at 80, 100 and 120% of
  the automatic width. Narrow and Wide keep scaling the automatic width
  (`nameFactor`) and do not show as Auto; Standard means automatic.

## Text size

The founder asked for one setting throughout the app rather than a separate size
for descriptions. The app size multiplies the system text size; native system
dialogs keep the system setting alone. Fixed decorative checkmarks, emoji and
vector icons keep their control geometry. Native text and inputs share
`Typography.tsx`; nested spans inherit the scaled parent without double scaling.
The DOM description editor receives the same combined scale.

The slider previews its percentage while dragging and saves once on release.
At larger sizes rows grow, fewer day columns fit, settings choices wrap and the
statistics calendar grows. Smaller text never shrinks touch targets below their
minimums.

## Checkbox style, week dividers and tap animations

**Checkbox style** offers Checkboxes (default) and Ticks & crosses. Both scale
with the same app/system text size as the grid, bounded by row and column
geometry. The shape shows the dated On/Off state; the success tint still follows
the habit's goal.

**Week dividers** shade alternate calendar weeks with faint backgrounds confined
to the date headings; their boundary follows Week starts on. Off leaves the
headings on the background, with Today still highlighted. The quiet header
border is continuous in either mode, preserving contrast for the future-pull
streak, and habit cells are never shaded. The fixed name/day separator stays
visible regardless of this setting.

**Tap animations** Off suppresses checkbox and mark pulses; it does not affect
haptics or navigation. Reduce Motion suppresses the pulse even when the toggle
is On. A separate rest-day setting was declined; scheduling belongs to dated
habit goals ([GOALS.md](GOALS.md)).

## Cells

Founder decisions (12 October 2026), first tried behind development switches
and then moved into Appearance as saved preferences. By default the grid shows
Circles with streak numbers, joined checkboxes (55% connector) and missed day
crosses. Defaults are display rules (`cellLookDefaults`), so they can change
without rewriting saved data.

- **Checkbox style** offers Squares, Circles and Ticks & crosses. Circles is the
  Checkboxes style with `roundCheckboxes` on; the two are saved separately.
- **Streak numbers:** each checked box shows its position in its run of
  consecutive checked days, from 1, instead of a tick. The count runs back to
  the start of the streak beyond the visible dates (up to ten years) and
  updates newer days after an edit.
- **Joined checkboxes:** consecutive checked boxes are joined by a bar thinner
  than the boxes, so the boxes stand out from it; cell backgrounds stay full
  squares. A tap that makes or breaks a join animates it: the bar grows out of
  the neighbour into the tapped box, or retracts into the neighbour, and the box
  it reaches bumps slightly at the moment of contact. Tap animations and Reduce
  Motion gate this like the pulse.
- **Connector thickness:** the joining bar's height, 20–100% of the checkbox,
  saved on release.
- **Missed day crosses** (default On): on days before today, a scheduled day of
  a daily goal that was not met shows a small quiet cross; an unscheduled day,
  or a day before the start date, stays blank. Weekly quotas and tracking-only
  habits never mark a single day as missed.

Streak numbers, Joined checkboxes and Connector thickness apply to Squares and
Circles and are hidden for Ticks & crosses. Outlines only on Today (empty boxes
only in the Today column) was tried and removed the same day because it looked
odd; its saved choice still replays but is no longer drawn. Shading cells by
progress toward a numeric goal was declined: it makes values harder to read.

## Removed: Fade distant dates

Founder decision (12 October 2026): the grid no longer dims empty older or
future dates, because the fading was confusing. Every date uses one tone. The
saved `dateFading` preference still replays from older logs and backups but has
no effect.

## Week start

Week starts on (Monday or Sunday) affects:

- weekday order and week rows in the statistics calendar and weekday breakdowns;
- where weekly chart bins and week ticks begin in statistics;
- the alternating week shading in the grid's date headings;
- the History calendar's month and year views, and on Android the app's own
  `DateCalendar` date pickers;
- the anchor suggested for a new weekly period or cycle in the Goal editor.

It never changes recording dates, totals, rates or streaks. Saved goal periods
keep the anchor they were created with ([GOALS.md](GOALS.md)).

## Hide completed today

Off by default, preserving stable row positions. When on, rows meeting their
dated success goal hide while the grid is at Today. A Show completed count below
the rows reveals them for corrections and statistics; Hide completed returns to
filtering. Past and future browsing shows the full list. The temporary reveal is
not stored, and the next local day starts a fresh view. The Today-only scope,
quick reveal and initial Off state were assistant choices; the founder confirmed
the layout and hide/reveal behaviour on the phone. Newly completed rows wait for
a pause before collapsing; see
[HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md#quick-undo-and-row-removal).

`habitCompletion.ts` uses the effective-dated rule for each habit. Numeric,
category and text habits remain visible unless an explicit goal is met; a record
alone does not imply success. Explicit zero can meet an explicit numeric rule.
Entries, History and statistics are never deleted or filtered. See
[GOALS.md](GOALS.md) for off-day and goal-change semantics.

`completedHabitsSelection` subscribes to a primitive mask of today's completion
states only when filtering is enabled. Numeric edits notify the grid container
only when crossing the goal threshold; other dates and save acknowledgements
leave the mask unchanged. Filtering adds no per-frame JavaScript scroll
synchronization. Reordering displayed rows fills only their saved slots; hidden
and archived habits retain theirs, and the full order is saved as a normal
undoable event.

`hideCompleted` is a strict boolean preference whose absent value resolves to
false. It survives reload/backup/restore, preserves Redo and does not interrupt
correction grouping.

## Theme and backgrounds

Founder request (10 October 2026): a dark, system or light theme whose
background can be customised, with the rest of the app adjusting so it stays
readable. Founder decisions: both Dark and Light are customisable, with System
switching between them; the defaults are **Dark** and **Paper** (`#F6F3EC`, a
warm off-white). Older logs and new installs show these until a choice is made.

Appearance starts with **Theme**, then **Dark background** and **Light
background** rows showing the current name and swatch. Each opens a page with a
live grid preview in the draft colour, six presets, Hue / Colourfulness /
Lightness sliders (the OKLCH sliders from the habit colour picker), hex entry
and Reset. Apart from Black, the dark presets are deliberately deep, at OKLCH
lightness 0.15–0.16. Sliders preview while dragging and save once on release;
presets and hex save immediately. Lightness is limited to a readable range for
each scheme (dark at most OKLCH 0.34, light at least 0.86, colourfulness at most
0.12). A typed colour outside it moves to the nearest readable colour, with a
note saying so. Saved colours are never rejected; the range is applied at
display time. The page also says whether that background is in use now.

How colours adapt (assistant design, `packages/core/src/theme.ts`):

- Every interface grey was designed on black. `ink(level)` keeps each grey at
  the same relative contrast against the active background, on a log contrast
  scale between the background and the opposite pole. On black every grey and
  colour is exactly the original, so the default dark look is unchanged.
- Surfaces near a tinted background carry its hue; text tends to neutral.
- Habit and accent colours are shown with at least 4.5:1 contrast. Only OKLCH
  lightness moves, so hue and colourfulness are kept. All presets are unchanged
  on black. A custom colour too dark to read on black is shown lighter instead
  of falling back to grey in some places. The saved colour is never changed:
  the colour picker shows the adjusted colour and says so.
- Empty-cell blends, tinted completed cells and chart fills are mixed against
  the active background.
- Marks on filled colours are white when white reaches 3:1, otherwise black.
  This gives white ticks on the deeper light-theme colours; presets on black
  keep black ticks.
- Note highlights switch to pale marks with dark text on light backgrounds. The
  DOM editor receives the theme as CSS variables (`richText/editorTheme.ts`).
- Native alerts, keyboards and date pickers follow the theme through
  `Appearance.setColorScheme` (System hands control back to the phone), and
  `app.json` uses `userInterfaceStyle: automatic`.

## Device checks

Still to confirm on phones (see [TESTING.md](TESTING.md)):

- Grid sizes in both orientations and with larger text; quick scrolling,
  revealing future dates and returning to Today; press responsiveness and a
  correctly aligned grid after Settings dismisses.
- Switching week start: dates line up with headings and keep their entries.
- After reloading real data, preference changes neither appear in History nor
  consume Redo.
- Keyboard, clipping and interaction comfort at large text sizes.
- Themes: System switching with the app open; Dark/Light overrides of native
  alerts, keyboards and date pickers (especially Android, where the override
  goes through AppCompat night mode); status bar contrast; the note editor in
  each theme; and the first-launch colour behind the splash (`app.json` still
  paints black before JavaScript runs).

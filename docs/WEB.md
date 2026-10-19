# Web app

The browser version of OnPurpose lives in `apps/web`. It is designed for
browsers rather than copied from the phone screens, and it shares every rule and
data format with the phone app through `@onpurpose/core`.

Status: the home grid (layout A, below) records all four entry types, follows
the saved theme and cell look, and supports Undo/Redo (buttons, Ctrl+Z,
Ctrl+Shift+Z or Ctrl+Y) and the four-second quick undo. Habits can be added,
edited, reordered and archived, and each has a Notes/Statistics dialog.
History has its own panel, and Settings covers appearance, grid sizes, daily
tracking, backups and archived habits. Goals and notes can be edited. A quiet
sidebar holds everything around the grid. Optional sync (Settings → Sync,
see [Sync](#sync)) works against the development server.

## Home grid (layout A)

The founder chose this layout from mockups (see DECISIONS.md, 13 October 2026).

- **Today stays near the names.** The grid is centred and about three weeks
  wide (`VISIBLE_DAYS` in `HabitGrid.tsx`) with square 56 px cells (46 px at phone width), instead of
  filling a wide screen. Oldest days are on the left and Today on the right,
  as on the phone. 120 days are rendered at first; nearing the oldest one
  loads another 120 (up to about ten years) without moving the days in view.
- **The grid scrolls inside itself, never the page.** Day headings stick to
  the top and names to the left, so long habit lists scroll without moving
  the top bar. Keyboard focus scrolls cells clear of both (`scroll-padding`).
- **Today is emphasised:** a header pill labelled "Today", a faint column with
  hairline edges, and the Today button (or T) returns there and focuses it.
  While scrolled back it reads "Today →".
- **Rows highlight** under the pointer or keyboard focus, and the hovered
  day's heading lights up. The corner names the months in view ("September –
  October 2026").
- **Scrollbars sit outside the grid.** The browser's own bars would run
  beside the pinned headings and under the pinned names, so they are hidden
  and `grid/Scrollbars.tsx` draws thin bars in a 12 px gutter outside the
  cells (`--scroll-gutter`): the vertical one to the right, starting below
  the headings, the horizontal one just under the last row, starting right
  of the names. They appear while scrolling or under the pointer,
  can be dragged or clicked to page, and are hidden on touch screens. Wheel,
  touch, keyboard and focus scrolling stay native, and positions are written
  to the DOM directly, so scrolling never re-renders React.
- **Drag to fill:** with a mouse, trackpad or pen, press a cell and drag along
  its row to fill it; the row is fixed, the grid scrolls itself near its
  edges, and touch keeps native scrolling. A trackpad's tap-and-drag reaches
  the page as one press (its first tap never arrives as a click), so a plain
  press-and-drag fills too. When the press continues a click on the same cell
  (within `FILL_DOUBLE_CLICK_MS`, the usual 500 ms double-click time, even on
  an entry popover's backdrop over that cell, which it closes), checkbox runs
  take the state that click gave the start cell; otherwise they take its
  opposite, start cell included. The run stays highlighted until the fill
  completes. Number, text and category cells open their popover
  `VALUE_OPEN_DELAY_MS` after a click (the keyboard opens at once); a drawn
  run opens that popover in fill mode, titled with `dateRangeLabel`, and Done
  saves one change. Escape cancels. `grid/fillWave.ts` maps the pointer to
  days and plans the fill as one stroke (core `fillStrokeAtMs`): every moving
  bar half animates the same registered `--p` and shows its part of the bar
  from where it starts along the stroke, so the bar grows (or is erased)
  through the cells in one motion. Each box keeps its old look and streak
  number until the stroke reaches it, then fills and bumps (or empties with a
  press), and highlights fade as it passes. A press-and-drag that changed the
  start box moves its join with a ticked day behind as a tap would. Popovers
  ease in from their cell (a fade with Reduce motion).
- **Tap animations** (the shared v16 preference, also off under Reduce
  Motion): a tapped box pulses (1 → 0.94 → 1); a join grows out of the
  checked neighbour into it with ease-out over 220 ms, and clearing retracts
  it into the neighbour with ease-in-out over 180 ms (timing in core
  `tapMotion.ts`). Both halves follow one registered `--reach` property, so
  the bar moves on one curve across the cell boundary. The box it reaches
  bumps to 1.07 when the bar touches it. The tapped cell's background fades
  to its new one (kept under Reduce Motion). Only taps in the grid animate,
  never Undo, other edits or loading.
- **Values:** numbers shrink to fit their column (to about 65%); text and
  category cells use the phone's 12 px text in one to three lines from core
  `gridEntryText.ts`, at a fixed width so columns stay equal, with the full
  value on hover.
- **Keyboard:** one roving focus moves with the arrow keys (Home/End jump to
  the oldest day and Today); Space or Enter toggles a checkbox.
- **Cells follow the phone's rules** from core `cellAccessibility.ts`
  (`cellState`, `checkedStreak`, screen-reader labels) and the saved cell look
  (Circles/Squares or Ticks & crosses, joins, streak ends only, streak
  numbers, missed-day crosses, connector thickness). Background precedence is goal met > Today >
  plain.
- **A quiet second line** under each name comes from core `habitSummary.ts`:
  open quota progress ("1 of 2 this week"), else the goal rule with any
  non-daily schedule, else a plain checkbox's schedule, else "Track only".
  It is hidden at phone width.

The font is set once, as `--font-ui` at the top of `src/styles.css`: the system
font for now (as on the phone). Grid sizes are the `--name-width`, `--column`,
`--row` and `--box` variables beside it; `grid/gridSizes.ts` overrides them
from the saved grid sizes. The grid measures itself to whole day columns and
horizontal scrolling snaps to days, so no column is left half hidden behind
the names. At phone width names take 40% of the screen and may wrap to two
lines.

Rows redraw only when their own saved values, the cell look or the visible
days change (`HabitRow` compares a per-habit value signature), so an edit
redraws one row rather than the whole grid.

## Views

The top bar's left corner holds the view menu (`ModeMenu.tsx`), with the same
four views as the phone (core `gridModes.ts`). Each browser remembers its own
choice in `localStorage` (`onpurpose.gridMode`); it is not a saved preference.

- **Grid**: the home grid above.
- **Compact**: the same `HabitGrid` with `compact`. Icons (or initials)
  replace names in a 56 px column, so the same width holds more days. The
  icon opens Notes and Statistics; right-click or Shift+F10 opens the actions.
- **Today**: `grid/TodayTiles.tsx` shows one tile per displayed habit in the
  saved order, under the date and a quiet count ("5 of 13 done · 1 not
  today", core `todaySummary.ts`). A tile is the name cell over the Today
  cell: icon, name and the grid's line (`habitSummary`: schedule, rule or
  quota progress; "Not today" dims a tile that is unscheduled and not done),
  then the checkbox drawn with the saved cell look (round, streak number,
  Ticks & crosses, tap pulse), the recorded value with its unit, or, for a
  blank number, its most usual total as one "Usual" chip with the unit that
  records in one tap (`GridHandlers.saveValue`, with a Quick Undo receipt)
  beside "…" for the popover. Other types open the entry popover. Every
  tile has the same fixed height (about 2.5 Rows sizes; a two-line name, one
  summary line and the cell), so rows never stretch. Arrow keys move one
  roving focus between tiles (up and down by a row of tiles), Home and End
  to the ends. A slim row along the tile's bottom (20 px added to its
  height) holds a Notes button and a Statistics button that open the habit's
  page on that view (a trial, 18 October 2026; Notes is fainter while the
  habit has none), and a right-click opens the habit's actions.
- **Weeks**: `grid/WeekGrid.tsx`, a table in the same frame with one column
  per calendar week (the current one at the right; 53 weeks at first, more
  load near the oldest, up to about ten years). Each cell shows a number over
  seven day dots from core `weekSummary.ts`. Choosing a cell opens that week
  in Grid or Compact (whichever was used last) through `HabitGrid`'s
  `startAgo`. Weeks is read-only.

## Sidebar and shortcuts

The OnPurpose brand links to the landing page (`src/config.ts`: `/` in builds,
the landing development server in development, which `npm run web:dev` starts
alongside this app).

A quiet sidebar on the left (`Sidebar.tsx`, founder request, 14 October 2026) holds what surrounds the grid, which stays the only page: New habit;
Habits (the current page, with a count), History (toggles the docked History panel),
Archived and Settings; then where the data is kept ("Saved in this browser",
"Not saved yet" after a failed save, opening Backups), Keyboard shortcuts and
Collapse. It narrows to icons when collapsed (remembered per browser) or below
1100 px wide, and phones hide it and keep the compact top bar with History and
Settings icons. On wide screens the top bar keeps only Today, centred.

Keyboard shortcuts (`Shortcuts.tsx`, also on `?`): T goes to Today, N adds a
habit, H shows or hides History, besides the grid keys and Ctrl+Z/Ctrl+Y.
Single-letter keys work only outside text fields and dialogs.

## Sample data (development)

`npm run web:dev` shows a Sample data switch in the sidebar (or add `?sample`
to the address). It opens the phone's fictional six-month history from core
`dev/sampleData.ts`, including number, text and category habits, goals and
notes, in a separate in-memory store; edits last only for that visit and
backups are off. Turning it off returns to the saved data, which sample mode
never touches. While it is on, a picker below the switch chooses the
development set or one of the five marketing presets from
`dev/samplePresets.ts`; `?sample=<preset id>` opens one directly (see
[DEVELOPMENT.md](DEVELOPMENT.md#marketing-presets)). Production builds leave
the sample code out (`import.meta.env.DEV`).

## Entering values

Number, text and category cells open a popover beside the cell (a bottom
sheet at phone width) on the native `<dialog>` element. The draft stays in the
popover: Enter (Ctrl+Enter for text) or Done saves with a fresh before-value,
and Esc, Close or the backdrop discard it. Numbers use core `parseDailyTotal`
and `recentNumericTotals`, exactly as the phone does. Categories created while
recording join the habit only on Done. Every entry and archive shows the shared
`quickUndo` receipt for four seconds.

## Habit details

Clicking a habit's name (or **Notes and statistics** in its menu) opens the
habit's page in a wide dialog over the grid (`panel/HabitDetails.tsx`; full
screen on phones): the name with its goal line and Edit habit. A toolbar under
the title switches between **Notes** (with the note count) and **Statistics**,
like the phone's habit sheet (founder decision, 17 October 2026: you read one
or the other, so neither is squeezed beside the other). The page opens on
Notes when the habit has any, otherwise on Statistics. In Statistics the
toolbar also holds the range tabs (30 days, 90 days, Year, All time), the
‹ period › stepper and Customize, so they stay put while the page scrolls;
Statistics stays
mounted once seen, keeping its range and scroll. The dialog is capped at
1160 px and has a steady height (the window less a margin, at most 1100 px),
so switching views or notes never resizes it. Esc, Close or a click outside
it closes it; editors, the goal editor, value popovers and the note naming
dialog open above it. Focus lands on the page itself, so the arrow keys
scroll it without a focus ring on a control.

Everything is a card with the same edge (`--card-edge`); tiles inside a card
are raised rather than bordered. The layout follows the dialog's own width
(container queries):

- **Wide:** a summary band across the top (headline, note and goal beside
  the tiles, then quota progress), and every chart card flowing down three
  columns below it, so cards of different heights leave no gaps and no chart
  is wider than about 360 px; the entries journal and How statistics work
  span the full width (founder decision, 19 October 2026; the earlier
  280 px overview column left empty space under it and is superseded).
- **Medium:** the band stacks the headline above the tiles, and the cards
  flow in two columns.
- **Phones:** one column, with the switch, the range tabs and the stepper on
  their own rows.

The Notes view (`panel/NotesView.tsx`, redesigned 18 October 2026 at the
founder's request) fills the dialog. A habit with one note shows just that
note, at full width, with Add note in its header, so a single note is not a
lesser experience. With several, a quiet list of notes (name and first words)
sits beside the open note, styled like the Settings sections: soft text, a
hairline divider, and the chosen note in full ink on a raised neutral, with
no habit colour (founder preference, 18 October 2026: coloured highlights
made the view feel immature); drag a card to reorder (the others slide aside;
core `moveNoteTo` makes one undoable change, or two when an older
description must first leave the definition), or use Alt with the arrow
keys; the arrows alone move between notes. When the dialog is narrow the
cards become a wrapping row of pills above the note. The open note sits straight on the dialog (no card), and its header (lined up with the reading column, about 720 px, centred on
wide pages) shows its name, when its words last changed, Versions, a ⋯ menu
(Rename, Move up, Move down, Remove, which asks first) and Edit, all as
quiet text buttons; only Save is filled. The rail and
the page scroll separately. Versions lists that note's text changes in
place, newest first, and each opens Before and After. Add note opens a small
naming dialog (`notes/NoteNameDialog.tsx`): your own name, or a suggestion
with its line on what it is for; the new note then appears in the rail and is
written in place, and Save adds it as one action (Cancel adds nothing). A
habit without notes shows the eight suggestions to start from. See
[DESCRIPTIONS.md](DESCRIPTIONS.md). History: the docked habit panel (founder
decision, 14 October 2026) was cramped at 440 px; the tabbed dialog that
followed left most of its Notes tab empty; a Notes card beside the statistics
(also 14 October) squeezed long notes, and gave way to this switch.

- **Notes** render from core's Markdown token stream as React elements: text
  is escaped, links pass core `descriptionLink` and open in a new tab, and
  images show only their alt text, so reading never loads remote content.
- **Statistics** use the phone's core calculations (`habitStatistics`,
  `recordStatistics`, `statsSeries`, `periodStatistics`, `timeOfDay`)
  with the same ranges, period stepping, headline, tiles and wording (core
  `numberSummary` for number habits). Customize (core `statsLayout`) adds ↑ ↓
  and Hide or Show to each card's header, Combine days by to the summary band
  for number habits, and Reset to default; see
  [STATISTICS.md](STATISTICS.md#customize). Charts
  are SVG in a shared `ChartFrame`: hover, or focus and the arrow keys, select
  a bar and one reading line (a live region) names it. Sections: daily totals
  or values (numbers; bars from zero for totals, dots on a fitted axis for
  readings), categories (with filtering), success over time with the trend,
  streaks, calendar, by day of the week, time of day, and an entries journal
  for text and categories. Calendar days tick checkboxes or open the entry
  popover.

## History

The sidebar's History item (or H) docks the History panel beside the grid,
which narrows to whole columns; below 1000 px wide the panel covers the grid
instead. Drag the panel's edge to resize it (or focus the edge and use the
arrow keys, Home/End, and Enter or a double click for the default 440 px); the
width is remembered per browser (`panel/PanelResizer.tsx`), and the grid keeps
at least 420 px. A habit's details can open over it. History uses core `history.ts` exactly as the phone does:
active habit actions in log order, grouped by the day they were made (Today
and Yesterday open; filtered lists open fully), neighbouring same-date
entries within five minutes collapsed into a burst, and entries for another
day marked "For <date>". Filters (kind chips and a habit picker) are view
state and apply to both views. **Days** is that list; **Calendar** shows a
month with a coloured dot for each habit changed each day ("+n" beyond four),
or a year with one dot per day in its most-changed habit's colour, from core
`historyCalendar` (`panel/HistoryCalendar.tsx`, the same calendar as the
phone). The month's title sits between the ‹ › arrows and opens the whole
year, as the app's date picker does; choosing a month there returns to it.
Choosing a day opens it in the day list. What the dots mean is behind a
"What the dots mean" row below the calendar, under a separator
(`ui/InfoNote.tsx`, the phone's InfoNote pattern). The Undo bar always names the newest
action, even when filtered out; Undo and Redo live there (and on Ctrl+Z /
Ctrl+Shift+Z) rather than in the top bar. While syncing, sync conflicts show
above the filters (`sync/Conflicts.tsx`): what was kept, a button for the
other value (an ordinary undoable edit) and OK to clear the notice.

## Goals

The goal editor opens from the habit editor (staged) or the statistics Goal
line (applied as one undoable habit change). It shows the goal timeline (each
dated version, the current and upcoming ones marked, and the original
default) beside a form whose four sections are all visible on wide screens:
success condition, repeat (every day, selected days or a quota per week or
custom period), cycle, and the date it applies from. It keeps the phone's
rules: core `goalDraftIssue` explains incomplete input and blocks Done,
unchanged drafts never add a version, quotas on an existing habit start at
the next whole period, editing or removing an earlier goal asks "Update
earlier results?", and switching versions with unapplied changes asks before
discarding them.

## Notes

Each note is written in place on its page (Edit, Write on an empty note, or
a double-click on its text), as Markdown, the format the phone stores, with
a formatting toolbar (bold, italic, highlight, lists, quote, link; Ctrl+B,
Ctrl+I and Ctrl+K) and a live preview beside it (Write/Preview tabs when the
page is narrow; `notes/NoteComposer.tsx`), within the shared
20,000-character limit. An empty note shows its preset's prompt. Save (or
Ctrl+Enter) applies one undoable note change; Cancel or Esc leaves the note
as it was, and Esc never closes the dialog. Switching notes, switching to
Statistics or closing the dialog with unsaved words asks first. (Until 18
October 2026 notes were written in a separate editor dialog over the habit
page.) The habit editor no longer has a Notes field. History rows that
changed a note's words open Before and After (`notes/NoteVersions.tsx`), and
restoring applies only that text to the habit's current note, or brings a
removed note back. The phone's rich-text editor and recoverable drafts are
not ported; a shared rich editor could follow.

## Settings

The sidebar's Settings item opens a two-column dialog (stacked on phones);
the section list stays put while a page scrolls.
Preferences save immediately as ordinary preference changes, outside History
and Undo, with the phone's before-value rules (newer kinds start from null).

- **Appearance:** a live preview drawn by the grid's own `HabitRow` (never a
  separate drawing), pinned above the scrolling controls and collapsible to
  its heading (remembered while the app is open, as on the phone), starting
  scrolled to Today; theme mode, dark and light backgrounds (presets or a hex,
  fitted at display time), checkbox style (Squares, Circles, Ticks & crosses),
  streak numbers, joined checkboxes with streak ends only and connector
  thickness (saved on release), missed day crosses, week dividers and tap animations.
- **Grid size:** name column, day columns and rows (Automatic: square 56 px
  cells), each Automatic or a
  slider in the phone's v18 steps. The grid and preview follow the slider;
  the size saves on release. These are the phone's saved preferences (CSS
  pixels here, points there), so they travel with backups; Automatic keeps
  each app's own sizes.
- **Daily tracking:** Hide completed today (rows meeting today's goal leave
  after 700 ms, return at once when undone, and a footer link shows them) and
  the week start.
- **Sync:** see [Sync](#sync).
- **Backups:** export downloads the phone's backup format (core
  `encodeArchive`, SHA-256 via Web Crypto). Restore validates the whole file
  first, then offers Bring back what's missing (the default) or Make
  everything match, each one undoable "Restored from a backup" action built by
  core `restorePlan`; without sync, Replace everything (the whole log,
  exclusively, keeping a pre-restore copy that "Restore previous data"
  returns to) is offered too.
- **Archived habits:** record counts and ranges, Restore, and Delete with a
  named confirmation (core `deleteArchivedHabit`, undoable in History).

Phone-only settings (text size, haptics) are not shown on the web; browser
zoom covers text size.

## Managing habits

- **Add habit** sits after the last row. The editor (a centred dialog, full
  screen on phones) has the phone's fields and rules: name, type (fixed after
  creation), categories with short labels and archiving, unit, checked by
  default, start date, icon (Phosphor, Tabler or emoji, searchable) and colour
  (presets or OKLCH sliders). Its Goal row opens the goal editor, whose result
  is staged until the habit's Done.
- **Row actions:** hovering a name shows a drag handle and a ⋯ menu (also a
  right-click on the name, or the context-menu key / Shift+F10 on a focused
  cell): Edit habit, Move up, Move down, Archive.
- **Reordering:** drag the handle (Esc cancels; only a completed drop saves),
  use Move up/down, or press Alt+↑/↓ on a focused cell. The order is saved
  with core `displayedHabitOrder`, so archived habits keep their slots.
- **Archive** is immediate with a quick-undo receipt, as on the phone.
  Restoring and deleting archived habits will live in Settings.

## Repository layout

```text
App.tsx, src/, app.json   Phone app (Expo), unchanged location
packages/core/src/        @onpurpose/core: shared, platform-neutral logic
apps/web/                 Browser app (Vite + React)
scripts/, apps/web/test/  Node test suites
```

npm workspaces link `@onpurpose/core` into `node_modules`, so both apps import
`@onpurpose/core/<path>` (for example `@onpurpose/core/storage/model`). The
package maps those names straight to the TypeScript sources; there is no build
step. Core must not import React, React Native, Expo or anything in either app.
If both apps need something, it belongs in core.

## Stack

| Piece     | Choice                                    | Why                                                                                       |
| --------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Framework | React 19 with TypeScript                  | Same language and component model as the phone app, so knowledge and core code carry over |
| Build     | Vite                                      | Fast development server, small static production build; no server code                    |
| Grid      | Plain DOM table and CSS                   | Browsers already scroll, zoom, select and announce tables well; see "Why not Skia" below  |
| Storage   | SQLite WebAssembly in a worker, on OPFS   | Runs the phone's own `sqliteRepository`, schema 1 and event log unchanged                 |
| Hosting   | Vercel, at `/app/` under the landing page | The build is static files; no backend, login or special headers are required; see Hosting |

### Why not Skia

React Native Skia can run on the web through CanvasKit, but it is a poor fit
here. CanvasKit adds several megabytes of WebAssembly, and its text needs fonts
bundled and loaded by hand. A canvas is invisible to screen readers, browser
zoom, find-in-page and text selection. The phone uses Skia because React Native
views were too slow for a large scrolling grid. Browsers handle a DOM table of
this size well, so the web keeps the browser's native strengths. The grid's
rules (colours from `gridAppearance`, completion from `habitCompletion`,
checkbox defaults from `habitGoals`) are shared; only the drawing differs.

## Sync

Settings → Sync (`sync/SyncSettings.tsx`) and the sidebar's storage line
("Saved and synced", "Syncing…", "Sync needs attention") are the browser side
of [SYNC.md](SYNC.md). `sync/controller.ts` holds sign-in (Better Auth's
client with bearer tokens and passkeys), the account key and the core sync
engine, and gives the screens one snapshot; it loads after the grid opens,
so opening the app never waits for it. Sample data never syncs.

1. Sign in with a passkey, or on the development server with an allowed email
   and password.
2. The first browser for an account shows Set up sync, which creates the
   emergency recovery code; the person copies or downloads it and confirms
   before sync starts.
3. Another browser unlocks by itself when it signed in with a passkey that
   can unlock (`sync/passkeys.ts`). Otherwise it shows "Approve this browser"
   with a six-digit code, and a synced browser shows the "Sync a new device?"
   dialog (`sync/ApprovalPrompt.tsx`, mounted by `App.tsx`) with the new
   browser's name and code; approving asks for one of the account's passkeys
   first. The waiting screen offers Ask again and the emergency code.
4. Sync then runs in the background: after edits, every minute and with Sync
   now. When this browser and the account both have habits, the page asks
   whether to combine them (with habit matching), use the account's or use
   this browser's.
5. The Account group adds a passkey (which can then unlock other browsers),
   makes a new emergency code, signs out (the habits stay) or deletes the
   account and its cloud copy.

The session token and the account key live in IndexedDB (`sync/secrets.ts`),
apart from the habit database. In development, requests go to `/sync`, which
Vite proxies to the deployed development server or to `VITE_SYNC_TARGET`;
production builds show sync only when `VITE_SYNC_URL` is set.

## Storage

`src/storage/openStore.ts` opens the same `ChangeStore` and `sqliteRepository`
as the phone:

1. A Web Lock (`onpurpose-database`) lets only one tab write the log. A second
   tab shows "already open in another tab" instead of opening the database.
2. `sqliteWorker.ts` runs SQLite WebAssembly in a worker, storing
   `/onpurpose.db` through the `opfs-sahpool` file system. That needs no
   cross-origin isolation headers, so any static host works.
3. `workerSql.ts` implements the phone's `SqlPort` over worker messages and
   serializes exclusive transactions (`BEGIN IMMEDIATE` … `COMMIT`, rolling
   back on failure).
4. New events come from `@onpurpose/core/storage/newEvents`, the same writer
   version and first-run event as the phone.
5. The app asks the browser to keep its storage persistent
   (`navigator.storage.persist()`); browsers may still clear site data if the
   person chooses to.

If the database cannot open, the app shows the error. It never falls back to a
temporary or `localStorage` database, because data that will not survive a
reload must not look saved. OPFS needs a secure context (`https://` or
`localhost`).

Because the format matches, backups exported from the phone import on the
web, and the other way round. The database also holds this browser's device
ID, sync state and open conflicts (SQL schema 2, see
[STORAGE.md](STORAGE.md)).

## Hosting

The landing page and this app are one static site on Vercel (Pro plan) at
`lifechisel.app`: the landing page at the root and this app at `/app/` (Vite's
`base` for builds). `vercel.json` at the repository root tells Vercel to run
`npm ci` and `npm run site:build`, which builds both and lets
`scripts/build-site.mjs` copy them into `site-dist/`; hashed files under
`assets/` are cached for a year.

- **Deploys:** Vercel builds on every push to GitHub. The production branch
  deploys to `lifechisel.app`; other branches get preview addresses.
- **Private until launch:** Deployment Protection covers All Deployments with
  Vercel Authentication, so only members of the Vercel team can open any
  address, the production domain included. Testers get a Shareable Link from
  the project page instead of an account. Password Protection was not chosen
  (US$20 a month extra per project on Pro).
- **Sync is off there:** builds show sync only when `VITE_SYNC_URL` is set,
  and it is not set, so the hosted app has no sync until a production sync
  server exists ([SYNC.md](SYNC.md)).

## Commands

Run from the repository root:

| Command               | Use                                                    |
| --------------------- | ------------------------------------------------------ |
| `npm run web:dev`     | Development servers for this app and the landing page  |
| `npm run web:build`   | Typecheck and build static files into `apps/web/dist/` |
| `npm run web:preview` | Serve the production build locally                     |
| `npm run site:build`  | Build both sites and assemble them into `site-dist/`   |

`npm run check` typechecks the phone and web apps, and `npm test` includes
`apps/web/test/`, which runs the browser storage path against SQLite
WebAssembly in memory (Node has no OPFS).

## Known limits

- OPFS persistence, the tab lock and the grid were checked in desktop Chrome
  only. Safari (including iPhone Safari) and Firefox are untested, and so are
  the custom scrollbars with a real mouse, trackpad and touch.
- Every loaded row and day is in the DOM. Twelve to fourteen habits over
  several hundred days are fine in Chrome; hundreds of habits may need only
  the visible rows rendered.
- The main script is about 810 KB gzipped (measured 18 October 2026), mostly
  the habit icon catalogues that validation imports; SQLite adds about 400 KB
  gzipped and the sync code, loaded after the grid, about 23 KB. Splitting
  the catalogues out is a later optimisation.
- Without sync, data in one browser is separate from the phone. Sync has
  been checked only in headless desktop Chrome, against the development
  server.

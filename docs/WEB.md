# Web app

The browser version of OnPurpose lives in `apps/web`. It is designed for
browsers rather than copied from the phone screens, and it shares every rule and
data format with the phone app through `@onpurpose/core`.

Status: the home grid (layout A, below) records all four entry types, follows
the saved theme and cell look, and supports Undo/Redo (buttons, Ctrl+Z,
Ctrl+Shift+Z or Ctrl+Y) and the four-second quick undo. Habits can be added,
edited, reordered and archived, and each has a docked Notes/Statistics panel. History has its own panel, and Settings covers appearance, daily tracking,
backups and archived habits. Goals and notes can be edited. Sync is not built yet.

## Home grid (layout A)

The founder chose this layout from mockups (see DECISIONS.md, 13 October 2026).

- **Today stays near the names.** The grid is centred and about three weeks
  wide (`VISIBLE_DAYS` in `HabitGrid.tsx`) with 46 px columns, instead of
  filling a wide screen. Oldest days are on the left and Today on the right,
  as on the phone; 120 days are rendered and older ones scroll into view.
- **The grid scrolls inside itself, never the page.** Day headings stick to
  the top and names to the left, so long habit lists scroll without moving
  the top bar. Keyboard focus scrolls cells clear of both (`scroll-padding`).
- **Today is emphasised:** a header pill labelled "Today", a faint column with
  hairline edges, and the Today button returns there and focuses it.
- **Rows highlight** under the pointer or keyboard focus.
- **Keyboard:** one roving focus moves with the arrow keys (Home/End jump to
  the oldest day and Today); Space or Enter toggles a checkbox.
- **Cells follow the phone's rules** from core `cellAccessibility.ts`
  (`cellState`, `checkedStreak`, screen-reader labels) and the saved cell look
  (Circles/Squares or Ticks & crosses, joins, streak numbers, missed-day
  crosses, connector thickness). Background precedence is goal met > Today >
  plain.
- **A quiet second line** under each name comes from core `habitSummary.ts`:
  open quota progress ("1 of 2 this week"), else the goal rule with any
  non-daily schedule, else a plain checkbox's schedule, else "Track only".
  It is hidden at phone width.

The font is set once, as `--font-ui` at the top of `src/styles.css`: the system
font for now (as on the phone). Grid sizes are the `--name-width`, `--column`,
`--row` and `--box` variables beside it. The grid measures itself to whole
day columns and horizontal scrolling snaps to days, so no column is left half
hidden behind the names.

## Entering values

Number, text and category cells open a popover beside the cell (a bottom
sheet at phone width) on the native `<dialog>` element. The draft stays in the
popover: Enter (Ctrl+Enter for text) or Done saves with a fresh before-value,
and Esc, Close or the backdrop discard it. Numbers use core `parseDailyTotal`
and `recentNumericTotals`, exactly as the phone does. Categories created while
recording join the habit only on Done. Every entry and archive shows the shared
`quickUndo` receipt for four seconds.

## Habit panel

Clicking a habit's name (or **Notes and statistics** in its menu) docks a
panel beside the grid, which narrows to whole columns but stays usable; below
1000 px wide the panel covers the grid instead. It opens on Notes when the
habit has notes, otherwise on Statistics, as on the phone. Esc closes it.

- **Notes** render from core's Markdown token stream as React elements: text
  is escaped, links pass core `descriptionLink` and open in a new tab, and
  images show only their alt text, so reading never loads remote content.
- **Statistics** use the phone's core calculations (`habitStatistics`,
  `recordStatistics`, `statsSeries`, `periodStatistics`, `timeOfDay`)
  with the same ranges, period stepping, headline, tiles and wording. Charts
  are SVG in a shared `ChartFrame`: hover, or focus and the arrow keys, select
  a bar and one reading line (a live region) names it. Sections: daily totals
  (numbers), categories (with filtering), success over time with the trend,
  streaks, calendar, by day of the week, time of day, and an entries journal
  for text and categories. Calendar days tick checkboxes or open the entry
  popover.

## History

The top bar's History button docks the History panel in the same slot as
the habit panel. It uses core `history.ts` exactly as the phone does:
active habit actions in log order, grouped by the day they were made (Today
and Yesterday open; filtered lists open fully), neighbouring same-date
entries within five minutes collapsed into a burst, and entries for another
day marked "For <date>". Filters (kind chips and a habit picker) are view
state. A date picker jumps to a day. The Undo bar always names the newest
action, even when filtered out; Undo and Redo live there (and on Ctrl+Z /
Ctrl+Shift+Z) rather than in the top bar.

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

Notes are edited as Markdown, the format the phone stores, in a dialog with a
formatting toolbar (bold, italic, highlight, lists, quote, link; Ctrl+B,
Ctrl+I and Ctrl+K) and a live preview beside it (tabs on narrow screens),
within the shared 20,000-character limit. It opens from the Notes tab
(applied as one undoable change) or the habit editor (staged); closing with
unapplied changes asks first. Note rows in History open Before and After,
and restoring applies only that description to the habit's current
definition. The phone's rich-text editor and recoverable drafts are not
ported; a shared rich editor could follow.

## Settings

The top bar's Settings button opens a two-column dialog (stacked on phones).
Preferences save immediately as ordinary preference changes, outside History
and Undo, with the phone's before-value rules (newer kinds start from null).

- **Appearance:** a live preview drawn by the grid's own `HabitRow` (never a
  separate drawing), theme mode, dark and light backgrounds (presets or a hex,
  fitted at display time), checkbox style (Squares, Circles, Ticks & crosses),
  streak numbers, joined checkboxes with connector thickness (saved on
  release), missed day crosses and week dividers.
- **Daily tracking:** Hide completed today (rows meeting today's goal leave
  after 700 ms, return at once when undone, and a footer link shows them) and
  the week start.
- **Backups:** export downloads the phone's backup format (core
  `encodeArchive`, SHA-256 via Web Crypto); restore validates the whole file
  first, asks for confirmation naming its habits and changes, runs
  exclusively and keeps a pre-restore copy, which "Restore previous data"
  returns to.
- **Archived habits:** record counts and ranges, Restore, and Delete with a
  named confirmation (core `deleteArchivedHabit`, undoable in History).

Phone-only settings (grid sizes, text size, haptics, tap animations) are not
shown on the web; browser zoom covers text size.

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

| Piece     | Choice                                  | Why                                                                                       |
| --------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Framework | React 19 with TypeScript                | Same language and component model as the phone app, so knowledge and core code carry over |
| Build     | Vite                                    | Fast development server, small static production build; no server code                    |
| Grid      | Plain DOM table and CSS                 | Browsers already scroll, zoom, select and announce tables well; see "Why not Skia" below  |
| Storage   | SQLite WebAssembly in a worker, on OPFS | Runs the phone's own `sqliteRepository`, schema 1 and event log unchanged                 |
| Hosting   | Any static host (none chosen yet)       | The build is static files; no backend, login or special headers are required              |

### Why not Skia

React Native Skia can run on the web through CanvasKit, but it is a poor fit
here. CanvasKit adds several megabytes of WebAssembly, and its text needs fonts
bundled and loaded by hand. A canvas is invisible to screen readers, browser
zoom, find-in-page and text selection. The phone uses Skia because React Native
views were too slow for a large scrolling grid. Browsers handle a DOM table of
this size well, so the web keeps the browser's native strengths. The grid's
rules (colours from `gridAppearance`, completion from `habitCompletion`,
checkbox defaults from `habitGoals`) are shared; only the drawing differs.

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

Because the format matches, backups exported from the phone will import on the
web once backup screens exist there; nothing about the file format changes.

## Commands

Run from the repository root:

| Command               | Use                                                    |
| --------------------- | ------------------------------------------------------ |
| `npm run web:dev`     | Development server with instant reload                 |
| `npm run web:build`   | Typecheck and build static files into `apps/web/dist/` |
| `npm run web:preview` | Serve the production build locally                     |

`npm run check` typechecks the phone and web apps, and `npm test` includes
`apps/web/test/`, which runs the browser storage path against SQLite
WebAssembly in memory (Node has no OPFS).

## Known limits

- OPFS persistence, the tab lock and the grid were checked in desktop Chrome
  only. Safari (including iPhone Safari) and Firefox are untested.
- The main script is about 300 KB gzipped, mostly the habit icon catalogues
  that validation imports; SQLite adds about 400 KB gzipped. Splitting the
  catalogues out is a later optimisation.
- Data in one browser is separate from the phone until sync exists.

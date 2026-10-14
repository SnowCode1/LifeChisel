# Web app

The browser version of OnPurpose lives in `apps/web`. It is designed for
browsers rather than copied from the phone screens, and it shares every rule and
data format with the phone app through `@onpurpose/core`.

Status: the home grid (layout A, below) toggles checkbox habits, displays
other entry types read-only, follows the saved theme and cell look, and
supports Undo/Redo (buttons, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y). Habit editing,
the number/text/category entry popover, the docked habit and History panels,
Settings, statistics, notes, backups and sync are not built yet.

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
`--row` and `--box` variables beside it.

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

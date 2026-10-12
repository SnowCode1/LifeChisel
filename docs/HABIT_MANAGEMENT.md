# Habit actions and management

Habits are managed directly from the grid. Tap a name for its notes and
statistics; hold it for a menu to change its colour, edit, reorder or archive
it; or keep holding and drag the row to a new position. Archived habits can be
restored or deleted from Settings, and every change can be undone from History.

Implemented 4 October 2026 at the founder's request, with the refinements
described below.

## Main grid

Tap a habit name to open its Notes/Statistics sheet: Notes first when the habit
has a description, Statistics otherwise. Close returns to the same mounted grid
and date position. Rates, streaks, totals, averages, charts, weekday patterns
and the calendar are described in [STATISTICS.md](STATISTICS.md). Create/Edit
habit and Goal use full-screen editors with fixed Close/Done actions and short
parent Back labels; descriptions use a separate full-screen editor.

Hold a name for 380 ms to select its row with a haptic tick and show an anchored
menu: Colour, Edit habit, Reorder, Archive. Releasing leaves the menu open. Each
option requires a separate tap; the initial hold cannot choose a menu item. A
tap outside dismisses it. The selected name stays reachable while the menu is
open: keep holding before dragging, or release and hold that name again. Press
re-entry does not reset a recognized hold. The menu stays within the viewport
and scrolls when larger text or landscape needs room. While the menu is open,
the selected name is tinted with the habit colour at 12.5% opacity over the
background; press feedback is a lighter tint, and dragging keeps the normal row
appearance.

Keep holding and move vertically more than ten points to drag that row. The
menu dismisses, the actual name and date cells follow the finger, and
neighbours shift to preview the order. Releasing saves one ordering change.
Edge scrolling allows long lists. Touch cancellation, additional fingers,
rotation, foreground loss, or changed habit IDs cancel the draft without saving.
Ordinary swipes before the hold scroll normally; date cells retain direct
recording actions.

Reorder opens a deliberate mode with handles and a Done control. Names drag
immediately in this mode, and cells cannot record until it ends. VoiceOver and
TalkBack name actions provide statistics, edit, colour, reorder, archive, and
Move up/Move down. No essential operation depends on discovering a hold gesture.

## Creating and editing habits

An Add habit row scrolls with the end of the grid, including when the list is
empty. Active habit actions live on the grid; there is no separate
active-management screen.

New habits choose one of four types from a wrapping grid: **Checkbox**, **Daily
total**, **Categories** or **Free text**. They also take a name, colour,
optional emoji/pack icon ([HABIT_ICONS.md](HABIT_ICONS.md)), an optional unit
for Daily total habits, and an optional Markdown/plain-text description. The
description's compact control opens a full-screen editor while keeping the outer
Done/Close draft contract; see [DESCRIPTIONS.md](DESCRIPTIONS.md). Names are
limited to 200 characters and units to 80. A Daily total habit without a unit
remains numeric.

Editors and colour pickers use Done to apply and Close to discard drafts.
Picking a colour inside the editor updates its draft until the outer Done saves
the habit. An existing habit's type is read-only, preventing accidental
reinterpretation of recorded values. A unit edit changes the label, not
historical amounts or their scale.

Start date defaults to local Today and is editable when creating and editing.
iOS uses a compact native date picker; Android opens the app's `DateCalendar`
(`StartDateField.tsx`), because it has no inline system picker; web preview uses
a validated ISO date input. Earlier dates support backfilling. Legacy habits
display their inferred tracking date without rewriting old events.

## Categories and Free text

Categories opens a dedicated draft editor with full names, optional short grid
labels, Add and Archive/Restore. Stable IDs survive renames and archival; at
least one category remains active. The inner editor's Done returns to the habit
draft; the habit editor's Done applies one undoable definition change. Close
discards the appropriate draft.

A Categories day opens a compact bottom sheet with accessible multi-select
choices. Choosing does not close it; Done applies the complete set atomically.
Archived categories already selected on that day remain visible for removal.
Free text days open a plain multiline input in the same sheet, with a
10,000-character limit. Done applies, Close cancels, and Clear entry edits the
draft until Done. These sheets also work from the statistics calendar and entry
list and nest above habit details. Comments remain deferred.

Grid category/text cells use a 12-point font before app/system scaling, with
wrapping and tail ellipsis (Skia paragraphs on the canvas grid, with the system
font fallback for emoji). Line capacity follows the measured row height
and combined text scale: shorter rows show two lines; taller rows up to three.
Wider day columns reveal more text without making letters smaller. Full values
stay available in editors and to accessibility. The preview is bounded to 32
Unicode characters for cheap measurement. Unrecorded cells show a dash and
recorded cells use the habit colour; recording is not completion. Only numeric
cells shrink to fit, down to 65%. An earlier fitting trial for text was rejected
on the iPhone because the native text renderer ignored the proposed
`minimumFontScale` limit. Revised readability still needs device acceptance.

## Success goals

Create/Edit includes a compact Goal row opening the condition/repeat/date form,
with the goal timeline one tap away; changes stay in the enclosing habit draft
until Done. Statistics exposes the same row for a direct undoable edit. New goal
versions start today by default (or on the start date during creation), and
earlier versions remain intact. Back cancels a version draft, and removing or
correcting earlier goals requires confirmation. Period and cycle rules are
staged alongside other habit fields: completing a goal subpage does not save the
parent draft, and Back/Close cancels the open subpage. Changing goals never
changes recorded daily values. See [GOALS.md](GOALS.md).

## Archiving and order

Archiving hides a habit from the grid while retaining its definition, values,
and history. Restoring uses the retained position. Reordering active habits
preserves archived slots in the full order. Names, units, colours, icons,
creation, archival, restore, and ordering persist and are undoable. Structural
habit/order actions do not coalesce, so dropping one row is exactly one Undo
step. Global preferences remain outside Undo.

Settings → Archived habits lists only archived definitions, with Restore and
Delete; save status and Retry remain visible there.

## Quick Undo and row removal

With Hide completed today on ([SETTINGS.md](SETTINGS.md#hide-completed-today)),
newly completed rows wait for a 700 ms pause between qualifying taps, then
collapse together. Undoing or unchecking reveals a row immediately.

After an entry (on any date, whether or not filtering or goals are involved) or
an archive, a temporary Undo appears in the centre of the fixed toolbar for four
seconds, then fades out over 180 ms. It restores that specific action by
appending an ordinary compensating edit, without hiding Today navigation or
moving cells; undoing an archive reverses only the archived field on the current
habit. Unrelated entries, definition edits and the current order are preserved,
and receipts and timers never enter persistence or exports. Show completed
remains available. Settings has no timing toggles.

Hiding or archiving a row eases the remaining names and cells together over
220 ms, and restoring rows through Undo uses the same shared positions. Both
respect Reduce Motion; rotation and font or size changes remain immediate.

## Grid row heights

Row height comes from Settings → Rows and text size; see
[SETTINGS.md](SETTINGS.md#grid-sizes). Name measurements remain authoritative
for taller wrapped text and numeric units, and names, cells, loading dashes and
reorder positions share them. Rows under 52 points use less vertical name
padding. Changing sizes keeps habit order, entries and horizontal position.

## Reorder implementation

`HabitName` registers native responder callbacks; `useHabitReorder` owns the
temporary order, cancellation, shared geometry, and edge scrolling. `ReorderRow`
applies the same absolute animated Y position to the actual name, and the canvas
grid draws that row's cells at the same shared Y (the dragged row last). Only a
completed drop reaches the store. Date scrolling is locked during a drag. See
the React Native [Pressable](https://reactnative.dev/docs/0.86/pressable) and
[PanResponder](https://reactnative.dev/docs/0.86/panresponder) references.

### Reorder animation invariants

These came from successive phone reports (slow settling, a visible switch to a
floating card, swap flicker, low frame rate, then stutter on fast crossings).
The founder confirmed the real-row appearance, flicker fix and fast swaps on the
iPhone on 4 October 2026.

- **Real rows move.** The actual name view and the row's canvas-drawn cells move
  with their existing fonts, icons, units, checkboxes, backgrounds and dividers.
  Only the dragged row's stacking order rises; no separately styled card,
  shadow, handle or faded copy replaces it.
- **Fixed native sibling order.** Preview swaps never reorder native siblings.
  At commit, keyed views may change order, but their absolute positions stay the
  same.
- **One absolute Y per row, as translateY from a top: 0 anchor.** Both column
  types have an explicit total height. Never animate layout `top` per frame
  (it triggered native layout every frame) or combine a moving layout anchor
  with a compensating transform (layout and animation commits disagreed and
  caused flicker). Preview and final drop share `habitRowPositions`, which
  accounts for measured/wrapped heights.
- **Swap targets through shared values.** Draft order lives in the drag ref and
  Y targets are published as shared values; crossings cause no React state
  update or `HabitGrid` render. Rows react on the UI thread, and unchanged
  targets do not restart springs. React updates only at drag start/end and for
  the menu. Cancellation restores the committed targets.
- **Measure the inner name control,** not the moving wrapper, so movement does
  not report layout to JavaScript every frame.
- **Shared `RowPositions` handles.** One keyed animated-style controller per
  displayed habit lives at the grid root; names attach to it rather than
  creating a mapper per row, and the canvas grid reads the same `rowTops` and
  drag shared values when drawing cells.
- **Settling.** Neighbours and the dropped row share an overdamped spring
  (stiffness 650, damping 54, mass 1, energy threshold 0.0001). The held row
  follows the finger without spring delay and, on release, settles to the same
  absolute Y as the committed order, with no appearance swap. New drags wait for
  that short settle. A completed drop saves immediately, independent of the
  animation.
- **Reduced motion.** Menu entry uses a small six-point lift and fade, dismissal
  fades, and Settings pages fade in. These and the row transitions in
  `motion.ts` respect Reduce Motion, including the held row's hand-off on quick
  releases.

## Delete archived habits

Settings → Archived habits has separate labelled Restore and Delete buttons
below each habit's details, with equal widths and wrapping for larger text.
Icons align with names; metadata shows the type/unit, recorded-day count and
first/last recorded dates. Applied notes have a bounded, plain-text two-line
excerpt. Counts come from daily records, including zero and multi-selections,
not edit timestamps.

Delete opens a native confirmation naming the habit and recorded-day count;
Cancel preserves everything. The browser preview uses its standard
confirmation. Confirmed Delete removes the habit, notes and daily records from
current app state in one Undo step. History → Undo returns it to Archived habits
with its records and original position; Restore then returns it to the grid.
Redo deletes it again.

Deletion is recoverable, as chosen by the founder. Earlier changes remain in
History and backups; this does not permanently erase the change log or recovery
copies (permanent erasure remains deferred). Save failures remain visible with
Retry. Both row actions are disabled while saving is blocked or backup work is
exclusive, and the store rechecks archived state when a delayed confirmation is
accepted. There is no active-habit Delete or bulk selection.

## Storage compatibility

Habit definitions and actions grew through these storage versions: v3
introduced definitions and ordering; v4 added optional icons; v5 editable start
dates; v7 descriptions; v10 categorical and text records; v11 effective-dated
goals; v12 undoable deletion; v13 periods and cycles; and v14 checkbox Unchecked
and dated defaults. The other versions added preferences
([SETTINGS.md](SETTINGS.md#persistence-and-history)). See
[STORAGE.md](STORAGE.md) for the current version.

A habit change captures its stable ID, position, and before/after definition;
creation uses a null before-definition. Undoing creation can remove a habit only
after its entries have been undone; this is separate from the confirmed,
undoable deletion action. An order change carries exact before/after ID lists,
validated as a permutation of every stored habit.

Older logs and backups remain readable, unchanged. Legacy numeric habits are
inferred from their unit field; newer definitions may use an explicit type and
an archived flag. No SQL schema change or reseeding occurs. See
[the synthetic v4 export](examples/storage-v4.json).

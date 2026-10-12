# Optional habit icons

A habit may have no icon, an emoji, or a monochrome pack icon. An icon appears
beside the name in the grid, statistics, and archive list. It is decorative for
accessibility: the habit's name remains its spoken identity. Icons never replace
names or shrink date-cell touch targets.

Requested by the founder on 4 October 2026. Custom habits start name-only; the
founder subsequently requested icons on all 12 presets.

## Selection

Hold a habit name → Edit habit → Icon, or use Icon while adding a habit.

The editor presents compact Icon and Colour buttons side by side, with symbol
and swatch previews. They wrap at larger font sizes. Detailed icon names and hex
values stay in their pickers rather than occupying separate editor rows.

- **Icons** is always the initial tab, including for no-icon and emoji habits.
  Opening/browsing alone does not change the saved choice. The combined catalogue
  has 6,678 icons: 1,512 Phosphor Regular and 5,166 Tabler Outline.
- Browse **Common**, **All**, **Phosphor**, or **Tabler**. Common combines the
  original 56 Phosphor habits with 12 activity choices from Tabler.
- Search always covers both complete packs, matching multiple words across names,
  aliases, categories, and tags. Typing replaces the browse filters with
  **Searching all icons / Both packs** and a result count. Clearing restores the
  previous browse filter. Habit vocabulary maps meditation/meditate/mindfulness
  to yoga. Exact names rank first, then common habit choices.
- **Emoji** offers 32 presets and a field for the system emoji keyboard or paste.
  Emoji keep their platform appearance. Skin tones, joined sequences, flags, and
  keycaps count as one emoji; plain text and multiple emoji do not.
- **None** explicitly removes the icon without reserving empty row space.

Pack icons use the habit's draft colour and follow subsequent colour edits.
Selected names include their pack; accessible choice labels distinguish packs.

The picker's Done applies to the editor draft; the editor's Done saves the habit.
Close discards the current picker/editor draft. The picker replaces the form's
scrolling content and keeps Done visible rather than stacking another long section.
Its own bounded FlatList renders a window of icon rows, with adaptive column count;
it is not nested in the editor ScrollView. Tabs/search scroll with the results so
the picker can shrink in landscape or above the keyboard.

## Assets and code

[Phosphor core](https://github.com/phosphor-icons/core) supplies the regular SVG
paths, pinned to npm `@phosphor-icons/core@2.1.1`. `src/phosphorPaths.ts` contains
the complete regular glyph set. Its [MIT notice](licenses/PHOSPHOR_LICENSE.txt) is retained.
[Tabler](https://github.com/tabler/tabler-icons) supplies all outline paths and
metadata from npm `@tabler/icons@3.48.0`; generated `src/tablerPaths.ts` preserves
path fill, stroke, and opacity overrides. Its [MIT notice](licenses/TABLER_LICENSE.txt)
is retained. Render on a 24-unit viewBox with 1.5-unit round strokes to sit near
Phosphor Regular’s weight. Neither asset package is a runtime dependency; existing
react-native-svg draws the paths.
There is no remote image fetch and no new native module.

`src/habitIconCatalog.ts` and `src/tablerIconCatalog.ts` own generated stable IDs,
labels, and search terms.
`src/commonHabitIcons.ts` and `src/commonTablerIcons.ts` preserve curated order,
labels, and habit aliases.
`src/searchHabitIcons.ts` indexes the full catalogue for multiword search. Keep saved IDs
and their glyphs when extending the catalogue. `src/HabitSymbol.tsx` draws icons;
`src/HabitIconPicker.tsx` owns selection UI. `src/habitIcons.ts` owns namespaced
values, labels, and validation using pinned `emoji-regex@11.0.0`. Do not tighten
validation on dependency updates without testing previously accepted sequences.

## Persistence

Version 4 added `icon?: string` to a habit definition, represented as e.g.
`phosphor:book-open`, `tabler:yoga`, or `emoji:📚`. None omits the field. Null, unknown packs/IDs,
URLs, malformed emoji, and extra object fields are rejected before saving/import.
Old v1/v2/v3 events retain their original validation and interpretation. A log may
upgrade but cannot downgrade after a v4 event. The SQL schema stays at version 1.

Applying/removing icons is an ordinary before/after habit-definition change.
It saves atomically, appears in History, survives archive/restore and reload,
and supports Undo/Redo. Icon-only edits read “Icon changed” or “Icon removed”.
Backups export every raw event, including older events, without rewriting them.
See [STORAGE.md](STORAGE.md) and [the synthetic v4 backup](examples/storage-v4.json).

Tests cover valid emoji sequences, malformed inputs, catalogue/glyph completeness,
History descriptions, SQLite reload, removal, archive restore, Undo/Redo, legacy
version boundaries, downgrade rejection, and backup round-trips.

## Catalogue scope and regeneration

The founder approved expanding Phosphor on 4 October 2026. All 1,512 distinct
regular designs are now available. The upstream 9k+ total counts six styles:
1,512 × thin/light/regular/bold/fill/duotone = 9,072 assets in core 2.1.1. Regular
covers every design once. The founder subsequently approved Tabler Outline.

To regenerate, download the official npm tarballs for `@phosphor-icons/core@2.1.1`
and `@tabler/icons@3.48.0`, extract each into an ignored local folder, then run:

```sh
node scripts/generate-phosphor.mjs /absolute/path/to/phosphor/package
node scripts/generate-tabler.mjs /absolute/path/to/tabler/package
```

The generators verify the package and version, icon counts, supported SVG/path
attributes, and common IDs, then write deterministic, formatted catalogue and
path modules. These are committed, so normal development and builds need no
asset download. Preserve the upstream MIT notices and all previously accepted
IDs on future upgrades. Expanded choices use the same v4 representation, but
older builds with the 56-icon registry, or builds without Tabler, reject backups
containing unfamiliar IDs. Update the receiving build before importing those
backups.

## Preset assignments

The founder requested these defaults after accepting the icon picker:

| Preset          | Icon                        |
| --------------- | --------------------------- |
| Go for a walk   | Phosphor person-simple-walk |
| Read            | Phosphor book-open          |
| Drink water     | Phosphor drop               |
| Stretch         | Tabler stretching           |
| Write a little  | Phosphor pencil-simple      |
| Get outside     | Phosphor tree               |
| Meditate        | Tabler yoga                 |
| Cook a meal     | Phosphor fork-knife         |
| Tidy up         | Phosphor broom              |
| Call someone    | Phosphor phone              |
| Learn something | Phosphor graduation-cap     |
| Wind down       | Phosphor moon               |

Fresh stores include these in their one initialization event. For existing stores,
`App.tsx` calls `applyPresetIcons` after a successful opening. It recognizes the
complete original preset seed, then appends normal undoable icon edits to unchanged
preset names that have never had an icon. Earlier chosen/removed icons and renamed
or unrelated habits are left alone. Archive status, entries, colour, units, and
order remain intact. The original initialization record is never rewritten.
Raw icon edits remain after Undo, so reload does not reapply an undone assignment.
These edits appear in History and, like other habit edits, begin a new redo branch.

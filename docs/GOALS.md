# Success goals, periods and cycles

A goal says what makes a day successful and how often that should happen. Goals
are dated: each version applies from its date until the next one starts, so
changing a goal never rewrites earlier results. For example, Run might be
“every day” until 30 September and, from 1 October, “at least 3 days a week”.

- **Effective date:** the first day a goal version applies (Applies from in the
  editor). It stays in force until the next version's effective date.
- **Anchor:** a saved date that fixes where repeating periods or on/off cycles
  start counting. Later preference changes never move it.

Founder-confirmed, 6 October 2026: separate what makes a day successful from how
often it should happen, with effective-dated rules, fixed weekly or custom
periods, and date-anchored on/off cycles. Create/Edit habit and Goal use
full-screen editors with fixed actions and short Back labels, rather than a
breadcrumb trail or wizard. Rolling windows, multiple completions within a day,
summed numeric period quotas, skipped or excused days, manual success overrides
and comments remain deferred.

## Editing

Open **Goal** from Create/Edit habit or Statistics. The form shows four
sections, **Success condition**, **Repeat**, **Cycle** and **Applies from**,
each summarising its current value. One section opens at a time. Opening
Success condition, Repeat or Cycle reveals its primary choices immediately, and
the open section hides its summary, so no second dropdown repeats the same
choice. Secondary fields keep their own labels; single-choice ones reveal a
short selection list on tap rather than showing every alternative as a button.
Daily number inputs, weekdays and category multi-selection stay direct. Closed
sections stay mounted and hidden from accessibility, preserving unfinished
inputs and custom-cycle choices across navigation.

- **Success condition:** Checked or Unchecked for checkbox habits, with a
  separate **Default state · On/Off** switch; Track only, Total entered or a
  numeric Target for Daily total habits; Track only, Any selection or a
  category Match for Categories; Track only, Text entered or Match text for Free
  text. The full list is in [Daily conditions](#daily-conditions).
- **Repeat:** Every day, Selected days, or Per period. Per period supports At
  least, At most or Between successful days in a week or in a custom interval of
  1–366 days.
- **Cycle:** an optional Pattern of None, 5 days on / 2 off, 3 weeks on / 1 off,
  Alternate weeks, or Custom (1–366 days or 1–52 weeks on and off). Custom
  reveals unit and on/off inputs. Its anchor (Cycle starts on) appears only
  inside the open Cycle section and is the first day of an on block; a week
  means seven days from that anchor.
- **Applies from:** the effective date. When a new version of an existing
  habit's period goal is drafted, Next period and **New period today**
  shortcuts appear here (see [Calendar boundaries](#calendar-boundaries)).

A completion is a **successful day**, not a tap, session, or selected category.
Several categories still give at most one successful day. A period target
requires a daily condition; Track only cannot silently acquire a quota.
Per-period goals use all weekdays; cycles may restrict which of those dates are
applicable. Daily schedules can combine chosen weekdays with an on/off cycle.

Full-screen editors scroll when needed, retain font scaling and safe areas, and
keep Close/Done visible above the keyboard. Goal's Back label names the
enclosing habit editor. The goal timeline is a separate view in the same editor;
Back retains all unapplied fields. Choosing another version asks before
discarding a dirty draft.

Done inside a habit editor only stages the goal. The enclosing habit's Done
saves one undoable definition edit; Close discards the draft. Goal opened
directly from Statistics saves directly. Closing an unchanged goal writes no
version or event. Earlier corrections and removals require confirmation and are
undoable. Dates are unique: a new draft on an existing effective date updates
that slot, while moving the date creates a new version. Explicit timeline edits
retain the selected version ID.

## Calendar boundaries

Weeks use the Monday/Sunday preference **when created**, storing an anchor in
the goal. Changing the app preference never realigns saved periods. Custom day
periods are consecutive fixed intervals from their saved anchor, not rolling
windows. Cycles also keep their original anchor across later target changes
unless edited.

New changes to an existing period goal default to the next period boundary
(today if already on it). A newly enabled period also suggests that boundary.
**New period today** starts a fresh fixed-day interval immediately; for a weekly
rule it becomes a seven-day interval, explicitly preserving the new anchor
rather than pretending it is still a calendar week. Creation starts at the
habit's start date.

A fragment cut by the habit start, an effective-date change, or a backdated
correction is **partial and unscored**. Its entries are retained, with no
automatic prorating. A full period remains open through its last day and is
finalized the next local day. Future entries do not count toward current
progress. Entirely off periods are neutral.

## Daily conditions

| Habit       | Conditions                                                                       |
| ----------- | -------------------------------------------------------------------------------- |
| Checkbox    | Checked; Unchecked; optional dated default On/Off                                |
| Daily total | Track only; any recorded total; at least, at most, exactly, inclusive range      |
| Categories  | Track only; any selection; any/all chosen IDs; at least N selections; exclusions |
| Free text   | Track only; nonblank text; any/all literal phrases                               |

A blank daily entry never meets its condition, including a numeric at-most-zero
condition. Explicit numeric zero remains a real value. Category rules retain
stable IDs through renaming and archiving; Include and Exclude cannot overlap.
Text matching ignores case and repeated whitespace and supports up to twelve
literal phrases.

Period upper bounds are deliberately different: **at most zero successful
days** can succeed with no successful days. At-least quotas require at least
one; Between can start at zero. Targets are whole days bounded by the period
length. Validation rejects unknown fields, invalid anchors, malformed cycles,
incompatible daily rules, and timelines over 128 versions. Existing real habits
receive no inferred targets.

## Checkbox defaults

The founder asked for an editable **Success condition** (replacing “Counts
when”): checkboxes can succeed when Checked or Unchecked. **Default state ·
On/Off** is independent and appears inside that section and in the habit
editor. Missing records inherit the dated default. An explicit saved 1 (On) or
0 (Off) overrides it, and toggling back to the default removes the override.
Unchecked with default Off therefore succeeds without an entry, as does Checked
with default On. No daily records are synthesized. The normal start-date,
weekday, cycle and future-statistics limits still apply. Use `checkboxChecked`
and `toggleCheckboxValue` everywhere rather than reading saved values directly.

`defaultChecked` belongs to a goal version, alongside its success rule. The
habit editor stages a version from today (or the chosen start date during
creation) through `withCheckboxDefault`; the goal editor offers its normal
effective-date controls. Earlier versions and entries remain intact. Both
routes save through normal habit History and Undo/Redo.

Daily statistics count default successes arithmetically by policy intervals and
saved exceptions. Period statistics compose repeated schedule patterns and
sparse exceptions, including at-most and between targets, without expanding
lifetime days. Calendar brightness represents success; its accessible checkbox
state represents the actual checked state.

## Statistics and grid

Daily conditions still control cell tint and Hide completed today. Reaching a
weekly quota never hides a row for the rest of the week. Off-day entries stay
editable; they may tint or hide the row for today but are neutral in success
statistics.

Statistics adds compact current-period progress and an expandable list of recent
period results. Open upper-bound or range goals say “Within limit so far”; they
are not final successes. Finished-period totals use complete periods wholly
inside the selected range. Current and longest period streaks count successful
complete periods, bridge rest periods, and ignore partial fragments; they are
labelled as all-time. Daily success streaks are hidden while a period goal is
active. Raw daily charts, recording totals and logging streaks retain their
distinct meanings. Numeric averages still divide by every calendar day since the
habit's start. See [STATISTICS.md](STATISTICS.md).

Daily opportunities use arithmetic over at most seven cycle blocks, never an
allocated lifetime calendar. Period statistics aggregate recorded dates by
window and count empty or rest windows through a bounded repeating schedule, so
long blank histories do not require one object per day or period. Up to eight
recent results are materialized for the UI. No period calculations enter
per-cell subscriptions.

## Storage and ownership

Goals were introduced in v11. Version 13 added optional `period` and `cycle`
objects to each goal, and version 14 added the `unchecked` rule and
`defaultChecked`; earlier versions reject those fields and retain their original
semantics. See [STORAGE.md](STORAGE.md) for the current version. The SQL schema
is unchanged. All goal and timing changes remain ordinary append-only, atomic,
undoable habit edits. No reseeding, default-goal migration or entry rewriting
occurs.

- `habitGoals.ts`: daily rules, checkbox defaults, timeline validation and
  lookup.
- `goalTiming.ts`: strict timing shapes, anchored dates and bounded schedule
  math.
- `completionStatistics.ts`: daily scheduled opportunities and streaks.
- `periodStatistics.ts`: fixed-window progress, results and period streaks.
- `PeriodProgress.tsx`: compact progress and recent results.
- `GoalVersionForm.tsx` / `GoalTimingFields.tsx`: staged rule and timing inputs.
- `GoalEditorControls.tsx`: compact overview sections and selected-value
  controls.
- `HabitGoalsEditor.tsx`: full-screen form/timeline and confirmation flow.
- `goalEditing.ts`: draft parsing and clear validation errors.
- `GoalSummary.tsx`: shared entry point; `habitCompletion.ts`: daily filtering.

The v13 fixture extends the exact v12 prefix with a period/cycle edit and
Undo/Redo. Sample Walk (5/2), Meditate (3 weeks/1 off), and Workout (weekly range
on alternating weeks) are appended only to the isolated development log in
`sampleTiming.ts`.

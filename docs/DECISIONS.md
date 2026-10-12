# Decision log

This log records the product and technical decisions behind OnPurpose: what was
decided, why, and who decided it. [PROJECT_GOALS.md](../PROJECT_GOALS.md) holds
the current requirements; this file explains how they were reached.

- **Order.** Entries 001–035 are numbered and come first, oldest first. Later
  entries are dated and follow in date order. The two series overlap on
  5 October 2026: 034 and 035 were written between dated entries of that day.
- **Status** describes the decision when the entry was written. "Pending" checks
  may since have passed, and later entries may refine or replace a decision.
- **Who decided.** The _founder_ is the project owner and maintainer, who makes
  product decisions. The _assistant_ is an AI coding assistant. Its proposals
  and implementation choices are labelled as such unless the founder accepted
  them.
- **Superseded entries stay for history.** Their status line or a short note
  says "Superseded by …" and names the replacement.

Storage and backup versions below are history ("v13 added period goals");
[STORAGE.md](STORAGE.md) states the current version.

## 001 — React Native, Expo, and TypeScript

Date: 4 October 2026. Status: initial technical choice, revisitable.

The founder suggested React/Expo and develops on Linux with an iPhone available.
Use React Native with Expo for native UI and a cloud path to signed iOS builds.
TypeScript helps catch mistakes during development. Swift-only local development
would require access to Apple's Mac toolchain.

SDK 57 was the stable npm `latest` when checked during setup; SDK 58 had a
`next` tag. Use the stable SDK 57 template and lockfile. Recheck supported SDKs
and Apple's build requirements before beta/release.

Note (10 October 2026): development now also happens on Windows. There is still
no Mac.

## 002 — Small starter, npm, and local checks

Date: 4 October 2026. Status: implemented.

Use the blank TypeScript template, npm, TypeScript, ESLint, and Prettier. The
project requires Node 24 (`.nvmrc` and `package.json` engines). Keep a browser
preview for layout checks on the Linux development machine (Windows is now also
used). Avoid adding routing, authentication, cloud databases, or state libraries
before needed.

## 003 — Stable checkoff positions

Date: 4 October 2026. Status: implemented in demo; product rule confirmed. The
three-day grid is superseded by 009 (adaptive density); scheduling is now part of
[effective-dated goals](#6-october-2026--effective-dated-success-goals).

Checking a row changes its state, not its position or dimensions. This follows
the founder's muscle-memory goal. The founder confirmed manual ordering, checkbox and numeric types, a three-day
grid, 10–20 habits, and an iPhone 16 Pro. Numeric entry primarily records a daily
total. Column direction, density, and scheduling remain open.

## 004 — Own the release path, defer account-specific configuration

Date: 4 October 2026. Status: planned. Partly done: an
[EAS internal preview profile](#7-october-2026--compare-development-overhead-before-more-rendering-work)
was prepared on 7 October 2026; the Expo project, bundle identifier, Apple team
and signing remain open.

Use Expo Go for the first phone experiment, then a development build and
TestFlight before App Store release. EAS configuration, bundle identifier, Apple
team, Expo project, and signing credentials are not fabricated in the starter.
Configure them when the founder's accounts and final identifiers are available.

## 005 — Licensing remains a founder decision

Date: 4 October 2026. Status: resolved by
[10 October 2026 — Pricing and licence](#10-october-2026--pricing-and-licence)
(GPLv3 or later).

Open source is confirmed; a particular licence is not. Preserve the generated
Expo template notice separately. Choose a project licence and copyright holder
before publishing the repository. Do not present Expo's copyright as ownership
of the new application.

## 006 — Incremental storage and export

Date: 4 October 2026. Status: founder-confirmed direction. Superseded by 017,
which implemented the storage schema.

Store incremental app changes, use them as the full-fidelity export format, and
build a separate history feature over them. Daily habit records are a distinct
view. STORAGE.md first held the proposed log/projection approach and its open
format, deletion, date, and restoration questions; it now documents the
implemented format.

## 007 — Opt-in local preview sharing

Date: 4 October 2026. Status: requested by the founder; implemented.

Use `.env.local` to enable a development-only screenshot gesture. Native screen
capture supports the visible grid and dialogs; images are uploaded over the LAN
to a paired Node receiver and saved under ignored `.dev/previews/`. No capture
runs without an explicit long press (or accessibility action). Require both the env flag and React Native's `__DEV__` guard.
The release JS should contain no preview capture/upload module. This gives fast
visual feedback from the phone without tooling that controls the iPhone remotely.

The founder requested that the capture control not interfere with the UI. The
visible buttons were replaced with long-press handlers on the existing app
heading and dialog titles. They render the same Text with unchanged styles;
success is communicated by haptics and a VoiceOver announcement, with no popup
or extra layout space. The receiver protocol and saved paths stay the same.

## 008 — Past-only grid and habit colours

Date: 4 October 2026. Status: requested by the founder; implemented in the demo.
Superseded: 010 allowed future dates and replaced the eight-colour picker; pure
black became the default dark background in v19 (10 October 2026).

Start with today and the previous two days; today is the newest allowed date.
Keep names fixed horizontally and date headings visible during vertical scrolling.
Use inverted, virtualized date-column lists, append older dates as needed, and
provide a direct Today jump. Store demo values by stable habit ID and local date,
never by visible column index. Calendar-day arithmetic avoids DST/UTC errors.

Use pure black and a per-habit colour across names, units, checkboxes, numeric
values, and row rules. Habit details include an eight-colour picker. These choices
remain in memory until the incremental storage layer is implemented.

The founder has published the GitHub repository. Preview captures and
environment settings remain ignored by Git. Selecting a licence was still open
(resolved on 10 October 2026).

## 009 — Adaptive density and landscape

Date: 4 October 2026. Status: requested by the founder; implemented; founder
confirmed both orientations work and stay aligned. 010 later lifted the
past-only bound.

Replace the fixed three-column layout with as many complete dates as the measured
width and system text size can comfortably fit. Enable landscape and use the
extra width for dates; retain safe areas, fixed habit names, and past-only bounds.
Keep the rightmost visible date when rotating. Day touch targets are at least
48 points wide at normal text size, growing with larger text.

The founder questioned the redundant date header. This polish keeps a
compact month/year beside the date headings and removes the separate large date
range. This visual treatment is an assistant proposal to evaluate on the phone.
Today remains subtly highlighted; the return action appears only in history,
without moving any rows. Reduce excess vertical space and soften row rules while
retaining colour across habit names, checkboxes, and numeric entries.

## 010 — Smooth scrolling, deliberate future access, and custom colours

Date: 4 October 2026. Status: implemented; founder confirmed smoother scrolling and working future pull.

The founder reported jitter while side-scrolling. Replace JavaScript per-frame
synchronization/state updates with Reanimated UI-thread scroll handlers and send
only settled dates back to React. Install SDK-compatible Reanimated/Worklets;
use native sliders and gradient tracks for colour controls.

The founder now wants future browsing with extra scrolling effort and explicitly
confirmed future entries should be allowed. This supersedes decision 008's
past-only limit. Start at today, require a resisted 64-point pull and release,
then reveal future dates in batches of 30. The month menu supplies an explicit
alternative. Today collapses future columns and restores the boundary while
preserving recorded values. Threshold and batch size are implementation choices
to tune with phone feedback. Future values' treatment in streaks remains a
statistics-design question; statistics are not implemented.

Provide 24 curated colours plus optional custom controls and hex. Use OKLCH
internally, with plain Hue/Colourfulness/Lightness labels and sRGB hex storage.
Offer a contrast hint on black, and preserve exact valid hex choices. Keep the
existing system font pending a deliberate typography comparison.

The founder found the first stacked picker too tall. Use Presets/Custom tabs and
one fixed Done action. The founder explicitly requested Done to apply and close,
and a separate close button to discard changes. All colour selection stays a draft
until Done, including preset choices; there is no additional apply button.

## 011 — Muted future and older empty cells

Date: 4 October 2026. Status: implemented; visual phone confirmation pending.
Superseded by 012 (lightness-only dimming over days 5–8).

The founder wants future dates and entries muted unless recorded, and suggested
similar treatment beyond seven days. They clarified that muting can use OKLCH
and should not require greyscale. Keep each habit's hue while reducing chroma and
lightness. Checked boxes and entered numeric totals (including zero) retain the
selected colour. A date heading returns to normal brightness when any habit has
a recorded value for that date.

The assistant proposes a smooth transition beginning after day 7 and reaching
its maximum at day 14. Fade by calendar age so a date looks consistent regardless
of screen position, orientation, and column count. Bound the fade rather than
continuing to darken distant history. Keep controls active and accessibility
state independent of visual emphasis. This treatment is a phone experiment to
refine with founder feedback.

The founder confirmed scrolling and the colour dialog's Done/close behaviour
work correctly on the phone before this visual change.

## 012 — Dim by lightness without desaturating

Date: 4 October 2026. Status: founder requested correction; implemented. 013
lowered its empty-cell lightness floor.

The founder rejected the desaturated treatment in decision 011. Preserve hue and
chroma and lower only OKLCH lightness. Fade earlier and faster: the assistant's
new interval starts on day 5 and finishes on day 8. Future empty cells use the
full dimming amount immediately. Recorded values and their date headings retain
normal emphasis.

Use a nonzero lightness floor (0.5 for empty cells, 0.56 for date text). Do not
brighten an already-darker custom colour. If lowering lightness at fixed hue/chroma
would leave sRGB, stop at its gamut boundary instead of reducing chroma. These
lightness limits and the day-8 endpoint are implementation choices to judge on
phone. This supersedes decision 011's chroma reduction and days 8–14 interval.

## 013 — Stronger and more consistent cell dimming

Date: 4 October 2026. Status: implemented after inspecting a founder phone preview.

The founder reported that the transition was still not obvious. Their screenshot
shows today beside tomorrow, where date text is dimmer but empty cells remain
similar in strength. The 0.5 lightness floor limited some presets much earlier:
Read's empty mark lost about 12% lightness, while Cook a meal lost about 24%.

Lower the empty-cell floor to 0.38 so all current presets reach the intended 30%
lightness reduction. Keep the separate 0.56 floor for date text. Preserve hue/chroma,
recorded-value emphasis, and the day 5–8 history interval. Arbitrary saturated
custom colours still stop at the sRGB boundary when necessary. This is an
adjustment to decision 012 based on actual phone appearance.

## 014 — Restrained action haptics

Date: 4 October 2026. Status: requested by the founder; implemented, revised strength confirmed on phone.

Use the installed Expo Haptics library for immediate, single-pulse action feedback.
Completion/changed save uses Medium, undo/clear uses Soft, discrete selection uses
a selection tick, and the future-pull threshold uses Medium. These mappings are
assistant design choices to tune on the founder's iPhone. Avoid long success
patterns for ordinary checkoff; the development preview's success notification
remains a separate tool response.

Emit feedback only from accepted actions, outside React state updater functions.
Do not await native feedback before updating state. Catch unsupported/native failures;
visual confirmation stays authoritative. No-op saves, cancellations, ordinary
scrolling, typing, and continuous colour sliders are quiet. Future readiness ticks
once per direct drag at the threshold, with no duplicate on release or recrossing.
No new dependency, settings screen, or extra home controls are introduced.

The founder tried the first version and described it as slightly weak. Raise
completion/changed-save feedback from Light to Medium, keeping undo Soft and
selection ticks unchanged. The founder subsequently confirmed the revised feedback was good.

## 015 — Continue the future pull without a screen jump

Date: 4 October 2026. Status: founder requested; implemented, founder confirmed the transition is smooth and intuitive on phone.

The founder found the four-day jump disorienting. The old implementation remounted
both lists whenever the future range changed and selected a full screen of future
dates as the new initial position. Remove that remount for expansion. Keep stable
date keys and preserve visible native content while inserting the next 30 dates.

Retain the deliberate 64-point pull-and-release and its single threshold haptic.
Use the released pull distance to choose the nearest whole date, with a minimum
of one new day; a normal pull shows tomorrow next to today in either orientation.
Once both lists have laid out the expanded content, animate the body to that
position and let its UI-thread handler synchronize the header. A new user drag
takes priority. This supersedes decision 010’s full-screen future positioning.

Return to Today still collapses and remounts the range explicitly. Rotation and
Today cancel pending reveal work. Menu access uses the same transition with one
new day beyond the existing edge. Native anchoring and motion need device testing;
automated offset tests alone cannot establish visual continuity. The founder
subsequently tested the new reveal and confirmed it was smooth and intuitive.
Second-batch, interruption, and rotation checks remain in the phone checklist.

## 016 — Visible bar, centred Today, and border pull feedback

Date: 4 October 2026. Status: founder chose always visible and compact; revised placement confirmed on phone; final streak brightness accepted on phone.

The founder requested date, history, and settings controls and chose an
always-visible bar. After the first phone preview they liked the History/Settings
icons and their placement, but rejected moving the date into the bar and Today
into the table corner. They explicitly requested Today top-centre, the date back
in the first table row, and text-free future-pull feedback on the table divider.
They clarified this means the existing divider beneath the date headings, not
a newly added border. The streak should grow left while its right end stays fixed.

The final proposal keeps ONPURPOSE at left, reserves the centre for Today, and
keeps History/Settings at right. Month/year sits beside the day headings, with
the existing date menu. Three equal regions centre Today independent of the
unequal widths of branding and icon controls. Today appears when browsing away;
its space remains reserved. The founder confirmed this revised placement was right.

Replace pull text/progress with a gradient on that existing divider. Its right
endpoint stays fixed; width grows leftwards with pull distance, then fades at its
last width on release. There is no translation, repeating shimmer, or new border.
The founder reported a bright, sunlight-like hotspot and an uneven brightness
ramp. Remove the white peak and trailing dim stop; use a transparent-to-#8A8A8A
alpha ramp so brightness increases continuously toward the fixed right edge.
Keep the threshold haptic and smooth future reveal. Restore month and year as
separate, normally spaced text elements inside the date button.

History and Settings use closable native sheets. Keep the grid mounted and retain
its date position behind them. History is a clear placeholder; Settings supplies
a real haptic toggle for the current session. No persistent settings or history
are claimed. Durable incremental storage with undo is the founder’s requested
next step after the UI is settled, and remains separate work. Superseded by 017:
History became the real change log and the haptic setting persists.

Use own SVG outlines via Expo-compatible react-native-svg, avoiding an icon font.
The development capture gesture works on ONPURPOSE, the month/year label, and
dialog/panel titles. Preserve its `__DEV__`/env gating.

## 017 — Durable incremental local storage, undo, and backups

Date: 4 October 2026. Status: founder requested implementation after accepting the
main-page UI; implemented, phone persistence confirmed; older undo report and
backup UI acceptance pending.

Use Expo SQLite with an ordered version-1 event log and a derived JSON projection
committed together. The projection is small and sufficient for the current grid;
separate SQL habit/day tables can be added when queries justify them. Read the
validated log on launch, initialize the sample habits once, and never reset data
on load failure. Preserve explicit date keys and the existing local-midnight
boundary; a later cutoff remains a product choice.

Log accepted entry, colour, and haptic-preference edits with before/after values,
stable IDs, sequence, UTC edit time and local-zone metadata. Apply immediate
optimistic state and serialize writes. Save failure retains the queue, blocks new
edits, and exposes retry. Each accepted action is one undo step; undo/redo append
inverse changes and reconstruct across launches. Initialization and ephemeral UI
actions are not undoable edits.

Implement actual History, JSON change-based backup export, and validated restore.
The v1 container includes a SHA-256 checksum and event count; fully replay it
before asking for native replacement confirmation. Restore keeps a pre-restore
copy in the same transaction; no automatic merge. Browser preview uses a separate
localStorage adapter to preserve Linux layout preview without native SQLite/WASM
setup. See STORAGE.md for the contract and remaining limitations.

Tests cover real SQLite reopen/rollback, initialization, save retry including an
uncertain commit, rapid edits, inverse validation, malformed archives, round-trip,
and restore recovery. Native Expo bridge and share/picker flows remain phone tests.
No cloud service, comment schema, erasure policy, or statistics rules are inferred
from this storage milestone.

## 018 — Compact, day-grouped change History

Date: 4 October 2026. Status: founder requested; implemented, founder approved the appearance on phone.

The founder asked for action icons, denser rows, and grouping by day so each row
only needs the edit time. Use a native SectionList with sticky day headings,
compact two-line rows, and labelled action icons. Keep Undo/Redo and save status
above the list. Show numeric before/after totals and old/new colour swatches;
keep full meaning available to VoiceOver and allow larger text to expand rows.

Group by the edit instant displayed in the viewing device's local time zone.
Habit-entry dates are separate: add a small For-date label when different from
the edit day. Keep reverse sequence order rather than timestamp sorting;
contiguous grouping preserves chronology even if the clock was adjusted. Batch
loading can extend a day without duplicating or dropping its records.

This changes presentation only; event versions, log contents, persistence,
undo coverage, and backup semantics remain the existing v1 contract. Tests cover
local midnight/DST/travel grouping, pagination, clock rollback, effective-date
labelling, numeric zero/clear, and undo/redo presentation.

## 019 — Active habit History and grouped Undo

Date: 4 October 2026. Status: founder authorized the recommendation; implemented,
updated behaviour awaiting phone confirmation.

Keep global preferences in the unified incremental storage/export format, while
excluding them from visible History and its Undo/Redo sequence. Habit entries
and applied habit colours remain visible and undoable; future habit-definition
edits should follow the same distinction. Preference changes must not discard
habit Redo or interrupt an eligible edit group.

History represents active meaningful actions. Undo removes an action from the
view; Redo restores the original action, without adding undo/redo rows. Repeated
consecutive edits to the same habit field and effective date become one action
using a two-minute inactivity window. A net-zero group disappears. Every edit
still saves immediately; grouping never delays persistence. Show the next Undo
target above the list.

The two-minute rolling window and consecutive-edit boundary are implementation
choices. Another habit/date/field, Undo/Redo, midnight, time-zone changes, or a
backwards clock close the group. A grouped Undo uses one net inverse and one
atomic transaction. Preserve raw edits in append-only storage and exports.

New events and backup containers use version 2. Keep existing v1 records and
backup fixtures unchanged and replay their original semantics; old habit edits
remain separate steps rather than being retroactively grouped. The SQLite schema
stays version 1. See [STORAGE.md](STORAGE.md) for compatibility and validation.

## 020 — Habit-name actions, drag ordering, and management

Date: 4 October 2026. Status: founder authorized implementation; native interaction
acceptance pending. The prior active-History update was accepted by the founder.

Tap a habit name for statistics. Hold for an anchored Colour/Edit/Reorder/Archive
menu, then continue the same touch vertically to drag. Releasing the original
hold leaves the menu open; selecting an option requires a separate tap. Restrict
these gestures to names, keeping date cells direct. Offer explicit reorder mode,
VoiceOver move actions, and Settings → Manage habits for discoverability.

Use native Pressable/PanResponder callbacks with a 380 ms hold and ten-point
vertical threshold, pending phone tuning. The in-tree overlay retains the held
responder; a separate modal menu would interrupt it. Preview ordering without
saving, animate neighbour layouts, and scroll at viewport edges. Completed drops
save one action; cancellation, multiple touches, rotation, backgrounding, and
changed habit identities discard the draft. Preserve horizontal scroll syncing.

Implement creation, name/unit/colour editing, and archival/restoration. Type is
explicit for new habits and read-only after creation in this editor. Numeric
units are optional. Archiving retains values and position; ordering visible rows
retains archived slots. Editors apply drafts with Done and discard with Close.
Basic statistics show recent recorded days, without inventing streak/target rules.

Version-3 events add full habit-definition and order changes, both undoable and
outside correction coalescing. Definition equality ignores field ordering; exact
before-values and complete unique order permutations are required. New exports
use version 3; unchanged v1/v2 fixtures remain supported. No SQL schema change,
destructive reset, or permanent-delete UI. See [HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md).

## 021 — Full-screen statistics and grid-first habit management

Date: 4 October 2026. Status: founder requested and authorized; implemented,
phone acceptance pending. Supersedes the basic statistics and Manage habits UI
in decision 020, retaining its context-menu appearance and storage format.

The founder requested smoother transitions and a full-screen statistics experience
with completion and numeric charts. They identified Settings → Manage habits as
redundant. Add belongs at the end of the grid; active editing, archival, and ordering
remain on habit names. Settings → Archived habits is dedicated to restoration.
Restore uses the existing version-3 definition change; no storage migration.

Use an in-tree full-screen statistics view above the mounted grid, with explicit
Back and Edit controls. This preserves the date position without adding a router.
Native Reanimated layout transitions coordinate name and cell movement, animate
the context menu, and settle the dragged row after a completed drop. Honour Reduce
Motion. No per-frame changes to horizontal synchronization.

Implementation choices, not new founder decisions: 30-day/90-day/year/all ranges,
daily checkbox completion denominators, numeric logging streaks, weekday breakdowns,
and calendar colours. Document these in [STATISTICS.md](STATISTICS.md), including
archive periods, unfinished today, numeric zero, and future-entry exclusion.
Numeric targets and non-daily scheduling rules remain open.

## 022 — Optional habit icons and unchanged row appearance during drag

Date: 4 October 2026. Status: founder requested; implemented, device acceptance
pending. The previous context-menu motion and archive restoration were accepted.

The founder wants optional emoji or pack icons that follow the habit colour. Add
None/Icons/Emoji in the editor, with the existing nested draft, Done, and Close
behaviour. Bundle a searchable selection of 56 regular Phosphor icons and provide
emoji presets plus keyboard/paste input. Catalogue size and presets are assistant
implementation choices; Phosphor is the founder's suggested example. Preserve
name-only rows by default and show chosen icons in the grid, statistics, and archive.

Use a small vendored SVG subset from Phosphor core 2.1.1 with its MIT notice, rendered
through existing react-native-svg. A pinned emoji-regex 11.0.0 dependency validates
single Unicode emoji sequences. No remote icon fetch or native dependency.
Version-4 definitions add an optional namespaced icon string. Keep versions 1–3
readable and unchanged; no SQL schema change or reseeding. Icons participate in
habit Undo/Redo, History, and backups. See [HABIT_ICONS.md](HABIT_ICONS.md).

The founder described the drag translation as smooth but slow, and the switch
from the floating card to the real row as abrupt. Translate the actual name and
date-cell views instead, retaining their contents and appearance during the entire
gesture and drop. Use a faster overdamped spring for neighbour movement and the
final settle. Keep existing hold/menu continuation, cancellation, edge scrolling,
and UI-thread horizontal synchronization.

## 023 — Full Phosphor catalogue and cheaper drag movement

Date: 4 October 2026. Status: founder requested; implemented, phone acceptance pending.

The founder approved expanding Phosphor and confirmed the row-swap flicker is
fixed, but reported reduced frame rate while dragging. Offer the full 1,512
Regular designs from pinned core 2.1.1. Common-first browsing and a virtualized,
searchable full catalogue are implementation choices to retain quick discovery.
Preserve existing choices, IDs, colours, draft semantics, and optional emoji.

Keep row preview sibling order stable and share the existing absolute Y geometry.
Express that Y through translateY from a constant top: 0 layout anchor, rather than
animating top and asking native layout to run on every frame. This also avoids the
old combination of changing layout anchors and compensating transforms. Gesture
recognition and persistence remain unchanged; actual phone smoothness needs checking.

## 024 — Tabler and a clearer, compact habit icon picker

Date: 4 October 2026. Status: founder requested; implemented, device acceptance pending.

The founder approved Tabler alongside Phosphor, asked for compact Icon/Colour
controls in the editor, an Icons default tab even when nothing is selected, and
clear full-catalogue search scope. Use two side-by-side appearance buttons with
symbol/swatch previews, wrapping for larger text. Remove the redundant full-width
icon-name and hex-value rows; detailed values remain in their respective pickers.

Bundle all 5,166 Tabler Outline designs from pinned @tabler/icons 3.48.0, with
MIT attribution and generated local paths/metadata. Use a 1.5/24 stroke to match
Phosphor Regular's approximate relative line weight. These are implementation
choices. Common includes activity choices from both packs. Browse Common, All,
Phosphor, or Tabler; typing replaces those filters with “Searching all icons” and
“Both packs” plus a result count. Clearing restores the previous browse scope.
Searching always includes both packs and preserves their distinct stable IDs.

Keep v4 event representation, draft Done/Close behaviour, emoji, no-icon removal,
and all saved Phosphor choices. Tabler IDs participate in validation, replay,
Undo/Redo, archive restore, and backup. No native dependency or store reset.

## 025 — Preset icons and removing grid renders from drag swaps

Date: 4 October 2026. Status: founder requested; implemented, phone acceptance pending.

The founder accepted the icons and asked to assign them to all current presets.
Give the 12 seed habits appropriate Phosphor/Tabler icons. After successful opening,
apply missing icons in existing recognized preset lists as ordinary v4 habit edits.
Preserve chosen/previously removed icons, renamed/custom habits, entries, order,
archive state, and the original seed. Raw icon history prevents reapplication after
Undo or removal. These safety rules are implementation choices; custom habit icons
remain optional. No projection rewrite, reseeding, or database migration.

The founder reports stutter only during fast row crossings. Source tracing found
setDraft triggered a full HabitGrid render at each swap, rebuilding cell controls
and their colours on the JavaScript thread that also handles touch movement.
Keep the temporary order in a ref and publish Y targets through shared values.
Each row reacts on the UI thread and retargets its spring only when needed; React
updates at drag start/end, not on each crossing. Preserve fixed layout anchors,
actual-row appearance, cancellation, haptics, edge scrolling, and drop-only writes.
This removes an identified source of swap work; native smoothness remains unmeasured.

## 026 — Isolated sample history for statistics review

Date: 4 October 2026. Status: founder confirmed sample data and populated statistics
are showing on the iPhone. Detailed interaction checks remain.

Provide 180 days across all 12 presets using the real statistics calculations.
Implementation choice: an isolated development sample store rather than adding
fictional entries to the real append-only log. Include streaks/gaps, improving
and declining rates, weekday patterns, variable daily totals, decimal water values,
zeros, and unrecorded days. Never fabricate future entries.

Settings offers Sample data and Reset sample data. The toolbar's existing brand
space says SAMPLE DATA. Edits remain in memory, real entries stay separate, and
backups are unavailable in sample mode. A development env flag selects the startup
mode; it is false in the example file. The sample module is loaded behind
`__DEV__` and removed from production bundles.

## 027 — Animated Today return and editable statistics calendar

Date: 4 October 2026. Status: founder requested; implemented, phone acceptance pending.

Today scrolls both date lists together on the UI thread, using a proposed 280 ms
ease-out. Keep the current range during the animation, then collapse future dates
at the same visible Today position. This supersedes decision 015's immediate
Today reset. A new horizontal drag cancels the animation; geometry changes and
unmount also cancel it. Respect system Reduce Motion and keep normal scrolling quiet.

Calendar days in statistics use the main grid's entry handler and daily-total
dialog. Checkbox taps immediately toggle; numeric taps edit the selected date,
including zero/clear/Cancel. Preserve normal persistence, grouping, haptics, retry,
and Undo/Redo without a new event type. Future days in the displayed month remain
editable, consistent with the founder's future-entry requirement; show their values
in the calendar while excluding them from statistics. Add a short tap hint and
full-date accessibility labels/checkbox states.

## 028 — Statistics interaction and formatting polish

Date: 4 October 2026. Status: founder requested; implemented, phone review pending.

The founder reported no way to deselect chart bars and an unnecessary outline on
monthly day cells. Tap the selected period again to clear it; also provide a Clear
button and VoiceOver action. Remove the calendar's Today border. These are the
requested changes; the following supporting polish is an implementation choice.

Keep chart inspection in a reserved two-line area, separate the vertical zero/max
scale from date labels, and include years for ranges crossing a year boundary.
Store selection by date bounds to avoid silently selecting another bucket after
backdating changes All-time grouping. Range changes/local rollover reset it.
Use unambiguous weekday headings and numeric units. Numeric calendar backgrounds
retain intensity, while date text stays opaque with contrast calculated against
that background. No statistics calculations, entry semantics, or storage changes.

## 029 — Reduce grid update work before changing persistence

Date: 4 October 2026. Status: founder authorised the proposed performance pass;
implemented, phone acceptance pending.

Use selected store subscriptions for individual cells and date-heading state,
stable root props, memoized date columns/statistics, precomputed colour levels,
and cached date objects/formatters. Save acknowledgements no longer invalidate
the full grid. Avoid duplicate extensions when header/body reach the same history
boundary. Preserve exact colours, interactions, native scroll synchronization,
and storage semantics. Add opt-in development timing without names/entry data.

Synthetic desktop benchmarks confirm cheaper colour/date preparation and scoped
notifications. They also show remaining long-history memory/projection work;
SQLite's JSON projection and the immutable reducer are unchanged. Native profiling
and a release-device comparison remain necessary before claiming smoothness or
choosing a database migration. See PERFORMANCE.md for evidence and limits.

## 030 — Visible loading structure during fast date scrolling

Date: 4 October 2026. Status: founder confirmed quicker checkbox feedback but
reported black gaps on fast flings; requested loading cells/dates and nearby-first
rendering. Implemented, native appearance/scroll review pending.

Place read-only date labels and a bounded native SVG dash pattern underneath the
virtualized lists. Both follow the actual shared UI-thread scroll offset, so list
spacers expose a calendar/loading structure rather than empty black. Dashes are
muted and non-interactive for both habit types; they do not assert an unchecked
state. Loaded columns/headings have opaque backgrounds and cover the fallback.
Hide fallback content from accessibility and mask body dashes beyond real content
while rubber-banding. Keep future reveal and Today behaviour.

The installed VirtualizedList already starts with the visible area and expands
towards adjacent columns, biased by scroll direction. Retain that scheduler; use
smaller body batches (visible days + one) at 16 ms instead of the default 50 ms,
with larger batches/window for inexpensive headings. These sizes are tuning choices
for phone review, not measured guarantees. Eager fallback dates add lightweight
text proportional to the loaded range, not a second set of habit controls.

## 031 — Habit start dates, grid spacing and statistics dismissal

Date: 4 October 2026. Status: requested by the founder; implemented, native review pending.
Superseded in part: the
[native bottom sheet](#5-october-2026--statistics-uses-the-native-bottom-sheet)
replaced the 76-point overscroll dismissal, and the
[v18 Rows slider](#9-october-2026--grid-size-sliders-and-adaptive-defaults-v18)
replaced the row-spacing choices.

Remove the new-habit motivational heading. Add an editable start date defaulting
to local Today, a downward statistics dismissal at the top, and useful Settings
controls beginning with row spacing. These are confirmed requirements.

Implementation choices: use the Expo-compatible native compact date picker on iOS;
keep drafts under the existing Done/Close contract. Existing habits retain their
inferred creation/earliest-record default until a different date is applied. An
explicit date bounds statistics but never erases earlier values; moving it earlier
restores those values to calculations. This forward-date policy was proposed to
the founder and remains open to adjustment. Preserve archived intervals.

Offer Compact/Standard/Roomy minimum row heights of 44/52/64, growing with text and
measured names/units. Store the selection as a global preference outside Undo;
keep one shared geometry for names, cells, placeholders and reorder interactions.
Do not add unrelated switches speculatively.

Use a native scroll handler on the UI thread for pull feedback. Dismiss only when
an eligible drag starts at the top and ends past 76 points of overscroll without
reversing direction. Keep Back and Reduce Motion support. The threshold and motion
are tuning choices requiring phone testing.

Version 5 events/exports carry optional start dates and the spacing preference.
Read unchanged v1–v4 logs and fixtures; never reseed or rewrite existing records.
The SQL schema remains version 1. Tests cover SQLite reload, Undo/Redo, strict
validation, legacy upgrades, backup round trips, statistical boundaries and pull
eligibility. See STORAGE.md, STATISTICS.md and HABIT_MANAGEMENT.md.

## 032 — Focused display settings

Date: 4 October 2026. Status: founder requested column spacing and authorised
choosing two useful additional settings; implemented, native review pending.
Column spacing is superseded:
[7 October 2026](#7-october-2026--main-page-shortcuts-spacing-and-scrolling)
changed the steps to 44/48/64 points, and the
[v18 Day columns slider](#9-october-2026--grid-size-sliders-and-adaptive-defaults-v18)
replaced them. Week start and date fading remain.

Offer Compact/Standard/Roomy columns at 48/64/80 target points, scaled for text,
fitting whole days while preserving the name area. Compact is the old geometry.
Keep shared heading/body/loading dimensions and the existing position-preserving
remount used for rotation. Retain responsive behaviour when only one column fits.

Choose week start (Monday/Sunday) for familiar calendar reading, and date fading
(on/off) for users who need clearer contrast. These are assistant-selected defaults
within the requested scope. Week ordering affects the calendar and weekday chart;
fading affects grid empty cells/headings without changing recorded colours.
Keep original Monday/fading-on behaviour until the user changes it.

Reuse a small choice-control component for spacing/week preferences. Persist new
preferences as v6 events, outside History/Undo, preserving Redo and grouping. Keep
unchanged v1–v5 imports/fixtures and absent-field defaults; no SQL migration or
reseeding. See SETTINGS.md and STORAGE.md. Tests cover layout/font scaling, exact
calendar-day alignment, brightness preservation, SQLite reopen, backup/replay,
strict old-version rejection, and settings across Undo/Redo/correction groups.

## 033 — Descriptions close to the habit

Date: 5 October 2026. Status: founder authorised the proposed design and requested
placeholder Markdown notes for every existing habit; implemented, phone review pending.
Superseded in part:
[live formatted editing](#5-october-2026--live-description-editing-and-calendar-statistics)
replaced Write/Preview, and notes moved to
[their own tab](#5-october-2026--notes-first-tabs-and-first-open-editor-position).

Show an optional description before statistics so a name tap reaches motivation
and linked notes. Keep the main grid unchanged. Use one compact creation/edit
control and a full-screen Write/Preview editor with fixed Close/Done. Bound long
reading previews and allow expansion. Parent-form descriptions stay drafts until
outer Done; statistics edits apply directly. Preserve applied text through History,
Undo/Redo, archive/restore and full backups.

Implementation choices: parse Markdown with markdown-it's browser build and render
native text/views, avoiding a WebView. Use tap-only links, no remote image loading,
a 20,000-character limit and a two-block/height-bounded preview. Recover interrupted
writing in a separate local draft store; never autosave unfinished text into habit
History. Description History rows open Before/After with restore as a new ordinary
edit. These choices are documented in DESCRIPTIONS.md for adjustment after testing.

Version 7 adds the optional field; existing v1–v6 raw events and SQL schema remain
unchanged. Add requested placeholders through ordinary undoable edits, protecting
past description decisions and deliberate blank new habits. Sample notes/drafts
remain isolated in memory.

## 034 — Compact description inspection and versions

Date: 5 October 2026. Status: founder approved all three suggested improvements;
implemented, iPhone review pending. Superseded in part: Versions moved with the
note from the statistics card to the
[Notes tab](#5-october-2026--notes-first-tabs-and-first-open-editor-position).

Show actual highlight colour (or a mixed-selection indicator) on the existing
toolbar button. Inspect selected links in a floating compact panel; explicit Open
uses the native handler, Edit/Remove target the complete link while retaining its
words/formatting and temporary Undo. Avoid navigating on an editing tap.

Add Versions beside Edit on the statistics note card, with a virtualized list of
that habit's active description actions and the existing Before/After reader.
Restore overlays only the text on the current habit as an ordinary v7 change.
Do not restore an entire outdated habit definition or erase raw events. Match
History's sequence ordering and Undo/Redo semantics. Keep repeated saved text so
its distinct Before versions remain accessible. No extra persistence, dependency,
clipboard polling, remote previews or grid computation is required.

## 035 — Safe style clearing, editing continuity and passage comparisons

Date: 5 October 2026. Status: founder approved all three proposed improvements;
implemented, iPhone acceptance pending.

Keep useful destinations when clearing note styles; explicit link Remove still
removes them. Clear style marks and normalize blocks in one temporary Undo step.
Remember cursor/selection and scroll for matching saved or recovered text through
the local draft store, preserving selection direction and initializing only once.
Use v2 draft JSON with optional bounded position data and clean bookmark keys;
retain v1 reads and existing draft SQL schema. Never put these positions in habit
History/backups or reuse them against different text. Transfer creation/form
positions when the outer habit draft is applied; discard remains non-applying.

Highlight changed complete Markdown passages in the existing Before/After reader,
with a compact Changes switch. Preserve formatting and working native links;
style and destination differences count, equivalent delimiter spellings do not.
Virtualize passages and cap the comparison matrix to avoid quadratic memory for
long unrelated notes. These are local UI/derived-data changes, with no new package,
main storage version, raw-log rewrite or grid work.

## 5 October 2026 — Live description editing and calendar statistics

**Founder decisions:** replace Write/Preview with live formatted editing; add
editor-local Undo/Redo, reversible formatting and optional highlight colours.
Retain the compact description entry controls and full-screen editor. Statistics
must use each habit's own start period, independent of other habits; numeric
averages divide by all calendar days since the start, not just recorded days.

**Implementation:** Tiptap/ProseMirror lives in an offline Expo DOM component with
its own temporary history. Native screens, description readers and the v7 string
storage contract stay unchanged. Bundled editor assets require no external service.
A fixed highlight palette has a small documented Markdown extension. Applied notes
use existing habit edits; draft text recovery remains separate. Calendar ranges
include today and do not pause during archival. Blanks contribute no total but
remain distinguishable from explicit zero in entries and daily charts.

**Test resource safeguards:** a failed DOM assertion once tried to print an
entire jsdom browser element and exhausted the development machine's memory. The
assertion now checks a boolean instead. Test commands bound per-process heap,
file duration and parallel files, and assertions avoid printing whole jsdom
graphs. These safeguards are development controls and do not imply measured
native app memory usage. See TESTING.md.

## 5 October 2026 — Description interaction polish

The founder requested a better-placed link form with more action padding,
formatting that retains its text selection, and more description content before
Read more. The link form is now a compact bottom sheet with scrollable fields and
a separate padded action footer. Cancel and Apply retain meaningful selections.
Formatting taps preserve focus. Initial editor readiness uses an Effect Event so
Expo DOM's changing callback proxies do not rerun end-of-document focus after
each native update. Regression tests simulate that callback churn.

The collapsed description budget is four complete blocks and 220 points scaled
with system text, replacing two blocks/150 points. Actual rendered height still
bounds a long paragraph or list. Character count no longer produces a redundant
Read more on text that fits. These sizes are implementation tuning, with phone
layout acceptance pending. The founder subsequently confirmed that formatting
selection and bottom-link-sheet spacing are improved on the phone.

## 5 October 2026 — Keyboard toolbar, floating menus and URL paste

The founder approved the three proposed editor improvements: bottom formatting
controls above the keyboard, floating text/highlight menus that do not shift the
writing area, and pasting a URL onto selected words to create a link.

Controls follow the native keyboard-resized editor surface. Menu overlays size to
the remaining container height, scroll in tight layouts and use a short opening
transition unless Reduce Motion is enabled. Measurements stay within the DOM;
native props and initial-focus behaviour remain stable during ordinary editing.

The selected-text paste plugin accepts explicit allowed web/app URLs, retains
existing text/marks and selection, and closes local history groups around one
link action. Normal prose, bare domains, empty cursors, code and multi-block
selections keep normal pasting. Stock Tiptap selected-link paste is replaced so
validation, app-note schemes, Undo grouping and length-limit handling agree with
the editor. It uses only the paste event, not background clipboard access.
Regression tests cover preservation, destination changes, Undo/Redo, exclusions
and atomic rejection. Phone keyboard/layout and iOS Paste acceptance are pending.

## 5 October 2026 — Shared text size, comparison navigation and outline controls

The founder approved Next change and consistent outline editor controls, and
requested a single app-wide text-size setting including notes. The assistant chose
85–150% in 5% steps, a Reset action, application on slider release, and multiplication
with system accessibility scaling. Shared native Text/TextInput wrappers retain
span inheritance; the grid and DOM editor consume combined scale. Tight layouts
wrap or grow, with existing touch minima preserved. Physical-device sizing is
still awaiting acceptance.

Text size is a v8 preference, included in backups but excluded from History/Undo.
Legacy v1–v7 logs and fixtures remain unchanged; SQL schema stays at version 1.
Next change cycles through altered passages with bounded measurement retries and
manual-scroll cancellation. Editor icons use a fourteen-icon subset generated
from the existing Tabler paths, adding no dependency and keeping the full icon
catalogue out of the editor bundle.

## 5 October 2026 — Preview recovery and global motion shortcut

The founder reported failed preview sharing and that many menus have no usable
title. The founder requested a motion alternative excluding shake (reserved by
Expo Go).

Use foreground-only Expo Accelerometer sampling at 10 Hz. A stable viewing pose,
face-down hold, small arming tap and settled return within four seconds trigger
a single capture from any native/DOM screen. Deadline/cooldown and magnitude/
movement checks reject transient movement and long unattended face-down poses.
One shared capture busy gate replaces per-title lifecycles; failed uploads retain
one image for explicit Retry. Title/accessibility shortcuts remain, with an
accessible Settings fallback. All are env + `__DEV__` guarded and excluded from
release JS; screenshots/tokens/logs remain ignored and motion data is not stored.
Device gesture comfort still needs phone acceptance.

## 5 October 2026 — Statistics uses the native bottom sheet

The founder requested bottom-up entry and easier downward dismissal matching
History/Settings. Use the same native pageSheet, slide animation and swipe
dismissal, superseding sideways entry and custom overscroll calculations. Keep
full statistics content, accessible Close and the grid mounted underneath. Nested
editors and save-failure/retry live within the presentation tree. Native layout,
scroll/dismiss coordination and nested presentation need physical-iPhone QA.

The founder confirmed the gesture works and statistics looks good on the iPhone.
They requested stronger preview feedback, so
arming now uses one heavy impact and confirmed saving uses two heavy impacts
110 ms apart. Feedback failure never changes a capture/upload result, and these
explicit development cues remain separate from routine habit feedback.

## 5 October 2026 — Quiet statistics, grouped settings and optional hiding

The founder requested plain, human statistics and a settings redesign that can
expand. The assistant replaced the dominant percentage and repeated KPI cards
with a count/total summary, quieter secondary percentage, date range and compact
streak rows. Existing calculations, notes-first placement, charts and editable
calendar remain. Settings now opens a compact index with Appearance, Daily
tracking, Archived habits and Backups; development content moves behind one row.
Back/Close remain accessible and saving errors remain visible.

The founder requested hiding completed activities and clarified that each habit
will eventually have completion conditions. Those rules remain deferred: the
shared completion predicate currently counts checked checkbox habits only;
numeric records, including zero, do not automatically mean complete. Assistant
choices pending phone review: off by default, Today-only filtering, Show completed
for correction/statistics, and full list on past/future browsing. Reordering
fills displayed slots without moving hidden/archived slots. The strict v9 boolean
preference preserves History, Undo/Redo, grouping and existing v1–v8 replay; SQL
schema stays 1. The checkbox-only completion rule is superseded by
[effective-dated goals](#6-october-2026--effective-dated-success-goals), which
define completion for all four habit types.

The founder confirmed the new Settings/statistics layouts look better and that
Hide completed/Show completed behaves as intended. They asked to remove remaining
blocks of explanation or put them behind info buttons. The revision uses
accessible labelled info disclosures, collapsed by default, and removes the
obvious single-day bar caption. Chart units, aggregate bucket sizes, save
state/errors and restore confirmation remain direct. The disclosures still need
device review.

## 5 October 2026 — Large descriptions and a compact Notes trial

The founder requested faster long-note viewing/editing and three progressively
longer test habits. Sample-only fictional notes now grow from 1,874 characters on
Go for a walk, through 7,723 on Read, to 17,657 on Meditate. Real habits, initial
preset notes, history and backups are unchanged.

The founder agreed to try a compact three-line Notes card plus full-screen reader
but said they are not yet convinced. Keep this explicitly experimental. A bounded
plain-text excerpt leaves more room before statistics; full formatting and links
live in a virtualized reader. Edit overlays that reader and returns to it. Device
tests should cover opening, long scrolling, typing/formatting and immediate Done
at each note size. Superseded by the
[Notes-first tabs](#5-october-2026--notes-first-tabs-and-first-open-editor-position):
the compact card gave way to one-tap access to the full note.

Source tracing found full initial-document parsing on native/DOM prop renders,
whole-document serialization for validation and every change/snapshot, and a
collapsed reader rendering complete large lists before clipping. Memoized startup,
prepared original-byte snapshots, weak immutable-document serialization caches,
bounded excerpts and virtualized reader passages address those costs. Bridge
text updates batch after 200 ms quiet, with a one-second continuous-input deadline;
Done/Close remain exact and background paths request current text. Position-only
updates no longer retransmit unchanged Markdown. Full per-document limit
validation and local Undo remain immediate. A local diagnostic counted 75 → 25
serializations at each note size; it is not native frame-rate evidence.

## 5 October 2026 — Notes-first tabs and first-open editor position

The founder reported that the long-note reader feels instant at all three test
sizes, but the preview is too small and Notes is high priority for one-tap access
from the grid. They authorised a Notes/Statistics tab trial in one habit sheet,
opening Notes first when a description exists and Statistics otherwise. This
supersedes the compact-card/second-reader step without changing saved notes or
statistics calculations. Panels mount on first visit, then retain scroll/range/
chart state while excluding inactive content from touch and accessibility.

They also reported slower editor startup for Meditate and a first-open black
scroll position on Meditate/Read. Source inspection found a first-open end caret
while the writing viewport starts at zero. That mismatch can invite keyboard
scrolling towards distant content; it is a plausible cause, not a device trace.
First opens now align caret/viewport at the beginning, existing matching-text
bookmarks still resume, viewport/content resizing retains the target until user
interaction, and the writing area owns scrolling within clipped DOM roots.
Native startup feedback covers readiness and stops on load error. The full reader
is accepted as responsive. The founder subsequently confirmed first editor opens
now start correctly without the black jump on the iPhone. The tab arrangement
and broader bookmark/keyboard matrix still need phone review. The founder then
reported that access or tab switching needs refinement; the specific problem is
awaiting clarification. Do not treat the tab trial as accepted. The next entry
records the clarification: the top tabs were hard to reach.

## 5 October 2026 — Reachable habit tabs and swipe navigation

The founder clarified that the top tabs are hard to reach with a thumb. They
proposed horizontal swipes, moving tabs to a floating bottom island, or both,
and delegated the design choice. The assistant chose both: a compact bottom
Notes/Statistics island with habit-coloured selection, plus native horizontal
paging. No change to the outer sheet's upward entry/downward UIKit dismissal.

Native directional locking separates vertical reading/statistics scrolling from
horizontal paging; presses remain distinct. The initial panel mounts first,
then its neighbour warms after 200 ms or navigation. Both retain fixed viewport
geometry and reading/range/chart state. UI-thread offsets move the selection
pill, while React handles only discrete aligned pages. Island height is measured
for bottom content clearance and text scaling. Tab taps respect Reduce Motion;
rotation realigns the settled page. Haptics occur once for an actual page change,
never for routine vertical scrolling. A non-interactive fade makes the floating
control legible. New gesture feel, thumb reach and native sheet interaction still
need phone acceptance; this is an implementation choice, not approved device QA.

## 5 October 2026 — Native panel-opening layout crash

The founder reported errors opening habit details after the floating-switch
change. The connected iPhone Hermes runtime's console reported `TypeError:
Cannot read property 'layout' of null`, pointing to the switch-height state
updater. It retained the native layout event, which React Native releases before
React may execute a deferred update. The handler now copies the numeric height
synchronously and closes over that primitive, as the page-width handler already
does. This corrects the implementation without changing the navigation design.

A focused regression executes both actual panel layout callbacks, releases their
synthetic events, then runs queued state updates across initial/rotated/scaled
measurements. It fails on the prior code with the same null-layout error and
passes after the fix. Source inspection and the connected runtime supplied the
trace. The founder confirmed the fix on the
iPhone ("All good now"). The wider swipe/rotation/accessibility matrix remains
separate; browser-only opening checks do not establish native event safety.

## 5 October 2026 — Categorical and free-text habits

The founder authorised both and explicitly rejected limiting a day to one
category. The implemented categorical value is a set of any number of configured
options (up to the bounded option list); it is not a single-choice field. Stable
option IDs and optional short labels preserve records across rename/archive.
Completion rules are deferred; logged entries stay distinct from completion.
(Superseded the next day by
[effective-dated goals](#6-october-2026--effective-dated-success-goals) for all
four types.) Free text uses a plain multiline daily value, separate from the
Markdown habit description. Comments remain deferred; daily comments are a
founder suggestion without a confirmed attachment/design.

The founder requested testing dynamic cell text size. The first 80% minimum felt
too small on the iPhone. The revised implementation caps previews at 32 characters
and allows two lines, native fitting bounded at 95% and truncation with full-value
access. It preserves app/OS scaling. Category/text entry sheets apply only on
Done; Close cancels. Category configuration has its own full-screen draft editor
so the main habit form stays compact. These are assistant implementation choices
within the authorised scope, pending device feel/layout acceptance. The 95%
fitting is superseded by the next entry, which disables autosizing.

New log/export v10 retains v1–v9 prefixes, the same atomic SQLite schema/queue
and Undo/grouping semantics, with content comparisons for arrays. Statistics
show recording counts/rates/streaks and category frequencies, never an invented
completion score. Workout/Highlight fixtures extend only the isolated sample
store; the existing v7 sample fixture and real presets are unchanged.

## 5 October 2026 — Readable text-cell truncation

The founder reported that “A quiet afternoon with a friend” still compressed
into unreadable letters, while “Finished a chapter” and “A walk by the river”
were reasonable minimum-size references. The prior 95% claim was incorrect:
React Native 0.86.3's Fabric iOS text layout reads `minimumFontSize` (default 4),
not `minimumFontScale`, when autosizing. Confirmed against installed source and
[the versioned upstream implementation](https://github.com/react/react-native/blob/v0.86.3/packages/react-native/ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTTextLayoutManager.mm#L246-L249).
No native dependency patch or unsupported text prop is introduced.

Disable native autosizing for categorical/free-text grid and calendar values.
Use a readable 12-point grid font (14-point line height) before app/OS scaling;
native width-based wrapping and tail ellipsis truncate excess text. Grid line
capacity follows measured row height and combined scale, capped at three: the
Compact/Standard row presets of the time normally got two, Roomy three. Column
spacing/orientation changes the width available to native wrapping. Full values remain intact and
accessible. This is the assistant's corrective implementation choice following
the founder's readability feedback; iPhone acceptance remains pending. The
founder had already confirmed category multi-selection and Done/Close on the
iPhone.

## 5 October 2026 — Defer hidden grid appearance work

The founder reported delayed feedback for row/column spacing buttons while in
Settings. Source tracing confirmed every choice propagated to the hidden grid;
column changes remounted header/body lists through their width keys. Keep those
keys and native UI-thread scroll alignment, while holding grid presentation
preferences during the History/Settings/archive sheet and its dismissal.

Settings highlights and durable preference writes remain immediate. Native
`onDismiss` releases the final row/column/text-size/fading/filter values once;
an inner TypographyProvider prevents hidden font-context invalidation. Keep the
grid mounted to retain range/scroll state, with live entry subscriptions and
save failure/retry. This is the assistant's performance correction within the
founder's request; no storage schema, new dependency or backend is needed.

## 6 October 2026 — Effective-dated success goals

The founder accepted the proposed coherent rule system for all four habit types,
especially preserving past goals when targets change. Numeric comparisons,
category Any/All/count/exclusions, literal text matching, Every day/selected
weekdays and Track only are confirmed. Blanks never succeed; numeric averages
continue across all calendar days. Share evaluation across grid, Statistics and
Hide completed today. Weekly quotas, skips and manual overrides remain deferred
(weekly quotas arrived later that day; see “Period goals, cycles and
full-screen editing”).

The founder suggested a goal timeline viewer/editor, possibly as the main editor.
The assistant chose the timeline as the main entry point: Change goal defaults to
Today, earlier/upcoming versions remain accessible, corrections/removal explicitly
confirm changed periods. Goal versions live in ordinary v11 undoable definitions;
no daily values or legacy log prefixes are rewritten. The editor remains a
compact scrollable native sheet with fixed actions and an optional test-value
disclosure. See [GOALS.md](GOALS.md) for rules and ownership.

Superseded in part the same day: a direct Goal form replaced the timeline-first
entry point
([Checkbox completion and goal editor refinement](#6-october-2026--checkbox-completion-and-goal-editor-refinement)),
and [period goals](#6-october-2026--period-goals-cycles-and-full-screen-editing)
added weekly quotas and removed the test value. Skips and manual overrides
remain deferred.

## 6 October 2026 — Recoverable deletion of archived habits

The founder requested Delete on archived habits and explicitly chose Delete with
Undo, retaining earlier changes in the change log/backups. The assistant chose
separate labelled Restore/Delete buttons under each archived row's details and
the standard native confirmation, naming the habit and recorded-day count.
Cancel saves nothing; History Undo restores the complete archived habit and its
records, then Restore returns it to the grid.

A v12 structural snapshot action removes/restores the definition and all daily
values in one atomic transaction and one Undo step. Recheck archived state on
confirmation, keep visible failure/retry, and preserve append-only history,
local description drafts/bookmarks, schema 1 and unchanged v1–v11 prefixes.
Earlier History rows retain deleted habit names/types using display-only metadata.
Permanent erasure, active-grid deletion and bulk deletion remain separate scope.
Native confirmation, larger-text layout and VoiceOver need phone review.

## 6 October 2026 — Archive layout balance

The founder requested a better-balanced archive layout and suggested more useful
details. The assistant aligned icons with names, retained count/type/unit metadata,
added the first/last recorded-date span and a bounded two-line plain note excerpt,
and made Restore/Delete share a consistent equal-width bottom row. Date spans use
habit/day keys, and note parsing uses the existing 600-character excerpt helper;
no persistence or deletion semantics changed. Browser layouts were inspected;
native visual acceptance remains pending.

## 6 October 2026 — Checkbox completion and goal editor refinement

The founder reported checkbox success appearing broken and shared the goal editor
and grid. Source tracing found the grid explicitly excluded checkbox cells from
the completion tint; the checkbox evaluator itself already returned success.
Use the same cached row-colour completion background for all types. Tests cover
checkbox entry changes, dated schedules, statistics, filtering, Undo/Redo and
SQLite reopening; browser interaction additionally checks actual cell backgrounds.

The founder requested a substantial menu makeover. The assistant chose a direct
Goal form with compact condition/repeat/date groups and fixed Close/Done actions.
This supersedes the timeline-first landing screen and duplicated current-goal card.
The timeline remains in the same sheet, preserves the form draft on Back and asks
before replacing a dirty draft. Earlier periods remain explicit, confirmed edits.
Checkbox completion is a statement, and the optional test uses a real checkbox.
Opening an unchanged default goal adds no version. Category exclusions collapse,
include/exclude membership stays mutually exclusive, and errors name the specific
problem. The goal sheet reflects the enclosing habit draft's identity and dates.

## 6 October 2026 — Period goals, cycles and full-screen editing

The founder approved removing Try a value, separating daily conditions from
frequency, and adding fixed weekly/custom period targets with dated history.
They also requested on/off cycles in days or weeks, including 5 days on/2 off,
3 weeks on/1 off and alternating weeks. Full-screen Create/Edit and short parent Back labels replace the bordered
habit dialog and avoid a persistent breadcrumb trail.

The assistant implemented whole successful-day quotas (At least/At most/Between),
stored anchors independent of later week-start preferences, optional day/week
cycles and compact progress in Statistics. New period changes suggest the next
boundary; New period today starts an anchored custom interval. Fragments caused
by start/policy boundaries are retained but unscored, with no silent prorating.
Open periods are progress, fully off periods neutral, and only finished complete
periods contribute final outcomes. Daily cell completion remains independent.

Version 13 adds strict optional timing fields to the existing goal definition;
no SQL migration or old-log rewrite. Bounded schedule/window arithmetic avoids
lifetime day allocations. Sample timing rules are isolated fictional edits.
See GOALS.md for bounds, semantics and deferred variants.

## 6 October 2026 — Quieter goal editing and attached help

The founder found the expanded goal form visually complicated and requested
better organisation, plus a subtle separator for detached-looking info toggles.
The assistant chose four summary rows (Counts when, Repeat, Cycle, Applies from),
with one editing section open at a time. Selected-value lists replace permanent
button banks; a single cycle Pattern includes None/presets/Custom. Multiple
category/weekday selections remain direct. Hidden section content stays mounted
to retain drafts and is excluded from accessibility. No rule/storage semantics
change. Incomplete summaries use prompts rather than exposing NaN values.

Shared InfoNote rows now have a quiet hairline divider, consistent small spacing,
an expand arrow and indented explanation text. Touch targets, app/OS font scaling
and reduced-motion-aware explanation/choice fades are retained across Settings,
Statistics and goal screens.

## 6 October 2026 — Direct goal choices and dated checkbox defaults

Founder: remove nested selectors repeating the same value, rename Counts when to
Success condition, allow unchecked success and default-On checkboxes, accessible
from both habit and goal editing. Implemented one disclosure per primary goal
choice. Default state is a separate control within Success condition and beside
Goal in habit editing. Implementation choice: store defaults in the dated goal
timeline; untouched days inherit them, explicit 0/1 records override them. This
preserves earlier behaviour and keeps all changes undoable without daily writes.

## 7 October 2026 — Tick/cross grid trial

Founder requested trying tick/cross icons in place of checkbox outlines and sizing
those marks with the app text slider. Assistant chose a single main-grid trial
before adding a saved style selector. A tick means the dated checkbox state is
On; a cross means Off, including inherited defaults. Goal success retains the
shared row-colour background and brighter foreground, so unchecked-success goals
can have a bright cross. Ordinary unchecked crosses stay quiet and keep the
existing bounded history/future fade. This visual language needs phone feedback.

Small outline paths use the existing Icon/SVG module, with no font loading or
pack import. Their size uses the grid's combined app/OS text scale, capped by
cell width and measured row height. Touch targets, subscriptions, saved values,
Undo, default state and goal evaluation are unchanged. Settings still releases
grid geometry only on dismissal. No per-cell animation or preference was added.

Superseded by the next entry: Ticks & crosses became an optional saved checkbox
style, with boxes as the default.

## 7 October 2026 — Saved checkbox styles, tap feedback and week boundaries

Founder accepted text-size scaling as built-in behaviour, requested Checkboxes
as the default with Ticks & crosses as an Appearance option, and approved a
restrained tap transition plus subtle week divisions. They declined a separate
rest-day feature; scheduling remains part of each habit's goals.

`checkboxStyle` is a v15 preference outside History/Undo, defaulting to `boxes`
for old logs. Both modes use combined app/OS scaling, capped to measured cell
geometry. Settings applies choices immediately to persistence; grid presentation
waits for native sheet dismissal, including the week-start preference now that
it affects the grid. No entry or completion semantics change.

An accepted local checkbox tap immediately changes its state, then gives its mark
a shallow 6% press/release with a small opacity change over 180 ms. It uses the
UI thread, cancels/restarts smoothly for rapid taps and respects system Reduce
Motion. Mounting columns, save acknowledgements and Undo/Redo do not trigger it.
The week marker is a quiet noninteractive overlay on the left edge of Monday or
Sunday, aligned between date headings and body columns without affecting layout.
This full-height marker is superseded by the header-only markers in the next
entry.

## 7 October 2026 — Header week markers and optional feedback

Founder found the full-height week hairline too faint, but liked that treatment
for the missing name/day boundary. The assistant moved week markers to the date
header only: a brighter 2-point rounded vertical tick, inset 12 points from the
top/bottom, at the saved Monday/Sunday boundary. A permanent quiet hairline now
separates the fixed names/date control from scrolling dates and cells. Both are
noninteractive overlays and do not change name wrapping or column widths.

Founder requested Appearance switches for Week dividers and Tap animations,
both default On. These are v16 preferences outside History/Undo and join deferred
grid presentation. Disabling week dividers hides live and fallback header markers;
there are no week lines in the body. Disabling tap animations suppresses the
local pulse, retaining immediate state updates and the independent haptic setting.
System Reduce Motion still takes precedence when animation is enabled.

The vertical header tick is superseded by the segmented rule (next entry), and
that by alternating header week backgrounds. Both switches remain.

## 7 October 2026 — Segmented week rule trial

Founder disliked the bright vertical header ticks and approved trying the
assistant's proposal: a horizontal rule beneath the date headings, continuous
within each week with a small gap at the saved week boundary. This supersedes
the vertical tick treatment above. Each date paints its portion of a neutral
1.5-point rule; four-point insets on either side make an eight-point boundary
gap. The existing header edge retains its geometry, with no extra row or space.
Live and loading headings use the same rule; the future-pull streak follows
that edge and keeps its fixed right anchor.

Week dividers Off restores a plain continuous hairline. The permanent name/day
separator remains quiet and independent. This is a visual trial using the
existing v16 preference; no storage, completion or navigation semantics change.
Superseded by the alternating header week backgrounds (next entry).

## 7 October 2026 — Alternating date-header week backgrounds trial

Founder found the segmented rule unsatisfactory and reported that it obscured
the accepted future-pull highlight. They approved the assistant's next proposal:
faint alternating week backgrounds confined to the date headings. Habit cells,
row colours and name backgrounds remain unchanged. The original continuous
quiet header border and original pull-streak position are restored.

Header weeks alternate black and #0C0C0C; Today uses #191919 with its existing
rounded top corners so it stays distinct on either shade. `isShadedWeek` uses
a fixed Monday/Sunday calendar anchor, rather than Today or viewport offsets,
so loading older/future dates or rolling over cannot flip existing shades. Live
and fallback headings share the styling. The existing Week dividers preference
controls this trial; Off removes the week shading and retains Today. No new
preference, storage version or layout geometry is introduced. Native contrast
and future-pull visibility remain phone acceptance checks. The founder accepted
this treatment (next entry).

## 7 October 2026 — Main-page shortcuts, spacing and scrolling

Founder accepted alternating header week backgrounds, especially the stronger
Today highlight. They approved all five assistant proposals: date navigation,
recent numeric suggestions, delayed completed-row hiding, a temporary specific-entry
Undo, and name-column width. They also reported fast-scroll stalls and delayed,
misplaced layout after rotation; improvements require device feedback.

Month/year now opens a compact native inline date picker with Close, Today and
Go to date. Numeric suggestions use up to three distinct totals from the previous
30 days, ranked by frequency then recency; tapping only fills the draft. Done
applies and Close cancels. No suggestion is automatically written.

Hide completed waits for a 700 ms pause after completion-mask changes. Undo and
unchecking reveal immediately; settled rows use existing restrained movement.
The final temporary Undo is available for four seconds after any accepted grid
entry edit or archival, independently of completion/filtering and on any date.
Its own toolbar subscriber keeps the grid's callbacks/props stable. When away
from Today, a compact icon appears beside Today so date navigation stays available.
Entry corrections append ordinary compensating edits; archival restores only
archive status onto the current definition, preserving later colours/notes/order
and entries. Retouching that entry, changing archive status, deletion or a replaced
prefix invalidates a stale receipt. Receipts/timers are not stored. The founder
clarified that twelve seconds was too long; a Tabler outline replaces the text arrow.
Turning Hide completed on prepares the filtering behind Settings, so it has
settled on return; the 700 ms pause is for newly recorded completions only.

Founder requested Name width → Column spacing → Row spacing. Name widths use
80/100/120% of existing adaptive width, retaining measured wraps. Columns now use
44/48/64-point minimums: Standard is the old Compact and the new default; Roomy
is the old Standard. A new v17 `columnDensity` preference preserves old raw
`columnSpacing` events and their preconditions. Old Compact/absent maps to Standard;
old Standard/Roomy maps to Roomy. `nameColumnWidth` is also v17. Both remain outside
History/Undo, preserve Redo and defer grid geometry until Settings dismisses.
These name-width and column choices are superseded by the
[v18 sliders](#9-october-2026--grid-size-sliders-and-adaptive-defaults-v18).

Per-cell goal evaluation now caches date/definition policy, bounded to 256 dates
per live immutable definition, while values/results remain live. The date cache
keeps the loaded range plus bounded overlap. Date jumps create a 120-day window
around the target instead of all intervening years. Long ranges compact after
final native settling, over 360 days to 270. Rotation initializes both lists with
one captured date/offset and aligns the fallback on the UI thread, ignoring old
mount offsets until both current native viewports and first visible items are ready. Native gesture feel remains
a phone check; browser layout and Node tests do not establish frame rates.

The founder rejected the first performance attempt on the phone: neither problem
improved. Native columns then moved to FlashList 2.3.3, sharing reorder springs
and reducing per-cell animation setup; native inversion replaces an interim custom
flip that caused mirrored text in a shared preview. The founder reported better
scrolling and rotation, with a remaining brief intermediate layout. Final changes
batch name-height reports and cover partial native geometry with the existing
loading fallback. A physical width change still resets measured lists deliberately;
browser uses RN Web FlatList. Final transition acceptance remains pending.

The founder accepted the four-second Undo duration and existing completed rows
already filtered on returning from Settings. They requested a smooth Undo fade
and row movement after hiding/archiving. Undo fades for 180 ms; surviving names
and cells use the same 220 ms shared target animation, respecting Reduce Motion.
The founder reported that the first rotation mask remained as dashes. Native
readiness now uses FlashList onLoad/current viewports rather than waiting for its
estimated total content width to match exactly. Rotation and motion still await
physical-device acceptance.

## 7 October 2026 — Phone acceptance and remaining rendering cost

The founder confirmed that Undo/row-removal animations feel good and rotations
now lay out correctly. The remaining concern is the delay filling the grid with
real entries. Entries are already read from the in-memory projection; rotation
does not reload SQLite. Current date columns build every habit row, including
vertically off-screen rows, and width changes remount both measured lists. These
are confirmed structural costs; their share of device latency remains unmeasured.

Assistant proposal, not yet an approved rewrite: measure visible-cell readiness,
React commits and native layout on the phone; simplify cell/row view trees and
reduce work outside the visible rectangle; investigate retaining recycled views
through width changes with a renderer that explicitly supports new geometry.
Do not simply remove width keys: that previously mixed old measured widths with
new ones. Compare release performance before choosing a larger custom renderer.
The existing loading fallback is a resilience feature, not the performance goal.

## 7 October 2026 — Measure grid bottlenecks before a renderer rewrite

Founder requested tests to establish whether Skia targets the actual bottleneck
and whether simpler renderer/data changes could address it. Added development-only
phone comparisons (Normal, No goal tint, Simple cells) and explicit anonymous
reports through the paired preview receiver. Measurement separates visible-grid
readiness signals, React commits, synchronous goals, SQL awaits and projection
validation/serialization. Temporary modes stay outside storage/History and reset
when stopped. Desktop tests use fictional temporary databases only; they confirm
SQL-free entry reads and expose full-projection write costs, without establishing
native latency. No Skia or storage migration is approved or introduced by this work.

## 7 October 2026 — Reduce repeated renderer setup and off-screen cell work

Founder authorized renderer improvements without Skia after the first Normal
iPhone run showed 8.4 seconds of accumulated React rendering and only 35 ms of
goal evaluation. One shared animated-style owner per habit now survives column
recycling/rotation and serves actual name/cell/fallback views. Checkbox tap state
is allocated lazily. Real cells render around the vertical viewport, retaining
complete rows during reordering and removal/restoration transitions. Names,
measured heights and content geometry stay complete. Existing loading fallbacks,
native horizontal sync, date identity and storage invariants remain. The width
reset is retained for correctness; device timing improvement remains unverified.

## 7 October 2026 — Batch stationary native checkbox rendering and input

The second iPhone report averaged 508 ms ready versus the first 846 ms, with
different run lengths/work; this is not a controlled speedup. Founder considered
the eight-of-fourteen landscape row reduction insufficient and requested further
improvement. Native date columns now share ordinary press handling and idle SVG
checkbox drawing. Accessible per-cell views/actions and native number/text fitting
remain. At rest, date rows use static transforms without attaching animated
descriptors; menu/drag/removal restores the shared handles and native marks on
the same row views. Local tap feedback uses one temporary overlay per column.
Date recycling/cross-row releases/disabled errors reject edits. Web retains the
per-cell controls. No Skia, storage migration or dependency was added. Fresh phone
timing and native touch/accessibility checks remain required.

## 7 October 2026 — Compare development overhead before more rendering work

Founder requested a release comparison after another inconclusive development
report. Paired Expo Go sessions now use the same saved store and disable sample
mode, timing/Profiler and preview sensors in both. One retains development JS;
one uses production/minified JS. A temporary developmentFeatures override avoids
SDK 57's local-env precedence without editing the founder's env files or weakening
literal release guards. This comparison is qualitative and leaves the native
Expo Go host unchanged. EAS internal preview is prepared with explicit Release
and no dev-client; Expo project, provisional bundle ID, paid Apple membership,
signing and device enrolment are still prerequisites, not completed deployment.

## 7 October 2026 — Focused responsibility cleanup

- Founder requested a code-organization review after reporting no visible loading
  during rotation/flinging in the production-JavaScript Expo Go comparison. That
  observation used the smaller saved list, not the matched long sample fixture;
  it remains qualitative rather than a standalone Release/FPS result.
- Separate numeric draft state from App: keystrokes, validation and suggestions
  belong to NumericRecordDialog; useDailyEntryActions shares accepted writes,
  latest-store preconditions and quick Undo between the grid and statistics.
- Separate native backup confirmation/error/busy handling into useBackupActions.
  Store exclusivity and atomic restore remain in the existing storage boundary.
  A synchronous ref ignores duplicate in-flight presses before React commits.
- Give the chart its own StatsChart module instead of importing one statistics
  screen from another. Retain selection, accessibility and plot appearance.
  (StatsChart was later replaced by the shared chart components; see
  [Statistics charts](#10-october-2026--statistics-charts).)
- Keep the working grid scroll/rotation controller and versioned model intact
  for now. Larger size alone does not justify splitting generated data or
  tightly related compatibility rules. No dependency or storage format changes.

## 7 October 2026 — Continue grid and replay organisation

- Founder authorized continuing with the remaining large files.
- Extract useGridDates around existing date-window/navigation/readiness/rotation
  state. Keep useGridScroll's UI-thread protocol and paired native list generation
  keys. DateColumns owns the small native/web adapter and frozen native index.
- Move context-menu measurement into HabitContextMenu. It stays mounted when
  closed, preserving measured height and existing Animated.View enter/exit. Keep
  the selected name uncovered for continued hold/drag and dispatch after closing.
- Split event types, strict validation and value utilities from replay behind
  model.ts's unchanged public interface. Validation cannot import replay. Retain
  v17 writers, exact v1–v16 prefixes and SQL schema 1.
- Function comparison found all 26 storage and 11 moved grid-handler bodies
  identical. New controller tests cover real hook transitions with bounded mocks;
  these checks do not prove phone layout/gesture or frame-rate behaviour.

## 8 October 2026 — Android testing support

- Founder asked to support porting and testing on Android, starting with an
  older Android phone over USB alongside the iPhone. Release scope is unchanged:
  iOS remains the committed target until the founder decides on Android release.
- Assistant setup: Expo Go on Android for the first runs, with `adb` for
  screenshots and crash logs from Linux (Windows has since been used as well).
  Added `export:android`, `android` and
  `android:screenshot` scripts and an Android checklist in TESTING.md. No native
  folders, dependencies, storage or app code changed.
- SDK 57 requires Android 7.0 (API 24) or later. The Android JavaScript bundle
  exported successfully. The same day it opened in Expo Go on a Galaxy S21
  (Android 15) over USB; Wi-Fi loading failed, so `npm run android` uses the
  `adb reverse` USB route by default.
- Unlike iOS, signed Android builds can later be compiled locally on Linux or
  Windows (`npx expo run:android` with the Android SDK and a JDK) as well as
  through EAS.
  Not set up yet.

## 8 October 2026 — First Android fixes

- Founder reports from the Galaxy S21: the grid stayed at 3 columns, sheets
  could not be swiped closed (founder: "needs fixing"), and the date picker
  looked out of place. Founder chose a dark in-app calendar over Android's
  system dialog, which Expo Go always shows in a light theme.
- Assistant implementation, iOS unchanged: `SheetModal` gives Android sheets a
  handle and title-bar drag dismissal and emulates the iOS-only Modal
  `onDismiss`, which also releases deferred grid settings. Dragging scrolling
  content does not dismiss Android sheets; matching iOS there would need
  react-native-gesture-handler coordination and is deferred. (Superseded the
  next day by
  [gesture sheets](#9-october-2026--gesture-sheets-and-category-entry).)
- `DateCalendar` (dark month grid, month/year chooser) replaces the Android
  pickers. Android far date jumps land without the final slide because FlashList
  re-applies its initial index. `useKeyboardFocus` opens the keyboard in Android
  dialogs. No dependency, storage or event-version changes.

## 9 October 2026 — Gesture sheets and category entry

- Founder: the Android handle/title-bar swipe was poor; use real gestures.
  Assistant implementation: react-native-gesture-handler ~2.32.0 (bundled in
  Expo Go 57). The Android sheet's pan activates only on a downward drag whose
  touched list is at its top; lists report position via `useSheetScroll`. On a
  quick flick the pan waits for that report rather than guessing. iOS unchanged.
- Founder: the category entry sheet's dark overlay slid with it, outside taps did
  nothing, and new categories could not be added there. Now the backdrop fades,
  the sheet slides, outside taps cancel, and "New category" stages labels until
  Done (existing active labels are reused; 40-category limit respected). This
  dialog is shared, so iOS changes too; iOS is not yet checked.
- Founder asked whether sliders would suit grid sizing; the assistant proposed
  stepped sliders with a live preview as a new event version (see below).

## 9 October 2026 — Grid size sliders and adaptive defaults (v18)

- Founder approved the slider proposal and asked that the Galaxy S21 default to
  four columns and slightly denser rows, with one system serving both phones.
- Assistant implementation: v18 point-or-automatic preferences for name width,
  day columns and rows; live preview and per-slider Reset in Appearance.
  Automatic sizes follow the device (rules in SETTINGS.md). The iPhone 16 Pro's
  geometry is unchanged; the S21 gets four days and 48-point rows. Earlier
  Compact/Roomy/Narrow/Wide choices keep applying until a slider is moved.
- Founder asked for the category entry sheet to swipe closed too. It now shares
  the sheet gesture (`useSwipeDismiss`) and shows a handle.

## 10 October 2026 — Pricing and licence

- Founder decision: the app earns income through a free tier plus a one-time
  US$10 unlock for unlimited use. No subscription; the app has no server costs
  that would justify one. A later subscription is only worth considering for a
  feature with ongoing costs, such as cloud sync.
- Founder decision: release the source under GPLv3, with the founder as sole
  copyright holder. Copyleft keeps the project open source while discouraging
  paid closed clones; sole ownership keeps App Store publication with the
  founder. Accept outside contributions only under an agreement that preserves
  this, such as a contributor licence agreement.
- LICENSE holds the unmodified GPLv3 text from gnu.org. README carries the
  copyright notice (Daniel Adams) and the standard "version 3 or any later
  version" grant; package metadata uses `GPL-3.0-or-later`. Third-party MIT
  notices stay in docs/licenses.
- Payment must never lock existing records, export, backups or History. Reaching
  the free limit only prevents adding more.
- Open: the free-tier limit. The founder first proposed five active habits and
  is weighing a seven-day free trial instead. Assistant recommendation: an
  active-habit cap without a time limit; archived habits do not count.
- In-app purchase needs a development build; Expo Go cannot test it. Choose the
  purchase library (for example `expo-iap` or RevenueCat) when implementing.

## 10 October 2026 — Time-of-day statistics

- Founder request: time-of-day histograms in statistics, built on the existing
  storage before any change to the storage engine (PERFORMANCE.md discusses a
  possible move from the full JSON projection to per-entry SQLite tables).
- Founder decisions: count only entries recorded on the same day they belong
  to; undone changes never appear in any statistic.
- Assistant recommendation, accepted: use each edit's captured local time, so
  travel keeps the time where the entry was made.
- Assistant choice (founder did not specify): an entry's time is when it last
  went from empty to recorded; corrections keep it. Checkbox Off is not an entry.
- Read from active History actions rather than raw events, so Undo/Redo rules
  stay identical to History. No storage or backup change. See STATISTICS.md.

## 10 October 2026 — Statistics layout and icon buttons

- Founder requests: icon Close/Edit buttons wherever needed; a less cluttered
  statistics screen, especially the goal at the top; chart explanations behind
  an information control rather than shown every day.
- Assistant implementation: range tabs first, a single headline, number tiles,
  a slim goal row below them, and an (i) button per chart. Calculations, goals
  editing, accessibility actions and stable chart selection are unchanged. See
  STATISTICS.md. Reviewed on the Android phone; iPhone review pending.
- `npm run android:screenshot` now runs a small Node script so it also works on
  Windows, where npm scripts run in cmd.exe.

## 10 October 2026 — Statistics charts

- Founder decisions: merge the numeric totals and completion charts by colour;
  success over time as weekly columns plus a two-week weighted trend; a
  dedicated, colour-coded category view; every chart and the calendar follow the
  selected range; ranges end today with ‹ › stepping back; 12 small months for
  the year calendar; automatic OKLCH category colours; entries stay at the
  bottom. The founder asked the assistant to build and iterate on the phone.
- Assistant choices: a fixed 14-day half-life (four periods for period goals) so
  the current trend never changes with the range; trend shown after about three
  observations; average per calendar day for weekly/monthly value bars; the
  sawtooth streak line instead of ranked streak bars; charts start at the habit
  start; recording tiles hidden when they repeat the goal tiles; goal status
  omitted on entries for "record anything" goals. Press-and-drag scrubbing is
  deferred until a scroll lock can be tested on both platforms.
- No storage, event or backup change. Pure series code walks the goal timeline
  without filling the shared goal cache; the old StatsChart is removed.
- Superseded in part the same day: the next entry replaced the weighted trend
  with centred smoothing and the sawtooth line with a streak timeline, and
  [thumb tracking](#10-october-2026--thumb-tracking-and-streak-rows) added
  hold-and-drag scrubbing.

## 10 October 2026 — Chart feedback and number entry

- Founder feedback: the streak chart did not work for long streaks, the trend
  line was jagged, and the number entry's Close sat behind the keyboard.
- Assistant changes: the trend is now a centred Gaussian smoothing (about two
  weeks either side) instead of a one-sided weighted average; streaks are a
  calendar timeline of runs with a best-three list, so any streak length reads
  well. The number entry puts Close (X) at the top right and Done beside the
  field, both above the keyboard; Android's keyboard Done still saves.

## 10 October 2026 — Thumb tracking and streak rows

- Founder request: track through charts with the thumb, not only tap; give the
  streak timeline several rows so it does not get crowded.
- Assistant choices: tracking starts after a short hold (about 0.2 s) so quick
  swipes keep scrolling the screen and paging between Notes and Statistics;
  paging pauses while tracking; one selection haptic confirms the hold; the
  reading stays after release. Streak rows are monthly beyond six weeks and
  quarterly beyond about 13 months. The time-of-day chart moved onto the shared
  chart frame. Android and tests verified; iPhone feel, including the page
  sheet's own swipe, still to be checked by the founder.
- Founder follow-up: multi-row streak alignment looked odd. Rows now always span
  the full width (day 1 at the left, outside days darker), labels use the shared
  30-point column so the timeline lines up with the other charts, years appear
  as headings, and quarter rows start beyond about two years. Hold-and-drag was
  confirmed on the Android phone, including moving between rows.

## 10 October 2026 — Date selector caret

- Founder request: the small text caret beside the grid's month looked odd.
  Assistant change: the month is bolder and slightly larger with a vector
  chevron sized to the text (it flips while the date picker is open); the year
  is a little clearer; the button fades when pressed. The Android calendar
  header and month arrows use the same vector chevrons. Layout is unchanged:
  month/year still sit in the top-left of the grid header.

## 10 October 2026 — Themes and custom backgrounds (v19)

- Founder request: dark / system / light themes first, with a customisable
  background colour; the rest of the app adjusts so everything stays visible.
  Reuse the OKLCH picker.
- Founder decisions: Dark and Light are each customisable, and System switches
  between them. The default is System, for older logs and new installs alike
  (changed the same day to Dark; see below). This supersedes the original "pure black background" decision; pure black
  remains the default dark background.
- Assistant design: one pure module (`src/theme.ts`) derives every colour from
  the background. Interface greys keep their original contrast relative to the
  background, which is exact on black. Habit and accent colours keep their hue
  and colourfulness and only lighten or darken to reach 4.5:1. Saved habit
  colours are never rewritten. Backgrounds are limited to a readable lightness
  range per scheme, which is applied at display time rather than in validation.
  The pages offer six presets per scheme. Light themes use white ticks on
  filled colours and pale note highlights. The mounted grid switches theme when
  Settings dismisses, like other presentation settings.
- Behaviour change on black: a custom habit colour below 4.5:1 is now shown
  lighter everywhere instead of sometimes grey, and filled marks are white on
  mid-tone custom colours. Presets are unchanged.
- Verified: typecheck, lint, formatting, 358 tests including new theme and v19
  persistence tests, and iOS/Android bundle exports. Light, Paper and Midnight
  were checked in the web preview (grid, Settings, notes, History). Native
  behaviour on the iPhone and Android phone is still to be checked.
- Founder follow-up (same day): make Paper the default light background and Dark
  the default theme. Stored theme preferences now use `before: null` until the
  first choice (as v18 grid sizes do), so defaults are display rules. Events
  written earlier that day with the old defaults still replay.
- Founder follow-up: a separate darker "Dark forest" preset was replaced by
  making every tinted dark preset darker by that same step (OKLCH lightness
  -0.042, colourfulness x1.23 so tints stay recognisable). Black is unchanged;
  Graphite #0D0D0D, Midnight #030A1D, Forest #01110A, Plum #110718, Espresso
  #130C07. Saved custom colours are untouched.
- Founder report: the note editor crashed on opening (Android, Expo Go). The
  cause was unrelated to theming. SDK 57 hosts DOM components in
  `@expo/dom-webview`, whose view this Expo Go build does not register. The
  editor now falls back to `react-native-webview` (added with
  `npx expo install`, 13.16.1) only when that view is missing. iOS and builds
  that include it keep the default. Metro must be restarted to pick up the new
  package.

## 10 October 2026 — Android haptics

- Founder report: no haptics on the Android phone (Samsung Galaxy S21, Android
  15, Expo Go 57.0.9). Diagnosis over adb: the phone's "Touch interactions"
  vibration is off (`haptic_feedback_enabled = 0`), and the vibrator log showed
  no requests from Expo Go at all. `performAndroidHapticsAsync` uses view
  haptics, which Android drops when that system switch is off; expo-haptics
  before 57.0.2 also ran it off the main thread, where it did nothing.
- Assistant change: Android now uses the same Expo calls as iOS (Medium,
  Soft, selection), which Expo plays through the Vibrator API. The app's own
  Haptics setting is now the switch on Android, independent of the system
  touch-interaction setting. iOS is unchanged and still follows System Haptics.
- Founder report (same day): the checkbox vibration was too buzzy. Expo's
  Android Medium is a 43 ms pulse at 20% strength. Assistant change: Android
  now uses React Native's `Vibration` with short full-strength pulses (12 ms for
  confirm and the future-pull threshold, 8 ms for undo and selection), which
  read as taps. These lengths are assistant guesses to tune on the phone.
- Founder report: unchecking felt almost the same as checking. Only pulse length
  is adjustable through React Native, so undo and selection drop to 5 ms.

## 10 October 2026 — Android future pull

- Founder report: pulling past Today for future dates did nothing on Android.
  It never worked there: the pull relies on iOS rubber-banding to a negative
  scroll offset, and Android lists stop at the edge. Assistant change: an
  Android-only pan (`FuturePullZone.tsx`) recognises a leftward pull that
  starts at the newest date and drives the same streak, threshold haptic and
  release reveal. Assistant choices to check on the phone: two-thirds finger
  speed (about 96 points to the threshold), no column movement during the pull,
  and a scroll that reaches the edge must lift and pull again. iOS is unchanged.
- Founder report: the pull and its haptic worked, but date navigation then
  drifted by weeks on its own. The reveal inserts 30 columns and relies on
  FlashList to keep the visible dates in place, then animates to the revealed
  day. On Android that correction lands after the content-size events the
  animation waits for, so the two lists kept re-correcting. Assistant change:
  Android remounts both lists at the revealed date (no slide), as its far date
  jumps already do. The same anchoring is used when scrolling forward after a
  far jump into the past (newer history loads); that path is unchanged and not
  yet checked on Android.
- Founder report: still jumped too far sometimes. Assistant reading: a long
  Android pull. The reveal continues by the released pull distance (on iOS the
  rubber band keeps that near one column), and the Android pull had no such
  limit, so long pulls landed several days ahead. Assistant change: Android
  always continues by one column, so tomorrow lands beside the old edge.

## 10 October 2026 — Calmer History with bursts, filters and a floating Undo bar

- Founder request: organise History in a more modern way. Founder decisions:
  collapse check-in bursts using a 5-minute gap; add filters that are compact
  and stay out of the way; move Undo/Redo to a floating bottom bar; add day
  summaries and load older changes while scrolling. A per-row Revert was
  declined for now.
- Assistant choices (founder did not specify): a burst is two or more
  neighbouring entries for the same entry date, each within 5 minutes of the
  next (either clock direction). Any other action ends it, and it never
  reorders the log. Its key is its oldest entry, so it stays expanded while
  Undo removes newer ones. Expanded entries share one quiet card.
- Assistant choices: filters are All, Entries, Edits and Notes, plus a habit
  picker listing only habits present in History, including archived and deleted
  ones. Notes means rows that read "Description edited/cleared"; a goal edit that
  also changes the note stays an Edit. Order changes belong to no habit. Filters
  reset each time History opens and are never saved.
- Assistant choices: Undo always reverses the newest action, even when a filter
  hides it, so the bar always names its target. "Saved" is no longer shown;
  failures still show the message and Retry above the filters, and rows still
  show Saving…. Day counts follow the active filter and count the whole day even
  before older rows load.
- Presentation only: no storage, event version, backup or Undo/Redo change.
- Founder follow-up: History needed better date navigation. Founder decisions:
  tapping a day heading folds or opens it, older days start folded, and a
  calendar jumps to a date. Performance with a long history matters.
- Assistant choices: Today and Yesterday start open; with a filter on, every day
  starts open because the list is already short. Fold choices last until History
  closes. Folding a pinned heading scrolls it back to the top of the list.
- Assistant choices: the calendar button sits in the History header beside
  Close, because the filter row was already nearly full on the phone. The
  calendar marks days with changes (following the filters) and dims the rest.
  Choosing a day without changes opens the newest earlier day that has some, or
  the oldest day. Dates are edit days, as History groups them.
- Assistant performance choices: days load 40 at a time and are never split;
  each action's day and kind are cached for the session; the whole log is
  scanned only while the calendar is open. Node timing (not a phone measurement)
  for 20,000 synthetic actions: about 7 ms uncached, 2 ms cached, 0.1 ms for 40
  days.

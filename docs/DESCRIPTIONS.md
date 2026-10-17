# Habit notes

A habit can have up to eight named notes in plain text or Markdown, keeping
motivation, rules, reminders and links one tap away from the grid. Tapping a
habit's name opens its notes on their own Notes page, beside Statistics. Notes
are written in a full-screen formatted editor, and every applied change to a
note's words can be compared with earlier versions and restored.

A single note per habit (then called its description) was requested by the
founder and implemented 5 October 2026. The founder confirmed formatting
selection and the link-sheet spacing on the iPhone that day; broader keyboard,
accessibility and recovery acceptance remains pending. Several named notes
replaced the single note on 17 October 2026 (below). Code and older History
rows still say "description" in places.

## Several named notes

Founder request, 17 October 2026, after feedback that one note forces
everything into one place: each habit has its own short list of notes, such
as Info, Why or Rules. Nothing is created automatically. The founder agreed to
the assistant's concept (a cap of eight notes per habit, preset names as
suggestions only, a wrapping row of note names on the phone, and a Today tile
trial), asked for notes to be saved apart from the habit definition so habit
edits never copy them, and chose the web layout: notes in the habit dialog with
a Notes/Statistics switch, not a sidebar.

- **Presets** are suggested names, each with a line about what it is for:
  Info (anything worth keeping), Why (the reason, for the days it feels hard),
  Rules (what counts and what doesn't), How (steps, routine or setup), Cues
  (when, where and what reminds you), Links (articles, videos, tools), Ideas
  (variations to try) and Obstacles (what gets in the way, and the plan).
  Only the chosen title is saved. A preset's line is the empty note's prompt
  in the reader and the editor; any other name gets a general prompt. Names
  already used by the habit are not offered again, and a name of your own
  (up to 40 characters) works the same way. Names are unique per habit,
  ignoring case. Core `notes.ts` holds the presets, rules and builders.
- **Adding** a note names it first (a preset or your own name), then opens the
  editor. Done saves the new note as one action, even before anything is
  written, so a habit can be given an empty Rules note to fill in later. Close
  creates nothing.
- **Each note** can be edited, renamed, moved earlier or later, and removed.
  Removal asks first; Undo brings the note back, and History keeps its text.
  A note's text can be empty; its title stays.
- **Order** is the user's. The first note is the one a name tap shows.
- **An older single note** (a v7 description) reads as the first note, named
  Info, with no change to saved data. Editing, renaming, moving or removing it
  moves it out of the habit definition in that same action; Undo puts it back
  exactly. See [STORAGE.md](STORAGE.md) (version 23).
- **The habit editor** no longer has a Description field (both apps): notes
  are written from the habit's Notes page.

**Phone.** The Notes page keeps its place beside Statistics, with the same
bottom Notes/Statistics switch and paging. Under the header, the note names
wrap onto as many lines as needed rather than scrolling sideways, so they never
compete with the pager; the shown note's name is tinted with the habit colour,
and a dashed + adds a note. Under them, Versions (when the note has any) and
Rename or move. Holding a name opens the same actions. The header's Edit edits
the shown note (Add a note when there are none). Adding, renaming and the
note's actions use one small sheet drawn inside the habit sheet, not another
native modal, so the editor can open the moment it closes. Removal uses a
native confirmation. A habit without notes shows "No notes yet" and Add a
note; an empty note shows its prompt and Write.

**Web.** The habit dialog switches between Notes and Statistics in its
toolbar, like the phone (founder decision, 17 October 2026, replacing the
Notes card beside the statistics, which squeezed the note). It opens on Notes
when the habit has any, otherwise on Statistics. See [WEB.md](WEB.md).

**Today tiles (experiment, 17 October 2026).** A habit with notes shows a
quiet notes button in its tile's corner, on both apps, which opens the habit
straight onto its Notes. The phone tile also gives screen readers one action
per note ("Open Why note"). Whether to show a note's first line on the tile
(for example a rule, at the moment of recording) is still to be tried.

## Reading and editing

Notes and Statistics are two tabs in the same habit sheet (founder request for
the full note one tap from the grid; this replaced an earlier compact note card
after the founder found the long-note reader instant at all three sample sizes).
Name taps open Notes when the habit has any note and Statistics otherwise. Notes
shows the full formatted reader immediately, with no preview or second Open
step. Without notes it offers Add a note. The common header shows the habit
with Close and an Edit control: the shown note on Notes, the habit on
Statistics. Versions sits under the note names once that note has history.

The tabs are switched by a compact floating Notes/Statistics island inside the
sheet's bottom safe area and by native horizontal paging (assistant choice,
after the founder found top tabs hard to reach and left the choice between the
two open). The active pill follows page motion on the UI thread; a tab tap
scrolls to its page, respecting Reduce Motion. Vertical child scrollers and the
outer horizontal pager use native directional locking. The sheet's upward entry
and downward dismissal are unchanged.

The first selected panel mounts alone, with its neighbour warmed after 200 ms
or at the first horizontal drag/tab tap. Both then stay mounted side by side,
preserving reading/statistics scroll, chart selections and ranges. Each page has
fixed viewport geometry, preventing nested vertical content growing the pager.
The island follows app/system text scaling; measured height reserves bottom
content padding so final text and controls can be scrolled above it. A
non-interactive fade separates the floating control from content behind it.
Inactive panels retain their layout but accept no touches
and are hidden from accessibility. The reader FlatList mounts nearby passages
and splits top-level lists into individual rows, retaining nesting and numbering.
Its disposable cache is capped at five documents/100,000 source characters.
Edit/version/numeric dialogs present inside the same native sheet, and save
failure/retry is visible there. The tabs are a founder-authorised phone trial,
not a final navigation decision. Edit and version-list summaries parse at most
600 source characters.

The editor is full screen with fixed Close and Done controls, the habit's name
as its title and the note's name under it. (Until 17 October 2026, Create and
Edit habit also had a compact Description control that opened it; that control
is superseded by the Notes page.) The founder requested live formatted editing, replacing
Write/Preview tabs. Bold and italic toggle the selected formatting rather than
nesting Markdown markers. One compact toolbar provides local Undo/Redo, Bold,
Italic, text/list options, links and highlight colours. Text options group headings,
lists, quotes, strikethrough, inline code and Clear formatting in a compact panel.
Clear formatting removes style marks and block styles while retaining link
labels/destinations. It preserves the selected range, leaves surrounding inline
styles intact and is one local Undo/Redo step. At a caret it clears stored style
marks for subsequent typing, while retaining the link.
Links can be added, changed or removed while retaining the selected text. Highlight
options are None, Yellow, Green, Blue, Purple and Pink; choosing the same colour
again removes it. Additional controls appear only when opened. The toolbar wraps
if text scaling or available width requires it. The toolbar stays at the bottom
of the editor, immediately above the keyboard while typing; native Close/Done
stay at the top. Writing has most of the screen. Text and highlight menus float
above the toolbar without changing the writing area's size or scroll position.
They fit the remaining editor height after keyboard/orientation/text-size changes
and scroll when necessary. A 140 ms opening transition respects Reduce Motion.
Tap the menu button again, tap the document or use Escape to dismiss a menu.
The Highlight button has a small colour indicator reflecting the whole selected
range. Plain text shows a neutral indicator; mixed colours or highlighted/plain
text show a mixed indicator with an accessible mixed-selection label. The palette
marks a colour selected only for a uniform selection.

Putting the caret/selection in a single link opens a compact inspector above the
formatting strip, showing its destination and Open/Edit/Remove/Close. Tapping a
link while editing places the caret and inspects it; it never follows the link.
Open deliberately hands the validated destination to the native link handler;
reader and editor share the same failed-open message. Edit selects the complete
link, including differently formatted words, for the existing link sheet. Remove
keeps the words and other formatting and supports local Undo/Redo. Close keeps
the caret and remains dismissed until leaving/re-entering that link. Inspectors
do not compete with open text, colour or link-entry menus.

Link entry uses a compact bottom sheet within the editor, above the keyboard.
Its address field receives focus and its Cancel/Apply/Remove actions have a separate
padded footer that stays visible while fields scroll if space is tight. Cancel,
tapping outside or Escape return to the original text selection. New links remain
selected after Apply. Touch/pointer taps on formatting tools do not take focus
from the editor. Readiness and initial focus happen once per editor instance;
Expo DOM callback-proxy replacements during native updates must not refocus or
repeat position restoration. Reopening restores the saved cursor/selection and
scroll position only for matching text, including recovered drafts. Selection
orientation is retained; stale offsets are bounded to valid document positions.
First opens put the caret and viewport at the beginning, rather than an end
caret with a top-scrolled long note. Keyboard/content resizing reapplies that
initial or matching saved scroll target until the user interacts, then normal
typing/scrolling takes over. Both the writing viewport and editor content are
observed. The DOM root does not scroll; the writing area owns document scrolling.
A native Opening editor indicator covers startup and stops on readiness or a
load error; `richText/useEditorReady.ts` owns this boundary.

Select words and paste a full web or app URL to turn the words into a link,
retaining their other formatting and selection. Pasting onto an existing linked
phrase changes its destination. This is one local Undo/Redo step, separate from
adjacent typing. It works through the normal paste event, with no background
clipboard reading. The explicit link sheet remains available. Ordinary text,
bare domains, empty cursors, code and multi-block selections follow the normal
paste path. Executable/local-resource URLs are not made into links. Oversized
link formatting is rejected by the same atomic description limit.

The editor has its own temporary Undo/Redo history, separate from app History.
Typing groups after 500 ms of inactivity; toolbar formatting actions are separate
steps. Editing after Undo clears the editor's Redo branch. This session history
holds at most 100 steps and is not recovered with a draft or exported. Done still
applies one normal habit change. Opening and closing without edits, or undoing
back to the initial document, retains the original Markdown bytes.

Done applies one normal undoable note change immediately. Close asks before
discarding changed text. Blank/whitespace-only text leaves the note empty
(Remove deletes a note). Newline normalization preserves indentation and other
meaningful Markdown whitespace.
Notes are limited to 20,000 UTF-16 characters; the counter appears near the limit.
These preview/size choices are implementation decisions, not new product goals.

## Markdown and links

`markdown-it` 15.0.2's browser build parses text into tokens; `DescriptionText.tsx`
renders native text/views. Supported content includes headings, bold/italic,
strikethrough, paragraphs, lists, quotes, code and optional highlights.
Yellow highlights use `==text==`; other named colours use `=={green}text==`
(with blue, purple and pink also supported). This is a small OnPurpose Markdown
extension with a fixed palette, not arbitrary HTML or styles. Native readers,
History comparisons and the editor use the same syntax. Other Markdown apps may
show the highlight delimiters literally. Plain URLs become links.
Raw HTML is displayed as text. Tables are not enabled. Image syntax displays its
alt text, without fetching remote images when a note is opened.

Links open through the operating system only on an intentional tap. Explicit
HTTPS/HTTP, mailto and app note links (such as obsidian) are supported; relative
URLs, malformed addresses and executable/local-resource schemes are rejected.
If the target app cannot open a link, the user sees an error. Link text is
underlined and uses the habit colour when readable, with a contrast fallback.
Markdown itself requires no account, network connection or external editor.

The live editor uses Tiptap/ProseMirror in a local Expo DOM component. Only the
full-screen writing surface uses this embedded web editor; the grid, statistics,
notes reader and saved data remain native. Expo SDK 57 hosts DOM components in
`@expo/dom-webview`; Expo Go on Android ships that module without its native view
(opening the editor crashed), so the editor falls back to `react-native-webview`
when the view is missing (10 October 2026). `@expo/metro-runtime` supports the embedded bundle. JavaScript, CSS and
HTML are bundled with the app; no CDN, server or account is required. The safe
reader parser feeds a limited editor schema; HTML stays literal, and image metadata
is retained with an alt-text placeholder rather than a fetched image. Done/Close
request a current document snapshot across the DOM bridge before applying or
confirming a discard, so the last keystroke need not wait for draft autosave.
Serialized formatting also counts toward the 20,000-character limit; an oversized
paste is rejected as a whole, with existing text and Undo retained.

`richText/selectionLinkPaste.ts` owns the selected-text paste shortcut;
`richText/useFloatingMenuSpace.ts` sizes overlay menus locally without sending
per-frame layout through the native bridge. No storage schema changes are needed.

The editor's licence notices are retained for Tiptap
([TIPTAP_LICENSE.txt](licenses/TIPTAP_LICENSE.txt), MIT), the ProseMirror
packages beneath it ([PROSEMIRROR_LICENSES.txt](licenses/PROSEMIRROR_LICENSES.txt),
MIT) and `marked` ([MARKED_LICENSE.txt](licenses/MARKED_LICENSE.txt), MIT with
the original Markdown licence). `marked` is not imported directly; it arrives
through `@tiptap/markdown`, which uses it to parse Markdown.
References: [Expo DOM components](https://docs.expo.dev/guides/dom-components/),
[Tiptap Markdown](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage).

The parser is MIT licensed; retain [its notice](licenses/MARKDOWN_IT_LICENSE.txt).
Upstream: [markdown-it](https://github.com/markdown-it/markdown-it).

## History and durable storage

From v23 each note is saved by its own `note` change (add, edit, rename, move
or remove), apart from the habit definition, so editing a habit or another
note never copies it. A v7 `description` on a definition reads as the Info
note until its first note action moves it out. Note changes use the existing
atomic event/projection transaction, serialized writes and visible
failure/retry. Undo/Redo, archive/restore, undoable deletion and full backups
retain notes; unfinished text never changes the grid or statistics. See
[STORAGE.md](STORAGE.md).

Each note action has a compact History row naming the note: "Rules note
added", "Rules note edited", "Rules note cleared", "Why note renamed Reasons",
"Rules note moved", "Rules note removed". Older rows still read Description
edited/cleared. The History filter's Notes chip covers both. Rows that changed
a note's words open Before and After in a full-screen reader; renames and
moves do not. Restore copies just the selected text onto that note of the
current habit, preserving its current name and position and everything else
about the habit, as a new undoable change. A removed note comes back at the
end under its old name (with a number if that name is now taken). Before/After highlights changed complete
Markdown passages with a subdued background and edge marker: earlier text in
Before, new text in After. The compact Changes switch hides the markers without
changing the text or passage layout. Style/link-destination changes count;
equivalent Markdown delimiter spellings do not. Unchanged passages retain their
normal appearance. Lists/code stay intact; native links remain usable. The reader
virtualizes passages and the pure comparison caps its matching matrix at 250,000
cells, falling back to marking a large unmatched middle while keeping common
ends unchanged. This prevents quadratic memory growth for unrelated long notes. A version already applied cannot be
restored redundantly. Visible History continues to contain active actions only;
Undo removes rows and Redo restores them, while the raw log remains complete.

Versions, under the note names, opens a compact, virtualized list of the shown
note's active text changes, newest by sequence first (core `noteVersions`; for
the Info note this includes its older description edits). It uses the same
Before/After reader and Restore path as History. Rows include saved time and a
short text summary; only the latest matching applied version is marked
Current. Repeated text is retained because different Before versions may
contain recoverable notes. The control is absent until that note has a text
change. Initial/seed text is available as Before the first edit; this is not a
second snapshot store. Undo/Redo affect the rows exactly as in History, with all
raw events retained in export.

## Interrupted drafts

The editor saves local draft text after 350 milliseconds of inactivity and on
backgrounding/unmount, through a serialized queue. Native drafts live in a separate
`onpurpose-description-drafts.db` with schema version 1; browser drafts have a
separate localStorage prefix. These are recoverable writing drafts, outside
History/Undo and full backups. Applied notes remain in the main change log.

Reopening recovers an unsaved draft when its saved-description base still matches.
If the saved note changed meanwhile (including through Undo or backup restore),
a native alert lets the user keep the current saved version or recover the older
draft. Applied/discarded drafts are cleared in queue order, so an earlier write
cannot resurrect them. Draft errors are visible in the editor and do not prevent
Done from using the main store's normal durability/retry path. An abrupt kill
before a debounce/background write completes can lose the most recent keystrokes.

Each note has its own draft slot (core `noteDraftKey`); the Info note made
from a v7 description keeps that habit's original key, so older drafts still
recover. A new note's draft is keyed by the ID it will have. The earlier
new-habit slot is no longer written. Sample-mode notes and drafts stay entirely
in memory and disappear on full reload. They cannot write to real drafts or
real habit data.

Version-2 local draft JSON optionally includes validated anchor/head/scrollTop;
version-1 drafts remain readable without being rewritten. No draft SQL schema or
main event/export change is needed. Separate `position:` keys in the same local
draft store retain clean, text-matched bookmarks after Done. An unchanged note
closed normally retains its location. Discarded text does not replace the applied
note's bookmark. An outer creation/edit Done transfers the matching position to
the saved habit, including a new habit's actual ID, then removes unfinished text.
That read/bookmark/discard sequence occupies one serialized operation so reopening
and writing a fresh draft cannot interleave with its cleanup.
Old clean buffers with a different saved-description base are ignored rather
than offered as unsaved recovery. Real unfinished/conflicting drafts keep the
existing recovery choice. Position-only changes do not enter History or backups.

Selection/scroll reporting waits for a 250 ms pause within the DOM component.
Unchanged documents send position only; pending edits report text and position
together. Editing stays immediate locally. Text reporting now waits for a 200 ms
quiet period with a one-second deadline during continuous typing; native draft
writes still debounce for 350 ms. Done/Close cancel queued copies and request an
exact text-and-position snapshot. DOM visibility/page-hide and native background
snapshot requests flush current text rather than relying on quiet-period timers. A sudden
kill before these debounce windows can lose the last location/keystrokes. Sample
positions use only the isolated in-memory adapter. Keyboard, orientation and
large-text restoration still need physical-iPhone acceptance.

## Requested placeholder notes

Each preset has a short fictional Markdown note and a clearly illustrative
`example.com` link. Fresh real-store initialization includes them once, as
each preset's Info note (in the v23 first event). The development statistics
sample keeps them as v7 descriptions, read as Info, and adds a few fictional
v23 notes (Why and Rules on Go for a walk, Links on Read, How on Meditate;
`dev/sampleNotes.ts`). The marketing presets turn each habit's text into its
Info note and can list further notes.

For a pre-description store, `storage/presetDescriptions.ts` adds placeholders
through normal undoable changes to existing habits, including custom and
archived habits; from v23 each is an Info note. Custom habits receive a generic
note rather than an invented motivation. Existing notes or descriptions and any
past assignment/removal/Undo are preserved. Raw history prevents repeating the
update after Undo or reload. New custom habits start with no notes and receive
no automatic placeholder. No store is reset or reseeded. Older backups may
receive the one-time update on next opening; a restore itself still reproduces
the validated archive exactly.

## Change navigation and editing icons

Before/After includes Next change beside the Changes switch. It moves to the next
changed passage after the viewed position, cycles through targets and wraps to
the first; it enables highlighting if necessary. With no changes it is disabled.
Each version has its own scroll list. Long, variable-height notes can require
measurement: an estimated offset brings the region into view, followed by a
bounded exact-position retry. Manual scrolling, a newer request or closing cancels
old retries. Reduce Motion disables animated navigation. Pure navigation tests
cover cycling, cancellation and unmeasured targets; native feel needs phone QA.

The editing toolbar and text/list menu use consistent Tabler outline SVGs from
the existing installed catalogue, preserving accessible labels, active states and
the highlight-colour indicator. A generated fourteen-icon subset avoids importing
the complete catalogue into the DOM editor. Regenerate it with
`node scripts/generate-editor-icons.mjs`; the existing Tabler MIT notice applies.

Descriptions and all editor controls follow Settings → Text size multiplied by
the system text size. There is no separate description-size preference. The
keyboard toolbar and menus wrap or scroll while keeping minimum touch targets.

## Large-note performance experiment

The founder requested progressively longer descriptions to test opening statistics
and editing. Isolated Sample data now assigns Go for a walk 1,874 characters,
Read 7,723 and Meditate 17,657. Each is fictional Markdown with ordinary paragraphs,
headings, lists, links, quotes and highlights. Other sample notes and every real
preset description remain unchanged. Full reload or Reset sample data installs
them only in the in-memory sample store; they never migrate into the real store.

`RichDescription` memoizes parsed initial content and disables transaction-driven
whole-component rerenders; toolbar state still updates through useEditorState.
The initial parsed document primes byte-preserving snapshots, avoiding a second
Markdown parse on first typing. Validation, draft reporting and Done share exact
serialization through per-editor weak caches keyed by immutable ProseMirror
nodes. Every changed document still receives full formatting-aware length
validation before acceptance. Unchanged snapshots preserve original Markdown
bytes, including after local Undo. No incremental serialization shortcuts or
new storage format are introduced.

`descriptionUpdateQueue.ts` batches bridge reporting, not keystrokes, formatting
or Undo. Its independent maximum deadline prevents continuous typing from
postponing every draft update. Position-only callbacks avoid retransmitting a
long unchanged note. Native recovery and history semantics remain unchanged;
a sudden kill before reporting/draft writes can still lose recent input.
Creation/edit previews and version-list excerpts are also bounded, with the edit
form memoizing its summary.

Local Node/jsdom diagnostics on all three sizes counted 75 serializations for
25 edits plus 25 repeated snapshots before the change, and 25 after caching.
This verifies duplicate-work removal, not iPhone frame rates or opening latency.
Automated tests cover exact snapshot parity, original-byte Undo, strict atomic
length rejection, quiet/deadline/flush/cancel behaviour, reader text/numbering,
cache eviction and sample isolation. Physical-iPhone opening, typing, scrolling,
keyboard, background recovery and the experimental layout remain acceptance tests.

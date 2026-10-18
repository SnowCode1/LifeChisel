import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MAX_DESCRIPTION_LENGTH } from '@onpurpose/core/description';
import type { Theme } from '@onpurpose/core/theme';
import { highlightPalette } from '@onpurpose/core/richText/highlights';
import { Markdown } from '../panel/Markdown.tsx';

type Edit = { text: string; start: number; end: number };

// Wrap the selection in Markdown marks, or insert a placeholder to type over.
function wrap(
  edit: Edit,
  before: string,
  after: string,
  placeholder: string,
): Edit {
  const selected = edit.text.slice(edit.start, edit.end) || placeholder;
  const text =
    edit.text.slice(0, edit.start) +
    before +
    selected +
    after +
    edit.text.slice(edit.end);
  const start = edit.start + before.length;
  return { text, start, end: start + selected.length };
}
// Prefix every selected line (lists and quotes).
function prefixLines(edit: Edit, prefix: (index: number) => string): Edit {
  const lineStart = edit.text.lastIndexOf('\n', edit.start - 1) + 1;
  const lineEnd = edit.text.indexOf('\n', edit.end);
  const end = lineEnd < 0 ? edit.text.length : lineEnd;
  const lines = edit.text.slice(lineStart, end).split('\n');
  const changed = lines.map((line, index) => prefix(index) + line).join('\n');
  const text = edit.text.slice(0, lineStart) + changed + edit.text.slice(end);
  return { text, start: lineStart, end: lineStart + changed.length };
}

/**
 * Writes one note as Markdown, the format the phone stores: a formatting
 * toolbar (Ctrl+B, Ctrl+I, Ctrl+K), the text, and a live preview beside it
 * (Write/Preview tabs when narrow). Ctrl+Enter saves and Esc cancels; Esc
 * never reaches the dialog around it.
 */
export function NoteComposer({
  text,
  onText,
  label,
  placeholder,
  theme,
  editable,
  onSave,
  onCancel,
}: {
  text: string;
  onText: (text: string) => void;
  /** Names the text area for screen readers. */
  label: string;
  placeholder: string;
  theme: Theme;
  editable: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const area = useRef<HTMLTextAreaElement>(null);
  const tooLong = text.length > MAX_DESCRIPTION_LENGTH;
  const apply = (change: (edit: Edit) => Edit) => {
    const element = area.current;
    if (!element) return;
    const next = change({
      text,
      start: element.selectionStart,
      end: element.selectionEnd,
    });
    onText(next.text);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.start, next.end);
    });
  };
  const actions = {
    bold: () => apply((edit) => wrap(edit, '**', '**', 'bold text')),
    italic: () => apply((edit) => wrap(edit, '*', '*', 'italic text')),
    highlight: () =>
      apply((edit) => wrap(edit, '==', '==', 'highlighted text')),
    bullets: () => apply((edit) => prefixLines(edit, () => '- ')),
    numbers: () =>
      apply((edit) => prefixLines(edit, (index) => `${index + 1}. `)),
    quote: () => apply((edit) => prefixLines(edit, () => '> ')),
    link: () => {
      const url = window.prompt('Link address (https://…)');
      if (url)
        apply((edit) => wrap(edit, '[', `](${url.trim()})`, 'link text'));
    },
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      // Cancel the edit, not the dialog around it.
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') actions.bold();
    else if (key === 'i') actions.italic();
    else if (key === 'k') actions.link();
    else if (key === 'enter') onSave();
    else return;
    event.preventDefault();
  };
  return (
    <div className="note-composer">
      <div className="notes-toolbar" role="toolbar" aria-label="Formatting">
        <Tool label="Bold (Ctrl+B)" onAction={() => actions.bold()}>
          <strong>B</strong>
        </Tool>
        <Tool label="Italic (Ctrl+I)" onAction={() => actions.italic()}>
          <em>I</em>
        </Tool>
        <Tool label="Highlight" onAction={() => actions.highlight()}>
          <mark
            style={{
              backgroundColor: highlightPalette(theme.scheme).yellow.background,
              color: highlightPalette(theme.scheme).yellow.text,
            }}
          >
            H
          </mark>
        </Tool>
        <Tool label="Bulleted list" onAction={() => actions.bullets()}>
          • List
        </Tool>
        <Tool label="Numbered list" onAction={() => actions.numbers()}>
          1. List
        </Tool>
        <Tool label="Quote" onAction={() => actions.quote()}>
          ❝
        </Tool>
        <Tool label="Link (Ctrl+K)" onAction={() => actions.link()}>
          Link
        </Tool>
        <span className="spacer" />
        <div className="segmented notes-tabs" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'write'}
            onClick={() => setTab('write')}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      <div className={`notes-panes show-${tab}`}>
        <textarea
          ref={area}
          autoFocus
          aria-label={label}
          className="notes-text"
          placeholder={placeholder}
          value={text}
          disabled={!editable}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck
        />
        <article className="note notes-preview" aria-label="Preview">
          {text.trim() ? (
            <Markdown text={text} scheme={theme.scheme} colour={theme.link} />
          ) : (
            <p className="muted">The preview appears here.</p>
          )}
        </article>
      </div>
      <p className={tooLong ? 'hint error' : 'hint'}>
        {text.length.toLocaleString()} /{' '}
        {MAX_DESCRIPTION_LENGTH.toLocaleString()} characters · Markdown:
        **bold**, *italic*, ==highlight==, - lists, [links](https://…) ·
        Ctrl+Enter saves · Esc cancels
      </p>
    </div>
  );
}

function Tool({
  label,
  onAction,
  children,
}: {
  label: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onAction}>
      {children}
    </button>
  );
}

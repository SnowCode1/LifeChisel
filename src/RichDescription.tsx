'use dom';

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Ref,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  useDOMImperativeHandle,
  type DOMImperativeFactory,
  type DOMProps,
} from 'expo/dom';
import { EditorIcon } from './richText/EditorIcon';
import type { EditorIconName } from './editorIconPaths';
import { TextSelection } from '@tiptap/pm/state';
import { selectedHighlight, selectedLink } from './richText/selection';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  descriptionExtensions,
  formatDescription,
  descriptionSnapshot,
  prepareDescriptionSnapshot,
} from './richText/extensions';
import { clearDescriptionFormatting } from './richText/clearFormatting';
import { markdownDocument } from './richText/markdownDocument';
import {
  highlightColours,
  highlightVariable,
  type HighlightColour,
} from '@onpurpose/core/richText/highlights';
import { descriptionLink } from '@onpurpose/core/description';
import {
  editorPosition,
  useEditorPosition,
} from './richText/useEditorPosition';
import type { DescriptionPosition } from '@onpurpose/core/descriptionPosition';
import { useEditorReady } from './richText/useEditorReady';
import { useFloatingMenuSpace } from './richText/useFloatingMenuSpace';
import { descriptionUpdateQueue } from './richText/descriptionUpdateQueue';
import './richText/editor.css';

export interface RichDescriptionRef extends DOMImperativeFactory {
  requestSnapshot: (action: unknown) => void;
}
export default function RichDescription({
  ref,
  initialValue,
  initialPosition,
  colour,
  palette,
  fontScale,
  editable,
  onChange,
  onPosition,
  onSnapshot,
  onReady,
  onLimit,
  onOpenLink,
  placeholder,
}: {
  ref: Ref<RichDescriptionRef>;
  initialValue: string;
  initialPosition?: DescriptionPosition;
  /** The habit colour already made readable on the current background. */
  colour: string;
  /** Theme CSS variables from editorPalette; see richText/editorTheme.ts. */
  palette: Record<string, string>;
  fontScale: number;
  editable: boolean;
  onChange: (markdown: string, position: DescriptionPosition) => Promise<void>;
  onPosition: (position: DescriptionPosition) => Promise<void>;
  onSnapshot: (
    action: string,
    markdown: string,
    position: DescriptionPosition,
  ) => Promise<void>;
  onReady: () => Promise<void>;
  onLimit: () => Promise<void>;
  onOpenLink: (url: string) => Promise<void>;
  /** The empty note's prompt (the preset hint for its title). */
  placeholder?: string;
  dom?: DOMProps;
}) {
  const [menu, setMenu] = useState<'text' | 'colour' | 'link' | null>(null);
  // The page background and body text live outside the editor container.
  useEffect(() => {
    const root = document.documentElement.style;
    for (const [name, value] of Object.entries(palette))
      root.setProperty(name, value);
  }, [palette]);
  const writing = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null),
    controls = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState({
    from: 1,
    to: 1,
    href: '',
    label: '',
    existing: false,
  });
  const [linkError, setLinkError] = useState('');
  const [dismissedLink, setDismissedLink] = useState<string | null>(null);
  const initialDocument = useMemo(
    () => markdownDocument(initialValue),
    [initialValue],
  );
  const extensions = useMemo(
    () =>
      descriptionExtensions(() => {
        void onLimit();
      }, placeholder),
    [onLimit, placeholder],
  );
  const updates = useRef<ReturnType<typeof descriptionUpdateQueue> | null>(
    null,
  );
  const reportChange = useEffectEvent(
    (editor: NonNullable<ReturnType<typeof useEditor>>) => {
      void onChange(
        descriptionSnapshot(editor, initialValue),
        editorPosition(editor, writing.current),
      );
    },
  );
  const editor = useEditor({
    extensions,
    content: initialDocument,
    shouldRerenderOnTransaction: false,
    editable,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Habit description',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
      handleClick: (view, position, event) => {
        if ((event.target as Element).closest('a')) {
          event.preventDefault();
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, position),
            ),
          );
          return true;
        }
        return false;
      },
    },
    onUpdate: () => updates.current?.queue(),
  });
  useEffect(() => {
    if (!editor) return;
    const queue = descriptionUpdateQueue(() => reportChange(editor));
    updates.current = queue;
    const background = () => {
      if (document.visibilityState !== 'visible') queue.flush();
    };
    const leave = () => queue.flush();
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', leave);
    return () => {
      queue.dispose();
      updates.current = null;
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('pagehide', leave);
    };
  }, [editor]);
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            heading: editor.getAttributes('heading').level as
              number | undefined,
            bullet: editor.isActive('bulletList'),
            ordered: editor.isActive('orderedList'),
            quote: editor.isActive('blockquote'),
            strike: editor.isActive('strike'),
            code: editor.isActive('code'),
            link: editor.isActive('link'),
            highlight: selectedHighlight(editor),
            inspectedLink: selectedLink(editor),
            undo: editor.can().undo(),
            redo: editor.can().redo(),
          }
        : null,
  });
  useDOMImperativeHandle(
    ref,
    () => ({
      requestSnapshot: (action: unknown) => {
        if (editor && typeof action === 'string') {
          updates.current?.cancel();
          void onSnapshot(
            action,
            descriptionSnapshot(editor, initialValue),
            editorPosition(editor, writing.current),
          );
        }
      },
    }),
    [editor, initialValue, onSnapshot],
  );
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  const initialize = useEditorPosition(
    editor,
    writing,
    initialPosition,
    (position) => {
      // A pending edit reports its text and position together. An unchanged
      // document sends only three numbers when scrolling/selecting settles.
      if (!updates.current?.flush()) void onPosition(position);
    },
  );
  useEditorReady(editor, onReady, (readyEditor) => {
    prepareDescriptionSnapshot(readyEditor, initialValue, initialDocument);
    initialize(readyEditor);
  });
  useFloatingMenuSpace(container, controls, !!editor);
  const inspectedLink = state?.inspectedLink;
  const linkKey = inspectedLink
    ? `${inspectedLink.from}:${inspectedLink.href}`
    : null;
  useEffect(() => {
    if (!editor) return;
    const selectionChanged = () => {
      const link = selectedLink(editor);
      const key = link ? `${link.from}:${link.href}` : null;
      setDismissedLink((dismissed) =>
        dismissed && dismissed !== key ? null : dismissed,
      );
    };
    editor.on('selectionUpdate', selectionChanged);
    editor.on('update', selectionChanged);
    return () => {
      editor.off('selectionUpdate', selectionChanged);
      editor.off('update', selectionChanged);
    };
  }, [editor]);
  if (!editor) return null;
  const highlight = state?.highlight;
  const highlightLabel = highlight?.mixed
    ? 'Mixed selection'
    : highlight?.colour
      ? `${highlightColours[highlight.colour].label} applied`
      : 'None applied';
  function tool(
    label: string,
    symbol: ReactNode,
    action: () => void,
    active = false,
    disabled = false,
    popup?: { id: string; open: boolean },
  ) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        aria-controls={popup?.id}
        aria-expanded={popup?.open}
        disabled={!editable || disabled}
        className="tool"
        onPointerDown={(event) => event.preventDefault()}
        onClick={action}
      >
        {symbol}
      </button>
    );
  }
  function textAction(action: () => void) {
    if (editor) formatDescription(editor, action);
    setMenu(null);
  }
  function openLink() {
    if (!editor) return;
    if (editor.isActive('link')) editor.commands.extendMarkRange('link');
    const { from, to } = editor.state.selection;
    setLink({
      from,
      to,
      href: editor.getAttributes('link').href ?? '',
      label: editor.state.doc.textBetween(from, to, ' '),
      existing: editor.isActive('link'),
    });
    setLinkError('');
    setMenu(menu === 'link' ? null : 'link');
  }
  function cancelLink() {
    setMenu(null);
    editor
      ?.chain()
      .setTextSelection({ from: link.from, to: link.to })
      .focus(null, { scrollIntoView: false })
      .run();
  }
  function saveLink() {
    if (!editor) return;
    const href = descriptionLink(link.href);
    if (!href) {
      setLinkError('Enter a full web or app link, such as https://…');
      return;
    }
    formatDescription(editor, () => {
      if (link.from === link.to) {
        const label = link.label.trim() || href;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: link.from, to: link.to })
          .insertContent({
            type: 'text',
            text: label,
            marks: [{ type: 'link', attrs: { href } }],
          })
          .setTextSelection({ from: link.from, to: link.from + label.length })
          .run();
      } else
        editor
          .chain()
          .focus()
          .setTextSelection({ from: link.from, to: link.to })
          .setLink({ href })
          .run();
    });
    setMenu(null);
  }
  return (
    <div
      ref={container}
      className="description-editor"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && (menu === 'text' || menu === 'colour')) {
          event.preventDefault();
          setMenu(null);
          editor.commands.focus(null, { scrollIntoView: false });
        } else if (event.key === 'Escape' && !menu && inspectedLink) {
          event.preventDefault();
          setDismissedLink(linkKey);
        }
      }}
      style={
        {
          '--note-size': `${17 * fontScale}px`,
          '--note-colour': colour,
          '--note-link': colour,
          ...palette,
        } as CSSProperties
      }
    >
      <div
        ref={writing}
        className="writing-area"
        inert={menu === 'link'}
        onClick={() => {
          if (menu !== 'link') setMenu(null);
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <div className="editor-controls" ref={controls} inert={menu === 'link'}>
        <div
          className="toolbar"
          role="toolbar"
          aria-label="Description formatting"
        >
          {tool(
            'Undo description edit',
            <EditorIcon name="undo" />,
            () => {
              setMenu(null);
              editor.chain().focus().undo().run();
            },
            false,
            !state?.undo,
          )}
          {tool(
            'Redo description edit',
            <EditorIcon name="redo" />,
            () => {
              setMenu(null);
              editor.chain().focus().redo().run();
            },
            false,
            !state?.redo,
          )}
          <span className="separator" />
          {tool(
            'Bold',
            <EditorIcon name="bold" />,
            () =>
              formatDescription(editor, () => {
                editor.chain().focus().toggleBold().run();
              }),
            state?.bold,
          )}
          {tool(
            'Italic',
            <EditorIcon name="italic" />,
            () =>
              formatDescription(editor, () => {
                editor.chain().focus().toggleItalic().run();
              }),
            state?.italic,
          )}
          {tool(
            'Text and list options',
            <EditorIcon name="text" />,
            () => setMenu(menu === 'text' ? null : 'text'),
            menu === 'text',
            false,
            { id: 'text-options', open: menu === 'text' },
          )}
          {tool(
            'Add or edit link',
            <EditorIcon name="link" />,
            openLink,
            state?.link || menu === 'link',
          )}
          {tool(
            `Highlight colours, ${highlightLabel}`,
            <span className="highlight-symbol" aria-hidden="true">
              <EditorIcon name="highlight" />
              <span
                className={`highlight-indicator${highlight?.mixed ? ' mixed' : ''}`}
                style={{
                  backgroundColor: highlight?.colour
                    ? highlightVariable(highlight.colour, 'text')
                    : undefined,
                }}
              />
            </span>,
            () => setMenu(menu === 'colour' ? null : 'colour'),
            !!highlight?.colour || !!highlight?.mixed || menu === 'colour',
            false,
            { id: 'highlight-options', open: menu === 'colour' },
          )}
        </div>
        {!menu && inspectedLink && dismissedLink !== linkKey && (
          <div
            className="popover link-inspector"
            role="group"
            aria-label="Selected link"
          >
            <div className="link-destination" title={inspectedLink.href}>
              {inspectedLink.href}
            </div>
            <div className="link-inspector-actions">
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void onOpenLink(inspectedLink.href)}
              >
                Open
              </button>
              <button
                type="button"
                disabled={!editable}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  editor.commands.setTextSelection({
                    from: inspectedLink.from,
                    to: inspectedLink.to,
                  });
                  openLink();
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={!editable}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  formatDescription(editor, () =>
                    editor
                      .chain()
                      .setTextSelection({
                        from: inspectedLink.from,
                        to: inspectedLink.to,
                      })
                      .focus(null, { scrollIntoView: false })
                      .unsetLink()
                      .run(),
                  );
                }}
              >
                Remove
              </button>
              <button
                type="button"
                aria-label="Close link inspector"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => setDismissedLink(linkKey)}
              >
                Close
              </button>
            </div>
          </div>
        )}
        {menu === 'text' && (
          <div
            id="text-options"
            className="popover choices"
            role="group"
            aria-label="Text styles"
          >
            {[
              [
                'Text',
                () => editor.chain().focus().setParagraph().run(),
                !state?.heading,
              ],
              [
                'Heading',
                () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
                state?.heading === 2,
              ],
              [
                'Bullets',
                () => editor.chain().focus().toggleBulletList().run(),
                state?.bullet,
              ],
              [
                'Numbered list',
                () => editor.chain().focus().toggleOrderedList().run(),
                state?.ordered,
              ],
              [
                'Quote',
                () => editor.chain().focus().toggleBlockquote().run(),
                state?.quote,
              ],
              [
                'Strikethrough',
                () => editor.chain().focus().toggleStrike().run(),
                state?.strike,
              ],
              [
                'Code',
                () => editor.chain().focus().toggleCode().run(),
                state?.code,
              ],
              [
                'Clear formatting',
                () => clearDescriptionFormatting(editor),
                false,
              ],
            ].map(([label, action, active]) => (
              <button
                type="button"
                key={String(label)}
                aria-pressed={!!active}
                disabled={!editable}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => textAction(action as () => void)}
              >
                <EditorIcon
                  name={
                    (
                      {
                        Text: 'text',
                        Heading: 'heading',
                        Bullets: 'bullets',
                        'Numbered list': 'numbered',
                        Quote: 'quote',
                        Strikethrough: 'strike',
                        Code: 'code',
                        'Clear formatting': 'clear',
                      } as Record<string, EditorIconName>
                    )[String(label)]
                  }
                />
                {String(label)}
              </button>
            ))}
          </div>
        )}
        {menu === 'colour' && (
          <div
            id="highlight-options"
            className="popover colours"
            role="group"
            aria-label="Highlight colour"
          >
            <button
              type="button"
              disabled={!editable}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() =>
                textAction(() => editor.chain().focus().unsetHighlight().run())
              }
            >
              None
            </button>
            {(Object.keys(highlightColours) as HighlightColour[]).map((id) => (
              <button
                type="button"
                key={id}
                aria-label={`${highlightColours[id].label} highlight`}
                aria-pressed={highlight?.colour === id && !highlight.mixed}
                disabled={!editable}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() =>
                  textAction(() => {
                    if (editor.isActive('highlight', { color: id }))
                      editor.chain().focus().unsetHighlight().run();
                    else
                      editor.chain().focus().setHighlight({ color: id }).run();
                  })
                }
              >
                <span
                  className="swatch"
                  style={{
                    background: highlightVariable(id, 'bg'),
                    color: highlightVariable(id, 'text'),
                  }}
                >
                  A
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {menu === 'link' && (
        <div className="link-overlay">
          <button
            type="button"
            className="link-backdrop"
            aria-label="Cancel link editing"
            onClick={cancelLink}
          />
          <form
            className="link-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-title"
            onSubmit={(event) => {
              event.preventDefault();
              if (editable) saveLink();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelLink();
              }
            }}
          >
            <div className="link-fields">
              <h2 id="link-title">
                {link.existing ? 'Edit link' : 'Add link'}
              </h2>
              {link.from === link.to && (
                <input
                  aria-label="Link title"
                  placeholder="Link title · optional"
                  disabled={!editable}
                  value={link.label}
                  onChange={(event) =>
                    setLink({ ...link, label: event.target.value })
                  }
                />
              )}
              <input
                aria-label="Link address"
                placeholder="https://… or an app link"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                disabled={!editable}
                value={link.href}
                onChange={(event) =>
                  setLink({ ...link, href: event.target.value })
                }
              />
              {linkError && (
                <p className="link-error" role="alert">
                  {linkError}
                </p>
              )}
            </div>
            <div className="link-actions">
              <button type="button" onClick={cancelLink}>
                Cancel
              </button>
              {link.existing && (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() =>
                    textAction(() =>
                      editor
                        .chain()
                        .focus()
                        .setTextSelection({ from: link.from, to: link.to })
                        .unsetLink()
                        .run(),
                    )
                  }
                >
                  Remove link
                </button>
              )}
              <button type="submit" className="link-apply" disabled={!editable}>
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

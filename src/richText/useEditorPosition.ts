import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { DescriptionPosition } from '@onpurpose/core/descriptionPosition';

export function editorPosition(
  editor: Editor,
  writing: HTMLElement | null,
): DescriptionPosition {
  return {
    anchor: editor.state.selection.anchor,
    head: editor.state.selection.head,
    scrollTop: Math.max(0, writing?.scrollTop ?? 0),
  };
}

export function restoreEditorSelection(
  editor: Editor,
  position?: DescriptionPosition,
) {
  if (!position) return;
  const max = editor.state.doc.content.size;
  const clamp = (offset: number) => Math.max(0, Math.min(max, offset));
  const selection = TextSelection.between(
    editor.state.doc.resolve(clamp(position.anchor)),
    editor.state.doc.resolve(clamp(position.head)),
  );
  editor.view.dispatch(
    editor.state.tr.setSelection(selection).setMeta('addToHistory', false),
  );
}

export function useEditorPosition(
  editor: Editor | null,
  writing: RefObject<HTMLDivElement | null>,
  initial: DescriptionPosition | undefined,
  onPosition: (position: DescriptionPosition) => void,
) {
  const target = useRef<number | null>(initial?.scrollTop ?? 0);
  const notify = useEffectEvent(onPosition);
  useEffect(() => {
    const element = writing.current;
    if (!editor || !element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queue = () => {
      if (timer) clearTimeout(timer);
      // Keep selection/scroll traffic off the native bridge until a short pause.
      timer = setTimeout(() => notify(editorPosition(editor, element)), 250);
    };
    const interact = () => {
      target.current = null;
    };
    const resize = () => {
      if (target.current !== null) element.scrollTop = target.current;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    observer.observe(editor.view.dom);
    editor.on('selectionUpdate', queue);
    element.addEventListener('scroll', queue, { passive: true });
    element.addEventListener('pointerdown', interact);
    element.addEventListener('keydown', interact);
    element.addEventListener('beforeinput', interact);
    element.addEventListener('wheel', interact, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      editor.off('selectionUpdate', queue);
      element.removeEventListener('scroll', queue);
      element.removeEventListener('pointerdown', interact);
      element.removeEventListener('keydown', interact);
      element.removeEventListener('beforeinput', interact);
      element.removeEventListener('wheel', interact);
    };
  }, [editor, writing]);
  return (readyEditor: Editor) => {
    // First opens show the beginning, with the caret in the same place. An end
    // caret in a top-scrolled long note makes keyboard focus pull WebKit away
    // from the visible content. Matching saved positions still resume normally.
    restoreEditorSelection(
      readyEditor,
      initial ?? { anchor: 1, head: 1, scrollTop: 0 },
    );
    if (readyEditor.isEditable)
      readyEditor.commands.focus(null, {
        scrollIntoView: false,
      });
    const element = writing.current;
    if (element)
      element.scrollTo({ top: initial?.scrollTop ?? 0, behavior: 'auto' });
  };
}

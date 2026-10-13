import type { Editor } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { descriptionLink } from '@onpurpose/core/description';

export function selectionLinkPaste(editor: Editor) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain').trim();
        if (!text || !editor.isEditable) return false;
        // Explicit web/app URLs only. A colon in ordinary prose ("Note: ...")
        // or a bare domain should not unexpectedly replace the paste with a link.
        const href = descriptionLink(text);
        if (!href || !/^[a-z][a-z0-9+.-]*:\/\/|^(mailto|tel|sms):/i.test(href))
          return false;
        const { state } = view;
        const { selection } = state;
        if (
          !(selection instanceof TextSelection) ||
          selection.empty ||
          !selection.$from.sameParent(selection.$to) ||
          selection.$from.parent.type.spec.code ||
          (state.schema.marks.code &&
            state.doc.rangeHasMark(
              selection.from,
              selection.to,
              state.schema.marks.code,
            ))
        )
          return false;
        // Close typing groups on both sides, keeping this paste one independent
        // Undo step. The normal description limit can reject the mark atomically.
        view.dispatch(closeHistory(state.tr));
        editor.commands.setLink({ href });
        view.dispatch(closeHistory(view.state.tr));
        return true;
      },
    },
  });
}

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A small modal popover beside the element that opened it (a bottom sheet at
 * phone width). The native <dialog> traps focus and closes on Esc; a click on
 * the backdrop closes it too, and focus returns to the opener afterwards.
 * It eases in from its anchor (a plain fade with Reduce motion).
 */
export function AnchoredDialog({
  anchor,
  labelledBy,
  className = '',
  placement = 'side',
  onClose,
  children,
}: {
  anchor: HTMLElement;
  labelledBy: string;
  className?: string;
  /** Beside the opener (cells), or below it (top-bar buttons). */
  placement?: 'side' | 'below';
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [place, setPlace] = useState<{
    top: number;
    left: number;
    origin: string;
  } | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    const opener = anchor.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const gap = 8,
      margin = 12;
    // Prefer the left of the cell: Today sits at the grid's right edge.
    let left =
      placement === 'below' ? opener.left : opener.left - gap - box.width;
    if (left < margin && placement === 'side') left = opener.right + gap;
    left = Math.max(margin, Math.min(left, innerWidth - margin - box.width));
    const top = Math.max(
      margin,
      Math.min(
        placement === 'below' ? opener.bottom + 4 : opener.top - 12,
        innerHeight - margin - box.height,
      ),
    );
    // It grows from the cell that opened it.
    const origin = `${opener.left + opener.width / 2 - left}px ${opener.top + opener.height / 2 - top}px`;
    setPlace({ top, left, origin });
    // React's autoFocus fires before the dialog opens, so focus here: the
    // marked field, else the first field, else the first button.
    (
      element.querySelector<HTMLElement>('[data-autofocus]') ??
      element.querySelector<HTMLElement>('input, textarea, select') ??
      element.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      element.close();
      anchor.focus({ preventScroll: true });
    };
  }, [anchor, placement]);
  return (
    <dialog
      ref={dialog}
      className={`popover ${className}`}
      aria-labelledby={labelledBy}
      style={
        place
          ? {
              top: place.top,
              left: place.left,
              transformOrigin: place.origin,
            }
          : { opacity: 0 }
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="popover-body">{children}</div>
    </dialog>
  );
}

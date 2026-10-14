import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * A centred modal dialog (full screen at phone width) with a fixed header:
 * a leading action, a title, and an optional trailing action. The native
 * <dialog> traps focus and closes on Esc; focus returns to the opener.
 */
export function Modal({
  title,
  titleId,
  leading,
  trailing,
  className = '',
  onClose,
  children,
}: {
  title: ReactNode;
  titleId: string;
  leading: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement as HTMLElement | null;
    element.showModal();
    (
      element.querySelector<HTMLElement>('[data-autofocus]') ??
      element.querySelector<HTMLElement>(
        '.modal-body input, .modal-body textarea',
      )
    )?.focus();
    return () => {
      element.close();
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal-header">
        <div className="modal-leading">{leading}</div>
        <h2 id={titleId}>{title}</h2>
        <div className="modal-trailing">{trailing}</div>
      </header>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

import { useEffect, useMemo } from 'react';
import type { ChangeStore } from '@onpurpose/core/storage/store';
import { createQuickUndo } from '@onpurpose/core/quickUndo';
export function useQuickUndo(store: ChangeStore) {
  const controller = useMemo(() => createQuickUndo(store), [store]);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}

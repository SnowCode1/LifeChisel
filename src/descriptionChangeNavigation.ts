import type { DescriptionPassage } from '@onpurpose/core/descriptionDiff';

export type DescriptionScrollPort = {
  scrollToIndex(options: {
    index: number;
    animated: boolean;
    viewPosition: number;
  }): void;
  scrollToOffset(options: { offset: number; animated: boolean }): void;
};
export function nextChangedPassage(
  passages: readonly DescriptionPassage[],
  current: number,
) {
  const next = passages.findIndex(
    (passage, index) => passage.changed && index > current,
  );
  return next >= 0 ? next : passages.findIndex((passage) => passage.changed);
}
export function descriptionChangeNavigator(
  passages: readonly DescriptionPassage[],
  reducedMotion: boolean,
) {
  let visible = -1,
    lastTarget: number | null = null,
    retries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const scroll = (index: number, port: DescriptionScrollPort) =>
    port.scrollToIndex({ index, animated: !reducedMotion, viewPosition: 0.08 });
  return {
    visible(index: number) {
      visible = index;
    },
    manual() {
      stop();
      lastTarget = null;
      retries = 0;
    },
    activate() {
      disposed = false;
    },
    next(port: DescriptionScrollPort) {
      if (disposed) return -1;
      stop();
      retries = 0;
      const index = nextChangedPassage(passages, lastTarget ?? visible);
      if (index < 0) return -1;
      lastTarget = index;
      scroll(index, port);
      return index;
    },
    failed(
      {
        index,
        averageItemLength,
      }: {
        index: number;
        averageItemLength: number;
      },
      port: DescriptionScrollPort,
    ) {
      if (disposed || index !== lastTarget || retries++ >= 8) return;
      stop();
      // Variable-height passages may not have been measured yet. Bring their
      // estimated region into the render window, then retry the exact position.
      port.scrollToOffset({
        offset: Math.max(0, averageItemLength * index),
        animated: false,
      });
      timer = setTimeout(() => {
        if (!disposed && lastTarget === index) scroll(index, port);
      }, 100);
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}

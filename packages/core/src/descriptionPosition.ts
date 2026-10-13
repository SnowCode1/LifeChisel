export type DescriptionPosition = {
  anchor: number;
  head: number;
  scrollTop: number;
};

export function validDescriptionPosition(
  value: unknown,
): value is DescriptionPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return (
    Object.keys(position).length === 3 &&
    ['anchor', 'head'].every(
      (key) =>
        Number.isSafeInteger(position[key]) &&
        (position[key] as number) >= 0 &&
        (position[key] as number) <= 100000,
    ) &&
    typeof position.scrollTop === 'number' &&
    Number.isFinite(position.scrollTop) &&
    position.scrollTop >= 0 &&
    position.scrollTop <= 10000000
  );
}

export const descriptionPositionKey = (key: string) => `position:${key}`;

// Comparison sessions run the ordinary saved list without profiling, motion
// capture or fictional data. Keep literal __DEV__ guards around native imports.
export const developmentToolsEnabled =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_DEV_COMPARISON !== 'true';

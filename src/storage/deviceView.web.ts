import {
  GRID_MODE_KEY,
  readGridMode,
  type GridMode,
} from '@onpurpose/core/gridModes';

// The Expo web preview (not developed) remembers its mode in this browser.
export function loadGridMode(): GridMode {
  try {
    return readGridMode(localStorage.getItem(GRID_MODE_KEY));
  } catch {
    return readGridMode(null);
  }
}

export function saveGridMode(mode: GridMode) {
  try {
    localStorage.setItem(GRID_MODE_KEY, mode);
  } catch {
    // Blocked storage only forgets the mode.
  }
}

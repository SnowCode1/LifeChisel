import { SQLiteStorage } from 'expo-sqlite/kv-store';
import {
  GRID_MODE_KEY,
  readGridMode,
  type GridMode,
} from '@onpurpose/core/gridModes';

// View state this phone remembers for itself, in its own small key-value
// database: never in the change log, History or backups.
let storage: SQLiteStorage | null = null;
function open() {
  storage ??= new SQLiteStorage('onpurpose-device.db');
  return storage;
}

export function loadGridMode(): GridMode {
  try {
    return readGridMode(open().getItemSync(GRID_MODE_KEY));
  } catch {
    return readGridMode(null);
  }
}

export function saveGridMode(mode: GridMode) {
  // A lost write only reopens the previous mode; it never touches habits.
  open()
    .setItemAsync(GRID_MODE_KEY, mode)
    .catch(() => undefined);
}

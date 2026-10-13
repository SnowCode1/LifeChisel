// Shared core code checks these phone development flags; browsers have neither.
declare const __DEV__: boolean | undefined;
declare const process: { env: Record<string, string | undefined> };

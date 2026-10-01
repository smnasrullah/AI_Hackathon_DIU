/** Every zustand store registers its reset here so logout can wipe all client state. */
const resets = new Set<() => void>();

export function registerStoreReset(reset: () => void): void {
  resets.add(reset);
}

export function resetAllStores(): void {
  resets.forEach((reset) => reset());
}

/** Prefix for every localStorage / sessionStorage key this app writes. */
export const STORAGE_PREFIX = "agentpulse";

export function clearAppStorage(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(storage)
        .filter((key) => key.startsWith(STORAGE_PREFIX))
        .forEach((key) => storage.removeItem(key));
    } catch {
      // Storage can be blocked (private mode); nothing to clear then.
    }
  }
}

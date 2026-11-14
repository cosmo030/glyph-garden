// Saves and loads Tweaks. Uses extension storage when running as an extension
// (Chrome and Firefox both support chrome.storage.local), and falls back to
// localStorage when the page runs as a normal website (the phone preview).

const KEY = 'glyph-garden:settings:v1';

type ExtStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

function extensionStorage(): ExtStorage | null {
  const g = globalThis as unknown as {
    browser?: { storage?: { local?: ExtStorage } };
    chrome?: { storage?: { local?: ExtStorage } };
  };
  return g.browser?.storage?.local ?? g.chrome?.storage?.local ?? null;
}

/** Reads saved settings, or null if there are none (or storage is unavailable). */
export async function loadSettings(): Promise<unknown> {
  try {
    const ext = extensionStorage();
    if (ext) return (await ext.get(KEY))[KEY] ?? null;
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves at most a few times per second while sliders are being dragged. */
export function saveSettingsSoon(values: unknown): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const snapshot = JSON.parse(JSON.stringify(values));
    try {
      const ext = extensionStorage();
      if (ext) void ext.set({ [KEY]: snapshot }).catch(() => {});
      else localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch {
      /* storage unavailable (private mode etc.): settings just won't persist */
    }
  }, 250);
}

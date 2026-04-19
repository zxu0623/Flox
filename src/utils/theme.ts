export const UI_THEME_STORAGE_KEY = "flox.uiTheme";

/** User accent hue (0–360), drives `--accent-h` in CSS (`oklch` tokens in `styles.css`). */
export const ACCENT_HUE_STORAGE_KEY = "flox.accentHue";

/** Same-origin session cache so popup/dashboard read theme synchronously before `storage.local` resolves. */
export const UI_THEME_SESSION_KEY = "flox.uiTheme.session";

export type UiTheme = "light" | "dark";

function writeThemeSessionCache(theme: UiTheme): void {
  try {
    sessionStorage.setItem(UI_THEME_SESSION_KEY, theme);
  } catch {
    // ignore (non-window contexts)
  }
}

export async function getStoredUiTheme(): Promise<UiTheme> {
  const result = await chrome.storage.local.get(UI_THEME_STORAGE_KEY);
  const raw = result[UI_THEME_STORAGE_KEY];
  const theme = raw === "light" ? "light" : "dark";
  writeThemeSessionCache(theme);
  return theme;
}

export async function setStoredUiTheme(theme: UiTheme): Promise<void> {
  await chrome.storage.local.set({ [UI_THEME_STORAGE_KEY]: theme });
  writeThemeSessionCache(theme);
}

export function applyUiThemeToDocument(theme: UiTheme): void {
  const root = document.documentElement;
  const body = document.body;
  if (theme === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    body?.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    body?.classList.remove("dark");
  }
}

const DEFAULT_ACCENT_HUE = 90;

export async function getStoredAccentHue(): Promise<number> {
  const result = await chrome.storage.local.get(ACCENT_HUE_STORAGE_KEY);
  const raw = result[ACCENT_HUE_STORAGE_KEY];
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n)) {
    const clamped = Math.min(360, Math.max(0, n));
    return clamped;
  }
  return DEFAULT_ACCENT_HUE;
}

/** Sets `--accent-h` on the document root (used by `--accent` / `--accent-soft` in CSS). */
export function applyAccentHueToDocument(hue: number): void {
  const h = Number.isFinite(hue) ? Math.min(360, Math.max(0, hue)) : DEFAULT_ACCENT_HUE;
  document.documentElement.style.setProperty("--accent-h", String(h));
}

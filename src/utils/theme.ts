export const UI_THEME_STORAGE_KEY = "flox.uiTheme";

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

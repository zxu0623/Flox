import { t } from "./i18n";
import { checkFeature, PLAN_LIMITS } from "./plan";

export interface Workspace {
  id: string;
  name: string;
  color: string;
  urlPatterns: string[];
  createdAt: number;
  order: number;
}

export interface TabRecord {
  tabId: number;
  windowId: number;
  workspaceId: string | null;
  url: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
  createdAt: number;
}

export interface SavedTab {
  url: string;
  title: string;
  favIconUrl: string;
}

const STORAGE_KEYS = {
  workspaces: "flox.workspaces",
  tabRecords: "flox.tabRecords",
  savedSessions: "flox.savedSessions"
} as const;

export interface SavedSession {
  savedAt: number;
  tabs: SavedTab[];
}

type SavedSessions = Record<string, SavedSession>;
const TAB_RECORD_DEBOUNCE_MS = 300;

let tabRecordsCache: TabRecord[] | null = null;
let tabRecordsWriteTimer: ReturnType<typeof setTimeout> | null = null;
let tabRecordsWriteResolvers: Array<() => void> = [];
let tabRecordsWriteRejectors: Array<(error: Error) => void> = [];

function storageGet<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((result[key] as T | undefined) ?? fallback);
    });
  });
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function generateWorkspaceOrder(workspaces: Workspace[]): number {
  if (workspaces.length === 0) {
    return 0;
  }
  return Math.max(...workspaces.map((item) => item.order)) + 1;
}

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return storageGet<Workspace[]>(STORAGE_KEYS.workspaces, []);
}

export async function addWorkspace(
  input: Omit<Workspace, "id" | "createdAt" | "order"> & { order?: number }
): Promise<Workspace> {
  const workspaces = await getWorkspaces();
  const unlimited = await checkFeature("unlimitedWorkspaces");
  if (!unlimited && workspaces.length >= PLAN_LIMITS.FREE.maxWorkspaces) {
    throw new Error(t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)]));
  }

  const now = Date.now();
  const workspace: Workspace = {
    id: createUuid(),
    name: input.name,
    color: input.color,
    urlPatterns: input.urlPatterns,
    createdAt: now,
    order: input.order ?? generateWorkspaceOrder(workspaces)
  };

  await storageSet({
    [STORAGE_KEYS.workspaces]: [...workspaces, workspace]
  });

  return workspace;
}

export async function updateWorkspace(
  workspaceId: string,
  updates: Partial<Omit<Workspace, "id" | "createdAt">>
): Promise<Workspace> {
  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex((workspace) => workspace.id === workspaceId);
  if (index < 0) {
    throw new Error(t("workspaceNotFound"));
  }

  const updated: Workspace = {
    ...workspaces[index],
    ...updates
  };
  workspaces[index] = updated;

  await storageSet({
    [STORAGE_KEYS.workspaces]: workspaces
  });

  return updated;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const workspaces = await getWorkspaces();
  const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== workspaceId);
  if (nextWorkspaces.length === workspaces.length) {
    throw new Error(t("workspaceNotFound"));
  }

  const tabRecords = await getTabRecords();
  const nextTabRecords = tabRecords.map((record) =>
    record.workspaceId === workspaceId ? { ...record, workspaceId: null } : record
  );

  const savedSessions = await storageGet<SavedSessions>(STORAGE_KEYS.savedSessions, {});
  if (savedSessions[workspaceId]) {
    delete savedSessions[workspaceId];
  }

  await storageSet({
    [STORAGE_KEYS.workspaces]: nextWorkspaces,
    [STORAGE_KEYS.savedSessions]: savedSessions
  });
  await setTabRecords(nextTabRecords);
}

export async function getTabRecords(): Promise<TabRecord[]> {
  if (tabRecordsCache === null) {
    tabRecordsCache = await storageGet<TabRecord[]>(STORAGE_KEYS.tabRecords, []);
  }
  return [...tabRecordsCache];
}

function scheduleTabRecordsWrite(): Promise<void> {
  return new Promise((resolve, reject) => {
    tabRecordsWriteResolvers.push(resolve);
    tabRecordsWriteRejectors.push(reject);

    if (tabRecordsWriteTimer !== null) {
      clearTimeout(tabRecordsWriteTimer);
    }

    tabRecordsWriteTimer = setTimeout(() => {
      const snapshot = tabRecordsCache ?? [];
      chrome.storage.local.set({ [STORAGE_KEYS.tabRecords]: snapshot }, () => {
        const resolvers = tabRecordsWriteResolvers;
        const rejectors = tabRecordsWriteRejectors;
        tabRecordsWriteResolvers = [];
        tabRecordsWriteRejectors = [];
        tabRecordsWriteTimer = null;

        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          rejectors.forEach((rejectFn) => rejectFn(error));
          return;
        }

        resolvers.forEach((resolveFn) => resolveFn());
      });
    }, TAB_RECORD_DEBOUNCE_MS);
  });
}

export async function setTabRecords(records: TabRecord[]): Promise<void> {
  tabRecordsCache = [...records];
  await scheduleTabRecordsWrite();
}

export async function updateTabRecord(record: TabRecord): Promise<TabRecord> {
  const records = await getTabRecords();
  const index = records.findIndex((item) => item.tabId === record.tabId);
  if (index >= 0) {
    records[index] = { ...records[index], ...record };
  } else {
    records.push(record);
  }

  tabRecordsCache = records;
  await scheduleTabRecordsWrite();
  return record;
}

export async function removeTabRecord(tabId: number): Promise<void> {
  const records = await getTabRecords();
  const nextRecords = records.filter((record) => record.tabId !== tabId);
  tabRecordsCache = nextRecords;
  await scheduleTabRecordsWrite();
}

export async function saveTabs(workspaceId: string): Promise<SavedTab[]> {
  const records = await getTabRecords();
  const workspaceRecords = records.filter((record) => record.workspaceId === workspaceId);
  const workspaceRecordByTabId = new Map(workspaceRecords.map((record) => [record.tabId, record]));
  const openTabs = await chrome.tabs.query({});

  const savedTabs: SavedTab[] = openTabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === "number")
    .filter((tab) => workspaceRecordByTabId.has(tab.id))
    .map((tab) => {
      const record = workspaceRecordByTabId.get(tab.id);
      return {
        url: tab.url ?? record?.url ?? "",
        title: tab.title ?? record?.title ?? "",
        favIconUrl: tab.favIconUrl ?? record?.favIconUrl ?? ""
      };
    });

  const savedSessions = await storageGet<SavedSessions>(STORAGE_KEYS.savedSessions, {});
  savedSessions[workspaceId] = {
    savedAt: Date.now(),
    tabs: savedTabs
  };

  await storageSet({ [STORAGE_KEYS.savedSessions]: savedSessions });
  return savedTabs;
}

export async function getSavedSessions(): Promise<SavedSessions> {
  return storageGet<SavedSessions>(STORAGE_KEYS.savedSessions, {});
}

export async function setSavedSessions(savedSessions: SavedSessions): Promise<void> {
  await storageSet({ [STORAGE_KEYS.savedSessions]: savedSessions });
}

export async function getSavedTabsForWorkspace(workspaceId: string): Promise<SavedTab[]> {
  const savedSessions = await getSavedSessions();
  return savedSessions[workspaceId]?.tabs ?? [];
}

export async function clearSavedTabsForWorkspace(workspaceId: string): Promise<void> {
  const savedSessions = await getSavedSessions();
  if (savedSessions[workspaceId]) {
    delete savedSessions[workspaceId];
    await storageSet({ [STORAGE_KEYS.savedSessions]: savedSessions });
  }
}

export async function restoreTabs(workspaceId: string): Promise<chrome.tabs.Tab[]> {
  const savedSessions = await storageGet<SavedSessions>(STORAGE_KEYS.savedSessions, {});
  const savedTabs = savedSessions[workspaceId]?.tabs ?? [];
  if (savedTabs.length === 0) {
    throw new Error(t("noSavedTabsForWorkspace"));
  }

  const openedTabs: chrome.tabs.Tab[] = [];
  const records = await getTabRecords();

  for (const saved of savedTabs) {
    const opened = await chrome.tabs.create({ url: saved.url, active: false });
    openedTabs.push(opened);

    if (typeof opened.id === "number") {
      records.push({
        tabId: opened.id,
        windowId: typeof opened.windowId === "number" ? opened.windowId : -1,
        workspaceId,
        url: saved.url,
        title: saved.title,
        favIconUrl: saved.favIconUrl,
        lastAccessed: Date.now(),
        createdAt: Date.now()
      });
    }
  }

  delete savedSessions[workspaceId];
  await storageSet({ [STORAGE_KEYS.savedSessions]: savedSessions });
  await setTabRecords(records);
  return openedTabs;
}

import { getStoredLanguage, t } from "../utils/i18n";
import {
  addWorkspace,
  deleteWorkspace,
  getSavedSessions,
  getTabRecords,
  getWorkspaces,
  removeTabRecord,
  restoreTabs,
  saveTabs,
  setSavedSessions,
  setTabRecords,
  type TabRecord,
  updateWorkspace,
  updateTabRecord,
  type Workspace
} from "../utils/storage";

const ONBOARDING_PENDING_KEY = "flox.onboardingPending";
const ONBOARDING_COMPLETED_KEY = "flox.onboardingCompleted";
const DASHBOARD_MENU_ID = "flox-open-dashboard";
const ASSIGN_ROOT_MENU_ID = "flox-assign-root";
const ASSIGN_NEW_MENU_ID = "flox-assign-new";
const ASSIGN_WORKSPACE_PREFIX = "flox-assign-workspace:";
const TAB_GROUPS_KEY = "flox.workspaceTabGroups";
const IGNORED_DOMAINS_KEY = "flox.ignoredDomains";
const TAB_SYNC_ALARM = "flox-tab-sync";
const DEFAULT_IDLE_THRESHOLD_MINUTES = 120;
const DEFAULT_TAB_WARNING_THRESHOLD = 20;
const SETTINGS_KEY = "flox.settings";
let contextMenuRefreshInFlight: Promise<void> | null = null;

type WorkspaceGroupMap = Record<string, number>;
type TabGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
type RuntimeSettings = {
  idleThresholdMinutes: number;
  tabWarningThreshold: number;
  autoCreateTabGroup: boolean;
  autoAssignPrompt: boolean;
};

async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const value = (result[SETTINGS_KEY] as Partial<RuntimeSettings> | undefined) ?? {};
  return {
    idleThresholdMinutes:
      typeof value.idleThresholdMinutes === "number" ? value.idleThresholdMinutes : DEFAULT_IDLE_THRESHOLD_MINUTES,
    tabWarningThreshold:
      typeof value.tabWarningThreshold === "number" ? value.tabWarningThreshold : DEFAULT_TAB_WARNING_THRESHOLD,
    autoCreateTabGroup: value.autoCreateTabGroup !== false,
    autoAssignPrompt: value.autoAssignPrompt !== false
  };
}

async function getIgnoredDomains(): Promise<string[]> {
  const result = await chrome.storage.local.get(IGNORED_DOMAINS_KEY);
  return (result[IGNORED_DOMAINS_KEY] as string[] | undefined) ?? [];
}

async function setIgnoredDomains(domains: string[]): Promise<void> {
  await chrome.storage.local.set({ [IGNORED_DOMAINS_KEY]: domains });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyAssignPrompt(
  tabId: number,
  payload: {
    domain: string;
    workspaces: Array<{ id: string; name: string; color: string }>;
    suggestedWorkspaceId?: string;
  }
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ok = await chrome.tabs
      .sendMessage(tabId, {
        type: "flox:showAssignPrompt",
        domain: payload.domain,
        workspaces: payload.workspaces,
        suggestedWorkspaceId: payload.suggestedWorkspaceId ?? null
      })
      .then(() => true)
      .catch(() => false);

    if (ok) {
      return;
    }
    await sleep(300 + attempt * 200);
  }
}

function safeRun(task: () => Promise<void>): void {
  void task().catch(() => undefined);
}

function contextMenusRemoveAll(): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve());
  });
}

function contextMenusCreate(options: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(options, () => {
      // Drain lastError to avoid "Unchecked runtime.lastError" noise.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function hexToTabGroupColor(hex: string): TabGroupColor {
  const normalized = hex.trim().toLowerCase();
  const map: Record<string, TabGroupColor> = {
    "#6366f1": "blue",
    "#ec4899": "pink",
    "#f59e0b": "orange",
    "#10b981": "green",
    "#8b5cf6": "purple"
  };
  return map[normalized] ?? "blue";
}

function getWorkspaceWindowKey(workspaceId: string, windowId: number): string {
  return `${workspaceId}:${windowId}`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function getWorkspaceGroupMap(): Promise<WorkspaceGroupMap> {
  const result = await chrome.storage.local.get(TAB_GROUPS_KEY);
  return (result[TAB_GROUPS_KEY] as WorkspaceGroupMap | undefined) ?? {};
}

async function setWorkspaceGroupMap(groupMap: WorkspaceGroupMap): Promise<void> {
  await chrome.storage.local.set({ [TAB_GROUPS_KEY]: groupMap });
}

async function removeGroupKeyById(groupId: number): Promise<void> {
  const groupMap = await getWorkspaceGroupMap();
  const nextEntries = Object.entries(groupMap).filter(([, value]) => value !== groupId);
  await setWorkspaceGroupMap(Object.fromEntries(nextEntries));
}

async function clearWorkspaceGroupMappings(workspaceId: string): Promise<void> {
  const groupMap = await getWorkspaceGroupMap();
  const nextEntries = Object.entries(groupMap).filter(([key]) => !key.startsWith(`${workspaceId}:`));
  await setWorkspaceGroupMap(Object.fromEntries(nextEntries));
}

function matchWorkspaceByUrl(url: string, workspaces: Workspace[]): Workspace | null {
  for (const workspace of [...workspaces].sort((a, b) => a.order - b.order)) {
    if (workspace.urlPatterns.some((pattern) => url.includes(pattern))) {
      return workspace;
    }
  }
  return null;
}

function matchWorkspaceByHistory(url: string, workspaces: Workspace[], records: TabRecord[]): Workspace | null {
  const domain = getDomain(url);
  if (!domain) {
    return null;
  }
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  let latestRecord: TabRecord | null = null;
  for (const record of records) {
    if (!record.workspaceId) {
      continue;
    }
    if (getDomain(record.url) !== domain) {
      continue;
    }
    if (!workspaceById.has(record.workspaceId)) {
      continue;
    }
    if (!latestRecord || record.lastAccessed > latestRecord.lastAccessed) {
      latestRecord = record;
    }
  }
  if (!latestRecord?.workspaceId) {
    return null;
  }
  return workspaceById.get(latestRecord.workspaceId) ?? null;
}

async function ensureTabInWorkspaceGroup(tab: chrome.tabs.Tab, workspace: Workspace): Promise<void> {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }
  const mapKey = getWorkspaceWindowKey(workspace.id, tab.windowId);
  let groupMap = await getWorkspaceGroupMap();
  let groupId: number | undefined = groupMap[mapKey];
  const applyGroupMeta = async (targetGroupId: number) => {
    const language = await getStoredLanguage();
    await chrome.tabGroups.update(targetGroupId, {
      title: t(workspace.name, undefined, language),
      color: hexToTabGroupColor(workspace.color)
    });
  };

  try {
    if (typeof groupId === "number") {
      await chrome.tabs.group({ groupId, tabIds: tab.id });
      await applyGroupMeta(groupId);
      return;
    }
  } catch {
    await removeGroupKeyById(groupId as number);
  }

  const createdGroupId = await chrome.tabs.group({ tabIds: tab.id });
  await applyGroupMeta(createdGroupId);
  groupMap = await getWorkspaceGroupMap();
  groupMap[mapKey] = createdGroupId;
  await setWorkspaceGroupMap(groupMap);
}

async function syncBadgeFromRecords(): Promise<void> {
  const count = (await getTabRecords()).length;
  const settings = await getRuntimeSettings();
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({
    color: count > settings.tabWarningThreshold ? "#dc2626" : "#2563eb"
  });
}

async function assignAndPersistTab(tab: chrome.tabs.Tab): Promise<void> {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }
  const workspaces = await getWorkspaces();
  const records = await getTabRecords();
  const existing = records.find((item) => item.tabId === tab.id);
  const matchedByPattern = tab.url ? matchWorkspaceByUrl(tab.url, workspaces) : null;
  const matchedByHistory = !matchedByPattern && tab.url ? matchWorkspaceByHistory(tab.url, workspaces, records) : null;
  const matched = matchedByPattern;
  const now = Date.now();
  await updateTabRecord({
    tabId: tab.id,
    windowId: tab.windowId,
    workspaceId: matched?.id ?? null,
    url: tab.url ?? existing?.url ?? "",
    title: tab.title ?? existing?.title ?? "",
    favIconUrl: tab.favIconUrl ?? existing?.favIconUrl ?? "",
    lastAccessed: tab.lastAccessed ?? now,
    createdAt: existing?.createdAt ?? now
  });
  const settings = await getRuntimeSettings();
  if (matched && settings.autoCreateTabGroup) {
    await ensureTabInWorkspaceGroup(tab, matched);
  }
  // If patterns didn't match but history suggests a workspace, ask first.
  if (!matched && matchedByHistory && settings.autoAssignPrompt && tab.url && typeof tab.id === "number") {
    const domain = getDomain(tab.url);
    const ignored = await getIgnoredDomains();
    if (!ignored.includes(domain) && tab.url.startsWith("http")) {
      await notifyAssignPrompt(tab.id, {
        domain,
        suggestedWorkspaceId: matchedByHistory.id,
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          color: workspace.color
        }))
      });
    }
    await syncBadgeFromRecords();
    return;
  }
  if (!matched && settings.autoAssignPrompt && tab.url && typeof tab.id === "number") {
    const domain = getDomain(tab.url);
    const ignored = await getIgnoredDomains();
    if (!ignored.includes(domain) && tab.url.startsWith("http")) {
      await notifyAssignPrompt(tab.id, {
        domain,
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          color: workspace.color
        }))
      });
    }
  }
  await syncBadgeFromRecords();
}

async function reconcileTabRecords(logPrefix?: string): Promise<TabRecord[]> {
  const tabs = await chrome.tabs.query({});
  const workspaces = await getWorkspaces();
  const existingRecords = await getTabRecords();
  const existingByTabId = new Map(existingRecords.map((record) => [record.tabId, record]));
  const records: TabRecord[] = [];
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
      continue;
    }
    const existing = existingByTabId.get(tab.id);
    const matchedByPattern = tab.url ? matchWorkspaceByUrl(tab.url, workspaces) : null;
    const now = Date.now();
    records.push({
      tabId: tab.id,
      windowId: tab.windowId,
      // Never auto-reassign by history in periodic reconciliation; keep user intent stable.
      workspaceId: existing?.workspaceId ?? matchedByPattern?.id ?? null,
      url: tab.url ?? existing?.url ?? "",
      title: tab.title ?? existing?.title ?? "",
      favIconUrl: tab.favIconUrl ?? existing?.favIconUrl ?? "",
      lastAccessed: tab.lastAccessed ?? now,
      createdAt: existing?.createdAt ?? now
    });
  }
  await setTabRecords(records);
  if (logPrefix) {
    console.log(`[${logPrefix}] synced tab records`, { liveTabs: tabs.length, tabRecords: records.length });
  }
  return records;
}

async function scanAndSyncAllTabs(): Promise<void> {
  const records = await reconcileTabRecords();
  const workspaces = await getWorkspaces();
  const settings = await getRuntimeSettings();
  for (const record of records) {
    if (!record.workspaceId) {
      continue;
    }
    const workspace = workspaces.find((item) => item.id === record.workspaceId);
    const tab = await chrome.tabs.get(record.tabId).catch(() => null);
    if (workspace && tab && settings.autoCreateTabGroup) {
      await ensureTabInWorkspaceGroup(tab, workspace);
    }
  }
  await syncBadgeFromRecords();
}

async function buildSnapshot() {
  const [tabs, workspaces, records, savedSessions] = await Promise.all([
    chrome.tabs.query({}),
    getWorkspaces(),
    getTabRecords(),
    getSavedSessions()
  ]);
  const settings = await getRuntimeSettings();
  const idleThresholdMs =
    settings.idleThresholdMinutes <= 0 ? Number.POSITIVE_INFINITY : settings.idleThresholdMinutes * 60 * 1000;
  const recordByTabId = new Map(records.map((item) => [item.tabId, item]));
  const now = Date.now();
  const tabItems = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === "number")
    .map((tab) => {
      const record = recordByTabId.get(tab.id);
      return {
        tabId: tab.id,
        workspaceId: record?.workspaceId ?? null,
        url: tab.url ?? record?.url ?? "",
        domain: getDomain(tab.url ?? record?.url ?? ""),
        title: tab.title ?? record?.title ?? "",
        favIconUrl: tab.favIconUrl ?? record?.favIconUrl ?? "",
        lastAccessed: record?.lastAccessed ?? tab.lastAccessed ?? now
      };
    });

  const workspaceItems = [...workspaces]
    .sort((a, b) => a.order - b.order)
    .map((workspace) => {
      const wsTabs = tabItems.filter((tab) => tab.workspaceId === workspace.id).sort((a, b) => b.lastAccessed - a.lastAccessed);
      return {
        id: workspace.id,
        name: workspace.name,
        color: workspace.color,
        order: workspace.order,
        urlPatterns: workspace.urlPatterns,
        tabCount: wsTabs.length,
        stashedCount: (savedSessions[workspace.id]?.tabs ?? []).length,
        stashedAt: savedSessions[workspace.id]?.savedAt ?? null,
        savedTabs: (savedSessions[workspace.id]?.tabs ?? []).map((tab) => ({ ...tab, domain: getDomain(tab.url) })),
        tabs: wsTabs,
        recentFavicons: wsTabs.slice(0, 3).map((tab) => tab.favIconUrl).filter(Boolean)
      };
    });

  const week = Array.from({ length: 7 }).map((_, offset) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - (6 - offset));
    const next = new Date(dayStart);
    next.setDate(next.getDate() + 1);
    const dayRecords = records.filter((record) => record.createdAt >= dayStart.getTime() && record.createdAt < next.getTime());
    return {
      day: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
      counts: workspaceItems.map((workspace) => ({
        workspaceId: workspace.id,
        value: dayRecords.filter((record) => record.workspaceId === workspace.id).length
      }))
    };
  });

  return {
    totalTabs: tabItems.length,
    idleTabs: tabItems.filter((tab) => now - tab.lastAccessed > idleThresholdMs),
    unassignedTabs: tabItems.filter((tab) => tab.workspaceId === null),
    workspaces: workspaceItems,
    weekly: week,
    usageRanking: workspaceItems
      .map((workspace) => ({ workspaceId: workspace.id, name: workspace.name, color: workspace.color, value: workspace.tabCount * 12 }))
      .sort((a, b) => b.value - a.value)
  };
}

async function stashWorkspaceTabs(workspaceId: string): Promise<void> {
  const records = await getTabRecords();
  const workspaceTabIdSet = new Set(records.filter((item) => item.workspaceId === workspaceId).map((item) => item.tabId));
  const openTabs = await chrome.tabs.query({});
  const tabIds = openTabs
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === "number" && workspaceTabIdSet.has(id));
  await saveTabs(workspaceId);
  if (tabIds.length > 0) {
    await chrome.tabs.remove(tabIds);
  }
  await clearWorkspaceGroupMappings(workspaceId);
}

async function closeWorkspaceTabs(workspaceId: string): Promise<void> {
  const records = await getTabRecords();
  const workspaceTabIdSet = new Set(records.filter((item) => item.workspaceId === workspaceId).map((item) => item.tabId));
  const openTabs = await chrome.tabs.query({});
  const tabIds = openTabs
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === "number" && workspaceTabIdSet.has(id));
  if (tabIds.length > 0) {
    await chrome.tabs.remove(tabIds);
  }
  const next = (await getTabRecords()).filter((record) => !workspaceTabIdSet.has(record.tabId));
  await setTabRecords(next);
}

async function closeSingleTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId);
}

async function closeTabs(tabIds: number[]): Promise<void> {
  const unique = Array.from(new Set(tabIds.filter((id): id is number => typeof id === "number")));
  if (unique.length === 0) {
    return;
  }
  const openTabs = await chrome.tabs.query({});
  const openIdSet = new Set(openTabs.map((t) => t.id).filter((id): id is number => typeof id === "number"));
  const valid = unique.filter((id) => openIdSet.has(id));
  if (valid.length === 0) {
    return;
  }
  await chrome.tabs.remove(valid);
}

async function moveTabToWorkspace(tabId: number, workspaceId: string | null): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    return;
  }
  const records = await getTabRecords();
  const current = records.find((item) => item.tabId === tabId);
  await updateTabRecord({
    tabId,
    windowId: typeof tab.windowId === "number" ? tab.windowId : current?.windowId ?? -1,
    workspaceId,
    url: tab.url ?? current?.url ?? "",
    title: tab.title ?? current?.title ?? "",
    favIconUrl: tab.favIconUrl ?? current?.favIconUrl ?? "",
    lastAccessed: Date.now(),
    createdAt: current?.createdAt ?? Date.now()
  });
  if (workspaceId) {
    const workspace = (await getWorkspaces()).find((item) => item.id === workspaceId);
    if (workspace) {
      await ensureTabInWorkspaceGroup(tab, workspace);
    }
  }
}

async function restoreSingleSavedTab(workspaceId: string, url: string): Promise<void> {
  const savedSessions = await getSavedSessions();
  const list = savedSessions[workspaceId]?.tabs ?? [];
  const target = list.find((item) => item.url === url);
  if (!target) {
    return;
  }
  const opened = await chrome.tabs.create({ url: target.url, active: false });
  if (typeof opened.id === "number") {
    await updateTabRecord({
      tabId: opened.id,
      windowId: typeof opened.windowId === "number" ? opened.windowId : -1,
      workspaceId,
      url: target.url,
      title: target.title,
      favIconUrl: target.favIconUrl,
      lastAccessed: Date.now(),
      createdAt: Date.now()
    });
    const workspace = (await getWorkspaces()).find((item) => item.id === workspaceId);
    if (workspace) {
      await ensureTabInWorkspaceGroup(opened, workspace);
    }
  }
  savedSessions[workspaceId] = {
    savedAt: savedSessions[workspaceId]?.savedAt ?? Date.now(),
    tabs: list.filter((item) => item.url !== url)
  };
  if (savedSessions[workspaceId].tabs.length === 0) {
    delete savedSessions[workspaceId];
  }
  await setSavedSessions(savedSessions);
}

async function reorderWorkspaces(workspaceIds: string[]): Promise<void> {
  for (let i = 0; i < workspaceIds.length; i += 1) {
    await updateWorkspace(workspaceIds[i], { order: i });
  }
}

async function debugDump(): Promise<void> {
  const [tabs, records] = await Promise.all([chrome.tabs.query({}), getTabRecords()]);
  const liveIds = new Set(tabs.map((tab) => tab.id).filter((id): id is number => typeof id === "number"));
  const recordIds = new Set(records.map((record) => record.tabId));
  const missingInRecords = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; windowId: number } => typeof tab.id === "number" && typeof tab.windowId === "number")
    .filter((tab) => !recordIds.has(tab.id))
    .map((tab) => ({ tabId: tab.id, windowId: tab.windowId, url: tab.url ?? "", title: tab.title ?? "" }));
  const staleRecords = records.filter((record) => !liveIds.has(record.tabId));
  console.log("[flox debug] all tabs", tabs.map((tab) => ({ id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title })));
  console.log("[flox debug] all tab records", records);
  console.log("[flox debug] in browser but missing in TabRecord", missingInRecords);
  console.log("[flox debug] stale TabRecord entries", staleRecords);
}

async function refreshContextMenuTitle(): Promise<void> {
  if (contextMenuRefreshInFlight) {
    await contextMenuRefreshInFlight;
    return;
  }

  contextMenuRefreshInFlight = (async () => {
    const language = await getStoredLanguage();
    const title = t("contextMenuOpenDashboard", undefined, language);
    const assignRoot = t("contextMenuAssignTo", undefined, language);
    const assignNew = t("contextMenuAssignNewTask", undefined, language);
    const workspaces = (await getWorkspaces()).sort((a, b) => a.order - b.order);

    // IMPORTANT: contextMenus APIs are callback-based; wrap to truly await.
    await contextMenusRemoveAll();

    await contextMenusCreate({ id: DASHBOARD_MENU_ID, title, contexts: ["action"] });
    await contextMenusCreate({ id: ASSIGN_ROOT_MENU_ID, title: assignRoot, contexts: ["page"] });
    for (const workspace of workspaces) {
      await contextMenusCreate({
        id: `${ASSIGN_WORKSPACE_PREFIX}${workspace.id}`,
        parentId: ASSIGN_ROOT_MENU_ID,
        title: t(workspace.name, undefined, language),
        contexts: ["page"]
      });
    }
    await contextMenusCreate({
      id: ASSIGN_NEW_MENU_ID,
      parentId: ASSIGN_ROOT_MENU_ID,
      title: assignNew,
      contexts: ["page"]
    });
  })().finally(() => {
    contextMenuRefreshInFlight = null;
  });

  await contextMenuRefreshInFlight;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await refreshContextMenuTitle();
  await chrome.alarms.create(TAB_SYNC_ALARM, { periodInMinutes: 0.5 });
  if (details.reason === "install") {
    await chrome.storage.local.set({
      [ONBOARDING_PENDING_KEY]: true,
      [ONBOARDING_COMPLETED_KEY]: false
    });
    await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
  await scanAndSyncAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  safeRun(async () => {
    await chrome.alarms.create(TAB_SYNC_ALARM, { periodInMinutes: 0.5 });
    await refreshContextMenuTitle();
    await scanAndSyncAllTabs();
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "flox-language-updated") {
    safeRun(refreshContextMenuTitle);
    return;
  }

  void (async () => {
    try {
      switch (message?.type) {
        case "popup:getSnapshot":
        case "dashboard:getData":
          await scanAndSyncAllTabs();
          sendResponse({ ok: true, data: await buildSnapshot() });
          break;
        case "popup:stashWorkspace":
        case "dashboard:stashWorkspace":
          await stashWorkspaceTabs(message.workspaceId);
          await scanAndSyncAllTabs();
          sendResponse({ ok: true });
          break;
        case "popup:restoreWorkspace":
        case "dashboard:restoreWorkspace":
          await restoreTabs(message.workspaceId);
          await scanAndSyncAllTabs();
          sendResponse({ ok: true });
          break;
        case "dashboard:restoreSavedTab":
          await restoreSingleSavedTab(message.workspaceId, message.url);
          await scanAndSyncAllTabs();
          sendResponse({ ok: true });
          break;
        case "popup:closeWorkspaceTabs":
        case "dashboard:closeWorkspaceTabs":
          await closeWorkspaceTabs(message.workspaceId);
          sendResponse({ ok: true });
          break;
        case "popup:closeTab":
        case "dashboard:closeTab":
          await closeSingleTab(message.tabId);
          sendResponse({ ok: true });
          break;
        case "popup:closeTabs":
          await closeTabs((message.tabIds as number[] | undefined) ?? []);
          sendResponse({ ok: true });
          break;
        case "popup:addWorkspace":
        case "dashboard:addWorkspace":
          await addWorkspace({ name: message.name, color: message.color, urlPatterns: message.urlPatterns ?? [] });
          sendResponse({ ok: true });
          break;
        case "popup:updateWorkspace":
        case "dashboard:updateWorkspace":
          await updateWorkspace(message.workspaceId, { name: message.name, color: message.color, urlPatterns: message.urlPatterns ?? [] });
          sendResponse({ ok: true });
          break;
        case "popup:deleteWorkspace":
        case "dashboard:deleteWorkspace":
          await deleteWorkspace(message.workspaceId);
          sendResponse({ ok: true });
          break;
        case "dashboard:assignTab":
          await moveTabToWorkspace(message.tabId, message.workspaceId ?? null);
          sendResponse({ ok: true });
          break;
        case "dashboard:reorderWorkspaces":
          await reorderWorkspaces(message.workspaceIds ?? []);
          sendResponse({ ok: true });
          break;
        case "dashboard:getIgnoredDomains":
          sendResponse({ ok: true, data: await getIgnoredDomains() });
          break;
        case "dashboard:removeIgnoredDomain": {
          const current = await getIgnoredDomains();
          await setIgnoredDomains(current.filter((item) => item !== message.domain));
          sendResponse({ ok: true });
          break;
        }
        case "content:assignWorkspace":
          if (_sender.tab?.id) {
            await moveTabToWorkspace(_sender.tab.id, message.workspaceId ?? null);
            await scanAndSyncAllTabs();
          }
          sendResponse({ ok: true });
          break;
        case "content:ignoreDomain": {
          const current = await getIgnoredDomains();
          if (typeof message.domain === "string" && !current.includes(message.domain)) {
            await setIgnoredDomains([...current, message.domain]);
          }
          sendResponse({ ok: true });
          break;
        }
        case "popup:rescanTabs":
        case "dashboard:rescanTabs":
          await scanAndSyncAllTabs();
          sendResponse({ ok: true });
          break;
        case "debug-dump":
          await debugDump();
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "unknown_error" });
    }
  })();
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === DASHBOARD_MENU_ID) {
    safeRun(async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
    return;
  }

  safeRun(async () => {
    if (!tab || typeof tab.id !== "number") {
      return;
    }

    if (info.menuItemId === ASSIGN_NEW_MENU_ID) {
      const newWorkspace = await addWorkspace({
        name: t("popupUntitledTask"),
        color: "#6366f1",
        urlPatterns: []
      });
      await moveTabToWorkspace(tab.id, newWorkspace.id);
      await scanAndSyncAllTabs();
      await refreshContextMenuTitle();
      return;
    }

    if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(ASSIGN_WORKSPACE_PREFIX)) {
      const workspaceId = info.menuItemId.replace(ASSIGN_WORKSPACE_PREFIX, "");
      await moveTabToWorkspace(tab.id, workspaceId);
      await scanAndSyncAllTabs();
    }
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  safeRun(async () => {
    console.log("[flox tabs.onCreated]", { tabId: tab.id, windowId: tab.windowId });
    await assignAndPersistTab(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || typeof changeInfo.url === "string") {
    safeRun(async () => {
      const updated = await chrome.tabs.get(tabId).catch(() => null);
      const windowId = updated?.windowId ?? tab.windowId;
      const url = updated?.url ?? changeInfo.url ?? tab.url;
      console.log("[flox tabs.onUpdated]", {
        tabId,
        windowId,
        status: changeInfo.status,
        url
      });
      if (updated) {
        await assignAndPersistTab(updated);
      } else {
        await assignAndPersistTab({ ...tab, id: tabId, url: url ?? tab.url });
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  safeRun(async () => {
    await removeTabRecord(tabId);
    await syncBadgeFromRecords();
  });
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  safeRun(async () => {
    const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
    if (!tab || typeof tab.id !== "number") {
      return;
    }
    const current = (await getTabRecords()).find((record) => record.tabId === tab.id);
    await updateTabRecord({
      tabId: tab.id,
      windowId: typeof tab.windowId === "number" ? tab.windowId : current?.windowId ?? -1,
      workspaceId: current?.workspaceId ?? null,
      url: tab.url ?? current?.url ?? "",
      title: tab.title ?? current?.title ?? "",
      favIconUrl: tab.favIconUrl ?? current?.favIconUrl ?? "",
      lastAccessed: Date.now(),
      createdAt: current?.createdAt ?? Date.now()
    });
    await syncBadgeFromRecords();
  });
});

chrome.tabGroups.onRemoved.addListener((group) => {
  safeRun(async () => {
    await removeGroupKeyById(group.id);
  });
});

chrome.windows.onCreated.addListener((window) => {
  safeRun(async () => {
    if (typeof window.id === "number") {
      console.log("[flox windows.onCreated]", { windowId: window.id });
    }
    await scanAndSyncAllTabs();
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TAB_SYNC_ALARM) {
    return;
  }
  safeRun(async () => {
    await reconcileTabRecords("alarm");
    await syncBadgeFromRecords();
  });
});

chrome.commands.onCommand.addListener((command) => {
  safeRun(async () => {
    if (command === "open_dashboard") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
      return;
    }
    if (command === "stash_active_workspace") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || typeof activeTab.id !== "number") {
        return;
      }
      const record = (await getTabRecords()).find((item) => item.tabId === activeTab.id);
      if (!record?.workspaceId) {
        return;
      }
      await stashWorkspaceTabs(record.workspaceId);
      await scanAndSyncAllTabs();
    }
  });
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") {
    safeRun(refreshContextMenuTitle);
  }
});

import { getStoredLanguage, t } from "../utils/i18n";
import { checkFeature, PLAN_LIMITS } from "../utils/plan";
import {
  addPinnedLink,
  addSkipUrlRule,
  addWorkspace,
  deleteWorkspace,
  getPinnedLinks,
  getSavedSessions,
  getSkipUrlRules,
  getTabRecords,
  getWorkspaces,
  removePinnedLink,
  removeSkipUrlRule,
  removeTabRecord,
  reorderPinnedLinks,
  restoreTabs,
  saveTabs,
  setSavedSessions,
  setTabRecords,
  type SkipUrlRule,
  type TabRecord,
  updatePinnedLink,
  updateSkipUrlRule,
  updateWorkspace,
  updateTabRecord,
  type Workspace
} from "../utils/storage";
import { getStoredUiTheme } from "../utils/theme";

const ONBOARDING_PENDING_KEY = "flox.onboardingPending";
const ONBOARDING_COMPLETED_KEY = "flox.onboardingCompleted";
const DASHBOARD_MENU_ID = "flox-open-dashboard";
const ASSIGN_ROOT_MENU_ID = "flox-assign-root";
const ASSIGN_NEW_MENU_ID = "flox-assign-new";
const ASSIGN_WORKSPACE_PREFIX = "flox-assign-workspace:";
const PINNED_SAVE_MENU_ID = "flox-save-pinned";
const TAB_GROUPS_KEY = "flox.workspaceTabGroups";
const IGNORED_DOMAINS_KEY = "flox.ignoredDomains";
const TAB_SYNC_ALARM = "flox-tab-sync";
const DEFAULT_IDLE_THRESHOLD_MINUTES = 120;
const DEFAULT_TAB_WARNING_THRESHOLD = 20;
const SETTINGS_KEY = "flox.settings";
let contextMenuRefreshInFlight: Promise<void> | null = null;

/** Tabs closed via Flox UI — skip post-close “last tab” system notification. */
const floxInitiatedTabRemovals = new Set<number>();
const lastWorkspaceNotifyById = new Map<string, { workspaceId: string }>();

function markTabsRemovedByFlox(tabIds: ReadonlyArray<number>): void {
  for (const id of tabIds) {
    floxInitiatedTabRemovals.add(id);
  }
}

function newLastWorkspaceNotificationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `flox-lwc-${crypto.randomUUID()}`;
  }
  return `flox-lwc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function notifyLastWorkspaceTabClosed(workspaceId: string): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) {
    return;
  }
  const language = await getStoredLanguage();
  const displayName = t(ws.name, undefined, language);
  const notificationId = newLastWorkspaceNotificationId();
  lastWorkspaceNotifyById.set(notificationId, { workspaceId });
  const options: chrome.notifications.NotificationOptions<true> = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-48.png"),
    title: t("lastTabClosedNotifyTitle", [displayName], language),
    message: t("lastTabClosedNotifyMessage", undefined, language),
    buttons: [
      { title: t("lastTabClosedNotifyKeep", undefined, language) },
      { title: t("lastWorkspaceTabDeleteWorkspace", undefined, language) }
    ],
    priority: 1
  };
  await new Promise<void>((resolve) => {
    try {
      chrome.notifications.create(notificationId, options, () => {
        if (chrome.runtime.lastError) {
          lastWorkspaceNotifyById.delete(notificationId);
        }
        resolve();
      });
    } catch {
      lastWorkspaceNotifyById.delete(notificationId);
      resolve();
    }
  });
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  safeRun(async () => {
    const payload = lastWorkspaceNotifyById.get(notificationId);
    if (!payload) {
      return;
    }
    lastWorkspaceNotifyById.delete(notificationId);
    void chrome.notifications.clear(notificationId);
    if (buttonIndex === 1) {
      try {
        await finalizeWorkspaceDeletion(payload.workspaceId);
      } catch {
        // workspace may already be gone
      }
    }
  });
});

chrome.notifications.onClosed.addListener((notificationId) => {
  lastWorkspaceNotifyById.delete(notificationId);
});

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

async function setRuntimeSettingsPartial(updates: Partial<RuntimeSettings>): Promise<void> {
  const current = await getRuntimeSettings();
  const next = { ...current, ...updates };
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      idleThresholdMinutes: next.idleThresholdMinutes,
      tabWarningThreshold: next.tabWarningThreshold,
      autoCreateTabGroup: next.autoCreateTabGroup,
      autoAssignPrompt: next.autoAssignPrompt
    }
  });
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
  const uiTheme = await getStoredUiTheme();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await chrome.tabs
      .sendMessage(tabId, {
        type: "flox:showAssignPrompt",
        domain: payload.domain,
        workspaces: payload.workspaces,
        suggestedWorkspaceId: payload.suggestedWorkspaceId ?? null,
        uiTheme
      })
      .catch(() => null);

    if (isContentScriptAck(response)) {
      return;
    }
    await sleep(200 + attempt * 250);
  }
}

function normalizeUrlForDedupe(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

async function pickDuplicateOtherTabId(currentTabId: number, pageUrl: string): Promise<number | null> {
  const norm = normalizeUrlForDedupe(pageUrl);
  if (!norm) {
    return null;
  }
  const tabs = await chrome.tabs.query({});
  const others: number[] = [];
  for (const item of tabs) {
    if (typeof item.id !== "number" || item.id === currentTabId) {
      continue;
    }
    if (!item.url || !item.url.startsWith("http")) {
      continue;
    }
    const otherNorm = normalizeUrlForDedupe(item.url);
    if (otherNorm === norm) {
      others.push(item.id);
    }
  }
  if (others.length === 0) {
    return null;
  }
  return Math.min(...others);
}

function isContentScriptAck(response: unknown): boolean {
  return typeof response === "object" && response !== null && (response as { ok?: boolean }).ok === true;
}

async function notifyDuplicateTabPrompt(tabId: number, otherTabId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await chrome.tabs.sendMessage(tabId, { type: "flox:showDuplicateTabPrompt", otherTabId }).catch(() => null);
    if (isContentScriptAck(response)) {
      return true;
    }
    await sleep(200 + attempt * 250);
  }
  return false;
}

/** Only skip the assign prompt when the duplicate-tab UI was actually shown. */
async function maybeShowDuplicateTabPrompt(tabId: number, pageUrl: string | undefined): Promise<boolean> {
  if (!pageUrl || !pageUrl.startsWith("http")) {
    return false;
  }
  const otherId = await pickDuplicateOtherTabId(tabId, pageUrl);
  if (otherId === null) {
    return false;
  }
  return notifyDuplicateTabPrompt(tabId, otherId);
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

function isFloxDashboardPageUrl(url: string): boolean {
  if (!url) {
    return false;
  }
  const dash = chrome.runtime.getURL("dashboard.html");
  return url === dash || url.startsWith(`${dash}?`) || url.startsWith(`${dash}#`);
}

function normalizePinnedKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

async function isUrlAlreadyPinned(pageUrl: string): Promise<boolean> {
  const key = normalizePinnedKey(pageUrl);
  if (!key) {
    return false;
  }
  const links = await getPinnedLinks();
  return links.some((link) => normalizePinnedKey(link.url) === key);
}

async function fetchLinkPreview(url: string): Promise<{ title: string; favIconUrl: string }> {
  let title = "";
  let favIconUrl = "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { title, favIconUrl };
    }
    const domain = parsed.hostname;
    favIconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    if (res.ok) {
      const text = (await res.text()).slice(0, 96000);
      const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 240);
      }
      const linkRel = text.match(/<link[^>]+rel=["'][^"']*(?:shortcut )?icon[^"']*["'][^>]*>/i);
      if (linkRel) {
        const hrefMatch = linkRel[0].match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          try {
            favIconUrl = new URL(hrefMatch[1], url).href;
          } catch {
            // keep google favicon
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return { title, favIconUrl };
}

async function savePinnedFromTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.url || !tab.url.startsWith("http") || typeof tab.id !== "number") {
    return;
  }
  if (await isUrlAlreadyPinned(tab.url)) {
    return;
  }
  const records = await getTabRecords();
  const rec = records.find((row) => row.tabId === tab.id);
  await addPinnedLink({
    url: tab.url,
    title: tab.title?.trim() || tab.url,
    favIconUrl: tab.favIconUrl ?? "",
    workspaceId: rec?.workspaceId ?? null
  });
}

type AddCurrentTabPinnedResult =
  | { ok: true; link: Awaited<ReturnType<typeof addPinnedLink>> }
  | { ok: false; code: "no_tab" | "no_http" | "already_pinned" | "pinned_limit" | "error" };

async function tryAddPinnedFromActiveTab(): Promise<AddCurrentTabPinnedResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || typeof tab.id !== "number") {
    return { ok: false, code: "no_tab" };
  }
  if (!tab.url.startsWith("http")) {
    return { ok: false, code: "no_http" };
  }
  if (await isUrlAlreadyPinned(tab.url)) {
    return { ok: false, code: "already_pinned" };
  }
  try {
    const records = await getTabRecords();
    const rec = records.find((row) => row.tabId === tab.id);
    const link = await addPinnedLink({
      url: tab.url,
      title: tab.title?.trim() || tab.url,
      favIconUrl: tab.favIconUrl ?? "",
      workspaceId: rec?.workspaceId ?? null
    });
    await syncPinnedPageMenuForActiveTab();
    return { ok: true, link };
  } catch (err) {
    if (err instanceof Error && err.message === "PINNED_LIMIT") {
      return { ok: false, code: "pinned_limit" };
    }
    return { ok: false, code: "error" };
  }
}

async function syncPinnedPageMenuForTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
  try {
    const language = await getStoredLanguage();
    const canPin = Boolean(tab?.url?.startsWith("http"));
    const exists = canPin && tab?.url ? await isUrlAlreadyPinned(tab.url) : false;
    await chrome.contextMenus.update(PINNED_SAVE_MENU_ID, {
      title: exists
        ? t("contextMenuPinnedSaved", undefined, language)
        : t("contextMenuSavePinned", undefined, language),
      enabled: canPin && !exists
    });
  } catch {
    // menu missing during first install race
  }
}

async function syncPinnedPageMenuForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await syncPinnedPageMenuForTab(tab);
}

async function getWorkspaceGroupMap(): Promise<WorkspaceGroupMap> {
  const result = await chrome.storage.local.get(TAB_GROUPS_KEY);
  return (result[TAB_GROUPS_KEY] as WorkspaceGroupMap | undefined) ?? {};
}

async function setWorkspaceGroupMap(groupMap: WorkspaceGroupMap): Promise<void> {
  await chrome.storage.local.set({ [TAB_GROUPS_KEY]: groupMap });
}

async function deleteWorkspaceGroupMapKey(mapKey: string): Promise<void> {
  const groupMap = await getWorkspaceGroupMap();
  if (!(mapKey in groupMap)) {
    return;
  }
  const next = { ...groupMap };
  delete next[mapKey];
  await setWorkspaceGroupMap(next);
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

function matchSkipUrlRule(tabUrl: string, rules: SkipUrlRule[]): SkipUrlRule | null {
  const lower = tabUrl.trim().toLowerCase();
  const ordered = [...rules].sort((a, b) => a.createdAt - b.createdAt);
  for (const rule of ordered) {
    const p = rule.urlPattern.trim().toLowerCase();
    if (!p) {
      continue;
    }
    if (lower.includes(p)) {
      return rule;
    }
  }
  return null;
}

function matchWorkspaceByHistory(
  url: string,
  workspaces: Workspace[],
  records: TabRecord[],
  excludeTabId?: number
): Workspace | null {
  const domain = getDomain(url);
  if (!domain) {
    return null;
  }
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  let latestRecord: TabRecord | null = null;
  for (const record of records) {
    if (excludeTabId !== undefined && record.tabId === excludeTabId) {
      continue;
    }
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

  if (typeof groupId === "number") {
    try {
      const meta = await chrome.tabGroups.get(groupId);
      if (meta.windowId !== tab.windowId) {
        await deleteWorkspaceGroupMapKey(mapKey);
        groupId = undefined;
      }
    } catch {
      await deleteWorkspaceGroupMapKey(mapKey);
      if (typeof groupId === "number") {
        await removeGroupKeyById(groupId);
      }
      groupId = undefined;
    }
  }

  try {
    if (typeof groupId === "number") {
      await chrome.tabs.group({ groupId, tabIds: tab.id });
      await applyGroupMeta(groupId);
      return;
    }
  } catch {
    if (typeof groupId === "number") {
      await removeGroupKeyById(groupId);
    }
    await deleteWorkspaceGroupMapKey(mapKey);
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

async function assignAndPersistTab(
  tab: chrome.tabs.Tab,
  options?: { skipAssignPrompt?: boolean; skipConsolidatePrompt?: boolean }
): Promise<void> {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }
  const workspaces = await getWorkspaces();
  const records = await getTabRecords();
  const skipRules = await getSkipUrlRules();
  const canConsiderSkip =
    Boolean(tab.url) &&
    tab.url!.startsWith("http") &&
    !tab.url!.startsWith("chrome://") &&
    !tab.url!.startsWith("edge://");
  const skipMatch = canConsiderSkip ? matchSkipUrlRule(tab.url!, skipRules) : null;
  const skipForcedWorkspace =
    skipMatch?.workspaceId && workspaces.some((w) => w.id === skipMatch.workspaceId) ? skipMatch.workspaceId : null;
  const silentSkipListAssign = Boolean(skipMatch && skipForcedWorkspace);

  const existing = records.find((item) => item.tabId === tab.id);
  const matchedByPattern = tab.url ? matchWorkspaceByUrl(tab.url, workspaces) : null;

  const priorWorkspaceId = existing?.workspaceId ?? null;
  const priorWorkspaceStillValid =
    priorWorkspaceId !== null && workspaces.some((w) => w.id === priorWorkspaceId);

  let nextWorkspaceId: string | null = null;
  if (skipForcedWorkspace) {
    nextWorkspaceId = skipForcedWorkspace;
  } else if (priorWorkspaceStillValid) {
    if (matchedByPattern) {
      nextWorkspaceId = matchedByPattern.id;
    } else {
      nextWorkspaceId = priorWorkspaceId;
    }
  } else {
    nextWorkspaceId = matchedByPattern?.id ?? null;
  }

  if (
    !skipForcedWorkspace &&
    nextWorkspaceId === null &&
    tab.url &&
    tab.url.startsWith("http") &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("edge://")
  ) {
    const byHistory = matchWorkspaceByHistory(tab.url, workspaces, records, tab.id);
    if (byHistory) {
      nextWorkspaceId = byHistory.id;
    }
  }

  const settings = await getRuntimeSettings();
  const assignedWorkspace = nextWorkspaceId ? workspaces.find((w) => w.id === nextWorkspaceId) ?? null : null;
  const assignmentChanged = priorWorkspaceId !== nextWorkspaceId;

  let workingTab: chrome.tabs.Tab = tab;
  if (
    nextWorkspaceId &&
    assignedWorkspace &&
    settings.autoCreateTabGroup &&
    assignmentChanged &&
    !options?.skipConsolidatePrompt &&
    !silentSkipListAssign
  ) {
    const consolidate = await getWorkspaceConsolidationTarget(tab.id, nextWorkspaceId, tab.windowId);
    if (consolidate) {
      const lang = await getStoredLanguage();
      const promptText = t("assignConsolidateWindowsPrompt", [String(consolidate.peerCountElsewhere)], lang);
      const ok = await promptMergeWindowsOnTabPage(tab.id, promptText);
      if (ok) {
        try {
          await chrome.tabs.move(tab.id, { windowId: consolidate.windowId, index: -1 });
          const refreshed = await chrome.tabs.get(tab.id).catch(() => null);
          if (refreshed) {
            workingTab = refreshed;
          }
        } catch {
          // Keep tab in original window if move fails (e.g. popup or restricted tab).
        }
      }
    }
  }

  const now = Date.now();
  await updateTabRecord({
    tabId: tab.id,
    windowId: typeof workingTab.windowId === "number" ? workingTab.windowId : tab.windowId,
    workspaceId: nextWorkspaceId,
    url: workingTab.url ?? tab.url ?? existing?.url ?? "",
    title: workingTab.title ?? tab.title ?? existing?.title ?? "",
    favIconUrl: workingTab.favIconUrl ?? tab.favIconUrl ?? existing?.favIconUrl ?? "",
    lastAccessed: workingTab.lastAccessed ?? tab.lastAccessed ?? now,
    createdAt: existing?.createdAt ?? now
  });

  if (assignedWorkspace && settings.autoCreateTabGroup) {
    await ensureTabInWorkspaceGroup(workingTab, assignedWorkspace);
  }

  if (nextWorkspaceId !== null) {
    await syncBadgeFromRecords();
    return;
  }

  if (!settings.autoAssignPrompt || !tab.url || !tab.url.startsWith("http")) {
    await syncBadgeFromRecords();
    return;
  }

  const domain = getDomain(tab.url);
  const ignored = await getIgnoredDomains();
  if (ignored.includes(domain)) {
    await syncBadgeFromRecords();
    return;
  }

  if (options?.skipAssignPrompt) {
    await syncBadgeFromRecords();
    return;
  }

  if (skipMatch) {
    await syncBadgeFromRecords();
    return;
  }

  await notifyAssignPrompt(tab.id, {
    domain,
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      color: workspace.color
    }))
  });
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
    const priorId = existing?.workspaceId ?? null;
    const priorOk = priorId !== null && workspaces.some((w) => w.id === priorId);
    let workspaceId: string | null = null;
    if (priorOk) {
      workspaceId = matchedByPattern ? matchedByPattern.id : priorId;
    } else {
      workspaceId = matchedByPattern?.id ?? null;
    }
    const now = Date.now();
    records.push({
      tabId: tab.id,
      windowId: tab.windowId,
      workspaceId,
      url: tab.url ?? existing?.url ?? "",
      title: tab.title ?? existing?.title ?? "",
      favIconUrl: tab.favIconUrl ?? existing?.favIconUrl ?? "",
      lastAccessed: tab.lastAccessed ?? now,
      createdAt: existing?.createdAt ?? now
    });
  }
  for (let i = 0; i < records.length; i += 1) {
    const row = records[i];
    if (row.workspaceId !== null) {
      continue;
    }
    if (!row.url || !row.url.startsWith("http")) {
      continue;
    }
    const inferred = matchWorkspaceByHistory(row.url, workspaces, records, row.tabId);
    if (inferred) {
      records[i] = { ...row, workspaceId: inferred.id };
    }
  }
  await setTabRecords(records);
  if (logPrefix) {
    console.log(`[${logPrefix}] synced tab records`, { liveTabs: tabs.length, tabRecords: records.length });
  }
  return records;
}

async function scanAndSyncAllTabs(): Promise<void> {
  await reconcileTabRecords();
  const skipRules = await getSkipUrlRules();
  const liveTabs = await chrome.tabs.query({});
  for (const tab of liveTabs) {
    if (typeof tab.id !== "number") {
      continue;
    }
    const url = tab.url ?? "";
    if (!url.startsWith("http") || url.startsWith("chrome://") || url.startsWith("edge://")) {
      continue;
    }
    if (!matchSkipUrlRule(url, skipRules)) {
      continue;
    }
    await assignAndPersistTab(tab, { skipAssignPrompt: true, skipConsolidatePrompt: true });
  }
  const records = await getTabRecords();
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
  const [tabs, workspaces, records, savedSessions, pinnedLinks, skipUrlRules] = await Promise.all([
    chrome.tabs.query({}),
    getWorkspaces(),
    getTabRecords(),
    getSavedSessions(),
    getPinnedLinks(),
    getSkipUrlRules()
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
      const wsPins = pinnedLinks.filter((p) => p.workspaceId === workspace.id).sort((a, b) => a.order - b.order);
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
        recentFavicons: wsTabs.slice(0, 3).map((tab) => tab.favIconUrl).filter(Boolean),
        pinnedStrip: wsPins.slice(0, 5).map((link) => ({
          id: link.id,
          url: link.url,
          title: link.title,
          favIconUrl: link.favIconUrl,
          workspaceId: link.workspaceId,
          domain: getDomain(link.url)
        })),
        pinnedStripTotal: wsPins.length
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
    unassignedTabs: tabItems.filter(
      (tab) => tab.workspaceId === null && !isFloxDashboardPageUrl(tab.url)
    ),
    workspaces: workspaceItems,
    weekly: week,
    usageRanking: workspaceItems
      .map((workspace) => ({ workspaceId: workspace.id, name: workspace.name, color: workspace.color, value: workspace.tabCount * 12 }))
      .sort((a, b) => b.value - a.value),
    pinnedLinks: pinnedLinks.map((link) => ({
      id: link.id,
      url: link.url,
      title: link.title,
      favIconUrl: link.favIconUrl,
      workspaceId: link.workspaceId,
      order: link.order,
      createdAt: link.createdAt,
      domain: getDomain(link.url)
    })),
    skipUrlRules: skipUrlRules.map((rule) => ({
      id: rule.id,
      urlPattern: rule.urlPattern,
      workspaceId: rule.workspaceId,
      createdAt: rule.createdAt
    }))
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
    markTabsRemovedByFlox(tabIds);
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
    markTabsRemovedByFlox(tabIds);
    await chrome.tabs.remove(tabIds);
  }
  const next = (await getTabRecords()).filter((record) => !workspaceTabIdSet.has(record.tabId));
  await setTabRecords(next);
}

async function countOpenTabsInWorkspace(workspaceId: string, excludeTabId: number): Promise<number> {
  const records = await getTabRecords();
  const openTabs = await chrome.tabs.query({});
  const openIds = new Set(openTabs.map((t) => t.id).filter((id): id is number => typeof id === "number"));
  return records.filter(
    (row) => row.workspaceId === workspaceId && row.tabId !== excludeTabId && openIds.has(row.tabId)
  ).length;
}

async function finalizeWorkspaceDeletion(workspaceId: string): Promise<void> {
  const records = await getTabRecords();
  const affectedTabIds = records.filter((r) => r.workspaceId === workspaceId).map((r) => r.tabId);
  await deleteWorkspace(workspaceId);
  await clearWorkspaceGroupMappings(workspaceId);
  for (const id of affectedTabIds) {
    const stillOpen = await chrome.tabs.get(id).catch(() => null);
    if (stillOpen && typeof stillOpen.id === "number") {
      await chrome.tabs.ungroup(stillOpen.id).catch(() => undefined);
    }
  }
  await refreshContextMenuTitle();
  await scanAndSyncAllTabs();
}

async function closeSingleTab(tabId: number): Promise<void> {
  markTabsRemovedByFlox([tabId]);
  await chrome.tabs.remove(tabId);
}

async function closeWorkspaceTabWithChoice(tabId: number, workspaceId: string, removeWorkspace: boolean): Promise<void> {
  const records = await getTabRecords();
  const openTabs = await chrome.tabs.query({});
  const openIds = new Set(openTabs.map((tab) => tab.id).filter((id): id is number => typeof id === "number"));
  const openInWorkspace = records.filter(
    (row) => row.workspaceId === workspaceId && typeof row.tabId === "number" && openIds.has(row.tabId)
  );

  if (removeWorkspace && openInWorkspace.length === 1 && openInWorkspace[0].tabId === tabId) {
    await finalizeWorkspaceDeletion(workspaceId);
  }

  markTabsRemovedByFlox([tabId]);
  await chrome.tabs.remove(tabId).catch(() => undefined);
  await scanAndSyncAllTabs();
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
  markTabsRemovedByFlox(valid);
  await chrome.tabs.remove(valid);
}

type MoveTabOptions = { skipConsolidatePrompt?: boolean };

/** If the workspace has open tabs in other windows, pick the window that holds the most of them (for merge target). */
async function getWorkspaceConsolidationTarget(
  tabId: number,
  workspaceId: string,
  currentWindowId: number
): Promise<{ windowId: number; peerCountElsewhere: number } | null> {
  const records = await getTabRecords();
  const openTabs = await chrome.tabs.query({});
  const openById = new Map(
    openTabs
      .filter((x): x is chrome.tabs.Tab & { id: number } => typeof x.id === "number")
      .map((x) => [x.id, x])
  );

  const countsByWindow = new Map<number, number>();
  for (const r of records) {
    if (r.workspaceId !== workspaceId || r.tabId === tabId) {
      continue;
    }
    const peer = openById.get(r.tabId);
    if (!peer || typeof peer.windowId !== "number") {
      continue;
    }
    if (peer.windowId === currentWindowId) {
      continue;
    }
    countsByWindow.set(peer.windowId, (countsByWindow.get(peer.windowId) ?? 0) + 1);
  }
  if (countsByWindow.size === 0) {
    return null;
  }

  let bestWindow = currentWindowId;
  let bestCount = -1;
  for (const [w, c] of countsByWindow) {
    if (c > bestCount) {
      bestCount = c;
      bestWindow = w;
    }
  }
  const peerCountElsewhere = [...countsByWindow.values()].reduce((sum, c) => sum + c, 0);
  return { windowId: bestWindow, peerCountElsewhere };
}

async function promptMergeWindowsOnTabPage(tabId: number, message: string): Promise<boolean> {
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (text: string) => window.confirm(text),
      args: [message]
    });
    return injected?.result === true;
  } catch {
    return false;
  }
}

async function moveTabToWorkspace(tabId: number, workspaceId: string | null, options?: MoveTabOptions): Promise<void> {
  let tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  const recordsBefore = await getTabRecords();
  const currentBefore = recordsBefore.find((item) => item.tabId === tabId);

  if (workspaceId && typeof tab.windowId === "number" && !options?.skipConsolidatePrompt) {
    const consolidate = await getWorkspaceConsolidationTarget(tabId, workspaceId, tab.windowId);
    if (consolidate) {
      const lang = await getStoredLanguage();
      const promptText = t("assignConsolidateWindowsPrompt", [String(consolidate.peerCountElsewhere)], lang);
      const ok = await promptMergeWindowsOnTabPage(tabId, promptText);
      if (ok) {
        try {
          await chrome.tabs.move(tabId, { windowId: consolidate.windowId, index: -1 });
          tab = (await chrome.tabs.get(tabId).catch(() => null)) ?? tab;
        } catch {
          // Keep tab in original window if move fails (e.g. popup or restricted tab).
        }
      }
    }
  }

  const records = await getTabRecords();
  const current = records.find((item) => item.tabId === tabId) ?? currentBefore;
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
  if (!workspaceId) {
    try {
      await chrome.tabs.ungroup(tabId);
    } catch {
      // Tab may already be ungrouped.
    }
    return;
  }
  const workspace = (await getWorkspaces()).find((item) => item.id === workspaceId);
  if (workspace) {
    await ensureTabInWorkspaceGroup(tab, workspace);
  }
}

async function focusLiveTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || typeof tab.windowId !== "number") {
    return;
  }
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
  await chrome.tabs.update(tabId, { active: true });
}

/** If a tab with the same URL (normalized) is open, focus it; otherwise create. Returns whether an existing tab was focused. */
async function focusOrOpenUrl(url: string, active: boolean): Promise<boolean> {
  if (!url.startsWith("http")) {
    await chrome.tabs.create({ url, active });
    return false;
  }
  const key = normalizePinnedKey(url);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const u = tab.url;
    if (!u || !u.startsWith("http")) {
      continue;
    }
    const tabKey = normalizePinnedKey(u);
    const match = key ? tabKey === key : u === url;
    if (match && typeof tab.id === "number") {
      await focusLiveTab(tab.id);
      return true;
    }
  }
  await chrome.tabs.create({ url, active });
  return false;
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
    await contextMenusCreate({
      id: PINNED_SAVE_MENU_ID,
      title: t("contextMenuSavePinned", undefined, language),
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await syncPinnedPageMenuForTab(activeTab);
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
        case "popup:closeWorkspaceTab":
        case "dashboard:closeWorkspaceTab": {
          const tabId = message.tabId as number;
          const workspaceId = message.workspaceId as string;
          const removeWorkspace = message.deleteWorkspace === true;
          if (typeof tabId !== "number" || typeof workspaceId !== "string") {
            sendResponse({ ok: false });
            break;
          }
          await closeWorkspaceTabWithChoice(tabId, workspaceId, removeWorkspace);
          sendResponse({ ok: true });
          break;
        }
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
          try {
            await finalizeWorkspaceDeletion(message.workspaceId);
            sendResponse({ ok: true });
          } catch {
            sendResponse({ ok: false });
          }
          break;
        case "flox:countWorkspaceOpenTabs": {
          const wsId = message.workspaceId as string;
          const exclude = message.excludeTabId as number;
          if (typeof wsId !== "string" || typeof exclude !== "number") {
            sendResponse({ ok: false });
            break;
          }
          const count = await countOpenTabsInWorkspace(wsId, exclude);
          sendResponse({ ok: true, count });
          break;
        }
        case "dashboard:assignTab":
          await moveTabToWorkspace(message.tabId, message.workspaceId ?? null);
          sendResponse({ ok: true });
          break;
        case "dashboard:focusTab": {
          const focusId = message.tabId as number;
          if (typeof focusId !== "number") {
            sendResponse({ ok: false });
            break;
          }
          await focusLiveTab(focusId);
          sendResponse({ ok: true });
          break;
        }
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
        case "dashboard:addSkipUrlRule": {
          const raw = typeof message.urlPattern === "string" ? message.urlPattern.trim() : "";
          if (!raw) {
            sendResponse({ ok: false });
            break;
          }
          let ws: string | null = null;
          if (message.workspaceId !== undefined && message.workspaceId !== null && message.workspaceId !== "") {
            const id = String(message.workspaceId);
            const wss = await getWorkspaces();
            if (!wss.some((w) => w.id === id)) {
              sendResponse({ ok: false });
              break;
            }
            ws = id;
          }
          await addSkipUrlRule({ urlPattern: raw, workspaceId: ws });
          await scanAndSyncAllTabs();
          sendResponse({ ok: true });
          break;
        }
        case "dashboard:updateSkipUrlRule": {
          const ruleId = typeof message.id === "string" ? message.id : "";
          if (!ruleId) {
            sendResponse({ ok: false });
            break;
          }
          const updates: Partial<{ urlPattern: string; workspaceId: string | null }> = {};
          if (typeof message.urlPattern === "string") {
            const trimmed = message.urlPattern.trim();
            if (!trimmed) {
              sendResponse({ ok: false });
              break;
            }
            updates.urlPattern = trimmed;
          }
          if ("workspaceId" in message) {
            if (message.workspaceId === null || message.workspaceId === undefined || message.workspaceId === "") {
              updates.workspaceId = null;
            } else {
              const id = String(message.workspaceId);
              const wss = await getWorkspaces();
              if (!wss.some((w) => w.id === id)) {
                sendResponse({ ok: false });
                break;
              }
              updates.workspaceId = id;
            }
          }
          try {
            await updateSkipUrlRule(ruleId, updates);
            await scanAndSyncAllTabs();
            sendResponse({ ok: true });
          } catch {
            sendResponse({ ok: false });
          }
          break;
        }
        case "dashboard:removeSkipUrlRule": {
          const ruleId = typeof message.id === "string" ? message.id : "";
          if (!ruleId) {
            sendResponse({ ok: false });
            break;
          }
          await removeSkipUrlRule(ruleId);
          await scanAndSyncAllTabs();
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
        case "content:disableAutoAssignPrompt":
          await setRuntimeSettingsPartial({ autoAssignPrompt: false });
          sendResponse({ ok: true });
          break;
        case "content:duplicateMerge": {
          const senderId = _sender.tab?.id;
          const otherId = typeof message.otherTabId === "number" ? message.otherTabId : null;
          if (typeof senderId === "number" && typeof otherId === "number" && senderId !== otherId) {
            const other = await chrome.tabs.get(otherId).catch(() => null);
            if (other && typeof other.windowId === "number") {
              await chrome.windows.update(other.windowId, { focused: true });
              await chrome.tabs.update(otherId, { active: true });
            }
            markTabsRemovedByFlox([senderId]);
            await chrome.tabs.remove(senderId).catch(() => undefined);
            await scanAndSyncAllTabs();
          }
          sendResponse({ ok: true });
          break;
        }
        case "content:duplicateKeepBoth": {
          const tabId = _sender.tab?.id;
          if (typeof tabId === "number") {
            const latest = await chrome.tabs.get(tabId).catch(() => null);
            if (latest) {
              await assignAndPersistTab(latest);
            }
          }
          sendResponse({ ok: true });
          break;
        }
        case "popup:fetchPinnedPreview":
        case "dashboard:fetchPinnedPreview": {
          const rawUrl = typeof message.url === "string" ? message.url.trim() : "";
          const preview = await fetchLinkPreview(rawUrl);
          sendResponse({ ok: true, title: preview.title, favIconUrl: preview.favIconUrl });
          break;
        }
        case "popup:addCurrentTabPinned": {
          const result = await tryAddPinnedFromActiveTab();
          if (result.ok) {
            sendResponse({ ok: true, link: result.link });
          } else {
            sendResponse({ ok: false, code: result.code });
          }
          break;
        }
        case "popup:addPinnedLink":
        case "dashboard:addPinnedLink": {
          try {
            const link = await addPinnedLink({
              url: typeof message.url === "string" ? message.url : "",
              title: typeof message.title === "string" ? message.title : "",
              favIconUrl: typeof message.favIconUrl === "string" ? message.favIconUrl : "",
              workspaceId: message.workspaceId === null ? null : (message.workspaceId as string | undefined) ?? null
            });
            await syncPinnedPageMenuForActiveTab();
            sendResponse({ ok: true, link });
          } catch (err) {
            const code = err instanceof Error && err.message === "PINNED_LIMIT" ? "pinned_limit" : "error";
            sendResponse({ ok: false, code });
          }
          break;
        }
        case "popup:updatePinnedLink":
        case "dashboard:updatePinnedLink": {
          const id = message.id as string;
          if (!id) {
            sendResponse({ ok: false });
            break;
          }
          await updatePinnedLink(id, {
            url: typeof message.url === "string" ? message.url : undefined,
            title: typeof message.title === "string" ? message.title : undefined,
            favIconUrl: typeof message.favIconUrl === "string" ? message.favIconUrl : undefined,
            workspaceId:
              message.workspaceId === undefined
                ? undefined
                : message.workspaceId === null
                  ? null
                  : (message.workspaceId as string)
          });
          await syncPinnedPageMenuForActiveTab();
          sendResponse({ ok: true });
          break;
        }
        case "popup:removePinnedLink":
        case "dashboard:removePinnedLink": {
          const id = message.id as string;
          if (!id) {
            sendResponse({ ok: false });
            break;
          }
          await removePinnedLink(id);
          await syncPinnedPageMenuForActiveTab();
          sendResponse({ ok: true });
          break;
        }
        case "dashboard:reorderPinnedLinks": {
          const ids = (message.orderedIds as string[] | undefined) ?? [];
          await reorderPinnedLinks(ids);
          sendResponse({ ok: true });
          break;
        }
        case "dashboard:openPinnedWorkspace":
        case "popup:openPinnedWorkspace": {
          const ws = message.workspaceId === null ? null : (message.workspaceId as string | undefined);
          const all = await getPinnedLinks();
          const subset =
            ws === null
              ? all.filter((l) => l.workspaceId === null)
              : typeof ws === "string"
                ? all.filter((l) => l.workspaceId === ws)
                : all;
          let first = true;
          for (const link of subset.sort((a, b) => a.order - b.order)) {
            if (!link.url.startsWith("http")) {
              continue;
            }
            await focusOrOpenUrl(link.url, first);
            first = false;
          }
          sendResponse({ ok: true });
          break;
        }
        case "dashboard:focusOrOpenUrl":
        case "popup:focusOrOpenUrl": {
          const rawUrl = typeof message.url === "string" ? message.url.trim() : "";
          const active = message.active !== false;
          if (!rawUrl) {
            sendResponse({ ok: false });
            break;
          }
          await focusOrOpenUrl(rawUrl, active);
          sendResponse({ ok: true });
          break;
        }
        case "content:addPinnedFromPage": {
          const tabId = _sender.tab?.id;
          if (typeof tabId !== "number") {
            sendResponse({ ok: false, code: "no_tab" });
            break;
          }
          const tab = await chrome.tabs.get(tabId).catch(() => null);
          if (!tab?.url || !tab.url.startsWith("http")) {
            sendResponse({ ok: false, code: "bad_url" });
            break;
          }
          const wsPick =
            message.workspaceId === null
              ? null
              : typeof message.workspaceId === "string"
                ? message.workspaceId
                : (await getTabRecords()).find((row) => row.tabId === tabId)?.workspaceId ?? null;
          try {
            await addPinnedLink({
              url: tab.url,
              title:
                typeof message.title === "string" && message.title.trim()
                  ? message.title.trim()
                  : (tab.title ?? tab.url),
              favIconUrl: tab.favIconUrl ?? "",
              workspaceId: wsPick
            });
            await syncPinnedPageMenuForActiveTab();
            sendResponse({ ok: true });
          } catch (err) {
            const code = err instanceof Error && err.message === "PINNED_LIMIT" ? "pinned_limit" : "error";
            sendResponse({ ok: false, code });
          }
          break;
        }
        case "content:createWorkspaceAndAssign": {
          const tabId = _sender.tab?.id;
          if (typeof tabId !== "number") {
            sendResponse({ ok: false, code: "no_tab" });
            break;
          }
          const tab = await chrome.tabs.get(tabId).catch(() => null);
          if (!tab?.url || !tab.url.startsWith("http")) {
            sendResponse({ ok: false, code: "bad_url" });
            break;
          }
          const unlimited = await checkFeature("unlimitedWorkspaces");
          const workspaceCount = (await getWorkspaces()).length;
          if (!unlimited && workspaceCount >= PLAN_LIMITS.FREE.maxWorkspaces) {
            sendResponse({ ok: false, code: "workspace_limit" });
            break;
          }
          const domain = getDomain(tab.url);
          const name = typeof message.name === "string" && message.name.trim() ? message.name.trim() : t("popupUntitledTask");
          const color = typeof message.color === "string" ? message.color : "#6366f1";
          const newWorkspace = await addWorkspace({
            name,
            color,
            urlPatterns: domain ? [domain] : []
          });
          await moveTabToWorkspace(tabId, newWorkspace.id);
          await refreshContextMenuTitle();
          await scanAndSyncAllTabs();
          sendResponse({ ok: true, workspaceId: newWorkspace.id });
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

  if (info.menuItemId === PINNED_SAVE_MENU_ID) {
    safeRun(async () => {
      if (tab) {
        await savePinnedFromTab(tab);
        await syncPinnedPageMenuForTab(tab);
      }
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
      let skipAssignPrompt = false;
      if (changeInfo.status === "complete" && typeof url === "string") {
        skipAssignPrompt = await maybeShowDuplicateTabPrompt(tabId, url);
      }
      if (updated) {
        await assignAndPersistTab(updated, { skipAssignPrompt });
        if (typeof changeInfo.url === "string" || changeInfo.status === "complete") {
          await syncPinnedPageMenuForTab(updated);
        }
      } else {
        await assignAndPersistTab({ ...tab, id: tabId, url: url ?? tab.url }, { skipAssignPrompt });
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  safeRun(async () => {
    if (floxInitiatedTabRemovals.has(tabId)) {
      floxInitiatedTabRemovals.delete(tabId);
      await removeTabRecord(tabId);
      await syncBadgeFromRecords();
      return;
    }

    const records = await getTabRecords();
    const victim = records.find((row) => row.tabId === tabId);
    const workspaceId = victim?.workspaceId ?? null;

    if (workspaceId) {
      const openTabs = await chrome.tabs.query({});
      const openIds = new Set(
        openTabs.map((tab) => tab.id).filter((id): id is number => typeof id === "number")
      );
      const othersOpenInWorkspace = records.filter(
        (row) => row.workspaceId === workspaceId && row.tabId !== tabId && openIds.has(row.tabId)
      );
      await removeTabRecord(tabId);
      await syncBadgeFromRecords();
      if (othersOpenInWorkspace.length === 0) {
        await notifyLastWorkspaceTabClosed(workspaceId);
      }
      return;
    }

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
    await syncPinnedPageMenuForTab(tab);
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
      return;
    }
    if (command === "save_pinned") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) {
        await savePinnedFromTab(activeTab);
        await syncPinnedPageMenuForTab(activeTab);
      }
    }
  });
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") {
    safeRun(refreshContextMenuTitle);
  }
});

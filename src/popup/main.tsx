// Apply persisted light/dark theme before React mounts to avoid FOUC.
(function bootFloxTheme() {
  const apply = (light: boolean) => {
    const h = document.documentElement;
    if (light) {
      h.classList.remove("dark");
      h.style.colorScheme = "light";
      document.body?.classList.remove("dark");
    } else {
      h.classList.add("dark");
      h.style.colorScheme = "dark";
      document.body?.classList.add("dark");
    }
  };
  try {
    const c = sessionStorage.getItem("flox.uiTheme.session");
    if (c === "light") apply(true);
    else if (c === "dark") apply(false);
  } catch {}
  try {
    chrome.storage.local.get("flox.uiTheme", (r) => {
      const light = r["flox.uiTheme"] === "light";
      apply(light);
      try {
        sessionStorage.setItem("flox.uiTheme.session", light ? "light" : "dark");
      } catch {}
    });
  } catch {}
})();

import React from "react";
import ReactDOM from "react-dom/client";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import "../styles.css";
import { getStoredLanguage, type LanguageCode, t } from "../utils/i18n";
import { checkFeature, MONETIZATION_ENABLED, PLAN_LIMITS } from "../utils/plan";
import { FloxLogo } from "../components/FloxLogo";
import {
  applyAccentHueToDocument,
  applyUiThemeToDocument,
  getStoredAccentHue,
  getStoredUiTheme,
  setStoredUiTheme,
  ACCENT_HUE_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  type UiTheme
} from "../utils/theme";

const PLACEHOLDER_FAVICON = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

interface PopupTabItem {
  tabId: number;
  workspaceId: string | null;
  url: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
}

interface PopupWorkspaceItem {
  id: string;
  name: string;
  color: string;
  urlPatterns: string[];
  tabCount: number;
  stashedCount: number;
  stashedAt: number | null;
  tabs: PopupTabItem[];
}

interface PinnedLinkSnapshotItem {
  id: string;
  url: string;
  title: string;
  favIconUrl: string;
  workspaceId: string | null;
  order: number;
  createdAt: number;
  domain: string;
}

interface PopupSnapshot {
  totalTabs: number;
  idleTabs: PopupTabItem[];
  unassignedTabs: PopupTabItem[];
  workspaces: PopupWorkspaceItem[];
  pinnedLinks: PinnedLinkSnapshotItem[];
}

const DEFAULT_SNAPSHOT: PopupSnapshot = {
  totalTabs: 0,
  idleTabs: [],
  unassignedTabs: [],
  workspaces: [],
  pinnedLinks: []
};

const WORKSPACE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#64748b"
];

function formatLastAccessed(lastAccessed: number, language: LanguageCode): string {
  const diffMs = Date.now() - lastAccessed;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  if (hours > 0) {
    return t("popupHoursAgo", [String(hours)], language);
  }
  if (minutes > 0) {
    return t("popupMinutesAgo", [String(minutes)], language);
  }
  return t("popupJustNow", undefined, language);
}

function formatIdleDuration(lastAccessed: number, language: LanguageCode): string {
  const diffMs = Math.max(0, Date.now() - lastAccessed);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return t("popupIdleDurationHm", ["0", String(minutes)], language);
  }
  return t("popupIdleDurationHm", [String(hours), String(minutes)], language);
}

function formatStashedAt(stashedAt: number, language: LanguageCode): string {
  return t("popupStashedAt", [formatLastAccessed(stashedAt, language)], language);
}

async function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  const trySend = () =>
    new Promise<TResponse>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as TResponse);
      });
    });

  try {
    return await trySend();
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return await trySend();
    } catch {
      throw firstError;
    }
  }
}

function TabList({
  tabs,
  language,
  onClose,
  closingTabIds
}: {
  tabs: PopupTabItem[];
  language: LanguageCode;
  onClose: (tabId: number) => Promise<void>;
  closingTabIds: Set<number>;
}) {
  if (tabs.length === 0) {
    return <p className="mt-2 text-xs text-[var(--muted)]">{t("popupNoTabs", undefined, language)}</p>;
  }

  const renderRow = ({ index, style }: ListChildComponentProps) => {
    const tab = tabs[index];
    return (
      <div
        style={style}
        className={`flex items-center gap-2 border-b border-[var(--line)] px-2 py-1 transition-all duration-150 ${
          closingTabIds.has(tab.tabId) ? "translate-y-1 opacity-0" : "opacity-100"
        }`}
      >
        <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-[var(--ink-2)]">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
          <p className="text-[10px] text-[var(--muted)]">{formatLastAccessed(tab.lastAccessed, language)}</p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onClose(tab.tabId);
          }}
          className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
        >
          {t("popupClose", undefined, language)}
        </button>
      </div>
    );
  };

  if (tabs.length > 100) {
    return (
      <FixedSizeList
        height={180}
        width="100%"
        itemCount={tabs.length}
        itemSize={42}
        className="mt-2 rounded border border-[var(--line)]"
      >
        {renderRow}
      </FixedSizeList>
    );
  }

  return (
    <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-[var(--line)]">
      {tabs.map((tab) => (
        <div
          key={tab.tabId}
          className={`flex items-center gap-2 border-b border-[var(--line)] px-2 py-1 transition-all duration-150 last:border-b-0 ${
            closingTabIds.has(tab.tabId) ? "translate-y-1 opacity-0" : "opacity-100"
          }`}
        >
          <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-[var(--ink-2)]">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
            <p className="text-[10px] text-[var(--muted)]">{formatLastAccessed(tab.lastAccessed, language)}</p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void onClose(tab.tabId);
            }}
            className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
          >
            {t("popupClose", undefined, language)}
          </button>
        </div>
      ))}
    </div>
  );
}

type IdleGroup = {
  key: string;
  workspaceId: string | null;
  name: string;
  color: string;
  tabs: PopupTabItem[];
};

function PopupApp() {
  const [language, setLanguage] = React.useState<LanguageCode>("auto");
  const [snapshot, setSnapshot] = React.useState<PopupSnapshot>(DEFAULT_SNAPSHOT);
  const [expandedUnassigned, setExpandedUnassigned] = React.useState(false);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = React.useState<string[]>([]);
  const [editorMounted, setEditorMounted] = React.useState(false);
  const [editorActive, setEditorActive] = React.useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = React.useState("");
  const [workspaceColorInput, setWorkspaceColorInput] = React.useState(WORKSPACE_COLORS[0]);
  const [workspacePatterns, setWorkspacePatterns] = React.useState<string[]>([]);
  const [patternInput, setPatternInput] = React.useState("");
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = React.useState<Set<number>>(new Set());
  const [debugButtonVisible, setDebugButtonVisible] = React.useState(false);
  const [closingIdleGroupKeys, setClosingIdleGroupKeys] = React.useState<Set<string>>(new Set());
  const [mainTab, setMainTab] = React.useState<"tabs" | "pinned">("tabs");
  const [pinnedEditor, setPinnedEditor] = React.useState<null | { mode: "add" } | { mode: "edit"; id: string }>(null);
  const [pinUrl, setPinUrl] = React.useState("");
  const [pinTitle, setPinTitle] = React.useState("");
  const [pinWorkspaceId, setPinWorkspaceId] = React.useState<string>("");
  const [pinFavIcon, setPinFavIcon] = React.useState("");
  const [pinFetchLoading, setPinFetchLoading] = React.useState(false);
  /** Pinned "…" menu: fixed position so it is not clipped by overflow-y-auto scroll areas. */
  const [pinnedMoreMenu, setPinnedMoreMenu] = React.useState<null | { id: string; top: number; left: number }>(null);
  const pinnedListScrollRef = React.useRef<HTMLDivElement>(null);
  const [lastWorkspaceTabPrompt, setLastWorkspaceTabPrompt] = React.useState<{
    tabId: number;
    workspaceId: string;
    workspaceLabel: string;
  } | null>(null);
  const [unassignedBulkDismissed, setUnassignedBulkDismissed] = React.useState(false);
  const [uiTheme, setUiTheme] = React.useState<UiTheme>("dark");

  React.useEffect(() => {
    if (snapshot.unassignedTabs.length === 0) {
      setUnassignedBulkDismissed(false);
    }
  }, [snapshot.unassignedTabs.length]);

  React.useEffect(() => {
    void getStoredLanguage().then(setLanguage);
    void refreshSnapshot();
  }, []);

  React.useEffect(() => {
    void getStoredUiTheme().then((theme) => {
      setUiTheme(theme);
      applyUiThemeToDocument(theme);
    });
    void getStoredAccentHue().then(applyAccentHueToDocument);
  }, []);

  React.useEffect(() => {
    const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName === "local") {
        void refreshSnapshot();
        const themeChange = changes[UI_THEME_STORAGE_KEY];
        if (themeChange?.newValue === "light" || themeChange?.newValue === "dark") {
          setUiTheme(themeChange.newValue);
          applyUiThemeToDocument(themeChange.newValue);
        }
        const hueChange = changes[ACCENT_HUE_STORAGE_KEY];
        if (hueChange?.newValue !== undefined) {
          const n = Number(hueChange.newValue);
          if (Number.isFinite(n)) applyAccentHueToDocument(n);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const toggleUiTheme = async () => {
    const next: UiTheme = uiTheme === "dark" ? "light" : "dark";
    await setStoredUiTheme(next);
    setUiTheme(next);
    applyUiThemeToDocument(next);
  };

  const openDashboard = async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard.html")
    });
  };

  const handlePinCurrentTab = async () => {
    setLoadingKey("pin-current-tab");
    try {
      const res = await sendMessage<{ ok: boolean; code?: string }>({ type: "popup:addCurrentTabPinned" });
      if (res.ok) {
        await refreshSnapshot();
        setMainTab("pinned");
        return;
      }
      if (res.code === "no_http") {
        window.alert(t("popupPinCurrentTabNoHttp", undefined, language));
      } else if (res.code === "already_pinned") {
        window.alert(t("popupPinCurrentTabAlready", undefined, language));
      } else if (res.code === "pinned_limit") {
        window.alert(t("pinnedUpgradeHint", [String(PLAN_LIMITS.FREE.maxPinnedLinks)], language));
      } else if (res.code === "no_tab") {
        window.alert(t("popupPinCurrentTabNoTab", undefined, language));
      } else {
        window.alert(t("popupPinCurrentTabError", undefined, language));
      }
    } finally {
      setLoadingKey(null);
    }
  };

  const refreshSnapshot = async () => {
    try {
      const response = await sendMessage<{ ok: boolean; data: PopupSnapshot }>({ type: "popup:getSnapshot" });
      if (response.ok) {
        setSnapshot(response.data);
      }
    } catch {
      // Background may still be spinning up; keep popup stable.
    }
  };

  const openPinnedOrFocusTab = (url: string) => {
    void sendMessage({ type: "popup:focusOrOpenUrl", url }).then(() => refreshSnapshot());
  };

  const executeCloseTab = async (tabId: number, mode: "close" | "delete_workspace", workspaceId?: string) => {
    setClosingTabIds((current) => new Set(current).add(tabId));
    setLoadingKey(`tab-${tabId}`);
    setSnapshot((current) => {
      const remove = (tabs: PopupTabItem[]) => tabs.filter((tab) => tab.tabId !== tabId);
      if (mode === "delete_workspace" && workspaceId) {
        return {
          totalTabs: Math.max(0, current.totalTabs - 1),
          idleTabs: remove(current.idleTabs),
          unassignedTabs: remove(current.unassignedTabs),
          pinnedLinks: current.pinnedLinks,
          workspaces: current.workspaces
            .filter((workspace) => workspace.id !== workspaceId)
            .map((workspace) => {
              const tabs = remove(workspace.tabs);
              return { ...workspace, tabs, tabCount: tabs.length };
            })
        };
      }
      return {
        totalTabs: Math.max(0, current.totalTabs - 1),
        idleTabs: remove(current.idleTabs),
        unassignedTabs: remove(current.unassignedTabs),
        pinnedLinks: current.pinnedLinks,
        workspaces: current.workspaces.map((workspace) => {
          const tabs = remove(workspace.tabs);
          return {
            ...workspace,
            tabs,
            tabCount: tabs.length
          };
        })
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      if (mode === "delete_workspace" && workspaceId) {
        await sendMessage({ type: "popup:closeWorkspaceTab", tabId, workspaceId, deleteWorkspace: true });
      } else {
        await sendMessage({ type: "popup:closeTab", tabId });
      }
      await refreshSnapshot();
    } finally {
      setLoadingKey(null);
      setClosingTabIds((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
    }
  };

  const handleCloseTabRequest = async (tabId: number): Promise<void> => {
    for (const workspace of snapshot.workspaces) {
      if (workspace.tabs.some((tab) => tab.tabId === tabId)) {
        const res = await sendMessage<{ ok: boolean; count?: number }>({
          type: "flox:countWorkspaceOpenTabs",
          workspaceId: workspace.id,
          excludeTabId: tabId
        });
        const otherOpen =
          res.ok && typeof res.count === "number"
            ? res.count
            : workspace.tabs.filter((t) => t.tabId !== tabId).length;
        if (otherOpen === 0) {
          setLastWorkspaceTabPrompt({
            tabId,
            workspaceId: workspace.id,
            workspaceLabel: t(workspace.name, undefined, language)
          });
          return;
        }
        break;
      }
    }
    await executeCloseTab(tabId, "close");
  };

  const idleGroups: IdleGroup[] = React.useMemo(() => {
    if (snapshot.idleTabs.length === 0) {
      return [];
    }
    const wsById = new Map(snapshot.workspaces.map((ws) => [ws.id, ws]));
    const buckets = new Map<string, IdleGroup>();
    for (const tab of snapshot.idleTabs) {
      const workspace = tab.workspaceId ? wsById.get(tab.workspaceId) : null;
      const key = tab.workspaceId ?? "unassigned";
      const name = workspace ? t(workspace.name, undefined, language) : t("popupIdleUnassigned", undefined, language);
      const color = workspace ? workspace.color : "#64748b";
      const existing = buckets.get(key);
      if (existing) {
        existing.tabs.push(tab);
      } else {
        buckets.set(key, { key, workspaceId: tab.workspaceId, name, color, tabs: [tab] });
      }
    }
    return [...buckets.values()]
      .map((group) => ({ ...group, tabs: [...group.tabs].sort((a, b) => a.lastAccessed - b.lastAccessed) }))
      .sort((a, b) => b.tabs.length - a.tabs.length);
  }, [snapshot.idleTabs, snapshot.workspaces, language]);

  const closeIdleTabsByGroup = async (group: IdleGroup) => {
    const count = group.tabs.length;
    const ok = window.confirm(t("popupIdleCloseWorkspaceConfirm", [group.name, String(count)], language));
    if (!ok) return;
    setClosingIdleGroupKeys((current) => new Set(current).add(group.key));
    setLoadingKey(`idle-close-${group.key}`);
    const tabIds = group.tabs.map((tab) => tab.tabId);
    try {
      await sendMessage({ type: "popup:closeTabs", tabIds });
      await refreshSnapshot();
    } finally {
      setLoadingKey(null);
      setClosingIdleGroupKeys((current) => {
        const next = new Set(current);
        next.delete(group.key);
        return next;
      });
    }
  };

  const closeIdleTabsAll = async () => {
    const count = snapshot.idleTabs.length;
    const ok = window.confirm(t("popupIdleCloseAllConfirm", [String(count)], language));
    if (!ok) return;
    setLoadingKey("idle-close-all");
    const tabIds = snapshot.idleTabs.map((tab) => tab.tabId);
    try {
      await sendMessage({ type: "popup:closeTabs", tabIds });
      await refreshSnapshot();
    } finally {
      setLoadingKey(null);
    }
  };

  const closeAllUnassignedTabs = async () => {
    const tabIds = snapshot.unassignedTabs.map((tab) => tab.tabId);
    if (tabIds.length === 0) {
      return;
    }
    setLoadingKey("unassigned-close-all");
    try {
      await sendMessage({ type: "popup:closeTabs", tabIds });
      await refreshSnapshot();
    } finally {
      setLoadingKey(null);
      setUnassignedBulkDismissed(true);
    }
  };

  const handleToggleWorkspaceExpanded = (workspaceId: string) => {
    setExpandedWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    );
  };

  const handleStashOrRestore = async (workspace: PopupWorkspaceItem) => {
    setLoadingKey(`workspace-${workspace.id}-stash`);
    if (workspace.stashedCount > 0 && workspace.tabCount === 0) {
      await sendMessage({ type: "popup:restoreWorkspace", workspaceId: workspace.id });
    } else {
      await sendMessage({ type: "popup:stashWorkspace", workspaceId: workspace.id });
    }
    await refreshSnapshot();
    setLoadingKey(null);
  };

  const handleCloseWorkspaceTabs = async (workspaceId: string) => {
    if (!window.confirm(t("popupConfirmCloseWorkspace", undefined, language))) {
      return;
    }
    setLoadingKey(`workspace-${workspaceId}-close`);
    await sendMessage({ type: "popup:closeWorkspaceTabs", workspaceId });
    await refreshSnapshot();
    setLoadingKey(null);
  };

  const handleNewTask = async () => {
    const canCreateUnlimited = await checkFeature("unlimitedWorkspaces");
    if (!canCreateUnlimited && snapshot.workspaces.length >= PLAN_LIMITS.FREE.maxWorkspaces) {
      window.alert(t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)], language));
      return;
    }
    setEditingWorkspaceId(null);
    setWorkspaceNameInput("");
    setWorkspaceColorInput(WORKSPACE_COLORS[0]);
    setWorkspacePatterns([]);
    setPatternInput("");
    setEditorMounted(true);
    requestAnimationFrame(() => setEditorActive(true));
  };

  const openEditorForWorkspace = (workspace: PopupWorkspaceItem) => {
    setEditingWorkspaceId(workspace.id);
    setWorkspaceNameInput(t(workspace.name, undefined, language));
    setWorkspaceColorInput(workspace.color);
    setWorkspacePatterns(workspace.urlPatterns);
    setPatternInput("");
    setEditorMounted(true);
    requestAnimationFrame(() => setEditorActive(true));
  };

  const closeEditor = () => {
    setEditorActive(false);
    setTimeout(() => {
      setEditorMounted(false);
      setEditingWorkspaceId(null);
    }, 180);
  };

  const addPatternTag = () => {
    const value = patternInput.trim();
    if (!value) {
      return;
    }
    if (!workspacePatterns.includes(value)) {
      setWorkspacePatterns((current) => [...current, value]);
    }
    setPatternInput("");
  };

  const saveWorkspaceForm = async () => {
    const name = workspaceNameInput.trim() || t("popupUntitledTask", undefined, language);
    const canCreateUnlimited = await checkFeature("unlimitedWorkspaces");
    if (!editingWorkspaceId && !canCreateUnlimited && snapshot.workspaces.length >= PLAN_LIMITS.FREE.maxWorkspaces) {
      window.alert(t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)], language));
      return;
    }

    if (editingWorkspaceId) {
      await sendMessage({
        type: "popup:updateWorkspace",
        workspaceId: editingWorkspaceId,
        name,
        color: workspaceColorInput,
        urlPatterns: workspacePatterns
      });
    } else {
      await sendMessage({
        type: "popup:addWorkspace",
        name,
        color: workspaceColorInput,
        urlPatterns: workspacePatterns
      });
    }

    await sendMessage({ type: "popup:rescanTabs" });
    await refreshSnapshot();
    closeEditor();
  };

  const deleteWorkspaceFromEditor = async () => {
    if (!editingWorkspaceId) {
      return;
    }
    if (!window.confirm(t("popupConfirmDeleteWorkspace", undefined, language))) {
      return;
    }
    await sendMessage({ type: "popup:deleteWorkspace", workspaceId: editingWorkspaceId });
    await sendMessage({ type: "popup:rescanTabs" });
    await refreshSnapshot();
    closeEditor();
  };

  const maxWorkspaceTabs = Math.max(1, ...snapshot.workspaces.map((workspace) => workspace.tabCount));

  const sortedPinned = React.useMemo(
    () => [...snapshot.pinnedLinks].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    [snapshot.pinnedLinks]
  );

  const pinnedMenuLink = React.useMemo(() => {
    if (!pinnedMoreMenu) {
      return null;
    }
    return sortedPinned.find((l) => l.id === pinnedMoreMenu.id) ?? null;
  }, [pinnedMoreMenu, sortedPinned]);

  React.useEffect(() => {
    if (!pinnedMoreMenu) {
      return;
    }
    const onDoc = (ev: MouseEvent) => {
      const path = ev.composedPath();
      const touches = (sel: string) =>
        path.some((n) => n instanceof Element && n.closest(`[${sel}]`));
      if (!touches("data-pinned-more-menu") && !touches("data-pinned-more-trigger")) {
        setPinnedMoreMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinnedMoreMenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedMoreMenu]);

  React.useEffect(() => {
    if (!pinnedMoreMenu) {
      return;
    }
    const el = pinnedListScrollRef.current;
    const onScroll = () => setPinnedMoreMenu(null);
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => el?.removeEventListener("scroll", onScroll);
  }, [pinnedMoreMenu]);

  const pinnedGroups = React.useMemo(() => {
    const byWs = new Map<string, PinnedLinkSnapshotItem[]>();
    for (const p of sortedPinned) {
      const key = p.workspaceId ?? "__general__";
      const arr = byWs.get(key) ?? [];
      arr.push(p);
      byWs.set(key, arr);
    }
    const rows: Array<{ key: string; label: string; color: string; links: PinnedLinkSnapshotItem[] }> = [];
    for (const ws of snapshot.workspaces) {
      const links = byWs.get(ws.id);
      if (links?.length) {
        rows.push({ key: ws.id, label: t(ws.name, undefined, language), color: ws.color, links });
      }
    }
    const general = byWs.get("__general__");
    if (general?.length) {
      rows.push({
        key: "__general__",
        label: t("pinnedGeneralGroup", undefined, language),
        color: "#64748b",
        links: general
      });
    }
    return rows;
  }, [sortedPinned, snapshot.workspaces, language]);

  const openPinnedAdd = () => {
    setPinUrl("");
    setPinTitle("");
    setPinWorkspaceId("");
    setPinFavIcon("");
    setPinnedEditor({ mode: "add" });
  };

  const openPinnedEdit = (link: PinnedLinkSnapshotItem) => {
    setPinUrl(link.url);
    setPinTitle(link.title);
    setPinWorkspaceId(link.workspaceId ?? "");
    setPinFavIcon(link.favIconUrl);
    setPinnedEditor({ mode: "edit", id: link.id });
    setPinnedMoreMenu(null);
  };

  const fetchPinPreview = async () => {
    const u = pinUrl.trim();
    if (!u.startsWith("http")) {
      return;
    }
    setPinFetchLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; title?: string; favIconUrl?: string }>({
        type: "popup:fetchPinnedPreview",
        url: u
      });
      if (res.ok) {
        setPinTitle((prev) => (prev.trim() ? prev : res.title ?? prev));
        if (res.favIconUrl) {
          setPinFavIcon(res.favIconUrl);
        }
      }
    } finally {
      setPinFetchLoading(false);
    }
  };

  const savePinnedForm = async () => {
    const unlimited = await checkFeature("unlimitedPinnedLinks");
    if (
      pinnedEditor?.mode === "add" &&
      !unlimited &&
      snapshot.pinnedLinks.length >= PLAN_LIMITS.FREE.maxPinnedLinks
    ) {
      window.alert(t("pinnedUpgradeHint", [String(PLAN_LIMITS.FREE.maxPinnedLinks)], language));
      return;
    }
    const url = pinUrl.trim();
    if (!url.startsWith("http")) {
      return;
    }
    if (pinnedEditor?.mode === "add") {
      const res = await sendMessage<{ ok: boolean; code?: string }>({
        type: "popup:addPinnedLink",
        url,
        title: pinTitle.trim() || url,
        favIconUrl: pinFavIcon,
        workspaceId: pinWorkspaceId || null
      });
      if (!res.ok && res.code === "pinned_limit") {
        window.alert(t("pinnedUpgradeHint", [String(PLAN_LIMITS.FREE.maxPinnedLinks)], language));
        return;
      }
    } else if (pinnedEditor?.mode === "edit") {
      await sendMessage({
        type: "popup:updatePinnedLink",
        id: pinnedEditor.id,
        url,
        title: pinTitle.trim() || url,
        favIconUrl: pinFavIcon,
        workspaceId: pinWorkspaceId || null
      });
    }
    setPinnedEditor(null);
    await refreshSnapshot();
  };

  const runDebugDump = async () => {
    await sendMessage({ type: "debug-dump" });
    await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  };

  return (
    <main className="h-[560px] w-[380px] overflow-y-auto bg-[var(--paper)] p-3 text-[var(--ink)] antialiased">
      <header className="sticky top-0 z-10 bg-[var(--paper)]/95 pb-2 backdrop-blur backdrop-saturate-150">
        <div className="flex items-center justify-between gap-2">
          <h1
            className="m-0 cursor-default p-0"
            onDoubleClick={() => setDebugButtonVisible((value) => !value)}
            aria-label={t("appName", undefined, language)}
          >
            <FloxLogo size="md" />
          </h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void toggleUiTheme()}
              className="tooltip-trigger inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--paper-2)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-3)]"
              aria-label={uiTheme === "dark" ? t("themeSwitchToLight", undefined, language) : t("themeSwitchToDark", undefined, language)}
              data-tooltip={uiTheme === "dark" ? t("themeSwitchToLight", undefined, language) : t("themeSwitchToDark", undefined, language)}
            >
              {uiTheme === "dark" ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={openDashboard}
              className="tooltip-trigger rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-xs font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--paper-2)]"
              data-tooltip={t("tooltipOpenDashboard", undefined, language)}
            >
              {t("popupOpenDashboard", undefined, language)}
            </button>
          </div>
        </div>
        {debugButtonVisible ? (
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => void runDebugDump()}
              className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--paper-3)]"
            >
              debug
            </button>
          </div>
        ) : null}
        <p className="mt-1 text-xs text-[var(--muted)]">{t("popupTotalTabs", [String(snapshot.totalTabs)], language)}</p>
        <div className="mt-2 flex gap-5 border-b border-[var(--line)] text-xs font-medium">
          <button
            type="button"
            className={`pb-2 ${mainTab === "tabs" ? "border-b-2 border-[var(--accent)] font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink-2)]"}`}
            onClick={() => {
              setPinnedMoreMenu(null);
              setMainTab("tabs");
            }}
          >
            {t("popupTabTabs", undefined, language)}
          </button>
          <button
            type="button"
            className={`pb-2 ${mainTab === "pinned" ? "border-b-2 border-[var(--accent)] font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink-2)]"}`}
            onClick={() => {
              setPinnedMoreMenu(null);
              setMainTab("pinned");
            }}
          >
            {t("popupTabPinned", undefined, language)}
          </button>
        </div>
        <button
          type="button"
          disabled={loadingKey === "pin-current-tab"}
          onClick={() => void handlePinCurrentTab()}
          className="tooltip-trigger mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm font-semibold text-[var(--ink)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--line)]/80 transition-colors hover:bg-[var(--paper-2)] active:bg-[var(--paper-3)] disabled:opacity-40 disabled:shadow-none"
          data-tooltip={t("commandSavePinned", undefined, language)}
        >
          {loadingKey === "pin-current-tab" ? (
            t("loading", undefined, language)
          ) : (
            <>
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17 3H7a2 2 0 0 0-2 2v16l7-3.33L19 21V5a2 2 0 0 0-2-2Z" />
              </svg>
              <span>{t("popupPinCurrentTab", undefined, language)}</span>
            </>
          )}
        </button>
      </header>

      {mainTab === "tabs" && snapshot.idleTabs.length > 0 ? (
        <section className="mt-2 rounded-lg border border-[var(--signal)]/35 bg-[var(--signal-soft)] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-0.5">
              {idleGroups.map((group) => {
                const isClosing = closingIdleGroupKeys.has(group.key);
                return (
                  <div
                    key={group.key}
                    className={`group relative flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--signal)]/30 bg-[var(--paper)] px-2 py-1 text-[11px] text-[var(--ink)] transition-all duration-150 ${
                      isClosing ? "translate-y-1 opacity-0" : "opacity-100"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                    <span className="max-w-[140px] truncate">{group.name}</span>
                    <span className="mono text-[var(--signal)]">{t("popupIdleChipCount", [String(group.tabs.length)], language)}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void closeIdleTabsByGroup(group);
                      }}
                      className="ml-1 rounded-full px-1 text-[var(--signal)] hover:bg-[var(--signal-soft)]"
                      aria-label="close"
                    >
                      ×
                    </button>

                    <div className="pointer-events-none absolute left-0 top-full z-30 hidden w-[320px] pt-2 group-hover:block">
                      <div className="relative rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3 shadow-[var(--shadow-md)]">
                        <div className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border border-[var(--line)] bg-[var(--paper)]" />
                        <p className="text-xs font-semibold text-[var(--ink)]">
                          {t("popupIdleTooltipTitle", [group.name, String(group.tabs.length)], language)}
                        </p>
                        <div className="mt-2 space-y-1.5">
                          {group.tabs.slice(0, 8).map((tab) => (
                            <div key={tab.tabId} className="flex items-center gap-2">
                              <img
                                src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
                                alt=""
                                className="h-4 w-4 rounded-sm"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] text-[var(--ink-2)]">
                                  {tab.title || t("popupUnknownTitle", undefined, language)}
                                </p>
                                <p className="text-[10px] text-[var(--muted)]">
                                  {t("popupIdleTooltipRow", [formatIdleDuration(tab.lastAccessed, language)], language)}
                                </p>
                              </div>
                            </div>
                          ))}
                          {group.tabs.length > 8 ? (
                            <p className="pt-1 text-[10px] text-[var(--muted)]">…</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void closeIdleTabsAll()}
              className="shrink-0 rounded-md border border-[var(--signal)]/40 bg-[var(--paper)] px-2 py-1 text-[11px] text-[var(--signal)] hover:opacity-90"
            >
              {loadingKey === "idle-close-all" ? t("loading", undefined, language) : t("popupIdleCleanAll", undefined, language)}
            </button>
          </div>
        </section>
      ) : null}

      {mainTab === "tabs" ? (
        <>
      <section className="mt-3">
        {snapshot.workspaces.map((workspace) => {
          const expanded = expandedWorkspaceIds.includes(workspace.id);
          const isStashed = workspace.stashedCount > 0 && workspace.tabCount === 0;
          return (
            <div
              key={workspace.id}
              className={`mb-2 rounded-lg border p-2 ${isStashed ? "border-[var(--line)] bg-[var(--paper)] opacity-70" : "border-[var(--line)] bg-[var(--paper-2)]"}`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.color }} />
                <button
                  type="button"
                  onClick={() => openEditorForWorkspace(workspace)}
                  className="truncate text-left text-sm font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
                >
                  {t(workspace.name, undefined, language)}
                </button>
                <span className="ml-auto text-[11px] text-[var(--muted)]">{workspace.tabCount}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--paper-3)] ring-1 ring-[var(--line)]/80">
                <div
                  className="h-full rounded"
                  style={{ width: `${(workspace.tabCount / maxWorkspaceTabs) * 100}%`, backgroundColor: workspace.color }}
                />
              </div>
              {isStashed ? (
                <div className="mt-1 text-[10px] text-[var(--muted)]">
                  <p>{t("popupStashedState", [String(workspace.stashedCount)], language)}</p>
                  {workspace.stashedAt ? <p>{formatStashedAt(workspace.stashedAt, language)}</p> : null}
                </div>
              ) : null}
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => void handleStashOrRestore(workspace)}
                  className="tooltip-trigger rounded border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-[var(--paper-3)]"
                  data-tooltip={t("tooltipStashShortcut", undefined, language)}
                >
                  {loadingKey === `workspace-${workspace.id}-stash` ? t("loading", undefined, language) : null}
                  {isStashed ? t("popupRestore", undefined, language) : t("popupStash", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCloseWorkspaceTabs(workspace.id)}
                  className="tooltip-trigger rounded border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-[var(--paper-3)]"
                  data-tooltip={t("tooltipCloseAllTabs", undefined, language)}
                >
                  {loadingKey === `workspace-${workspace.id}-close` ? t("loading", undefined, language) : null}
                  {t("popupCloseAll", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleWorkspaceExpanded(workspace.id)}
                  className="tooltip-trigger rounded border border-[var(--line)] px-2 py-1 text-[10px] hover:bg-[var(--paper-3)]"
                  data-tooltip={t("tooltipExpandList", undefined, language)}
                >
                  {expanded ? t("popupCollapse", undefined, language) : t("popupExpand", undefined, language)}
                </button>
              </div>
              <div className={`overflow-hidden transition-all duration-200 ${expanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
                    <TabList tabs={workspace.tabs} language={language} onClose={handleCloseTabRequest} closingTabIds={closingTabIds} />
              </div>
            </div>
          );
        })}
      </section>

      <footer className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpandedUnassigned((value) => !value)}
            className="flex min-w-0 flex-1 items-center justify-between text-left text-xs"
          >
            <span>{t("popupUnassigned", undefined, language)}</span>
            <span className="text-[var(--muted)]">{snapshot.unassignedTabs.length}</span>
          </button>
          {snapshot.unassignedTabs.length > 0 ? (
            <button
              type="button"
              onClick={() => void closeAllUnassignedTabs()}
              disabled={loadingKey === "unassigned-close-all"}
              className="shrink-0 rounded-md border border-[var(--signal)]/40 bg-[var(--signal-soft)] px-2 py-1 text-[10px] text-[var(--signal)] hover:opacity-90 disabled:opacity-50"
            >
              {loadingKey === "unassigned-close-all" ? t("loading", undefined, language) : t("popupUnassignedCloseAll", undefined, language)}
            </button>
          ) : null}
        </div>
        <div className={`overflow-hidden transition-all duration-200 ${expandedUnassigned ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
          <TabList tabs={snapshot.unassignedTabs} language={language} onClose={handleCloseTabRequest} closingTabIds={closingTabIds} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleNewTask()}
            className="tooltip-trigger rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--paper-3)]"
            data-tooltip={t("tooltipNewTask", undefined, language)}
          >
            {t("popupNewTask", undefined, language)}
          </button>
          <button
            type="button"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("feedback.html") })}
            className="tooltip-trigger text-[11px] text-cyan-300 hover:text-cyan-200"
            data-tooltip={t("feedbackLink", undefined, language)}
          >
            {t("feedbackLink", undefined, language)}
          </button>
        </div>
      </footer>
        </>
      ) : (
        <section className="mt-3 flex flex-1 flex-col">
          {pinnedGroups.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">{t("pinnedEmpty", undefined, language)}</p>
          ) : (
            <div ref={pinnedListScrollRef} className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
              {pinnedGroups.map((group) => (
                <div key={group.key}>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-[var(--ink-2)]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.label}
                  </div>
                  <ul className="space-y-1">
                    {group.links.map((link) => (
                      <li
                        key={link.id}
                        className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-[var(--accent)]"
                          onClick={() => openPinnedOrFocusTab(link.url)}
                        >
                          <img src={link.favIconUrl || PLACEHOLDER_FAVICON} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
                          <span className="truncate">{link.title || link.domain}</span>
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--paper-3)]"
                          onClick={() => openPinnedOrFocusTab(link.url)}
                        >
                          {t("pinnedOpen", undefined, language)}
                        </button>
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            data-pinned-more-trigger={link.id}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
                            aria-label={t("pinnedMore", undefined, language)}
                            aria-expanded={pinnedMoreMenu?.id === link.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const r = e.currentTarget.getBoundingClientRect();
                              const w = 128;
                              const pad = 4;
                              setPinnedMoreMenu((cur) => {
                                if (cur?.id === link.id) {
                                  return null;
                                }
                                const left = Math.min(
                                  Math.max(6, r.right - w),
                                  window.innerWidth - w - 6
                                );
                                return { id: link.id, top: r.bottom + pad, left };
                              });
                            }}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <circle cx="5" cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="mt-3 w-full rounded border border-[var(--line)] py-2 text-xs hover:bg-[var(--paper-2)]"
            onClick={() => openPinnedAdd()}
          >
            {t("pinnedAddLink", undefined, language)}
          </button>
        </section>
      )}

      {pinnedEditor ? (
        <div
          className="fixed inset-0 z-[35] flex items-center justify-center bg-[var(--ink)]/20 p-3 backdrop-blur-[2px]"
          onClick={() => setPinnedEditor(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-sm font-semibold text-[var(--ink)]">
              {pinnedEditor.mode === "add" ? t("pinnedAddLink", undefined, language) : t("pinnedEdit", undefined, language)}
            </p>
            <label className="mt-3 block text-[11px] text-[var(--muted)]">{t("pinnedUrl", undefined, language)}</label>
            <input
              value={pinUrl}
              onChange={(e) => setPinUrl(e.target.value)}
              onBlur={() => void fetchPinPreview()}
              disabled={pinnedEditor.mode === "edit"}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] disabled:opacity-60"
            />
            <label className="mt-2 block text-[11px] text-[var(--muted)]">{t("pinnedTitle", undefined, language)}</label>
            <input
              value={pinTitle}
              onChange={(e) => setPinTitle(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]"
            />
            <label className="mt-2 block text-[11px] text-[var(--muted)]">{t("pinnedWorkspace", undefined, language)}</label>
            <select
              value={pinWorkspaceId}
              onChange={(e) => setPinWorkspaceId(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]"
            >
              <option value="">{t("pinnedNone", undefined, language)}</option>
              {snapshot.workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {t(ws.name, undefined, language)}
                </option>
              ))}
            </select>
            {pinFetchLoading ? <p className="mt-2 text-[10px] text-[var(--muted)]">{t("loading", undefined, language)}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border border-[var(--line)] px-3 py-1.5 text-xs" onClick={() => setPinnedEditor(null)}>
                {t("pinnedCancel", undefined, language)}
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--paper-2)]"
                onClick={() => void savePinnedForm()}
              >
                {t("pinnedSave", undefined, language)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mainTab === "tabs" && snapshot.unassignedTabs.length > 0 && !unassignedBulkDismissed ? (
        <div
          className="fixed inset-0 z-[36] flex items-center justify-center bg-[var(--ink)]/20 p-3 backdrop-blur-[2px]"
          onClick={() => setUnassignedBulkDismissed(true)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-sm font-semibold text-[var(--ink)]">
              {t("popupUnassignedBulkTitle", [String(snapshot.unassignedTabs.length)], language)}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{t("popupUnassignedBulkHint", undefined, language)}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="rounded border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                onClick={() => setUnassignedBulkDismissed(true)}
              >
                {t("popupUnassignedRemindLater", undefined, language)}
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--signal)] bg-[var(--signal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                disabled={loadingKey === "unassigned-close-all"}
                onClick={() => void closeAllUnassignedTabs()}
              >
                {loadingKey === "unassigned-close-all" ? t("loading", undefined, language) : t("popupUnassignedCloseAll", undefined, language)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lastWorkspaceTabPrompt ? (
        <div
          className="fixed inset-0 z-[35] flex items-center justify-center bg-[var(--ink)]/20 p-3 backdrop-blur-[2px]"
          onClick={() => setLastWorkspaceTabPrompt(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-sm font-semibold text-[var(--ink)]">
              {t("lastWorkspaceTabTitle", [lastWorkspaceTabPrompt.workspaceLabel], language)}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{t("lastWorkspaceTabHint", undefined, language)}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="rounded border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                onClick={() => setLastWorkspaceTabPrompt(null)}
              >
                {t("lastWorkspaceTabCancel", undefined, language)}
              </button>
              <button
                type="button"
                className="rounded border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                onClick={() => {
                  const payload = lastWorkspaceTabPrompt;
                  setLastWorkspaceTabPrompt(null);
                  void executeCloseTab(payload.tabId, "close");
                }}
              >
                {t("lastWorkspaceTabCloseOnly", undefined, language)}
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--signal)] bg-[var(--signal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                onClick={() => {
                  const payload = lastWorkspaceTabPrompt;
                  setLastWorkspaceTabPrompt(null);
                  void executeCloseTab(payload.tabId, "delete_workspace", payload.workspaceId);
                }}
              >
                {t("lastWorkspaceTabDeleteWorkspace", undefined, language)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {MONETIZATION_ENABLED ? (
        <div className="mt-3 border-t border-[var(--line)] pt-2 text-center">
          <button
            type="button"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL(t("popupProPageUrl", undefined, language)) })}
            className="text-[11px] text-[var(--accent)] hover:underline"
          >
            {t("popupProCta", undefined, language)}
          </button>
        </div>
      ) : null}

      {editorMounted ? (
        <div
          className={`fixed inset-0 z-30 flex items-end justify-center bg-[var(--ink)]/20 p-3 backdrop-blur-[2px] transition-opacity duration-200 ${editorActive ? "opacity-100" : "opacity-0"}`}
          onClick={closeEditor}
        >
          <div
            className={`w-full rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3 transition-all duration-200 ${editorActive ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold">
              {editingWorkspaceId ? t("popupEditTaskTitle", undefined, language) : t("popupCreateTaskTitle", undefined, language)}
            </h3>

            <label className="mt-2 block text-[11px] text-[var(--ink-2)]">{t("popupTaskNameLabel", undefined, language)}</label>
            <input
              value={workspaceNameInput}
              onChange={(event) => setWorkspaceNameInput(event.target.value)}
              className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)]"
            />

            <p className="mt-3 text-[11px] text-[var(--ink-2)]">{t("popupTaskColorLabel", undefined, language)}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {WORKSPACE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setWorkspaceColorInput(color)}
                  className={`h-5 w-5 rounded-full border-2 ${workspaceColorInput === color ? "border-[var(--ink)]" : "border-[var(--line)]"}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <p className="mt-3 text-[11px] text-[var(--ink-2)]">{t("popupTaskRulesLabel", undefined, language)}</p>
            <div className="mt-1 flex flex-wrap gap-1 rounded border border-[var(--line)] bg-[var(--paper)] p-2">
              {workspacePatterns.map((pattern) => (
                <span key={pattern} className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--paper-3)] px-1.5 py-0.5 text-[10px] text-[var(--ink-2)]">
                  {pattern}
                  <button
                    type="button"
                    onClick={() => setWorkspacePatterns((current) => current.filter((item) => item !== pattern))}
                    className="text-[var(--muted)] hover:text-[var(--ink-2)]"
                  >
                    x
                  </button>
                </span>
              ))}
              <input
                value={patternInput}
                onChange={(event) => setPatternInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPatternTag();
                  }
                }}
                className="min-w-[120px] flex-1 bg-transparent text-xs outline-none"
                placeholder={t("popupRuleInputPlaceholder", undefined, language)}
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                {editingWorkspaceId ? (
                  <button
                    type="button"
                    onClick={() => void deleteWorkspaceFromEditor()}
                    className="rounded-md border border-[var(--signal)]/45 bg-[var(--signal-soft)] px-2 py-1 text-[11px] text-[var(--signal)]"
                  >
                    {t("deleteWorkspace", undefined, language)}
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeEditor} className="rounded border border-[var(--line)] px-2 py-1 text-[11px]">
                  {t("popupCancel", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => void saveWorkspaceForm()}
                  className="rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-[11px] font-medium text-[var(--ink)] shadow-[var(--shadow-sm)] hover:bg-[var(--paper-2)]"
                >
                  {t("popupSave", undefined, language)}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pinnedMoreMenu && pinnedMenuLink ? (
        <div
          data-pinned-more-menu
          className="fixed z-[50] min-w-[128px] rounded border border-[var(--line)] bg-[var(--paper-2)] py-1 shadow-lg"
          style={{ top: pinnedMoreMenu.top, left: pinnedMoreMenu.left }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-2 py-1 text-left text-[11px] hover:bg-[var(--paper-3)]"
            role="menuitem"
            onClick={() => openPinnedEdit(pinnedMenuLink)}
          >
            {t("pinnedEdit", undefined, language)}
          </button>
          <div className="border-t border-[var(--line)] px-2 py-1 text-[10px] text-[var(--muted)]">{t("pinnedMove", undefined, language)}</div>
          <select
            className="mx-2 mb-1 w-[calc(100%-16px)] rounded border border-[var(--line)] bg-[var(--paper)] px-1 py-0.5 text-[10px]"
            value={pinnedMenuLink.workspaceId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              void sendMessage({
                type: "popup:updatePinnedLink",
                id: pinnedMenuLink.id,
                workspaceId: v
              }).then(() => refreshSnapshot());
              setPinnedMoreMenu(null);
            }}
          >
            <option value="">{t("pinnedNone", undefined, language)}</option>
            {snapshot.workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {t(ws.name, undefined, language)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="block w-full px-2 py-1 text-left text-[11px] text-[var(--signal)] hover:bg-[var(--signal-soft)]"
            role="menuitem"
            onClick={() => {
              if (window.confirm(t("pinnedDelete", undefined, language))) {
                void sendMessage({ type: "popup:removePinnedLink", id: pinnedMenuLink.id }).then(() => refreshSnapshot());
              }
              setPinnedMoreMenu(null);
            }}
          >
            {t("pinnedDelete", undefined, language)}
          </button>
        </div>
      ) : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);

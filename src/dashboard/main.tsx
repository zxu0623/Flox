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
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FixedSizeList } from "react-window";
import "../styles.css";
import { getStoredLanguage, setStoredLanguage, type LanguageCode, t } from "../utils/i18n";
import { workspaceTemplates } from "../utils/templates";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { FloxLogo } from "../components/FloxLogo";
import { checkFeature, MONETIZATION_ENABLED, PLAN_LIMITS } from "../utils/plan";
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

type ViewKey =
  | "overview"
  | "unassigned"
  | "stashed"
  | "pinned"
  | "skipUrlList"
  | "taskGroups"
  | "stats"
  | "workspace"
  | "settings"
  | "pro";

interface TabItem {
  tabId: number;
  workspaceId: string | null;
  url: string;
  domain: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
}

interface PinnedLinkItem {
  id: string;
  url: string;
  title: string;
  favIconUrl: string;
  workspaceId: string | null;
  order: number;
  createdAt: number;
  domain: string;
}

interface PinnedStripItem {
  id: string;
  url: string;
  title: string;
  favIconUrl: string;
  workspaceId: string | null;
  domain: string;
}

interface SkipUrlRuleItem {
  id: string;
  urlPattern: string;
  workspaceId: string | null;
  createdAt: number;
}

interface WorkspaceItem {
  id: string;
  name: string;
  color: string;
  order: number;
  urlPatterns: string[];
  tabCount: number;
  stashedCount: number;
  stashedAt: number | null;
  tabs: TabItem[];
  savedTabs: Array<{ url: string; title: string; favIconUrl: string; domain: string }>;
  recentFavicons: string[];
  pinnedStrip: PinnedStripItem[];
  pinnedStripTotal: number;
}

interface DashboardSnapshot {
  totalTabs: number;
  idleTabs: TabItem[];
  unassignedTabs: TabItem[];
  workspaces: WorkspaceItem[];
  weekly: Array<{ day: string; counts: Array<{ workspaceId: string; value: number }> }>;
  usageRanking: Array<{ workspaceId: string; name: string; color: string; value: number }>;
  pinnedLinks: PinnedLinkItem[];
  skipUrlRules: SkipUrlRuleItem[];
}

const DEFAULT_DATA: DashboardSnapshot = {
  totalTabs: 0,
  idleTabs: [],
  unassignedTabs: [],
  workspaces: [],
  weekly: [],
  usageRanking: [],
  pinnedLinks: [],
  skipUrlRules: []
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

async function sendMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

function formatAgo(ts: number, language: LanguageCode): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h > 0) {
    return t("popupHoursAgo", [String(h)], language);
  }
  if (m > 0) {
    return t("popupMinutesAgo", [String(m)], language);
  }
  return t("popupJustNow", undefined, language);
}

function formatStashedAt(ts: number, language: LanguageCode): string {
  return t("popupStashedAt", [formatAgo(ts, language)], language);
}

function SortableWorkspaceItem({
  workspace,
  activeId,
  language,
  onSelect,
  selected
}: {
  workspace: WorkspaceItem;
  activeId: string | null;
  language: LanguageCode;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: workspace.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onSelect(workspace.id)}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors duration-100 ${selected ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.color }} />
      <span className="truncate">{t(workspace.name, undefined, language)}</span>
      <span className="ml-auto text-xs text-[var(--muted)]">{workspace.tabCount}</span>
      {workspace.stashedCount > 0 ? <span title={t("dashboardStashed", undefined, language)}>📦</span> : null}
      {activeId === workspace.id ? <span className="text-xs text-[var(--accent)]">•</span> : null}
    </button>
  );
}

function WorkspaceDropSlot({
  workspaceId,
  children
}: {
  workspaceId: string;
  children: React.ReactNode;
}) {
  const droppable = useDroppable({ id: `droppable:${workspaceId}` });
  return <div ref={droppable.setNodeRef}>{children}</div>;
}

function SortablePinCard({
  link,
  language,
  workspaceLabel,
  onOpen,
  onEdit,
  onDelete
}: {
  link: PinnedLinkItem;
  language: LanguageCode;
  workspaceLabel: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `pin:${link.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group relative rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-3 ${
        isDragging ? "z-10 opacity-90 ring-2 ring-[var(--accent)]/50" : ""
      }`}
    >
      <div className="flex gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-[var(--muted)] hover:text-[var(--ink-2)]"
          {...listeners}
          aria-label="Drag"
        >
          ⋮⋮
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <div className="flex items-start gap-2">
            <img
              src={
                link.favIconUrl ||
                "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
              }
              alt=""
              className="h-5 w-5 shrink-0 rounded-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--ink)]">{link.title}</p>
              <p className="truncate text-xs text-[var(--muted)]">{link.domain}</p>
              <span className="mt-1 inline-block rounded bg-[var(--paper-3)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{workspaceLabel}</span>
            </div>
          </div>
        </button>
      </div>
      <div className="mt-2 hidden flex-wrap gap-2 group-hover:flex">
        <button type="button" className="rounded border border-[var(--line)] px-2 py-0.5 text-xs" onClick={onOpen}>
          {t("pinnedOpen", undefined, language)}
        </button>
        <button type="button" className="rounded border border-[var(--line)] px-2 py-0.5 text-xs" onClick={onEdit}>
          {t("pinnedEdit", undefined, language)}
        </button>
        <button type="button" className="rounded border border-rose-300 dark:border-rose-800 px-2 py-0.5 text-xs text-rose-800 dark:text-rose-300" onClick={onDelete}>
          {t("pinnedDelete", undefined, language)}
        </button>
      </div>
    </div>
  );
}

function TabCard({
  tab,
  language,
  onClose,
  onMove,
  onGoToTab,
  isClosing
}: {
  tab: TabItem;
  language: LanguageCode;
  onClose: (tabId: number) => void;
  onMove: (tabId: number) => void;
  onGoToTab?: (tabId: number) => void;
  isClosing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `tab:${tab.tabId}`, data: { tabId: tab.tabId } });
  const style = { transform: CSS.Translate.toString(transform) };
  const staleMs = Date.now() - tab.lastAccessed;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-md)] ${
        isClosing ? "translate-y-1 opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-[var(--muted)] hover:text-[var(--ink-2)]"
          {...listeners}
          {...attributes}
          aria-label="Drag"
        >
          ⋮⋮
        </button>
        {onGoToTab ? (
          <button
            type="button"
            className="min-w-0 flex-1 rounded text-left outline-none ring-[var(--accent)]/0 hover:ring-[var(--accent)] focus-visible:ring-[var(--accent)]"
            onClick={() => onGoToTab(tab.tabId)}
          >
            <img
              src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
              alt=""
              className="mb-1 h-4 w-4 rounded-sm"
            />
            <p className="truncate text-sm text-[var(--ink)]">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
            <p className="truncate text-xs text-[var(--accent)]/90 hover:underline">{tab.domain}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{formatAgo(tab.lastAccessed, language)}</p>
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <img
              src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
              alt=""
              className="mb-1 h-4 w-4 rounded-sm"
            />
            <p className="truncate text-sm text-[var(--ink)]">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
            <p className="truncate text-xs text-[var(--muted)]">{tab.domain}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{formatAgo(tab.lastAccessed, language)}</p>
          </div>
        )}
        <div className="hidden flex-col gap-1 group-hover:flex">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMove(tab.tabId);
            }}
            className="text-xs text-[var(--accent)]"
          >
            {t("dashboardMoveTo", undefined, language)}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.tabId);
            }}
            className="text-xs text-rose-800 dark:text-rose-300"
          >
            {t("popupClose", undefined, language)}
          </button>
        </div>
      </div>
      {staleMs > 4 * 60 * 60 * 1000 ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-800 dark:text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" />{t("dashboardIdleLong", undefined, language)}</p>
      ) : staleMs > 60 * 60 * 1000 ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--signal)]"><span className="h-2 w-2 rounded-full bg-[var(--signal)]" />{t("dashboardIdleShort", undefined, language)}</p>
      ) : null}
    </div>
  );
}

function DashboardApp() {
  const [language, setLanguage] = React.useState<LanguageCode>("auto");
  const [data, setData] = React.useState<DashboardSnapshot>(DEFAULT_DATA);
  const [view, setView] = React.useState<ViewKey>("overview");
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);
  const [expandedStashed, setExpandedStashed] = React.useState<string[]>([]);
  const [overviewExpandedWorkspaceIds, setOverviewExpandedWorkspaceIds] = React.useState<string[]>([]);
  const [draggingWorkspaceId, setDraggingWorkspaceId] = React.useState<string | null>(null);
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = React.useState<Set<number>>(new Set());
  const [lastWorkspaceTabPrompt, setLastWorkspaceTabPrompt] = React.useState<{
    tabId: number;
    workspaceId: string;
    workspaceLabel: string;
  } | null>(null);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [onboardingStep, setOnboardingStep] = React.useState(1);
  const [onboardingTemplates, setOnboardingTemplates] = React.useState<string[]>([]);
  const [onboardingCustomName, setOnboardingCustomName] = React.useState("");
  const [onboardingCustomWorkspaces, setOnboardingCustomWorkspaces] = React.useState<string[]>([]);
  const [batchAssignment, setBatchAssignment] = React.useState<Record<number, string>>({});
  const [settings, setSettings] = React.useState({
    idleThresholdMinutes: 120,
    tabWarningThreshold: 20,
    autoCreateTabGroup: true,
    autoMoveAssignedTabs: false,
    autoAssignPrompt: true
  });
  const [ignoredDomains, setIgnoredDomains] = React.useState<string[]>([]);
  const [skipUrlNewPattern, setSkipUrlNewPattern] = React.useState("");
  const [skipUrlNewWorkspaceId, setSkipUrlNewWorkspaceId] = React.useState("");
  const [importPreview, setImportPreview] = React.useState<string>("");
  const [feedbackLoading, setFeedbackLoading] = React.useState(false);
  const [pinnedEditor, setPinnedEditor] = React.useState<null | { mode: "add" } | { mode: "edit"; id: string }>(null);
  const [pinUrl, setPinUrl] = React.useState("");
  const [pinTitle, setPinTitle] = React.useState("");
  const [pinWorkspaceId, setPinWorkspaceId] = React.useState("");
  const [pinFavIcon, setPinFavIcon] = React.useState("");
  const [pinFetchLoading, setPinFetchLoading] = React.useState(false);
  const [hasStatisticsAccess, setHasStatisticsAccess] = React.useState(true);
  const [workspaceEditorOpen, setWorkspaceEditorOpen] = React.useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = React.useState("");
  const [workspaceColorInput, setWorkspaceColorInput] = React.useState(WORKSPACE_COLORS[0]);
  const [workspacePatterns, setWorkspacePatterns] = React.useState<string[]>([]);
  const [patternInput, setPatternInput] = React.useState("");
  const [uiTheme, setUiTheme] = React.useState<UiTheme>("dark");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  React.useEffect(() => {
    void checkFeature("statistics").then(setHasStatisticsAccess);
  }, []);

  React.useEffect(() => {
    void getStoredUiTheme().then((theme) => {
      setUiTheme(theme);
      applyUiThemeToDocument(theme);
    });
    void getStoredAccentHue().then(applyAccentHueToDocument);
  }, []);

  React.useEffect(() => {
    void (async () => {
      if (new URLSearchParams(window.location.search).get("section") === "pro") {
        setView("pro");
      }
      const lang = await getStoredLanguage();
      setLanguage(lang);
      const storageValues = await chrome.storage.local.get(["flox.settings", "flox.onboardingCompleted"]);
      const savedSettings = storageValues["flox.settings"] as Partial<typeof settings> | undefined;
      if (savedSettings) {
        setSettings({
          idleThresholdMinutes: savedSettings.idleThresholdMinutes ?? 120,
          tabWarningThreshold: savedSettings.tabWarningThreshold ?? 20,
          autoCreateTabGroup: savedSettings.autoCreateTabGroup !== false,
          autoMoveAssignedTabs: savedSettings.autoMoveAssignedTabs === true,
          autoAssignPrompt: savedSettings.autoAssignPrompt !== false
        });
      }
      const ignoredResponse = await sendMessage<{ ok: boolean; data: string[] }>({ type: "dashboard:getIgnoredDomains" });
      if (ignoredResponse.ok) {
        setIgnoredDomains(ignoredResponse.data);
      }
      setShowOnboarding(storageValues["flox.onboardingCompleted"] !== true);
      await loadData();
    })();
  }, []);

  React.useEffect(() => {
    const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, areaName) => {
      if (areaName === "local") {
        void loadData();
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

  const loadData = async () => {
    const response = await sendMessage<{ ok: boolean; data: DashboardSnapshot }>({ type: "dashboard:getData" });
    if (response.ok) {
      setData(response.data);
      const ids = new Set(response.data.workspaces.map((w) => w.id));
      setActiveWorkspaceId((current) => {
        if (current && ids.has(current)) {
          return current;
        }
        return response.data.workspaces[0]?.id ?? null;
      });
    }
  };

  const selectedWorkspace = data.workspaces.find((item) => item.id === activeWorkspaceId) ?? null;

  const sortedPinnedDisplay = React.useMemo(
    () => [...data.pinnedLinks].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    [data.pinnedLinks]
  );

  const pinnedSortIds = React.useMemo(
    () => sortedPinnedDisplay.map((p) => `pin:${p.id}`),
    [sortedPinnedDisplay]
  );

  const getPinnedWorkspaceLabel = (link: PinnedLinkItem) => {
    if (!link.workspaceId) {
      return t("pinnedGeneralGroup", undefined, language);
    }
    const ws = data.workspaces.find((w) => w.id === link.workspaceId);
    return ws ? t(ws.name, undefined, language) : t("pinnedGeneralGroup", undefined, language);
  };

  const openPinnedAddDashboard = () => {
    setPinUrl("");
    setPinTitle("");
    setPinWorkspaceId("");
    setPinFavIcon("");
    setPinnedEditor({ mode: "add" });
  };

  const openPinnedEditDashboard = (link: PinnedLinkItem) => {
    setPinUrl(link.url);
    setPinTitle(link.title);
    setPinWorkspaceId(link.workspaceId ?? "");
    setPinFavIcon(link.favIconUrl);
    setPinnedEditor({ mode: "edit", id: link.id });
  };

  const fetchPinPreviewDashboard = async () => {
    const u = pinUrl.trim();
    if (!u.startsWith("http")) {
      return;
    }
    setPinFetchLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; title?: string; favIconUrl?: string }>({
        type: "dashboard:fetchPinnedPreview",
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

  const savePinnedFormDashboard = async () => {
    const unlimited = await checkFeature("unlimitedPinnedLinks");
    if (
      pinnedEditor?.mode === "add" &&
      !unlimited &&
      data.pinnedLinks.length >= PLAN_LIMITS.FREE.maxPinnedLinks
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
        type: "dashboard:addPinnedLink",
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
        type: "dashboard:updatePinnedLink",
        id: pinnedEditor.id,
        url,
        title: pinTitle.trim() || url,
        favIconUrl: pinFavIcon,
        workspaceId: pinWorkspaceId || null
      });
    }
    setPinnedEditor(null);
    await loadData();
  };

  const addWorkspacePatternTag = () => {
    const value = patternInput.trim();
    if (!value || workspacePatterns.includes(value)) {
      return;
    }
    setWorkspacePatterns((current) => [...current, value]);
    setPatternInput("");
  };

  const openNewWorkspace = async () => {
    const canCreateUnlimited = await checkFeature("unlimitedWorkspaces");
    if (!canCreateUnlimited && data.workspaces.length >= PLAN_LIMITS.FREE.maxWorkspaces) {
      window.alert(t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)], language));
      return;
    }
    setEditingWorkspaceId(null);
    setWorkspaceNameInput("");
    setWorkspaceColorInput(WORKSPACE_COLORS[0]);
    setWorkspacePatterns([]);
    setPatternInput("");
    setWorkspaceEditorOpen(true);
  };

  const openEditWorkspace = (workspace: WorkspaceItem) => {
    setEditingWorkspaceId(workspace.id);
    setWorkspaceNameInput(t(workspace.name, undefined, language));
    setWorkspaceColorInput(workspace.color);
    setWorkspacePatterns(workspace.urlPatterns ?? []);
    setPatternInput("");
    setWorkspaceEditorOpen(true);
  };

  const closeWorkspaceEditor = () => {
    setWorkspaceEditorOpen(false);
    setEditingWorkspaceId(null);
  };

  const saveWorkspaceFormDashboard = async () => {
    const name = workspaceNameInput.trim() || t("popupUntitledTask", undefined, language);
    const canCreateUnlimited = await checkFeature("unlimitedWorkspaces");
    if (!editingWorkspaceId && !canCreateUnlimited && data.workspaces.length >= PLAN_LIMITS.FREE.maxWorkspaces) {
      window.alert(t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)], language));
      return;
    }
    if (editingWorkspaceId) {
      await sendMessage({
        type: "dashboard:updateWorkspace",
        workspaceId: editingWorkspaceId,
        name,
        color: workspaceColorInput,
        urlPatterns: workspacePatterns
      });
    } else {
      await sendMessage({
        type: "dashboard:addWorkspace",
        name,
        color: workspaceColorInput,
        urlPatterns: workspacePatterns
      });
    }
    await sendMessage({ type: "dashboard:rescanTabs" });
    await loadData();
    closeWorkspaceEditor();
  };

  const deleteWorkspaceFromEditor = async () => {
    const id = editingWorkspaceId;
    if (!id) {
      return;
    }
    if (!window.confirm(t("popupConfirmDeleteWorkspace", undefined, language))) {
      return;
    }
    await sendMessage({ type: "dashboard:deleteWorkspace", workspaceId: id });
    await sendMessage({ type: "dashboard:rescanTabs" });
    await loadData();
    closeWorkspaceEditor();
    if (activeWorkspaceId === id) {
      setView("overview");
    }
  };

  const deleteWorkspaceQuick = async (workspaceId: string) => {
    if (!window.confirm(t("popupConfirmDeleteWorkspace", undefined, language))) {
      return;
    }
    setLoadingKey(`del-ws-${workspaceId}`);
    try {
      await sendMessage({ type: "dashboard:deleteWorkspace", workspaceId });
      await sendMessage({ type: "dashboard:rescanTabs" });
      await loadData();
      if (activeWorkspaceId === workspaceId) {
        setActiveWorkspaceId(null);
        setView("taskGroups");
      }
    } finally {
      setLoadingKey(null);
    }
  };

  const reassignAllOpenTabsForWorkspace = async (fromWorkspaceId: string, toWorkspaceId: string | null) => {
    const ws = data.workspaces.find((w) => w.id === fromWorkspaceId);
    if (!ws || ws.tabs.length === 0) {
      window.alert(t("dashboardReassignAllNoTabs", undefined, language));
      return;
    }
    const fromLabel = t(ws.name, undefined, language);
    const toLabel =
      toWorkspaceId === null
        ? t("dashboardNavUnassigned", undefined, language)
        : t(data.workspaces.find((w) => w.id === toWorkspaceId)!.name, undefined, language);
    if (!window.confirm(t("dashboardReassignAllTabsConfirm", [fromLabel, toLabel], language))) {
      return;
    }
    setLoadingKey(`reassign-all-${fromWorkspaceId}`);
    try {
      for (const tab of ws.tabs) {
        await sendMessage({ type: "dashboard:assignTab", tabId: tab.tabId, workspaceId: toWorkspaceId });
      }
      await sendMessage({ type: "dashboard:rescanTabs" });
      await loadData();
    } finally {
      setLoadingKey(null);
    }
  };

  const openPinnedOrFocusTab = (url: string) => {
    void sendMessage({ type: "dashboard:focusOrOpenUrl", url }).then(() => loadData());
  };

  const executeCloseSingleTab = async (tabId: number, mode: "close" | "delete_workspace", workspaceId?: string) => {
    setClosingTabIds((current) => new Set(current).add(tabId));
    setData((current) => {
      const strip = (tabs: TabItem[]) => tabs.filter((tab) => tab.tabId !== tabId);
      if (mode === "delete_workspace" && workspaceId) {
        return {
          ...current,
          totalTabs: Math.max(0, current.totalTabs - 1),
          unassignedTabs: strip(current.unassignedTabs),
          workspaces: current.workspaces
            .filter((w) => w.id !== workspaceId)
            .map((workspace) => {
              const tabs = strip(workspace.tabs);
              return { ...workspace, tabs, tabCount: tabs.length };
            })
        };
      }
      return {
        ...current,
        totalTabs: Math.max(0, current.totalTabs - 1),
        unassignedTabs: strip(current.unassignedTabs),
        workspaces: current.workspaces.map((workspace) => {
          const tabs = strip(workspace.tabs);
          return { ...workspace, tabs, tabCount: tabs.length };
        })
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      if (mode === "delete_workspace" && workspaceId) {
        await sendMessage({ type: "dashboard:closeWorkspaceTab", tabId, workspaceId, deleteWorkspace: true });
      } else {
        await sendMessage({ type: "dashboard:closeTab", tabId });
      }
      await loadData();
    } finally {
      setClosingTabIds((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
    }
  };

  const handleCloseTabRequest = async (tabId: number) => {
    if (view === "workspace" && selectedWorkspace && selectedWorkspace.tabs.some((tab) => tab.tabId === tabId)) {
      const res = await sendMessage<{ ok: boolean; count?: number }>({
        type: "flox:countWorkspaceOpenTabs",
        workspaceId: selectedWorkspace.id,
        excludeTabId: tabId
      });
      const otherOpen =
        res.ok && typeof res.count === "number"
          ? res.count
          : selectedWorkspace.tabs.filter((t) => t.tabId !== tabId).length;
      if (otherOpen === 0) {
        setLastWorkspaceTabPrompt({
          tabId,
          workspaceId: selectedWorkspace.id,
          workspaceLabel: t(selectedWorkspace.name, undefined, language)
        });
        return;
      }
    }
    void executeCloseSingleTab(tabId, "close");
  };

  const handleDragEnd = async (event: { active: { id: string }; over: { id: string } | null }) => {
    if (!event.over) {
      setDraggingWorkspaceId(null);
      return;
    }
    const overId = String(event.over.id);
    const activeId = String(event.active.id);
    if (activeId.startsWith("pin:")) {
      if (overId.startsWith("pin:")) {
        const oldIndex = pinnedSortIds.indexOf(activeId);
        const newIndex = pinnedSortIds.indexOf(overId);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          const next = arrayMove(pinnedSortIds, oldIndex, newIndex).map((s) => s.replace("pin:", ""));
          await sendMessage({ type: "dashboard:reorderPinnedLinks", orderedIds: next });
          await loadData();
        }
        setDraggingWorkspaceId(null);
        return;
      }
      if (overId.startsWith("droppable:")) {
        const raw = overId.replace("droppable:", "");
        const workspaceId = raw === "unassigned" ? null : raw;
        const linkId = activeId.replace("pin:", "");
        await sendMessage({
          type: "dashboard:updatePinnedLink",
          id: linkId,
          workspaceId
        });
        await loadData();
        setDraggingWorkspaceId(null);
        return;
      }
      setDraggingWorkspaceId(null);
      return;
    }
    if (String(event.active.id).startsWith("tab:")) {
      const tabId = Number(String(event.active.id).replace("tab:", ""));
      const target = String(overId);
      const workspaceId = target === "droppable:unassigned" ? null : target.replace("droppable:", "");
      await sendMessage({ type: "dashboard:assignTab", tabId, workspaceId });
      await sendMessage({ type: "dashboard:rescanTabs" });
      await loadData();
      return;
    }
    if (!data.workspaces.find((item) => item.id === event.active.id) || !data.workspaces.find((item) => item.id === overId)) {
      return;
    }
    const ids = data.workspaces.map((w) => w.id);
    const oldIndex = ids.indexOf(event.active.id);
    const newIndex = ids.indexOf(overId);
    const next = arrayMove(ids, oldIndex, newIndex);
    await sendMessage({ type: "dashboard:reorderWorkspaces", workspaceIds: next });
    await loadData();
  };

  const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value as LanguageCode;
    await setStoredLanguage(nextLanguage);
    setLanguage(nextLanguage);
    await chrome.runtime.sendMessage({ type: "flox-language-updated" }).catch(() => undefined);
  };

  const maxCount = Math.max(1, ...data.workspaces.map((w) => w.tabCount));

  const focusLiveTab = (tabId: number) => {
    void sendMessage({ type: "dashboard:focusTab", tabId });
  };

  const toggleOverviewWorkspaceCard = (workspaceId: string) => {
    setOverviewExpandedWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    );
  };

  const viewDroppable = useDroppable({ id: "droppable:unassigned" });

  const saveSettings = async (next: typeof settings) => {
    setSettings(next);
    await chrome.storage.local.set({ "flox.settings": next });
    await sendMessage({ type: "dashboard:rescanTabs" });
  };

  const reloadIgnoredDomains = async () => {
    const ignoredResponse = await sendMessage<{ ok: boolean; data: string[] }>({ type: "dashboard:getIgnoredDomains" });
    if (ignoredResponse.ok) setIgnoredDomains(ignoredResponse.data);
  };

  const addSkipUrlRuleRow = async () => {
    const pattern = skipUrlNewPattern.trim();
    if (!pattern) {
      return;
    }
    const res = await sendMessage<{ ok: boolean }>({
      type: "dashboard:addSkipUrlRule",
      urlPattern: pattern,
      workspaceId: skipUrlNewWorkspaceId === "" ? null : skipUrlNewWorkspaceId
    });
    if (res.ok) {
      setSkipUrlNewPattern("");
      setSkipUrlNewWorkspaceId("");
      await loadData();
    }
  };

  const exportConfig = async () => {
    const text = JSON.stringify(
      {
        workspaces: data.workspaces.map((workspace) => ({
          name: workspace.name,
          color: workspace.color,
          urlPatterns: workspace.urlPatterns ?? []
        }))
      },
      null,
      2
    );
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flox-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async () => {
    if (!importPreview) {
      return;
    }
    if (!window.confirm(t("settingsImportConfirm", undefined, language))) {
      return;
    }
    const parsed = JSON.parse(importPreview) as { workspaces?: Array<{ name: string; color: string; urlPatterns: string[] }> };
    const incoming = parsed.workspaces ?? [];
    for (const workspace of incoming) {
      await sendMessage({
        type: "dashboard:addWorkspace",
        name: workspace.name,
        color: workspace.color,
        urlPatterns: workspace.urlPatterns ?? []
      });
    }
    await loadData();
  };

  const resetAllData = async () => {
    if (!window.confirm(t("settingsResetConfirm", undefined, language))) {
      return;
    }
    await chrome.storage.local.clear();
    await chrome.runtime.sendMessage({ type: "flox-language-updated" }).catch(() => undefined);
    window.location.reload();
  };

  const completeOnboarding = async () => {
    await chrome.storage.local.set({ floxOnboardingCompleted: true, "flox.onboardingCompleted": true });
    setShowOnboarding(false);
  };

  const runOnboardingTemplateCreation = async () => {
    for (const templateId of onboardingTemplates) {
      const template = workspaceTemplates.find((item) => item.id === templateId);
      if (!template) continue;
      await sendMessage({
        type: "dashboard:addWorkspace",
        name: template.name,
        color: template.color,
        urlPatterns: template.urlPatterns
      });
    }
    for (const customName of onboardingCustomWorkspaces) {
      await sendMessage({
        type: "dashboard:addWorkspace",
        name: customName,
        color: "#6366f1",
        urlPatterns: []
      });
    }
    await loadData();
  };

  const applyBatchAssignments = async () => {
    const entries = Object.entries(batchAssignment);
    for (const [tabId, workspaceId] of entries) {
      if (!workspaceId) continue;
      await sendMessage({ type: "dashboard:assignTab", tabId: Number(tabId), workspaceId });
    }
    await sendMessage({ type: "dashboard:rescanTabs" });
    await loadData();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setDraggingWorkspaceId(String(event.active.id))}
      onDragEnd={async (event) => {
        await handleDragEnd({ active: { id: String(event.active.id) }, over: event.over ? { id: String(event.over.id) } : null });
        setDraggingWorkspaceId(null);
      }}
    >
      <main className="flex min-h-screen bg-[var(--paper)] text-[var(--ink)] antialiased">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--paper-2)] p-3">
          <div className="mb-4 flex items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <h1 className="m-0 p-0" aria-label={t("appName", undefined, language)}>
                <FloxLogo size="lg" />
              </h1>
              <p className="text-[11px] text-[var(--muted)]">{t("tagline", undefined, language)}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleUiTheme()}
              className="tooltip-trigger inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-3)] hover:text-[var(--accent)]"
              aria-label={uiTheme === "dark" ? t("themeSwitchToLight", undefined, language) : t("themeSwitchToDark", undefined, language)}
              data-tooltip={uiTheme === "dark" ? t("themeSwitchToLight", undefined, language) : t("themeSwitchToDark", undefined, language)}
            >
              {uiTheme === "dark" ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </button>
          </div>

          <div className="space-y-0.5 text-[13px]">
            <button type="button" onClick={() => setView("overview")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "overview" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("dashboardNavOverview", undefined, language)}</button>
            <button type="button" onClick={() => setView("unassigned")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "unassigned" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("dashboardNavUnassigned", undefined, language)}</button>
            <button type="button" onClick={() => setView("stashed")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "stashed" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("dashboardNavStashed", undefined, language)}</button>
            <button type="button" onClick={() => setView("stats")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "stats" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("dashboardNavStats", undefined, language)}</button>
            <button type="button" onClick={() => setView("pinned")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "pinned" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("dashboardNavPinned", undefined, language)}</button>
            <button
              type="button"
              onClick={() => setView("skipUrlList")}
              className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "skipUrlList" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}
            >
              {t("dashboardNavAssignPromptSkip", undefined, language)}
            </button>
            <button
              type="button"
              onClick={() => setView("taskGroups")}
              className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "taskGroups" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}
            >
              {t("dashboardNavTaskGroups", undefined, language)}
            </button>
            <button type="button" onClick={() => setView("settings")} className={`w-full rounded-md px-2.5 py-1.5 text-left font-medium transition-colors duration-100 ${view === "settings" ? "bg-[var(--paper-3)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--paper-3)]/80 hover:text-[var(--ink)]"}`}>{t("settingsTitle", undefined, language)}</button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto">
            <div className="mb-2 flex items-start justify-between gap-2 px-1">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">{t("workspaceListTitle", undefined, language)}</h2>
            </div>
            <button
              type="button"
              onClick={() => void openNewWorkspace()}
              className="tooltip-trigger mb-2 w-full rounded-md border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-left text-[13px] text-[var(--muted)] transition-colors duration-100 hover:border-[var(--line-strong)] hover:bg-[var(--paper-3)]/40 hover:text-[var(--ink)]"
              data-tooltip={t("tooltipNewTask", undefined, language)}
            >
              {t("dashboardNewTaskButton", undefined, language)}
            </button>
            <SortableContext items={data.workspaces.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {data.workspaces.map((workspace) => (
                  <WorkspaceDropSlot key={`drop-${workspace.id}`} workspaceId={workspace.id}>
                    <SortableWorkspaceItem
                      workspace={workspace}
                      activeId={activeWorkspaceId}
                      language={language}
                      onSelect={(id) => {
                        setActiveWorkspaceId(id);
                        setView("workspace");
                      }}
                      selected={view === "workspace" && activeWorkspaceId === workspace.id}
                    />
                  </WorkspaceDropSlot>
                ))}
              </div>
            </SortableContext>
          </div>

          <div className="mt-2 border-t border-[var(--line)] pt-3">
            <label className="text-[11px] text-[var(--muted)]">{t("languageLabel", undefined, language)}</label>
            <select value={language} onChange={handleLanguageChange} className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-[12px] text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40">
              <option value="auto">{t("languageAuto", undefined, language)}</option>
              <option value="en">{t("languageEnglish", undefined, language)}</option>
              <option value="zh_CN">{t("languageChinese", undefined, language)}</option>
            </select>
          </div>
          {MONETIZATION_ENABLED ? (
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-3 py-2 text-left text-[13px] font-medium text-[var(--accent-ink)] transition-colors duration-100 hover:opacity-90"
              onClick={() => {
                setView("pro");
                const next = new URL(window.location.href);
                next.searchParams.set("section", "pro");
                window.history.replaceState({}, "", next.pathname + next.search);
              }}
            >
              {t("dashboardUpgradePro", undefined, language)}
            </button>
          ) : null}
        </aside>

        <section className="flex-1 overflow-y-auto p-6 min-w-0">
          {view === "overview" ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardNavOverview", undefined, language)}</h2>
                <button
                  type="button"
                  onClick={() => void openNewWorkspace()}
                  className="tooltip-trigger rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  data-tooltip={t("tooltipNewTask", undefined, language)}
                >
                  {t("dashboardNewTaskButton", undefined, language)}
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {data.workspaces.map((workspace) => (
                  <div key={`bar-${workspace.id}`}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{t(workspace.name, undefined, language)}</span>
                      <span>{workspace.tabCount}</span>
                    </div>
                    <div className="h-3 rounded bg-[var(--paper-3)]">
                      <div className="h-full rounded" style={{ width: `${(workspace.tabCount / maxCount) * 100}%`, backgroundColor: workspace.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.workspaces.length === 0 ? (
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink-2)]">
                    <p>{t("dashboardNoWorkspace", undefined, language)}</p>
                    <button
                      type="button"
                      onClick={() => void openNewWorkspace()}
                      className="tooltip-trigger mt-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      data-tooltip={t("tooltipNewTask", undefined, language)}
                    >
                      {t("dashboardNewTaskButton", undefined, language)}
                    </button>
                  </div>
                ) : data.workspaces.map((workspace) => {
                  const overviewOpen = overviewExpandedWorkspaceIds.includes(workspace.id);
                  return (
                    <div key={`card-${workspace.id}`} className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-3">
                      <button
                        type="button"
                        onClick={() => toggleOverviewWorkspaceCard(workspace.id)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: workspace.color }} />
                          {t(workspace.name, undefined, language)}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                          <span>{workspace.tabCount}</span>
                          <svg
                            className={`h-3 w-3 shrink-0 text-[var(--muted)] transition-transform duration-150 ${overviewOpen ? "rotate-90" : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </span>
                      </button>
                      <div className="mt-3 flex gap-2">
                        {workspace.recentFavicons.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">{t("popupNoTabs", undefined, language)}</span>
                        ) : (
                          workspace.recentFavicons.map((icon, index) => (
                            <img key={`${workspace.id}-ico-${index}`} src={icon} alt="" className="h-5 w-5 rounded" />
                          ))
                        )}
                      </div>
                      {overviewOpen ? (
                        <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
                          {workspace.tabs.length === 0 ? (
                            <p className="text-xs text-[var(--muted)]">{t("popupNoTabs", undefined, language)}</p>
                          ) : (
                            workspace.tabs.map((tab) => (
                              <div
                                key={`ov-tab-${workspace.id}-${tab.tabId}`}
                                className="flex flex-col gap-2 rounded border border-[var(--line)] bg-[var(--paper)]/80 p-2 sm:flex-row sm:items-center"
                              >
                                <button
                                  type="button"
                                  onClick={() => focusLiveTab(tab.tabId)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-sm text-[var(--ink)]">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
                                  <p className="truncate text-xs text-[var(--accent)]/90 hover:underline">{tab.url || tab.domain}</p>
                                </button>
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    className="max-w-[160px] rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs"
                                    defaultValue=""
                                    onChange={(event) => {
                                      const el = event.currentTarget;
                                      const v = el.value;
                                      el.value = "";
                                      if (!v) {
                                        return;
                                      }
                                      void sendMessage({
                                        type: "dashboard:assignTab",
                                        tabId: tab.tabId,
                                        workspaceId: v === "__unassigned__" ? null : v
                                      }).then(loadData);
                                    }}
                                  >
                                    <option value="">{t("dashboardReassignTo", undefined, language)}</option>
                                    <option value="__unassigned__">{t("dashboardNavUnassigned", undefined, language)}</option>
                                    {data.workspaces
                                      .filter((ws) => ws.id !== workspace.id)
                                      .map((ws) => (
                                        <option key={`ov-move-${tab.tabId}-${ws.id}`} value={ws.id}>
                                          {t(ws.name, undefined, language)}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="rounded border border-[var(--line-strong)] px-2 py-1 text-xs text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                                    onClick={() =>
                                      void sendMessage({ type: "dashboard:assignTab", tabId: tab.tabId, workspaceId: null }).then(loadData)
                                    }
                                  >
                                    {t("dashboardRemoveFromWorkspace", undefined, language)}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {view === "pinned" ? (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("pinnedPageTitle", undefined, language)}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-[var(--muted)]">{t("pinnedTotal", [String(data.pinnedLinks.length)], language)}</span>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-1 text-sm font-medium text-white hover:opacity-90"
                    onClick={() => openPinnedAddDashboard()}
                  >
                    {t("pinnedAddLink", undefined, language)}
                  </button>
                </div>
              </div>
              <div className="mb-6 flex flex-wrap gap-2">
                {data.workspaces.map((ws) => (
                  <button
                    key={`open-pins-${ws.id}`}
                    type="button"
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--paper-3)]"
                    onClick={() => void sendMessage({ type: "dashboard:openPinnedWorkspace", workspaceId: ws.id }).then(loadData)}
                  >
                    {t("pinnedOpenAll", undefined, language)} · {t(ws.name, undefined, language)}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--paper-3)]"
                  onClick={() => void sendMessage({ type: "dashboard:openPinnedWorkspace", workspaceId: null }).then(loadData)}
                >
                  {t("pinnedOpenAll", undefined, language)} · {t("pinnedGeneralGroup", undefined, language)}
                </button>
              </div>
              {sortedPinnedDisplay.length === 0 ? (
                <p className="text-[var(--muted)]">{t("pinnedEmpty", undefined, language)}</p>
              ) : (
                <SortableContext items={pinnedSortIds} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {sortedPinnedDisplay.map((link) => (
                      <SortablePinCard
                        key={link.id}
                        link={link}
                        language={language}
                        workspaceLabel={getPinnedWorkspaceLabel(link)}
                        onOpen={() => openPinnedOrFocusTab(link.url)}
                        onEdit={() => openPinnedEditDashboard(link)}
                        onDelete={() => {
                          if (window.confirm(t("pinnedDelete", undefined, language))) {
                            void sendMessage({ type: "dashboard:removePinnedLink", id: link.id }).then(loadData);
                          }
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          ) : null}

          {view === "skipUrlList" ? (
            <div className="max-w-4xl space-y-6">
              <div>
                <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardSkipUrlListTitle", undefined, language)}</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">{t("dashboardSkipUrlListIntro", undefined, language)}</p>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--paper-2)]">
                <div className="flex flex-wrap items-end gap-3 border-b border-[var(--line)] p-3">
                  <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-[var(--muted)]">
                    <span>{t("dashboardSkipUrlListColumnUrl", undefined, language)}</span>
                    <input
                      value={skipUrlNewPattern}
                      onChange={(event) => setSkipUrlNewPattern(event.target.value)}
                      placeholder={t("dashboardSkipUrlListPatternPlaceholder", undefined, language)}
                      className="rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                    />
                  </label>
                  <label className="flex min-w-[180px] flex-col gap-1 text-xs text-[var(--muted)]">
                    <span>{t("dashboardSkipUrlListColumnTask", undefined, language)}</span>
                    <select
                      value={skipUrlNewWorkspaceId}
                      onChange={(event) => setSkipUrlNewWorkspaceId(event.target.value)}
                      className="rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                    >
                      <option value="">{t("dashboardSkipUrlListNoWorkspace", undefined, language)}</option>
                      {data.workspaces.map((ws) => (
                        <option key={`skip-new-ws-${ws.id}`} value={ws.id}>
                          {t(ws.name, undefined, language)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    onClick={() => void addSkipUrlRuleRow()}
                  >
                    {t("dashboardSkipUrlListAdd", undefined, language)}
                  </button>
                </div>
                {data.skipUrlRules.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted)]">{t("dashboardSkipUrlListEmpty", undefined, language)}</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)] bg-[var(--paper)]/80 text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-3 py-2 font-medium">{t("dashboardSkipUrlListColumnUrl", undefined, language)}</th>
                        <th className="px-3 py-2 font-medium">{t("dashboardSkipUrlListColumnTask", undefined, language)}</th>
                        <th className="px-3 py-2 font-medium">{t("dashboardSkipUrlListColumnActions", undefined, language)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.skipUrlRules.map((rule) => (
                        <tr key={rule.id} className="border-b border-[var(--line)]">
                          <td className="px-3 py-2 align-middle">
                            <input
                              key={`${rule.id}-${rule.urlPattern}`}
                              defaultValue={rule.urlPattern}
                              onBlur={(event) => {
                                const v = event.target.value.trim();
                                if (!v || v === rule.urlPattern) {
                                  return;
                                }
                                void sendMessage({ type: "dashboard:updateSkipUrlRule", id: rule.id, urlPattern: v }).then(loadData);
                              }}
                              className="w-full min-w-[160px] rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 font-mono text-xs text-[var(--ink)]"
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <select
                              value={rule.workspaceId ?? ""}
                              onChange={(event) => {
                                const v = event.target.value;
                                void sendMessage({
                                  type: "dashboard:updateSkipUrlRule",
                                  id: rule.id,
                                  workspaceId: v === "" ? null : v
                                }).then(loadData);
                              }}
                              className="max-w-[240px] rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink)]"
                            >
                              <option value="">{t("dashboardSkipUrlListNoWorkspace", undefined, language)}</option>
                              {data.workspaces.map((ws) => (
                                <option key={`skip-sel-${rule.id}-${ws.id}`} value={ws.id}>
                                  {t(ws.name, undefined, language)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <button
                              type="button"
                              className="rounded border border-[var(--line-strong)] px-2 py-1 text-xs text-[var(--ink-2)] hover:bg-[var(--paper-3)]"
                              onClick={() => {
                                if (window.confirm(t("pinnedDelete", undefined, language))) {
                                  void sendMessage({ type: "dashboard:removeSkipUrlRule", id: rule.id }).then(loadData);
                                }
                              }}
                            >
                              {t("dashboardSkipUrlListRemove", undefined, language)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-xs text-[var(--muted)]">{t("dashboardSkipUrlListSettingsHint", undefined, language)}</p>
              <button type="button" className="text-xs text-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setView("settings")}>
                {t("dashboardTaskGroupsOpenSettings", undefined, language)}
              </button>
            </div>
          ) : null}

          {view === "taskGroups" ? (
            <div className="max-w-4xl space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardNavTaskGroups", undefined, language)}</h2>
                  <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t("dashboardTaskGroupsIntro", undefined, language)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void openNewWorkspace()}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  {t("dashboardNewTaskButton", undefined, language)}
                </button>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)]/60 p-3 text-sm text-[var(--ink-2)]">
                <p>{t("dashboardTaskGroupsPromptNavHint", undefined, language)}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
                  onClick={() => setView("skipUrlList")}
                >
                  {t("dashboardNavAssignPromptSkip", undefined, language)} →
                </button>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <h3 className="text-sm font-semibold text-[var(--ink)]">{t("workspaceListTitle", undefined, language)}</h3>
                {data.workspaces.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">{t("dashboardNoWorkspace", undefined, language)}</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {data.workspaces.map((workspace) => (
                      <div
                        key={`tg-${workspace.id}`}
                        className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--paper)]/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveWorkspaceId(workspace.id);
                            setView("workspace");
                          }}
                          className="flex min-w-0 items-center gap-2 text-left hover:text-[var(--accent)]"
                        >
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: workspace.color }} />
                          <span className="truncate font-medium text-[var(--ink)]">{t(workspace.name, undefined, language)}</span>
                          <span className="shrink-0 text-xs text-[var(--muted)]">{workspace.tabCount}</span>
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--paper-3)]"
                            onClick={() => openEditWorkspace(workspace)}
                          >
                            {t("popupEditTaskTitle", undefined, language)}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-rose-300 dark:border-rose-800/60 px-2 py-1 text-xs text-rose-900 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-950/40 disabled:opacity-50"
                            disabled={loadingKey === `del-ws-${workspace.id}`}
                            onClick={() => void deleteWorkspaceQuick(workspace.id)}
                          >
                            {loadingKey === `del-ws-${workspace.id}` ? t("loading", undefined, language) : t("deleteWorkspace", undefined, language)}
                          </button>
                          <select
                            className="max-w-[220px] rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs"
                            defaultValue=""
                            key={`reassign-bulk-${workspace.id}-${workspace.tabCount}`}
                            disabled={Boolean(loadingKey?.startsWith("reassign-all-"))}
                            onChange={(event) => {
                              const v = event.target.value;
                              const el = event.currentTarget;
                              el.value = "";
                              if (!v) {
                                return;
                              }
                              void reassignAllOpenTabsForWorkspace(workspace.id, v === "__unassigned__" ? null : v);
                            }}
                          >
                            <option value="" disabled>
                              {t("dashboardReassignAllOpenTabs", undefined, language)}
                            </option>
                            <option value="__unassigned__">{t("dashboardNavUnassigned", undefined, language)}</option>
                            {data.workspaces
                              .filter((w) => w.id !== workspace.id)
                              .map((w) => (
                                <option key={`tg-opt-${workspace.id}-${w.id}`} value={w.id}>
                                  {t(w.name, undefined, language)}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {view === "workspace" && selectedWorkspace ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedWorkspace.color }} />
                  <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t(selectedWorkspace.name, undefined, language)}</h2>
                  <span className="text-sm text-[var(--muted)]">{selectedWorkspace.tabCount}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditWorkspace(selectedWorkspace)}
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--paper-3)]"
                  >
                    {t("popupEditTaskTitle", undefined, language)}
                  </button>
                  <button className="tooltip-trigger rounded border border-[var(--line)] px-2 py-1 text-xs" data-tooltip={t("tooltipExpandList", undefined, language)}>{t("popupExpand", undefined, language)}</button>
                  <button
                    type="button"
                    onClick={() => void (async () => {
                      setLoadingKey(`stash-${selectedWorkspace.id}`);
                      await sendMessage({ type: "dashboard:stashWorkspace", workspaceId: selectedWorkspace.id });
                      await loadData();
                      setLoadingKey(null);
                    })()}
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                  >
                    {loadingKey === `stash-${selectedWorkspace.id}` ? t("loading", undefined, language) : t("popupStash", undefined, language)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void (async () => {
                      if (!window.confirm(t("popupConfirmCloseWorkspace", undefined, language))) return;
                      setLoadingKey(`close-${selectedWorkspace.id}`);
                      await sendMessage({ type: "dashboard:closeWorkspaceTabs", workspaceId: selectedWorkspace.id });
                      await loadData();
                      setLoadingKey(null);
                    })()}
                    className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                  >
                    {loadingKey === `close-${selectedWorkspace.id}` ? t("loading", undefined, language) : t("popupCloseAll", undefined, language)}
                  </button>
                </div>
              </div>
              {selectedWorkspace.pinnedStripTotal > 0 ? (
                <div className="mb-4 border-t border-[var(--line)] pt-4">
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-[var(--muted)]">
                    <span>📌 {t("popupTabPinned", undefined, language)}</span>
                    {selectedWorkspace.pinnedStripTotal > 5 ? (
                      <button type="button" className="normal-case text-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setView("pinned")}>
                        {t("pinnedViewAll", undefined, language)}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedWorkspace.pinnedStrip.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openPinnedOrFocusTab(p.url)}
                        className="flex max-w-[200px] items-center gap-2 rounded border border-[var(--line)] bg-[var(--paper-2)] px-2 py-1 text-left text-xs hover:border-[var(--line-strong)]"
                      >
                        <img
                          src={p.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm"
                        />
                        <span className="truncate">{p.title || p.domain}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedWorkspace.tabs.length > 100 ? (
                <FixedSizeList
                  height={640}
                  width="100%"
                  itemCount={selectedWorkspace.tabs.length}
                  itemSize={128}
                  itemData={selectedWorkspace.tabs}
                >
                  {({ index, style, data: rows }) => (
                    <div style={style} className="p-1">
                      <TabCard
                        tab={rows[index]}
                        language={language}
                        onClose={(id) => void handleCloseTabRequest(id)}
                        onMove={(id) => {
                          const target = window.prompt(t("dashboardMoveTo", undefined, language));
                          const workspace = data.workspaces.find((item) => t(item.name, undefined, language) === target || item.id === target);
                          if (workspace) {
                            void sendMessage({ type: "dashboard:assignTab", tabId: id, workspaceId: workspace.id }).then(loadData);
                          }
                        }}
                        onGoToTab={(id) => focusLiveTab(id)}
                        isClosing={closingTabIds.has(rows[index].tabId)}
                      />
                    </div>
                  )}
                </FixedSizeList>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedWorkspace.tabs.length === 0 ? (
                    <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-6 text-center text-[var(--ink-2)]">
                      <svg viewBox="0 0 120 80" className="mx-auto h-20 w-20 text-[var(--muted)]"><rect x="20" y="28" width="80" height="36" rx="6" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M20 38h80" stroke="currentColor" strokeWidth="2"/></svg>
                      <p className="mt-2 text-sm">{t("dashboardWorkspaceEmpty", undefined, language)}</p>
                    </div>
                  ) : selectedWorkspace.tabs.map((tab) => (
                    <TabCard
                      key={tab.tabId}
                      tab={tab}
                      language={language}
                      onClose={(id) => void handleCloseTabRequest(id)}
                      onMove={(id) => {
                        const target = window.prompt(t("dashboardMoveTo", undefined, language));
                        const workspace = data.workspaces.find((item) => t(item.name, undefined, language) === target || item.id === target);
                        if (workspace) {
                          void sendMessage({ type: "dashboard:assignTab", tabId: id, workspaceId: workspace.id }).then(loadData);
                        }
                      }}
                      onGoToTab={(id) => focusLiveTab(id)}
                      isClosing={closingTabIds.has(tab.tabId)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {view === "unassigned" ? (
            <div ref={viewDroppable.setNodeRef} className={`rounded-lg border p-4 ${viewDroppable.isOver ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--paper-2)]/60"}`}>
              <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardNavUnassigned", undefined, language)}</h2>
              {data.unassignedTabs.length === 0 ? (
                <p className="mt-3 text-[var(--ink-2)]">{t("dashboardAllClassified", undefined, language)}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.unassignedTabs.map((tab) => (
                    <div key={`ua-${tab.tabId}`} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--paper-2)] p-2">
                      <button
                        type="button"
                        onClick={() => focusLiveTab(tab.tabId)}
                        title={t("dashboardSwitchToTab", undefined, language)}
                        className="flex min-w-0 flex-1 items-start gap-2 rounded text-left outline-none ring-[var(--accent)]/0 hover:bg-[var(--paper-3)]/80 focus-visible:ring-[var(--accent)]"
                      >
                        <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-[var(--ink)]">{tab.title || t("popupUnknownTitle", undefined, language)}</span>
                          <span className="block truncate text-xs text-[var(--accent)]/90">{tab.url || tab.domain}</span>
                        </span>
                      </button>
                      <select
                        className="rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs"
                        defaultValue=""
                        onChange={(event) => {
                          const el = event.currentTarget;
                          const v = el.value;
                          if (!v) {
                            return;
                          }
                          el.value = "";
                          if (v === "__close__") {
                            void handleCloseTabRequest(tab.tabId);
                            return;
                          }
                          void sendMessage({ type: "dashboard:assignTab", tabId: tab.tabId, workspaceId: v }).then(loadData);
                        }}
                      >
                        <option value="__close__">{t("popupClose", undefined, language)}</option>
                        <option value="">{t("dashboardMoveTo", undefined, language)}</option>
                        {data.workspaces.map((workspace) => (
                          <option key={`move-${workspace.id}`} value={workspace.id}>{t(workspace.name, undefined, language)}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {view === "stashed" ? (
            <div>
              <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardNavStashed", undefined, language)}</h2>
              <div className="mt-4 space-y-3">
                {data.workspaces.filter((workspace) => workspace.stashedCount > 0).length === 0 ? (
                  <p className="text-[var(--ink-2)]">{t("dashboardStashedEmpty", undefined, language)}</p>
                ) : data.workspaces.filter((workspace) => workspace.stashedCount > 0).map((workspace) => (
                  <div key={`stash-${workspace.id}`} className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-3">
                    <div className="flex items-center justify-between">
                      <p>{t(workspace.name, undefined, language)} ({workspace.stashedCount})</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void sendMessage({ type: "dashboard:restoreWorkspace", workspaceId: workspace.id }).then(loadData)}
                          className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                        >
                          {t("popupRestore", undefined, language)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedStashed((current) => current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : [...current, workspace.id])}
                          className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                        >
                          {expandedStashed.includes(workspace.id) ? t("popupCollapse", undefined, language) : t("popupExpand", undefined, language)}
                        </button>
                      </div>
                    </div>
                    {workspace.stashedAt ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">{formatStashedAt(workspace.stashedAt, language)}</p>
                    ) : null}
                    {expandedStashed.includes(workspace.id) ? (
                      <div className="mt-3 space-y-2">
                        {workspace.savedTabs.map((tab) => (
                          <div key={`${workspace.id}-${tab.url}`} className="flex items-center gap-2 rounded border border-[var(--line)] p-2">
                            <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{tab.title}</p>
                              <p className="truncate text-xs text-[var(--muted)]">{tab.domain}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void sendMessage({ type: "dashboard:restoreSavedTab", workspaceId: workspace.id, url: tab.url }).then(loadData)}
                              className="rounded border border-[var(--line)] px-2 py-1 text-xs"
                            >
                              {t("popupRestore", undefined, language)}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {view === "stats" ? (
            <div className="relative min-h-[320px]">
              <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardNavStats", undefined, language)}</h2>
              <div
                className={`relative mt-4 rounded border border-[var(--line)] bg-[var(--paper-2)]/60 p-4 ${
                  MONETIZATION_ENABLED && !hasStatisticsAccess ? "pointer-events-none select-none" : ""
                }`}
              >
                <div className="h-44 rounded border border-[var(--line)] p-2">
                  <div className="flex h-full items-end gap-2">
                    {data.weekly.map((day) => {
                      const total = day.counts.reduce((sum, item) => sum + item.value, 0);
                      return (
                        <div key={day.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <div className="w-full rounded bg-[var(--accent)]/60" style={{ height: `${Math.max(8, total * 10)}px` }} />
                          <span className="text-[10px] text-[var(--muted)]">{day.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {data.usageRanking.map((item) => (
                    <div key={`rank-${item.workspaceId}`} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="flex-1 text-sm">{t(item.name, undefined, language)}</span>
                      <span className="text-xs text-[var(--muted)]">{item.value} min</span>
                    </div>
                  ))}
                </div>
                {MONETIZATION_ENABLED && !hasStatisticsAccess ? (
                  <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-[var(--paper)]/55 pt-16 backdrop-blur-sm">
                    <div className="mx-4 w-full max-w-md">
                      <UpgradePrompt feature="statistics" language={language} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {view === "pro" ? (
            <div className="max-w-lg space-y-4">
              <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("dashboardProPageTitle", undefined, language)}</h2>
              <p className="text-sm text-[var(--muted)]">{t("dashboardComingSoon", undefined, language)}</p>
              {MONETIZATION_ENABLED ? (
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  onClick={() => void chrome.tabs.create({ url: t("proLearnMoreUrl", undefined, language) })}
                >
                  {t("learnFloxPro", undefined, language)}
                </button>
              ) : null}
            </div>
          ) : null}

          {view === "settings" ? (
            <div className="space-y-4">
              <h2 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("settingsTitle", undefined, language)}</h2>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <label className="text-xs text-[var(--muted)]">{t("settingsIdleThreshold", undefined, language)}</label>
                <select
                  value={settings.idleThresholdMinutes}
                  onChange={(event) =>
                    void saveSettings({ ...settings, idleThresholdMinutes: Number(event.target.value) })
                  }
                  className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-sm"
                >
                  <option value={30}>30m</option>
                  <option value={60}>1h</option>
                  <option value={120}>2h</option>
                  <option value={240}>4h</option>
                  <option value={0}>{t("settingsDisabled", undefined, language)}</option>
                </select>
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <label className="text-xs text-[var(--muted)]">{t("settingsTabWarningThreshold", undefined, language)}</label>
                <input
                  type="number"
                  value={settings.tabWarningThreshold}
                  onChange={(event) => setSettings((current) => ({ ...current, tabWarningThreshold: Number(event.target.value) }))}
                  onBlur={() => void saveSettings(settings)}
                  className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-sm"
                />
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoCreateTabGroup}
                    onChange={(event) => void saveSettings({ ...settings, autoCreateTabGroup: event.target.checked })}
                  />
                  {t("settingsAutoGroup", undefined, language)}
                </label>
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoMoveAssignedTabs}
                    onChange={(event) => void saveSettings({ ...settings, autoMoveAssignedTabs: event.target.checked })}
                  />
                  {t("settingsAutoMoveAssignedTabs", undefined, language)}
                </label>
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoAssignPrompt}
                    onChange={(event) =>
                      void saveSettings({ ...settings, autoAssignPrompt: event.target.checked })
                    }
                  />
                  {t("settingsAutoAssignPrompt", undefined, language)}
                </label>
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <p className="text-sm text-[var(--ink)]">{t("settingsIgnoredDomains", undefined, language)}</p>
                {ignoredDomains.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">{t("settingsNoIgnoredDomains", undefined, language)}</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {ignoredDomains.map((domain) => (
                      <div key={domain} className="flex items-center justify-between rounded border border-[var(--line)] px-2 py-1 text-xs">
                        <span>{domain}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void sendMessage({ type: "dashboard:removeIgnoredDomain", domain }).then(reloadIgnoredDomains)
                          }
                          className="rounded border border-[var(--line)] px-2 py-0.5"
                        >
                          {t("deleteWorkspace", undefined, language)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4">
                <button type="button" onClick={exportConfig} className="rounded border border-[var(--line)] px-3 py-1 text-sm">
                  {t("settingsExport", undefined, language)}
                </button>
                <div className="mt-3">
                  <input
                    type="file"
                    accept="application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setImportPreview(String(reader.result ?? ""));
                      reader.readAsText(file);
                    }}
                  />
                  {importPreview ? (
                    <div className="mt-2 rounded border border-[var(--line)] bg-[var(--paper)] p-2 text-xs text-[var(--ink-2)]">
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap">{importPreview}</pre>
                      <button type="button" onClick={() => void importConfig()} className="mt-2 rounded border border-[var(--line)] px-2 py-1">
                        {t("settingsImport", undefined, language)}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded border border-rose-300 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/20 p-4">
                <button type="button" onClick={() => void resetAllData()} className="rounded border border-rose-400 dark:border-rose-700 px-3 py-1 text-sm text-rose-900 dark:text-rose-200">
                  {t("settingsResetAll", undefined, language)}
                </button>
              </div>
              <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-4 text-sm text-[var(--ink-2)]">
                {t("settingsPrivacyNote", undefined, language)}
              </div>
              <button
                type="button"
                className="text-sm text-cyan-300 hover:text-cyan-200"
                onClick={async () => {
                  setFeedbackLoading(true);
                  await chrome.tabs.create({ url: chrome.runtime.getURL("feedback.html") });
                  setFeedbackLoading(false);
                }}
              >
                {feedbackLoading ? t("loading", undefined, language) : t("feedbackLink", undefined, language)}
              </button>
            </div>
          ) : null}
        </section>

        <DragOverlay>{draggingWorkspaceId ? <div className="rounded bg-[var(--ink)] px-2 py-1 text-xs text-[var(--paper)]">{draggingWorkspaceId}</div> : null}</DragOverlay>
        {showOnboarding ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--paper)]/80 p-6">
            <div className="w-full max-w-2xl rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-6">
              <p className="mb-3 text-xs text-[var(--muted)]">{t("onboardingStepIndicator", [String(onboardingStep), "4"], language)}</p>
              {onboardingStep === 1 ? (
                <div>
                  <h3 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("onboardingWelcomeTitle", undefined, language)}</h3>
                  <p className="mt-2 text-[var(--ink-2)]">{t("onboardingWelcomeDesc", undefined, language)}</p>
                  <div
                    className="mt-6 flex justify-center rounded-xl border border-[var(--line)] bg-gradient-to-b from-[var(--paper)] via-[var(--paper-2)]/80 to-[var(--paper)] px-4 py-6"
                    role="img"
                    aria-label={t("onboardingWelcomeDesc", undefined, language)}
                  >
                    <svg viewBox="0 0 360 200" className="h-44 w-full max-w-md text-[var(--muted)]" aria-hidden="true">
                      <defs>
                        <linearGradient id="onb-win" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#1e293b" />
                          <stop offset="100%" stopColor="#0f172a" />
                        </linearGradient>
                      </defs>
                      <rect x="8" y="12" width="344" height="176" rx="14" fill="url(#onb-win)" stroke="currentColor" strokeOpacity="0.35" />
                      <rect x="24" y="28" width="312" height="28" rx="6" fill="#0f172a" stroke="currentColor" strokeOpacity="0.25" />
                      <circle cx="40" cy="42" r="4" fill="#64748b" />
                      <circle cx="56" cy="42" r="4" fill="#64748b" />
                      <circle cx="72" cy="42" r="4" fill="#64748b" />
                      <rect x="96" y="34" width="72" height="16" rx="4" fill="#334155" />
                      <rect x="176" y="34" width="64" height="16" rx="4" fill="#334155" />
                      <rect x="248" y="34" width="72" height="16" rx="4" fill="#334155" />
                      <rect x="24" y="72" width="152" height="100" rx="10" fill="#020617" stroke="#6366f1" strokeOpacity="0.55" strokeWidth="1.5" />
                      <text x="36" y="94" fill="#94a3b8" fontSize="11" fontFamily="system-ui, sans-serif">
                        {t("templateWorkName", undefined, language)}
                      </text>
                      <rect x="36" y="104" width="128" height="10" rx="2" fill="#1e293b" />
                      <rect x="36" y="120" width="100" height="10" rx="2" fill="#1e293b" />
                      <rect x="36" y="136" width="116" height="10" rx="2" fill="#1e293b" />
                      <circle cx="44" cy="108" r="3" fill="#6366f1" />
                      <circle cx="44" cy="124" r="3" fill="#8b5cf6" />
                      <circle cx="44" cy="140" r="3" fill="#06b6d4" />
                      <rect x="192" y="72" width="144" height="100" rx="10" fill="#020617" stroke="currentColor" strokeOpacity="0.2" />
                      <rect x="204" y="104" width="120" height="8" rx="2" fill="#1e293b" />
                      <rect x="204" y="120" width="88" height="8" rx="2" fill="#1e293b" />
                      <rect x="204" y="136" width="104" height="8" rx="2" fill="#1e293b" />
                    </svg>
                  </div>
                </div>
              ) : null}
              {onboardingStep === 2 ? (
                <div>
                  <h3 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("onboardingTemplatesTitle", undefined, language)}</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {workspaceTemplates.map((template) => (
                      <label key={template.id} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--paper)] p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={onboardingTemplates.includes(template.id)}
                          onChange={() =>
                            setOnboardingTemplates((current) =>
                              current.includes(template.id) ? current.filter((id) => id !== template.id) : [...current, template.id]
                            )
                          }
                        />
                        <span>{t(template.name, undefined, language)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 rounded border border-[var(--line)] bg-[var(--paper)] p-3">
                    <p className="text-sm text-[var(--ink-2)]">{t("onboardingCustomWorkspace", undefined, language)}</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={onboardingCustomName}
                        onChange={(event) => setOnboardingCustomName(event.target.value)}
                        className="flex-1 rounded border border-[var(--line)] bg-[var(--paper-2)] px-2 py-1 text-sm"
                        placeholder={t("popupTaskNameLabel", undefined, language)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const value = onboardingCustomName.trim();
                          if (!value) return;
                          setOnboardingCustomWorkspaces((current) => [...current, value]);
                          setOnboardingCustomName("");
                        }}
                        className="rounded border border-[var(--line)] px-3 py-1 text-sm"
                      >
                        {t("onboardingAddCustomWorkspace", undefined, language)}
                      </button>
                    </div>
                    {onboardingCustomWorkspaces.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {onboardingCustomWorkspaces.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 rounded bg-[var(--paper-3)] px-2 py-1 text-xs">
                            {name}
                            <button
                              type="button"
                              onClick={() =>
                                setOnboardingCustomWorkspaces((current) => current.filter((item) => item !== name))
                              }
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {onboardingStep === 3 ? (
                <div>
                  <h3 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("onboardingAssignTitle", undefined, language)}</h3>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {data.unassignedTabs.map((tab) => (
                      <div key={`onb-tab-${tab.tabId}`} className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--paper)] p-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{tab.title || tab.domain}</span>
                        <select
                          value={batchAssignment[tab.tabId] ?? ""}
                          onChange={(event) =>
                            setBatchAssignment((current) => ({ ...current, [tab.tabId]: event.target.value }))
                          }
                          className="rounded border border-[var(--line)] bg-[var(--paper-2)] px-2 py-1 text-xs"
                        >
                          <option value="">{t("dashboardMoveTo", undefined, language)}</option>
                          {data.workspaces.map((workspace) => (
                            <option key={`onb-opt-${workspace.id}`} value={workspace.id}>
                              {t(workspace.name, undefined, language)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {onboardingStep === 4 ? (
                <div>
                  <h3 className="font-flox text-[26px] font-semibold tracking-[-0.02em] leading-tight">{t("onboardingDoneTitle", undefined, language)}</h3>
                  <p className="mt-2 text-[var(--ink-2)]">{t("onboardingDoneDesc", undefined, language)}</p>
                </div>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                {onboardingStep === 2 ? (
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="rounded border border-[var(--line)] px-3 py-1 text-sm"
                  >
                    {t("skipForNow", undefined, language)}
                  </button>
                ) : null}
                {onboardingStep < 4 ? (
                  <button
                    type="button"
                    onClick={() =>
                      void (async () => {
                        try {
                          if (onboardingStep === 2) await runOnboardingTemplateCreation();
                          if (onboardingStep === 3) await applyBatchAssignments();
                          setOnboardingStep((step) => Math.min(4, step + 1));
                        } catch {
                          window.alert(t("onboardingSaveFailed", undefined, language));
                        }
                      })()
                    }
                    className="rounded-lg bg-[var(--accent)] px-3 py-1 text-sm font-medium text-white hover:opacity-90"
                  >
                    {t("onboardingNext", undefined, language)}
                  </button>
                ) : (
                  <button type="button" onClick={() => void completeOnboarding()} className="rounded-lg bg-[var(--accent)] px-3 py-1 text-sm font-medium text-white hover:opacity-90">
                    {t("onboardingStartUsing", undefined, language)}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {workspaceEditorOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ink)]/25 backdrop-blur-[2px] p-4"
            onClick={closeWorkspaceEditor}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <p className="text-base font-semibold text-[var(--ink)]">
                {editingWorkspaceId ? t("popupEditTaskTitle", undefined, language) : t("popupCreateTaskTitle", undefined, language)}
              </p>
              <label className="mt-3 block text-xs text-[var(--muted)]">{t("popupTaskNameLabel", undefined, language)}</label>
              <input
                value={workspaceNameInput}
                onChange={(e) => setWorkspaceNameInput(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-2 text-sm text-[var(--ink)]"
              />
              <p className="mt-3 text-xs text-[var(--muted)]">{t("popupTaskColorLabel", undefined, language)}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {WORKSPACE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setWorkspaceColorInput(color)}
                    className={`h-7 w-7 rounded-full border-2 ${workspaceColorInput === color ? "border-white" : "border-[var(--line)]"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">{t("popupTaskRulesLabel", undefined, language)}</p>
              <div className="mt-1 flex flex-wrap gap-1 rounded border border-[var(--line)] bg-[var(--paper)] p-2">
                {workspacePatterns.map((pattern) => (
                  <span key={pattern} className="inline-flex items-center gap-1 rounded bg-[var(--paper-3)] px-2 py-0.5 text-xs">
                    {pattern}
                    <button
                      type="button"
                      onClick={() => setWorkspacePatterns((current) => current.filter((item) => item !== pattern))}
                      className="text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={patternInput}
                  onChange={(e) => setPatternInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addWorkspacePatternTag();
                    }
                  }}
                  className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
                  placeholder={t("popupRuleInputPlaceholder", undefined, language)}
                />
              </div>
              <div className="mt-5 flex items-center justify-between gap-2">
                <div>
                  {editingWorkspaceId ? (
                    <button
                      type="button"
                      onClick={() => void deleteWorkspaceFromEditor()}
                      className="rounded border border-rose-400 dark:border-rose-700 px-3 py-2 text-sm text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/40"
                    >
                      {t("deleteWorkspace", undefined, language)}
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]" onClick={closeWorkspaceEditor}>
                    {t("popupCancel", undefined, language)}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                    onClick={() => void saveWorkspaceFormDashboard()}
                  >
                    {t("popupSave", undefined, language)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {pinnedEditor ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/25 backdrop-blur-[2px] p-4"
            onClick={() => setPinnedEditor(null)}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <p className="text-base font-semibold text-[var(--ink)]">
                {pinnedEditor.mode === "add" ? t("pinnedAddLink", undefined, language) : t("pinnedEdit", undefined, language)}
              </p>
              <label className="mt-3 block text-xs text-[var(--muted)]">{t("pinnedUrl", undefined, language)}</label>
              <input
                value={pinUrl}
                onChange={(e) => setPinUrl(e.target.value)}
                onBlur={() => void fetchPinPreviewDashboard()}
                disabled={pinnedEditor.mode === "edit"}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
              />
              <label className="mt-3 block text-xs text-[var(--muted)]">{t("pinnedTitle", undefined, language)}</label>
              <input
                value={pinTitle}
                onChange={(e) => setPinTitle(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-2 text-sm text-[var(--ink)]"
              />
              <label className="mt-3 block text-xs text-[var(--muted)]">{t("pinnedWorkspace", undefined, language)}</label>
              <select
                value={pinWorkspaceId}
                onChange={(e) => setPinWorkspaceId(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--paper)] px-2 py-2 text-sm text-[var(--ink)]"
              >
                <option value="">{t("pinnedNone", undefined, language)}</option>
                {data.workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {t(ws.name, undefined, language)}
                  </option>
                ))}
              </select>
              {pinFetchLoading ? <p className="mt-2 text-xs text-[var(--muted)]">{t("loading", undefined, language)}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]" onClick={() => setPinnedEditor(null)}>
                  {t("pinnedCancel", undefined, language)}
                </button>
                <button type="button" className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90" onClick={() => void savePinnedFormDashboard()}>
                  {t("pinnedSave", undefined, language)}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {lastWorkspaceTabPrompt ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/25 backdrop-blur-[2px] p-4"
            onClick={() => setLastWorkspaceTabPrompt(null)}
            role="presentation"
          >
            <div
              className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <p className="text-base font-semibold text-[var(--ink)]">
                {t("lastWorkspaceTabTitle", [lastWorkspaceTabPrompt.workspaceLabel], language)}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">{t("lastWorkspaceTabHint", undefined, language)}</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]"
                  onClick={() => setLastWorkspaceTabPrompt(null)}
                >
                  {t("lastWorkspaceTabCancel", undefined, language)}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]"
                  onClick={() => {
                    const payload = lastWorkspaceTabPrompt;
                    setLastWorkspaceTabPrompt(null);
                    void executeCloseSingleTab(payload.tabId, "close");
                  }}
                >
                  {t("lastWorkspaceTabCloseOnly", undefined, language)}
                </button>
                <button
                  type="button"
                  className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-500"
                  onClick={() => {
                    const payload = lastWorkspaceTabPrompt;
                    setLastWorkspaceTabPrompt(null);
                    void executeCloseSingleTab(payload.tabId, "delete_workspace", payload.workspaceId);
                  }}
                >
                  {t("lastWorkspaceTabDeleteWorkspace", undefined, language)}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </DndContext>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>
);

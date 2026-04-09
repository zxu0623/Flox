import React from "react";
import ReactDOM from "react-dom/client";
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FixedSizeList } from "react-window";
import "../styles.css";
import { getStoredLanguage, setStoredLanguage, type LanguageCode, t } from "../utils/i18n";
import { workspaceTemplates } from "../utils/templates";

type ViewKey = "overview" | "unassigned" | "stashed" | "stats" | "workspace" | "settings";

interface TabItem {
  tabId: number;
  workspaceId: string | null;
  url: string;
  domain: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
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
}

interface DashboardSnapshot {
  totalTabs: number;
  idleTabs: TabItem[];
  unassignedTabs: TabItem[];
  workspaces: WorkspaceItem[];
  weekly: Array<{ day: string; counts: Array<{ workspaceId: string; value: number }> }>;
  usageRanking: Array<{ workspaceId: string; name: string; color: string; value: number }>;
}

const DEFAULT_DATA: DashboardSnapshot = {
  totalTabs: 0,
  idleTabs: [],
  unassignedTabs: [],
  workspaces: [],
  weekly: [],
  usageRanking: []
};

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
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${selected ? "bg-slate-700" : "hover:bg-slate-800"}`}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.color }} />
      <span className="truncate">{t(workspace.name, undefined, language)}</span>
      <span className="ml-auto text-xs text-slate-400">{workspace.tabCount}</span>
      {workspace.stashedCount > 0 ? <span title={t("dashboardStashed", undefined, language)}>📦</span> : null}
      {activeId === workspace.id ? <span className="text-xs text-indigo-300">•</span> : null}
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

function TabCard({
  tab,
  language,
  onClose,
  onMove,
  isClosing
}: {
  tab: TabItem;
  language: LanguageCode;
  onClose: (tabId: number) => void;
  onMove: (tabId: number) => void;
  isClosing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: `tab:${tab.tabId}`, data: { tabId: tab.tabId } });
  const style = { transform: CSS.Translate.toString(transform) };
  const staleMs = Date.now() - tab.lastAccessed;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`group rounded-lg border border-slate-800 bg-slate-900 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/40 ${
        isClosing ? "translate-y-1 opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
          <p className="truncate text-xs text-slate-400">{tab.domain}</p>
          <p className="mt-1 text-[11px] text-slate-500">{formatAgo(tab.lastAccessed, language)}</p>
        </div>
        <div className="hidden flex-col gap-1 group-hover:flex">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMove(tab.tabId);
            }}
            className="text-xs text-indigo-300"
          >
            {t("dashboardMoveTo", undefined, language)}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.tabId);
            }}
            className="text-xs text-rose-300"
          >
            {t("popupClose", undefined, language)}
          </button>
        </div>
      </div>
      {staleMs > 4 * 60 * 60 * 1000 ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" />{t("dashboardIdleLong", undefined, language)}</p>
      ) : staleMs > 60 * 60 * 1000 ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500" />{t("dashboardIdleShort", undefined, language)}</p>
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
  const [draggingWorkspaceId, setDraggingWorkspaceId] = React.useState<string | null>(null);
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = React.useState<Set<number>>(new Set());
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
    autoAssignPrompt: true
  });
  const [ignoredDomains, setIgnoredDomains] = React.useState<string[]>([]);
  const [importPreview, setImportPreview] = React.useState<string>("");
  const [feedbackLoading, setFeedbackLoading] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  React.useEffect(() => {
    void (async () => {
      const lang = await getStoredLanguage();
      setLanguage(lang);
      const storageValues = await chrome.storage.local.get(["flox.settings", "flox.onboardingCompleted"]);
      const savedSettings = storageValues["flox.settings"] as Partial<typeof settings> | undefined;
      if (savedSettings) {
        setSettings({
          idleThresholdMinutes: savedSettings.idleThresholdMinutes ?? 120,
          tabWarningThreshold: savedSettings.tabWarningThreshold ?? 20,
          autoCreateTabGroup: savedSettings.autoCreateTabGroup !== false,
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
    const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName === "local") {
        void loadData();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const loadData = async () => {
    const response = await sendMessage<{ ok: boolean; data: DashboardSnapshot }>({ type: "dashboard:getData" });
    if (response.ok) {
      setData(response.data);
      if (!activeWorkspaceId && response.data.workspaces.length > 0) {
        setActiveWorkspaceId(response.data.workspaces[0].id);
      }
    }
  };

  const selectedWorkspace = data.workspaces.find((item) => item.id === activeWorkspaceId) ?? null;

  const handleCloseSingleTab = async (tabId: number) => {
    setClosingTabIds((current) => new Set(current).add(tabId));
    setData((current) => {
      const strip = (tabs: TabItem[]) => tabs.filter((tab) => tab.tabId !== tabId);
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
      await sendMessage({ type: "dashboard:closeTab", tabId });
      await loadData();
    } finally {
      setClosingTabIds((current) => {
        const next = new Set(current);
        next.delete(tabId);
        return next;
      });
    }
  };

  const handleDragEnd = async (event: { active: { id: string }; over: { id: string } | null }) => {
    if (!event.over) {
      setDraggingWorkspaceId(null);
      return;
    }
    const overId = event.over.id;
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
      <main className="flex min-h-screen bg-slate-950 text-slate-100">
        <aside className="flex w-[240px] flex-col border-r border-slate-800 bg-slate-900 p-3">
          <div className="mb-3">
            <h1 className="text-lg font-semibold">Flox</h1>
            <p className="text-xs text-slate-400">{t("tagline", undefined, language)}</p>
          </div>

          <div className="space-y-1 text-sm">
            <button type="button" onClick={() => setView("overview")} className={`w-full rounded px-2 py-1 text-left ${view === "overview" ? "bg-slate-700" : "hover:bg-slate-800"}`}>{t("dashboardNavOverview", undefined, language)}</button>
            <button type="button" onClick={() => setView("unassigned")} className={`w-full rounded px-2 py-1 text-left ${view === "unassigned" ? "bg-slate-700" : "hover:bg-slate-800"}`}>{t("dashboardNavUnassigned", undefined, language)}</button>
            <button type="button" onClick={() => setView("stashed")} className={`w-full rounded px-2 py-1 text-left ${view === "stashed" ? "bg-slate-700" : "hover:bg-slate-800"}`}>{t("dashboardNavStashed", undefined, language)}</button>
            <button type="button" onClick={() => setView("settings")} className={`w-full rounded px-2 py-1 text-left ${view === "settings" ? "bg-slate-700" : "hover:bg-slate-800"}`}>⚙️ {t("settingsTitle", undefined, language)}</button>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{t("workspaceListTitle", undefined, language)}</h2>
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

          <div className="mt-2">
            <label className="text-xs text-slate-400">{t("languageLabel", undefined, language)}</label>
            <select value={language} onChange={handleLanguageChange} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs">
              <option value="auto">{t("languageAuto", undefined, language)}</option>
              <option value="en">{t("languageEnglish", undefined, language)}</option>
              <option value="zh_CN">{t("languageChinese", undefined, language)}</option>
            </select>
          </div>
          <button
            type="button"
            className="tooltip-trigger mt-2 text-left text-xs text-slate-400 hover:text-slate-200"
            data-tooltip={t("tooltipOpenSettings", undefined, language)}
            onClick={() => setView("settings")}
          >
            ⚙️ {t("settingsTitle", undefined, language)}
          </button>
        </aside>

        <section className="flex-1 overflow-y-auto p-6">
          {view === "overview" ? (
            <div>
              <h2 className="text-2xl font-semibold">{t("dashboardNavOverview", undefined, language)}</h2>
              <div className="mt-4 space-y-2">
                {data.workspaces.map((workspace) => (
                  <div key={`bar-${workspace.id}`}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{t(workspace.name, undefined, language)}</span>
                      <span>{workspace.tabCount}</span>
                    </div>
                    <div className="h-3 rounded bg-slate-800">
                      <div className="h-full rounded" style={{ width: `${(workspace.tabCount / maxCount) * 100}%`, backgroundColor: workspace.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.workspaces.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                    {t("dashboardNoWorkspace", undefined, language)}
                  </div>
                ) : data.workspaces.map((workspace) => (
                  <div key={`card-${workspace.id}`} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{t(workspace.name, undefined, language)}</p>
                      <span className="text-xs text-slate-400">{workspace.tabCount}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {workspace.recentFavicons.length === 0 ? <span className="text-xs text-slate-500">{t("popupNoTabs", undefined, language)}</span> : workspace.recentFavicons.map((icon, index) => <img key={`${workspace.id}-ico-${index}`} src={icon} alt="" className="h-5 w-5 rounded" />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {view === "workspace" && selectedWorkspace ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedWorkspace.color }} />
                  <h2 className="text-2xl font-semibold">{t(selectedWorkspace.name, undefined, language)}</h2>
                  <span className="text-sm text-slate-400">{selectedWorkspace.tabCount}</span>
                </div>
                <div className="flex gap-2">
                  <button className="tooltip-trigger rounded border border-slate-700 px-2 py-1 text-xs" data-tooltip={t("tooltipExpandList", undefined, language)}>{t("popupExpand", undefined, language)}</button>
                  <button
                    type="button"
                    onClick={() => void (async () => {
                      setLoadingKey(`stash-${selectedWorkspace.id}`);
                      await sendMessage({ type: "dashboard:stashWorkspace", workspaceId: selectedWorkspace.id });
                      await loadData();
                      setLoadingKey(null);
                    })()}
                    className="rounded border border-slate-700 px-2 py-1 text-xs"
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
                    className="rounded border border-slate-700 px-2 py-1 text-xs"
                  >
                    {loadingKey === `close-${selectedWorkspace.id}` ? t("loading", undefined, language) : t("popupCloseAll", undefined, language)}
                  </button>
                </div>
              </div>
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
                        onClose={(id) => void handleCloseSingleTab(id)}
                        onMove={(id) => {
                          const target = window.prompt(t("dashboardMoveTo", undefined, language));
                          const workspace = data.workspaces.find((item) => t(item.name, undefined, language) === target || item.id === target);
                          if (workspace) {
                            void sendMessage({ type: "dashboard:assignTab", tabId: id, workspaceId: workspace.id }).then(loadData);
                          }
                        }}
                        isClosing={closingTabIds.has(rows[index].tabId)}
                      />
                    </div>
                  )}
                </FixedSizeList>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedWorkspace.tabs.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-slate-300">
                      <svg viewBox="0 0 120 80" className="mx-auto h-20 w-20 text-slate-500"><rect x="20" y="28" width="80" height="36" rx="6" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M20 38h80" stroke="currentColor" strokeWidth="2"/></svg>
                      <p className="mt-2 text-sm">{t("dashboardWorkspaceEmpty", undefined, language)}</p>
                    </div>
                  ) : selectedWorkspace.tabs.map((tab) => (
                    <TabCard
                      key={tab.tabId}
                      tab={tab}
                      language={language}
                      onClose={(id) => void handleCloseSingleTab(id)}
                      onMove={(id) => {
                        const target = window.prompt(t("dashboardMoveTo", undefined, language));
                        const workspace = data.workspaces.find((item) => t(item.name, undefined, language) === target || item.id === target);
                        if (workspace) {
                          void sendMessage({ type: "dashboard:assignTab", tabId: id, workspaceId: workspace.id }).then(loadData);
                        }
                      }}
                      isClosing={closingTabIds.has(tab.tabId)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {view === "unassigned" ? (
            <div ref={viewDroppable.setNodeRef} className={`rounded-lg border p-4 ${viewDroppable.isOver ? "border-indigo-400 bg-indigo-950/20" : "border-slate-800 bg-slate-900/60"}`}>
              <h2 className="text-2xl font-semibold">{t("dashboardNavUnassigned", undefined, language)}</h2>
              {data.unassignedTabs.length === 0 ? (
                <p className="mt-3 text-slate-300">{t("dashboardAllClassified", undefined, language)}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.unassignedTabs.map((tab) => (
                    <div key={`ua-${tab.tabId}`} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 p-2">
                      <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{tab.title}</p>
                        <p className="truncate text-xs text-slate-400">{tab.domain}</p>
                      </div>
                      <select
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                        onChange={(event) => {
                          if (!event.target.value) return;
                          void sendMessage({ type: "dashboard:assignTab", tabId: tab.tabId, workspaceId: event.target.value }).then(loadData);
                        }}
                        defaultValue=""
                      >
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
              <h2 className="text-2xl font-semibold">{t("dashboardNavStashed", undefined, language)}</h2>
              <div className="mt-4 space-y-3">
                {data.workspaces.filter((workspace) => workspace.stashedCount > 0).length === 0 ? (
                  <p className="text-slate-300">{t("dashboardStashedEmpty", undefined, language)}</p>
                ) : data.workspaces.filter((workspace) => workspace.stashedCount > 0).map((workspace) => (
                  <div key={`stash-${workspace.id}`} className="rounded border border-slate-800 bg-slate-900 p-3">
                    <div className="flex items-center justify-between">
                      <p>{t(workspace.name, undefined, language)} ({workspace.stashedCount})</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void sendMessage({ type: "dashboard:restoreWorkspace", workspaceId: workspace.id }).then(loadData)}
                          className="rounded border border-slate-700 px-2 py-1 text-xs"
                        >
                          {t("popupRestore", undefined, language)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedStashed((current) => current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : [...current, workspace.id])}
                          className="rounded border border-slate-700 px-2 py-1 text-xs"
                        >
                          {expandedStashed.includes(workspace.id) ? t("popupCollapse", undefined, language) : t("popupExpand", undefined, language)}
                        </button>
                      </div>
                    </div>
                    {workspace.stashedAt ? (
                      <p className="mt-2 text-xs text-slate-400">{formatStashedAt(workspace.stashedAt, language)}</p>
                    ) : null}
                    {expandedStashed.includes(workspace.id) ? (
                      <div className="mt-3 space-y-2">
                        {workspace.savedTabs.map((tab) => (
                          <div key={`${workspace.id}-${tab.url}`} className="flex items-center gap-2 rounded border border-slate-800 p-2">
                            <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{tab.title}</p>
                              <p className="truncate text-xs text-slate-400">{tab.domain}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void sendMessage({ type: "dashboard:restoreSavedTab", workspaceId: workspace.id, url: tab.url }).then(loadData)}
                              className="rounded border border-slate-700 px-2 py-1 text-xs"
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
            <div className="relative">
              <h2 className="text-2xl font-semibold">{t("dashboardNavStats", undefined, language)}</h2>
              <div className="mt-4 rounded border border-slate-800 bg-slate-900/60 p-4">
                <div className="h-44 rounded border border-slate-800 p-2">
                  <div className="flex h-full items-end gap-2">
                    {data.weekly.map((day) => {
                      const total = day.counts.reduce((sum, item) => sum + item.value, 0);
                      return (
                        <div key={day.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <div className="w-full rounded bg-indigo-500/70" style={{ height: `${Math.max(8, total * 10)}px` }} />
                          <span className="text-[10px] text-slate-400">{day.day}</span>
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
                      <span className="text-xs text-slate-400">{item.value} min</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {view === "settings" ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">{t("settingsTitle", undefined, language)}</h2>
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
                <label className="text-xs text-slate-400">{t("settingsIdleThreshold", undefined, language)}</label>
                <select
                  value={settings.idleThresholdMinutes}
                  onChange={(event) =>
                    void saveSettings({ ...settings, idleThresholdMinutes: Number(event.target.value) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                >
                  <option value={30}>30m</option>
                  <option value={60}>1h</option>
                  <option value={120}>2h</option>
                  <option value={240}>4h</option>
                  <option value={0}>{t("settingsDisabled", undefined, language)}</option>
                </select>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
                <label className="text-xs text-slate-400">{t("settingsTabWarningThreshold", undefined, language)}</label>
                <input
                  type="number"
                  value={settings.tabWarningThreshold}
                  onChange={(event) => setSettings((current) => ({ ...current, tabWarningThreshold: Number(event.target.value) }))}
                  onBlur={() => void saveSettings(settings)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                />
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.autoCreateTabGroup}
                    onChange={(event) => void saveSettings({ ...settings, autoCreateTabGroup: event.target.checked })}
                  />
                  {t("settingsAutoGroup", undefined, language)}
                </label>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
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
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
                <p className="text-sm text-slate-200">{t("settingsIgnoredDomains", undefined, language)}</p>
                {ignoredDomains.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">{t("settingsNoIgnoredDomains", undefined, language)}</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {ignoredDomains.map((domain) => (
                      <div key={domain} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1 text-xs">
                        <span>{domain}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void sendMessage({ type: "dashboard:removeIgnoredDomain", domain }).then(reloadIgnoredDomains)
                          }
                          className="rounded border border-slate-700 px-2 py-0.5"
                        >
                          {t("deleteWorkspace", undefined, language)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-4">
                <button type="button" onClick={exportConfig} className="rounded border border-slate-700 px-3 py-1 text-sm">
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
                    <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap">{importPreview}</pre>
                      <button type="button" onClick={() => void importConfig()} className="mt-2 rounded border border-slate-700 px-2 py-1">
                        {t("settingsImport", undefined, language)}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded border border-rose-700/50 bg-rose-950/20 p-4">
                <button type="button" onClick={() => void resetAllData()} className="rounded border border-rose-700 px-3 py-1 text-sm text-rose-200">
                  {t("settingsResetAll", undefined, language)}
                </button>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                {t("settingsPrivacyNote", undefined, language)}
              </div>
              <button
                type="button"
                className="text-sm text-cyan-300 hover:text-cyan-200"
                onClick={async () => {
                  setFeedbackLoading(true);
                  await chrome.tabs.create({ url: t("feedbackUrl", undefined, language) });
                  setFeedbackLoading(false);
                }}
              >
                {feedbackLoading ? t("loading", undefined, language) : t("feedbackLink", undefined, language)}
              </button>
            </div>
          ) : null}
        </section>

        <DragOverlay>{draggingWorkspaceId ? <div className="rounded bg-slate-700 px-2 py-1 text-xs">{draggingWorkspaceId}</div> : null}</DragOverlay>
        {showOnboarding ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-6">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6">
              <p className="mb-3 text-xs text-slate-400">{t("onboardingStepIndicator", [String(onboardingStep), "4"], language)}</p>
              {onboardingStep === 1 ? (
                <div>
                  <h3 className="text-2xl font-semibold">{t("onboardingWelcomeTitle", undefined, language)}</h3>
                  <p className="mt-2 text-slate-300">{t("onboardingWelcomeDesc", undefined, language)}</p>
                  <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-4 text-center text-slate-400">{t("onboardingIllustrationPlaceholder", undefined, language)}</div>
                </div>
              ) : null}
              {onboardingStep === 2 ? (
                <div>
                  <h3 className="text-2xl font-semibold">{t("onboardingTemplatesTitle", undefined, language)}</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {workspaceTemplates.map((template) => (
                      <label key={template.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 p-2 text-sm">
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
                  <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-3">
                    <p className="text-sm text-slate-300">{t("onboardingCustomWorkspace", undefined, language)}</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={onboardingCustomName}
                        onChange={(event) => setOnboardingCustomName(event.target.value)}
                        className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
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
                        className="rounded border border-slate-700 px-3 py-1 text-sm"
                      >
                        {t("onboardingAddCustomWorkspace", undefined, language)}
                      </button>
                    </div>
                    {onboardingCustomWorkspaces.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {onboardingCustomWorkspaces.map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs">
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
                  <h3 className="text-2xl font-semibold">{t("onboardingAssignTitle", undefined, language)}</h3>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {data.unassignedTabs.map((tab) => (
                      <div key={`onb-tab-${tab.tabId}`} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 p-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{tab.title || tab.domain}</span>
                        <select
                          value={batchAssignment[tab.tabId] ?? ""}
                          onChange={(event) =>
                            setBatchAssignment((current) => ({ ...current, [tab.tabId]: event.target.value }))
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
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
                  <h3 className="text-2xl font-semibold">{t("onboardingDoneTitle", undefined, language)}</h3>
                  <p className="mt-2 text-slate-300">{t("onboardingDoneDesc", undefined, language)}</p>
                </div>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                {onboardingStep === 2 ? (
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(3)}
                    className="rounded border border-slate-700 px-3 py-1 text-sm"
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
                    className="rounded bg-indigo-500 px-3 py-1 text-sm text-white"
                  >
                    {t("onboardingNext", undefined, language)}
                  </button>
                ) : (
                  <button type="button" onClick={() => void completeOnboarding()} className="rounded bg-indigo-500 px-3 py-1 text-sm text-white">
                    {t("onboardingStartUsing", undefined, language)}
                  </button>
                )}
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

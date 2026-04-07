import React from "react";
import ReactDOM from "react-dom/client";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import "../styles.css";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { getStoredLanguage, type LanguageCode, t } from "../utils/i18n";
import { checkFeature, PLAN_LIMITS } from "../utils/plan";

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

interface PopupSnapshot {
  totalTabs: number;
  idleTabs: PopupTabItem[];
  unassignedTabs: PopupTabItem[];
  workspaces: PopupWorkspaceItem[];
}

const DEFAULT_SNAPSHOT: PopupSnapshot = {
  totalTabs: 0,
  idleTabs: [],
  unassignedTabs: [],
  workspaces: []
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
  onClose
}: {
  tabs: PopupTabItem[];
  language: LanguageCode;
  onClose: (tabId: number) => Promise<void>;
}) {
  if (tabs.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{t("popupNoTabs", undefined, language)}</p>;
  }

  const renderRow = ({ index, style }: ListChildComponentProps) => {
    const tab = tabs[index];
    return (
      <div style={style} className="flex items-center gap-2 border-b border-slate-800 px-2 py-1">
        <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-slate-200">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
          <p className="text-[10px] text-slate-500">{formatLastAccessed(tab.lastAccessed, language)}</p>
        </div>
        <button
          type="button"
          onClick={() => void onClose(tab.tabId)}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
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
        className="mt-2 rounded border border-slate-800"
      >
        {renderRow}
      </FixedSizeList>
    );
  }

  return (
    <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-slate-800">
      {tabs.map((tab) => (
        <div key={tab.tabId} className="flex items-center gap-2 border-b border-slate-800 px-2 py-1 last:border-b-0">
          <img src={tab.favIconUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="} alt="" className="h-4 w-4 rounded-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-200">{tab.title || t("popupUnknownTitle", undefined, language)}</p>
            <p className="text-[10px] text-slate-500">{formatLastAccessed(tab.lastAccessed, language)}</p>
          </div>
          <button
            type="button"
            onClick={() => void onClose(tab.tabId)}
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            {t("popupClose", undefined, language)}
          </button>
        </div>
      ))}
    </div>
  );
}

function PopupApp() {
  const [language, setLanguage] = React.useState<LanguageCode>("auto");
  const [snapshot, setSnapshot] = React.useState<PopupSnapshot>(DEFAULT_SNAPSHOT);
  const [expandedIdle, setExpandedIdle] = React.useState(false);
  const [expandedUnassigned, setExpandedUnassigned] = React.useState(false);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = React.useState<string[]>([]);
  const [showUpgradePrompt, setShowUpgradePrompt] = React.useState(false);
  const [editorMounted, setEditorMounted] = React.useState(false);
  const [editorActive, setEditorActive] = React.useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<string | null>(null);
  const [workspaceNameInput, setWorkspaceNameInput] = React.useState("");
  const [workspaceColorInput, setWorkspaceColorInput] = React.useState(WORKSPACE_COLORS[0]);
  const [workspacePatterns, setWorkspacePatterns] = React.useState<string[]>([]);
  const [patternInput, setPatternInput] = React.useState("");
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    void getStoredLanguage().then(setLanguage);
    void refreshSnapshot();
  }, []);

  React.useEffect(() => {
    const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (_changes, areaName) => {
      if (areaName === "local") {
        void refreshSnapshot();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  const openDashboard = async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard.html")
    });
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

  const openProPage = async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL(t("popupProPageUrl", undefined, language))
    });
  };

  const handleCloseTab = async (tabId: number) => {
    setLoadingKey(`tab-${tabId}`);
    await sendMessage({ type: "popup:closeTab", tabId });
    await refreshSnapshot();
    setLoadingKey(null);
  };

  const handleCloseIdleAll = async () => {
    if (!window.confirm(t("popupConfirmCloseIdle", undefined, language))) {
      return;
    }
    setLoadingKey("idle-close-all");
    for (const tab of snapshot.idleTabs) {
      await sendMessage({ type: "popup:closeTab", tabId: tab.tabId });
    }
    await refreshSnapshot();
    setLoadingKey(null);
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
      setShowUpgradePrompt(true);
      return;
    }
    setShowUpgradePrompt(false);
    setEditingWorkspaceId(null);
    setWorkspaceNameInput("");
    setWorkspaceColorInput(WORKSPACE_COLORS[0]);
    setWorkspacePatterns([]);
    setPatternInput("");
    setEditorMounted(true);
    requestAnimationFrame(() => setEditorActive(true));
  };

  const openEditorForWorkspace = (workspace: PopupWorkspaceItem) => {
    setShowUpgradePrompt(false);
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
      setShowUpgradePrompt(true);
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

  return (
    <main className="h-[500px] w-[380px] overflow-y-auto bg-slate-950 p-3 text-slate-100">
      <header className="sticky top-0 z-10 rounded-md bg-slate-950/95 pb-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{t("appName", undefined, language)}</h1>
          <button
            type="button"
            onClick={openDashboard}
            className="tooltip-trigger rounded bg-indigo-500 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-400"
            data-tooltip={t("tooltipOpenDashboard", undefined, language)}
          >
            {t("popupOpenDashboard", undefined, language)}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">{t("popupTotalTabs", [String(snapshot.totalTabs)], language)}</p>
      </header>

      {snapshot.idleTabs.length > 0 ? (
        <section className="mt-2 rounded-lg border border-amber-600/40 bg-amber-900/20 p-2">
          <button
            type="button"
            onClick={() => setExpandedIdle((value) => !value)}
            className="w-full text-left text-xs text-amber-200"
          >
            {t("popupIdleReminder", [String(snapshot.idleTabs.length)], language)}
          </button>
          <div className={`mt-2 overflow-hidden transition-all duration-200 ${expandedIdle ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCloseIdleAll()}
                  className="tooltip-trigger rounded border border-amber-400 px-2 py-1 text-[11px] text-amber-200"
                  data-tooltip={t("tooltipCloseAllTabs", undefined, language)}
                >
                  {t("popupCloseAll", undefined, language)}
                </button>
              </div>
              <TabList tabs={snapshot.idleTabs} language={language} onClose={handleCloseTab} />
            </div>
        </section>
      ) : null}

      <section className="mt-3">
        {snapshot.workspaces.map((workspace) => {
          const expanded = expandedWorkspaceIds.includes(workspace.id);
          const isStashed = workspace.stashedCount > 0 && workspace.tabCount === 0;
          return (
            <div
              key={workspace.id}
              className={`mb-2 rounded-lg border p-2 ${isStashed ? "border-slate-700 bg-slate-900/40 opacity-80" : "border-slate-800 bg-slate-900/70"}`}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.color }} />
                <button
                  type="button"
                  onClick={() => openEditorForWorkspace(workspace)}
                  className="truncate text-left text-sm font-medium hover:text-indigo-300"
                >
                  {t(workspace.name, undefined, language)}
                </button>
                <span className="ml-auto text-[11px] text-slate-400">{workspace.tabCount}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
                <div
                  className="h-full rounded"
                  style={{ width: `${(workspace.tabCount / maxWorkspaceTabs) * 100}%`, backgroundColor: workspace.color }}
                />
              </div>
              {isStashed ? (
                <div className="mt-1 text-[10px] text-slate-400">
                  <p>{t("popupStashedState", [String(workspace.stashedCount)], language)}</p>
                  {workspace.stashedAt ? <p>{formatStashedAt(workspace.stashedAt, language)}</p> : null}
                </div>
              ) : null}
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => void handleStashOrRestore(workspace)}
                  className="tooltip-trigger rounded border border-slate-700 px-2 py-1 text-[10px] hover:bg-slate-800"
                  data-tooltip={t("tooltipStashShortcut", undefined, language)}
                >
                  {loadingKey === `workspace-${workspace.id}-stash` ? t("loading", undefined, language) : null}
                  {isStashed ? t("popupRestore", undefined, language) : t("popupStash", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCloseWorkspaceTabs(workspace.id)}
                  className="tooltip-trigger rounded border border-slate-700 px-2 py-1 text-[10px] hover:bg-slate-800"
                  data-tooltip={t("tooltipCloseAllTabs", undefined, language)}
                >
                  {loadingKey === `workspace-${workspace.id}-close` ? t("loading", undefined, language) : null}
                  {t("popupCloseAll", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleWorkspaceExpanded(workspace.id)}
                  className="tooltip-trigger rounded border border-slate-700 px-2 py-1 text-[10px] hover:bg-slate-800"
                  data-tooltip={t("tooltipExpandList", undefined, language)}
                >
                  {expanded ? t("popupCollapse", undefined, language) : t("popupExpand", undefined, language)}
                </button>
              </div>
              <div className={`overflow-hidden transition-all duration-200 ${expanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
                <TabList tabs={workspace.tabs} language={language} onClose={handleCloseTab} />
              </div>
            </div>
          );
        })}
      </section>

      <footer className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
        <button
          type="button"
          onClick={() => setExpandedUnassigned((value) => !value)}
          className="flex w-full items-center justify-between text-left text-xs"
        >
          <span>{t("popupUnassigned", undefined, language)}</span>
          <span className="text-slate-400">{snapshot.unassignedTabs.length}</span>
        </button>
        <div className={`overflow-hidden transition-all duration-200 ${expandedUnassigned ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
          <TabList tabs={snapshot.unassignedTabs} language={language} onClose={handleCloseTab} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleNewTask()}
            className="tooltip-trigger rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            data-tooltip={t("tooltipNewTask", undefined, language)}
          >
            {t("popupNewTask", undefined, language)}
          </button>
          <button
            type="button"
            onClick={() => void chrome.tabs.create({ url: t("feedbackUrl", undefined, language) })}
            className="tooltip-trigger text-[11px] text-cyan-300 hover:text-cyan-200"
            data-tooltip={t("feedbackLink", undefined, language)}
          >
            {t("feedbackLink", undefined, language)}
          </button>
          <button
            type="button"
            onClick={openProPage}
            className="tooltip-trigger text-[11px] text-indigo-300 hover:text-indigo-200"
            data-tooltip={t("tooltipLearnPro", undefined, language)}
          >
            {t("popupProCta", undefined, language)}
          </button>
        </div>
        {showUpgradePrompt ? (
          <UpgradePrompt
            feature="unlimitedWorkspaces"
            language={language}
            onClose={() => setShowUpgradePrompt(false)}
          />
        ) : null}
      </footer>

      {editorMounted ? (
        <div
          className={`fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 transition-opacity duration-200 ${editorActive ? "opacity-100" : "opacity-0"}`}
          onClick={closeEditor}
        >
          <div
            className={`w-full rounded-xl border border-slate-700 bg-slate-900 p-3 transition-all duration-200 ${editorActive ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold">
              {editingWorkspaceId ? t("popupEditTaskTitle", undefined, language) : t("popupCreateTaskTitle", undefined, language)}
            </h3>

            <label className="mt-2 block text-[11px] text-slate-300">{t("popupTaskNameLabel", undefined, language)}</label>
            <input
              value={workspaceNameInput}
              onChange={(event) => setWorkspaceNameInput(event.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
            />

            <p className="mt-3 text-[11px] text-slate-300">{t("popupTaskColorLabel", undefined, language)}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {WORKSPACE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setWorkspaceColorInput(color)}
                  className={`h-5 w-5 rounded-full border-2 ${workspaceColorInput === color ? "border-white" : "border-slate-700"}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <p className="mt-3 text-[11px] text-slate-300">{t("popupTaskRulesLabel", undefined, language)}</p>
            <div className="mt-1 flex flex-wrap gap-1 rounded border border-slate-700 bg-slate-950 p-2">
              {workspacePatterns.map((pattern) => (
                <span key={pattern} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                  {pattern}
                  <button
                    type="button"
                    onClick={() => setWorkspacePatterns((current) => current.filter((item) => item !== pattern))}
                    className="text-slate-400 hover:text-slate-200"
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
                    className="rounded border border-rose-700 px-2 py-1 text-[11px] text-rose-300"
                  >
                    {t("deleteWorkspace", undefined, language)}
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeEditor} className="rounded border border-slate-700 px-2 py-1 text-[11px]">
                  {t("popupCancel", undefined, language)}
                </button>
                <button
                  type="button"
                  onClick={() => void saveWorkspaceForm()}
                  className="rounded bg-indigo-500 px-2 py-1 text-[11px] text-white"
                >
                  {t("popupSave", undefined, language)}
                </button>
              </div>
            </div>
          </div>
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

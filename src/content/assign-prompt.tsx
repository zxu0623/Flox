import { t } from "../utils/i18n";
import { PLAN_LIMITS } from "../utils/plan";
import { UI_THEME_STORAGE_KEY, type UiTheme } from "../utils/theme";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

type WorkspaceLite = { id: string; name: string; color: string };

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

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let collapsed = false;
let collapseTimer: number | null = null;
let currentDomain = "";
let currentWorkspaces: WorkspaceLite[] = [];
let suggestedWorkspaceId: string | null = null;
let uiMode: "list" | "newTask" = "list";
let newTaskColor = WORKSPACE_COLORS[0];
let newTaskDraftName = "";
let newTaskError = "";
let currentUiTheme: UiTheme = "dark";
let pinFormOpen = false;
let pinTitle = "";
let pinWorkspaceId: string | null = null;
let pinError = "";

function ensureHost() {
  if (host && shadow) return;
  host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";
  shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
}

function send(message: unknown) {
  chrome.runtime.sendMessage(message);
}

function clearCollapseTimer() {
  if (collapseTimer) window.clearTimeout(collapseTimer);
  collapseTimer = null;
}

function startCollapseTimer() {
  clearCollapseTimer();
  if (uiMode === "newTask") {
    return;
  }
  collapseTimer = window.setTimeout(() => {
    collapsed = true;
    render();
  }, 5000);
}

function buildPanelStyles(dark: boolean): string {
  if (dark) {
    return `
    .panel { width: 280px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    .ghost { background:transparent; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#1e293b; border:1px solid rgba(148,163,184,.4); cursor:pointer; animation: fadeIn .18s ease-out; color:#e2e8f0; font-weight:700; font-size:14px; }
    .input { width:100%; box-sizing:border-box; border:1px solid rgba(100,116,139,.45); background:#020617; color:#e2e8f0; border-radius:8px; padding:8px; font-size:12px; margin-bottom:8px; }
    .color-dot { width:20px; height:20px; border-radius:999px; border:2px solid transparent; cursor:pointer; padding:0; }
    .color-dot.sel { border-color:#e2e8f0; }
    .err { font-size:11px; color:#fca5a5; margin:0 0 8px 0; }
    .divider { border:none; border-top:1px solid rgba(148,163,184,.25); margin:12px 0 10px 0; }
    select.input { cursor:pointer; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;
  }
  return `
    .panel { width: 280px; background:#fafafa; color:#0f172a; border:1px solid rgba(15,23,42,.12); border-radius:12px; padding:12px; box-shadow:0 12px 32px rgba(15,23,42,.12); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(15,23,42,.15); background:#f4f4f5; color:#0f172a; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    button:hover { background:#e4e4e7; }
    .ghost { background:transparent; color:#334155; }
    .ghost:hover { background:#f4f4f5; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#e2e8f0; border:1px solid rgba(15,23,42,.12); cursor:pointer; animation: fadeIn .18s ease-out; color:#0f172a; font-weight:700; font-size:14px; }
    .input { width:100%; box-sizing:border-box; border:1px solid rgba(15,23,42,.18); background:#ffffff; color:#0f172a; border-radius:8px; padding:8px; font-size:12px; margin-bottom:8px; }
    .input:focus { outline:2px solid #2563eb; outline-offset:0; border-color:#2563eb; }
    .color-dot { width:20px; height:20px; border-radius:999px; border:2px solid transparent; cursor:pointer; padding:0; }
    .color-dot.sel { border-color:#0f172a; }
    .err { font-size:11px; color:#b91c1c; margin:0 0 8px 0; }
    .divider { border:none; border-top:1px solid rgba(15,23,42,.1); margin:12px 0 10px 0; }
    select.input { cursor:pointer; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;
}

function render() {
  if (!shadow) return;
  const styles = buildPanelStyles(currentUiTheme === "dark");

  if (collapsed) {
    shadow.innerHTML = `<style>${styles}</style><div class="mini" title="${t("appName")}">F</div>`;
    shadow.querySelector(".mini")?.addEventListener("click", () => {
      collapsed = false;
      render();
      startCollapseTimer();
    });
    return;
  }

  if (uiMode === "newTask") {
    const colorDots = WORKSPACE_COLORS.map(
      (c) =>
        `<button type="button" class="color-dot${c === newTaskColor ? " sel" : ""}" data-color="${c}" style="background:${c}" aria-label="color"></button>`
    ).join("");
    const errBlock = newTaskError ? `<p class="err">${newTaskError}</p>` : "";
    shadow.innerHTML = `
      <style>${styles}</style>
      <div class="panel">
        <p class="title">${t("popupCreateTaskTitle")}</p>
        ${errBlock}
        <input type="text" class="input" id="flox-new-task-name" placeholder="${t("popupTaskNameLabel")}" value="${escapeAttr(newTaskDraftName)}" />
        <div class="row" style="margin-bottom:10px">${colorDots}</div>
        <div class="row">
          <button type="button" id="flox-create-assign">${t("assignPromptCreateAndAssign")}</button>
          <button type="button" class="ghost" id="flox-form-cancel">${t("assignPromptFormCancel")}</button>
        </div>
      </div>
    `;
    const nameInput = shadow.querySelector("#flox-new-task-name") as HTMLInputElement;
    nameInput?.addEventListener("input", () => {
      newTaskDraftName = nameInput.value;
    });
    requestAnimationFrame(() => nameInput?.focus());

    shadow.querySelectorAll(".color-dot").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = (btn as HTMLButtonElement).dataset.color;
        if (c) {
          newTaskDraftName = nameInput?.value ?? newTaskDraftName;
          newTaskColor = c;
          newTaskError = "";
          render();
        }
      });
    });

    shadow.querySelector("#flox-form-cancel")?.addEventListener("click", () => {
      uiMode = "list";
      newTaskError = "";
      newTaskDraftName = "";
      render();
      startCollapseTimer();
    });

    shadow.querySelector("#flox-create-assign")?.addEventListener("click", () => {
      const name = (nameInput?.value ?? newTaskDraftName).trim();
      chrome.runtime.sendMessage(
        { type: "content:createWorkspaceAndAssign", name, color: newTaskColor },
        (response) => {
          if (chrome.runtime.lastError) {
            newTaskError = t("onboardingSaveFailed");
            render();
            return;
          }
          if (response?.ok) {
            destroy();
            return;
          }
          if (response?.code === "workspace_limit") {
            newTaskError = t("workspaceLimitReached", [String(PLAN_LIMITS.FREE.maxWorkspaces)]);
            render();
            return;
          }
          newTaskError = t("onboardingSaveFailed");
          render();
        }
      );
    });
    return;
  }

  const suggested = suggestedWorkspaceId
    ? currentWorkspaces.find((ws) => ws.id === suggestedWorkspaceId) ?? null
    : null;

  const wsButtons = currentWorkspaces
    .map(
      (ws) =>
        `<button type="button" data-wsid="${ws.id}"><span class="dot" style="background:${ws.color}"></span>${t(ws.name)}</button>`
    )
    .join("");

  const suggestedRow = suggested
    ? `
      <div class="row" style="margin-bottom:10px">
        <p class="title" style="margin:0">${t("assignPromptReassignTitle", [t(suggested.name)])}</p>
      </div>
      <div class="row" style="margin:-4px 0 10px 0">
        <button type="button" data-suggested="1"><span class="dot" style="background:${suggested.color}"></span>${t("assignPromptAssignSuggested")}</button>
        <button type="button" class="ghost" data-notnow="1">${t("assignPromptNotNow")}</button>
      </div>
    `
    : `<p class="title">${t("assignPromptTitle")}</p>`;

  const wsOptions = [
    `<option value="">${t("pinnedNone")}</option>`,
    ...currentWorkspaces.map((ws) => `<option value="${ws.id}">${t(ws.name)}</option>`)
  ].join("");

  const pinBlock = pinFormOpen
    ? `
      <p class="title" style="margin:0 0 8px 0">${t("assignPromptSavePinned")}</p>
      ${pinError ? `<p class="err">${pinError}</p>` : ""}
      <input type="text" class="input" id="flox-pin-title" placeholder="${t("assignPromptPinTitle")}" value="" />
      <select class="input" id="flox-pin-ws">${wsOptions}</select>
      <div class="row">
        <button type="button" id="flox-pin-save">${t("assignPromptPinSave")}</button>
        <button type="button" class="ghost" id="flox-pin-cancel">${t("assignPromptFormCancel")}</button>
      </div>
    `
    : `<button type="button" class="ghost" data-pin-toggle="1" style="width:100%;text-align:left">📌 ${t("assignPromptSavePinned")}</button>`;

  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="panel">
      ${suggestedRow}
      <div class="row">${wsButtons}</div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-new-task="1">${t("assignPromptNewTask")}</button>
      </div>
      <hr class="divider" />
      ${pinBlock}
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-skip="1">${t("assignPromptSkip")}</button>
        <button type="button" class="ghost" data-skip-forever="1">${t("assignPromptSkipForever")}</button>
        <button type="button" class="ghost" data-ignore="1">${t("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `;

  if (pinFormOpen) {
    const titleEl = shadow.querySelector("#flox-pin-title") as HTMLInputElement;
    if (titleEl) {
      titleEl.value = pinTitle;
      titleEl.addEventListener("input", () => {
        pinTitle = titleEl.value;
      });
    }
    const wsEl = shadow.querySelector("#flox-pin-ws") as HTMLSelectElement;
    if (wsEl) {
      wsEl.value = pinWorkspaceId ?? "";
      wsEl.addEventListener("change", () => {
        pinWorkspaceId = wsEl.value || null;
      });
    }
    shadow.querySelector("#flox-pin-cancel")?.addEventListener("click", () => {
      pinFormOpen = false;
      pinError = "";
      render();
      startCollapseTimer();
    });
    shadow.querySelector("#flox-pin-save")?.addEventListener("click", () => {
      const titleVal = titleEl?.value?.trim() ?? pinTitle.trim();
      chrome.runtime.sendMessage(
        {
          type: "content:addPinnedFromPage",
          title: titleVal,
          workspaceId: pinWorkspaceId
        },
        (response) => {
          if (chrome.runtime.lastError) {
            pinError = t("onboardingSaveFailed");
            render();
            return;
          }
          if (response?.ok) {
            destroy();
            return;
          }
          if (response?.code === "pinned_limit") {
            pinError = t("pinnedLimitReached", [String(PLAN_LIMITS.FREE.maxPinnedLinks)]);
            render();
            return;
          }
          pinError = t("onboardingSaveFailed");
          render();
        }
      );
    });
    requestAnimationFrame(() => titleEl?.focus());
  }

  shadow.querySelector("button[data-suggested]")?.addEventListener("click", () => {
    if (suggestedWorkspaceId) send({ type: "content:assignWorkspace", workspaceId: suggestedWorkspaceId });
    destroy();
  });
  shadow.querySelector("button[data-notnow]")?.addEventListener("click", () => destroy());

  shadow.querySelectorAll("button[data-wsid]").forEach((button) => {
    button.addEventListener("click", () => {
      const workspaceId = (button as HTMLButtonElement).dataset.wsid;
      if (workspaceId) send({ type: "content:assignWorkspace", workspaceId });
      destroy();
    });
  });

  shadow.querySelector("button[data-new-task]")?.addEventListener("click", () => {
    uiMode = "newTask";
    newTaskError = "";
    newTaskDraftName = "";
    newTaskColor = WORKSPACE_COLORS[0];
    pinFormOpen = false;
    pinError = "";
    clearCollapseTimer();
    render();
  });

  shadow.querySelector("button[data-pin-toggle]")?.addEventListener("click", () => {
    pinFormOpen = true;
    pinError = "";
    pinTitle = document.title || "";
    pinWorkspaceId = null;
    clearCollapseTimer();
    render();
  });

  shadow.querySelector("button[data-skip]")?.addEventListener("click", () => destroy());
  shadow.querySelector("button[data-skip-forever]")?.addEventListener("click", () => {
    send({ type: "content:disableAutoAssignPrompt" });
    destroy();
  });
  shadow.querySelector("button[data-ignore]")?.addEventListener("click", () => {
    send({ type: "content:ignoreDomain", domain: currentDomain });
    destroy();
  });
}

function destroy() {
  clearCollapseTimer();
  if (host) {
    host.remove();
  }
  host = null;
  shadow = null;
  collapsed = false;
  uiMode = "list";
  newTaskError = "";
  newTaskDraftName = "";
  suggestedWorkspaceId = null;
  pinFormOpen = false;
  pinTitle = "";
  pinWorkspaceId = null;
  pinError = "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "flox:showAssignPrompt") {
    return false;
  }
  ensureHost();
  currentDomain = message.domain ?? "";
  currentWorkspaces = (message.workspaces as WorkspaceLite[]) ?? [];
  suggestedWorkspaceId = (message.suggestedWorkspaceId as string | null | undefined) ?? null;
  currentUiTheme = message.uiTheme === "light" ? "light" : "dark";
  collapsed = false;
  uiMode = "list";
  newTaskError = "";
  newTaskDraftName = "";
  pinFormOpen = false;
  pinTitle = document.title || "";
  pinWorkspaceId = null;
  pinError = "";
  render();
  startCollapseTimer();
  sendResponse({ ok: true });
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[UI_THEME_STORAGE_KEY] || !host || !shadow) {
    return;
  }
  const next = changes[UI_THEME_STORAGE_KEY].newValue;
  if (next === "light" || next === "dark") {
    currentUiTheme = next;
    render();
    if (uiMode !== "newTask") {
      startCollapseTimer();
    }
  }
});

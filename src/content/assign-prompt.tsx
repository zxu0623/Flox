import { t } from "../utils/i18n";

type WorkspaceLite = { id: string; name: string; color: string };

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let collapsed = false;
let collapseTimer: number | null = null;
let currentDomain = "";
let currentWorkspaces: WorkspaceLite[] = [];
let suggestedWorkspaceId: string | null = null;

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

function render() {
  if (!shadow) return;
  const styles = `
    .panel { width: 280px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    .ghost { background:transparent; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#1e293b; border:1px solid rgba(148,163,184,.4); cursor:pointer; animation: fadeIn .18s ease-out; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;

  if (collapsed) {
    shadow.innerHTML = `<style>${styles}</style><div class="mini" title="${t("appName")}">F</div>`;
    shadow.querySelector(".mini")?.addEventListener("click", () => {
      collapsed = false;
      render();
      startCollapseTimer();
    });
    return;
  }

  const suggested = suggestedWorkspaceId
    ? currentWorkspaces.find((ws) => ws.id === suggestedWorkspaceId) ?? null
    : null;

  const wsButtons = currentWorkspaces
    .map(
      (ws) =>
        `<button data-wsid="${ws.id}"><span class="dot" style="background:${ws.color}"></span>${t(ws.name)}</button>`
    )
    .join("");

  const suggestedRow = suggested
    ? `
      <div class="row" style="margin-bottom:10px">
        <p class="title" style="margin:0">${t("assignPromptReassignTitle", [t(suggested.name)])}</p>
      </div>
      <div class="row" style="margin:-4px 0 10px 0">
        <button data-suggested="1"><span class="dot" style="background:${suggested.color}"></span>${t("assignPromptAssignSuggested")}</button>
        <button class="ghost" data-notnow="1">${t("assignPromptNotNow")}</button>
      </div>
    `
    : `<p class="title">${t("assignPromptTitle")}</p>`;

  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="panel">
      ${suggestedRow}
      <div class="row">${wsButtons}</div>
      <div class="row" style="margin-top:10px">
        <button class="ghost" data-skip="1">${t("assignPromptSkip")}</button>
        <button class="ghost" data-ignore="1">${t("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `;

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
  shadow.querySelector("button[data-skip]")?.addEventListener("click", () => destroy());
  shadow.querySelector("button[data-ignore]")?.addEventListener("click", () => {
    send({ type: "content:ignoreDomain", domain: currentDomain });
    destroy();
  });
}

function startCollapseTimer() {
  if (collapseTimer) window.clearTimeout(collapseTimer);
  collapseTimer = window.setTimeout(() => {
    collapsed = true;
    render();
  }, 5000);
}

function destroy() {
  if (collapseTimer) window.clearTimeout(collapseTimer);
  collapseTimer = null;
  if (host) {
    host.remove();
  }
  host = null;
  shadow = null;
  collapsed = false;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "flox:showAssignPrompt") {
    ensureHost();
    currentDomain = message.domain ?? "";
    currentWorkspaces = (message.workspaces as WorkspaceLite[]) ?? [];
    suggestedWorkspaceId = (message.suggestedWorkspaceId as string | null | undefined) ?? null;
    collapsed = false;
    render();
    startCollapseTimer();
  }
});

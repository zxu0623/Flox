import { t } from "../utils/i18n";

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let pendingOtherTabId: number | null = null;

function ensureHost() {
  if (host && shadow) return;
  host = document.createElement("div");
  host.style.position = "fixed";
  host.style.bottom = "20px";
  host.style.left = "50%";
  host.style.transform = "translateX(-50%)";
  host.style.zIndex = "2147483646";
  shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);
}

function destroy() {
  pendingOtherTabId = null;
  if (host) {
    host.remove();
  }
  host = null;
  shadow = null;
}

function render() {
  if (!shadow || pendingOtherTabId === null) return;
  const styles = `
    .panel { max-width: min(360px, calc(100vw - 32px)); background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px 14px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideUp .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 6px 0; }
    .hint { font-size:12px; color:#94a3b8; margin:0 0 12px 0; line-height:1.4; }
    .row { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:8px 12px; font-size:12px; cursor:pointer; }
    .primary { background:#2563eb; border-color:#3b82f6; }
    .ghost { background:transparent; }
    @keyframes slideUp { from { transform: translateY(10px); opacity:0 } to { transform: translateY(0); opacity:1 } }
  `;
  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="panel">
      <p class="title">${t("duplicateTabTitle")}</p>
      <p class="hint">${t("duplicateTabHint")}</p>
      <div class="row">
        <button type="button" class="ghost" id="flox-dup-keep">${t("duplicateTabKeepBoth")}</button>
        <button type="button" class="primary" id="flox-dup-merge">${t("duplicateTabMerge")}</button>
      </div>
    </div>
  `;

  shadow.querySelector("#flox-dup-keep")?.addEventListener("click", () => {
    destroy();
    chrome.runtime.sendMessage({ type: "content:duplicateKeepBoth" });
  });

  shadow.querySelector("#flox-dup-merge")?.addEventListener("click", () => {
    const otherId = pendingOtherTabId;
    destroy();
    if (typeof otherId === "number") {
      chrome.runtime.sendMessage({ type: "content:duplicateMerge", otherTabId: otherId });
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "flox:showDuplicateTabPrompt") {
    return false;
  }
  const otherTabId = message.otherTabId;
  if (typeof otherTabId !== "number") {
    sendResponse({ ok: false });
    return false;
  }
  pendingOtherTabId = otherTabId;
  ensureHost();
  render();
  sendResponse({ ok: true });
  return false;
});

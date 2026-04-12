import{t as a}from"./i18n-2IF4CQE7.js";let e=null,t=null,l=null;function d(){e&&t||(e=document.createElement("div"),e.style.position="fixed",e.style.bottom="20px",e.style.left="50%",e.style.transform="translateX(-50%)",e.style.zIndex="2147483646",t=e.attachShadow({mode:"open"}),document.documentElement.appendChild(e))}function p(){l=null,e&&e.remove(),e=null,t=null}function s(){var i,o;if(!t||l===null)return;const r=`
    .panel { max-width: min(360px, calc(100vw - 32px)); background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px 14px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideUp .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 6px 0; }
    .hint { font-size:12px; color:#94a3b8; margin:0 0 12px 0; line-height:1.4; }
    .row { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:8px 12px; font-size:12px; cursor:pointer; }
    .primary { background:#2563eb; border-color:#3b82f6; }
    .ghost { background:transparent; }
    @keyframes slideUp { from { transform: translateY(10px); opacity:0 } to { transform: translateY(0); opacity:1 } }
  `;t.innerHTML=`
    <style>${r}</style>
    <div class="panel">
      <p class="title">${a("duplicateTabTitle")}</p>
      <p class="hint">${a("duplicateTabHint")}</p>
      <div class="row">
        <button type="button" class="ghost" id="flox-dup-keep">${a("duplicateTabKeepBoth")}</button>
        <button type="button" class="primary" id="flox-dup-merge">${a("duplicateTabMerge")}</button>
      </div>
    </div>
  `,(i=t.querySelector("#flox-dup-keep"))==null||i.addEventListener("click",()=>{p(),chrome.runtime.sendMessage({type:"content:duplicateKeepBoth"})}),(o=t.querySelector("#flox-dup-merge"))==null||o.addEventListener("click",()=>{const n=l;p(),typeof n=="number"&&chrome.runtime.sendMessage({type:"content:duplicateMerge",otherTabId:n})})}chrome.runtime.onMessage.addListener((r,i,o)=>{if((r==null?void 0:r.type)!=="flox:showDuplicateTabPrompt")return!1;const n=r.otherTabId;return typeof n!="number"?(o({ok:!1}),!1):(l=n,d(),s(),o({ok:!0}),!1)});

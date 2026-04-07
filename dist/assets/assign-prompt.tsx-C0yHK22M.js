import{t as r}from"./i18n-CWYdL-Tb.js";let t=null,n=null,a=!1,i=null,f="",x=[];function b(){t&&n||(t=document.createElement("div"),t.style.position="fixed",t.style.top="16px",t.style.right="16px",t.style.zIndex="2147483647",n=t.attachShadow({mode:"open"}),document.documentElement.appendChild(t))}function m(e){chrome.runtime.sendMessage(e)}function l(){var d,p,c;if(!n)return;const e=`
    .panel { width: 280px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    .ghost { background:transparent; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#1e293b; border:1px solid rgba(148,163,184,.4); cursor:pointer; animation: fadeIn .18s ease-out; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;if(a){n.innerHTML=`<style>${e}</style><div class="mini" title="${r("appName")}">F</div>`,(d=n.querySelector(".mini"))==null||d.addEventListener("click",()=>{a=!1,l(),y()});return}const g=x.map(o=>`<button data-wsid="${o.id}"><span class="dot" style="background:${o.color}"></span>${r(o.name)}</button>`).join("");n.innerHTML=`
    <style>${e}</style>
    <div class="panel">
      <p class="title">${r("assignPromptTitle")}</p>
      <div class="row">${g}</div>
      <div class="row" style="margin-top:10px">
        <button class="ghost" data-skip="1">${r("assignPromptSkip")}</button>
        <button class="ghost" data-ignore="1">${r("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `,n.querySelectorAll("button[data-wsid]").forEach(o=>{o.addEventListener("click",()=>{const u=o.dataset.wsid;u&&m({type:"content:assignWorkspace",workspaceId:u}),s()})}),(p=n.querySelector("button[data-skip]"))==null||p.addEventListener("click",()=>s()),(c=n.querySelector("button[data-ignore]"))==null||c.addEventListener("click",()=>{m({type:"content:ignoreDomain",domain:f}),s()})}function y(){i&&window.clearTimeout(i),i=window.setTimeout(()=>{a=!0,l()},5e3)}function s(){i&&window.clearTimeout(i),i=null,t&&t.remove(),t=null,n=null,a=!1}chrome.runtime.onMessage.addListener(e=>{(e==null?void 0:e.type)==="flox:showAssignPrompt"&&(b(),f=e.domain??"",x=e.workspaces??[],a=!1,l(),y())});

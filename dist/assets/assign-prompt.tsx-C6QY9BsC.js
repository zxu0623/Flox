import{t as o}from"./i18n-DEcFeoyY.js";let n=null,t=null,l=!1,i=null,w="",c=[],r=null;function $(){n&&t||(n=document.createElement("div"),n.style.position="fixed",n.style.top="16px",n.style.right="16px",n.style.zIndex="2147483647",t=n.attachShadow({mode:"open"}),document.documentElement.appendChild(n))}function p(e){chrome.runtime.sendMessage(e)}function u(){var g,m,f,y,b;if(!t)return;const e=`
    .panel { width: 280px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    .ghost { background:transparent; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#1e293b; border:1px solid rgba(148,163,184,.4); cursor:pointer; animation: fadeIn .18s ease-out; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;if(l){t.innerHTML=`<style>${e}</style><div class="mini" title="${o("appName")}">F</div>`,(g=t.querySelector(".mini"))==null||g.addEventListener("click",()=>{l=!1,u(),k()});return}const d=r?c.find(s=>s.id===r)??null:null,h=c.map(s=>`<button data-wsid="${s.id}"><span class="dot" style="background:${s.color}"></span>${o(s.name)}</button>`).join(""),v=d?`
      <div class="row" style="margin-bottom:10px">
        <p class="title" style="margin:0">${o("assignPromptReassignTitle",[o(d.name)])}</p>
      </div>
      <div class="row" style="margin:-4px 0 10px 0">
        <button data-suggested="1"><span class="dot" style="background:${d.color}"></span>${o("assignPromptAssignSuggested")}</button>
        <button class="ghost" data-notnow="1">${o("assignPromptNotNow")}</button>
      </div>
    `:`<p class="title">${o("assignPromptTitle")}</p>`;t.innerHTML=`
    <style>${e}</style>
    <div class="panel">
      ${v}
      <div class="row">${h}</div>
      <div class="row" style="margin-top:10px">
        <button class="ghost" data-skip="1">${o("assignPromptSkip")}</button>
        <button class="ghost" data-ignore="1">${o("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `,(m=t.querySelector("button[data-suggested]"))==null||m.addEventListener("click",()=>{r&&p({type:"content:assignWorkspace",workspaceId:r}),a()}),(f=t.querySelector("button[data-notnow]"))==null||f.addEventListener("click",()=>a()),t.querySelectorAll("button[data-wsid]").forEach(s=>{s.addEventListener("click",()=>{const x=s.dataset.wsid;x&&p({type:"content:assignWorkspace",workspaceId:x}),a()})}),(y=t.querySelector("button[data-skip]"))==null||y.addEventListener("click",()=>a()),(b=t.querySelector("button[data-ignore]"))==null||b.addEventListener("click",()=>{p({type:"content:ignoreDomain",domain:w}),a()})}function k(){i&&window.clearTimeout(i),i=window.setTimeout(()=>{l=!0,u()},5e3)}function a(){i&&window.clearTimeout(i),i=null,n&&n.remove(),n=null,t=null,l=!1}chrome.runtime.onMessage.addListener(e=>{(e==null?void 0:e.type)==="flox:showAssignPrompt"&&($(),w=e.domain??"",c=e.workspaces??[],r=e.suggestedWorkspaceId??null,l=!1,u(),k())});

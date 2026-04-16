import{t}from"./i18n-CNAd9DTq.js";import{P as D}from"./plan-BPRw_ehD.js";import{U as H}from"./theme-DEiV2PB1.js";function V(r){return r.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;")}const T=["#6366f1","#8b5cf6","#ec4899","#ef4444","#f59e0b","#10b981","#06b6d4","#64748b"];let s=null,e=null,w=!1,E=null,X="",L=[],y=null,m="list",$=T[0],u="",d="",q="dark",b=!1,k="",v=null,c="";function G(){s&&e||(s=document.createElement("div"),s.style.position="fixed",s.style.top="16px",s.style.right="16px",s.style.zIndex="2147483647",e=s.attachShadow({mode:"open"}),document.documentElement.appendChild(s))}function S(r){chrome.runtime.sendMessage(r)}function P(){E&&window.clearTimeout(E),E=null}function h(){P(),m!=="newTask"&&(E=window.setTimeout(()=>{w=!0,a()},5e3))}function Y(r){return r?`
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
  `:`
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
  `}function a(){var A,F,I,z,C,M,R,W,N,_,O,j;if(!e)return;const r=Y(q==="dark");if(w){e.innerHTML=`<style>${r}</style><div class="mini" title="${t("appName")}">F</div>`,(A=e.querySelector(".mini"))==null||A.addEventListener("click",()=>{w=!1,a(),h()});return}if(m==="newTask"){const o=T.map(l=>`<button type="button" class="color-dot${l===$?" sel":""}" data-color="${l}" style="background:${l}" aria-label="color"></button>`).join(""),p=d?`<p class="err">${d}</p>`:"";e.innerHTML=`
      <style>${r}</style>
      <div class="panel">
        <p class="title">${t("popupCreateTaskTitle")}</p>
        ${p}
        <input type="text" class="input" id="flox-new-task-name" placeholder="${t("popupTaskNameLabel")}" value="${V(u)}" />
        <div class="row" style="margin-bottom:10px">${o}</div>
        <div class="row">
          <button type="button" id="flox-create-assign">${t("assignPromptCreateAndAssign")}</button>
          <button type="button" class="ghost" id="flox-form-cancel">${t("assignPromptFormCancel")}</button>
        </div>
      </div>
    `;const i=e.querySelector("#flox-new-task-name");i==null||i.addEventListener("input",()=>{u=i.value}),requestAnimationFrame(()=>i==null?void 0:i.focus()),e.querySelectorAll(".color-dot").forEach(l=>{l.addEventListener("click",()=>{const n=l.dataset.color;n&&(u=(i==null?void 0:i.value)??u,$=n,d="",a())})}),(F=e.querySelector("#flox-form-cancel"))==null||F.addEventListener("click",()=>{m="list",d="",u="",a(),h()}),(I=e.querySelector("#flox-create-assign"))==null||I.addEventListener("click",()=>{const l=((i==null?void 0:i.value)??u).trim();chrome.runtime.sendMessage({type:"content:createWorkspaceAndAssign",name:l,color:$},n=>{if(chrome.runtime.lastError){d=t("onboardingSaveFailed"),a();return}if(n!=null&&n.ok){f();return}if((n==null?void 0:n.code)==="workspace_limit"){d=t("workspaceLimitReached",[String(D.FREE.maxWorkspaces)]),a();return}d=t("onboardingSaveFailed"),a()})});return}const x=y?L.find(o=>o.id===y)??null:null,g=L.map(o=>`<button type="button" data-wsid="${o.id}"><span class="dot" style="background:${o.color}"></span>${t(o.name)}</button>`).join(""),B=x?`
      <div class="row" style="margin-bottom:10px">
        <p class="title" style="margin:0">${t("assignPromptReassignTitle",[t(x.name)])}</p>
      </div>
      <div class="row" style="margin:-4px 0 10px 0">
        <button type="button" data-suggested="1"><span class="dot" style="background:${x.color}"></span>${t("assignPromptAssignSuggested")}</button>
        <button type="button" class="ghost" data-notnow="1">${t("assignPromptNotNow")}</button>
      </div>
    `:`<p class="title">${t("assignPromptTitle")}</p>`,U=[`<option value="">${t("pinnedNone")}</option>`,...L.map(o=>`<option value="${o.id}">${t(o.name)}</option>`)].join(""),K=b?`
      <p class="title" style="margin:0 0 8px 0">${t("assignPromptSavePinned")}</p>
      ${c?`<p class="err">${c}</p>`:""}
      <input type="text" class="input" id="flox-pin-title" placeholder="${t("assignPromptPinTitle")}" value="" />
      <select class="input" id="flox-pin-ws">${U}</select>
      <div class="row">
        <button type="button" id="flox-pin-save">${t("assignPromptPinSave")}</button>
        <button type="button" class="ghost" id="flox-pin-cancel">${t("assignPromptFormCancel")}</button>
      </div>
    `:`<button type="button" class="ghost" data-pin-toggle="1" style="width:100%;text-align:left">📌 ${t("assignPromptSavePinned")}</button>`;if(e.innerHTML=`
    <style>${r}</style>
    <div class="panel">
      ${B}
      <div class="row">${g}</div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-new-task="1">${t("assignPromptNewTask")}</button>
      </div>
      <hr class="divider" />
      ${K}
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-skip="1">${t("assignPromptSkip")}</button>
        <button type="button" class="ghost" data-skip-forever="1">${t("assignPromptSkipForever")}</button>
        <button type="button" class="ghost" data-ignore="1">${t("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `,b){const o=e.querySelector("#flox-pin-title");o&&(o.value=k,o.addEventListener("input",()=>{k=o.value}));const p=e.querySelector("#flox-pin-ws");p&&(p.value=v??"",p.addEventListener("change",()=>{v=p.value||null})),(z=e.querySelector("#flox-pin-cancel"))==null||z.addEventListener("click",()=>{b=!1,c="",a(),h()}),(C=e.querySelector("#flox-pin-save"))==null||C.addEventListener("click",()=>{var l;const i=((l=o==null?void 0:o.value)==null?void 0:l.trim())??k.trim();chrome.runtime.sendMessage({type:"content:addPinnedFromPage",title:i,workspaceId:v},n=>{if(chrome.runtime.lastError){c=t("onboardingSaveFailed"),a();return}if(n!=null&&n.ok){f();return}if((n==null?void 0:n.code)==="pinned_limit"){c=t("pinnedLimitReached",[String(D.FREE.maxPinnedLinks)]),a();return}c=t("onboardingSaveFailed"),a()})}),requestAnimationFrame(()=>o==null?void 0:o.focus())}(M=e.querySelector("button[data-suggested]"))==null||M.addEventListener("click",()=>{y&&S({type:"content:assignWorkspace",workspaceId:y}),f()}),(R=e.querySelector("button[data-notnow]"))==null||R.addEventListener("click",()=>f()),e.querySelectorAll("button[data-wsid]").forEach(o=>{o.addEventListener("click",()=>{const p=o.dataset.wsid;p&&S({type:"content:assignWorkspace",workspaceId:p}),f()})}),(W=e.querySelector("button[data-new-task]"))==null||W.addEventListener("click",()=>{m="newTask",d="",u="",$=T[0],b=!1,c="",P(),a()}),(N=e.querySelector("button[data-pin-toggle]"))==null||N.addEventListener("click",()=>{b=!0,c="",k=document.title||"",v=null,P(),a()}),(_=e.querySelector("button[data-skip]"))==null||_.addEventListener("click",()=>f()),(O=e.querySelector("button[data-skip-forever]"))==null||O.addEventListener("click",()=>{S({type:"content:disableAutoAssignPrompt"}),f()}),(j=e.querySelector("button[data-ignore]"))==null||j.addEventListener("click",()=>{S({type:"content:ignoreDomain",domain:X}),f()})}function f(){P(),s&&s.remove(),s=null,e=null,w=!1,m="list",d="",u="",y=null,b=!1,k="",v=null,c=""}chrome.runtime.onMessage.addListener((r,x,g)=>((r==null?void 0:r.type)!=="flox:showAssignPrompt"||(G(),X=r.domain??"",L=r.workspaces??[],y=r.suggestedWorkspaceId??null,q=r.uiTheme==="light"?"light":"dark",w=!1,m="list",d="",u="",b=!1,k=document.title||"",v=null,c="",a(),h(),g({ok:!0})),!1));chrome.storage.onChanged.addListener((r,x)=>{if(x!=="local"||!r[H]||!s||!e)return;const g=r[H].newValue;(g==="light"||g==="dark")&&(q=g,a(),m!=="newTask"&&h())});

import{t}from"./i18n-BX_bCTpQ.js";import{P as _}from"./plan-BPRw_ehD.js";const T=["#6366f1","#8b5cf6","#ec4899","#ef4444","#f59e0b","#10b981","#06b6d4","#64748b"];let s=null,n=null,v=!1,h=null,j="",$=[],f=null,y="list",w=T[0],l="",m=!1,b="",x=null,d="";function X(){s&&n||(s=document.createElement("div"),s.style.position="fixed",s.style.top="16px",s.style.right="16px",s.style.zIndex="2147483647",n=s.attachShadow({mode:"open"}),document.documentElement.appendChild(s))}function P(i){chrome.runtime.sendMessage(i)}function E(){h&&window.clearTimeout(h),h=null}function S(){E(),y!=="newTask"&&(h=window.setTimeout(()=>{v=!0,o()},5e3))}function o(){var q,F,A,I,C,M,W,R,N,z,O;if(!n)return;const i=`
    .panel { width: 280px; background:#0f172a; color:#e2e8f0; border:1px solid rgba(148,163,184,.35); border-radius:12px; padding:12px; box-shadow:0 12px 30px rgba(2,6,23,.45); animation: slideIn .18s ease-out; font-family: Inter,system-ui,sans-serif; }
    .title { font-size:13px; font-weight:600; margin:0 0 10px 0; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button { border:1px solid rgba(100,116,139,.45); background:#111827; color:#e5e7eb; border-radius:8px; padding:6px 8px; font-size:12px; cursor:pointer; }
    .ghost { background:transparent; }
    .dot { width:8px; height:8px; border-radius:999px; display:inline-block; margin-right:6px; vertical-align:middle; }
    .mini { width:36px; height:36px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#1e293b; border:1px solid rgba(148,163,184,.4); cursor:pointer; animation: fadeIn .18s ease-out; }
    .input { width:100%; box-sizing:border-box; border:1px solid rgba(100,116,139,.45); background:#020617; color:#e2e8f0; border-radius:8px; padding:8px; font-size:12px; margin-bottom:8px; }
    .color-dot { width:20px; height:20px; border-radius:999px; border:2px solid transparent; cursor:pointer; padding:0; }
    .color-dot.sel { border-color:#e2e8f0; }
    .err { font-size:11px; color:#fca5a5; margin:0 0 8px 0; }
    .divider { border:none; border-top:1px solid rgba(148,163,184,.25); margin:12px 0 10px 0; }
    select.input { cursor:pointer; }
    @keyframes slideIn { from { transform: translateX(20px); opacity:0 } to { transform: translateX(0); opacity:1 } }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  `;if(v){n.innerHTML=`<style>${i}</style><div class="mini" title="${t("appName")}">F</div>`,(q=n.querySelector(".mini"))==null||q.addEventListener("click",()=>{v=!1,o(),S()});return}if(y==="newTask"){const e=T.map(r=>`<button type="button" class="color-dot${r===w?" sel":""}" data-color="${r}" style="background:${r}" aria-label="color"></button>`).join(""),c=l?`<p class="err">${l}</p>`:"";n.innerHTML=`
      <style>${i}</style>
      <div class="panel">
        <p class="title">${t("popupCreateTaskTitle")}</p>
        ${c}
        <input type="text" class="input" id="flox-new-task-name" placeholder="${t("popupTaskNameLabel")}" />
        <div class="row" style="margin-bottom:10px">${e}</div>
        <div class="row">
          <button type="button" id="flox-create-assign">${t("assignPromptCreateAndAssign")}</button>
          <button type="button" class="ghost" id="flox-form-cancel">${t("assignPromptFormCancel")}</button>
        </div>
      </div>
    `;const p=n.querySelector("#flox-new-task-name");requestAnimationFrame(()=>p==null?void 0:p.focus()),n.querySelectorAll(".color-dot").forEach(r=>{r.addEventListener("click",()=>{const a=r.dataset.color;a&&(w=a,l="",o())})}),(F=n.querySelector("#flox-form-cancel"))==null||F.addEventListener("click",()=>{y="list",l="",o(),S()}),(A=n.querySelector("#flox-create-assign"))==null||A.addEventListener("click",()=>{var a;const r=((a=p==null?void 0:p.value)==null?void 0:a.trim())??"";chrome.runtime.sendMessage({type:"content:createWorkspaceAndAssign",name:r,color:w},g=>{if(chrome.runtime.lastError){l=t("onboardingSaveFailed"),o();return}if(g!=null&&g.ok){u();return}if((g==null?void 0:g.code)==="workspace_limit"){l=t("workspaceLimitReached",[String(_.FREE.maxWorkspaces)]),o();return}l=t("onboardingSaveFailed"),o()})});return}const k=f?$.find(e=>e.id===f)??null:null,L=$.map(e=>`<button type="button" data-wsid="${e.id}"><span class="dot" style="background:${e.color}"></span>${t(e.name)}</button>`).join(""),D=k?`
      <div class="row" style="margin-bottom:10px">
        <p class="title" style="margin:0">${t("assignPromptReassignTitle",[t(k.name)])}</p>
      </div>
      <div class="row" style="margin:-4px 0 10px 0">
        <button type="button" data-suggested="1"><span class="dot" style="background:${k.color}"></span>${t("assignPromptAssignSuggested")}</button>
        <button type="button" class="ghost" data-notnow="1">${t("assignPromptNotNow")}</button>
      </div>
    `:`<p class="title">${t("assignPromptTitle")}</p>`,H=[`<option value="">${t("pinnedNone")}</option>`,...$.map(e=>`<option value="${e.id}">${t(e.name)}</option>`)].join(""),B=m?`
      <p class="title" style="margin:0 0 8px 0">${t("assignPromptSavePinned")}</p>
      ${d?`<p class="err">${d}</p>`:""}
      <input type="text" class="input" id="flox-pin-title" placeholder="${t("assignPromptPinTitle")}" value="" />
      <select class="input" id="flox-pin-ws">${H}</select>
      <div class="row">
        <button type="button" id="flox-pin-save">${t("assignPromptPinSave")}</button>
        <button type="button" class="ghost" id="flox-pin-cancel">${t("assignPromptFormCancel")}</button>
      </div>
    `:`<button type="button" class="ghost" data-pin-toggle="1" style="width:100%;text-align:left">📌 ${t("assignPromptSavePinned")}</button>`;if(n.innerHTML=`
    <style>${i}</style>
    <div class="panel">
      ${D}
      <div class="row">${L}</div>
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-new-task="1">${t("assignPromptNewTask")}</button>
      </div>
      <hr class="divider" />
      ${B}
      <div class="row" style="margin-top:10px">
        <button type="button" class="ghost" data-skip="1">${t("assignPromptSkip")}</button>
        <button type="button" class="ghost" data-ignore="1">${t("assignPromptIgnoreDomain")}</button>
      </div>
    </div>
  `,m){const e=n.querySelector("#flox-pin-title");e&&(e.value=b,e.addEventListener("input",()=>{b=e.value}));const c=n.querySelector("#flox-pin-ws");c&&(c.value=x??"",c.addEventListener("change",()=>{x=c.value||null})),(I=n.querySelector("#flox-pin-cancel"))==null||I.addEventListener("click",()=>{m=!1,d="",o(),S()}),(C=n.querySelector("#flox-pin-save"))==null||C.addEventListener("click",()=>{var r;const p=((r=e==null?void 0:e.value)==null?void 0:r.trim())??b.trim();chrome.runtime.sendMessage({type:"content:addPinnedFromPage",title:p,workspaceId:x},a=>{if(chrome.runtime.lastError){d=t("onboardingSaveFailed"),o();return}if(a!=null&&a.ok){u();return}if((a==null?void 0:a.code)==="pinned_limit"){d=t("pinnedLimitReached",[String(_.FREE.maxPinnedLinks)]),o();return}d=t("onboardingSaveFailed"),o()})}),requestAnimationFrame(()=>e==null?void 0:e.focus())}(M=n.querySelector("button[data-suggested]"))==null||M.addEventListener("click",()=>{f&&P({type:"content:assignWorkspace",workspaceId:f}),u()}),(W=n.querySelector("button[data-notnow]"))==null||W.addEventListener("click",()=>u()),n.querySelectorAll("button[data-wsid]").forEach(e=>{e.addEventListener("click",()=>{const c=e.dataset.wsid;c&&P({type:"content:assignWorkspace",workspaceId:c}),u()})}),(R=n.querySelector("button[data-new-task]"))==null||R.addEventListener("click",()=>{y="newTask",l="",w=T[0],m=!1,d="",E(),o()}),(N=n.querySelector("button[data-pin-toggle]"))==null||N.addEventListener("click",()=>{m=!0,d="",b=document.title||"",x=null,E(),o()}),(z=n.querySelector("button[data-skip]"))==null||z.addEventListener("click",()=>u()),(O=n.querySelector("button[data-ignore]"))==null||O.addEventListener("click",()=>{P({type:"content:ignoreDomain",domain:j}),u()})}function u(){E(),s&&s.remove(),s=null,n=null,v=!1,y="list",l="",f=null,m=!1,b="",x=null,d=""}chrome.runtime.onMessage.addListener((i,k,L)=>((i==null?void 0:i.type)!=="flox:showAssignPrompt"||(X(),j=i.domain??"",$=i.workspaces??[],f=i.suggestedWorkspaceId??null,v=!1,y="list",l="",m=!1,b=document.title||"",x=null,d="",o(),S(),L({ok:!0})),!1));

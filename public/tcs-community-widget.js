(() => {
  "use strict";
  const activeScript = document.currentScript;
  const theme = activeScript && activeScript.dataset ? activeScript.dataset.theme || "tcs" : "tcs";
  const hostname = location.hostname.toLowerCase();
  if (theme === "webdev" && hostname !== "webdev.thechocostudios.bond" && hostname !== "webdev.choco-ai.xyz") return;
  if (document.getElementById("tcs-community-widget")) return;

  const palettes = {
    tcs:["#11100e","#191713","#f4eee4","#aaa08f","#d8bd8d","#17130d","rgba(216,189,141,.22)"],
    helpcenter:["#11100e","#191713","#f4eee4","#aaa08f","#d8bd8d","#17130d","rgba(216,189,141,.22)"],
    sheeblink:["#fffaf7","#fffdfb","#332824","#856f68","#c28e91","#fff","#ead8d2"],
    vornika:["#111018","#1a1825","#f4f0ff","#aaa4ba","#b9a3ff","#171323","rgba(185,163,255,.25)"],
    chocoai:["#15121f","#201b2c","#f4efff","#b0a8c2","#b8a0ff","#171323","rgba(184,160,255,.24)"],
    linkguard:["#101a28","#142235","#edf6fb","#a9bac8","#8ce6d1","#10201f","rgba(140,230,209,.25)"],
    template:["#f6f7f3","#fff","#20251f","#687166","#687c64","#fff","#dfe4da"],
    webdev:["#12110f","#1d1a16","#f4eee4","#aaa08f","#d8bd8d","#17130d","rgba(216,189,141,.22)"],
    gaming:["#17111f","#21182d","#f7f0ff","#b7a9c8","#c4a2f4","#1a1024","rgba(196,162,244,.25)"],
    eji:["#f7fff8","#fff","#173a36","#5c7770","#24aeb6","#fff","#d5ebe1"],
    legal:["#101827","#142033","#edf2ff","#a8b4ca","#a8c7ff","#13203a","rgba(168,199,255,.24)"]
  };
  const colors = palettes[theme] || palettes.tcs;
  const root = document.createElement("div");
  root.id = "tcs-community-widget";
  root.dataset.theme = theme;

  const css = [
    "#tcs-community-widget{--tcsc-bg:"+colors[0]+";--tcsc-panel:"+colors[1]+";--tcsc-text:"+colors[2]+";--tcsc-muted:"+colors[3]+";--tcsc-accent:"+colors[4]+";--tcsc-accent-text:"+colors[5]+";--tcsc-border:"+colors[6]+";position:fixed;right:clamp(12px,3vw,24px);bottom:clamp(12px,3vh,24px);z-index:2147483000;font-family:inherit;color:var(--tcsc-text);line-height:1.4}",
    "#tcs-community-widget[data-theme=helpcenter],#tcs-community-widget[data-theme=webdev]{left:clamp(12px,3vw,24px);right:auto}",
    "#tcs-community-widget *{box-sizing:border-box}",
    "#tcs-community-widget button,#tcs-community-widget a{font:inherit}",
    "#tcs-community-widget .tcsc-trigger{display:flex;align-items:center;gap:9px;min-height:48px;padding:0 15px;border:1px solid var(--tcsc-border);border-radius:999px;background:var(--tcsc-accent);color:var(--tcsc-accent-text);font-size:13px;font-weight:800;box-shadow:0 8px 28px rgba(0,0,0,.18);cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}",
    "#tcs-community-widget .tcsc-trigger:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,0,0,.22)}",
    "#tcs-community-widget .tcsc-trigger:focus-visible,#tcs-community-widget a:focus-visible,#tcs-community-widget .tcsc-close:focus-visible{outline:3px solid var(--tcsc-accent);outline-offset:3px}",
    "#tcs-community-widget .tcsc-icon{display:grid;place-items:center;width:23px;height:23px;border:1px solid currentColor;border-radius:50%;font-size:13px}",
    "#tcs-community-widget .tcsc-panel{position:absolute;right:0;bottom:calc(100% + 12px);width:min(366px,calc(100vw - 24px));max-height:min(72vh,570px);overflow:auto;padding:16px;border:1px solid var(--tcsc-border);border-radius:18px;background:var(--tcsc-panel);color:var(--tcsc-text);box-shadow:0 18px 58px rgba(0,0,0,.25)}",
    "#tcs-community-widget[data-theme=helpcenter] .tcsc-panel,#tcs-community-widget[data-theme=webdev] .tcsc-panel{left:0;right:auto}",
    "#tcs-community-widget .tcsc-panel[hidden]{display:none!important}",
    "#tcs-community-widget .tcsc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}",
    "#tcs-community-widget .tcsc-title{margin:0;color:var(--tcsc-text);font-size:16px;font-weight:800}",
    "#tcs-community-widget .tcsc-description{margin:4px 0 0;color:var(--tcsc-muted);font-size:11px;line-height:1.55}",
    "#tcs-community-widget .tcsc-close{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border:1px solid var(--tcsc-border);border-radius:50%;background:transparent;color:var(--tcsc-text);font-size:19px;cursor:pointer}",
    "#tcs-community-widget .tcsc-group{margin-top:14px}",
    "#tcs-community-widget .tcsc-group h3{margin:0 0 8px;color:var(--tcsc-muted);font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
    "#tcs-community-widget .tcsc-list{display:grid;gap:7px}",
    "#tcs-community-widget .tcsc-link{display:grid;grid-template-columns:34px minmax(0,1fr) 14px;align-items:center;gap:10px;min-height:50px;padding:8px 10px;border:1px solid var(--tcsc-border);border-radius:12px;background:var(--tcsc-bg);color:var(--tcsc-text);text-decoration:none;transition:border-color .18s ease,transform .18s ease}",
    "#tcs-community-widget .tcsc-link:hover{transform:translateY(-1px);border-color:var(--tcsc-accent)}",
    "#tcs-community-widget .tcsc-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--tcsc-accent);color:var(--tcsc-accent-text);font-size:10px;font-weight:900}",
    "#tcs-community-widget .tcsc-copy{display:grid;gap:2px;min-width:0}",
    "#tcs-community-widget .tcsc-copy strong{overflow-wrap:anywhere;color:var(--tcsc-text);font-size:12px;font-weight:800;line-height:1.3}",
    "#tcs-community-widget .tcsc-copy small{color:var(--tcsc-muted);font-size:10px;line-height:1.3}",
    "#tcs-community-widget .tcsc-arrow{color:var(--tcsc-muted);font-size:14px}",
    "@media(max-width:520px){#tcs-community-widget{right:12px;bottom:12px}#tcs-community-widget[data-theme=helpcenter],#tcs-community-widget[data-theme=webdev]{left:12px;right:auto}#tcs-community-widget .tcsc-trigger{min-height:46px;padding:0 13px}#tcs-community-widget .tcsc-panel{width:calc(100vw - 24px);max-height:70vh;padding:14px}}",
    "@media(prefers-reduced-motion:reduce){#tcs-community-widget .tcsc-trigger,#tcs-community-widget .tcsc-link{transition:none}}"
  ].join("\n");

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  root.innerHTML = '<button class="tcsc-trigger" type="button" aria-expanded="false" aria-controls="tcsc-community-panel"><span class="tcsc-icon" aria-hidden="true">↗</span><span>Komunitas TCS</span><span aria-hidden="true">⌃</span></button><section class="tcsc-panel" id="tcsc-community-panel" role="dialog" aria-label="Komunitas TCS" hidden><div class="tcsc-head"><div><h2 class="tcsc-title">Terhubung dengan komunitas</h2><p class="tcsc-description">Pilih saluran WhatsApp atau grup Facebook.</p></div><button class="tcsc-close" type="button" aria-label="Tutup panel komunitas">×</button></div><div class="tcsc-groups"></div></section>';

  const whatsapp = [
    ["Arabia","https://whatsapp.com/channel/0029VbEInjlJENxvx8QAow1V"],
    ["Global","https://whatsapp.com/channel/0029VbANzQeDzgT6qV5P2623"],
    ["Amerika Latin","https://whatsapp.com/channel/0029Vb9bJwx3QxRsTGxwgR0L"],
    ["Saluran resmi TCS","https://whatsapp.com/channel/0029VbDj294CRs1s4uu2ZI3T"]
  ];
  const facebook = [
    ["The Choco Studios Sharing","https://www.facebook.com/share/g/1GB8ivQdzy/"],
    ["UMKM Bersatu Promosi Jual Beli","https://www.facebook.com/share/g/19uLqnUvyk/"]
  ];

  function addGroup(label,entries,mark,type) {
    const group = document.createElement("section");
    group.className = "tcsc-group";
    const heading = document.createElement("h3");
    heading.textContent = label;
    const list = document.createElement("div");
    list.className = "tcsc-list";
    entries.forEach(function(entry) {
      const link = document.createElement("a");
      link.className = "tcsc-link";
      link.href = entry[1];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label",entry[0]+" ("+type+"), buka di tab baru");
      const badge = document.createElement("span");
      badge.className = "tcsc-mark";
      badge.setAttribute("aria-hidden","true");
      badge.textContent = mark;
      const copy = document.createElement("span");
      copy.className = "tcsc-copy";
      const title = document.createElement("strong");
      title.textContent = entry[0];
      const kind = document.createElement("small");
      kind.textContent = type;
      copy.append(title,kind);
      const arrow = document.createElement("span");
      arrow.className = "tcsc-arrow";
      arrow.setAttribute("aria-hidden","true");
      arrow.textContent = "↗";
      link.append(badge,copy,arrow);
      list.appendChild(link);
    });
    group.append(heading,list);
    root.querySelector(".tcsc-groups").appendChild(group);
  }

  addGroup("Saluran WhatsApp",whatsapp,"WA","Saluran WhatsApp");
  addGroup("Grup Facebook",facebook,"f","Grup Facebook");
  document.body.appendChild(root);

  const trigger = root.querySelector(".tcsc-trigger");
  const panel = root.querySelector(".tcsc-panel");
  const closeButton = root.querySelector(".tcsc-close");
  function setOpen(open,returnFocus) {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded",String(open));
    trigger.lastElementChild.textContent = open ? "⌄" : "⌃";
    if (open) closeButton.focus({preventScroll:true});
    else if (returnFocus) trigger.focus({preventScroll:true});
  }
  trigger.addEventListener("click",function(){setOpen(panel.hidden,false)});
  closeButton.addEventListener("click",function(){setOpen(false,true)});
  panel.addEventListener("click",function(event){if(event.target.closest("a"))setOpen(false,false)});
  document.addEventListener("pointerdown",function(event){if(!panel.hidden&&!root.contains(event.target))setOpen(false,false)});
  document.addEventListener("keydown",function(event){if(event.key==="Escape"&&!panel.hidden)setOpen(false,true)});
})();
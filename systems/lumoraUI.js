"use strict";
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI  —  in-chat interactive cards (HTML/CSS/JS inside WhatsApp)║
// ╠═══════════════════════════════════════════════════════════════════════╣
// ║  WHAT THIS IS                                                         ║
// ║  • sendLumoraUI(sock, chatId, html)  → the DELIVERY TRUCK.            ║
// ║  • buildLumoraPage({...})             → the CARGO (one self-contained ║
// ║                                         HTML page, no network, no CDN)║
// ║  • pill / bar / itemCard / tabBar / commandBox / toast  → components. ║
// ║                                                                       ║
// ║  RULE 1 — NEVER EDIT THE WRAPPER SHAPE. It is copied verbatim from a   ║
// ║  working dino.js plugin (Batman MD). Key order, the DONOTUSE typename  ║
// ║  and the forwardOrigin:4 all matter.                                  ║
// ║  RULE 2 — the card cannot send messages back. The bot decides          ║
// ║  everything and ships a snapshot; the card only displays + animates.   ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const CRYPTO_IMPORT = "crypto"; // dino.js does: await import('crypto')

// ─────────────────────────────────────────────────────────────────────────
// SECTION 1 — TRANSPORT (the sacred wrapper)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the richResponseMessage envelope that carries `html` as its payload.
 * Original dino.js body, byte for byte, with payload: DINO_HTML → payload: html.
 */
async function buildLumoraUIEnvelope(html) {
  const crypto = await import(CRYPTO_IMPORT);

  const gameData = {
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          unifiedResponse: {
            data: Buffer.from(JSON.stringify({
              __typename: "GenAIUnifiedResponse",
              response_id: crypto.randomUUID(),
              sections: [{
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
                    trusted_sources: [],
                    payload: html
                  }
                }
              }]
            })).toString("base64")
          },
          contextInfo: {
            isForwarded: true,
            forwardOrigin: 4
          }
        }
      }
    }
  };

  return gameData;
}

/** What is inside the base64 payload — handy for tests and debugging. */
function decodeLumoraPayload(base64) {
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

/**
 * Ship one HTML page into a chat as an interactive card.
 * @param {object} sock        Baileys socket (the bot's `feb`)
 * @param {string} chatId      destination jid
 * @param {string} html        full self-contained HTML page
 * @returns {Promise<object>}  the generated WAMessage
 */
async function sendLumoraUI(sock, chatId, html, opts) {
  const o = opts || {};
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("sendLumoraUI: html payload is empty");
  }

  const problems = checkHtml(html, { bridgeUrl: o.bridgeUrl, maxBytes: o.maxBytes });
  if (problems.length && process.env.LUMORA_UI_STRICT === "1") {
    throw new Error("sendLumoraUI: HTML check failed → " + problems.join("; "));
  }
  if (problems.length) {
    console.log("[lumora-ui] warnings:", problems.join("; "));
  }

  const gameData = await buildLumoraUIEnvelope(html);
  const { generateWAMessageFromContent } = await import("@whiskeysockets/baileys");
  const msg = await generateWAMessageFromContent(chatId, gameData, {});
  await sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });
  return msg;
}

/** Convenience: build a page and ship it in one call. */
async function sendLumoraCard(sock, chatId, pageOpts = {}) {
  const html = buildLumoraPage(pageOpts);
  return sendLumoraUI(sock, chatId, html);
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 2 — SHARED DESIGN SYSTEM (Lumora dark fantasy)
// ─────────────────────────────────────────────────────────────────────────

const RARITY_COLORS = {
  Common: "#9aa7b4",
  Uncommon: "#4ade80",
  Rare: "#38bdf8",
  Epic: "#a78bfa",
  Legendary: "#fbbf24",
  Mythic: "#f472b6",
};

const TONE_COLORS = {
  aura: ["#0ea5e9", "#7dd3fc"],
  hp: ["#dc2626", "#f87171"],
  xp: ["#7c3aed", "#a78bfa"],
  energy: ["#059669", "#34d399"],
  luc: ["#d97706", "#fbbf24"],
  gold: ["#b45309", "#facc15"],
  danger: ["#b91c1c", "#fb7185"],
  icy: ["#0891b2", "#67e8f9"],
};

const RARITY_RANK = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6 };

/** Never emit a value we do not control without escaping it first. */
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/** JSON that is safe to drop inside a <script> block (kills "<" breakouts). */
function safeJson(value) {
  return JSON.stringify(value === undefined ? null : value).replace(/</g, "\\u003c");
}

function rarityColor(rarity) {
  return RARITY_COLORS[rarity] || RARITY_COLORS.Common;
}

function rarityRank(rarity) {
  return RARITY_RANK[rarity] || 0;
}

function toneVars(tone) {
  const pair = TONE_COLORS[tone] || TONE_COLORS.aura;
  return "--c1:" + pair[0] + ";--c2:" + pair[1];
}

// ── The stylesheet every page shares (dino.js base + Lumora components) ──
const SHELL_CSS = String.raw`
*{-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;box-sizing:border-box}
:root{
--bg:#05070f;--panel:rgba(18,24,42,.94);--panel2:rgba(27,35,58,.94);
--line:rgba(255,255,255,.10);--txt:#e8edf7;--dim:rgba(232,237,247,.64);--faint:rgba(232,237,247,.38);
--gold:#f5c451;--aura:#7dd3fc;--hp:#f87171;--xp:#a78bfa;--luc:#fbbf24;--r:15px;
--common:#9aa7b4;--uncommon:#4ade80;--rare:#38bdf8;--epic:#a78bfa;--legendary:#fbbf24;--mythic:#f472b6
}
body{margin:0;background:transparent;font-family:Arial,'Helvetica Neue',sans-serif;color:var(--txt);touch-action:manipulation;cursor:default}
.wrap{width:100%;max-width:620px;margin:auto;padding:10px}
.card{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:0 10px 32px rgba(0,0,0,.45)}
.head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,rgba(125,211,252,.10),rgba(167,139,250,.10))}
.brand{font-size:9px;letter-spacing:2px;color:var(--faint);text-transform:uppercase}
.title{font-size:19px;font-weight:bold;color:#fff;letter-spacing:.4px;margin-top:3px}
.sub{font-size:10.5px;color:var(--dim);margin-top:3px}
.who{text-align:right;font-size:10px;color:var(--dim);line-height:1.7;min-width:86px}
.who b{color:#fff;font-weight:bold}
.who .luc{color:var(--luc);font-family:Consolas,monospace}
.main{padding:14px}
.foot{text-align:center;font-size:8.5px;color:rgba(255,255,255,.22);padding:8px 0;letter-spacing:.4px;border-top:1px solid var(--line)}
.sec{font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--faint);margin:15px 0 8px}
.sec:first-child{margin-top:0}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:4px;background:rgba(4,7,14,.55);border:1px solid var(--line);border-radius:13px;margin-bottom:12px}
.tab{flex:1 0 auto;min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border-radius:10px;font-size:12px;color:var(--dim);border:1px solid transparent;white-space:nowrap}
.tab.active{color:#fff;font-weight:bold;background:linear-gradient(180deg,rgba(125,211,252,.22),rgba(167,139,250,.16));border-color:rgba(125,211,252,.45);box-shadow:0 0 18px rgba(125,211,252,.18)}
.panel{display:none}
.panel.active{display:block;animation:fade .18s ease}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.pill{flex:1 1 116px;min-width:104px;padding:9px 11px;border-radius:12px;background:rgba(6,10,20,.6);border:1px solid var(--line)}
.pill .pl{font-size:8px;letter-spacing:1.4px;color:var(--faint);text-transform:uppercase}
.pill .pv{font:bold 15px Consolas,monospace;color:#fff;margin-top:3px}
.pill.good .pv{color:var(--uncommon)}
.pill.warn .pv{color:var(--gold)}
.pill.bad .pv{color:var(--hp)}
.bar{margin:0 0 10px}
.barTop{display:flex;justify-content:space-between;font-size:10px;color:var(--dim);margin-bottom:5px}
.barTop b{font-family:Consolas,monospace;color:#fff}
.track{height:9px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.06)}
.track i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--c1),var(--c2));transition:width .6s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 12px var(--c2)}
.grid{display:grid;grid-template-columns:1fr;gap:9px}
@media(min-width:430px){.grid{grid-template-columns:1fr 1fr}}
.item{position:relative;padding:11px;border-radius:13px;background:linear-gradient(180deg,rgba(16,22,38,.95),rgba(10,14,26,.95));border:1px solid var(--line);border-left:3px solid var(--rc);box-shadow:0 6px 18px rgba(0,0,0,.35)}
.item:after{content:'';position:absolute;inset:-1px;border-radius:13px;pointer-events:none;box-shadow:inset 0 0 22px -11px var(--rc)}
.itemTop{display:flex;align-items:center;gap:9px}
.ico{font-size:19px;filter:drop-shadow(0 0 8px var(--rc))}
.nm{font-size:13px;font-weight:bold;color:#fff;line-height:1.25;flex:1}
.rar{display:block;font-size:8px;letter-spacing:1.3px;text-transform:uppercase;color:var(--rc);margin-top:2px}
.qty{font:bold 12px Consolas,monospace;color:var(--gold);background:rgba(245,196,81,.12);border:1px solid rgba(245,196,81,.3);border-radius:8px;padding:3px 7px;white-space:nowrap}
.meta{font-size:10px;color:var(--faint);margin-top:7px;line-height:1.45}
.body{max-height:0;overflow:hidden;transition:max-height .28s ease;font-size:11px;color:var(--dim)}
.item.open .body{max-height:460px}
.bodyIn{padding-top:9px;border-top:1px dashed rgba(255,255,255,.12);margin-top:9px;line-height:1.55}
.cmd{margin-top:9px;padding:9px 10px;border-radius:11px;background:rgba(125,211,252,.09);border:1px solid rgba(125,211,252,.35)}
.cmdL{font-size:8px;letter-spacing:1.4px;color:var(--aura);text-transform:uppercase}
.cmdT{font:bold 13px Consolas,monospace;color:#fff;margin-top:3px;word-break:break-all}
.cmdN{font-size:9px;color:var(--faint);margin-top:3px}
.toast{margin-top:10px;padding:9px 11px;border-radius:11px;font-size:10.5px;color:var(--dim);background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.16);text-align:center;transition:background .2s ease}
.toast.ok{color:#d8ffe8;border-color:rgba(74,222,128,.45);background:rgba(74,222,128,.10)}
.empty{text-align:center;padding:26px 14px;color:var(--faint);font-size:11.5px;line-height:1.6}
.empty .big{font-size:30px;display:block;margin-bottom:8px;opacity:.75}
.hint{font-size:9.5px;color:var(--faint);margin-top:10px;text-align:center;line-height:1.6}
.reveal{animation:reveal .5s cubic-bezier(.2,.9,.2,1)}
@keyframes reveal{0%{opacity:0;transform:scale(.94)}100%{opacity:1;transform:scale(1)}}
.orb{width:96px;height:96px;border-radius:50%;margin:6px auto 14px;background:radial-gradient(circle at 35% 30%,#fff,rgba(167,139,250,.85) 42%,rgba(56,189,248,.25) 72%,transparent);box-shadow:0 0 42px rgba(167,139,250,.55)}
.btn{display:block;width:100%;min-height:44px;margin-top:8px;border-radius:11px;border:1px solid rgba(125,211,252,.45);background:linear-gradient(180deg,rgba(125,211,252,.22),rgba(167,139,250,.16));color:#fff;font:bold 12px Arial,sans-serif;letter-spacing:.3px}
.btn.ghost{background:transparent;border-color:var(--line);color:var(--dim)}
.btn.bad{border-color:rgba(248,113,113,.5);background:linear-gradient(180deg,rgba(248,113,113,.22),rgba(190,24,93,.14))}
.statusline{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10.5px;color:var(--dim);padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.08)}
.statusline b{font:bold 11px Consolas,monospace;color:#fff;text-align:right}
`;

// ── The only JavaScript every page shares: tabs, copy, expand, toast ──
const SHELL_JS = String.raw`
(function(){
function qa(sel,root){try{return (root||document).querySelectorAll(sel)}catch(e){return []}}
function strip(el,cls){try{el.className=(el.className||'').replace(new RegExp(' '+cls,'g'),'')}catch(e){}}
function add(el,cls){try{if((el.className||'').indexOf(cls)<0)el.className=(el.className||'')+' '+cls}catch(e){}}
function toast(msg,ok){
  try{
    var t=document.getElementById('lum-toast');
    if(!t)return;
    t.textContent=msg;
    t.className='toast'+(ok?' ok':'');
    if(t._t)clearTimeout(t._t);
    t._t=setTimeout(function(){t.className='toast';t.textContent=t.getAttribute('data-default')||msg},2400);
  }catch(e){}
}
function tap(el,fn){
  try{el.addEventListener('pointerdown',function(e){try{e.preventDefault();e.stopPropagation()}catch(x){};fn(e)})}catch(e){}
}
function activate(id){
  var all=qa('[data-tabbtn]'),i;
  for(i=0;i<all.length;i++){if(all[i].getAttribute('data-tabbtn')===id)add(all[i],'active');else strip(all[i],'active')}
  var panels=qa('[data-panel]');
  for(i=0;i<panels.length;i++){if(panels[i].getAttribute('data-panel')===id)add(panels[i],'active');else strip(panels[i],'active')}
}
window.LUM={toast:toast,activate:activate};
var list=qa('[data-tabbtn]'),i;
for(i=0;i<list.length;i++){(function(btn){tap(btn,function(){
  var id=btn.getAttribute('data-tabbtn');
  activate(id);
  try{localStorage.setItem('lum_tab_'+document.title,id)}catch(e){}
})})(list[i])}
list=qa('[data-copy]');
for(i=0;i<list.length;i++){(function(el){tap(el,function(){
  var cmd=el.getAttribute('data-copy')||'';
  var done=function(ok){toast(ok?('Copied — paste in chat: '+cmd):('Type this in chat: '+cmd),ok)};
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(cmd).then(function(){done(true)},function(){done(false)});
      return;
    }
  }catch(e){}
  done(false);
})})(list[i])}
list=qa('[data-toggle]');
for(i=0;i<list.length;i++){(function(el){tap(el,function(){
  if((el.className||'').indexOf('open')>-1)strip(el,'open');else add(el,'open');
})})(list[i])}
/* LUMORA_SEND_START */
function lumoraCtx(){
  var host=document.querySelector('[data-lumora-token]');
  if(!host)return {url:'',token:''};
  return {url:host.getAttribute('data-lumora-url')||'',token:host.getAttribute('data-lumora-token')||''};
}
window.LUMORA_CHANNELS={A:'untried',B:'untried',C:'untried',last:'',errors:''};
function lumoraMark(ch,value){
  try{window.LUMORA_CHANNELS[ch]=value;}catch(e){}
  try{
    var el=document.getElementById('lum-channel-'+ch);
    if(el)el.textContent=value;
  }catch(e){}
}
window.LUMORA_MARK=lumoraMark;
window.LUMORA_SEND=function(action,params,opts){
  opts=opts||{};
  var ctx=lumoraCtx();
  var said=false;
  if(!ctx.url||!ctx.token){
    toast('This card has no bridge link — use the command below.',false);
    return false;
  }
  try{
    if(typeof fetch==='function'){
      var body=JSON.stringify({token:ctx.token,action:action,params:params||{},channel:'A-post'});
      fetch(ctx.url+'/lumora/act',{method:'POST',headers:{'Content-Type':'application/json'},body:body,mode:'cors',keepalive:true})
        .then(function(r){return r.text()})
        .then(function(t){
          var j=null;
          try{j=JSON.parse(t)}catch(e){}
          if(j&&j.ok){lumoraMark('A','ok');toast('Sent — the bot answers in the chat.',true);}
          else{lumoraMark('A','refused');toast((j&&j.message)?j.message:'The bot refused that.',false);}
        })
        .catch(function(e){lumoraMark('A',(e&&e.name)?e.name:'error');});
      said=true;
    }
  }catch(e){lumoraMark('A',(e&&e.name)?e.name:'error');}
  try{
    if(typeof navigator.sendBeacon==='function'&&typeof Blob==='function'){
      var b=JSON.stringify({token:ctx.token,action:action,params:params||{},channel:'B-beacon'});
      var queued=navigator.sendBeacon(ctx.url+'/lumora/act',new Blob([b],{type:'application/json'}));
      lumoraMark('B',queued?'queued':'refused');
    }else{lumoraMark('B','unavailable');}
  }catch(e){lumoraMark('B',(e&&e.name)?e.name:'error');}
  if(opts.image===true){
    try{
      var img=new Image();
      img.onerror=function(){lumoraMark('C','blocked');};
      img.onload=function(){lumoraMark('C','ok');};
      img.src=ctx.url+'/lumora/act?t='+encodeURIComponent(ctx.token)+'&a='+encodeURIComponent(action)+'&ch=C-image&p='+encodeURIComponent(JSON.stringify(params||{}));
    }catch(e){lumoraMark('C',(e&&e.name)?e.name:'error');}
  }
  if(said)toast('Sent — watch the chat for the bot\u2019s answer.',false);
  return true;
};
window.LUMORA_BRIDGE=lumoraCtx;
var actBtns=qa('[data-lumora-act]'),k;
for(k=0;k<actBtns.length;k++){(function(btn){tap(btn,function(){
  var act=btn.getAttribute('data-lumora-act')||'';
  var raw=btn.getAttribute('data-lumora-params')||'{}';
  var prm={};
  try{prm=JSON.parse(raw)}catch(e){prm={}}
  window.LUMORA_SEND(act,prm,{image:btn.getAttribute('data-lumora-image')==='1'});
})})(actBtns[k])}
/* LUMORA_SEND_END */
try{
  var last=localStorage.getItem('lum_tab_'+document.title);
  if(last)activate(last);
}catch(e){}
})();
`;

// ─────────────────────────────────────────────────────────────────────────
// SECTION 3 — COMPONENT BUILDERS (all reuse the styles above)
// ─────────────────────────────────────────────────────────────────────────

function pill(opts) {
  opts = opts || {};
  const cls = "pill" + (opts.tone === "good" || opts.tone === "warn" || opts.tone === "bad" ? " " + opts.tone : "");
  return '<div class="' + cls + '">' +
    '<div class="pl">' + (opts.icon ? escapeHtml(opts.icon) + " " : "") + escapeHtml(opts.label || "") + "</div>" +
    '<div class="pv">' + escapeHtml(opts.value == null ? "" : opts.value) + "</div>" +
    "</div>";
}

function pillRow(pills) {
  return '<div class="pills">' + (pills || []).map(pill).join("") + "</div>";
}

function bar(opts) {
  opts = opts || {};
  const value = Number(opts.value) || 0;
  const max = Number(opts.max) > 0 ? Number(opts.max) : 100;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const right = opts.right ? " · " + escapeHtml(opts.right) : "";
  return '<div class="bar">' +
    '<div class="barTop"><span>' + escapeHtml(opts.label || "") + "</span>" +
    "<b>" + escapeHtml(Math.round(value)) + " / " + escapeHtml(Math.round(max)) + right + "</b></div>" +
    '<div class="track" style="' + toneVars(opts.tone) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    "</div>";
}

function section(title) {
  return '<div class="sec">' + escapeHtml(title || "") + "</div>";
}

function commandBox(cmd, note, opts) {
  opts = opts || {};
  const copyAttr = opts.noCopy ? "" : ' data-copy="' + escapeHtml(cmd) + '"';
  return '<div class="cmd"' + copyAttr + ">" +
    '<div class="cmdL">' + escapeHtml(opts.label || (opts.noCopy ? "COMMAND" : "TAP TO COPY")) + "</div>" +
    '<div class="cmdT">' + escapeHtml(cmd) + "</div>" +
    (note ? '<div class="cmdN">' + escapeHtml(note) + "</div>" : "") +
    "</div>";
}

function itemCard(opts) {
  opts = opts || {};
  const rc = rarityColor(opts.rarity);
  const parts = [
    '<div class="item" data-toggle="1"' + (opts.id ? ' data-id="' + escapeHtml(opts.id) + '"' : "") + ' style="--rc:' + rc + '">',
    '<div class="itemTop">',
    '<span class="ico">' + escapeHtml(opts.icon || "📦") + "</span>",
    '<div class="nm">' + escapeHtml(opts.name || "Unknown") +
    '<span class="rar">' + escapeHtml(opts.rarity || "Common") + "</span></div>",
  ];
  if (opts.qty != null) parts.push('<span class="qty">×' + escapeHtml(opts.qty) + "</span>");
  parts.push("</div>");
  if (opts.meta) parts.push('<div class="meta">' + escapeHtml(opts.meta) + "</div>");
  const body = [];
  if (opts.details) body.push('<div class="bodyIn">' + escapeHtml(opts.details) + "</div>");
  if (opts.cmd) body.push(commandBox(opts.cmd, opts.cmdNote));
  if (body.length) parts.push('<div class="body">' + body.join("") + "</div>");
  parts.push("</div>");
  return parts.join("");
}

function tileGrid(cards) {
  return '<div class="grid">' + (cards || []).join("") + "</div>";
}

function tabBar(tabs) {
  tabs = tabs || [];
  return '<div class="tabs">' + tabs.map(function (t, i) {
    return '<div class="tab' + (i === 0 ? " active" : "") + '" data-tabbtn="' + escapeHtml(t.id) + '">' +
      (t.icon ? "<span>" + escapeHtml(t.icon) + "</span>" : "") +
      escapeHtml(t.label || t.id) + "</div>";
  }).join("") + "</div>";
}

function panel(id, inner, active) {
  return '<div class="panel' + (active ? " active" : "") + '" data-panel="' + escapeHtml(id) + '">' + (inner || "") + "</div>";
}

function toastLine(text) {
  const t = text || "Ready.";
  return '<div class="toast" id="lum-toast" data-default="' + escapeHtml(t) + '">' + escapeHtml(t) + "</div>";
}

/**
 * A tap button. Every button on every screen goes through LUMORA_SEND —
 * never fetch directly — so there is one place to change if a channel turns
 * out to be blocked. Set image:true only for read-only actions.
 */
function actionButton(opts) {
  const o = opts || {};
  const attrs = [
    'data-lumora-act="' + escapeHtml(o.action || "") + '"',
    'data-lumora-params="' + escapeHtml(JSON.stringify(o.params || {})) + '"',
  ];
  if (o.image === true) attrs.push('data-lumora-image="1"');
  if (o.id) attrs.push('id="' + escapeHtml(o.id) + '"');
  return '<button class="btn' + (o.tone ? " " + escapeHtml(o.tone) : "") + '" ' + attrs.join(" ") + ">" +
    escapeHtml(o.label || o.action || "Do it") + "</button>";
}

/** Label + live value, updated from the page script with textContent. */
function statusRow(label, id, initial) {
  return '<div class="statusline"><span>' + escapeHtml(label || "") + '</span>' +
    '<b id="' + escapeHtml(id || "") + '">' + escapeHtml(initial == null ? "…" : initial) + "</b></div>";
}

function emptyState(icon, title, hint) {
  return '<div class="empty"><span class="big">' + escapeHtml(icon || "🌌") + "</span>" +
    escapeHtml(title || "Nothing here yet") +
    (hint ? "<br>" + escapeHtml(hint) : "") + "</div>";
}

function hint(text) {
  return '<div class="hint">' + escapeHtml(text || "") + "</div>";
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 4 — THE PAGE SHELL
// ─────────────────────────────────────────────────────────────────────────

function buildWhoLine(player, stats) {
  const p = player || {};
  const s = stats || {};
  const name = s.name || p.username || p.name || "Lumorian";
  const level = s.level != null ? s.level : p.level;
  const lucons = s.lucons != null ? s.lucons : p.lucons;
  const rows = ["<div><b>" + escapeHtml(name) + "</b></div>"];
  if (level != null) rows.push("<div>Level " + escapeHtml(level) + "</div>");
  if (lucons != null) rows.push('<div class="luc">🪙 ' + escapeHtml(lucons) + "</div>");
  return '<div class="who">' + rows.join("") + "</div>";
}

/**
 * One shared shell for every Lumora card.
 * @param {object} opts
 *   title      card title (also used as the tab-memory key)
 *   subtitle   small line under the title
 *   brand      tiny uppercase label (default LUMORA)
 *   bodyHtml   already-built component HTML
 *   script     page-local JS — NO backticks, NO ${} (use string concatenation)
 *   player     player object for the header (username/level/lucons)
 *   stats      overrides for the header values, e.g. { name, level, lucons }
 *   extraCss   page-specific CSS appended to the shared sheet
 *   foot       footer text
 */
function buildLumoraPage(opts) {
  opts = opts || {};
  const title = String(opts.title || "Lumora");
  const brand = String(opts.brand || "LUMORA");
  const subtitle = opts.subtitle ? '<div class="sub">' + escapeHtml(opts.subtitle) + "</div>" : "";
  const extraCss = opts.extraCss ? String(opts.extraCss) : "";
  const script = opts.script ? String(opts.script) : "";
  const foot = opts.foot ? String(opts.foot) : brand + " · in-chat card";
  // The bridge link travels as attributes, never as a template literal, so the
  // page stays free of `${` artefacts. See LUMORA_SEND in the shared script.
  const bridge = opts.bridge || null;
  const bridgeAttrs = bridge && bridge.token
    ? ' data-lumora-url="' + escapeHtml(bridge.url || "") + '" data-lumora-token="' + escapeHtml(bridge.token) + '"'
    : "";

  return "<!DOCTYPE html><html><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>" +
    "<title>" + escapeHtml(title) + "</title>" +
    "<style>" + SHELL_CSS + extraCss + "</style></head><body>" +
    '<div class="wrap"' + bridgeAttrs + '><div class="card">' +
    '<div class="head"><div><div class="brand">' + escapeHtml(brand) +
    '</div><div class="title">' + escapeHtml(title) + "</div>" + subtitle + "</div>" +
    buildWhoLine(opts.player, opts.stats) +
    "</div>" +
    '<div class="main">' + String(opts.bodyHtml || "") + "</div>" +
    '<div class="foot">' + escapeHtml(foot) + "</div>" +
    "</div></div>" +
    "<script>" + SHELL_JS + "\n" + script + "</" + "script>" +
    "</body></html>";
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 5 — GUARDS (catch the mistakes that silently break a card)
// ─────────────────────────────────────────────────────────────────────────

const HTML_MAX_BYTES = 30 * 1024;
const SEND_BLOCK = /\/\* LUMORA_SEND_START \*\/[\s\S]*?\/\* LUMORA_SEND_END \*\//g;

/** The page's JavaScript, concatenated — so label text cannot trip the guards. */
function scriptBodies(html) {
  const blocks = String(html || "").match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  return blocks.join("\n");
}

/** The bridge URL a page declares for itself (empty when it carries none). */
function pageBridgeUrl(html) {
  const m = /data-lumora-url="([^"]*)"/.exec(String(html || ""));
  return m ? m[1] : "";
}

/**
 * The guardrails. Network calls are allowed in exactly one place — the shared
 * LUMORA_SEND helper — and every absolute URL in the page must point at the
 * card's own bridge URL. Everything else is banned, as before.
 */
function checkHtml(html, opts) {
  const o = opts || {};
  const problems = [];
  if (typeof html !== "string") return ["payload is not a string"];

  const bridgeUrl = String(o.bridgeUrl != null ? o.bridgeUrl : pageBridgeUrl(html));
  // Code checks look at the page's JavaScript only — a button LABEL that
  // happens to read "Ping via fetch (row 4)" is not a network call. The one
  // exception is the shared LUMORA_SEND helper, whose block is removed first.
  const script = scriptBodies(html).replace(SEND_BLOCK, "");
  const body = html.replace(SEND_BLOCK, "");

  if (html.indexOf("`") !== -1) problems.push("contains a backtick");
  if (html.indexOf("${") !== -1) problems.push("contains an unreplaced ${");
  if (/\bundefined\b/.test(html)) problems.push("contains the literal undefined");
  if (/<script[^>]+src=/i.test(html)) problems.push("loads an external script");
  if (/<link[^>]+href=/i.test(html)) problems.push("loads an external stylesheet");
  if (/\bfetch\s*\(/.test(script)) problems.push("calls fetch() outside LUMORA_SEND");
  if (/\bXMLHttpRequest\b/.test(script)) problems.push("uses XMLHttpRequest outside LUMORA_SEND");
  if (/\bwindow\.open\s*\(/.test(script)) problems.push("calls window.open()");
  if (/\balert\s*\(/.test(script)) problems.push("calls alert()");
  if (/innerHTML\s*=/.test(script)) problems.push("assigns innerHTML");
  if (/\son\w+\s*=\s*["'][^"']*\b(fetch|XMLHttpRequest|window\.open|alert)\b/i.test(html)) {
    problems.push("inline event handler runs network or dialog code");
  }

  // Every absolute URL in the page — including an <img src> for the image
  // channel — must point at the card's own bridge. Anything else is refused,
  // so a card cannot phone home to a third party.
  const urls = html.match(/https?:\/\/[^\s"'`)<]+/g) || [];
  const foreign = bridgeUrl
    ? urls.filter((u) => u.indexOf(bridgeUrl) !== 0)
    : urls;
  if (foreign.length) problems.push("external URL: " + foreign[0]);

  const limit = Number(o.maxBytes) > 0 ? Number(o.maxBytes) : HTML_MAX_BYTES;
  if (byteSize(html) > limit) problems.push("page is " + byteSize(html) + " bytes (limit " + limit + ")");
  return problems;
}

/**
 * Everything a card needs to try talking back: the bridge URL plus a token
 * that is scoped to this player, this card and a short list of actions.
 * Returns {url:"", token:"", enabled:false} when the bridge is off, which
 * simply means the card falls back to the command box.
 */
function bridgeContext(opts) {
  const o = opts || {};
  try {
    const bridge = require("./lumoraBridge");
    const url = bridge.publicUrl();
    if (!bridge.isEnabled() || !url) return { url: "", token: "", enabled: false };
    return {
      url,
      token: bridge.mintToken({
        playerId: o.playerId,
        chatId: o.chatId,
        cardId: o.cardId,
        allowedActions: o.actions,
        ttlMs: o.ttlMs,
      }),
      enabled: true,
    };
  } catch (e) {
    return { url: "", token: "", enabled: false, error: (e && e.message) || String(e) };
  }
}

function byteSize(str) {
  return Buffer.byteLength(String(str), "utf8");
}

module.exports = {
  // transport
  sendLumoraUI,
  sendLumoraCard,
  buildLumoraUIEnvelope,
  decodeLumoraPayload,
  // page shell
  buildLumoraPage,
  escapeHtml,
  safeJson,
  // components
  pill,
  pillRow,
  bar,
  section,
  commandBox,
  itemCard,
  tileGrid,
  tabBar,
  panel,
  toastLine,
  emptyState,
  hint,
  actionButton,
  statusRow,
  // theme
  RARITY_COLORS,
  TONE_COLORS,
  rarityColor,
  rarityRank,
  // bridge (tokens for card taps)
  bridgeContext,
  pageBridgeUrl,
  scriptBodies,
  // guards
  checkHtml,
  byteSize,
  HTML_MAX_BYTES,
};

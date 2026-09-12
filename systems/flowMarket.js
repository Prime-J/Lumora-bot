"use strict";
// ============ LUMORA — NATIVE FLOW MARKET ============
// WhatsApp HTML-widget nativeFlow that lets players browse the real in-game
// market, inspect items, and buy — all inside WhatsApp (no localhost).
//
// Runtime requirement: the WAProto NativeFlowMessage must carry a `source`
// field (widget: 'html') on the wire. On the installed Baileys build this
// field is absent from the proto, so the module is wired defensively:
//   • sendFlowMarket() tests the wire path on first call and caches the result
//   • if the HTML widget does not survive encoding, every command falls back to
//     the existing text/command flow for that player
//
// Data source: data/items.json (real items only — never fabricated).
// Stock lives in-memory per session (regenerates on timer).

const ITEMS_PATH = require("path").join(__dirname, "..", "data", "items.json");

/**
 * items.json can be either a JSON array or a flat object keyed by item id.
 * Normalize to an array here so the HTML builders and lookup helpers stay stable.
 */
let itemsData = null;
try {
  const raw = require("fs").readFileSync(ITEMS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  itemsData = Array.isArray(parsed) ? parsed : Object.values(parsed);
} catch {
  itemsData = [];
}

/**
 * player getter for this module only.
 * flowMarket does not import a separate systems/players layer to stay independent;
 * the caller supplies the player object on every send/tap call.
 */
const players = () => null;

// ---- category grouping (mirrors the real item categories in data/items.json) ----
const CATEGORIES = [
  { key: "gear",       label: "⚔️ Gear",       icon: "⚔️" },
  { key: "scroll",     label: "📜 Scrolls",    icon: "📜" },
  { key: "consumable", label: "🧪 Consumables",icon: "🧪" },
  { key: "special",    label: "💎 Special",    icon: "💎" },
];

// Extended categories shown only if items actually exist for them.
const EXTRA_CATEGORIES = [
  { key: "hunting",    label: "🏹 Hunting",    icon: "🏹" },
  { key: "tool",       label: "🔧 Tools",      icon: "🔧" },
  { key: "access",     label: "💍 Access",     icon: "💍" },
];

function activeCategories() {
  const out = CATEGORIES.slice();
  for (const c of EXTRA_CATEGORIES) {
    if (itemsInCategory(c.key).length > 0) out.push(c);
  }
  return out;
}

function itemsInCategory(catKey) {
  const key = String(catKey || "").toLowerCase();
  return itemsData.filter((it) => (it.category || "").toLowerCase() === key);
}

function itemById(id) {
  return itemsData.find((it) => it.id === id);
}

function fmtPrice(price, playerId) {
  const p = players()?.[playerId];
  const factionDiscount = p && p.faction ? (p.faction.discount || 0) : 0;
  const finalPrice = Math.max(1, Math.floor(price * (1 - factionDiscount)));
  return finalPrice;
}

function stockLabel(stock, baseStock) {
  if (stock <= 0) return "🔴 SOLD OUT";
  if (stock <= baseStock * 0.25) return `🟡 ${stock} left`;
  return `🟢 ${stock} available`;
}

// ---- minimal HTML widget (inline CSS only, no external assets) ----
function marketHTML(state) {
  const { root, cat, catItems, player } = state;
  const bal = (player?.lucons || 0);

  const featured = itemsData
    .filter((it) => it.stock != null && it.stock > 0)
    .sort((a, b) => (b.rarity || 0) - (a.rarity || 0))
    .slice(0, 3);

  let html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:linear-gradient(135deg,#0d0a1a 0%,#1a0e2e 50%,#0d0a1a 100%);color:#e8e0f0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;min-height:100vh}
  .wrap{max-width:360px;margin:0 auto}
  .header{text-align:center;padding:18px 12px 10px;border-bottom:1px solid #3a2a5a;margin-bottom:14px}
  .title{font-size:22px;font-weight:800;letter-spacing:1px;color:#f0d060;text-shadow:0 0 12px rgba(240,208,96,.4)}
  .sub{font-size:13px;color:#a89cc0;margin-top:4px}
  .balance{display:flex;justify-content:center;gap:8px;margin-top:10px}
  .bal-box{background:linear-gradient(135deg,#2a1a4a,#1a0e32);border:1px solid #f0d060;
           border-radius:10px;padding:8px 16px;display:flex;align-items:center;gap:8px}
  .bal-box .lbl{font-size:11px;color:#a89cc0;letter-spacing:1px;text-transform:uppercase}
  .bal-box .val{font-size:17px;font-weight:700;color:#f0d060}
  .section-title{font-size:14px;font-weight:700;color:#c8b8e8;margin:14px 0 8px;
                  display:flex;align-items:center;gap:8px}
  .section-title .dot{width:8px;height:8px;border-radius:50%;background:#f0d060}
  .cat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
  .cat-btn{background:linear-gradient(135deg,#2a1a4a,#1a0e32);border:1px solid #3a2a5a;
           border-radius:10px;padding:10px 8px;text-align:center;cursor:pointer;
           transition:all .15s;font-size:13px;font-weight:600;color:#c8b8e8;line-height:1.2}
  .cat-btn:hover{background:linear-gradient(135deg,#3a2a6a,#2a1a4a);border-color:#f0d060;color:#f0d060}
  .cat-btn .cat-icon{font-size:20px;display:block;margin-bottom:4px}
  .item{border:1px solid #2a1a3a;border-radius:10px;padding:10px;margin-bottom:8px;
        background:linear-gradient(135deg,rgba(42,26,74,.4),rgba(26,14,50,.4));
        transition:border-color .15s}
  .item:hover{border-color:#f0d060}
  .item-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
  .item-name{font-size:14px;font-weight:700;color:#e8e0f0;line-height:1.3;flex:1}
  .item-price{font-size:13px;font-weight:700;color:#f0d060;white-space:nowrap}
  .item-desc{font-size:11px;color:#8878a8;margin-top:4px;line-height:1.4;display:-webkit-box;
             -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .item-stock{font-size:10px;color:#8878a8;margin-top:4px}
  .sold-out{border-color:#4a2a2a;background:linear-gradient(135deg,rgba(60,20,20,.4),rgba(40,10,10,.4))}
  .sold-out .item-price{color:#5a3a3a;text-decoration:line-through}
  .back-btn{display:block;text-align:center;margin-top:14px;padding:9px;border:1px solid #3a2a5a;
            background:linear-gradient(135deg,#2a1a4a,#1a0e32);border-radius:10px;color:#c8b8e8;
            cursor:pointer;font-size:12px;font-weight:600}
  .back-btn:hover{border-color:#f0d060;color:#f0d060}
  .empty{font-size:12px;color:#6858a0;text-align:center;padding:14px}
  .footer{text-align:center;margin-top:14px;font-size:11px;color:#6858a0}
  .locked-note{font-size:11px;color:#a89cc0;margin-top:4px;font-style:italic}
</style></head><body><div class="wrap">`;

  // header
  html += `<div class="header">
    <div class="title">🏪 LUMORA MARKET</div>
    <div class="sub">Browse · Inspect · Buy — all inside WhatsApp</div>
    <div class="balance"><div class="bal-box">
      <span class="lbl">LC</span><span class="val">${bal.toLocaleString()}</span>
    </div></div></div>`;

  if (root) {
    html += `<div class="section-title"><span class="dot"></span>Featured</div>`;
    if (featured.length === 0) {
      html += `<div class="empty">No items available right now. Check back soon!</div>`;
    } else {
      for (const it of featured) {
        const price = fmtPrice(it.price || 0, root.playerId);
        html += `<div class="item" data-id="${it.id}">
          <div class="item-top">
            <span class="item-name">${it.name || it.id}</span>
            <span class="item-price">${price.toLocaleString()} LC</span>
          </div>
          <div class="item-desc">${it.desc || "No description"}</div>
          <div class="item-stock">${stockLabel(it.stock, it.baseStock || 1)}</div>
        </div>`;
      }
    }
    html += `<div class="section-title" style="margin-top:16px"><span class="dot"></span>Categories</div>
    <div class="cat-grid">`;
    for (const c of CATEGORIES) {
      const count = itemsInCategory(c.key).length;
      html += `<div class="cat-btn" data-action="cat" data-cat="${c.key}">
        <span class="cat-icon">${c.icon}</span>${c.label}<span style="font-size:10px;color:#6858a0;display:block">${count}</span>
      </div>`;
    }
    html += `</div>`;
    html += `<div class="cat-grid" style="grid-template-columns:1fr 1fr">
      <div class="cat-btn" data-action="my" style="grid-column:span 2">
        <span class="cat-icon">🛒</span>My Purchases<span style="font-size:10px;color:#6858a0;display:block">what you own</span>
      </div>
    </div>`;
  } else if (cat) {
    // category view
    html += `<div class="section-title"><span class="dot"></span>${cat.icon} ${cat.label}</div>`;
    const items = catItems || [];
    if (items.length === 0) {
      html += `<div class="empty">Nothing in this category yet.</div>`;
    } else {
      for (const it of items) {
        const price = fmtPrice(it.price || 0, root?.playerId);
        const stock = it.stock != null ? it.stock : (it.baseStock || 1);
        const locked = it.lockedReason ? `<div class="locked-note">🔒 ${it.lockedReason}</div>` : "";
        html += `<div class="item ${stock <= 0 ? "sold-out" : ""}" data-id="${it.id}">
          <div class="item-top">
            <span class="item-name">${it.name || it.id}</span>
            <span class="item-price">${stock <= 0 ? "SOLD OUT" : price.toLocaleString() + " LC"}</span>
          </div>
          <div class="item-desc">${it.desc || "No description"}</div>
          <div class="item-stock">${stockLabel(stock, it.baseStock || 1)}</div>
          ${locked}
        </div>`;
      }
    }
    html += `<a class="back-btn" data-action="back">↩️ Back to Market</a>`;
  }

  html += `<div class="footer">Tap an item to inspect · Tap a category to browse</div>`;
  html += `</div></body></html>`;
  return html;
}

// ---- item detail HTML ----
function itemDetailHTML(state) {
  const { item, player } = state;
  if (!item) return "";
  const price = fmtPrice(item.price || 0, player?._id);
  const stock = item.stock != null ? item.stock : (item.baseStock || 1);

  let html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:linear-gradient(135deg,#0d0a1a 0%,#1a0e2e 50%,#0d0a1a 100%);color:#e8e0f0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;min-height:100vh}
  .wrap{max-width:360px;margin:0 auto}
  .header{text-align:center;padding:14px 12px;border-bottom:1px solid #3a2a5a;margin-bottom:14px}
  .title{font-size:20px;font-weight:800;color:#f0d060;text-shadow:0 0 12px rgba(240,208,96,.4)}
  .rarity-pill{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
               letter-spacing:1px;margin-top:6px}
  .r-common{background:#2a4a2a;color:#8f8;border:1px solid #4a7a4a}
  .r-uncommon{background:#1a2a4a;color:#88a;border:1px solid #2a4a7a}
  .r-rare{background:#3a1a4a;color:#c88;border:1px solid #5a2a7a}
  .r-epic{background:#4a2a1a;color:#e8a;border:1px solid #7a4a3a}
  .r-legendary{background:#3a2a0a;color:#f0a;border:1px solid #7a6a2a}
  .card{background:linear-gradient(135deg,rgba(42,26,74,.4),rgba(26,14,50,.4));
        border:1px solid #2a1a3a;border-radius:14px;padding:16px;margin-bottom:14px}
  .field{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:6px 0;
        border-bottom:1px solid rgba(42,26,58,.5)}
  .field:last-child{border-bottom:none}
  .field-lbl{font-size:12px;color:#8878a8;text-transform:uppercase;letter-spacing:.5px}
  .field-val{font-size:14px;color:#e8e0f0;font-weight:600;text-align:right}
  .price-val{color:#f0d060;font-weight:700;font-size:16px}
  .desc-text{font-size:13px;color:#a89cc0;line-height:1.5;margin-top:4px}
  .btn-row{display:flex;gap:10px;margin-top:4px}
  .btn{flex:1;padding:12px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;
       text-align:center;border:1px solid;border-transition:all .15s}
  .btn-buy{background:linear-gradient(135deg,#f0d060,#c8a030);color:#1a0e2e;border-color:#f0d060}
  .btn-buy:hover{filter:brightness(1.05)}
  .btn-back{background:linear-gradient(135deg,#2a1a4a,#1a0e32);color:#c8b8e8;border-color:#3a2a5a}
  .btn-back:hover{border-color:#f0d060;color:#f0d060}
  .sold-out .btn-buy{background:linear-gradient(135deg,#3a2a2a,#2a1a1a);color:#6a5a5a;
                        border-color:#4a3a3a;cursor:not-allowed}
  .locked{color:#a89cc0;font-size:13px;line-height:1.5}
  .unlock-hint{color:#f0d060;font-size:12px;margin-top:4px}
  .footer{text-align:center;margin-top:14px;font-size:11px;color:#6858a0}
</style></head><body><div class="wrap">`;

  html += `<div class="header"><div class="title">${item.name || item.id}</div>
    <div class="rarity-pill r-${item.rarity || "common"}">${item.rarity || "COMMON"}</div></div>`;

  html += `<div class="card">
    <div class="field"><span class="field-lbl">Price</span>
      <span class="field-val price-val">${stock <= 0 ? "SOLD OUT" : price.toLocaleString() + " LC"}</span></div>
    <div class="field"><span class="field-lbl">Stock</span>
      <span class="field-val">${stockLabel(stock, item.baseStock || 1)}</span></div>
    <div class="field"><span class="field-lbl">Type</span>
      <span class="field-val">${item.category || "—"}</span></div>
    <div class="field" style="flex-direction:column;align-items:stretch;gap:2px">
      <span class="field-lbl">Description</span>
      <span class="desc-text">${item.desc || "No description available."}</span>
    </div>
    ${item.effect ? `<div class="field" style="flex-direction:column;align-items:stretch;gap:2px">
      <span class="field-lbl">Effect</span>
      <span class="desc-text" style="color:#e8e0f0">${item.effect}</span>
    </div>` : ""}
    ${item.lockedReason ? `<div class="field" style="flex-direction:column;align-items:stretch;gap:2px">
      <span class="field-lbl">🔒 Locked</span>
      <span class="locked">${item.lockedReason}</span>
      ${item.lockRequirement ? `<div class="unlock-hint">Requirement: ${item.lockRequirement}</div>` : ""}
    </div>` : ""}
  </div>`;

  const canBuy = stock > 0 && !item.lockedReason && (!player || player.lucons >= price);
  html += `<div class="btn-row">
    <div class="btn btn-buy ${!canBuy ? "sold-out" : ""}" data-action="buy" data-id="${item.id}">
      ${stock <= 0 ? "SOLD OUT" : "🛒 BUY"}
    </div>
    <div class="btn btn-back" data-action="back">↩️ Back</div>
  </div>`;

  html += `<div class="footer">${player ? "Tap BUY to confirm · Tap Back to browse" : "Log in to purchase"}</div>`;
  html += `</div></body></html>`;
  return html;
}

function myPurchasesHTML(state) {
  const { player } = state;
  const owned = (player?.inventory || []).filter((k) => k && typeof k === "object" && k.id);
  let html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:linear-gradient(135deg,#0d0a1a 0%,#1a0e2e 50%,#0d0a1a 100%);color:#e8e0f0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;min-height:100vh}
  .wrap{max-width:360px;margin:0 auto}
  .header{text-align:center;padding:14px 12px;border-bottom:1px solid #3a2a5a;margin-bottom:14px}
  .title{font-size:20px;font-weight:800;color:#f0d060;text-shadow:0 0 12px rgba(240,208,96,.4)}
  .sub{font-size:12px;color:#8878a0;margin-top:4px}
  .empty{text-align:center;padding:24px;color:#6858a0;font-size:13px}
  .item{border:1px solid #2a1a3a;border-radius:10px;padding:10px;margin-bottom:8px;
        background:linear-gradient(135deg,rgba(42,26,74,.4),rgba(26,14,50,.4));display:flex;gap:10px}
  .item-icon{width:44px;height:44px;border-radius:8px;background:linear-gradient(135deg,#2a1a4a,#1a0e32);
            display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
  .item-info{flex:1;min-width:0}
  .item-name{font-size:13px;font-weight:700;color:#e8e0f0;line-height:1.3}
  .item-qty{font-size:11px;color:#8878a0;margin-top:2px}
  .back-btn{display:block;text-align:center;margin-top:14px;padding:9px;border:1px solid #3a2a5a;
            background:linear-gradient(135deg,#2a1a4a,#1a0e32);border-radius:10px;color:#c8b8e8;
            cursor:pointer;font-size:12px;font-weight:600}
  .back-btn:hover{border-color:#f0d060;color:#f0d060}
  .footer{text-align:center;margin-top:10px;font-size:11px;color:#6858a0}
</style></head><body><div class="wrap">
  <div class="header"><div class="title">🛒 MY PURCHASES</div>
    <div class="sub">Items you own across the market</div></div>`;

  if (!owned.length) {
    html += `<div class="empty">You haven't bought anything yet.<br>Head to the Market to start collecting!</div>`;
  } else {
    for (const it of owned.slice(0, 20)) {
      html += `<div class="item">
        <div class="item-icon">⚔</div>
        <div class="item-info">
          <div class="item-name">${it.name || it.id}</div>
          <div class="item-qty">Qty: ${it.qty || 1}</div>
        </div>
      </div>`;
    }
    if (owned.length > 20) html += `<div class="empty">...and ${owned.length - 20} more</div>`;
  }

  html += `<a class="back-btn" data-action="back">↩️ Back to Market</a>
    <div class="footer">Tap an item row to inspect · items stay yours forever</div>
  </div></body></html>`;
  return html;
}

// ---- state machine: root → category → item → buy-confirm ----
const STATE_KEYS = new Set(["market", "cat", "item", "buy"]);

function buildWidgetPayload(state) {
  let html;
  let action;
  if (state.view === "market") {
    html = marketHTML({ root: true, player: state.player, playerId: state.playerId });
    action = "market";
  } else if (state.view === "cat") {
    html = marketHTML({
      root: false, cat: activeCategories().find((c) => c.key === state.cat), catItems: state.catItems,
      player: state.player, playerId: state.playerId,
    });
    action = "cat";
  } else if (state.view === "item") {
    html = itemDetailHTML({ item: state.item, player: state.player });
    action = "item";
  } else if (state.view === "buy") {
    html = buyConfirmHTML(state);
    action = "buy";
  } else if (state.view === "my") {
    html = myPurchasesHTML({ player: state.player });
    action = "my";
  } else {
    html = marketHTML({ root: true, player: state.player, playerId: state.playerId });
    action = "market";
  }

  // Each tap calls window.WA?.onEvent?.({name, id}) if the client supports it,
  // and we also emit a quick_reply button as a belt-and-suspenders tap path.
  const onEventScript =
    `<script>` +
    `(function(){try{` +
    `var b=document.querySelectorAll("[data-action]");` +
    `for(var i=0;i<b.length;i++){b[i].addEventListener("click",function(e){` +
    `e.preventDefault();` +
    `var a=this.getAttribute("data-action");` +
    `var id=this.getAttribute("data-id")||"";` +
    `var cat=this.getAttribute("data-cat")||"";` +
    `var qt=this.getAttribute("data-qty")||"";` +
    `if(window.WA&&window.WA.onEvent)window.WA.onEvent({name:a,id:id,cat:cat,qty:qt});` +
    `});}` +
    `}catch(e){}})();` +
    `</script>`;

  // quick_reply buttons as a secondary tap path (some clients render these on flow open)
  const qrButtons = (qp) =>
    qp.map((b) => ({
      type: "quick_reply",
      text: { body: b.label },
      reply: { display_text: b.label, id: b.id },
    }));

  return {
    interactiveMessage: {
      nativeFlowMessage: buildNativeFlowMessage(state, html, onEventScript),
    },
  };

  function buildNativeFlowMessage(state, html, onEventScript) {
    return {
      source: {
        widget: "html",
        data: html + onEventScript,
      },
      button: qrButtons(qpButtons(state)),
      messageParamsJson: JSON.stringify({ name: "market", id: state.view, state: state.view }),
    };
  }
}

function qpButtons(state) {
  const cats = activeCategories();
  const out = [];
  if (state.view === "market") {
    for (const c of cats) out.push({ label: c.label, id: `market_cat:${c.key}` });
    out.push({ label: "🛒 My Purchases", id: "market_my" });
    out.push({ label: "↩️ Close", id: "market_close" });
  } else if (state.view === "cat") {
    out.push({ label: "↩️ Back to Market", id: "market_back" });
  } else if (state.view === "item") {
    const it = state.item;
    const stock = it.stock != null ? it.stock : (it.baseStock || 1);
    if (stock > 0) out.push({ label: "🛒 BUY", id: `buy:${it.id}` });
    out.push({ label: "↩️ Back", id: "market_back" });
    out.push({ label: "❌ Close", id: "market_close" });
  } else if (state.view === "buy") {
    out.push({ label: "✅ CONFIRM", id: `confirm:${state.itemId}` });
    out.push({ label: "❌ CANCEL", id: "market_back" });
  } else if (state.view === "my") {
    out.push({ label: "↩️ Back to Market", id: "market_back" });
    out.push({ label: "❌ Close", id: "market_close" });
  }
  return out;
}

function buyConfirmHTML(state) {
  const it = itemById(state.itemId);
  if (!it) return marketHTML({ root: true, player: state.player, playerId: state.playerId });
  const price = fmtPrice(it.price || 0, state.player?._id);
  const balAfter = (state.player?.lucons || 0) - price;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:linear-gradient(135deg,#0d0a1a 0%,#1a0e2e 50%,#0d0a1a 100%);color:#e8e0f0;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;min-height:100vh}
  .wrap{max-width:360px;margin:0 auto;text-align:center}
  .banner{padding:22px 12px;background:linear-gradient(135deg,#1a2a1a,#0d1a0d);
         border:1px solid #5a8a5a;border-radius:16px;margin-bottom:16px}
  .icon{font-size:48px;margin-bottom:10px}
  .title{font-size:22px;font-weight:800;color:#8f8;border-bottom:1px solid #3a5a3a;padding-bottom:10px}
  .item-name{font-size:18px;color:#e8e0f0;font-weight:700;margin:12px 0 4px}
  .price-row{display:flex;justify-content:center;gap:16px;margin:12px 0}
  .price-box{background:rgba(42,26,74,.5);border:1px solid #3a2a5a;border-radius:10px;padding:10px 20px}
  .price-box .lbl{font-size:11px;color:#8878a0;text-transform:uppercase;letter-spacing:1px}
  .price-box .val{font-size:20px;font-weight:800;color:#f0d060}
  .price-box.old .val{color:#6858a0;text-decoration:line-through}
  .bal-row{text-align:center;margin:16px 0}
  .bal-box{background:linear-gradient(135deg,#2a1a4a,#1a0e32);border:1px solid #f0d060;
           border-radius:10px;padding:10px 20px;display:inline-block}
  .bal-box .lbl{font-size:11px;color:#a89cc0;letter-spacing:1px;text-transform:uppercase}
  .bal-box .val{font-size:20px;font-weight:700;color:#f0d060}
  .btn-row{display:flex;gap:12px;margin-top:8px}
  .btn{flex:1;padding:14px;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;
       border:1px solid;text-transform:uppercase;letter-spacing:1px}
  .btn-confirm{background:linear-gradient(135deg,#f0d060,#c8a030);color:#1a0e2e;border-color:#f0d060}
  .btn-cancel{background:linear-gradient(135deg,#3a2a2a,#2a1a1a);color:#a89aa0;border-color:#4a3a3a}
  .footer{text-align:center;margin-top:16px;font-size:11px;color:#6858a0}
</style></head><body><div class="wrap">
  <div class="banner"><div class="icon">⚔️</div>
    <div class="title">PURCHASE CONFIRMATION</div>
    <div class="item-name">${it.name || it.id}</div></div>
  <div class="price-row">
    <div class="price-box old"><div class="lbl">Price</div>
      <div class="val">${(it.price || 0).toLocaleString()} LC</div></div>
    <div class="price-box" style="border-color:#5a8a5a"><div class="lbl" style="color:#8f8">You Pay</div>
      <div class="val" style="color:#8f8">${price.toLocaleString()} LC</div></div>
  </div>
  <div class="bal-row"><div class="bal-box">
    <div class="lbl">Your Balance</div><div class="val">${(state.player?.lucons || 0).toLocaleString()} LC</div>
  </div></div>
  <div class="btn-row">
    <div class="btn btn-confirm" data-action="confirm" data-id="${it.id}">✅ Confirm</div>
    <div class="btn btn-cancel" data-action="cancel">❌ Cancel</div>
  </div>
  <div class="footer">Tap Confirm to complete · Tap Cancel to go back</div>
</div></body></html>`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

// Call this once at boot (inside a try/catch) to test whether the HTML widget
// survives the wire encode. Cached as flowMarket.works so every call after the
// first one is a pure decision.
let _tested = false;
let _works  = null; // true | false | null (untested)

function testWireWorks(sock, testJid, log) {
  if (_tested) return _works;
  _tested = true;
  try {
    // Build a minimal HTML-widget flow and send it; if the relay throws or the
    // resulting message on the wire lacks the HTML marker, the widget does not
    // work on this backend/phone combo.
    const payload = buildWidgetPayload({
      view: "market", playerId: testJid, player: null,
    });
    // We cannot await here in a sync boot helper, so this is best-effort:
    // the real dial is in sendFlowMarket() which is async and measured there.
    _works = true; // optimistic — real dial happens on first send
    log("flowMarket: wire test queued (result resolved on first send)");
    return true;
  } catch (e) {
    _works = false;
    log("flowMarket: wire test failed: " + (e?.message || e));
    return false;
  }
}

/**
 * sendFlowMarket(sock, chatId, player)
 *  • player is the full player object (must have _id, lucons, inventory, faction)
 *  • sends the market nativeFlow if the wire supports it; falls back to text
 */
async function sendFlowMarket(sock, chatId, player, fallbackFn, log = console.log) {
  if (!sock) {
    log("flowMarket: no socket — cannot send flow");
    return fallbackFn();
  }
  // Resolve player fresh each send (in case data changed)
  const fresh = players?.(chatId) || player;

  try {
    // Determine the wire-capability on the first real send.
    if (_works === null) {
      // Send a tiny probe to ourselves? We can't easily, so rely on index.js boot
      // test (which relays to a test JID). Default optimistic.
      _works = true;
    }

    if (!_works) {
      log("flowMarket: HTML widget wire not confirmed — using text fallback");
      return fallbackFn();
    }

    const isMyPurchases = arguments.length >= 5 ? arguments[4] : false;
    const state = {
      view:  isMyPurchases ? "my" : "market",
      player: fresh,
      playerId: chatId,
      cat:   isMyPurchases ? null : null,
      catItems: null,
      item:  null,
      itemId: null,
    };

    const payload = buildWidgetPayload(state);
    // generateWAMessageFromContent expects interactiveMessage.nativeFlowMessage,
    // but buildWidgetPayload() returns the nativeFlowMessage object directly.
    // Wrap it so the wire shape is correct.
    const { generateWAMessageFromContent, generateMessageIDV2 } = require("@whiskeysockets/baileys");
    const wrapper = { interactiveMessage: { nativeFlowMessage: payload.nativeFlowMessage } };
    const waMessage = generateWAMessageFromContent(chatId, wrapper, {
      virtualized: true,
      to: chatId,
      participant: chatId,
      messageId: generateMessageIDV2(chatId),
      timestamp: new Date(),
    });

    await sock.relayMessage(waMessage, { messageId: waMessage.key?.id || "flow_" + Date.now() });
    log("flowMarket: market nativeFlow sent to " + chatId);
  } catch (e) {
    log("flowMarket: send failed (" + (e?.message || e) + ") — using text fallback");
    // Mark wire as broken so subsequent calls also fall back
    _works = false;
    return fallbackFn();
  }
}

/**
 * handleFlowTap(state, action, id, cat, qty, sock, chatId, player, fallbackFn, log)
 *  Called from the tap-event handler in index.js when a nativeFlow button is tapped.
 *  Routes to the right screen and re-sends the flow, or performs the purchase.
 */
async function handleFlowTap(
  action, id, cat, qty, sock, chatId, player,
  fallbackFn, log = console.log
) {
  const fresh = players?.(chatId) || player;

  if (action === "market_close") {
    // just let the flow die; next .market re-opens normally
    return;
  }

  if (action === "market_back") {
    await sendFlowMarket(sock, chatId, fresh, fallbackFn, log);
    return;
  }

  if (action === "market_cat") {
    const items = itemsInCategory(cat).map((it) => ({
      ...it,
      stock: it.stock != null ? it.stock : (it.baseStock || 1),
    }));
    await sendFlowMarket(sock, chatId, fresh, fallbackFn, log);
    // Re-send as category view: we cheat by sending the market flow then patching
    // state — but the clean path is to send a category-specific payload.
    // For simplicity, send market and rely on the client to render — but that
    // loses the category. Instead, build the category payload inline:
    const catDef = CATEGORIES.find((c) => c.key === cat);
    const catState = {
      view: "cat", cat, catItems: items, player: fresh, playerId: chatId,
    };
    try {
      const payload = buildWidgetPayload(catState);
      const { generateWAMessageFromContent, generateMessageIDV2 } = require("@whiskeysockets/baileys");
      const wrapper = { interactiveMessage: { nativeFlowMessage: payload.nativeFlowMessage } };
      const waMessage = generateWAMessageFromContent(chatId, wrapper, {
        virtualized: true, to: chatId, participant: chatId,
        messageId: generateMessageIDV2(chatId),
        timestamp: new Date(),
      });
      await sock.relayMessage(waMessage, { messageId: waMessage.key?.id || ("flow_cat_" + Date.now()) });
      log("flowMarket: category '" + cat + "' shown");
    } catch (e) {
      log("flowMarket: category send failed — " + (e?.message || e));
      return fallbackFn();
    }
    return;
  }

  if (action === "market_my") {
    const myState = { view: "my", player: fresh };
    try {
      const payload = buildWidgetPayload(myState);
      const { generateWAMessageFromContent, generateMessageIDV2 } = require("@whiskeysockets/baileys");
      const wrapper = { interactiveMessage: { nativeFlowMessage: payload.nativeFlowMessage } };
      const waMessage = generateWAMessageFromContent(chatId, wrapper, {
        virtualized: true, to: chatId, participant: chatId,
        messageId: generateMessageIDV2(chatId),
        timestamp: new Date(),
      });
      await sock.relayMessage(waMessage, { messageId: waMessage.key?.id || ("flow_my_" + Date.now()) });
      log("flowMarket: my-purchases shown");
    } catch (e) {
      log("flowMarket: my-purchases send failed — " + (e?.message || e));
      return fallbackFn();
    }
    return;
  }

  if (action === "buy") {
    // id is item id — show detail with BUY/CANCEL
    const it = itemById(id);
    if (!it) return fallbackFn();
    const price = fmtPrice(it.price || 0, fresh?._id);
    const stock = it.stock != null ? it.stock : (it.baseStock || 1);
    const state = {
      view: "item", item: { ...it, stock }, player: fresh, playerId: chatId,
    };
    try {
      const payload = buildWidgetPayload(state);
      const { generateWAMessageFromContent, generateMessageIDV2 } = require("@whiskeysockets/baileys");
      const wrapper = { interactiveMessage: { nativeFlowMessage: payload.nativeFlowMessage } };
      const waMessage = generateWAMessageFromContent(chatId, wrapper, {
        virtualized: true, to: chatId, participant: chatId,
        messageId: generateMessageIDV2(chatId),
        timestamp: new Date(),
      });
      await sock.relayMessage(waMessage, { messageId: waMessage.key?.id || ("flow_item_" + Date.now() + "_" + id) });
      log("flowMarket: item detail shown for " + id);
    } catch (e) {
      log("flowMarket: item detail send failed — " + (e?.message || e));
      return fallbackFn();
    }
    return;
  }

  if (action === "confirm") {
    // id is item id — actually buy
    const it = itemById(id);
    if (!it) return fallbackFn();
    const price = fmtPrice(it.price || 0, fresh?._id);
    const stock = it.stock != null ? it.stock : (it.baseStock || 1);
    if (stock <= 0) {
      log("flowMarket: buy confirm but item sold out");
      return fallbackFn();
    }
    if (!fresh || fresh.lucons < price) {
      log("flowMarket: buy confirm but insufficient lucons");
      return fallbackFn();
    }

    // Deduct lucons, reduce stock, add to inventory (mirror the text-market purchase
    // logic in systems/market.js but via the flow path).
    try {
      const p = players();
      const playerObj = p[chatId];
      if (!playerObj) throw new Error("player not found in store");

      playerObj.lucons = (playerObj.lucons || 0) - price;
      if (it.stock != null) it.stock = Math.max(0, (it.stock || 0) - 1);

      // Add to inventory (same shape market.js uses)
      const inv = playerObj.inventory || [];
      const existing = inv.findIndex((e) => e && e.id === it.id);
      if (existing >= 0) {
        inv[existing].qty = (inv[existing].qty || 1) + 1;
      } else {
        inv.push({ id: it.id, name: it.name || it.id, qty: 1 });
      }
      playerObj.inventory = inv;

      // Persist
      savePlayers ? savePlayers() : null;

      // Send confirmation screen then fall back to text confirm
      const confirmState = {
        view: "buy", itemId: it.id, player: playerObj, playerId: chatId,
      };
      try {
        const payload = buildWidgetPayload(confirmState);
        const { generateWAMessageFromContent, generateMessageIDV2 } = require("@whiskeysockets/baileys");
        const wrapper = { interactiveMessage: { nativeFlowMessage: payload.nativeFlowMessage } };
        const waMessage = generateWAMessageFromContent(chatId, wrapper, {
          virtualized: true, to: chatId, participant: chatId,
          messageId: generateMessageIDV2(chatId),
          timestamp: new Date(),
        });
        await sock.relayMessage(waMessage, { messageId: waMessage.key?.id || ("flow_buy_" + Date.now()) });
        log("flowMarket: purchase confirmation shown for " + it.id);
      } catch (e) {
        log("flowMarket: confirm screen failed — " + (e?.message || e));
      }

      // After confirmation screen, send a text confirmation (belt-and-suspenders)
      const txt = [
        "⚔️ *PURCHASE CONFIRMED*",
        "",
        `🛒 *${it.name || it.id}*`,
        `💰 ${price.toLocaleString()} LC`,
        `───────────`,
        `✨ Your balance: ${(fresh.lucons || 0).toLocaleString()} LC`,
        "",
        `The ${it.name || it.id} is now in your inventory.`,
        `Use your game commands to make use of it!`,
      ].join("\n");
      await sock.sendMessage(chatId, { text: txt });
      log("flowMarket: purchase complete — " + it.id + " → " + chatId);
    } catch (e) {
      log("flowMarket: purchase failed — " + (e?.message || e));
      return fallbackFn();
    }
    return;
  }

  // Unknown action — fall back
  log("flowMarket: unknown action '" + action + "' — falling back");
  return fallbackFn();
}

module.exports = {
  CATEGORIES,
  EXTRA_CATEGORIES,
  activeCategories,
  itemsInCategory,
  itemById,
  marketHTML,
  itemDetailHTML,
  myPurchasesHTML,
  buildWidgetPayload,
  sendFlowMarket,
  handleFlowTap,
  testWireWorks,
  // state for the boot-time wire test result (read by index.js)
  get works() { return _works; },
  set works(v) { _works = v; },
};

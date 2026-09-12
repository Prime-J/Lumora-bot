// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA VISUAL INVENTORY CARD  v1.0                           ║
// ║  Renders a player's inventory as an image: item icons in a    ║
// ║  rarity-ringed grid, grouped by category, paginated.          ║
// ║  Art source: assets/items/<itemId>.png (AI art drop-in).      ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

const itemsSystem = require("./items");

// ── fonts (DejaVu ships with the repo; register once) ───────────
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts", "dejavu-fonts-ttf-2.37", "ttf");
try {
  if (!GlobalFonts.has("DejaVuSans")) GlobalFonts.registerFromPath(path.join(FONT_DIR, "DejaVuSans.ttf"), "DejaVuSans");
  if (!GlobalFonts.has("DejaVuSans-Bold")) GlobalFonts.registerFromPath(path.join(FONT_DIR, "DejaVuSans-Bold.ttf"), "DejaVuSans-Bold");
} catch { /* fonts optional — falls back to Arial */ }
const F = (bold, size) => `${bold ? "bold " : ""}${size}px ${bold ? "DejaVuSans-Bold" : "DejaVuSans"}, Arial`;

// ── palettes (mirror the icon generator) ─────────────────────────
const CATEGORY_COLORS = {
  gear:        "#8fa8c8",
  consumable:  "#ff6b5e",
  hunting:     "#7ed957",
  special:     "#ffd54f",
  access:      "#b388ff",
  material:    "#4fc3f7",
  scroll:      "#e0c17a",
  tool:        "#4dd0b5",
  crystal:     "#ff5fa2",
  misc:        "#aab2bd",
};
const RARITY_COLORS = {
  Common:    "#9aa5b1",
  Uncommon:  "#6fbf73",
  Rare:      "#4fc3f7",
  Epic:      "#b388ff",
  Legendary: "#ffd54f",
  Mythic:    "#ff5fa2",
};
const SECTION_ORDER = ["consumable", "scroll", "hunting", "material", "gear", "crystal", "access", "special", "tool", "misc"];
const SECTION_LABEL = {
  consumable: "🧪 Consumables", scroll: "📜 Scrolls", hunting: "🧰 Hunting",
  material: "💎 Materials", gear: "🛡️ Gear", crystal: "🔮 Crystals",
  access: "🔑 Access", special: "✨ Special", tool: "🔧 Tools", misc: "📦 Other",
};

const W = 900;
const MARGIN = 40;
const CELL_W = 164;
const CELL_H = 152;
const COLS = 5;
const ICON = 92;
const PER_PAGE = 20;

// ── tiny helpers ────────────────────────────────────────────────
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxW, maxLines = 2) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = test;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  return lines;
}

function slugName(name) {
  return String(name || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

// ── core renderer ───────────────────────────────────────────────
// Returns a PNG Buffer, or null if the inventory is empty.
async function generateInventoryCard(player, opts = {}) {
  const itemsDb = itemsSystem.loadItems();
  const owned = [];
  for (const [itemId, qtyRaw] of Object.entries(player.inventory || {})) {
    const qty = Number(qtyRaw || 0);
    if (qty <= 0) continue;
    const item = itemsDb[itemId];
    if (!item) continue;
    owned.push({ item, qty });
  }
  if (!owned.length) return null;

  // order: category (fixed) → rarity desc → name
  owned.sort((a, b) => {
    const ca = SECTION_ORDER.indexOf(a.item.category), cb = SECTION_ORDER.indexOf(b.item.category);
    if (ca !== cb) return ca - cb;
    const ra = itemsSystem.rarityRank(a.item.rarity), rb = itemsSystem.rarityRank(b.item.rarity);
    if (ra !== rb) return rb - ra;
    return String(a.item.name).localeCompare(String(b.item.name));
  });

  const perPage = Math.max(1, Number(opts.perPage) || PER_PAGE);
  const pages = Math.max(1, Math.ceil(owned.length / perPage));
  const page = Math.min(Math.max(1, Number(opts.page) || 1), pages);
  const slice = owned.slice((page - 1) * perPage, page * perPage);

  // ── layout (two passes: measure, then draw) ───────────────────
  const headerH = 168;
  const sectionHeaderH = 46;
  const footerH = 52;

  // pass 1 — compute section row counts and total height
  const sections = [];
  let cur = null;
  for (const { item } of slice) {
    if (!cur || cur.category !== item.category) {
      cur = { category: item.category, items: [] };
      sections.push(cur);
    }
    cur.items.push(item);
  }
  let contentH = 0;
  for (const s of sections) {
    s.rows = Math.ceil(s.items.length / COLS);
    contentH += sectionHeaderH + s.rows * CELL_H;
  }
  const H = headerH + contentH + footerH;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d0d18");
  bg.addColorStop(1, "#0a0a12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // subtle grid texture
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = MARGIN; x < W - MARGIN; x += 40) { ctx.beginPath(); ctx.moveTo(x, headerH); ctx.lineTo(x, H - footerH); ctx.stroke(); }

  // ── header ────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = "#ffd54f";
  ctx.fillRect(0, headerH - 3, W, 3);

  ctx.fillStyle = "#ffffff";
  ctx.font = F(true, 40);
  ctx.textAlign = "left";
  ctx.fillText("🎒 INVENTORY", MARGIN, 62);

  ctx.font = F(false, 22);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`👤 ${String(player.username || "Hunter").slice(0, 28)}`, MARGIN, 96);

  // storage bar
  const used = itemsSystem.getUsedStorage(player, itemsDb);
  const cap = itemsSystem.getPlayerStorageCapacity(player, itemsDb);
  const barX = MARGIN, barW = W - MARGIN * 2, barY = 112, barH = 18;
  const pct = Math.min(1, cap > 0 ? used / cap : 0);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundedRect(ctx, barX, barY, barW, barH, 9); ctx.fill();
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, "#4fc3f7"); grad.addColorStop(1, "#b388ff");
  ctx.fillStyle = grad;
  roundedRect(ctx, barX, barY, Math.max(barH, barW * pct), barH, 9); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = F(true, 15);
  ctx.textAlign = "center";
  ctx.fillText(`STORAGE ${used} / ${cap}`, W / 2, barY + 14);

  ctx.font = F(false, 17);
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "right";
  ctx.fillText(`❤️ ${Number(player.playerHp || 0)}  ·  ⚡ ${Number(player.huntEnergy || 0)}`, W - MARGIN, 96);

  // ── section headers + grid (pass 2 — draw) ────────────────────
  // preload icons for this page (cache per call)
  const artCache = new Map();
  async function iconFor(itemId) {
    if (artCache.has(itemId)) return artCache.get(itemId);
    const p = itemsSystem.itemImagePath(itemId);
    let img = null;
    if (p) { try { img = await loadImage(p); } catch { img = null; } }
    artCache.set(itemId, img);
    return img;
  }

  let y = headerH;
  for (const s of sections) {
    const color = CATEGORY_COLORS[s.category] || CATEGORY_COLORS.misc;
    // section header
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(MARGIN, y + 8, W - MARGIN * 2, 30);
    ctx.fillStyle = color;
    ctx.font = F(true, 21);
    ctx.textAlign = "left";
    ctx.fillText(SECTION_LABEL[s.category] || s.category, MARGIN + 10, y + 30);
    y += sectionHeaderH;

    // items in this section (rows reset per section)
    let idx = 0;
    for (const item of s.items) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = MARGIN + col * CELL_W;
      const ty0 = y + row * CELL_H;

      // tile
      const rarity = RARITY_COLORS[item.rarity] || RARITY_COLORS.Common;
      const tx = x + (CELL_W - ICON) / 2;
      const ty = ty0 + 6;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      roundedRect(ctx, tx - 3, ty - 3, ICON + 6, ICON + 6, 14); ctx.fill();
      ctx.shadowColor = rarity; ctx.shadowBlur = 12;
      ctx.strokeStyle = rarity; ctx.lineWidth = 2.5;
      roundedRect(ctx, tx, ty, ICON, ICON, 12); ctx.stroke();
      ctx.shadowBlur = 0;

      const img = await iconFor(item.id);
      if (img) {
        ctx.save();
        roundedRect(ctx, tx + 2, ty + 2, ICON - 4, ICON - 4, 10);
        ctx.clip();
        ctx.drawImage(img, tx + 2, ty + 2, ICON - 4, ICON - 4);
        ctx.restore();
      } else {
        // placeholder tile
        const cg = ctx.createLinearGradient(tx, ty, tx + ICON, ty + ICON);
        cg.addColorStop(0, (CATEGORY_COLORS[s.category] || "#334") + "55");
        cg.addColorStop(1, "#14141f");
        ctx.fillStyle = cg;
        roundedRect(ctx, tx + 2, ty + 2, ICON - 4, ICON - 4, 10); ctx.fill();
        ctx.fillStyle = rarity;
        ctx.font = F(true, 34);
        ctx.textAlign = "center";
        ctx.fillText(slugName(item.name), tx + ICON / 2, ty + ICON / 2 + 12);
      }

      // count badge
      const qty = Number(player.inventory?.[item.id] || 0);
      if (qty > 1) {
        const bx = tx + ICON - 10, by = ty + ICON - 10;
        ctx.fillStyle = "#0a0a12";
        ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rarity; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = F(true, 14);
        ctx.textAlign = "center";
        ctx.fillText(String(qty), bx, by + 5);
      }

      // name
      ctx.font = F(false, 14);
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "center";
      const lines = wrapLines(ctx, item.name, CELL_W - 12);
      lines.forEach((ln, i) => ctx.fillText(ln, x + CELL_W / 2, ty + ICON + 22 + i * 17));

      idx++;
    }
    y += s.rows * CELL_H;
  }

  // ── footer ────────────────────────────────────────────────────
  ctx.fillStyle = "#64748b";
  ctx.font = F(false, 17);
  ctx.textAlign = "center";
  const footerTxt = pages > 1
    ? `Page ${page} / ${pages}  ·  send .inv ${page + 1 > pages ? page : page + 1} for more  ·  ${owned.length} items`
    : `${owned.length} item${owned.length === 1 ? "" : "s"}  ·  .item <name> for details`;
  ctx.fillText(footerTxt, W / 2, H - 18);

  return canvas.toBuffer("image/png");
}

module.exports = { generateInventoryCard, PER_PAGE };

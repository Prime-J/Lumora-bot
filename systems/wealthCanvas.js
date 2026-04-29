// 0.1.3 — Wealth card canvas. Shows wallet / bank / total + wealth-lb rank.

const { createCanvas } = require("@napi-rs/canvas");

const FACTION_TINT = {
  harmony: { bg1: "#0a2e1a", bg2: "#031a0a", accent: "#4ade80", glow: "#86efac", coin: "#fde68a" },
  purity:  { bg1: "#0a1f3e", bg2: "#03101e", accent: "#60a5fa", glow: "#93c5fd", coin: "#fde68a" },
  rift:    { bg1: "#2e0a3e", bg2: "#15051e", accent: "#a855f7", glow: "#d8b4fe", coin: "#fde68a" },
  none:    { bg1: "#1a1a1a", bg2: "#0a0a0a", accent: "#94a3b8", glow: "#cbd5e1", coin: "#fde68a" },
};

function tint(faction) { return FACTION_TINT[faction] || FACTION_TINT.none; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function drawSparkles(ctx, w, h, color, count) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const size = Math.random() * 2.5 + 1;
    ctx.save();
    ctx.globalAlpha = Math.random() * 0.6 + 0.3;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 2);
    ctx.lineTo(x + size * 0.4, y - size * 0.4);
    ctx.lineTo(x + size * 2, y);
    ctx.lineTo(x + size * 0.4, y + size * 0.4);
    ctx.lineTo(x, y + size * 2);
    ctx.lineTo(x - size * 0.4, y + size * 0.4);
    ctx.lineTo(x - size * 2, y);
    ctx.lineTo(x - size * 0.4, y - size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCoin(ctx, cx, cy, r, color, glow) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  // Outer rim
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, "#fef3c7");
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, "#92400e");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // L mark
  ctx.fillStyle = "#92400e";
  ctx.font = `bold ${Math.floor(r * 0.95)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("L", cx, cy + r * 0.04);
  ctx.restore();
}

async function generateWealthCard(player, lbPosition, lbTotal) {
  const W = 900, H = 560;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const t = tint(player.faction || "none");
  const wallet = Number(player.lucons || 0);
  const bank   = Number(player.bankBalance || 0);
  const total  = wallet + bank;

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, t.bg1);
  bgGrad.addColorStop(1, t.bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Center radial glow (gold tinted)
  const gold = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 360);
  gold.addColorStop(0, "#fde68a44");
  gold.addColorStop(1, "#fde68a00");
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, W, H);

  drawSparkles(ctx, W, H, t.coin, 14);
  drawSparkles(ctx, W, H, t.glow, 8);

  // Border
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = t.coin;
  ctx.shadowBlur = 18;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = t.coin;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = t.coin;
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#fde68a";
  ctx.font = "bold 44px serif";
  ctx.fillText("WEALTH LEDGER", W / 2, 88);
  ctx.shadowBlur = 0;

  // Username sub
  ctx.fillStyle = t.glow;
  ctx.font = "italic 22px serif";
  const name = player.username || "Unnamed Lumorian";
  ctx.fillText(name, W / 2, 122);

  // ─── Three stat tiles (Wallet | Bank | Total) ─────────────
  const tileY = 170, tileH = 200;
  const tileW = 240, tileGap = 30;
  const startX = (W - (tileW * 3 + tileGap * 2)) / 2;

  const tiles = [
    { label: "WALLET",  amount: wallet, color: "#fbbf24", note: "robbable" },
    { label: "BANK",    amount: bank,   color: t.accent,  note: "safe" },
    { label: "TOTAL",   amount: total,  color: "#fde68a", note: "" },
  ];

  tiles.forEach((tl, i) => {
    const x = startX + i * (tileW + tileGap);
    // Tile bg
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, x, tileY, tileW, tileH, 18);
    ctx.fill();
    // Tile border
    ctx.strokeStyle = tl.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = tl.color;
    ctx.shadowBlur = 14;
    roundRect(ctx, x, tileY, tileW, tileH, 18);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Coin
    drawCoin(ctx, x + tileW / 2, tileY + 56, 30, tl.color, tl.color);

    // Label
    ctx.fillStyle = tl.color;
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(tl.label, x + tileW / 2, tileY + 122);

    // Amount
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.shadowColor = tl.color;
    ctx.shadowBlur = 12;
    ctx.fillText(tl.amount.toLocaleString() + "L", x + tileW / 2, tileY + 158);
    ctx.shadowBlur = 0;

    // Note
    if (tl.note) {
      ctx.fillStyle = tl.color + "AA";
      ctx.font = "italic 13px sans-serif";
      ctx.fillText(tl.note, x + tileW / 2, tileY + 182);
    }
  });

  // ─── Wealth lb position ──────────────────────────────────
  const rankY = H - 80;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, 60, rankY, W - 120, 50, 12);
  ctx.fill();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 2;
  ctx.shadowColor = t.glow;
  ctx.shadowBlur = 10;
  roundRect(ctx, 60, rankY, W - 120, 50, 12);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = t.glow;
  ctx.textAlign = "center";
  ctx.font = "bold 22px serif";
  if (lbPosition && lbPosition > 0) {
    ctx.fillText(`💎 Wealth Rank:  #${lbPosition}  /  ${lbTotal} Lumorians`, W / 2, rankY + 32);
  } else {
    ctx.fillText(`💎 Unranked — too few Lucons`, W / 2, rankY + 32);
  }

  // Footer
  ctx.fillStyle = t.accent + "AA";
  ctx.font = "italic 12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("LUMORA · 0.1.3", W - 30, H - 12);

  return canvas.toBuffer("image/png");
}

// Build sorted wealth list (by total = wallet + bank, desc)
function buildWealthLb(players) {
  return Object.entries(players)
    .map(([jid, p]) => ({
      jid,
      username: p.username || jid.split("@")[0],
      wallet: Number(p.lucons || 0),
      bank: Number(p.bankBalance || 0),
      total: Number(p.lucons || 0) + Number(p.bankBalance || 0),
    }))
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total);
}

function findWealthRank(players, jid) {
  const sorted = buildWealthLb(players);
  const idx = sorted.findIndex(e => e.jid === jid);
  return { position: idx >= 0 ? idx + 1 : 0, total: sorted.length };
}

module.exports = {
  generateWealthCard,
  buildWealthLb,
  findWealthRank,
};

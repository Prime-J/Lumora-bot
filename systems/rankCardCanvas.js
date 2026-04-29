// 0.1.3 — Rank card canvas. Generates the .rank image and the rank-up
// reveal image. Pure napi-rs/canvas, no AI calls. Heavy on glow, gradient,
// sparkles to feel premium.

const { createCanvas } = require("@napi-rs/canvas");
const { rankForLevel, nextRank } = require("./ranks");

const FACTION_TINT = {
  harmony: { bg1: "#0a2e1a", bg2: "#031a0a", accent: "#4ade80", glow: "#86efac" },
  purity:  { bg1: "#0a1f3e", bg2: "#03101e", accent: "#60a5fa", glow: "#93c5fd" },
  rift:    { bg1: "#2e0a3e", bg2: "#15051e", accent: "#a855f7", glow: "#d8b4fe" },
  none:    { bg1: "#1a1a1a", bg2: "#0a0a0a", accent: "#94a3b8", glow: "#cbd5e1" },
};

function getTint(faction) {
  return FACTION_TINT[faction] || FACTION_TINT.none;
}

// ─── Helpers ────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function drawHexagon(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawSparkles(ctx, w, h, color, count) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const size = Math.random() * 3 + 1;
    const alpha = Math.random() * 0.7 + 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    // 4-point sparkle
    ctx.beginPath();
    ctx.moveTo(x, y - size * 2);
    ctx.lineTo(x + size * 0.5, y - size * 0.5);
    ctx.lineTo(x + size * 2, y);
    ctx.lineTo(x + size * 0.5, y + size * 0.5);
    ctx.lineTo(x, y + size * 2);
    ctx.lineTo(x - size * 0.5, y + size * 0.5);
    ctx.lineTo(x - size * 2, y);
    ctx.lineTo(x - size * 0.5, y - size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawNoise(ctx, w, h, intensity = 0.04) {
  for (let i = 0; i < w * h * 0.002; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * intensity})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

function drawRadialGlow(ctx, cx, cy, radius, color) {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, color + "AA");
  grad.addColorStop(0.5, color + "33");
  grad.addColorStop(1, color + "00");
  ctx.fillStyle = grad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

// ─── Main rank card ─────────────────────────────────────────
async function generateRankCard(player) {
  const W = 900, H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const tint = getTint(player.faction || "none");
  const rank = rankForLevel(player.level || 1);
  const next = nextRank(rank);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, tint.bg1);
  bgGrad.addColorStop(1, tint.bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Center radial glow
  drawRadialGlow(ctx, W / 2, H / 2, 350, tint.glow);

  // Subtle noise
  drawNoise(ctx, W, H, 0.05);

  // Sparkles
  drawSparkles(ctx, W, H, tint.glow, 12);

  // Outer border (double-line frame)
  ctx.strokeStyle = tint.accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = tint.glow;
  ctx.shadowBlur = 18;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rank.color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // ─── LEFT: Avatar circle with rank-color aura ring ─────────
  const avX = 130, avY = 150, avR = 80;

  // Aura ring (thick, glowy, rank-color)
  ctx.save();
  ctx.shadowColor = rank.color;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = rank.color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Inner ring (lighter)
  ctx.strokeStyle = rank.glow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 16, 0, Math.PI * 2);
  ctx.stroke();

  // Avatar disc (placeholder — initial letter of username)
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rank.glow;
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const initial = (player.username || "?").trim().charAt(0).toUpperCase() || "?";
  ctx.fillText(initial, avX, avY + 4);

  // ─── Username + faction line ─────────────────────────────────
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.shadowColor = tint.glow;
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px serif";
  const name = player.username || "Unnamed Lumorian";
  const truncName = name.length > 18 ? name.slice(0, 17) + "…" : name;
  ctx.fillText(truncName, 240, 130);
  ctx.shadowBlur = 0;

  // Faction sub-label
  const factionLabel = player.faction
    ? player.faction.charAt(0).toUpperCase() + player.faction.slice(1)
    : "Unaligned";
  ctx.fillStyle = tint.accent;
  ctx.font = "italic 22px sans-serif";
  ctx.fillText(`${factionLabel} • Level ${player.level || 1}`, 240, 162);

  // ─── RIGHT: Hex rank badge ──────────────────────────────────
  const hexCx = W - 160, hexCy = 150, hexR = 70;
  ctx.save();
  ctx.shadowColor = rank.color;
  ctx.shadowBlur = 32;
  ctx.fillStyle = rank.color;
  drawHexagon(ctx, hexCx, hexCy, hexR);
  ctx.fill();

  // Inner hex
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  drawHexagon(ctx, hexCx, hexCy, hexR - 8);
  ctx.fill();

  // Hex border glow
  ctx.strokeStyle = rank.glow;
  ctx.lineWidth = 2;
  drawHexagon(ctx, hexCx, hexCy, hexR);
  ctx.stroke();
  ctx.restore();

  // Rank initial inside hex
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = rank.glow;
  ctx.shadowBlur = 14;
  ctx.fillText(rank.name.charAt(0), hexCx, hexCy + 2);
  ctx.shadowBlur = 0;

  // Rank name under hex
  ctx.fillStyle = rank.color;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(rank.name.toUpperCase(), hexCx, hexCy + hexR + 28);

  // ─── XP BAR (segmented, glowing) ────────────────────────────
  const barX = 80, barY = 290, barW = W - 160, barH = 28;
  const xpCurrent = Number(player.xp || 0);
  // Use xp-needed for next level (simple: level * 100). If you want a real
  // formula, swap in xpSystem.getXpForLevel here later.
  const xpForNext = ((player.level || 1)) * 100;
  const pct = Math.max(0, Math.min(1, xpCurrent / Math.max(1, xpForNext)));

  // Bar background
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, barX, barY, barW, barH, 14);
  ctx.fill();

  // Bar segments (10 cells)
  const cells = 10;
  const cellGap = 4;
  const cellW = (barW - cellGap * (cells + 1)) / cells;
  const filled = Math.round(pct * cells);

  for (let i = 0; i < cells; i++) {
    const cx = barX + cellGap + i * (cellW + cellGap);
    const isOn = i < filled;
    if (isOn) {
      ctx.shadowColor = rank.glow;
      ctx.shadowBlur = 16;
      const grad = ctx.createLinearGradient(cx, barY, cx + cellW, barY + barH);
      grad.addColorStop(0, rank.color);
      grad.addColorStop(1, rank.glow);
      ctx.fillStyle = grad;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
    }
    roundRect(ctx, cx, barY + 4, cellW, barH - 8, 4);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // XP labels
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`XP ${xpCurrent.toLocaleString()} / ${xpForNext.toLocaleString()}`, barX, barY - 10);
  ctx.textAlign = "right";
  ctx.fillStyle = tint.glow;
  ctx.font = "italic 16px sans-serif";
  if (next) {
    ctx.fillText(`→ next rank: ${next.name} (Lv ${next.min})`, barX + barW, barY - 10);
  } else {
    ctx.fillText(`✦ MAX TIER ✦`, barX + barW, barY - 10);
  }

  // ─── STATS ROW ───────────────────────────────────────────────
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#ffffff";

  const stats = [
    { label: "Aura",    val: (player.aura || 0).toLocaleString(),    icon: "🔮" },
    { label: "PvP Wins", val: (player.battlesWon || 0).toLocaleString(), icon: "⚔️" },
    { label: "Mora",    val: ((player.moraOwned || []).length).toString(), icon: "🐉" },
    { label: "Streak",  val: `${player.loginStreak || 0}d`,           icon: "🔥" },
  ];

  const statY = 380;
  const statSpacing = (W - 80) / stats.length;
  stats.forEach((s, i) => {
    const x = 80 + statSpacing * i + statSpacing / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = tint.accent;
    ctx.font = "16px sans-serif";
    ctx.fillText(s.label.toUpperCase(), x, statY);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.shadowColor = tint.glow;
    ctx.shadowBlur = 8;
    ctx.fillText(s.val, x, statY + 30);
    ctx.shadowBlur = 0;
  });

  // ─── Equipped achievement ribbon ────────────────────────────
  if (player.equippedAchievement) {
    const ribY = H - 78;
    const ribX = 60, ribW = W - 120, ribH = 48;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, ribX, ribY, ribW, ribH, 10);
    ctx.fill();
    ctx.strokeStyle = rank.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = rank.glow;
    ctx.shadowBlur = 10;
    roundRect(ctx, ribX, ribY, ribW, ribH, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = rank.glow;
    ctx.font = "bold 18px serif";
    ctx.textAlign = "left";
    ctx.fillText(`🏅  ${player.equippedAchievement}`, ribX + 18, ribY + 31);
  }

  // Footer brand
  ctx.textAlign = "right";
  ctx.font = "italic 13px sans-serif";
  ctx.fillStyle = tint.accent + "AA";
  ctx.fillText("LUMORA · 0.1.3", W - 30, H - 18);

  return canvas.toBuffer("image/png");
}

// ─── Rank-up reveal card ────────────────────────────────────
async function generateRankUpCard(player, oldRank, newRank) {
  const W = 800, H = 1100;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const tint = getTint(player.faction || "none");

  // Background — darker, more dramatic
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#000000");
  bgGrad.addColorStop(0.4, tint.bg1);
  bgGrad.addColorStop(1, "#000000");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Center mega glow (new rank color)
  drawRadialGlow(ctx, W / 2, 540, 500, newRank.glow);
  drawRadialGlow(ctx, W / 2, 540, 280, newRank.color);

  // Light rays from center
  ctx.save();
  ctx.translate(W / 2, 540);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, newRank.glow + "FF");
    grad.addColorStop(1, newRank.glow + "00");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(W, -1);
    ctx.lineTo(W, 1);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Heavy sparkles
  drawSparkles(ctx, W, H, newRank.glow, 40);
  drawSparkles(ctx, W, H, "#ffffff", 25);

  // ── "RANK UP!" banner ─────────────────────────────────────
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const bannerGrad = ctx.createLinearGradient(0, 100, W, 200);
  bannerGrad.addColorStop(0, newRank.color);
  bannerGrad.addColorStop(0.5, "#ffffff");
  bannerGrad.addColorStop(1, newRank.color);

  ctx.shadowColor = newRank.glow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = bannerGrad;
  ctx.font = "bold 78px serif";
  ctx.fillText("RANK UP!", W / 2, 160);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 22px serif";
  ctx.fillText(`${player.username || "Lumorian"} has ascended`, W / 2, 220);

  // ── BIG hex badge centered ────────────────────────────────
  const hexCx = W / 2, hexCy = 540, hexR = 180;

  // Outer ring glow
  ctx.shadowColor = newRank.glow;
  ctx.shadowBlur = 60;
  ctx.fillStyle = newRank.color;
  drawHexagon(ctx, hexCx, hexCy, hexR);
  ctx.fill();

  // Mid hex
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  drawHexagon(ctx, hexCx, hexCy, hexR - 18);
  ctx.fill();

  // Border lines
  ctx.strokeStyle = newRank.glow;
  ctx.lineWidth = 4;
  drawHexagon(ctx, hexCx, hexCy, hexR);
  ctx.stroke();
  ctx.lineWidth = 2;
  drawHexagon(ctx, hexCx, hexCy, hexR - 18);
  ctx.stroke();

  // Rank initial — huge
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 140px serif";
  ctx.shadowColor = newRank.glow;
  ctx.shadowBlur = 40;
  ctx.fillText(newRank.name.charAt(0), hexCx, hexCy + 8);
  ctx.shadowBlur = 0;

  // ── New rank name ────────────────────────────────────────
  ctx.fillStyle = newRank.glow;
  ctx.font = "bold 64px serif";
  ctx.shadowColor = newRank.color;
  ctx.shadowBlur = 24;
  ctx.fillText(newRank.name.toUpperCase(), W / 2, hexCy + hexR + 80);
  ctx.shadowBlur = 0;

  // ── Old → New transition row ─────────────────────────────
  ctx.font = "bold 34px sans-serif";
  ctx.fillStyle = "#888888";
  ctx.fillText(oldRank.name, W / 2 - 160, 880);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 50px sans-serif";
  ctx.fillText("→", W / 2, 880);

  ctx.fillStyle = newRank.glow;
  ctx.font = "bold 34px sans-serif";
  ctx.shadowColor = newRank.color;
  ctx.shadowBlur = 14;
  ctx.fillText(newRank.name, W / 2 + 160, 880);
  ctx.shadowBlur = 0;

  // Level achieved
  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 28px serif";
  ctx.fillText(`Level ${player.level} reached`, W / 2, 950);

  // Footer
  ctx.fillStyle = tint.accent + "BB";
  ctx.font = "italic 16px sans-serif";
  ctx.fillText(`The Rift acknowledges your ascent.`, W / 2, 1020);
  ctx.fillText(`LUMORA · 0.1.3`, W / 2, 1060);

  return canvas.toBuffer("image/png");
}

module.exports = { generateRankCard, generateRankUpCard };

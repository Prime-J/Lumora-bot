const { createCanvas } = require("@napi-rs/canvas");

// ── COLOR PALETTES ───────────────────────────────────────────
const FACTION_COLORS = {
  harmony: { main: "#2ecc71", glow: "#27ae60", dark: "#1a7a3e", accent: "#a8e6cf" },
  purity:  { main: "#3498db", glow: "#2980b9", dark: "#1a5276", accent: "#aed6f1" },
  rift:    { main: "#e74c3c", glow: "#c0392b", dark: "#7b241c", accent: "#f5b7b1" },
};

const FACTION_ICONS = {
  harmony: "🌿",
  purity: "⚔️",
  rift: "🕶️",
};

// ── DRAW ROUNDED RECT ────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════════
// SEASON PROGRESS GRAPH (used by .facprogress)
// ══════════════════════════════════════════════════════════════
async function generateFactionGraph(points, seasonNum, style = "neon") {
  const width = 900;
  const height = 550;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ── Background gradient ────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(0.5, "#0d1117");
  bg.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // ── Grid lines ─────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let y = 100; y < 440; y += 50) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(width - 60, y);
    ctx.stroke();
  }

  // ── Title ──────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`LUMORA SEASON ${seasonNum}`, width / 2, 55);
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("FACTION WAR PROGRESS", width / 2, 80);

  // ── Faction bars ───────────────────────────────────────────
  const maxPoints = Math.max(200, points.harmony || 0, points.purity || 0, points.rift || 0) * 1.2;
  const factions = [
    { name: "HARMONY", key: "harmony", pts: points.harmony || 0, x: 175 },
    { name: "PURITY",  key: "purity",  pts: points.purity  || 0, x: 450 },
    { name: "RIFT",    key: "rift",    pts: points.rift    || 0, x: 725 },
  ];

  const bottomY = 440;
  const maxBarH = 300;
  const barW = 120;

  // Find leader
  const leaderPts = Math.max(...factions.map(f => f.pts));

  factions.forEach(fac => {
    const c = FACTION_COLORS[fac.key];
    const barH = Math.max(8, (fac.pts / maxPoints) * maxBarH);
    const barX = fac.x - barW / 2;
    const barY = bottomY - barH;

    // Glow effect
    ctx.shadowColor = c.main;
    ctx.shadowBlur = 25;

    // Bar gradient
    const barGrad = ctx.createLinearGradient(barX, barY, barX, bottomY);
    barGrad.addColorStop(0, c.main);
    barGrad.addColorStop(1, c.dark);

    roundRect(ctx, barX, barY, barW, barH, 8);
    ctx.fillStyle = barGrad;
    ctx.fill();

    // Shine effect on bar
    ctx.shadowBlur = 0;
    const shine = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    shine.addColorStop(0, "rgba(255,255,255,0.15)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.05)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    roundRect(ctx, barX, barY, barW / 2, barH, 8);
    ctx.fillStyle = shine;
    ctx.fill();

    // Points value
    ctx.shadowBlur = 0;
    ctx.fillStyle = fac.pts === leaderPts && fac.pts > 0 ? "#ffd700" : "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(fac.pts.toLocaleString(), fac.x, barY - 15);

    // Leader crown
    if (fac.pts === leaderPts && fac.pts > 0) {
      ctx.font = "30px Arial";
      ctx.fillText("👑", fac.x, barY - 45);
    }

    // Faction name
    ctx.fillStyle = c.accent;
    ctx.font = "bold 22px Arial";
    ctx.fillText(fac.name, fac.x, bottomY + 35);

    // Percentage
    const total = (points.harmony || 0) + (points.purity || 0) + (points.rift || 0);
    const pct = total > 0 ? Math.round((fac.pts / total) * 100) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "16px Arial";
    ctx.fillText(`${pct}%`, fac.x, bottomY + 55);
  });

  // ── Bottom bar ─────────────────────────────────────────────
  const total = (points.harmony || 0) + (points.purity || 0) + (points.rift || 0);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Total Faction Points: ${total.toLocaleString()}`, width / 2, height - 20);

  return await canvas.encode("png");
}

// ══════════════════════════════════════════════════════════════
// FACTION POINTS CARD (used by .facpoints — replaces text)
// ══════════════════════════════════════════════════════════════
async function generateFacPointsCard(points) {
  const width = 900;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ── Background ─────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0d1117");
  bg.addColorStop(0.5, "#161b22");
  bg.addColorStop(1, "#0d1117");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Border glow
  ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, width - 10, height - 10, 15);
  ctx.stroke();

  // ── Title ──────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.fillText("FACTION POINTS", width / 2, 45);
  ctx.font = "14px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Season Standing", width / 2, 65);

  // ── Horizontal bars ────────────────────────────────────────
  const total = Math.max(1, (points.harmony || 0) + (points.purity || 0) + (points.rift || 0));
  const maxPts = Math.max(1, points.harmony || 0, points.purity || 0, points.rift || 0);
  const barMaxW = 520;
  const barH = 45;
  const startX = 200;

  const factions = [
    { name: "HARMONY", key: "harmony", pts: points.harmony || 0, y: 110 },
    { name: "PURITY",  key: "purity",  pts: points.purity  || 0, y: 195 },
    { name: "RIFT",    key: "rift",    pts: points.rift    || 0, y: 280 },
  ];

  const leaderPts = Math.max(...factions.map(f => f.pts));

  factions.forEach(fac => {
    const c = FACTION_COLORS[fac.key];
    const barW = Math.max(10, (fac.pts / maxPts) * barMaxW);
    const pct = Math.round((fac.pts / total) * 100);

    // Faction name + icon
    ctx.fillStyle = c.accent;
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`${FACTION_ICONS[fac.key]} ${fac.name}`, startX - 15, fac.y + 30);

    // Bar background
    roundRect(ctx, startX, fac.y, barMaxW, barH, 10);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();

    // Bar fill with glow
    ctx.shadowColor = c.main;
    ctx.shadowBlur = 15;
    const barGrad = ctx.createLinearGradient(startX, fac.y, startX + barW, fac.y);
    barGrad.addColorStop(0, c.dark);
    barGrad.addColorStop(1, c.main);
    roundRect(ctx, startX, fac.y, barW, barH, 10);
    ctx.fillStyle = barGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Points text inside bar
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${fac.pts.toLocaleString()} pts`, startX + barW + 15, fac.y + 30);

    // Percentage on the right
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "16px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`${pct}%`, width - 40, fac.y + 30);

    // Leader indicator
    if (fac.pts === leaderPts && fac.pts > 0) {
      ctx.fillStyle = "#ffd700";
      ctx.font = "16px Arial";
      ctx.textAlign = "left";
      ctx.fillText("👑 LEADING", startX + barW + 75, fac.y + 30);
    }
  });

  // ── Footer ─────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Total: ${total.toLocaleString()} points  •  Earned through missions, battles & submissions`, width / 2, height - 25);

  return await canvas.encode("png");
}

// ══════════════════════════════════════════════════════════════
// BATTLE VS IMAGE
// ══════════════════════════════════════════════════════════════
async function generateBattleVsImage(player1, player2) {
  const width = 900;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ── Background ─────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, width, 0);
  bg.addColorStop(0, "#1a0a0a");
  bg.addColorStop(0.45, "#0a0a1a");
  bg.addColorStop(0.55, "#0a0a1a");
  bg.addColorStop(1, "#0a1a0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // ── Lightning / Energy lines ───────────────────────────────
  ctx.strokeStyle = "rgba(139, 92, 246, 0.15)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const y = 50 + Math.random() * 300;
    ctx.beginPath();
    ctx.moveTo(350, y);
    const midX = 450 + (Math.random() - 0.5) * 40;
    const midY = y + (Math.random() - 0.5) * 60;
    ctx.quadraticCurveTo(midX, midY, 550, 50 + Math.random() * 300);
    ctx.stroke();
  }

  // ── Draw player circle ─────────────────────────────────────
  function drawPlayerSide(x, player, color) {
    const p = player || { username: "???", level: 1, faction: "none" };

    // Outer glow ring
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, 180, 90, 0, Math.PI * 2);
    ctx.stroke();

    // Inner circle with initial
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, 180, 85, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    // Player initial
    ctx.fillStyle = color;
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((p.username || "?").charAt(0).toUpperCase(), x, 180);
    ctx.textBaseline = "alphabetic";

    // Player name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.fillText(p.username || "Unknown", x, 310);

    // Level & faction
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "16px Arial";
    const facIcon = FACTION_ICONS[p.faction] || "✨";
    ctx.fillText(`Lv.${p.level || 1} ${facIcon} ${(p.faction || "none").toUpperCase()}`, x, 340);

    // Aura
    ctx.fillStyle = color;
    ctx.font = "bold 16px Arial";
    ctx.fillText(`✨ Aura: ${p.aura || 0}`, x, 365);
  }

  drawPlayerSide(200, player1, "#e74c3c");
  drawPlayerSide(700, player2, "#3498db");

  // ── VS Badge ───────────────────────────────────────────────
  ctx.shadowColor = "#8b5cf6";
  ctx.shadowBlur = 40;

  // VS circle
  ctx.beginPath();
  ctx.arc(450, 180, 55, 0, Math.PI * 2);
  const vsGrad = ctx.createRadialGradient(450, 180, 0, 450, 180, 55);
  vsGrad.addColorStop(0, "#8b5cf6");
  vsGrad.addColorStop(1, "#4c1d95");
  ctx.fillStyle = vsGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "center";
  ctx.fillText("VS", 450, 195);

  // ── Title ──────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "bold 20px Arial";
  ctx.fillText("⚔️  PVP BATTLE  ⚔️", 450, 50);

  return await canvas.encode("png");
}

module.exports = { generateFactionGraph, generateFacPointsCard, generateBattleVsImage };

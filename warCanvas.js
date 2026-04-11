// ============================
// WAR CANVAS - VS matchup + bracket images
// ============================

const { createCanvas } = require("@napi-rs/canvas");

const FACTION_COLORS = {
  harmony: { primary: "#2ecc71", secondary: "#1a7a3e", glow: "#27ae60" },
  purity:  { primary: "#3498db", secondary: "#1a5276", glow: "#2980b9" },
  rift:    { primary: "#e74c3c", secondary: "#7b241c", glow: "#c0392b" },
  default: { primary: "#f39c12", secondary: "#7d6608", glow: "#e67e22" },
};

const FACTION_ICONS = { harmony: "🌿", purity: "⚔️", rift: "🔶" };

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

// ── Main VS card for war matchups ───────────────────────────
async function generateVsCanvas(p1, p2, warTitle = "FACTION WAR") {
  const width = 1000;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(0.5, "#12091f");
  bg.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Diagonal split effect
  ctx.save();
  const c1 = FACTION_COLORS[p1?.faction?.toLowerCase()] || FACTION_COLORS.default;
  const c2 = FACTION_COLORS[p2?.faction?.toLowerCase()] || FACTION_COLORS.default;

  // Left side glow
  const lg = ctx.createLinearGradient(0, 0, width / 2, height);
  lg.addColorStop(0, c1.primary + "15");
  lg.addColorStop(1, "transparent");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, width / 2, height);

  // Right side glow
  const rg = ctx.createLinearGradient(width / 2, 0, width, height);
  rg.addColorStop(0, "transparent");
  rg.addColorStop(1, c2.primary + "15");
  ctx.fillStyle = rg;
  ctx.fillRect(width / 2, 0, width / 2, height);
  ctx.restore();

  // Grid pattern overlay
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
  }
  for (let i = 0; i < height; i += 40) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
  }

  // Header banner
  roundRect(ctx, 250, 20, 500, 50, 10);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "bold 22px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(warTitle.toUpperCase(), 500, 52);

  // ── Player 1 (Left) ─────────────────────────────────────
  drawFighter(ctx, 120, 120, 300, 280, p1, c1);

  // ── Player 2 (Right) ─────────────────────────────────────
  drawFighter(ctx, 580, 120, 300, 280, p2, c2);

  // ── VS Badge (Center) ────────────────────────────────────
  // Circle bg
  ctx.save();
  ctx.shadowBlur = 40;
  ctx.shadowColor = "#ff00ff";
  ctx.beginPath();
  ctx.arc(500, 260, 55, 0, Math.PI * 2);
  const vsBg = ctx.createRadialGradient(500, 260, 10, 500, 260, 55);
  vsBg.addColorStop(0, "#2d1654");
  vsBg.addColorStop(1, "#1a0a30");
  ctx.fillStyle = vsBg;
  ctx.fill();
  ctx.strokeStyle = "#ff00ff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // VS text
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = "#ff00ff";
  const vsGrad = ctx.createLinearGradient(470, 240, 530, 280);
  vsGrad.addColorStop(0, "#00ffff");
  vsGrad.addColorStop(0.5, "#ffffff");
  vsGrad.addColorStop(1, "#ff00ff");
  ctx.fillStyle = vsGrad;
  ctx.font = "italic bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", 500, 260);
  ctx.restore();

  // Footer
  ctx.font = "14px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "center";
  ctx.fillText("LUMORA FACTION WAR TERMINAL", 500, 470);

  return canvas.toBuffer("image/png");
}

function drawFighter(ctx, x, y, w, h, player, colors) {
  const p = player || { username: "UNKNOWN", faction: "neutral" };
  const name = (p.username || "UNKNOWN").toUpperCase();
  const faction = (p.faction || "neutral").toUpperCase();

  // Card background
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = colors.primary;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "rgba(10,10,20,0.85)";
  ctx.fill();
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Faction banner at top
  roundRect(ctx, x, y, w, 45, 12);
  // Only round top corners - fill over bottom
  ctx.fillStyle = colors.secondary;
  ctx.fill();
  ctx.fillRect(x, y + 20, w, 25);

  ctx.font = "bold 18px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(faction, x + w / 2, y + 30);

  // Player avatar circle
  const cx = x + w / 2;
  const cy = y + 120;
  const radius = 50;

  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = colors.primary;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Avatar fill with initial
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const avatarGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
  avatarGrad.addColorStop(0, colors.secondary);
  avatarGrad.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = avatarGrad;
  ctx.fill();

  ctx.font = "bold 44px Arial";
  ctx.fillStyle = colors.primary;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.charAt(0), cx, cy);
  ctx.textBaseline = "alphabetic";

  // Player name
  ctx.font = "bold 24px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  // Truncate long names
  const displayName = name.length > 14 ? name.substring(0, 12) + ".." : name;
  ctx.fillText(displayName, x + w / 2, y + 210);

  // Stats line
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const level = p.level || 1;
  const aura = p.aura || 0;
  ctx.fillText(`Lv ${level}  |  Aura ${aura}`, x + w / 2, y + 240);

  // Ready indicator
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = colors.primary;
  ctx.fillText("READY FOR WAR", x + w / 2, y + 265);
}

// ── Bracket image for .war bracket ──────────────────────────
async function generateBracketCanvas(war, playersDB) {
  const matches = war.matches || [];
  const matchCount = Math.max(matches.length, 1);
  const width = 800;
  const matchH = 80;
  const spacing = 15;
  const headerH = 90;
  const height = headerH + matchCount * (matchH + spacing) + 60;

  const canvas = createCanvas(width, Math.min(height, 1200));
  const ctx = canvas.getContext("2d");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(1, "#0d1117");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, canvas.height);

  // Header
  ctx.font = "bold 28px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(`FACTION WAR #${war.warCount}`, width / 2, 40);

  ctx.font = "18px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(`Round ${war.round}  |  ${war.participants.length} Fighters`, width / 2, 68);

  // Matches
  const startY = headerH;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const my = startY + i * (matchH + spacing);

    // Match card background
    roundRect(ctx, 30, my, width - 60, matchH, 10);
    const isDone = m.status === "done";
    const isActive = m.status === "active";
    ctx.fillStyle = isActive ? "rgba(100,50,200,0.15)" : "rgba(20,20,40,0.8)";
    ctx.fill();

    const borderColor = isDone ? "rgba(100,255,100,0.3)" : isActive ? "rgba(150,100,255,0.5)" : "rgba(255,255,255,0.1)";
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isDone ? 2 : 1;
    ctx.stroke();

    // Match number
    ctx.font = "bold 14px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "left";
    ctx.fillText(`#${i + 1}`, 50, my + 25);

    // Player names
    const p1Name = getName(m.p1, war, playersDB);
    const p2Name = m.p2 ? getName(m.p2, war, playersDB) : "BYE";
    const p1Faction = getFactionColor(m.p1, war, playersDB);
    const p2Faction = m.p2 ? getFactionColor(m.p2, war, playersDB) : FACTION_COLORS.default;

    // P1
    ctx.font = m.winner === m.p1 ? "bold 20px Arial" : "20px Arial";
    ctx.fillStyle = m.winner === m.p1 ? "#2ecc71" : m.winner && m.winner !== m.p1 ? "rgba(255,255,255,0.35)" : "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(p1Name, 100, my + 35);

    // VS
    ctx.font = "bold 16px Arial";
    ctx.fillStyle = isActive ? "#ff00ff" : "rgba(255,255,255,0.3)";
    ctx.textAlign = "center";
    ctx.fillText("VS", width / 2, my + 45);

    // P2
    ctx.font = m.winner === m.p2 ? "bold 20px Arial" : "20px Arial";
    ctx.fillStyle = m.winner === m.p2 ? "#2ecc71" : m.winner && m.winner !== m.p2 ? "rgba(255,255,255,0.35)" : "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(p2Name, width - 100, my + 35);

    // Status indicator
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    if (isDone) {
      ctx.fillStyle = "#2ecc71";
      ctx.fillText("COMPLETED", width / 2, my + 65);
    } else if (isActive) {
      ctx.fillStyle = "#ff00ff";
      ctx.fillText("NOW FIGHTING", width / 2, my + 65);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText("PENDING", width / 2, my + 65);
    }

    // Faction dots
    ctx.beginPath();
    ctx.arc(85, my + 32, 6, 0, Math.PI * 2);
    ctx.fillStyle = p1Faction.primary;
    ctx.fill();

    if (m.p2) {
      ctx.beginPath();
      ctx.arc(width - 85, my + 32, 6, 0, Math.PI * 2);
      ctx.fillStyle = p2Faction.primary;
      ctx.fill();
    }
  }

  return canvas.toBuffer("image/png");
}

function getName(id, war, playersDB) {
  const wp = war.participants.find((x) => x.id === id);
  if (wp) return wp.username || "???";
  if (playersDB?.[id]) return playersDB[id].username || "???";
  return "???";
}

function getFactionColor(id, war, playersDB) {
  const wp = war.participants.find((x) => x.id === id);
  const faction = wp?.faction || playersDB?.[id]?.faction || "default";
  return FACTION_COLORS[faction.toLowerCase()] || FACTION_COLORS.default;
}

// ── War results card ────────────────────────────────────────
async function generateWarResultCanvas(champion, runnerUp, war, playersDB) {
  const width = 900;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(0.5, "#1a0a30");
  bg.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Gold particle effect
  for (let i = 0; i < 30; i++) {
    const px = Math.random() * width;
    const py = Math.random() * height;
    const size = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 215, 0, ${Math.random() * 0.3 + 0.1})`;
    ctx.fill();
  }

  // Title
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = "#ffd700";
  ctx.font = "bold 36px Arial";
  const titleGrad = ctx.createLinearGradient(300, 40, 600, 40);
  titleGrad.addColorStop(0, "#ffd700");
  titleGrad.addColorStop(0.5, "#fff");
  titleGrad.addColorStop(1, "#ffd700");
  ctx.fillStyle = titleGrad;
  ctx.textAlign = "center";
  ctx.fillText(`WAR #${war.warCount} CHAMPION`, width / 2, 60);
  ctx.restore();

  // Champion card
  const champData = playersDB?.[champion] || {};
  const champName = (champData.username || "CHAMPION").toUpperCase();
  const champFaction = champData.faction || "neutral";
  const champColors = FACTION_COLORS[champFaction.toLowerCase()] || FACTION_COLORS.default;

  // Large champion circle
  ctx.save();
  ctx.shadowBlur = 40;
  ctx.shadowColor = "#ffd700";
  ctx.beginPath();
  ctx.arc(width / 2, 200, 75, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(width / 2, 200, 70, 0, Math.PI * 2);
  const cGrad = ctx.createRadialGradient(width / 2, 200, 15, width / 2, 200, 70);
  cGrad.addColorStop(0, champColors.secondary);
  cGrad.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = cGrad;
  ctx.fill();

  ctx.font = "bold 56px Arial";
  ctx.fillStyle = "#ffd700";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(champName.charAt(0), width / 2, 200);
  ctx.textBaseline = "alphabetic";

  // Crown
  ctx.font = "40px Arial";
  ctx.fillText("👑", width / 2, 110);

  // Champion name
  ctx.font = "bold 32px Arial";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(champName, width / 2, 310);

  ctx.font = "18px Arial";
  ctx.fillStyle = champColors.primary;
  ctx.fillText(champFaction.toUpperCase(), width / 2, 340);

  // Rewards line
  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("3000 Lucons  |  +50 Aura  |  +30 Resonance", width / 2, 380);

  // Runner up
  if (runnerUp) {
    const ruData = playersDB?.[runnerUp] || {};
    const ruName = (ruData.username || "Runner-Up").toUpperCase();
    ctx.font = "18px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(`Runner-Up: ${ruName}  (1500 Lucons | +25 Aura | +15 Resonance)`, width / 2, 420);
  }

  // Footer
  ctx.font = "14px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillText("LUMORA FACTION WAR", width / 2, 475);

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateVsCanvas,
  generateBracketCanvas,
  generateWarResultCanvas,
};

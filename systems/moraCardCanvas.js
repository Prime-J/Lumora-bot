const { createCanvas, registerFont } = require("@napi-rs/canvas");
const path = require("path");

// Color map for rarity
const RARITY_COLORS = {
  common: { bg: "#2C3E50", border: "#95A5A6", glow: "#BDC3C7" },
  uncommon: { bg: "#27AE60", border: "#2ECC71", glow: "#58D68D" },
  rare: { bg: "#2E86AB", border: "#0496FF", glow: "#4DB8FF" },
  epic: { bg: "#6C3483", border: "#AF7AC5", glow: "#D7BDE2" },
  legendary: { bg: "#D4AF37", border: "#F1C40F", glow: "#FFFACD" }
};

// Type emoji map
const TYPE_EMOJIS = {
  fire: "🔥",
  water: "💧",
  earth: "🌍",
  nature: "🌿",
  wind: "💨",
  electric: "⚡",
  ice: "❄️",
  dark: "🌑",
  light: "✨",
  psychic: "🧠",
  metal: "⚙️",
  dragon: "🐉"
};

/**
 * Generate a beautiful mora card canvas
 * @param {Object} mora - { id, name, type, rarity, stats: { hp, atk, def, spa, spd, spe }, moves: [...], special: {...}, creator }
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateMoraCard(mora) {
  const canvas = createCanvas(800, 1100);
  const ctx = canvas.getContext("2d");

  // Fallback rarity
  const rarity = (mora.rarity || "common").toLowerCase();
  const colors = RARITY_COLORS[rarity] || RARITY_COLORS.common;

  // ====== BACKGROUND ======
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1100);
  bgGrad.addColorStop(0, colors.bg);
  bgGrad.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 1100);

  // ====== RARITY BORDER ======
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 8;
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 20;
  ctx.strokeRect(10, 10, 780, 1080);
  ctx.shadowColor = "transparent";

  // ====== HEADER SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(20, 20, 760, 100);

  // Name
  ctx.fillStyle = colors.glow;
  ctx.font = "bold 50px Arial";
  ctx.textAlign = "left";
  ctx.fillText(mora.name || "Unknown Mora", 50, 70);

  // Type & Rarity
  const typeEmoji = TYPE_EMOJIS[mora.type?.toLowerCase()] || "⚡";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`${typeEmoji} ${rarity.toUpperCase()}`, 750, 70);

  // ====== ARTWORK PLACEHOLDER ======
  const artBg = ctx.createLinearGradient(50, 140, 750, 380);
  artBg.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  artBg.addColorStop(0.5, "rgba(255, 255, 255, 0.02)");
  artBg.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = artBg;
  ctx.fillRect(50, 140, 700, 240);

  // Artwork border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 140, 700, 240);

  // Centered artwork placeholder
  ctx.fillStyle = colors.glow;
  ctx.font = "100px Arial";
  ctx.textAlign = "center";
  ctx.fillText(typeEmoji, 400, 290);

  // ====== DESCRIPTION ======
  ctx.fillStyle = "#E8E8E8";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  const desc = mora.description || "A mysterious Mora...";
  const wrappedDesc = wrapText(ctx, desc, 680, 24);
  wrappedDesc.forEach((line, i) => {
    ctx.fillText(line, 60, 420 + i * 24);
  });

  // ====== STATS SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(40, 520, 720, 280);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("STATS", 60, 555);

  const stats = mora.stats || { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  const statLabels = [
    { name: "HP", key: "hp", x: 60, y: 600 },
    { name: "ATK", key: "atk", x: 240, y: 600 },
    { name: "DEF", key: "def", x: 420, y: 600 },
    { name: "SpA", key: "spa", x: 600, y: 600 },
    { name: "SpD", key: "spd", x: 60, y: 700 },
    { name: "SPE", key: "spe", x: 240, y: 700 }
  ];

  statLabels.forEach((stat) => {
    const val = stats[stat.key] || 50;
    drawStatBar(ctx, stat.x, stat.y, stat.name, val, colors.glow);
  });

  // ====== MOVES SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(40, 820, 720, 250);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("MOVES", 60, 855);

  const moves = mora.moves || [];
  moves.slice(0, 4).forEach((move, i) => {
    const y = 895 + i * 35;
    ctx.fillStyle = "#E8E8E8";
    ctx.font = "18px Arial";
    const moveStr = move.name ? `${move.name}` : move.toString();
    ctx.fillText("• " + moveStr, 70, y);
  });

  // Special move
  if (mora.special) {
    ctx.fillStyle = colors.glow;
    ctx.font = "bold 18px Arial";
    const specialStr = mora.special.name ? `★ ${mora.special.name}` : `★ ${mora.special.toString()}`;
    ctx.fillText(specialStr, 70, 1020);
  }

  // ====== FOOTER ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 1070, 800, 30);

  ctx.fillStyle = "#999999";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  const creator = mora.creator || "Unknown";
  ctx.fillText(`Created by ${creator} • Lumora Labs`, 400, 1089);

  return await canvas.encode("png");
}

/**
 * Draw a stat bar with label and value
 */
function drawStatBar(ctx, x, y, label, value, color) {
  const maxWidth = 150;
  const barWidth = (Math.min(Math.max(value, 0), 150) / 150) * maxWidth;

  // Label
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);

  // Value
  ctx.fillStyle = color;
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "right";
  ctx.fillText(value.toString(), x + maxWidth + 40, y);

  // Bar background
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(x, y + 5, maxWidth, 12);

  // Bar fill
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 5, barWidth, 12);

  // Bar border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y + 5, maxWidth, 12);
}

/**
 * Wrap text to fit width
 */
function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const testLine = line + (line ? " " : "") + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  });
  if (line) lines.push(line);
  return lines;
}

module.exports = { generateMoraCard };

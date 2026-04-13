const { createCanvas } = require("@napi-rs/canvas");

// Faction colors
const FACTION_COLORS = {
  primordial: { bg: "#1a0033", border: "#9D4EDD", accent: "#E0AAFF" },
  celestial: { bg: "#001a33", border: "#0096FF", accent: "#64B5F6" },
  infernal: { bg: "#330000", border: "#FF6B35", accent: "#FFB347" },
  verdant: { bg: "#001100", border: "#52B788", accent: "#95D5B2" },
  neutral: { bg: "#1a1a1a", border: "#888888", accent: "#CCCCCC" }
};

/**
 * Generate player profile card
 * @param {Object} player - { username, faction, level, xp, intel, aura, totalCreations, equippedAchievement, achievementAura }
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateProfileCard(player) {
  const canvas = createCanvas(900, 1000);
  const ctx = canvas.getContext("2d");

  const faction = (player.faction || "neutral").toLowerCase();
  const colors = FACTION_COLORS[faction] || FACTION_COLORS.neutral;

  // ====== BACKGROUND ======
  const bgGrad = ctx.createLinearGradient(0, 0, 900, 1000);
  bgGrad.addColorStop(0, colors.bg);
  bgGrad.addColorStop(1, "#0f0f0f");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 900, 1000);

  // ====== BORDER ======
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 6;
  ctx.shadowColor = colors.accent;
  ctx.shadowBlur = 15;
  ctx.strokeRect(10, 10, 880, 980);
  ctx.shadowColor = "transparent";

  // ====== HEADER / NAME ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(20, 20, 860, 100);

  ctx.fillStyle = colors.accent;
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "left";
  ctx.fillText(player.username || "Player", 50, 80);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "right";
  ctx.fillText(faction.toUpperCase(), 850, 80);

  // ====== PROFILE AVATAR / DECORATION ======
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.beginPath();
  ctx.arc(450, 200, 80, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(450, 200, 80, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = colors.accent;
  ctx.font = "60px Arial";
  ctx.textAlign = "center";
  const avatarEmoji = getAvatarEmoji(faction);
  ctx.fillText(avatarEmoji, 450, 210);

  // ====== MAIN STATS SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(30, 300, 840, 180);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("CHARACTER STATS", 50, 335);

  // Stat rows
  const statY = 380;
  const rowHeight = 35;

  drawStatRow(ctx, 50, statY, "Level", player.level || 1, colors.accent);
  drawStatRow(ctx, 50, statY + rowHeight, "Intelligence", player.intel || 0, colors.accent);
  drawStatRow(ctx, 50, statY + rowHeight * 2, "Moras Created", player.totalCreations || 0, colors.accent);
  drawStatRow(ctx, 50, statY + rowHeight * 3, "Experience", formatNumber(player.xp || 0), colors.accent);

  // ====== AURA SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(30, 500, 840, 140);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("AURA POWER", 50, 535);

  const baseAura = player.aura || 0;
  const equippedAura = player.achievementAura || 0;
  const totalAura = baseAura + equippedAura;

  // Aura bar
  const auraBarY = 575;
  drawAuraBar(ctx, 50, auraBarY, totalAura, colors);

  // Aura breakdown
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Base Aura: ${baseAura}`, 50, 620);
  if (equippedAura > 0) {
    ctx.fillStyle = colors.accent;
    ctx.fillText(`+ Equipped Achievement: ${equippedAura}`, 350, 620);
  }

  // ====== ACHIEVEMENT SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(30, 660, 840, 290);

  ctx.fillStyle = colors.border;
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("EQUIPPED ACHIEVEMENT", 50, 695);

  if (player.equippedAchievement) {
    const achievement = player.equippedAchievement;

    // Achievement frame
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(50, 720, 800, 200);

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 720, 800, 200);

    // Achievement icon (emoji)
    ctx.fillStyle = colors.accent;
    ctx.font = "80px Arial";
    ctx.textAlign = "center";
    ctx.fillText(achievement.icon || "🏆", 130, 800);

    // Achievement title and description
    ctx.fillStyle = colors.accent;
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "left";
    ctx.fillText(achievement.title || "Unknown Achievement", 200, 760);

    ctx.fillStyle = "#CCCCCC";
    ctx.font = "16px Arial";
    const desc = achievement.desc || "Mysterious achievement";
    const wrappedDesc = wrapText(ctx, desc, 600, 20);
    wrappedDesc.forEach((line, i) => {
      ctx.fillText(line, 200, 790 + i * 20);
    });

    // Aura bonus
    ctx.fillStyle = colors.glow || colors.accent;
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Aura Bonus: +${equippedAura} ✨`, 200, 895);
  } else {
    ctx.fillStyle = "#666666";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No achievement equipped", 450, 830);
    ctx.font = "16px Arial";
    ctx.fillText("Use .equip <achievement> to showcase your power", 450, 860);
  }

  // ====== FOOTER ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 970, 900, 30);

  ctx.fillStyle = "#999999";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Lumora: Awakening", 450, 989);

  return await canvas.encode("png");
}

/**
 * Get faction emoji
 */
function getAvatarEmoji(faction) {
  const emojis = {
    primordial: "🔮",
    celestial: "⭐",
    infernal: "🔥",
    verdant: "🌿",
    neutral: "⚫"
  };
  return emojis[faction] || "⚫";
}

/**
 * Draw a stat row
 */
function drawStatRow(ctx, x, y, label, value, color) {
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);

  ctx.fillStyle = color;
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "right";
  ctx.fillText(value.toString(), 850, y);
}

/**
 * Draw aura power bar
 */
function drawAuraBar(ctx, x, y, auraValue, colors) {
  const maxAuraDisplay = 100;
  const barWidth = 700;
  const displayVal = Math.min(auraValue, maxAuraDisplay);
  const fillWidth = (displayVal / maxAuraDisplay) * barWidth;

  // Background
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(x, y, barWidth, 20);

  // Border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, barWidth, 20);

  // Fill with gradient
  const grad = ctx.createLinearGradient(x, y, x + fillWidth, y);
  grad.addColorStop(0, colors.accent);
  grad.addColorStop(1, colors.border);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, fillWidth, 20);

  // Value text
  ctx.fillStyle = colors.accent;
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(auraValue.toString(), x + barWidth + 50, y + 16);
}

/**
 * Format large numbers with K, M
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
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

module.exports = { generateProfileCard };

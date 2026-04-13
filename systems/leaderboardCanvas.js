const { createCanvas } = require("@napi-rs/canvas");

/**
 * Generate leaderboard visual card
 * @param {Array} topPlayers - [ { rank, username, level, faction, xp, aura, totalCreations }, ... ]
 * @param {string} leaderboardType - "level", "xp", "aura", "creations"
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateLeaderboard(topPlayers, leaderboardType = "level") {
  const canvas = createCanvas(1000, 1200);
  const ctx = canvas.getContext("2d");

  // ====== BACKGROUND ======
  const bgGrad = ctx.createLinearGradient(0, 0, 1000, 1200);
  bgGrad.addColorStop(0, "#0a0a1a");
  bgGrad.addColorStop(0.5, "#16213e");
  bgGrad.addColorStop(1, "#0f3460");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1000, 1200);

  // ====== HEADER ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, 1000, 100);

  ctx.strokeStyle = "#00D9FF";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 980, 80);

  ctx.fillStyle = "#00D9FF";
  ctx.font = "italic bold 50px Arial";
  ctx.textAlign = "center";
  const titleMap = {
    level: "LEVEL CHAMPIONS",
    xp: "EXPERIENCE MASTERS",
    aura: "AURA LEGENDS",
    creations: "MORA ARCHITECTS"
  };
  ctx.fillText(titleMap[leaderboardType] || "LEADERBOARD", 500, 65);

  // ====== LEADERBOARD TABLE ======
  const startY = 130;
  const rowHeight = 90;
  const maxPlayers = Math.min(topPlayers.length, 10);

  topPlayers.slice(0, maxPlayers).forEach((player, index) => {
    const y = startY + index * rowHeight;
    drawLeaderboardRow(ctx, y, player, index + 1, leaderboardType);
  });

  // ====== MEDALS FOR TOP 3 ======
  if (topPlayers.length > 0) {
    drawMedal(ctx, 1, topPlayers[0], "🥇 1ST PLACE");
  }
  if (topPlayers.length > 1) {
    drawMedal(ctx, 2, topPlayers[1], "🥈 2ND PLACE");
  }
  if (topPlayers.length > 2) {
    drawMedal(ctx, 3, topPlayers[2], "🥉 3RD PLACE");
  }

  // ====== FOOTER ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 1150, 1000, 50);

  ctx.fillStyle = "#999999";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  const timestamp = new Date().toLocaleDateString();
  ctx.fillText(`Lumora: Awakening • Last Updated: ${timestamp}`, 500, 1175);

  return await canvas.encode("png");
}

/**
 * Draw a single leaderboard row
 */
function drawLeaderboardRow(ctx, y, player, rank, leaderboardType) {
  const bgColor = getRankColor(rank);

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(20, y, 960, 80);

  // Border
  ctx.strokeStyle = bgColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, y, 960, 80);

  // ====== RANK BADGE ======
  const medalEmoji = getMedalEmoji(rank);
  ctx.fillStyle = bgColor;
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "center";
  ctx.fillText(medalEmoji, 60, y + 55);

  // ====== PLAYER INFO ======
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "left";
  ctx.fillText(player.username || "Unknown", 130, y + 35);

  // Faction
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "16px Arial";
  ctx.fillText(getFactionEmoji(player.faction) + " " + (player.faction || "neutral").toUpperCase(), 130, y + 60);

  // ====== STAT DISPLAY ======
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "right";

  let statText = "";
  switch (leaderboardType) {
    case "xp":
      statText = formatNumber(player.xp || 0) + " XP";
      break;
    case "aura":
      statText = player.aura + " ⭐";
      break;
    case "creations":
      statText = (player.totalCreations || 0) + " 🔨";
      break;
    case "level":
    default:
      statText = "LV " + (player.level || 1);
  }
  ctx.fillText(statText, 950, y + 35);

  // Secondary stat
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "14px Arial";
  const secondaryText = `${player.level || 1} • ${formatNumber(player.xp || 0)} XP`;
  ctx.fillText(secondaryText, 950, y + 60);
}

/**
 * Draw medal badge for top 3
 */
function drawMedal(ctx, position, player, label) {
  const x = position === 1 ? 500 : position === 2 ? 250 : 750;
  const y = 120;

  // Medal background
  ctx.fillStyle = "rgba(255, 215, 0, 0.1)";
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fill();

  // Medal border
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.stroke();

  // Medal text
  ctx.fillStyle = "#FFD700";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 12);
}

/**
 * Get color based on rank
 */
function getRankColor(rank) {
  const colors = {
    1: "#FFD700",    // Gold
    2: "#C0C0C0",    // Silver
    3: "#CD7F32",    // Bronze
    4: "#00D9FF",
    5: "#00D9FF",
    6: "#888888",
    7: "#888888",
    8: "#888888",
    9: "#666666",
    10: "#666666"
  };
  return colors[rank] || "#666666";
}

/**
 * Get medal emoji
 */
function getMedalEmoji(rank) {
  const emojis = {
    1: "🥇",
    2: "🥈",
    3: "🥉",
    4: "#4",
    5: "#5",
    6: "#6",
    7: "#7",
    8: "#8",
    9: "#9",
    10: "#10"
  };
  return emojis[rank] || String(rank);
}

/**
 * Get faction emoji
 */
function getFactionEmoji(faction) {
  const emojis = {
    primordial: "🔮",
    celestial: "⭐",
    infernal: "🔥",
    verdant: "🌿",
    neutral: "⚫"
  };
  return emojis[faction?.toLowerCase()] || "⚫";
}

/**
 * Format large numbers
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

module.exports = { generateLeaderboard };

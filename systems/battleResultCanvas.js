const { createCanvas } = require("@napi-rs/canvas");

/**
 * Generate battle result card
 * @param {Object} result - { winner, loser, winnerId, loserId, xpGained, xpLost, itemsWon, lootRarity, battleDuration }
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateBattleResult(result) {
  const canvas = createCanvas(950, 700);
  const ctx = canvas.getContext("2d");

  const isWin = result.winner === "player"; // or check from result structure

  // ====== BACKGROUND ======
  let bgGrad;
  if (isWin) {
    bgGrad = ctx.createLinearGradient(0, 0, 950, 700);
    bgGrad.addColorStop(0, "#004d00");
    bgGrad.addColorStop(0.5, "#1a3a1a");
    bgGrad.addColorStop(1, "#0d0d0d");
  } else {
    bgGrad = ctx.createLinearGradient(0, 0, 950, 700);
    bgGrad.addColorStop(0, "#330000");
    bgGrad.addColorStop(0.5, "#1a0a0a");
    bgGrad.addColorStop(1, "#0d0d0d");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 950, 700);

  // ====== RESULT HEADER ======
  const headerColor = isWin ? "#00FF00" : "#FF4444";
  const headerText = isWin ? "VICTORY!" : "DEFEAT...";

  ctx.fillStyle = headerColor;
  ctx.font = "italic bold 80px Arial";
  ctx.textAlign = "center";
  ctx.shadowColor = headerColor;
  ctx.shadowBlur = 30;
  ctx.fillText(headerText, 475, 100);
  ctx.shadowColor = "transparent";

  // ====== MATCHUP INFO ======
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(30, 140, 890, 140);

  ctx.strokeStyle = headerColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 140, 890, 140);

  const winner = result.winner || "Unknown";
  const loser = result.loser || "Unknown";

  // Left side - winner
  ctx.fillStyle = headerColor;
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "left";
  ctx.fillText(winner, 60, 190);

  ctx.fillStyle = "#CCCCCC";
  ctx.font = "18px Arial";
  ctx.fillText("VICTORY", 60, 215);

  // Right side - loser
  ctx.fillStyle = "#888888";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "right";
  ctx.fillText(loser, 920, 190);

  ctx.fillStyle = "#666666";
  ctx.font = "18px Arial";
  ctx.fillText("DEFEAT", 920, 215);

  // VS label
  ctx.fillStyle = headerColor;
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "center";
  ctx.fillText("VS", 475, 250);

  // ====== REWARDS SECTION ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(30, 310, 890, 340);

  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "left";
  ctx.fillText("⭐ REWARDS EARNED", 60, 360);

  // XP Gained
  ctx.fillStyle = "#64FF64";
  ctx.font = "bold 28px Arial";
  ctx.fillText("Experience", 60, 410);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "right";
  ctx.fillText("+" + formatNumber(result.xpGained || 0) + " XP", 900, 410);

  // Divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 435);
  ctx.lineTo(900, 435);
  ctx.stroke();

  // Loot section
  ctx.fillStyle = "#FF9800";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.fillText("🎁 Loot Acquired", 60, 480);

  if (result.itemsWon && result.itemsWon.length > 0) {
    const items = result.itemsWon;
    items.slice(0, 4).forEach((item, i) => {
      const itemY = 520 + i * 40;
      ctx.fillStyle = getRarityColor(item.rarity);
      ctx.font = "18px Arial";
      ctx.textAlign = "left";
      const itemText = `• ${item.name || "Unknown"} x${item.quantity || 1}`;
      ctx.fillText(itemText, 80, itemY);
    });

    if (items.length > 4) {
      ctx.fillStyle = "#999999";
      ctx.font = "16px Arial";
      ctx.fillText(`...and ${items.length - 4} more items`, 80, 520 + 4 * 40);
    }
  } else {
    ctx.fillStyle = "#CCCCCC";
    ctx.font = "18px Arial";
    ctx.fillText("No items found", 80, 520);
  }

  // ====== FOOTER STATS ======
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(0, 660, 950, 40);

  const durationText = result.battleDuration
    ? `${result.battleDuration} rounds`
    : "Quick battle";
  const damageText = result.damageDealt ? `Damage: ${result.damageDealt}` : "";

  ctx.fillStyle = "#999999";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${durationText} • ${damageText} • Lumora Battle Arena`, 475, 679);

  return await canvas.encode("png");
}

/**
 * Get rarity color
 */
function getRarityColor(rarity) {
  const colors = {
    common: "#95A5A6",
    uncommon: "#2ECC71",
    rare: "#3498DB",
    epic: "#9B59B6",
    legendary: "#F1C40F",
    mythic: "#FF6B6B"
  };
  return colors[rarity?.toLowerCase()] || colors.common;
}

/**
 * Format large numbers
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

module.exports = { generateBattleResult };

const { createCanvas } = require("@napi-rs/canvas");

/**
 * Generate achievement unlock card with dramatic styling
 * @param {Object} achievement - { title, desc, icon, aura }
 * @param {Object} player - { username, level }
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateAchievementUnlock(achievement, player) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext("2d");

  // ====== ANIMATED BACKGROUND ======
  const bgGrad = ctx.createLinearGradient(0, 0, 800, 600);
  bgGrad.addColorStop(0, "#1a0033");
  bgGrad.addColorStop(0.5, "#330066");
  bgGrad.addColorStop(1, "#0f0011");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 600);

  // Particle effect (simple stars)
  ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  const stars = ["✨", "⭐", "🌟"];
  for (let i = 0; i < 12; i++) {
    const x = (i % 4) * 200 + 100;
    const y = Math.floor(i / 4) * 200 + 100;
    ctx.fillText(stars[i % 3], x, y);
  }

  // ====== MAIN CARD ======
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(50, 100, 700, 400);

  // Glow border
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 30;
  ctx.strokeRect(50, 100, 700, 400);
  ctx.shadowColor = "transparent";

  // ====== HEADER TEXT ======
  ctx.fillStyle = "#FFD700";
  ctx.font = "italic bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillText("✨ ACHIEVEMENT UNLOCKED ✨", 400, 160);

  // ====== ACHIEVEMENT ICON (LARGE) ======
  ctx.font = "120px Arial";
  ctx.textAlign = "center";
  ctx.fillText(achievement.icon || "🏆", 400, 280);

  // ====== ACHIEVEMENT TITLE ======
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText(achievement.title || "Unknown Achievement", 400, 340);

  // ====== ACHIEVEMENT DESCRIPTION ======
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "18px Arial";
  const desc = achievement.desc || "A mysterious achievement";
  const wrappedDesc = wrapText(ctx, desc, 600, 22);
  wrappedDesc.forEach((line, i) => {
    ctx.fillText(line, 400, 380 + i * 22);
  });

  // ====== AURA BONUS ======
  if (achievement.aura) {
    ctx.fillStyle = "#64FF64";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`+${achievement.aura} Aura Power`, 400, 540);
  }

  // ====== FOOTER ======
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(0, 550, 800, 50);

  ctx.fillStyle = "#999999";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  const playerText = player?.username || "Brave Adventurer";
  ctx.fillText(`Earned by ${playerText} • Level ${player?.level || 1}`, 400, 575);

  return await canvas.encode("png");
}

/**
 * Generate a mini achievement card for profile display
 * @param {Object} achievement - { title, desc, icon, aura }
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateAchievementCard(achievement) {
  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext("2d");

  // ====== BACKGROUND ======
  const bgGrad = ctx.createLinearGradient(0, 0, 400, 300);
  bgGrad.addColorStop(0, "#1a0033");
  bgGrad.addColorStop(1, "#0f0011");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 400, 300);

  // ====== BORDER ======
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 390, 290);

  // ====== ICON ======
  ctx.font = "80px Arial";
  ctx.textAlign = "center";
  ctx.fillText(achievement.icon || "🏆", 200, 90);

  // ====== TITLE ======
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText(achievement.title || "Achievement", 200, 140);

  // ====== DESCRIPTION ======
  ctx.fillStyle = "#CCCCCC";
  ctx.font = "14px Arial";
  const desc = achievement.desc || "Description";
  const wrappedDesc = wrapText(ctx, desc, 350, 16);
  wrappedDesc.forEach((line, i) => {
    ctx.fillText(line, 200, 165 + i * 16);
  });

  // ====== AURA BONUS ======
  if (achievement.aura) {
    ctx.fillStyle = "#64FF64";
    ctx.font = "bold 16px Arial";
    ctx.fillText(`Aura: +${achievement.aura}`, 200, 270);
  }

  return await canvas.encode("png");
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

module.exports = { generateAchievementUnlock, generateAchievementCard };

const { createCanvas, loadImage } = require("@napi-rs/canvas");

async function drawMatchup(p1, p2, warNumber) {
    const canvas = createCanvas(1200, 600);
    const ctx = canvas.getContext("2d");

    // Background: Dark gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, "#02040a");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 600);

    // Draw War Title Background
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.font = "bold 150px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`WAR #${warNumber || 1}`, 600, 350);

    const drawProfile = async (x, player, color) => {
        // Ensure player object exists to prevent immediate crash
        const p = player || { username: "UNKNOWN", faction: "NEUTRAL" };

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        
        // 1. Draw energy ring
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(x, 250, 120, 0, Math.PI * 2);
        ctx.stroke();

        // 2. Clip and Draw Profile Image
        ctx.beginPath();
        ctx.arc(x, 250, 115, 0, Math.PI * 2);
        ctx.clip();

        try {
            if (p.profileIcon) {
                const img = await loadImage(p.profileIcon);
                ctx.drawImage(img, x - 115, 135, 230, 230);
            } else {
                ctx.fillStyle = "#1a1a1a";
                ctx.fillRect(x - 115, 135, 230, 230);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 100px Arial";
                ctx.textAlign = "center";
                ctx.fillText(p.username?.charAt(0) || "?", x, 285);
            }
        } catch (e) {
            ctx.fillStyle = "#333";
            ctx.fillRect(x - 115, 135, 230, 230);
        }
        ctx.restore();

        // 3. Draw Name Tag (Consolidated & Safe)
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 45px Arial";
        ctx.textAlign = "center";
        const displayName = (p.username || "UNKNOWN").toUpperCase();
        ctx.fillText(displayName, x, 430);

        // 4. Draw Faction Tag (Consolidated & Safe)
        ctx.fillStyle = color;
        ctx.font = "25px Arial";
        const displayFaction = (p.faction || "NEUTRAL").toUpperCase();
        ctx.fillText(displayFaction, x, 470);
    };

    // Draw both contestants
    await drawProfile(300, p1, "#00E5FF"); // Team Blue
    await drawProfile(900, p2, "#FF3C3C"); // Team Red

    // Draw VS Label
    ctx.fillStyle = "#ffffff";
    ctx.font = "italic bold 100px Arial";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#fff";
    ctx.fillText("VS", 600, 280);

    return await canvas.encode('png');
}

module.exports = { drawMatchup };
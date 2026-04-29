// 0.1.3 — Alverah's main-bank ledger card. Pure canvas portrait + stats.
// Generated dynamically so the displayed Bank Owner name + numbers update
// the instant the Architect reassigns the role.

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// Drop your character art at assets/alverah.png (recommend ~600x700,
// transparent or dark background). Falls back to the stylised silhouette
// if the file is missing.
const ALVERAH_IMG_PATH = path.join(__dirname, "..", "assets", "alverah.png");

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

// Stylised "portrait" — silhouette with regal banker iconography.
// Crown, robe collar, scales-of-justice motif behind the head.
function drawAlverahPortrait(ctx, cx, cy, scale, accent, glow) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Halo / scales backdrop
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = glow;
  ctx.lineWidth = 2;
  // Scales of justice (left + right pans)
  ctx.beginPath();
  ctx.moveTo(-90, -110); ctx.lineTo(90, -110);
  ctx.moveTo(-70, -110); ctx.lineTo(-70, -70); ctx.arc(-70, -55, 25, Math.PI, 2*Math.PI);
  ctx.moveTo( 70, -110); ctx.lineTo( 70, -70); ctx.arc( 70, -55, 25, Math.PI, 2*Math.PI);
  ctx.stroke();
  ctx.restore();

  // Halo glow
  const halo = ctx.createRadialGradient(0, -10, 0, 0, -10, 130);
  halo.addColorStop(0, glow + "AA");
  halo.addColorStop(1, glow + "00");
  ctx.fillStyle = halo;
  ctx.fillRect(-150, -160, 300, 320);

  // Robe (trapezoid)
  ctx.fillStyle = "#1e1b4b";
  ctx.beginPath();
  ctx.moveTo(-90, 160);
  ctx.lineTo( 90, 160);
  ctx.lineTo( 60,  60);
  ctx.lineTo(-60,  60);
  ctx.closePath();
  ctx.fill();

  // Robe trim (gold)
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(-90, 160);
  ctx.lineTo(-60,  60);
  ctx.moveTo( 90, 160);
  ctx.lineTo( 60,  60);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Collar (V neckline)
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-60, 60);
  ctx.lineTo( 60, 60);
  ctx.lineTo(  0, 130);
  ctx.closePath();
  ctx.fill();

  // Inner collar (dark)
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.moveTo(-50, 65);
  ctx.lineTo( 50, 65);
  ctx.lineTo(  0, 115);
  ctx.closePath();
  ctx.fill();

  // Head (oval silhouette)
  ctx.fillStyle = "#3b2f4f";
  ctx.beginPath();
  ctx.ellipse(0, 10, 50, 60, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair drape
  ctx.fillStyle = "#1a0f2e";
  ctx.beginPath();
  ctx.moveTo(-50, -10);
  ctx.quadraticCurveTo(-65, 30, -55, 70);
  ctx.lineTo(-30, 60);
  ctx.lineTo(-30, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( 50, -10);
  ctx.quadraticCurveTo( 65, 30,  55, 70);
  ctx.lineTo( 30, 60);
  ctx.lineTo( 30, -10);
  ctx.closePath();
  ctx.fill();

  // Crown (5-point)
  ctx.fillStyle = accent;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  // base
  ctx.moveTo(-50, -45);
  ctx.lineTo( 50, -45);
  ctx.lineTo( 45, -30);
  ctx.lineTo(-45, -30);
  ctx.closePath();
  ctx.fill();
  // points
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 22 - 8, -45);
    ctx.lineTo(i * 22,     -75);
    ctx.lineTo(i * 22 + 8, -45);
    ctx.closePath();
    ctx.fill();
  }
  // crown gems
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#fde68a";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 22, -38, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Glowing eyes
  ctx.fillStyle = glow;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(-18, 5, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( 18, 5, 4, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

async function generateAlverahCard({ ownerName, ownerHandle, totalBanked, depositors, taxPool, depositTaxOn, depositTaxPct, claimTaxNote, topVault, publicMode = false }) {
  const W = 900, H = 1100;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const accent = "#fbbf24";   // gold
  const glow = "#fde68a";
  const royal = "#7c3aed";

  // Background — deep purple-gold gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#1e0b3a");
  bgGrad.addColorStop(0.5, "#2e0a3e");
  bgGrad.addColorStop(1, "#15051e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Center radial wealth-glow
  const centerGlow = ctx.createRadialGradient(W / 2, 360, 0, W / 2, 360, 420);
  centerGlow.addColorStop(0, "#fde68a55");
  centerGlow.addColorStop(1, "#fde68a00");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  drawSparkles(ctx, W, H, glow, 22);

  // Outer border (gold)
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = royal;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;
  ctx.fillStyle = accent;
  ctx.font = "bold 56px serif";
  ctx.fillText("THE MAIN BANK", W / 2, 80);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 22px serif";
  ctx.fillText(`Stewarded by ${ownerName}`, W / 2, 112);

  // Portrait — prefer the user-supplied image, silhouette fallback
  const portraitCx = W / 2, portraitCy = 320;
  const portraitW = 360, portraitH = 440;
  let imgDrawn = false;
  if (fs.existsSync(ALVERAH_IMG_PATH)) {
    try {
      const img = await loadImage(ALVERAH_IMG_PATH);
      // Frame: rounded-rect mask + gold double-border
      const fx = portraitCx - portraitW / 2;
      const fy = portraitCy - portraitH / 2 + 30; // nudged down so name plate fits
      // Glow behind frame
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 38;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, fx, fy, portraitW, portraitH, 24);
      ctx.fill();
      ctx.restore();
      // Clip + draw image (cover-fit, centred)
      ctx.save();
      roundRect(ctx, fx, fy, portraitW, portraitH, 24);
      ctx.clip();
      const imgRatio = img.width / img.height;
      const frameRatio = portraitW / portraitH;
      let dw, dh, dx, dy;
      if (imgRatio > frameRatio) {
        dh = portraitH; dw = dh * imgRatio;
        dx = fx - (dw - portraitW) / 2; dy = fy;
      } else {
        dw = portraitW; dh = dw / imgRatio;
        dx = fx; dy = fy - (dh - portraitH) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      // Frame border
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 18;
      roundRect(ctx, fx, fy, portraitW, portraitH, 24);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = royal;
      ctx.lineWidth = 1.5;
      roundRect(ctx, fx + 6, fy + 6, portraitW - 12, portraitH - 12, 20);
      ctx.stroke();
      imgDrawn = true;
    } catch (e) {
      // fall through to silhouette
    }
  }
  if (!imgDrawn) {
    drawAlverahPortrait(ctx, W / 2, 320, 1.4, accent, glow);
  }

  // Owner name plate under portrait
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = glow;
  ctx.font = "bold 42px serif";
  ctx.fillText(ownerName.toUpperCase(), W / 2, 560);
  ctx.shadowBlur = 0;

  if (ownerHandle) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "italic 18px sans-serif";
    ctx.fillText(`@${ownerHandle}`, W / 2, 588);
  } else {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "italic 18px sans-serif";
    ctx.fillText(`(Vault Sigil unclaimed — Architect rules direct)`, W / 2, 588);
  }

  // ── Stat tiles ─────────────────────────────────────────────
  const tileY = 640, tileH = 110;
  const tileW = (W - 120) / 2;
  const gap = 20;

  // Public card hides the internal numbers — just show the portrait,
  // owner name, and a welcome flourish. The caption (sent by index.js)
  // handles the registration UI.
  const tiles = publicMode
    ? [
        { label: "OPEN HOURS",    value: "Always",                              icon: "🕯️", x: 60 },
        { label: "VAULT FEE",     value: "Free to open",                        icon: "🔑", x: 60 + tileW + gap },
        { label: "DEPOSIT TAX",   value: depositTaxOn ? `${depositTaxPct}%` : "OFF", icon: "💸", x: 60,                 yOff: tileH + gap },
        { label: "CLAIM TAX",     value: "WEALTH-SCALED",                       icon: "📊", x: 60 + tileW + gap,   yOff: tileH + gap },
      ]
    : [
        { label: "TOTAL BANKED",   value: totalBanked.toLocaleString() + "L",     icon: "📦", x: 60 },
        { label: "TAX POOL",       value: taxPool.toLocaleString() + "L",         icon: "🏛️", x: 60 + tileW + gap },
        { label: "DEPOSITORS",     value: String(depositors),                     icon: "👥", x: 60,                 yOff: tileH + gap },
        { label: "TOP VAULT",      value: topVault.amount.toLocaleString() + "L", icon: "🥇", x: 60 + tileW + gap,   yOff: tileH + gap, sub: topVault.name },
      ];

  tiles.forEach(tl => {
    const y = tileY + (tl.yOff || 0);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, tl.x, y, tileW, tileH, 14);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    roundRect(ctx, tl.x, y, tileW, tileH, 14);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`${tl.icon}  ${tl.label}`, tl.x + 18, y + 32);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.fillText(tl.value, tl.x + 18, y + 76);
    ctx.shadowBlur = 0;

    if (tl.sub) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "italic 14px sans-serif";
      ctx.fillText(tl.sub, tl.x + 18, y + 98);
    }
  });

  // ── Tax policy line ────────────────────────────────────────
  const policyY = tileY + tileH * 2 + gap * 2 + 30;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, 60, policyY, W - 120, 80, 12);
  ctx.fill();
  ctx.strokeStyle = royal;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, policyY, W - 120, 80, 12);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(
    publicMode
      ? `🏦  Welcome to the Vault. Step inside.`
      : `Deposit Tax: ${depositTaxOn ? `ON @ ${depositTaxPct}%` : "OFF"}   •   Claim Tax: AUTOMATIC`,
    W / 2, policyY + 32
  );
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "italic 15px serif";
  ctx.fillText(claimTaxNote, W / 2, policyY + 58);

  // Footer
  ctx.fillStyle = accent + "AA";
  ctx.font = "italic 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("LUMORA · 0.1.3", W - 38, H - 18);

  return canvas.toBuffer("image/png");
}

module.exports = { generateAlverahCard };

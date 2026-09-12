"use strict";
// ═══════════════════════════════════════════════════════════════
// LOGO / TEXT ART GENERATOR — one generator map, one handler.
//
//   .logo <style> [color] [size] <text>   e.g. .logo neon red 80 HELLO
//   .neon <text>  (shortcut for .logo neon <text>, same for others)
//
// Uses @napi-rs/canvas (already a project dependency). Every style is
// a function (ctx, text, opts) => void — adding one is one map entry.
// ═══════════════════════════════════════════════════════════════

const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

// Register project fonts (assets/fonts/*.ttf|otf) if present.
try {
  const dir = path.join(__dirname, "..", "assets", "fonts");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter(f => /\.(ttf|otf)$/i.test(f))) {
      GlobalFonts.registerFromPath(path.join(dir, f), f.replace(/\.(ttf|otf)$/i, ""));
    }
  }
} catch { /* fonts are optional */ }

const W = 800, H = 300; // canvas size for every style

// Shared preamble: background + centered bold font. Returns ctx.
function baseCtx(bg, fontSize) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.font = `bold ${fontSize}px "Impact", "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  return ctx;
}

// Glow-layer helper: draws text N times with a fading shadow.
function glowText(ctx, text, x, y, fill, shadow, layers = 3) {
  for (let i = layers; i >= 1; i--) {
    ctx.save();
    ctx.shadowColor = shadow;
    ctx.shadowBlur = i * 12;
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.35 + (layers - i) * (0.6 / layers);
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

function withGradient(ctx, stops, x0, y0, x1, y1, draw) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  ctx.save();
  ctx.fillStyle = g;
  draw(g);
  ctx.restore();
}

// ── Style functions ──────────────────────────────────────────────
const STYLES = {
  neon: (ctx, text, o) => {
    glowText(ctx, text, W/2, H/2, o.color, o.color);
    ctx.save();
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 5;
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.6;
    ctx.fillText(text, W/2, H/2);
    ctx.restore();
  },

  gradient: (ctx, text) => {
    withGradient(ctx, [[0, "#ff0080"], [0.5, "#ff8c00"], [1, "#40e0d0"]], 0, H/2, W, H/2,
      () => { ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; ctx.fillText(text, W/2, H/2); });
  },

  galaxy: (ctx, text) => {
    // stars
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.8})`;
      ctx.beginPath();
      ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // nebulas
    for (const [fx, fy, r, c] of [[0.3, 0.4, 150, "rgba(100,0,200,.15)"], [0.7, 0.6, 120, "rgba(0,100,200,.12)"], [0.5, 0.3, 100, "rgba(200,0,100,.1)"]]) {
      const g = ctx.createRadialGradient(W*fx, H*fy, 0, W*fx, H*fy, r);
      g.addColorStop(0, c); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    withGradient(ctx, [[0, "#b366ff"], [0.5, "#66b3ff"], [1, "#ff66b3"]], 0, 0, W, H,
      () => { ctx.shadowColor = "#b366ff"; ctx.shadowBlur = 25; ctx.fillText(text, W/2, H/2); });
    ctx.save();
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.5;
    ctx.fillText(text, W/2, H/2);
    ctx.restore();
  },

  glitch: (ctx, text) => {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = "rgba(255,0,0,.8)";  ctx.fillText(text, W/2 - 3, H/2 - 1);
    ctx.fillStyle = "rgba(0,255,255,.8)"; ctx.fillText(text, W/2 + 3, H/2 + 1);
    ctx.restore();
    ctx.fillStyle = "#fff"; ctx.fillText(text, W/2, H/2);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(${Math.random() > .5 ? "255,0,0" : "0,255,255"},.3)`;
      ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 4);
    }
  },

  fire: (ctx, text, o) => {
    const [x, y] = [W/2, H/2];
    const g = ctx.createLinearGradient(x, y + o.fontSize, x, y - o.fontSize / 2);
    g.addColorStop(0, "#ff0000"); g.addColorStop(.3, "#ff6600");
    g.addColorStop(.6, "#ffcc00"); g.addColorStop(1, "#ffff66");
    for (let i = 3; i >= 0; i--) {
      ctx.save();
      ctx.shadowColor = i % 2 ? "#ff0000" : "#ff6600";
      ctx.shadowBlur = 10 + i * 8;
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.4 + (3 - i) * 0.15;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = "#ffff00"; ctx.shadowBlur = 5;
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.6;
    ctx.fillText(text, x, y);
    ctx.restore();
  },

  gold: (ctx, text, o) => {
    const [x, y] = [W/2, H/2];
    const g = ctx.createLinearGradient(x, y - o.fontSize / 2, x, y + o.fontSize / 2);
    g.addColorStop(0, "#d4af37"); g.addColorStop(.3, "#ffd700"); g.addColorStop(.5, "#fff8dc");
    g.addColorStop(.7, "#ffd700"); g.addColorStop(1, "#b8860b");
    ctx.save();
    ctx.shadowColor = "rgba(212,175,55,.5)"; ctx.shadowBlur = 20;
    ctx.fillStyle = g; ctx.fillText(text, x, y);
    ctx.restore();
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#fff";
    ctx.fillRect(x - 150, y - o.fontSize * 0.2, 300, 2);
  },

  ice: (ctx, text, o) => {
    const [x, y] = [W/2, H/2];
    const g = ctx.createLinearGradient(x, y - o.fontSize, x, y + o.fontSize);
    g.addColorStop(0, "#e0f7ff"); g.addColorStop(.5, "#80dfff"); g.addColorStop(1, "#0066cc");
    ctx.save();
    ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 30;
    ctx.fillStyle = g; ctx.fillText(text, x, y);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.4)";
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(x + (Math.random() - .5) * 200, y + (Math.random() - .5) * 100, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

const COLORS = {
  red: "#ff0000", blue: "#0066ff", green: "#00ff00", yellow: "#ffff00",
  purple: "#9900ff", pink: "#ff00ff", cyan: "#00ffff", orange: "#ff8800",
  white: "#ffffff", gold: "#ffd700",
};// Shortcut commands (.neon, .gold, …) — owned here; index.js consumes
// the set in one line.
const SHORTCUTS = new Set(["neon", "gradient", "galaxy", "glitch", "fire", "gold", "ice"]);

// ".logo neon red 80 Hello" → { style, color, fontSize, text, styleUnknown }
function parseArgs(args) {
  const out = { style: "neon", color: null, fontSize: 72, text: "", styleUnknown: false };
  let i = 0;
  if (args[i] && !STYLES[args[i]?.toLowerCase()] && !COLORS[args[i]?.toLowerCase()] && isNaN(parseInt(args[i], 10))) {
    // First token looks like an intended style name but isn't one.
    out.styleUnknown = args[i];
  } else if (STYLES[args[i]?.toLowerCase()]) {
    out.style = args[i++].toLowerCase();
  }
  const a = args[i]?.toLowerCase();
  if (a && (a[0] === "#" || COLORS[a])) { out.color = a[0] === "#" ? args[i] : COLORS[a]; i++; }
  const n = parseInt(args[i], 10);
  if (!isNaN(n)) { out.fontSize = Math.min(160, Math.max(24, n)); i++; }
  out.text = args.slice(i).join("");
  return out;
}

// One handler for every style + shortcut commands.
async function handleLogo(sock, chatId, msg, args, PREFIX, styleOverride = null) {
  const { style, color, fontSize, text, styleUnknown } = parseArgs(styleOverride ? [styleOverride, ...args] : args);
  if (styleUnknown) {
    return sock.sendMessage(chatId, {
      text: `❌ Unknown style "${styleUnknown}".\nValid styles: ${Object.keys(STYLES).join(", ")}`,
    }, { quoted: msg });
  }
  if (!text) {
    return sock.sendMessage(chatId, {
      text:
        `🎨 *Logo Generator*\n\n` +
        `Usage: ${PREFIX}logo <style> [color] [size] <text>\n` +
        `Styles: ${Object.keys(STYLES).join(", ")}\n` +
        `Colors: ${Object.keys(COLORS).join(", ")}\n\n` +
        `Examples:\n${PREFIX}logo neon cyan Lumora\n${PREFIX}logo fire 96 INFERNO\n` +
        `Shortcuts: ${PREFIX}neon Hello, ${PREFIX}gold Rich, …`,
    }, { quoted: msg });
  }
  try {
    const opts = { color: color || "#0ff", fontSize };
    const ctx = baseCtx(style === "gradient" ? "#1a1a2e" : style === "galaxy" ? "#0a0014" : "#0a0a0a", fontSize);
    STYLES[style](ctx, text, opts);
    return sock.sendMessage(chatId, {
      image: ctx.canvas.toBuffer("image/png"),
      caption: `✨ ${style} — "${text}"`,
    }, { quoted: msg });
  } catch (e) {
    return sock.sendMessage(chatId, { text: `❌ Logo render failed: ${e?.message || e}` }, { quoted: msg });
  }
}

module.exports = { handleLogo, SHORTCUTS };

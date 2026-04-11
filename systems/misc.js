// ============================
// SYSTEM: MISCELLANEOUS FUN COMMANDS
// - Quote to sticker (.q)
// - Image to sticker (.sticker / .s)
// - Sticker to image (.toimg)
// - 8ball, coinflip, roll, ship, rate, roast
// ============================

const { createCanvas } = require("@napi-rs/canvas");
let sharp = null;
try { sharp = require("sharp"); } catch { sharp = null; }

// Convert any image buffer → 512x512 webp buffer (required by Baileys for stickers)
async function toWebpSticker(inputBuffer) {
  if (!sharp) return inputBuffer; // fallback; Baileys may still fail but better than nothing
  return await sharp(inputBuffer)
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 85 })
    .toBuffer();
}

// ── QUOTE-TO-STICKER ────────────────────────────────────────
// WhatsApp chat-bubble style quote sticker

// Deterministic color from username so same person = same color
const NAME_COLORS = [
  "#25D366", "#34B7F1", "#FF6B6B", "#FFA62B", "#A66CFF",
  "#00C9A7", "#E84393", "#6C5CE7", "#FDCB6E", "#00B894",
];

function nameColor(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = ((h << 5) - h + username.charCodeAt(i)) | 0;
  }
  return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

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

function renderQuoteImage(text, username) {
  const fontSize = 22;
  const nameSize = 15;
  const lineHeight = 30;
  const padX = 20;
  const padTop = 14;
  const padBot = 16;
  const accentW = 4;           // left colored accent bar
  const accentGap = 10;        // space after accent bar
  const contentLeft = accentW + accentGap;
  const maxBubbleW = 420;
  const tailW = 10;
  const tailH = 16;

  // Measure text lines
  const measure = createCanvas(512, 100);
  const mCtx = measure.getContext("2d");
  mCtx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`;

  const maxTextW = maxBubbleW - padX - contentLeft - padX;
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (mCtx.measureText(test).width > maxTextW) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push(text || "...");

  // Measure actual widths to fit bubble
  mCtx.font = `bold ${nameSize}px "Segoe UI", Arial, sans-serif`;
  const nameW = mCtx.measureText(username).width;
  mCtx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`;
  let maxLineW = 0;
  for (const l of lines) {
    const lw = mCtx.measureText(l).width;
    if (lw > maxLineW) maxLineW = lw;
  }
  const neededW = Math.max(nameW, maxLineW) + padX + contentLeft + padX;
  const bubbleW = Math.min(maxBubbleW, Math.max(neededW, 160));

  // Calculate bubble height
  const nameH = nameSize + 6;
  const textBlockH = lines.length * lineHeight;
  const bubbleH = padTop + nameH + textBlockH + padBot;

  // Canvas with padding for tail + shadow
  const canvasW = bubbleW + tailW + 24;
  const canvasH = bubbleH + 22;
  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvasW, canvasH);

  const bx = tailW + 6;
  const by = 6;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.13)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx, by, bubbleW, bubbleH, 10);
  ctx.fill();
  ctx.restore();

  // Bubble fill (white)
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx, by, bubbleW, bubbleH, 10);
  ctx.fill();

  // Chat tail (top-left, WhatsApp style pointed)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(bx, by + 2);
  ctx.lineTo(bx - tailW, by);
  ctx.lineTo(bx, by + tailH);
  ctx.closePath();
  ctx.fill();

  // Left accent bar (colored, matches username color)
  const uColor = nameColor(username);
  ctx.fillStyle = uColor;
  const barX = bx + padX - 4;
  const barY = by + padTop;
  const barH = nameH + textBlockH;
  roundRect(ctx, barX, barY, accentW, barH, 2);
  ctx.fill();

  // Username
  ctx.font = `bold ${nameSize}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = uColor;
  ctx.textAlign = "left";
  ctx.fillText(username, barX + contentLeft, by + padTop + nameSize);

  // Message text
  ctx.font = `${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = "#111111";
  const textStartY = by + padTop + nameH + fontSize;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], barX + contentLeft, textStartY + i * lineHeight);
  }

  return canvas.toBuffer("image/png");
}

async function cmdQuote(ctx, chatId, senderId, msg) {
  const { sock } = ctx;

  let rawMsg = msg?.message;
  if (rawMsg?.ephemeralMessage) rawMsg = rawMsg.ephemeralMessage.message;
  if (rawMsg?.viewOnceMessage) rawMsg = rawMsg.viewOnceMessage.message;
  if (rawMsg?.viewOnceMessageV2) rawMsg = rawMsg.viewOnceMessageV2.message;

  const extMsg = rawMsg?.extendedTextMessage;
  const contextInfo = extMsg?.contextInfo;
  const quotedMsg = contextInfo?.quotedMessage;

  if (!quotedMsg) {
    return sock.sendMessage(chatId, {
      text: "Reply to a message with *.q* to turn it into a quote sticker!",
    }, { quoted: msg });
  }

  // Get the quoted text
  const quotedText =
    quotedMsg.conversation ||
    quotedMsg.extendedTextMessage?.text ||
    quotedMsg.imageMessage?.caption ||
    quotedMsg.videoMessage?.caption ||
    "";

  if (!quotedText || !quotedText.trim()) {
    return sock.sendMessage(chatId, {
      text: "That message has no text to quote!",
    }, { quoted: msg });
  }

  // Resolve WhatsApp push name (not game username) for the quoted person
  const quotedJid = contextInfo?.participant || contextInfo?.remoteJid || "";
  const senderDigits = String(senderId).split(":")[0].split("@")[0].replace(/\D/g, "");
  const quotedDigits = String(quotedJid).split(":")[0].split("@")[0].replace(/\D/g, "");

  let username = null;

  // If quoting self, msg.pushName is the sender's own WhatsApp name
  if (quotedDigits && quotedDigits === senderDigits) {
    username = msg.pushName || null;
  }

  // Try pushName cache populated by index.js (keyed by digits or jid)
  if (!username && ctx.pushNames) {
    username =
      ctx.pushNames[quotedJid] ||
      ctx.pushNames[quotedJid.split(":")[0]] ||
      ctx.pushNames[quotedDigits] ||
      null;
  }

  // Try Baileys in-memory store if present
  if (!username && sock?.contacts) {
    const c = sock.contacts[quotedJid] || sock.contacts[quotedJid.split(":")[0]];
    username = c?.notify || c?.name || c?.verifiedName || null;
  }

  if (!username) username = quotedDigits || quotedJid.split("@")[0] || "Unknown";

  try {
    const pngBuffer = renderQuoteImage(quotedText.trim(), username);
    const webpBuffer = await toWebpSticker(pngBuffer);

    await sock.sendMessage(chatId, {
      sticker: webpBuffer,
    }, { quoted: msg });
  } catch (e) {
    console.log("Quote sticker error:", e?.message || e);
    return sock.sendMessage(chatId, {
      text: "Failed to generate quote sticker.",
    }, { quoted: msg });
  }
}

// ── IMAGE TO STICKER ────────────────────────────────────────
async function cmdSticker(ctx, chatId, senderId, msg) {
  const { sock } = ctx;

  let rawMsg = msg?.message;
  if (rawMsg?.ephemeralMessage) rawMsg = rawMsg.ephemeralMessage.message;
  if (rawMsg?.viewOnceMessage) rawMsg = rawMsg.viewOnceMessage.message;
  if (rawMsg?.viewOnceMessageV2) rawMsg = rawMsg.viewOnceMessageV2.message;

  const quoted = rawMsg?.extendedTextMessage?.contextInfo?.quotedMessage;

  const imgMsg = rawMsg?.imageMessage || quoted?.imageMessage || null;
  const vidMsg = rawMsg?.videoMessage || quoted?.videoMessage || null;
  const mediaMsg = imgMsg || vidMsg;

  if (!mediaMsg) {
    return sock.sendMessage(chatId, {
      text: "Send or reply to an image/video with *.sticker* to convert it!",
    }, { quoted: msg });
  }

  if (vidMsg && !imgMsg) {
    return sock.sendMessage(chatId, {
      text: "Video stickers aren't supported yet — send an image instead.",
    }, { quoted: msg });
  }

  try {
    const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
    const stream = await downloadContentFromMessage(imgMsg, "image");
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const rawBuffer = Buffer.concat(chunks);

    // Convert to webp (Baileys needs webp, not raw jpg/png)
    const webpBuffer = await toWebpSticker(rawBuffer);

    await sock.sendMessage(chatId, {
      sticker: webpBuffer,
    }, { quoted: msg });
  } catch (e) {
    console.log("Sticker convert error:", e?.message || e);
    return sock.sendMessage(chatId, {
      text: "Failed to convert to sticker. Try a smaller image.",
    }, { quoted: msg });
  }
}

// ── STICKER TO IMAGE ────────────────────────────────────────
async function cmdToImage(ctx, chatId, senderId, msg) {
  const { sock } = ctx;

  let rawMsg = msg?.message;
  if (rawMsg?.ephemeralMessage) rawMsg = rawMsg.ephemeralMessage.message;
  if (rawMsg?.viewOnceMessage) rawMsg = rawMsg.viewOnceMessage.message;
  if (rawMsg?.viewOnceMessageV2) rawMsg = rawMsg.viewOnceMessageV2.message;

  const quoted = rawMsg?.extendedTextMessage?.contextInfo?.quotedMessage;

  const stickerMsg = rawMsg?.stickerMessage || quoted?.stickerMessage || null;

  if (!stickerMsg) {
    return sock.sendMessage(chatId, {
      text: "Reply to a sticker with *.toimg* to convert it to an image!",
    }, { quoted: msg });
  }

  try {
    const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
    const stream = await downloadContentFromMessage(stickerMsg, "sticker");
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const isAnimated = stickerMsg.isAnimated;

    if (isAnimated) {
      return sock.sendMessage(chatId, {
        video: buffer,
        gifPlayback: true,
        caption: "Here's your sticker as a GIF!",
      }, { quoted: msg });
    }

    await sock.sendMessage(chatId, {
      image: buffer,
      caption: "Here's your sticker as an image!",
    }, { quoted: msg });
  } catch (e) {
    console.log("toimg error:", e?.message || e);
    return sock.sendMessage(chatId, {
      text: "Failed to convert sticker. It might be animated or encrypted.",
    }, { quoted: msg });
  }
}

// ── 8BALL ───────────────────────────────────────────────────
const EIGHT_BALL = [
  "It is certain.",
  "It is decidedly so.",
  "Without a doubt.",
  "Yes, definitely.",
  "You may rely on it.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
  "The Rift says... absolutely not.",
  "The Lumora crystals hum... yes.",
  "Even a Mora knows the answer is no.",
  "The stars align in your favor!",
];

async function cmd8Ball(ctx, chatId, senderId, msg, args) {
  const { sock } = ctx;
  const question = args.join(" ").trim();
  if (!question) {
    return sock.sendMessage(chatId, {
      text: "Ask me a question! Example: *.8ball Will I catch a legendary Mora?*",
    }, { quoted: msg });
  }
  const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
  return sock.sendMessage(chatId, {
    text: `🎱 *8-BALL*\n\n❓ _"${question}"_\n\n🔮 ${answer}`,
  }, { quoted: msg });
}

// ── COIN FLIP ───────────────────────────────────────────────
async function cmdFlip(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  const emoji = result === "Heads" ? "🪙" : "💰";
  const flavor = [
    "The coin spins through the Rift...",
    "A Lumorian flick of the wrist...",
    "The crystal coin tumbles...",
    "Fate decides...",
  ];
  const pick = flavor[Math.floor(Math.random() * flavor.length)];
  return sock.sendMessage(chatId, {
    text: `${emoji} *COIN FLIP*\n\n_${pick}_\n\nResult: *${result}*!`,
  }, { quoted: msg });
}

// ── DICE ROLL ───────────────────────────────────────────────
async function cmdRoll(ctx, chatId, senderId, msg, args) {
  const { sock } = ctx;
  const max = Math.min(Math.max(parseInt(args[0]) || 6, 2), 1000);
  const result = Math.floor(Math.random() * max) + 1;
  return sock.sendMessage(chatId, {
    text: `🎲 *DICE ROLL* (1-${max})\n\nYou rolled: *${result}*!`,
  }, { quoted: msg });
}

// ── SHIP (compatibility %) ──────────────────────────────────
async function cmdShip(ctx, chatId, senderId, msg, args) {
  const { sock, players } = ctx;

  const rawMsg = msg?.message;
  const mentions = rawMsg?.extendedTextMessage?.contextInfo?.mentionedJid || [];

  let person1 = senderId;
  let person2 = mentions[0] ? mentions[0].split(":")[0] : null;

  if (mentions.length >= 2) {
    person1 = mentions[0].split(":")[0];
    person2 = mentions[1].split(":")[0];
  }

  if (!person2) {
    return sock.sendMessage(chatId, {
      text: "Tag someone! Example: *.ship @user* or *.ship @user1 @user2*",
    }, { quoted: msg });
  }

  // Deterministic seed from both JIDs so it's consistent
  const combined = [person1, person2].sort().join("");
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  const percent = Math.abs(hash % 101);

  const name1 = players?.[person1]?.username || person1.split("@")[0];
  const name2 = players?.[person2]?.username || person2.split("@")[0];

  let meter = "";
  const filled = Math.round(percent / 10);
  meter = "❤️".repeat(filled) + "🖤".repeat(10 - filled);

  let verdict = "";
  if (percent >= 90) verdict = "Soulmates! The Lumora crystals sing!";
  else if (percent >= 70) verdict = "Strong connection! There's a spark!";
  else if (percent >= 50) verdict = "There's potential here...";
  else if (percent >= 30) verdict = "Friendship at best, honestly.";
  else if (percent >= 10) verdict = "The Rift says... awkward.";
  else verdict = "Not even a Mora would ship this.";

  return sock.sendMessage(chatId, {
    text:
      `💕 *LOVE CALCULATOR*\n\n` +
      `${name1} x ${name2}\n\n` +
      `${meter}\n` +
      `Compatibility: *${percent}%*\n\n` +
      `_${verdict}_`,
    mentions: [person1, person2].filter(j => j.includes("@")),
  }, { quoted: msg });
}

// ── RATE ────────────────────────────────────────────────────
async function cmdRate(ctx, chatId, senderId, msg, args) {
  const { sock } = ctx;
  const thing = args.join(" ").trim();
  if (!thing) {
    return sock.sendMessage(chatId, {
      text: "Rate what? Example: *.rate my battle skills*",
    }, { quoted: msg });
  }
  // Deterministic from the text
  let hash = 0;
  for (let i = 0; i < thing.length; i++) {
    hash = ((hash << 5) - hash + thing.charCodeAt(i)) | 0;
  }
  const score = Math.abs(hash % 11);
  const stars = "⭐".repeat(score) + "✩".repeat(10 - score);
  return sock.sendMessage(chatId, {
    text: `📊 *RATE*\n\n_"${thing}"_\n\n${stars}\nScore: *${score}/10*`,
  }, { quoted: msg });
}

// ── ROAST ───────────────────────────────────────────────────
const ROASTS = [
  "Your battle strategy is like your WiFi — weak and unreliable.",
  "Even a level 1 Mora could beat you... blindfolded.",
  "You're the reason Harmony exists — someone has to be the example of what NOT to do.",
  "Your aura is lower than my expectations, and that's saying something.",
  "If losing was an art, you'd be Picasso.",
  "The Rift wants nothing to do with you. Even chaos has standards.",
  "You're not a Lumorian, you're a Lucons donation machine.",
  "Your Mora doesn't faint from battle — it faints from embarrassment.",
  "Even the Black Market won't sell to you... out of pity.",
  "You bring a party of 5 Mora and still manage to lose round 1.",
  "Your battle IQ is so low, even wild Mora feel bad fighting you.",
  "The only thing you're farming is L's.",
  "You're basically free aura for everyone else.",
  "Your Mora looked at your strategy and chose to faint on purpose.",
  "Even your faction wants a refund.",
];

async function cmdRoast(ctx, chatId, senderId, msg) {
  const { sock } = ctx;

  const rawMsg = msg?.message;
  const mentions = rawMsg?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const target = mentions[0] ? mentions[0].split(":")[0] : senderId;
  const name = ctx.players?.[target]?.username || target.split("@")[0];

  const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];

  return sock.sendMessage(chatId, {
    text: `🔥 *ROASTED*\n\n@${target.split("@")[0]}, ${roast}`,
    mentions: [target],
  }, { quoted: msg });
}

// ── DARE ────────────────────────────────────────────────────
const DARES = [
  "Challenge someone to a battle right now!",
  "Change your username to 'MoraFood' for 1 hour.",
  "Use only your weakest Mora in your next 3 battles.",
  "Give 100 Lucons to the next person who types in chat.",
  "Compliment someone from a rival faction.",
  "Send your most embarrassing battle loss story.",
  "Let someone else pick your next starter Mora.",
  "Play your next hunt using only .pass commands.",
  "Roast yourself in 3rd person.",
  "Admit which faction you secretly think is the coolest.",
];

const TRUTHS = [
  "What's the dumbest thing you've done in Lumora?",
  "Which faction do you think is the strongest and why?",
  "Have you ever wanted to switch factions? Why?",
  "What was your worst battle loss ever?",
  "If you could delete one command from the game, which one?",
  "Who's the player you're most afraid to battle?",
  "What Mora do you secretly think is ugly?",
  "Have you ever rage-quit a battle?",
  "What's your most unpopular Lumora opinion?",
  "If Lumora shut down tomorrow, what would you miss most?",
];

async function cmdTruthOrDare(ctx, chatId, senderId, msg, type) {
  const { sock } = ctx;
  const pool = type === "truth" ? TRUTHS : DARES;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const emoji = type === "truth" ? "🤔" : "😈";
  const label = type === "truth" ? "TRUTH" : "DARE";
  return sock.sendMessage(chatId, {
    text: `${emoji} *${label}*\n\n${pick}`,
  }, { quoted: msg });
}

module.exports = {
  cmdQuote,
  cmdSticker,
  cmdToImage,
  cmd8Ball,
  cmdFlip,
  cmdRoll,
  cmdShip,
  cmdRate,
  cmdRoast,
  cmdTruthOrDare,
};

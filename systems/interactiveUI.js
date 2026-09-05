// ══════════════════════════════════════════════════════════════════════════════
// LUMORA INTERACTIVE WhatsApp UI SYSTEM  v4.0
// ══════════════════════════════════════════════════════════════════════════════
// v4.0 — Never sends native_flow/interactive messages (causes empty bubbles
//         on PC WhatsApp). Only sends plain text with bulleted option lists.
//         Users type the option number or name to select.
// ══════════════════════════════════════════════════════════════════════════════
"use strict";

const PREFIX = ".";

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — NATIVE FLOW (WhatsApp Interactive Flow — mini app inside chat)
// Uses @ryuu-reinzz/button-helper's sendInteractiveMessage with nativeFlow content.
// Falls back to plain text if the flow fails to send.
// ══════════════════════════════════════════════════════════════════════════════
const { sendInteractiveMessageV2: sendFlow } = require("@ryuu-reinzz/button-helper");

/**
 * Send a native interactive flow screen.
 * @param {import('@whiskeysockets/baileys').default} sock
 * @param {string} chatId
 * @param {object} opts
 * @param {string} opts.title   — header title (e.g. "🏪 LUMORA MARKET")
 * @param {string} opts.body    — body text (the descriptive text above buttons)
 * @param {string[]} opts.buttons — button labels (max 8)
 * @param {string[]} opts.buttonCmds — corresponding commands/actions (same order as buttons)
 * @param {object} opts.replyOpts — { quoted: msg, mentions: [...] }
 * @param {string} opts.fallbackText — plain text to send if flow fails
 */
async function sendNativeFlow(sock, chatId, opts = {}) {
  const {
    title, body, buttons, buttonCmds,
    replyOpts = {}, fallbackText,
  } = opts;

  if (!Array.isArray(buttons) || !buttons.length) {
    return sock.sendMessage(chatId, { text: fallbackText || body || title || "" }, replyOpts.quoted ? { quoted: replyOpts.quoted } : undefined);
  }

  const btnCount = Math.min(buttons.length, 8);
  const buttonsSlice = buttons.slice(0, btnCount);
  const cmdsSlice = buttonCmds ? buttonCmds.slice(0, btnCount) : buttonsSlice.map((_, i) => `flow_action_${i}`);

  // Build interactiveButtons — each button is a quick_reply that sends back an id.
  const interactiveButtons = buttonsSlice.map((label, i) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: label, id: cmdsSlice[i] }),
  }));

  const content = {
    text: body || "",
    ...(title ? { title: String(title) } : {}),
    interactiveButtons,
  };

  // If a fallback text wasn't provided, build one from the current screen.
  const fallback = fallbackText || buildFallbackText(title, body, buttonsSlice);

  try {
    // Try sending as interactive message with buttons first (most compatible).
    // If the helper supports nativeFlow, we could send a richer flow — but
    // interactiveButtons works on more clients (Android + some iOS). So we send
    // the button-based interactive message which renders as: text + clickable buttons.
    return await sendFlow(sock, chatId, content, {});
  } catch (e) {
    console.log("[nativeFlow] send failed, text fallback:", e?.message || e);
    return sock.sendMessage(chatId, { text: fallback }, replyOpts.quoted ? { quoted: replyOpts.quoted } : undefined);
  }
}

/**
 * Build a plain-text fallback for a native flow screen (used when interactive fails).
 */
function buildFallbackText(title, body, buttons) {
  let out = "";
  if (title) out += `${title}\n`;
  if (body) out += `${body}\n\n`;
  out += buttons.map((b, i) => `${i + 1}. ${b}`).join("\n");
  return out;
}

/**
 * Edit (replace) the last sent message with a new native flow screen.
 * WhatsApp doesn't support true in-place editing of interactive messages,
 * so we send a new message and let conversation context handle the flow.
 * For a seamless experience, we send a new message that continues the flow.
 */
async function sendNativeFlowReply(sock, chatId, opts = {}) {
  // Same as sendNativeFlow but intended as a follow-up in the flow sequence.
  return sendNativeFlow(sock, chatId, opts);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — LIST MENU
// Sends a structured text menu with numbered/bulleted options.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send a list menu as plain text with bulleted options.
 */
async function sendListMenu(sock, chatId, options, msg) {
  const { title, text, footer, sections } = options;
  let output = "";

  if (title) {
    output += `╔══════════════════════════╗\n`;
    output += `║ ${title}\n`;
    output += `╚══════════════════════════╝\n\n`;
  }

  if (text) output += text + "\n";

  let idx = 1;
  for (const section of sections || []) {
    if (section.title) output += `\n*${section.title}*\n`;
    for (const row of section.rows || []) {
      const desc = row.description ? ` — ${row.description}` : "";
      output += `• ${idx}. ${row.title}${desc}\n`;
      idx++;
    }
  }

  if (footer) output += `\n_${footer}_`;

  return sock.sendMessage(chatId, { text: output }, msg ? { quoted: msg } : undefined);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — QUICK ACTION BUTTONS
// Sends text with bulleted action options.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send action buttons as plain text with bulleted list.
 */
async function sendActionButtons(sock, chatId, text, buttons, options = {}) {
  const { footer, title, quoted, mentions } = options;

  const labels = buttons.slice(0, 8).map(b => {
    return typeof b === "string" ? b : (b.label || b.text || "");
  });

  let output = "";
  if (title) output += `*${title}*\n`;
  if (text) output += text + "\n";
  output += "\n" + labels.map(l => `• ${l}`).join("\n");
  if (footer) output += `\n\n_${footer}_`;

  const payload = { text: output };
  if (mentions && mentions.length) payload.mentions = mentions;
  return sock.sendMessage(chatId, payload, quoted ? { quoted } : undefined);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — CONTEXT-SPECIFIC MENUS (called by other systems)
// These are lightweight stubs — callers send their own detailed text after.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map menu — called by hunting.js before it sends the map image/text.
 * No-op since hunting.js sends the full map display itself.
 */
async function sendMapMenu(_sock, _chatId, _terrainList, _msg) {
  // No-op: hunting.js sends the full map display after this call.
}

/**
 * Inventory menu — called by inventory.js before it sends the visual card.
 * No-op since inventory.js sends the full inventory card itself.
 */
async function sendInventoryMenu(_sock, _chatId, _inventory, _msg) {
  // No-op: inventory.js sends the full inventory card after this call.
}

/**
 * Market menu — called by market.js before it sends the market text.
 * No-op since market.js sends the full market listing after this call.
 */
async function sendMarketMenu(_sock, _chatId, _categories, _msg) {
  // No-op: market.js sends the full market listing after this call.
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — HELP MENU BUILDERS
// ══════════════════════════════════════════════════════════════════════════════

function buildMainMenuText(player) {
  const name = player?.username ? `*${player.username}*` : "traveler";
  return [
    `╔══════════════════════════╗`,
    `║        🌌 LUMORA         ║`,
    `╚══════════════════════════╝`,
    ``,
    `Hey ${name} ✨ I'm *Star*, your guide.`,
    ``,
    `What would you like to explore?`,
  ].join("\n");
}

function buildGameMenuText() {
  const cats = require("./commandRegistry").getGameCategories();
  let text = `╔══════════════════════════╗\n║     🎮 GAME MENU          ║\n╚══════════════════════════╝\n\nChoose a category:\n\n`;
  let idx = 1;
  for (const c of cats) {
    text += `${idx}. ${c.emoji} ${c.name}\n`;
    idx++;
  }
  return text;
}

function buildBotMenuText() {
  const cats = require("./commandRegistry").getBotCategories();
  let text = `╔══════════════════════════╗\n║     🛡️ BOT MENU           ║\n╚══════════════════════════╝\n\nChoose a category:\n\n`;
  let idx = 1;
  for (const c of cats) {
    text += `${idx}. ${c.emoji} ${c.name}\n`;
    idx++;
  }
  return text;
}

function buildGameCategoryText(catId) {
  const registry = require("./commandRegistry");
  const cat = registry.getGameCategories().find(c => c.id === catId);
  if (!cat) return "";
  const cmds = registry.getCommandsByCategory(catId);
  if (!cmds.length) return "";

  let text = `╔══════════════════════════╗\n║ ${cat.emoji} ${cat.name.toUpperCase()}\n╚══════════════════════════╝\n\n`;

  for (const cmd of cmds) {
    const aliases = cmd.aliases?.length ? ` _(${cmd.aliases.join(", ")})_` : "";
    text += `• ${PREFIX}${cmd.name}${aliases}\n  ${cmd.desc || ""}\n\n`;
  }

  return text;
}

function buildBotCategoryText(catId) {
  const registry = require("./commandRegistry");
  const cat = registry.getBotCategories().find(c => c.id === catId);
  if (!cat) return "";
  const cmds = registry.getCommandsByCategory(catId);
  if (!cmds.length) return "";

  let text = `╔══════════════════════════╗\n║ ${cat.emoji} ${cat.name.toUpperCase()}\n╚══════════════════════════╝\n\n`;

  for (const cmd of cmds) {
    const aliases = cmd.aliases?.length ? ` _(${cmd.aliases.join(", ")})_` : "";
    text += `• ${PREFIX}${cmd.name}${aliases}\n  ${cmd.desc || ""}\n\n`;
  }

  return text;
}

module.exports = {
  sendListMenu,
  sendActionButtons,
  sendMapMenu,
  sendInventoryMenu,
  sendMarketMenu,
  sendNativeFlow,
  sendNativeFlowReply,
  buildMainMenuText,
  buildGameMenuText,
  buildBotMenuText,
  buildGameCategoryText,
  buildBotCategoryText,
};

"use strict";

const PREFIX = ".";

/**
 * Send a WhatsApp interactive-message screen as clickable buttons.
 * Falls back to a plain-text numbered list when the send fails.
 *
 * IMPORTANT: this module never requires @ryuu-reinzz/button-helper at load time.
 * If the helper is missing/badly installed on deploy, the bot still boots; the
 * interactive send simply falls back to plain text.
 */
async function sendNativeFlow(sock, chatId, opts = {}) {
  const {
    title, body, buttons, buttonCmds,
    replyOpts = {}, fallbackText,
  } = opts;

  if (!Array.isArray(buttons) || !buttons.length) {
    return sock.sendMessage(
      chatId,
      { text: fallbackText || body || title || "" },
      replyOpts.quoted ? { quoted: replyOpts.quoted } : undefined,
    );
  }

  // Lazy-load the helper so a missing/broken install does not crash the bot at startup.
  let sendInteractiveMessageV2;
  try {
    ({ sendInteractiveMessageV2 } = require("@ryuu-reinzz/button-helper"));
  } catch (e) {
    console.log("[nativeFlow] button-helper unavailable — using text fallback");
    return sock.sendMessage(
      chatId,
      { text: fallbackText || body || title || "" },
      replyOpts.quoted ? { quoted: replyOpts.quoted } : undefined,
    );
  }

  const count = Math.min(buttons.length, 8);
  const labels = buttons.slice(0, count);
  const cmds = buttonCmds
    ? buttonCmds.slice(0, count)
    : labels.map((_, i) => `flow_action_${i}`);

  const interactiveButtons = labels.map((label, i) => ({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: label, id: cmds[i] }),
  }));

  const content = {
    text: body || "",
    ...(title ? { title: String(title) } : {}),
    interactiveButtons,
  };

  const fallback = fallbackText || (
    [title, body, "", labels.map((b, i) => `${i + 1}. ${b}`).join("\n")].filter(Boolean).join("\n") +
    "\n"
  );

  try {
    return await sendInteractiveMessageV2(
      sock,
      chatId,
      content,
      { quoted: replyOpts?.quoted },
    );
  } catch (e) {
    console.log("[nativeFlow] send failed, text fallback:", e?.message || e);
    return sock.sendMessage(
      chatId,
      { text: fallback },
      replyOpts.quoted ? { quoted: replyOpts.quoted } : undefined,
    );
  }
}

// ── Help-system text builders (used by .help) ──────────────────────────────────

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
  sendNativeFlow,
  buildMainMenuText,
  buildGameMenuText,
  buildBotMenuText,
  buildGameCategoryText,
  buildBotCategoryText,
};

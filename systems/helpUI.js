// ══════════════════════════════════════════════════════════════
// LUMORA HELP SYSTEM — Game-themed UI
// Uses buttonsSystem.sendButtons + mapButtons for reliable WhatsApp buttons
// ══════════════════════════════════════════════════════════════
"use strict";

const ui = require("./ui");
const registry = require("./commandRegistry");
const DIV = ui.DIV;

// ── Box art helpers ──────────────────────────────────────────
function boxTop(w)  { return "\u2554" + "\u2550".repeat(w) + "\u2557"; }
function boxMid(w)  { return "\u2560" + "\u2550".repeat(w) + "\u2563"; }
function boxBot(w)  { return "\u255a" + "\u2550".repeat(w) + "\u255d"; }
function padR(s, w) {
  const stripped = s.replace(/\*/g, "").replace(/_/g, "");
  const diff = Math.max(0, w - stripped.length);
  return s + " ".repeat(diff);
}
const W = 24;

// ── Stat bar helper ──────────────────────────────────────────
function statBar(pct, len = 8) {
  const filled = Math.round((pct / 100) * len);
  return "\u2588".repeat(filled) + "\u2591".repeat(len - filled);
}

/**
 * Build the main help menu text (Game Menu + Bot Menu).
 */
function buildMainMenuText(player) {
  const hasPro = player && player.pro && player.pro.tier;
  const faction = player?.faction || "none";
  const factionEmoji = { harmony: "\ud83c\udf3f", purity: "\u2694\ufe0f", rift: "\ud83d\udd76\ufe0f" }[faction] || "\u26a1";
  const factionName = faction.charAt(0).toUpperCase() + faction.slice(1);
  const level = player?.level || 1;
  const xp = player?.xp || 0;
  const xpNext = Math.floor(100 + level * 20);
  const xpPct = Math.min(100, Math.round((xp / xpNext) * 100));

  const greeting = hasPro
    ? "\ud83d\udc51 *Welcome back, Bearer of the Mark.* The Rifts recognize your rank."
    : "\ud83c\udf0c *Greetings, traveler.* The Lumorian crystals hum at your presence.";

  return (
    `${boxTop(W)}\n` +
    `\u2551  \ud83c\udf0c *L U M O R A*          \u2551\n` +
    `\u2551     \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550           \u2551\n` +
    `\u2551  \u2694\ufe0f COMBAT  \u00b7  \ud83c\udf0d WORLD   \u2551\n` +
    `\u2551  \ud83d\udee1\ufe0f BOT     \u00b7  \ud83d\udcd6 WIKI    \u2551\n` +
    boxMid(W) + `\n` +
    `\u2551                          \u2551\n` +
    `\u2551  ${factionEmoji} *${factionName}*  \u00b7  Lv.${level}          \u2551\n` +
    `\u2551  XP ${statBar(xpPct)} ${xpPct}%    \u2551\n` +
    `\u2551                          \u2551\n` +
    boxBot(W) + `\n\n` +
    greeting + `\n\n` +
    `What would you like to explore?`
  );
}

/**
 * Build Game Menu category list text.
 */
function buildGameMenuText() {
  const cats = registry.getGameCategories();
  let text =
    `${boxTop(W)}\n` +
    `\u2551    \ud83c\udfae *G A M E   M E N U*  \u2551\n` +
    boxMid(W) + `\n`;

  for (const c of cats) {
    const count = registry.getCommandsByCategory("game", c.id).length;
    text += `\u2551  ${c.emoji} *${c.name}*          \u2551\n`;
    text += `\u2551    _${c.desc}_      \u2551\n`;
    text += `\u2551    _(${count} commands)_            \u2551\n`;
  }

  text += boxBot(W) + `\n`;
  text += `\n_Tap a category or type *.help-game <name>_`;
  return text;
}

/**
 * Build Bot Menu category list text.
 */
function buildBotMenuText() {
  const cats = registry.getBotCategories();
  let text =
    `${boxTop(W)}\n` +
    `\u2551    \ud83d\udee1\ufe0f *B O T   M E N U*    \u2551\n` +
    boxMid(W) + `\n`;

  for (const c of cats) {
    const count = registry.getCommandsByCategory("bot", c.id).length;
    text += `\u2551  ${c.emoji} *${c.name}*          \u2551\n`;
    text += `\u2551    _${c.desc}_      \u2551\n`;
    text += `\u2551    _(${count} commands)_            \u2551\n`;
  }

  text += boxBot(W) + `\n`;
  text += `\n_Tap a category or type *.help-bot <name>_`;
  return text;
}

/**
 * Build commands for a specific game category.
 */
function buildGameCategoryText(catId) {
  const cats = registry.getGameCategories();
  const cat = cats.find(c => c.id === catId);
  if (!cat) return null;

  const commands = registry.getCommandsByCategory("game", catId);
  let text =
    `${boxTop(W)}\n` +
    `\u2551  ${cat.emoji} *${cat.name.toUpperCase()}*            \u2551\n` +
    boxMid(W) + `\n`;

  for (const c of commands) {
    const alias = c.aliases.length ? ` _(${c.aliases[0]})_` : "";
    text += `\u2551  .${c.name}${alias}\n`;
    text += `\u2551    ${c.desc}\n`;
  }

  text += boxBot(W) + `\n`;
  text += `\n\ud83d\udd19 _Back to Game Menu: *.help-game*_`;
  return text;
}

/**
 * Build commands for a specific bot category.
 */
function buildBotCategoryText(catId) {
  const cats = registry.getBotCategories();
  const cat = cats.find(c => c.id === catId);
  if (!cat) return null;

  const commands = registry.getCommandsByCategory("bot", catId);
  let text =
    `${boxTop(W)}\n` +
    `\u2551  ${cat.emoji} *${cat.name.toUpperCase()}*            \u2551\n` +
    boxMid(W) + `\n`;

  for (const c of commands) {
    const alias = c.aliases.length ? ` _(${c.aliases[0]})_` : "";
    text += `\u2551  .${c.name}${alias}\n`;
    text += `\u2551    ${c.desc}\n`;
  }

  text += boxBot(W) + `\n`;
  text += `\n\ud83d\udd19 _Back to Bot Menu: *.help-bot*_`;
  return text;
}

module.exports = {
  buildMainMenuText,
  buildGameMenuText,
  buildBotMenuText,
  buildGameCategoryText,
  buildBotCategoryText,
};

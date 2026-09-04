// ══════════════════════════════════════════════════════════════
// LUMORA HELP SYSTEM — Rewrite using buttonsSystem (working pattern)
// Uses buttonsSystem.sendButtons + mapButtons for reliable WhatsApp buttons
// ══════════════════════════════════════════════════════════════
"use strict";

const ui = require("./ui");
const registry = require("./commandRegistry");
const DIV = ui.DIV;

/**
 * Build the main help menu text (Game Menu + Bot Menu).
 */
function buildMainMenuText(player) {
  const hasPro = player && player.pro && player.pro.tier;
  const factionEmoji = { harmony: "\ud83c\udf3f", purity: "\u2694\ufe0f", rift: "\ud83d\udd76\ufe0f" }[player?.faction] || "\u26a1";
  const greeting = hasPro
    ? `\ud83d\udc51 *Welcome back, Bearer of the Mark.* The Rifts recognize your rank.`
    : `\ud83c\udf0c *Greetings, traveler.* The Lumorian crystals hum at your presence.`;

  return (
    ui.header("LUMORA", "\ud83c\udf0c") + `\n\n` +
    greeting + `\n\n` +
    `${factionEmoji} Faction: *${player?.faction ? player.faction.charAt(0).toUpperCase() + player.faction.slice(1) : "None"}*` +
    `\n\n` +
    `What would you like to explore?`
  );
}

/**
 * Build Game Menu category list text.
 */
function buildGameMenuText() {
  const cats = registry.getGameCategories();
  let text = ui.header("GAME MENU", "\ud83c\udfae") + `\n\n`;
  for (const c of cats) {
    const count = registry.getCommandsByCategory("game", c.id).length;
    text += `${c.emoji} *${c.name}* — ${c.desc} _(${count} commands)_\n`;
  }
  text += `\n${DIV}\n`;
  text += `_Tap a category or type *${"."}help-game <name>*_`;
  return text;
}

/**
 * Build Bot Menu category list text.
 */
function buildBotMenuText() {
  const cats = registry.getBotCategories();
  let text = ui.header("BOT MENU", "\ud83d\udde1\ufe0f") + `\n\n`;
  for (const c of cats) {
    const count = registry.getCommandsByCategory("bot", c.id).length;
    text += `${c.emoji} *${c.name}* — ${c.desc} _(${count} commands)_\n`;
  }
  text += `\n${DIV}\n`;
  text += `_Tap a category or type *${"."}help-bot <name>*_`;
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
  let text = ui.header(cat.name, cat.emoji) + `\n\n`;
  for (const c of commands) {
    const alias = c.aliases.length ? ` _(${c.aliases[0]})_` : "";
    text += `\u2503 ${"."}${c.name}${alias} \u2014 ${c.desc}\n`;
  }
  text += `\n${DIV}\n`;
  text += `\ud83d\udd19 _Back to Game Menu: *${"."}help-game*_`;
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
  let text = ui.header(cat.name, cat.emoji) + `\n\n`;
  for (const c of commands) {
    const alias = c.aliases.length ? ` _(${c.aliases[0]})_` : "";
    text += `\u2503 ${"."}${c.name}${alias} \u2014 ${c.desc}\n`;
  }
  text += `\n${DIV}\n`;
  text += `\ud83d\udd19 _Back to Bot Menu: *${"."}help-bot*_`;
  return text;
}

module.exports = {
  buildMainMenuText,
  buildGameMenuText,
  buildBotMenuText,
  buildGameCategoryText,
  buildBotCategoryText,
};

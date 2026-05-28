// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA SCROLLS  v0.6.0                                       ║
// ║  Scrolls drop during hunts. Each scroll, when opened, grants  ║
// ║  a specific quest (the discovery mechanism for fighting       ║
// ║  styles + special skills).                                    ║
// ║                                                                ║
// ║  Opening a scroll:                                            ║
// ║    • consumes the scroll                                      ║
// ║    • auto-accepts the linked quest (if not already accepted)  ║
// ║    • reveals the quest text + requirements                    ║
// ║    • +1 Intelligence to the player                            ║
// ║    • DMs any hidden commands tied to active quest steps       ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

let _catalog = null;
function loadScrolls() {
  if (_catalog) return _catalog;
  const f = path.join(__dirname, "..", "data", "scrolls.json");
  try { _catalog = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _catalog = {}; }
  return _catalog;
}

// Drop chance per hunt by scroll rarity. Tuned for ~5% total drop rate
// across all scrolls (sum of: 0.025 + 0.020 + 0.005 + 0.003 + 0.001 = ~5.4%).
const RARITY_DROP_RATE = {
  common:    0.025,
  rare:      0.010,
  epic:      0.003,
  legendary: 0.001,
};

function ensureScrollFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.scrolls || typeof player.scrolls !== "object") player.scrolls = {};
}

// Called from the hunt/wildbattle path. May return a scroll id if one
// dropped, else null. Mutates the player inventory.
function maybeDropScroll(player) {
  ensureScrollFields(player);
  const catalog = loadScrolls();
  for (const sc of Object.values(catalog)) {
    const rate = RARITY_DROP_RATE[String(sc.rarity || "common").toLowerCase()] || 0;
    if (Math.random() < rate) {
      player.scrolls[sc.id] = Number(player.scrolls[sc.id] || 0) + 1;
      return sc;
    }
  }
  return null;
}

function findScrollByQuery(query) {
  const catalog = loadScrolls();
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;
  return (
    Object.values(catalog).find((s) => s.id.toLowerCase() === q) ||
    Object.values(catalog).find((s) => s.name.toLowerCase() === q) ||
    Object.values(catalog).find((s) => s.name.toLowerCase().includes(q)) ||
    null
  );
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

// .scrolls — list what's in your scroll inventory
async function cmdScrolls(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureScrollFields(player);

  const catalog = loadScrolls();
  const entries = Object.entries(player.scrolls).filter(([, n]) => Number(n) > 0);

  if (!entries.length) {
    return sock.sendMessage(chatId, {
      text:
        `📜 *YOUR SCROLLS*\n${DIVIDER}\n` +
        `_Empty. Scrolls drop randomly while you hunt._\n${DIVIDER}\n` +
        `When you find one, open it with *.open <name>*.`,
    }, { quoted: msg });
  }

  const lines = entries.map(([id, count], i) => {
    const sc = catalog[id];
    if (!sc) return `${i + 1}. ${id} ×${count}  _(unknown)_`;
    const rarityIcon =
      sc.rarity === "legendary" ? "🌟"
      : sc.rarity === "epic"    ? "💎"
      : sc.rarity === "rare"    ? "✨"
      : "📜";
    return `${i + 1}. ${rarityIcon} *${sc.name}*  ×${count}  _(${sc.rarity})_`;
  });
  return sock.sendMessage(chatId, {
    text:
      `📜 *YOUR SCROLLS*\n${DIVIDER}\n` +
      lines.join("\n") +
      `\n${DIVIDER}\n` +
      `Open one with *.open <name>*  —  e.g. *.open Windworn*`,
  }, { quoted: msg });
}

// .open <scroll-name> — consume + auto-accept the linked quest
async function cmdOpen(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureScrollFields(player);

  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.open <scroll name>*\nSee what you have with *.scrolls*.`,
    }, { quoted: msg });
  }

  // Strip a leading "scroll" if the user typed `.open scroll Windworn`
  const cleaned = queryRaw.replace(/^scroll\s+/i, "").trim();
  const scroll = findScrollByQuery(cleaned) || findScrollByQuery(queryRaw);
  if (!scroll) {
    return sock.sendMessage(chatId, { text: `❌ No scroll named *${queryRaw}*.` }, { quoted: msg });
  }
  if (!Number(player.scrolls[scroll.id])) {
    return sock.sendMessage(chatId, { text: `❌ You don't have a *${scroll.name}*.` }, { quoted: msg });
  }

  // Consume
  player.scrolls[scroll.id] -= 1;
  if (player.scrolls[scroll.id] <= 0) delete player.scrolls[scroll.id];

  // +1 Intelligence for the act of reading
  player.intelligence = Number(player.intelligence || 0) + 1;

  // Accept the linked quest (if not already accepted/completed)
  const questSystem = require("./quests");
  questSystem.ensureQuestFields(player);
  const questId = scroll.grantsQuest;
  const questDef = questSystem.loadQuests()[questId];

  let questBlock = "";
  let dmBlock = "";
  let hiddenDmLines = [];

  if (!questDef) {
    questBlock = `_(scroll's linked quest "${questId}" is missing from data/quests.json)_`;
  } else if (player.quests.completed.includes(questId)) {
    questBlock = `✓ You've already completed *${questDef.name}*. The scroll burns itself out.`;
  } else if (player.quests.active[questId]) {
    questBlock = `📜 *${questDef.name}* is already in your quest log. Progress unchanged.`;
  } else {
    player.quests.active[questId] = { progress: 0, startedAt: Date.now() };
    questBlock = questSystem.renderQuestDetail(questDef);

    // Hidden commands hint — DM them so they don't leak in the group
    if (questDef.hiddenCommands && typeof questDef.hiddenCommands === "object") {
      hiddenDmLines.push(`🔮 *Hidden commands unlocked for "${questDef.name}":*`);
      for (const [npc, info] of Object.entries(questDef.hiddenCommands)) {
        hiddenDmLines.push(`  • When you reach *${npc}*, run: *.${info.cmd}*`);
      }
      hiddenDmLines.push(`_Don't share these. They only work while the quest is active._`);
    }
  }

  savePlayers(players);

  // Try to DM hidden commands (best-effort — silent on failure)
  if (hiddenDmLines.length) {
    try {
      await sock.sendMessage(senderId, { text: hiddenDmLines.join("\n") });
      dmBlock = `\n📩 _Hidden commands DM'd to you — check your private chat._`;
    } catch {
      // If DM fails (privacy settings etc.), inline them as a fallback
      dmBlock = `\n${hiddenDmLines.join("\n")}`;
    }
  }

  return sock.sendMessage(chatId, {
    text:
      `📜 *SCROLL OPENED — ${scroll.name}*\n${DIVIDER}\n` +
      `_${scroll.lore}_\n` +
      `🧠 *+1 Intelligence*  _(now ${player.intelligence})_\n${DIVIDER}\n` +
      questBlock +
      dmBlock,
  }, { quoted: msg });
}

module.exports = {
  cmdScrolls,
  cmdOpen,
  loadScrolls,
  ensureScrollFields,
  maybeDropScroll,
  findScrollByQuery,
  RARITY_DROP_RATE,
};

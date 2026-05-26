// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA QUEST + FIGHTING-STYLE SYSTEM  v0.5.0                 ║
// ║  Minimal quest engine: accept → progress (battle wins) →      ║
// ║  complete → unlock fighting style + Lucons.                   ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

let _quests = null;
let _styles = null;

function loadQuests() {
  if (_quests) return _quests;
  const f = path.join(__dirname, "..", "data", "quests.json");
  try { _quests = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _quests = {}; }
  return _quests;
}
function loadStyles() {
  if (_styles) return _styles;
  const f = path.join(__dirname, "..", "data", "styles.json");
  try { _styles = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _styles = {}; }
  return _styles;
}
function reloadCatalog() { _quests = null; _styles = null; }

// ── Per-player schema ──
// p.quests = {
//   active:    { questId: { progress: N, startedAt: ts } },
//   completed: [ questId, ... ]
// }
// p.styles = [ styleId, ... ]
function ensureQuestFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.quests || typeof player.quests !== "object") player.quests = {};
  if (!player.quests.active || typeof player.quests.active !== "object") player.quests.active = {};
  if (!Array.isArray(player.quests.completed)) player.quests.completed = [];
  if (!Array.isArray(player.styles)) player.styles = [];
}

// Returns the player's unlocked fighting-style move list, flattened.
// Used by the combat system to extend the player's moveset.
function getUnlockedStyleMoves(player) {
  ensureQuestFields(player);
  const styles = loadStyles();
  const out = [];
  for (const id of player.styles) {
    const st = styles[id];
    if (!st) continue;
    for (const mv of (st.moves || [])) {
      // Spread mv first so opt-in effect fields (selfHeal/brace/counter/
      // energyRestore) pass through to the combat handler.
      out.push({
        ...mv,
        name: mv.name,
        power: Number(mv.power || 0),
        accuracy: Number(mv.accuracy || 100),
        energyCost: Number(mv.energyCost || Math.max(3, Math.floor(Number(mv.power || 0) / 8) + 3)),
        desc: mv.desc || "",
        source: "style",
        styleId: id,
        styleName: st.name,
        styleType: st.type,
      });
    }
  }
  return out;
}

// ── Mission hook called from win-battle paths ──
function onBattleWon(player) {
  ensureQuestFields(player);
  const quests = loadQuests();
  const completed = [];

  for (const [qId, active] of Object.entries(player.quests.active)) {
    const def = quests[qId];
    if (!def || def.requirement?.kind !== "winBattles") continue;
    active.progress = Number(active.progress || 0) + 1;
    if (active.progress >= Number(def.requirement.count || 1)) {
      completed.push(qId);
    }
  }
  return completed; // caller is responsible for rewarding + messaging
}

// Internal: apply rewards for a finished quest.
function applyCompletion(player, questId) {
  ensureQuestFields(player);
  const quests = loadQuests();
  const def = quests[questId];
  if (!def) return null;

  // Remove from active, push to completed
  delete player.quests.active[questId];
  if (!player.quests.completed.includes(questId)) player.quests.completed.push(questId);

  const rewards = def.reward || {};
  if (rewards.style && !player.styles.includes(rewards.style)) {
    player.styles.push(rewards.style);
  }
  if (rewards.lucons) {
    player.lucons = Number(player.lucons || 0) + Number(rewards.lucons);
  }
  if (rewards.riftPE) {
    player.riftPE = Math.min(100, Number(player.riftPE || 0) + Number(rewards.riftPE));
  }
  if (rewards.intelligence) {
    player.intelligence = Number(player.intelligence || 0) + Number(rewards.intelligence);
  }
  return def;
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

async function cmdQuests(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureQuestFields(player);

  const quests = loadQuests();
  const styles = loadStyles();
  const all = Object.values(quests);

  const sections = [];
  // Active
  const active = Object.entries(player.quests.active);
  if (active.length) {
    sections.push(`📜 *ACTIVE QUESTS*\n${DIVIDER}`);
    for (const [qId, a] of active) {
      const def = quests[qId];
      if (!def) continue;
      const need = Number(def.requirement?.count || 1);
      const have = Number(a.progress || 0);
      sections.push(
        `• *${def.name}* — ${def.giver}\n  Progress: *${have}/${need}* battle wins\n  Reward: *${def.reward?.style ? `Unlock ${styles[def.reward.style]?.name || def.reward.style}` : "—"}*${def.reward?.lucons ? ` + ${def.reward.lucons} Lucons` : ""}`
      );
    }
  }
  // Available
  const available = all.filter((d) => !player.quests.active[d.id] && !player.quests.completed.includes(d.id));
  if (available.length) {
    sections.push(`\n📋 *AVAILABLE QUESTS*\n${DIVIDER}`);
    for (const d of available) {
      const styleName = styles[d.reward?.style]?.name || d.reward?.style;
      sections.push(
        `• *${d.name}* — ${d.giver}\n  _${d.lore}_\n  Reward: unlock *${styleName}*${d.reward?.lucons ? ` + ${d.reward.lucons} Lucons` : ""}\n  Accept: *.quest accept ${d.id}*`
      );
    }
  }
  // Completed
  if (player.quests.completed.length) {
    sections.push(`\n🏆 *COMPLETED*\n${DIVIDER}`);
    for (const qId of player.quests.completed) {
      const def = quests[qId];
      sections.push(`✓ ${def?.name || qId}`);
    }
  }
  if (!sections.length) sections.push("_No quests defined yet._");

  return sock.sendMessage(chatId, { text: sections.join("\n") }, { quoted: msg });
}

async function cmdQuest(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const sub = String(args[0] || "").toLowerCase();
  if (!sub || sub === "list") return cmdQuests(ctx, chatId, senderId, msg);

  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureQuestFields(player);

  if (sub === "accept") {
    const qId = String(args[1] || "").toLowerCase();
    const quests = loadQuests();
    const def = quests[qId];
    if (!def) {
      return sock.sendMessage(chatId, { text: `❌ No quest named *${qId}*.\nList with *.quests*.` }, { quoted: msg });
    }
    if (player.quests.completed.includes(qId)) {
      return sock.sendMessage(chatId, { text: `❌ You've already completed *${def.name}*.` }, { quoted: msg });
    }
    if (player.quests.active[qId]) {
      return sock.sendMessage(chatId, { text: `❌ *${def.name}* is already active.` }, { quoted: msg });
    }
    player.quests.active[qId] = { progress: 0, startedAt: Date.now() };
    savePlayers(players);
    return sock.sendMessage(chatId, {
      text:
        `📜 *QUEST ACCEPTED*\n${DIVIDER}\n` +
        `*${def.name}*  —  ${def.giver}\n${DIVIDER}\n` +
        `_${def.lore}_\n\n` +
        `🎯 Requirement: win *${def.requirement.count}* battles\n` +
        `🎁 Reward: unlock *${loadStyles()[def.reward?.style]?.name || def.reward?.style || "—"}*` +
        (def.reward?.lucons ? ` + ${def.reward.lucons} Lucons` : ""),
    }, { quoted: msg });
  }

  if (sub === "abandon" || sub === "drop") {
    const qId = String(args[1] || "").toLowerCase();
    if (!player.quests.active[qId]) {
      return sock.sendMessage(chatId, { text: `❌ *${qId}* isn't active.` }, { quoted: msg });
    }
    delete player.quests.active[qId];
    savePlayers(players);
    return sock.sendMessage(chatId, { text: `🚪 Abandoned quest: *${qId}*.` }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text:
      `📜 *.quest* — quest log\n${DIVIDER}\n` +
      `• *.quest list* — same as *.quests*\n` +
      `• *.quest accept <id>* — accept a quest\n` +
      `• *.quest abandon <id>* — drop an active quest`,
  }, { quoted: msg });
}

async function cmdStyles(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureQuestFields(player);

  const styles = loadStyles();
  const ownedIds = player.styles || [];

  const lines = Object.values(styles).map((s) => {
    const owned = ownedIds.includes(s.id);
    const status = owned ? "✅ unlocked" : `🔒 quest: *.quest accept ${s.unlockQuest}*`;
    return (
      `• *${s.name}*  _(${s.type})_  — ${status}\n` +
      `  _${s.lore}_\n` +
      `  Moves: ${s.moves.map((m) => `*${m.name}*`).join(", ")}`
    );
  });

  return sock.sendMessage(chatId, {
    text:
      `🥋 *FIGHTING STYLES*\n${DIVIDER}\n` +
      lines.join(`\n\n`) +
      `\n${DIVIDER}\n` +
      `_Unlocked styles appear in your *.attack* moveset automatically._`,
  }, { quoted: msg });
}

module.exports = {
  // commands
  cmdQuests,
  cmdQuest,
  cmdStyles,

  // hooks
  onBattleWon,
  applyCompletion,

  // helpers
  ensureQuestFields,
  getUnlockedStyleMoves,
  loadQuests,
  loadStyles,
  reloadCatalog,
};

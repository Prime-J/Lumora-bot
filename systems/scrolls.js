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
// ║    • DMs the quest with its per-step commands                 ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SCROLL_ASSETS_DIR = path.join(__dirname, "..", "assets", "scrolls");

let _catalog = null;
function loadScrolls() {
  if (_catalog) return _catalog;
  const f = path.join(__dirname, "..", "data", "scrolls.json");
  try { _catalog = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _catalog = {}; }
  return _catalog;
}

// Return the absolute path to a scroll's image if it exists on disk.
// Operator can drop PNGs at assets/scrolls/<id>.{png,jpg,jpeg,webp}.
// Returns null if no image found — caller should fall back to text-only.
function scrollImagePath(scrollId) {
  if (!scrollId) return null;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(SCROLL_ASSETS_DIR, `${scrollId}.${ext}`);
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
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

// Called from the hunt/wildbattle path. May return a scroll if one
// dropped, else null. Mutates the player inventory. Returned object
// also carries `imagePath` (absolute path or null) for callers that
// want to send the image alongside the drop message.
function maybeDropScroll(player) {
  ensureScrollFields(player);
  const catalog = loadScrolls();
  for (const sc of Object.values(catalog)) {
    const rate = RARITY_DROP_RATE[String(sc.rarity || "common").toLowerCase()] || 0;
    if (Math.random() < rate) {
      player.scrolls[sc.id] = Number(player.scrolls[sc.id] || 0) + 1;
      return { ...sc, imagePath: scrollImagePath(sc.id) };
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
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
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
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
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

  let questBlockForDm = "";
  let alreadyMsg = "";

  if (!questDef) {
    questBlockForDm = `_(scroll's linked quest "${questId}" is missing from data/quests.json)_`;
  } else if (player.quests.completed.includes(questId)) {
    alreadyMsg = `✓ You've already completed *${questDef.name}*. The scroll burns itself out.`;
  } else if (player.quests.active[questId]) {
    alreadyMsg = `📜 *${questDef.name}* is already in your quest log. Progress unchanged.`;
  } else {
    player.quests.active[questId] = { progress: 0, startedAt: Date.now(), stepProgress: {} };
    questBlockForDm = questSystem.renderQuestDetail(questDef);
  }

  savePlayers(players);

  // ─── DM the full quest detail to the player ───
  // Group chat only sees a short tease. This keeps the quest text
  // private and reduces spam in shared chats.
  let dmSent = false;
  if (questDef && !alreadyMsg) {
    const dmText =
      `📜 *${scroll.name}* — opened\n${DIVIDER}\n` +
      `_${scroll.lore}_\n${DIVIDER}\n` +
      `${questBlockForDm}`;
    try {
      await sock.sendMessage(senderId, { text: dmText });
      dmSent = true;
    } catch {
      // DM blocked — we'll inline the quest in the group as a fallback
    }
  }

  // ─── Group-chat message (short tease) + image if available ───
  const imagePath = scrollImagePath(scroll.id);
  const teaseText = alreadyMsg
    ? `📜 *${scroll.name}*\n${alreadyMsg}`
    : dmSent
      ? `📜 *${scroll.name} — opened*\n` +
        `🧠 *+1 Intelligence*  _(now ${player.intelligence})_\n` +
        `_Quest details DM'd to you — check your private chat to begin._`
      : // DM failed — print everything inline as the fallback
        `📜 *SCROLL OPENED — ${scroll.name}*\n${DIVIDER}\n` +
        `_${scroll.lore}_\n` +
        `🧠 *+1 Intelligence*  _(now ${player.intelligence})_\n${DIVIDER}\n` +
        questBlockForDm;

  if (imagePath) {
    try {
      await sock.sendMessage(chatId, {
        image: fs.readFileSync(imagePath),
        caption: teaseText,
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(chatId, { text: teaseText }, { quoted: msg });
    }
  } else {
    await sock.sendMessage(chatId, { text: teaseText }, { quoted: msg });
  }

  // ─── Send the linked style's art as a follow-up image ───
  if (questDef?.reward?.style) {
    try {
      const questSystem = require('./quests');
      const styleImg = questSystem.styleImagePath(questDef.reward.style);
      if (styleImg) {
        const st = questSystem.loadStyles()[questDef.reward.style];
        await sock.sendMessage(chatId, {
          image: fs.readFileSync(styleImg),
          caption: `🥋 *${st?.name || questDef.reward.style}* — your new fighting style unlocked!`,
        }, { quoted: msg });
      }
    } catch { /* style image not found or send failed */ }
  }
}

module.exports = {
  cmdScrolls,
  cmdOpen,
  loadScrolls,
  ensureScrollFields,
  maybeDropScroll,
  findScrollByQuery,
  scrollImagePath,
  RARITY_DROP_RATE,
};

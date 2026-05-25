// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA SHARD / MERGE SYSTEM  v0.5.0                          ║
// ║  Universal mechanic: defeat mergeable Mora → shard → awaken   ║
// ║  → merge (replaces previous) → .shed returns to base form.    ║
// ║  See docs/BOT_REWORK_PLAN.md                                  ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

// Tier strings (per-Mora `merge` flag in mora.json)
const TIER_FULL    = "full";
const TIER_PARTIAL = "partial";

// Drop odds — defeats favored over spawn-claims (decided 2026-05-25)
const DROP_RATE_DEFEAT      = 0.80;
const DROP_RATE_SPAWN_CLAIM = 0.15;

// Default per-type storage cap; storage upgrades raise this per Mora.
const DEFAULT_STORAGE_CAP = 1;

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function ensureShardFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.shards || typeof player.shards !== "object") player.shards = {};
  if (!player.shardStorage || typeof player.shardStorage !== "object") player.shardStorage = {};
  if (!("currentMerge" in player)) player.currentMerge = null;
}

function shardKey(species) {
  // species can be the mora.json entry or a name string — normalize to lowercase id-or-name
  if (!species) return null;
  if (typeof species === "string") return species.toLowerCase();
  return String(species.id ?? species.name ?? "").toLowerCase();
}

function getMergeTier(species) {
  if (!species) return null;
  const m = species.merge;
  if (m === TIER_FULL || m === TIER_PARTIAL) return m;
  return null; // not mergeable
}

function isMergeable(species) {
  return getMergeTier(species) != null;
}

function getStorageCap(player, key) {
  ensureShardFields(player);
  const custom = Number(player.shardStorage?.[key] || 0);
  return Math.max(DEFAULT_STORAGE_CAP, custom);
}

function getShardCount(player, key) {
  ensureShardFields(player);
  return Number(player.shards?.[key] || 0);
}

function findSpeciesByKey(loadMora, key) {
  if (!key) return null;
  const list = loadMora();
  const q = String(key).toLowerCase();
  return list.find(
    (m) =>
      String(m.id).toLowerCase() === q ||
      String(m.name).toLowerCase() === q ||
      String(m.name).toLowerCase().includes(q)
  );
}

// ══════════════════════════════════════════════════════════════
// DROP — called from wildbattle defeat path
// Returns a short log line if a shard dropped (or was capped), else null.
// ══════════════════════════════════════════════════════════════
function dropShardOnDefeat(player, species, opts = {}) {
  if (!isMergeable(species)) return null;
  ensureShardFields(player);

  const source = opts.source || "defeat";
  const rate =
    opts.forceDrop === true
      ? 1
      : source === "spawn"
      ? DROP_RATE_SPAWN_CLAIM
      : DROP_RATE_DEFEAT;

  if (Math.random() > rate) return null;

  const key = shardKey(species);
  const cap = getStorageCap(player, key);
  const have = getShardCount(player, key);
  const tier = getMergeTier(species);

  if (have >= cap) {
    return (
      `💎 A *${species.name}* shard crystallized — but your vault is full ` +
      `(*${have}/${cap}*). Buy +1 storage to keep more.`
    );
  }

  player.shards[key] = have + 1;
  const tierTag = tier === TIER_FULL ? " (FULL merge)" : "";
  return (
    `💎 A *${species.name}* shard crystallized into your vault!${tierTag}\n` +
    `   Use *.awaken ${species.name.toLowerCase()}* to shatter & merge.`
  );
}

// ══════════════════════════════════════════════════════════════
// MERGE STATE HELPERS — consulted by display + combat code
// ══════════════════════════════════════════════════════════════
function getCurrentMerge(player) {
  ensureShardFields(player);
  return player.currentMerge || null;
}

function isMerged(player) {
  return !!getCurrentMerge(player);
}

function getMergedDisplayName(player, baseName = "") {
  const merge = getCurrentMerge(player);
  if (!merge) return baseName;
  return `[${merge.name}] ${baseName}`.trim();
}

// Returns an array of move names exposed by the current merge (or empty)
function getMergeMoves(player) {
  const merge = getCurrentMerge(player);
  if (!merge) return [];
  return Array.isArray(merge.moves) ? merge.moves.slice() : [];
}

// Clears combat-state buffs/debuffs/DoTs on the player.
// Called when the merge is REPLACED (clean wipe — decided 2026-05-25).
function clearMergeStatusEffects(player) {
  if (!player) return;
  // Known effect carriers in the Lumora schema — wipe what's safe to wipe.
  // We intentionally do NOT touch playerHp/playerMaxHp here (the body persists).
  if (player.statusEffects) player.statusEffects = {};
  if (player.activeBuffs)   player.activeBuffs   = {};
  if (player.activeDebuffs) player.activeDebuffs = {};
  if (player.dots)          player.dots          = [];
  if (player.riftFury)      delete player.riftFury;
}

// Build the merge snapshot stored on the player. Captures what we need to
// render & resolve moves without re-reading mora.json each time.
function buildMergeSnapshot(species) {
  const tier = getMergeTier(species);
  const moveNames = species.moves ? Object.keys(species.moves) : [];
  return {
    moraId: species.id,
    name: species.name,
    type: species.type || null,
    tier, // "full" | "partial"
    moves: moveNames,
    awakenedAt: Date.now(),
  };
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

// .shards — list the player's shard vault
async function cmdShards(ctx, chatId, senderId, msg) {
  const { sock, players, loadMora } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.start*." }, { quoted: msg });
  }
  ensureShardFields(player);

  const entries = Object.entries(player.shards).filter(([, n]) => Number(n) > 0);
  const merge = getCurrentMerge(player);

  let body;
  if (!entries.length) {
    body =
      `💎 *YOUR SHARD VAULT*\n${DIVIDER}\n` +
      `_Empty. Defeat a mergeable Mora to crystallize its essence._\n` +
      `${DIVIDER}\n` +
      (merge
        ? `🌀 Currently merged with *${merge.name}*\n   _.shed to return to base form_\n`
        : `🩶 Base form — no merge active.\n`);
  } else {
    const list = ctx.loadMora();
    const lines = entries.map(([key, count], i) => {
      const sp = list.find(
        (m) =>
          String(m.id).toLowerCase() === key ||
          String(m.name).toLowerCase() === key
      );
      const name = sp?.name || key;
      const tier = sp ? getMergeTier(sp) : null;
      const tag  = tier === TIER_FULL ? " 🔥FULL" : tier === TIER_PARTIAL ? " ✨PARTIAL" : "";
      const cap  = getStorageCap(player, key);
      return `${i + 1}. *${name}*${tag}  ×${count}/${cap}`;
    });
    body =
      `💎 *YOUR SHARD VAULT*\n${DIVIDER}\n` +
      lines.join("\n") +
      `\n${DIVIDER}\n` +
      (merge
        ? `🌀 Currently merged with *${merge.name}*  _(.shed to revert)_\n`
        : `🩶 Base form — no merge active.\n`) +
      `\nShatter one with *.awaken <name>*  •  Trade later with *.trade*`;
  }

  return sock.sendMessage(chatId, { text: body, mentions: [senderId] }, { quoted: msg });
}

// .awaken <shardName> — shatter, set currentMerge, wipe effects, broadcast
async function cmdAwaken(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.start*." }, { quoted: msg });
  }
  ensureShardFields(player);

  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    return sock.sendMessage(chatId, {
      text:
        `🌀 *Usage:* *.awaken <shard name>*\n` +
        `Example: *.awaken Tideling*\n\n` +
        `View your vault with *.shards*.`,
    }, { quoted: msg });
  }

  const species = findSpeciesByKey(loadMora, queryRaw);
  if (!species) {
    return sock.sendMessage(chatId, { text: `❌ No Mora named *${queryRaw}*.` }, { quoted: msg });
  }
  if (!isMergeable(species)) {
    return sock.sendMessage(chatId, {
      text: `❌ *${species.name}* is not mergeable — its essence won't bond with a Lumorian.`,
    }, { quoted: msg });
  }

  const key = shardKey(species);
  const have = getShardCount(player, key);
  if (have < 1) {
    return sock.sendMessage(chatId, {
      text: `❌ You don't have a *${species.name}* shard. Defeat one in the wild first.`,
    }, { quoted: msg });
  }

  // Consume the shard
  player.shards[key] = have - 1;
  if (player.shards[key] <= 0) delete player.shards[key];

  const previous = getCurrentMerge(player);
  clearMergeStatusEffects(player);
  player.currentMerge = buildMergeSnapshot(species);

  savePlayers(players);

  const tier = getMergeTier(species);
  const tierLine =
    tier === TIER_FULL
      ? `🔥 *FULL MERGE* — you ARE the ${species.name}.`
      : `✨ *PARTIAL MERGE* — you keep your form, gain its moveset.`;

  const transition = previous
    ? `🌪 The *${previous.name}* form shatters and reforms…\n`
    : `🌟 The crystal shatters…\n`;

  return sock.sendMessage(chatId, {
    text:
      `${transition}` +
      `💠 *AWAKENING — ${species.name}*\n${DIVIDER}\n` +
      `${tierLine}\n` +
      (species.description ? `\n_${species.description}_\n` : "") +
      `${DIVIDER}\n` +
      `🎴 Moveset gained: ${player.currentMerge.moves.map((m) => `*${m}*`).join(", ") || "_none_"}\n` +
      `\n💎 Shards of *${species.name}* remaining: *${player.shards[key] || 0}*\n` +
      `_All previous buffs and debuffs were wiped clean._\n` +
      `\nUse *.attack* to see your full moveset  •  *.shed* to revert.`,
    mentions: [senderId],
  }, { quoted: msg });
}

// .shed — clear currentMerge, return to base
async function cmdShed(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.start*." }, { quoted: msg });
  }
  ensureShardFields(player);

  const merge = getCurrentMerge(player);
  if (!merge) {
    return sock.sendMessage(chatId, {
      text: `🩶 You're already in base form — nothing to shed.`,
    }, { quoted: msg });
  }

  clearMergeStatusEffects(player);
  player.currentMerge = null;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `🍃 *SHED*\n${DIVIDER}\n` +
      `The *${merge.name}* form unravels and dissolves back into the rift.\n` +
      `You stand once more in your own skin — *punch*, *dodge*, *block*.\n` +
      `${DIVIDER}\n` +
      `_The shard is already spent. You'll need a new one to merge again._`,
    mentions: [senderId],
  }, { quoted: msg });
}

// .merge — retired; soft-alias to .awaken for muscle memory
async function cmdLegacyMerge(ctx, chatId, senderId, msg, args = []) {
  return ctx.sock.sendMessage(chatId, {
    text:
      `⚠️ *.merge* has been replaced.\n` +
      `Use *.awaken <shard>* to shatter a shard and merge.\n` +
      `Run *.shards* to see your vault.`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  // commands
  cmdShards,
  cmdAwaken,
  cmdShed,
  cmdLegacyMerge,

  // helpers used by other systems
  ensureShardFields,
  dropShardOnDefeat,
  getCurrentMerge,
  isMerged,
  getMergedDisplayName,
  getMergeMoves,
  clearMergeStatusEffects,
  isMergeable,
  getMergeTier,
  shardKey,
  getShardCount,
  getStorageCap,

  // constants
  TIER_FULL,
  TIER_PARTIAL,
  DEFAULT_STORAGE_CAP,
  DROP_RATE_DEFEAT,
  DROP_RATE_SPAWN_CLAIM,
};

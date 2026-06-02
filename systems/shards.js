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

// Corrupted shard variant — produced by Rift Seekers' .bind. Stored under
// the same shard map with a "@corrupted" suffix on the key so caps stay
// per-variant. Awakening a corrupted shard applies the corruption modifier:
//   +CORRUPTED_DMG_BONUS  damage on every move
//   CORRUPTED_BACKLASH_PCT chance per turn of self-damage from instability.
const CORRUPTED_SUFFIX        = "@corrupted";
const CORRUPTED_DMG_BONUS     = 0.25;  // +25%
const CORRUPTED_BACKLASH_PCT  = 0.10;  // 10% per move
const CORRUPTED_BACKLASH_FRAC = 0.06;  // 6% of player maxHp when triggered

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function ensureShardFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.shards || typeof player.shards !== "object") player.shards = {};
  if (!player.shardStorage || typeof player.shardStorage !== "object") player.shardStorage = {};
  if (!("currentMerge" in player)) player.currentMerge = null;
}

function shardKey(species, opts = {}) {
  // species can be the mora.json entry or a name string — normalize to lowercase id-or-name
  if (!species) return null;
  const base = typeof species === "string"
    ? species.toLowerCase()
    : String(species.id ?? species.name ?? "").toLowerCase();
  return opts.corrupted ? `${base}${CORRUPTED_SUFFIX}` : base;
}

function isCorruptedKey(key) {
  return typeof key === "string" && key.endsWith(CORRUPTED_SUFFIX);
}

function stripCorrupted(key) {
  return isCorruptedKey(key) ? key.slice(0, -CORRUPTED_SUFFIX.length) : key;
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
  const q = stripCorrupted(String(key).toLowerCase());
  return list.find(
    (m) =>
      String(m.id).toLowerCase() === q ||
      String(m.name).toLowerCase() === q ||
      String(m.name).toLowerCase().includes(q)
  );
}

// Drop a corrupted variant — used by Rift's .bind on success.
// Cap-aware just like normal drops; returns a log line.
function dropCorruptedShard(player, species) {
  if (!isMergeable(species)) return null;
  ensureShardFields(player);

  const key = shardKey(species, { corrupted: true });
  const cap = getStorageCap(player, key);
  const have = getShardCount(player, key);

  if (have >= cap) {
    return (
      `☠ A *corrupted ${species.name}* shard tried to crystallize — ` +
      `but your vault is full (*${have}/${cap}*). Buy +1 storage to keep more.`
    );
  }

  player.shards[key] = have + 1;
  return (
    `☠ A *CORRUPTED ${species.name}* shard pulses into your vault!\n` +
    `   Awaken with *.awaken corrupted ${species.name.toLowerCase()}* — +25% damage, but unstable.`
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
function buildMergeSnapshot(species, opts = {}) {
  const tier = getMergeTier(species);
  const moveNames = species.moves ? Object.keys(species.moves) : [];
  return {
    moraId: species.id,
    name: species.name,
    type: species.type || null,
    tier, // "full" | "partial"
    moves: moveNames,
    corrupted: !!opts.corrupted,
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
      const corrupted = isCorruptedKey(key);
      const baseKey = stripCorrupted(key);
      const sp = list.find(
        (m) =>
          String(m.id).toLowerCase() === baseKey ||
          String(m.name).toLowerCase() === baseKey
      );
      const name = sp?.name || baseKey;
      const tier = sp ? getMergeTier(sp) : null;
      const tierTag = tier === TIER_FULL ? " 🔥FULL" : tier === TIER_PARTIAL ? " ✨PARTIAL" : "";
      const corrTag = corrupted ? " ☠CORRUPTED" : "";
      const cap  = getStorageCap(player, key);
      return `${i + 1}. *${name}*${tierTag}${corrTag}  ×${count}/${cap}`;
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

  const tokens = args.map((a) => String(a).trim()).filter(Boolean);
  // Support: ".awaken Nylon", ".awaken corrupted Nylon", ".awaken Nylon corrupted"
  let wantCorrupted = false;
  const filtered = tokens.filter((t) => {
    if (t.toLowerCase() === "corrupted") { wantCorrupted = true; return false; }
    return true;
  });
  const queryRaw = filtered.join(" ").trim();

  if (!queryRaw) {
    return sock.sendMessage(chatId, {
      text:
        `🌀 *Usage:* *.awaken <shard name>* [corrupted]\n` +
        `Examples: *.awaken Tideling*  •  *.awaken corrupted Nylon*\n\n` +
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

  const key = shardKey(species, { corrupted: wantCorrupted });
  const have = getShardCount(player, key);
  if (have < 1) {
    const variantLabel = wantCorrupted ? `corrupted *${species.name}*` : `*${species.name}*`;
    return sock.sendMessage(chatId, {
      text: `❌ You don't have a ${variantLabel} shard. Defeat one in the wild first.`,
    }, { quoted: msg });
  }

  // Consume the shard
  player.shards[key] = have - 1;
  if (player.shards[key] <= 0) delete player.shards[key];

  const previous = getCurrentMerge(player);
  clearMergeStatusEffects(player);
  player.currentMerge = buildMergeSnapshot(species, { corrupted: wantCorrupted });

  savePlayers(players);

  const tier = getMergeTier(species);
  const tierLine =
    tier === TIER_FULL
      ? `🔥 *FULL MERGE* — you ARE the ${species.name}.`
      : `✨ *PARTIAL MERGE* — you keep your form, gain its moveset.`;

  const corruptionLine = wantCorrupted
    ? `\n☠ *CORRUPTED* — +${Math.round(CORRUPTED_DMG_BONUS * 100)}% damage,` +
      ` ${Math.round(CORRUPTED_BACKLASH_PCT * 100)}% chance of instability backlash per move.`
    : "";

  const transition = previous
    ? `🌪 The *${previous.name}* form shatters and reforms…\n`
    : `🌟 The crystal shatters…\n`;

  return sock.sendMessage(chatId, {
    text:
      `${transition}` +
      `💠 *AWAKENING — ${species.name}${wantCorrupted ? " ☠" : ""}*\n${DIVIDER}\n` +
      `${tierLine}${corruptionLine}\n` +
      (species.description ? `\n_${species.description}_\n` : "") +
      `${DIVIDER}\n` +
      `🎴 Moveset gained: ${player.currentMerge.moves.map((m) => `*${m}*`).join(", ") || "_none_"}\n` +
      `\n💎 ${wantCorrupted ? "Corrupted s" : "S"}hards of *${species.name}* remaining: *${player.shards[key] || 0}*\n` +
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

// .storage [Mora] — upgrade shard storage for a specific Mora type.
// Real-money payment infra isn't wired yet — stubbed as "coming soon".
async function cmdStorage(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, loadMora } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  }
  ensureShardFields(player);

  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    // List current per-type caps for shards the player has touched
    const keys = new Set([
      ...Object.keys(player.shards || {}),
      ...Object.keys(player.shardStorage || {}),
    ]);
    const list = loadMora();
    const lines = [...keys].map((k) => {
      const sp = list.find((m) => String(m.id).toLowerCase() === k || String(m.name).toLowerCase() === k);
      const name = sp?.name || k;
      return `• *${name}* — cap *${getStorageCap(player, k)}*  (have ${getShardCount(player, k)})`;
    });
    return sock.sendMessage(chatId, {
      text:
        `🏦 *SHARD STORAGE*\n${DIVIDER}\n` +
        (lines.length ? lines.join("\n") : "_No shard types touched yet._") +
        `\n${DIVIDER}\n` +
        `Default cap is *${DEFAULT_STORAGE_CAP}* per Mora type.\n` +
        `💳 *Upgrade with:* *.storage <Mora>*\n` +
        `_Real-money payment for upgrades is **coming soon** — feature gated until provider integration ships._`,
    }, { quoted: msg });
  }

  const species = findSpeciesByKey(loadMora, queryRaw);
  if (!species) {
    return sock.sendMessage(chatId, { text: `❌ No Mora named *${queryRaw}*.` }, { quoted: msg });
  }
  const cap = getStorageCap(player, shardKey(species));
  return sock.sendMessage(chatId, {
    text:
      `💳 *STORAGE UPGRADE — ${species.name}*\n${DIVIDER}\n` +
      `Current cap: *${cap}* shard(s)\n` +
      `Upgrade: *+1* per purchase\n` +
      `Cost: _coming soon — real-money payment infra not yet integrated._\n${DIVIDER}\n` +
      `_For now, every Mora is limited to ${DEFAULT_STORAGE_CAP} shard in your vault._`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// FACTION RITES — Purify (Harmony) + Destroy (Purity)
// Closes the 3-faction corruption loop:
//   • Rift creates corrupted shards via .bind
//   • Harmony PURIFIES them back into normal shards (.purify)
//   • Purity DESTROYS them for Resonance + faction points (.destroy)
// ══════════════════════════════════════════════════════════════

const PURIFY_LUCONS_COST   = 100;
const DESTROY_RESONANCE    = 3;
const DESTROY_FACTION_PTS  = 5;

// .purify <shard> — Harmony rite, costs Lucons
async function cmdPurify(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureShardFields(player);

  // Faction is lore-flavored, not enforced — any player can perform the rite.
  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    // List corrupted shards in vault
    const corrEntries = Object.entries(player.shards).filter(
      ([k, n]) => Number(n) > 0 && isCorruptedKey(k)
    );
    if (!corrEntries.length) {
      return sock.sendMessage(chatId, {
        text:
          `🌿 *.purify*  _(Harmony rite — anyone may speak it)_\n${DIVIDER}\n` +
          `_You have no corrupted shards to purify._\n${DIVIDER}\n` +
          `Cost per purification: *${PURIFY_LUCONS_COST} Lucons*\n` +
          `Effect: converts a corrupted shard back into a normal one.`,
      }, { quoted: msg });
    }
    const list = loadMora();
    const lines = corrEntries.map(([k, n], i) => {
      const baseKey = stripCorrupted(k);
      const sp = list.find((m) => String(m.id).toLowerCase() === baseKey);
      return `${i + 1}. ☠ *${sp?.name || baseKey}*  ×${n}`;
    });
    return sock.sendMessage(chatId, {
      text:
        `🌿 *PURIFY — Harmony Rite*\n${DIVIDER}\n` +
        `Corrupted shards in your vault:\n` +
        lines.join("\n") + `\n${DIVIDER}\n` +
        `*.purify <name>* to cleanse one. Cost: *${PURIFY_LUCONS_COST} Lucons*.`,
    }, { quoted: msg });
  }

  const species = findSpeciesByKey(loadMora, queryRaw);
  if (!species) {
    return sock.sendMessage(chatId, { text: `❌ No Mora named *${queryRaw}*.` }, { quoted: msg });
  }

  const corrKey = shardKey(species, { corrupted: true });
  if (getShardCount(player, corrKey) < 1) {
    return sock.sendMessage(chatId, {
      text: `❌ You don't have a *corrupted ${species.name}* shard.`,
    }, { quoted: msg });
  }

  if (Number(player.lucons || 0) < PURIFY_LUCONS_COST) {
    return sock.sendMessage(chatId, {
      text: `❌ Purification costs *${PURIFY_LUCONS_COST} Lucons*. You have *${player.lucons || 0}*.`,
    }, { quoted: msg });
  }

  // Check normal-variant cap BEFORE consuming the corrupted shard
  const normalKey = shardKey(species);
  const normalCap = getStorageCap(player, normalKey);
  const normalHave = getShardCount(player, normalKey);
  if (normalHave >= normalCap) {
    return sock.sendMessage(chatId, {
      text:
        `❌ Your normal *${species.name}* vault is full (*${normalHave}/${normalCap}*). ` +
        `Use the shard or upgrade storage first.`,
    }, { quoted: msg });
  }

  // Convert
  player.lucons = Number(player.lucons) - PURIFY_LUCONS_COST;
  player.shards[corrKey] -= 1;
  if (player.shards[corrKey] <= 0) delete player.shards[corrKey];
  player.shards[normalKey] = normalHave + 1;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `🌿 *PURIFIED*\n${DIVIDER}\n` +
      `The corruption sloughs off in a slow rinse of light.\n` +
      `☠ *Corrupted ${species.name}* → 💎 *${species.name}*\n${DIVIDER}\n` +
      `💰 -${PURIFY_LUCONS_COST} Lucons _(now ${player.lucons})_\n` +
      `_"What was broken can flow whole again."_`,
  }, { quoted: msg });
}

// .destroy <shard> — Purity rite, free, grants Resonance + faction points
async function cmdDestroy(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureShardFields(player);

  // Faction is lore-flavored, not enforced — any player may shatter a corrupted shard.
  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    const corrEntries = Object.entries(player.shards).filter(
      ([k, n]) => Number(n) > 0 && isCorruptedKey(k)
    );
    if (!corrEntries.length) {
      return sock.sendMessage(chatId, {
        text:
          `🗡 *.destroy*  _(Purity rite — anyone may perform it)_\n${DIVIDER}\n` +
          `_You have no corrupted shards to destroy._\n${DIVIDER}\n` +
          `Reward per shard: *+${DESTROY_RESONANCE} Resonance*, *+${DESTROY_FACTION_PTS}* Purity faction points.`,
      }, { quoted: msg });
    }
    const list = loadMora();
    const lines = corrEntries.map(([k, n], i) => {
      const baseKey = stripCorrupted(k);
      const sp = list.find((m) => String(m.id).toLowerCase() === baseKey);
      return `${i + 1}. ☠ *${sp?.name || baseKey}*  ×${n}`;
    });
    return sock.sendMessage(chatId, {
      text:
        `🗡 *DESTROY — Purity Rite*\n${DIVIDER}\n` +
        `Corrupted shards in your vault:\n` +
        lines.join("\n") + `\n${DIVIDER}\n` +
        `*.destroy <name>* to shatter one. Free. _The Order does not bargain with corruption._`,
    }, { quoted: msg });
  }

  const species = findSpeciesByKey(loadMora, queryRaw);
  if (!species) {
    return sock.sendMessage(chatId, { text: `❌ No Mora named *${queryRaw}*.` }, { quoted: msg });
  }

  const corrKey = shardKey(species, { corrupted: true });
  if (getShardCount(player, corrKey) < 1) {
    return sock.sendMessage(chatId, {
      text: `❌ You don't have a *corrupted ${species.name}* shard.`,
    }, { quoted: msg });
  }

  // Consume + reward
  player.shards[corrKey] -= 1;
  if (player.shards[corrKey] <= 0) delete player.shards[corrKey];
  player.resonance = Number(player.resonance || 0) + DESTROY_RESONANCE;

  // Update faction points (file-based, same as wildbattle's faction events)
  let factionPtsLine = "";
  try {
    const fs = require("fs");
    const path = require("path");
    const f = path.join(__dirname, "..", "data", "faction_points.json");
    const fp = JSON.parse(fs.readFileSync(f, "utf8"));
    fp.purity = (fp.purity || 0) + DESTROY_FACTION_PTS;
    fs.writeFileSync(f, JSON.stringify(fp, null, 2));
    factionPtsLine = `\n⚔️ *+${DESTROY_FACTION_PTS}* Purity faction points`;
  } catch {}

  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `🗡 *DESTROYED*\n${DIVIDER}\n` +
      `☠ *Corrupted ${species.name}* — shattered in judgment.\n${DIVIDER}\n` +
      `💠 *+${DESTROY_RESONANCE} Resonance*` +
      factionPtsLine + `\n` +
      `_"The Order does not tolerate what cannot be cleansed."_`,
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
// STARTER SHARD PICKER  (v0.9.0)
// At .start, every new player picks one of 3 mergeable shards.
// ══════════════════════════════════════════════════════════════

// Three Mora IDs offered as starter shards (all partial-merge, common-tier).
const STARTER_SHARD_OPTIONS = [
  { id: 1, name: "Nylon",   type: "Aqua",   blurb: "Disciplined river guardian. Flow-and-strike rhythm." },
  { id: 4, name: "Sparko",  type: "Volt",   blurb: "Lightning-fast. Speed and bursts." },
  { id: 2, name: "Thornel", type: "Nature", blurb: "Razor-leaf predator. Blade-arm precision." },
];

async function cmdChooseShard(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureShardFields(player);

  if (player.starterShardChosen) {
    return sock.sendMessage(chatId, {
      text: `✅ You already chose your starter shard. Check your vault with *.shards*.`,
    }, { quoted: msg });
  }

  const list = loadMora();
  const options = STARTER_SHARD_OPTIONS.map((opt) => ({
    ...opt,
    species: list.find((m) => Number(m.id) === opt.id),
  })).filter((o) => o.species);

  const pick = parseInt(args[0], 10);
  if (!Number.isFinite(pick) || pick < 1 || pick > options.length) {
    const linesOpt = options.map((o, i) =>
      `*${i + 1}.* 💠 *${o.name}* — ${o.type}\n     _${o.blurb}_`
    );
    return sock.sendMessage(chatId, {
      text:
        `💎 *CHOOSE YOUR STARTER SHARD*\n${DIVIDER}\n` +
        `One mergeable shard to begin your path. Use *.awaken <name>* later to merge.\n${DIVIDER}\n` +
        linesOpt.join("\n\n") +
        `\n${DIVIDER}\n` +
        `Pick with *.choose-shard 1-${options.length}*`,
    }, { quoted: msg });
  }

  const chosen = options[pick - 1];
  const key = shardKey(chosen.species);
  player.shards[key] = Number(player.shards[key] || 0) + 1;
  player.starterShardChosen = true;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `💎 *STARTER SHARD GRANTED*\n${DIVIDER}\n` +
      `A *${chosen.name}* shard crystallizes into your vault.\n_${chosen.blurb}_\n${DIVIDER}\n` +
      `Use *.shards* to view your vault.\n` +
      `When ready, run *.awaken ${chosen.name}* to merge.`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// P2P SHARD TRADE  (v0.5.0 rework — direct trade; market board later)
// ══════════════════════════════════════════════════════════════

const pendingTrades = new Map(); // recipientJid -> trade
const TRADE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function resolveTargetJid(arg, players, mentionedJids = []) {
  if (mentionedJids && mentionedJids.length) return mentionedJids[0];
  const num = String(arg || "").replace(/^@/, "").replace(/[^0-9]/g, "");
  if (!num) return null;
  return Object.keys(players).find((j) => j.startsWith(num)) || null;
}

async function cmdTrade(ctx, chatId, senderId, msg, args = [], opts = {}) {
  const sub = String(args[0] || "").toLowerCase();
  if (sub === "accept")                       return cmdTradeAccept(ctx, chatId, senderId, msg);
  if (sub === "reject" || sub === "decline")  return cmdTradeReject(ctx, chatId, senderId, msg);
  if (sub === "list"   || sub === "pending")  return cmdTradeList(ctx, chatId, senderId, msg);
  if (!sub || sub === "help") {
    return ctx.sock.sendMessage(chatId, {
      text:
        `🤝 *.trade* — shard exchange\n${DIVIDER}\n` +
        `• *.trade @user <yourShard> <theirShard>* — propose a trade\n` +
        `• *.trade accept* / *.trade reject* — answer an incoming offer\n` +
        `• *.trade list* — view your pending incoming offer\n` +
        `${DIVIDER}\n_Direct P2P only for now — public market board comes later._`,
    }, { quoted: msg });
  }
  return cmdTradeOffer(ctx, chatId, senderId, msg, args, opts);
}

async function cmdTradeOffer(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock, players, loadMora } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });

  const targetJid = resolveTargetJid(args[0], players, opts.mentionedJids || (opts.getMentionedJids ? opts.getMentionedJids(msg) : []));
  if (!targetJid || !players[targetJid]) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.trade @user <yourShard> <theirShard>*\nExample: *.trade @1234 Nylon Voltrix*`,
    }, { quoted: msg });
  }
  if (targetJid === senderId) {
    return sock.sendMessage(chatId, { text: "❌ You can't trade with yourself." }, { quoted: msg });
  }

  const myShardName    = args[1];
  const theirShardName = args[2];
  if (!myShardName || !theirShardName) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.trade @user <yourShard> <theirShard>*`,
    }, { quoted: msg });
  }

  const mySpecies    = findSpeciesByKey(loadMora, myShardName);
  const theirSpecies = findSpeciesByKey(loadMora, theirShardName);
  if (!mySpecies)    return sock.sendMessage(chatId, { text: `❌ No Mora named *${myShardName}*.` }, { quoted: msg });
  if (!theirSpecies) return sock.sendMessage(chatId, { text: `❌ No Mora named *${theirShardName}*.` }, { quoted: msg });

  ensureShardFields(player);
  ensureShardFields(players[targetJid]);

  const myKey    = shardKey(mySpecies);
  const theirKey = shardKey(theirSpecies);

  if (getShardCount(player, myKey) < 1) {
    return sock.sendMessage(chatId, { text: `❌ You don't have a *${mySpecies.name}* shard.` }, { quoted: msg });
  }
  if (getShardCount(players[targetJid], theirKey) < 1) {
    return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]} doesn't have a *${theirSpecies.name}* shard.`, mentions: [targetJid] }, { quoted: msg });
  }

  pendingTrades.set(targetJid, {
    from: senderId,
    fromShardKey:  myKey,
    fromShardName: mySpecies.name,
    toShardKey:    theirKey,
    toShardName:   theirSpecies.name,
    chatId,
    expiresAt: Date.now() + TRADE_TTL_MS,
  });

  return sock.sendMessage(chatId, {
    text:
      `🤝 *TRADE OFFER*\n${DIVIDER}\n` +
      `@${senderId.split("@")[0]} offers a *${mySpecies.name}* shard\n` +
      `↔ for @${targetJid.split("@")[0]}'s *${theirSpecies.name}* shard.\n${DIVIDER}\n` +
      `Recipient: respond with *.trade accept* or *.trade reject*.\n` +
      `Expires in 10 minutes.`,
    mentions: [senderId, targetJid],
  }, { quoted: msg });
}

async function cmdTradeAccept(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const trade = pendingTrades.get(senderId);
  if (!trade) {
    return sock.sendMessage(chatId, { text: "❌ No pending trade for you." }, { quoted: msg });
  }
  if (Date.now() > trade.expiresAt) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: "❌ Trade expired." }, { quoted: msg });
  }

  const fromPlayer = players[trade.from];
  const toPlayer   = players[senderId];
  if (!fromPlayer || !toPlayer) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: "❌ Trade participants no longer valid." }, { quoted: msg });
  }

  ensureShardFields(fromPlayer);
  ensureShardFields(toPlayer);

  if (getShardCount(fromPlayer, trade.fromShardKey) < 1 ||
      getShardCount(toPlayer,   trade.toShardKey)   < 1) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: "❌ Trade failed — one side no longer has the offered shard." }, { quoted: msg });
  }

  const fromIncomingCap = getStorageCap(fromPlayer, trade.toShardKey);
  const toIncomingCap   = getStorageCap(toPlayer,   trade.fromShardKey);
  const fromHas = getShardCount(fromPlayer, trade.toShardKey);
  const toHas   = getShardCount(toPlayer,   trade.fromShardKey);

  if (fromHas >= fromIncomingCap) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, {
      text: `❌ Trade failed — sender's vault is full for *${trade.toShardName}* (${fromHas}/${fromIncomingCap}).`,
    }, { quoted: msg });
  }
  if (toHas >= toIncomingCap) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, {
      text: `❌ Trade failed — your vault is full for *${trade.fromShardName}* (${toHas}/${toIncomingCap}). Buy storage to accept.`,
    }, { quoted: msg });
  }

  // Atomic swap
  fromPlayer.shards[trade.fromShardKey] -= 1;
  if (fromPlayer.shards[trade.fromShardKey] <= 0) delete fromPlayer.shards[trade.fromShardKey];
  fromPlayer.shards[trade.toShardKey] = (fromPlayer.shards[trade.toShardKey] || 0) + 1;

  toPlayer.shards[trade.toShardKey] -= 1;
  if (toPlayer.shards[trade.toShardKey] <= 0) delete toPlayer.shards[trade.toShardKey];
  toPlayer.shards[trade.fromShardKey] = (toPlayer.shards[trade.fromShardKey] || 0) + 1;

  pendingTrades.delete(senderId);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `✅ *TRADE COMPLETE*\n${DIVIDER}\n` +
      `@${trade.from.split("@")[0]}'s *${trade.fromShardName}* → @${senderId.split("@")[0]}\n` +
      `@${senderId.split("@")[0]}'s *${trade.toShardName}* → @${trade.from.split("@")[0]}\n${DIVIDER}\n` +
      `Both vaults updated.`,
    mentions: [senderId, trade.from],
  }, { quoted: msg });
}

async function cmdTradeReject(ctx, chatId, senderId, msg) {
  const trade = pendingTrades.get(senderId);
  if (!trade) {
    return ctx.sock.sendMessage(chatId, { text: "❌ No pending trade." }, { quoted: msg });
  }
  pendingTrades.delete(senderId);
  return ctx.sock.sendMessage(chatId, {
    text: `🚫 *TRADE REJECTED*\n@${senderId.split("@")[0]} declined @${trade.from.split("@")[0]}'s offer.`,
    mentions: [senderId, trade.from],
  }, { quoted: msg });
}

async function cmdTradeList(ctx, chatId, senderId, msg) {
  const trade = pendingTrades.get(senderId);
  if (!trade) {
    return ctx.sock.sendMessage(chatId, { text: "📭 No pending trade for you." }, { quoted: msg });
  }
  const expiresIn = Math.max(0, Math.floor((trade.expiresAt - Date.now()) / 60000));
  return ctx.sock.sendMessage(chatId, {
    text:
      `📦 *PENDING TRADE*\n${DIVIDER}\n` +
      `From: @${trade.from.split("@")[0]}\n` +
      `They offer: *${trade.fromShardName}* shard\n` +
      `They want: your *${trade.toShardName}* shard\n` +
      `Expires in: *${expiresIn} min*\n${DIVIDER}\n` +
      `Respond with *.trade accept* or *.trade reject*.`,
    mentions: [trade.from],
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
  cmdTrade,
  cmdStorage,
  cmdPurify,
  cmdDestroy,
  cmdChooseShard,

  // helpers used by other systems
  ensureShardFields,
  dropShardOnDefeat,
  dropCorruptedShard,
  getCurrentMerge,
  isMerged,
  getMergedDisplayName,
  getMergeMoves,
  clearMergeStatusEffects,
  isMergeable,
  getMergeTier,
  shardKey,
  isCorruptedKey,
  stripCorrupted,
  getShardCount,
  getStorageCap,
  buildMergeSnapshot,

  // constants
  TIER_FULL,
  TIER_PARTIAL,
  DEFAULT_STORAGE_CAP,
  DROP_RATE_DEFEAT,
  DROP_RATE_SPAWN_CLAIM,
  CORRUPTED_SUFFIX,
  CORRUPTED_DMG_BONUS,
  CORRUPTED_BACKLASH_PCT,
  CORRUPTED_BACKLASH_FRAC,
  PURIFY_LUCONS_COST,
  DESTROY_RESONANCE,
  DESTROY_FACTION_PTS,
};

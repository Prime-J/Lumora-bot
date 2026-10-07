// ╔═══════════════════════════════════════════════════════════════╗
// ║  SHARDS — shard lifecycle, storage, trade, give               ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const CORRUPTED_SUFFIX        = "@corrupted";
const CORRUPTED_DMG_BONUS     = 0.25;
const CORRUPTED_BACKLASH_PCT  = 0.10;
const CORRUPTED_BACKLASH_FRAC = 0.06;
const TIER_FULL    = "full";
const TIER_PARTIAL = "partial";
const DEFAULT_STORAGE_CAP = 1;
const STORAGE_UPGRADE_BASE   = 500;
const STORAGE_UPGRADE_STEP   = 400;
const STORAGE_UPGRADE_GROWTH = 100;
const MAX_STORAGE_CAP        = 10;
const DROP_RATE_DEFEAT      = 0.80;
const DROP_RATE_SPAWN_CLAIM = 0.15;
const PURIFY_LUCONS_COST     = 0;
const DESTROY_RESONANCE      = 0;
const DESTROY_FACTION_PTS    = 0;

// ── helpers ───────────────────────────────────────────────────
function ensureShardFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.shards)          player.shards = {};
  if (!player.shardStorage)    player.shardStorage = {};
  if (!("currentMerge" in player)) player.currentMerge = null;
}
function shardKey(species, opts = {}) {
  if (!species) return null;
  const base = typeof species === "string" ? species.toLowerCase()
    : String(species.id ?? species.name ?? "").toLowerCase();
  return opts.corrupted ? `${base}${CORRUPTED_SUFFIX}` : base;
}
function isCorruptedKey(k) { return typeof k === "string" && k.endsWith(CORRUPTED_SUFFIX); }
function stripCorrupted(k) { return isCorruptedKey(k) ? k.slice(0, -CORRUPTED_SUFFIX.length) : k; }
function getMergeTier(s) { if (!s) return null; const m = s.merge; return m === TIER_FULL || m === TIER_PARTIAL ? m : null; }
function isMergeable(s) { return getMergeTier(s) != null; }
function getShardCount(player, key) { ensureShardFields(player); return Number(player.shards?.[key] || 0); }
function getStorageCap(player, key) { ensureShardFields(player); const c = Number(player.shardStorage?.[key] || 0); return Math.max(DEFAULT_STORAGE_CAP, c); }
function getStorageUpgrades(player, key) { ensureShardFields(player); return Math.max(0, Math.floor(Number(player.shardStorage?.[key] || 0)) - DEFAULT_STORAGE_CAP); }
function getStorageUpgradeCost(player, key) { if (getStorageCap(player, key) >= MAX_STORAGE_CAP) return null; const n = getStorageUpgrades(player, key); return STORAGE_UPGRADE_BASE + STORAGE_UPGRADE_STEP * n + STORAGE_UPGRADE_GROWTH * n * n; }
function findSpeciesByKey(loadMora, key) {
  if (!key) return null;
  const q = stripCorrupted(String(key).toLowerCase());
  const list = loadMora();
  const match = list.find(m => String(m.id).toLowerCase() === q || String(m.name).toLowerCase() === q);
  if (match) return match;
  const prefix = list.filter(m => String(m.name).toLowerCase().startsWith(q));
  if (prefix.length === 1) return prefix[0];
  const sub = list.filter(m => String(m.name).toLowerCase().includes(q));
  if (sub.length === 1) return sub[0];
  return null;
}
function resolveTargetJid(arg, players, mentionedJids = []) {
  if (mentionedJids && mentionedJids.length) return mentionedJids[0];
  const num = String(arg || "").replace(/^@/, "").replace(/[^0-9]/g, "");
  if (!num) return null;
  const keys = Object.keys(players);
  const exact = keys.find(j => j.split("@")[0] === num);
  if (exact) return exact;
  if (num.length >= 9) { const matches = keys.filter(j => j.startsWith(num)); if (matches.length === 1) return matches[0]; }
  return null;
}

// ── drop paths ─────────────────────────────────────────────────
function dropShardOnDefeat(player, species, opts = {}) {
  const rate = opts.forceDrop ? 1 : opts.source === "spawn" ? DROP_RATE_SPAWN_CLAIM : DROP_RATE_DEFEAT;
  return creditShard(player, species, rate);
}
function dropShardOnCatch(player, species, opts = {}) {
  const rate = opts.forceDrop ? 1 : Number.isFinite(opts.rate) ? opts.rate : DROP_RATE_SPAWN_CLAIM;
  return creditShard(player, species, rate);
}
function creditShard(player, species, rate) {
  if (!isMergeable(species)) return null;
  ensureShardFields(player);
  if (Math.random() > rate) return null;
  const key = shardKey(species);
  const cap = getStorageCap(player, key);
  const have = getShardCount(player, key);
  if (have >= cap) return `💎 A *${species.name}* shard crystallized — but your vault is full (*${have}/${cap}*). Buy +1 storage to keep more.`;
  player.shards[key] = have + 1;
  const tierTag = getMergeTier(species) === TIER_FULL ? " (FULL merge)" : "";
  return `💎 A *${species.name}* shard crystallized into your vault!${tierTag}\n   Use *.awaken ${species.name.toLowerCase()}* to shatter & merge.`;
}
function dropCorruptedShard(player, species) {
  if (!isMergeable(species)) return null;
  ensureShardFields(player);
  const key = shardKey(species, { corrupted: true });
  const cap = getStorageCap(player, key);
  const have = getShardCount(player, key);
  if (have >= cap) return `☠ A *corrupted ${species.name}* shard tried to crystallize — but your vault is full (*${have}/${cap}*). Buy +1 storage to keep more.`;
  player.shards[key] = have + 1;
  return `☠ A *CORRUPTED ${species.name}* shard pulses into your vault!\n   Awaken with *.awaken corrupted ${species.name.toLowerCase()}* — +25% damage, but unstable.`;
}

// ── merge state ────────────────────────────────────────────────
function getCurrentMerge(player) { ensureShardFields(player); return player.currentMerge || null; }
function isMerged(player) { return !!getCurrentMerge(player); }
function getMergedDisplayName(player, baseName = "") { const m = getCurrentMerge(player); return m ? `[${m.name}] ${baseName}`.trim() : baseName; }
function getMergeMoves(player) { const m = getCurrentMerge(player); return m && Array.isArray(m.moves) ? m.moves.slice() : []; }
function clearMergeStatusEffects(player) {
  if (!player) return;
  if (player.statusEffects) player.statusEffects = {};
  if (player.activeBuffs) player.activeBuffs = {};
  if (player.activeDebuffs) player.activeDebuffs = {};
  if (player.dots) player.dots = [];
  if (player.riftFury) delete player.riftFury;
}
function buildMergeSnapshot(species, opts = {}) {
  const tier = getMergeTier(species);
  const moveNames = species.moves ? Object.keys(species.moves) : [];
  return { moraId: species.id, name: species.name, type: species.type || null, tier, moves: moveNames, corrupted: !!opts.corrupted, awakenedAt: Date.now() };
}

// ── commands ───────────────────────────────────────────────────
async function cmdShards(ctx, chatId, senderId, msg) {
  const { sock, players, loadMora } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.register*." }, { quoted: msg });
  ensureShardFields(p);
  const entries = Object.entries(p.shards).filter(([, n]) => Number(n) > 0);
  if (!entries.length) {
    const merge = getCurrentMerge(p);
    return sock.sendMessage(chatId, {
      text: `💎 *SHARD VAULT*\n${DIVIDER}\n` +
        `_Empty. Defeat a mergeable Mora to crystallize its essence._\n\n` +
        `${DIVIDER}\n` +
        (merge ? `🌀 Currently merged with *${merge.name}*\n   _.shed to return to base form_\n` : `🩶 Base form — no merge active.\n`) +
        `\nShatter one with *.awaken <name>*  •  Trade later with *.trade*`
    }, { quoted: msg });
  }
  const list = loadMora();
  const lines = entries.map(([key, n]) => {
    const corrupted = isCorruptedKey(key);
    const base = stripCorrupted(key);
    const sp = list.find(m => String(m.id).toLowerCase() === base || String(m.name).toLowerCase() === base);
    const name = sp?.name || base;
    const tier = sp ? getMergeTier(sp) : null;
    const tierTag = tier === TIER_FULL ? "🔥 FULL" : tier === TIER_PARTIAL ? "✨ PARTIAL" : "";
    const corrTag = corrupted ? "☠ CORRUPTED" : "";
    const cap = getStorageCap(p, key);
    const badge = [tierTag, corrTag].filter(Boolean).join("  ");
    return `• ${name}${badge ? " " + badge : ""}  —  *${n}/${cap}*`;
  });
  const merge = getCurrentMerge(p);
  return sock.sendMessage(chatId, {
    text: `💎 *SHARD VAULT*\n${DIVIDER}\n` +
      lines.join("\n") +
      `\n\n${DIVIDER}\n` +
      (merge ? `🌀 Currently merged with *${merge.name}*  _(.shed to revert)_\n` : `🩶 Base form — no merge active.\n`) +
      `\nShatter one with *.awaken <name>*  •  Trade later with *.trade*`
  }, { quoted: msg });
}

async function cmdAwaken(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.register*." }, { quoted: msg });
  ensureShardFields(p);
  const tokens = args.map(a => String(a).trim()).filter(Boolean);
  let wantCorrupted = false;
  const filtered = tokens.filter(t => { if (t.toLowerCase() === "corrupted") { wantCorrupted = true; return false; } return true; });
  const queryRaw = filtered.join(" ").trim();
  if (!queryRaw) {
    return sock.sendMessage(chatId, {
      text: `🌀 *Usage:* *.awaken <shard name>* [corrupted]\nExamples: *.awaken Tideling*  •  *.awaken corrupted Nylon*\n\nView your vault with *.shards*.`
    }, { quoted: msg });
  }
  const species = findSpeciesByKey(loadMora, queryRaw);
  if (!species) return sock.sendMessage(chatId, { text: `❌ No unique Mora matches *${queryRaw}* — type the full name.` }, { quoted: msg });
  if (!isMergeable(species)) return sock.sendMessage(chatId, { text: `❌ *${species.name}* is not mergeable — its essence won't bond with a Lumorian.` }, { quoted: msg });
  const key = shardKey(species, { corrupted: wantCorrupted });
  const have = getShardCount(p, key);
  if (have < 1) {
    const variantLabel = wantCorrupted ? `corrupted *${species.name}*` : `*${species.name}*`;
    return sock.sendMessage(chatId, { text: `❌ You don't have a ${variantLabel} shard. Defeat one in the wild first.` }, { quoted: msg });
  }
  p.shards[key] = have - 1;
  if (p.shards[key] <= 0) delete p.shards[key];
  const previous = getCurrentMerge(p);
  clearMergeStatusEffects(p);
  p.currentMerge = buildMergeSnapshot(species, { corrupted: wantCorrupted });
  markEncountered(p, species);
  savePlayers(p);
  const tier = getMergeTier(species);
  const tierLine = tier === TIER_FULL ? `🔥 *FULL MERGE* — you ARE the ${species.name}.` : `✨ *PARTIAL MERGE* — you keep your form, gain its moveset.`;
  const corruptionLine = wantCorrupted ? `\n☠ *CORRUPTED* — +${Math.round(CORRUPTED_DMG_BONUS * 100)}% damage, ${Math.round(CORRUPTED_BACKLASH_PCT * 100)}% chance of instability backlash per move.` : "";
  return sock.sendMessage(chatId, {
    text: `${previous ? `🌪 The *${previous.name}* form shatters and reforms…\n` : `🌟 The crystal shatters…\n`}` +
      `💠 *AWAKENING — ${species.name}${wantCorrupted ? " ☠" : ""}*\n${DIVIDER}\n` +
      `${tierLine}${corruptionLine}\n` +
      (species.description ? `\n_${species.description}_\n` : "") +
      `${DIVIDER}\n` +
      `🎴 Moveset gained: ${p.currentMerge.moves.map(m => `*${m}*`).join(", ") || "_none_"}\n` +
      `\n💎 ${wantCorrupted ? "Corrupted s" : "S"}hards of *${species.name}* remaining: *${p.shards[key] || 0}*\n` +
      `_All previous buffs and debuffs were wiped clean.\n` +
      `\nUse *.attack* to see your full moveset  •  *.shed* to revert.`,
    mentions: [senderId],
  }, { quoted: msg });
}

async function cmdShed(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ You haven't awakened yet. Use *.register*." }, { quoted: msg });
  ensureShardFields(p);
  const merge = getCurrentMerge(p);
  if (!merge) return sock.sendMessage(chatId, { text: `🩶 You're already in base form — nothing to shed.` }, { quoted: msg });
  clearMergeStatusEffects(p);
  p.currentMerge = null;
  savePlayers(p);
  return sock.sendMessage(chatId, {
    text: `🍃 *SHED*\n${DIVIDER}\n` +
      `The *${merge.name}* form unravels and dissolves back into the rift.\n` +
      `You stand once more in your own skin — *punch*, *dodge*, *block*.\n` +
      `${DIVIDER}\n` +
      `_The shard is already spent. You'll need a new one to merge again._`
  }, { quoted: msg });
}

// ── P2P TRADE ──────────────────────────────────────────────────
const pendingTrades = new Map();
const TRADE_TTL_MS = 10 * 60 * 1000;

async function cmdTrade(ctx, chatId, senderId, msg, args = [], opts = {}) {
  const sub = String(args[0] || "").toLowerCase();
  if (sub === "accept") return cmdTradeAccept(ctx, chatId, senderId, msg);
  if (sub === "reject" || sub === "decline") return cmdTradeReject(ctx, chatId, senderId, msg);
  if (sub === "list" || sub === "pending") return cmdTradeList(ctx, chatId, senderId, msg);
  if (!sub || sub === "help") {
    return ctx.sock.sendMessage(chatId, {
      text: `🤝 *.trade* — shard exchange\n${DIVIDER}\n` +
        `• *.trade @user <yourShard> <theirShard>* — propose a trade\n` +
        `• *.trade accept* / *.trade reject* — answer an incoming offer\n` +
        `• *.trade list* — view your pending incoming offer\n` +
        `${DIVIDER}\n_Direct P2P only for now — public market board comes later._`
    }, { quoted: msg });
  }
  return cmdTradeOffer(ctx, chatId, senderId, msg, args, opts);
}

async function cmdTradeOffer(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock, players, loadMora } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const targetJid = resolveTargetJid(args[0], players, opts.mentionedJids || (opts.getMentionedJids ? opts.getMentionedJids(msg) : []));
  if (!targetJid || !players[targetJid]) {
    const looksNumeric = /[0-9]/.test(String(args[0] || ""));
    const hint = looksNumeric && !String(args[0] || "").includes("@") ? "\n_No unique player matches that number — use the full number or @mention them._" : "";
    return sock.sendMessage(chatId, { text: `❌ Usage: *.trade @user <yourShard> <theirShard>*\nExample: *.trade @1234 Nylon Voltrix*${hint}` }, { quoted: msg });
  }
  if (targetJid === senderId) return sock.sendMessage(chatId, { text: "❌ You can't trade with yourself." }, { quoted: msg });
  const existing = pendingTrades.get(targetJid);
  if (existing && existing.from !== senderId) {
    return sock.sendMessage(chatId, {
      text: `❌ @${targetJid.split("@")[0]} already has a pending offer from @${existing.from.split("@")[0]}. They must accept or reject it first.`,
      mentions: [senderId, targetJid, existing.from],
    }, { quoted: msg });
  }
  const myShardName = args[1], theirShardName = args[2];
  if (!myShardName || !theirShardName) return sock.sendMessage(chatId, { text: `❌ Usage: *.trade @user <yourShard> <theirShard>*` }, { quoted: msg });
  const mySpecies = findSpeciesByKey(loadMora, myShardName), theirSpecies = findSpeciesByKey(loadMora, theirShardName);
  if (!mySpecies) return sock.sendMessage(chatId, { text: `❌ No unique Mora matches *${myShardName}* — type the full name.` }, { quoted: msg });
  if (!theirSpecies) return sock.sendMessage(chatId, { text: `❌ No unique Mora matches *${theirShardName}* — type the full name.` }, { quoted: msg });
  ensureShardFields(p); ensureShardFields(players[targetJid]);
  const myKey = shardKey(mySpecies), theirKey = shardKey(theirSpecies);
  if (getShardCount(p, myKey) < 1) return sock.sendMessage(chatId, { text: `❌ You don't have a *${mySpecies.name}* shard.` }, { quoted: msg });
  if (getShardCount(players[targetJid], theirKey) < 1) return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]} doesn't have a *${theirSpecies.name}* shard.`, mentions: [targetJid] }, { quoted: msg });
  pendingTrades.set(targetJid, { from: senderId, fromShardKey: myKey, fromShardName: mySpecies.name, toShardKey: theirKey, toShardName: theirSpecies.name, chatId, expiresAt: Date.now() + TRADE_TTL_MS });
  return sock.sendMessage(chatId, {
    text: `🤝 *TRADE OFFER*\n${DIVIDER}\n` +
      `@${senderId.split("@")[0]} offers a *${mySpecies.name}* shard\n` +
      `↔ for @${targetJid.split("@")[0]}'s *${theirSpecies.name}* shard.\n${DIVIDER}\n` +
      `Recipient: respond with *.trade accept* or *.trade reject*.\nExpires in 10 minutes.`,
    mentions: [senderId, targetJid],
  }, { quoted: msg });
}

async function cmdTradeAccept(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const trade = pendingTrades.get(senderId);
  if (!trade) return sock.sendMessage(chatId, { text: "❌ No pending trade for you." }, { quoted: msg });
  if (Date.now() > trade.expiresAt) { pendingTrades.delete(senderId); return sock.sendMessage(chatId, { text: "❌ Trade expired." }, { quoted: msg }); }
  const fromPlayer = players[trade.from], toPlayer = players[senderId];
  if (!fromPlayer || !toPlayer) { pendingTrades.delete(senderId); return sock.sendMessage(chatId, { text: "❌ Trade participants no longer valid." }, { quoted: msg }); }
  ensureShardFields(fromPlayer); ensureShardFields(toPlayer);
  if (getShardCount(fromPlayer, trade.fromShardKey) < 1 || getShardCount(toPlayer, trade.toShardKey) < 1) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: "❌ Trade failed — one side no longer has the offered shard." }, { quoted: msg });
  }
  const fromIncomingCap = getStorageCap(fromPlayer, trade.toShardKey);
  const toIncomingCap = getStorageCap(toPlayer, trade.fromShardKey);
  const fromHas = getShardCount(fromPlayer, trade.toShardKey);
  const toHas = getShardCount(toPlayer, trade.fromShardKey);
  if (fromHas >= fromIncomingCap) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: `❌ Trade failed — sender's vault is full for *${trade.toShardName}* (${fromHas}/${fromIncomingCap}).` }, { quoted: msg });
  }
  if (toHas >= toIncomingCap) {
    pendingTrades.delete(senderId);
    return sock.sendMessage(chatId, { text: `❌ Trade failed — your vault is full for *${trade.fromShardName}* (${toHas}/${toIncomingCap}). Buy storage to accept.` }, { quoted: msg });
  }
  fromPlayer.shards[trade.fromShardKey] -= 1;
  if (fromPlayer.shards[trade.fromShardKey] <= 0) delete fromPlayer.shards[trade.fromShardKey];
  fromPlayer.shards[trade.toShardKey] = (fromPlayer.shards[trade.toShardKey] || 0) + 1;
  toPlayer.shards[trade.toShardKey] -= 1;
  if (toPlayer.shards[trade.toShardKey] <= 0) delete toPlayer.shards[trade.toShardKey];
  toPlayer.shards[trade.fromShardKey] = (toPlayer.shards[trade.fromShardKey] || 0) + 1;
  pendingTrades.delete(senderId);
  savePlayers(fromPlayer);
  savePlayers(toPlayer);
  return sock.sendMessage(chatId, {
    text: `✅ *TRADE COMPLETE*\n${DIVIDER}\n` +
      `@${trade.from.split("@")[0]}'s *${trade.fromShardName}* → @${senderId.split("@")[0]}\n` +
      `@${senderId.split("@")[0]}'s *${trade.toShardName}* → @${trade.from.split("@")[0]}\n${DIVIDER}\n` +
      `Both vaults updated.`,
    mentions: [senderId, trade.from],
  }, { quoted: msg });
}

async function cmdTradeReject(ctx, chatId, senderId, msg) {
  const trade = pendingTrades.get(senderId);
  if (!trade) return ctx.sock.sendMessage(chatId, { text: "❌ No pending trade." }, { quoted: msg });
  pendingTrades.delete(senderId);
  return ctx.sock.sendMessage(chatId, {
    text: `🚫 *TRADE REJECTED*\n@${senderId.split("@")[0]} declined @${trade.from.split("@")[0]}'s offer.`,
    mentions: [senderId, trade.from],
  }, { quoted: msg });
}

async function cmdTradeList(ctx, chatId, senderId, msg) {
  const trade = pendingTrades.get(senderId);
  if (!trade) return ctx.sock.sendMessage(chatId, { text: "📭 No pending trade for you." }, { quoted: msg });
  const expiresIn = Math.max(0, Math.floor((trade.expiresAt - Date.now()) / 60000));
  return ctx.sock.sendMessage(chatId, {
    text: `📦 *PENDING TRADE*\n${DIVIDER}\n` +
      `From: @${trade.from.split("@")[0]}\n` +
      `They offer: *${trade.fromShardName}* shard\n` +
      `They want: your *${trade.toShardName}* shard\n` +
      `Expires in: *${expiresIn} min*\n${DIVIDER}\n` +
      `Respond with *.trade accept* or *.trade reject*.`,
    mentions: [trade.from],
  }, { quoted: msg });
}

// ── INSTANT SHARD GIVE (.sgive) ────────────────────────────────
async function giveShards({ players, senderId, targetJid, myShardName, theirShardName, loadMora, sock, chatId, msg, savePlayers }) {
  const fromPlayer = players[senderId];
  const toPlayer = players[targetJid];
  ensureShardFields(fromPlayer);
  ensureShardFields(toPlayer);
  console.log('giveShards from shards', JSON.stringify(fromPlayer.shards));
  console.log('giveShards to shards', JSON.stringify(toPlayer.shards));
  if (!fromPlayer || !toPlayer) return { error: 'players must be provided as players[senderId] and players[targetJid]' };
  const myKey = shardKey(findSpeciesByKey(loadMora, myShardName));
  const theirKey = shardKey(findSpeciesByKey(loadMora, theirShardName));
  if (getShardCount(fromPlayer, myKey) < 1) return sock.sendMessage(chatId, { text: `❌ You don't have a *${myShardName}* shard.` }, { quoted: msg });
  if (getShardCount(toPlayer, theirKey) < 1) return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]} doesn't have a *${theirShardName}* shard.`, mentions: [targetJid] }, { quoted: msg });
  const fromInCap = getStorageCap(fromPlayer, theirKey);
  const toInCap = getStorageCap(toPlayer, myKey);
  if (getShardCount(fromPlayer, theirKey) >= fromInCap) return sock.sendMessage(chatId, { text: `❌ Your vault is full for *${theirShardName}* (${getShardCount(fromPlayer, theirKey)}/${fromInCap}).` }, { quoted: msg });
  if (getShardCount(toPlayer, myKey) >= toInCap) return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]}'s vault is full for *${myShardName}* (${getShardCount(toPlayer, myKey)}/${toInCap}). Buy storage to accept.` }, { quoted: msg });
  fromPlayer.shards[myKey] -= 1;
  if (fromPlayer.shards[myKey] <= 0) delete fromPlayer.shards[myKey];
  fromPlayer.shards[theirKey] = (fromPlayer.shards[theirKey] || 0) + 1;
  toPlayer.shards[theirKey] -= 1;
  if (toPlayer.shards[theirKey] <= 0) delete toPlayer.shards[theirKey];
  toPlayer.shards[myKey] = (toPlayer.shards[myKey] || 0) + 1;
  savePlayers(fromPlayer);
  savePlayers(toPlayer);
  return sock.sendMessage(chatId, {
    text: `✅ *SHARD SWAP COMPLETE*\n${DIVIDER}\n` +
      `@${senderId.split("@")[0]}'s *${myShardName}* → @${targetJid.split("@")[0]}\n` +
      `@${targetJid.split("@")[0]}'s *${theirShardName}* → @${senderId.split("@")[0]}\n${DIVIDER}\n` +
      `Both vaults updated.`,
    mentions: [senderId, targetJid],
  }, { quoted: msg });
}

async function cmdGive(ctx, chatId, senderId, msg, args = [], opts = {}) {
  const { sock, players, loadMora, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const sub = String(args[0] || "").toLowerCase();
  if (!sub || sub === "help") {
    return sock.sendMessage(chatId, {
      text: `🤝 *.sgive* — instant shard swap\n${DIVIDER}\n` +
        `• *.sgive @user <myShard> <theirShard>* — hand over one of each for one of theirs\n` +
        `• @mention, reply, or pass the bare number\n` +
        `${DIVIDER}\n_One-for-one instant swap — no pending offer._`,
      mentions: [senderId],
    }, { quoted: msg });
  }
  const mentionedJids = opts.getMentionedJids ? opts.getMentionedJids(msg) : (opts.mentionedJids || []);
  const repliedJid = opts.getRepliedJid ? opts.getRepliedJid(msg) : null;
  let targetJid = null;
  if (mentionedJids.length) targetJid = mentionedJids[0];
  else if (repliedJid) targetJid = repliedJid;
  else if (opts.toUserJidFromArg) targetJid = opts.toUserJidFromArg(args[0]);
  if (!targetJid) targetJid = resolveTargetJid(args[0], players, mentionedJids);
  if (!targetJid || !players[targetJid]) {
    const looksNumeric = /[0-9]/.test(String(args[0] || ""));
    const hint = looksNumeric && !String(args[0] || "").includes("@") ? "\n_No unique player matches that number — use the full number or @mention them._" : "";
    return sock.sendMessage(chatId, { text: `❌ Usage: *.sgive @user <myShard> <theirShard>*${hint}` }, { quoted: msg });
  }
  if (targetJid === senderId) return sock.sendMessage(chatId, { text: "❌ You can't .sgive with yourself." }, { quoted: msg });
  const myShardName = args[1], theirShardName = args[2];
  if (!myShardName || !theirShardName) return sock.sendMessage(chatId, { text: `❌ Usage: *.sgive @user <myShard> <theirShard>*` }, { quoted: msg });
  const mySpecies = findSpeciesByKey(loadMora, myShardName);
  const theirSpecies = findSpeciesByKey(loadMora, theirShardName);
  if (!mySpecies) return sock.sendMessage(chatId, { text: `❌ No unique Mora matches *${myShardName}* — type the full name.` }, { quoted: msg });
  if (!theirSpecies) return sock.sendMessage(chatId, { text: `❌ No unique Mora matches *${theirShardName}* — type the full name.` }, { quoted: msg });
  if (opts.needsAllowGive && !opts.needsAllowGive(chatId, senderId, targetJid)) {
    return sock.sendMessage(chatId, { text: "❌ Shard swaps aren't allowed in this chat." }, { quoted: msg });
  }
  return giveShards({ players, senderId, targetJid, myShardName, theirShardName, loadMora, sock, chatId, msg, savePlayers });
}

// ── mark encountered ───────────────────────────────────────────
function markEncountered(player, speciesOrId) {
  if (!player) return;
  if (!Array.isArray(player.dex)) player.dex = [];
  let id = null;
  if (speciesOrId && typeof speciesOrId === "object") id = speciesOrId.baseId ?? speciesOrId.id ?? speciesOrId.moraId ?? null;
  else id = speciesOrId;
  id = String(id ?? "").trim();
  if (id && !player.dex.includes(id)) player.dex.push(id);
}

module.exports = {
  cmdShards, cmdAwaken, cmdShed,
  cmdTrade, cmdTradeOffer, cmdTradeAccept, cmdTradeReject, cmdTradeList,
  cmdGive, giveShards,
  markEncountered,
  ensureShardFields, dropShardOnDefeat, dropShardOnCatch, dropCorruptedShard,
  getCurrentMerge, isMerged, getMergedDisplayName, getMergeMoves, clearMergeStatusEffects,
  isMergeable, getMergeTier, shardKey, isCorruptedKey, stripCorrupted,
  getShardCount, getStorageCap, getStorageUpgrades, getStorageUpgradeCost,
  buildMergeSnapshot,
  TIER_FULL, TIER_PARTIAL, DEFAULT_STORAGE_CAP, MAX_STORAGE_CAP,
  STORAGE_UPGRADE_BASE, DROP_RATE_DEFEAT, DROP_RATE_SPAWN_CLAIM,
  CORRUPTED_SUFFIX, CORRUPTED_DMG_BONUS, CORRUPTED_BACKLASH_PCT, CORRUPTED_BACKLASH_FRAC,
  PURIFY_LUCONS_COST, DESTROY_RESONANCE, DESTROY_FACTION_PTS,
};

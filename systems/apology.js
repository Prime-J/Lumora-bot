// ╔═══════════════════════════════════════════════════════════════╗
// ║  APOLOGY GIFT  v0.6.0                                          ║
// ║  Returning players (wiped at v0.6.0 launch) can claim a       ║
// ║  one-time gift starting 48 days post-launch:                   ║
// ║    • 500 Lucons                                                ║
// ║    • Player's pick of ONE rare/epic mergeable shard            ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SETTINGS_PATH = path.join(__dirname, "..", "data", "settings.json");

const GIFT_LUCONS = 500;
const GIFTABLE_RARITIES = new Set(["rare", "epic"]);

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); } catch { return {}; }
}

function getApologyAvailableAt() {
  const s = loadSettings();
  // Default: 48 days after 2026-05-27 (the v0.6.0 launch). Settings can override.
  return s.apologyAvailableAt
    ? new Date(s.apologyAvailableAt).getTime()
    : new Date("2026-07-14T00:00:00Z").getTime();
}

function isApologyOpen() {
  return Date.now() >= getApologyAvailableAt();
}

function getGiftableShards(loadMora) {
  return loadMora()
    .filter((m) => GIFTABLE_RARITIES.has(String(m.rarity || "").toLowerCase()))
    .filter((m) => m.merge === "full" || m.merge === "partial")
    .sort((a, b) => a.name.localeCompare(b.name));
}

function daysUntilOpen() {
  const ms = getApologyAvailableAt() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

// ══════════════════════════════════════════════════════════════
// .gift   — overview / status / sub-router
// ══════════════════════════════════════════════════════════════
async function cmdGift(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  }

  const sub = String(args[0] || "").toLowerCase();
  if (sub === "claim") {
    return cmdGiftClaim(ctx, chatId, senderId, msg, args.slice(1));
  }
  if (sub === "list" || sub === "shards") {
    return showGiftableShards(ctx, chatId, senderId, msg);
  }

  // Default: status + instructions
  const open = isApologyOpen();
  const claimed = !!player.apologyClaimed;
  const wiped = !!player.wipedAt;

  const lines = [`🎁 *APOLOGY GIFT*`, DIVIDER];

  if (!wiped) {
    lines.push(`_This gift is for players who survived the v0.6.0 reset._`);
    lines.push(`_You don't appear to be one — you joined after launch._`);
    return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
  }
  if (claimed) {
    lines.push(`✓ You already claimed your gift. Hope it served you well.`);
    return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
  }
  if (!open) {
    const d = daysUntilOpen();
    lines.push(`⏳ Not open yet — available in *${d}* day${d === 1 ? "" : "s"}.`);
    lines.push(`_The gift unlocks 48 days after launch, on ${new Date(getApologyAvailableAt()).toISOString().slice(0,10)}._`);
    lines.push(``);
    lines.push(`When it opens you'll receive:`);
    lines.push(`  💰 *${GIFT_LUCONS} Lucons*`);
    lines.push(`  💎 *1 rare or epic shard* of your choice`);
    return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
  }

  // Open + unclaimed
  lines.push(`✨ *The gift is open. Sorry for the wipe.*`);
  lines.push(``);
  lines.push(`You can claim ONCE:`);
  lines.push(`  💰 *${GIFT_LUCONS} Lucons*`);
  lines.push(`  💎 *1 rare/epic shard* of your choice`);
  lines.push(``);
  lines.push(`See picks: *.gift list*`);
  lines.push(`Claim:     *.gift claim <ShardName>*`);
  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

async function showGiftableShards(ctx, chatId, senderId, msg) {
  const { sock, loadMora } = ctx;
  const shards = getGiftableShards(loadMora);
  if (!shards.length) {
    return sock.sendMessage(chatId, { text: "❌ No giftable shards found in mora.json." }, { quoted: msg });
  }
  const lines = shards.map((m, i) => {
    const tier = m.merge === "full" ? "🔥FULL" : "✨PARTIAL";
    return `${i + 1}. *${m.name}*  _(${m.rarity}, ${m.type || "—"}, ${tier})_`;
  });
  return sock.sendMessage(chatId, {
    text:
      `💎 *GIFT SHARD PICKS*\n${DIVIDER}\n` +
      lines.join("\n") +
      `\n${DIVIDER}\n` +
      `Claim with *.gift claim <name>*  —  e.g. *.gift claim ${shards[0].name}*`,
  }, { quoted: msg });
}

async function cmdGiftClaim(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  }
  if (!player.wipedAt) {
    return sock.sendMessage(chatId, {
      text: `❌ This gift is for players who survived the v0.6.0 reset. You're not eligible.`,
    }, { quoted: msg });
  }
  if (player.apologyClaimed) {
    return sock.sendMessage(chatId, { text: `❌ You already claimed your apology gift.` }, { quoted: msg });
  }
  if (!isApologyOpen()) {
    const d = daysUntilOpen();
    return sock.sendMessage(chatId, {
      text: `⏳ The gift opens in *${d}* day${d === 1 ? "" : "s"}.`,
    }, { quoted: msg });
  }

  const queryRaw = args.join(" ").trim();
  if (!queryRaw) {
    return sock.sendMessage(chatId, {
      text: `❌ Pick a shard: *.gift claim <ShardName>*\nList them with *.gift list*.`,
    }, { quoted: msg });
  }

  // Resolve species against the giftable set. Exact name wins; prefix and
  // substring only resolve when unambiguous (M2, L-08) — a wrong pick would
  // otherwise be consumed forever.
  const giftable = getGiftableShards(loadMora);
  const q = queryRaw.toLowerCase();
  let species = giftable.find((m) => m.name.toLowerCase() === q);
  if (!species) {
    const prefixes = giftable.filter((m) => m.name.toLowerCase().startsWith(q));
    if (prefixes.length === 1) species = prefixes[0];
  }
  if (!species) {
    const subs = giftable.filter((m) => m.name.toLowerCase().includes(q));
    if (subs.length === 1) species = subs[0];
  }
  if (!species) {
    return sock.sendMessage(chatId, {
      text: `❌ *${queryRaw}* isn't on the rare/epic gift list, or it's ambiguous. Use the full name from *.gift list*.`,
    }, { quoted: msg });
  }

  // Grant Lucons
  player.lucons = Number(player.lucons || 0) + GIFT_LUCONS;

  // Grant shard via shardSystem so cap is respected. The gift must never
  // be consumed on failure (M2, L-04): if the shard can't be delivered we
  // roll the Lucons back and leave the claim unmarked.
  let shardLine = "";
  try {
    const shardSystem = require("./shards");
    shardSystem.ensureShardFields(player);
    const key = shardSystem.shardKey(species);
    const before = shardSystem.getShardCount(player, key);
    // Bypass the random drop check — use forceDrop:true to guarantee delivery
    const dropMsg = shardSystem.dropShardOnDefeat(player, species, { forceDrop: true });
    if (shardSystem.getShardCount(player, key) <= before) {
      throw new Error(`vault full for ${species.name} (${shardSystem.getShardCount(player, key)}/${shardSystem.getStorageCap(player, key)})`);
    }
    shardLine = dropMsg || `💎 *${species.name}* shard added to your vault.`;
  } catch (e) {
    player.lucons = Number(player.lucons || 0) - GIFT_LUCONS;
    return sock.sendMessage(chatId, {
      text: `❌ Gift delivery failed — *nothing was consumed*, try again or pick another shard.\n_(reason: ${e?.message || e})_`,
    }, { quoted: msg });
  }

  player.apologyClaimed = true;
  player.apologyClaimedAt = new Date().toISOString();
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `✨ *GIFT CLAIMED*\n${DIVIDER}\n` +
      `💰 *+${GIFT_LUCONS} Lucons*  _(total: ${player.lucons})_\n` +
      `${shardLine}\n${DIVIDER}\n` +
      `_Thank you for sticking with Lumora through the rework. Go shatter something._`,
  }, { quoted: msg });
}

module.exports = {
  cmdGift,
  cmdGiftClaim,
  isApologyOpen,
  getApologyAvailableAt,
  daysUntilOpen,
  getGiftableShards,
  GIFT_LUCONS,
};

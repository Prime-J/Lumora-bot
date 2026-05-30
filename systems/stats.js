// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA STAT-POINT SYSTEM  v0.6.0                             ║
// ║  5 categories distributed by player:                          ║
// ║    Melee     — +base/style damage                             ║
// ║    Mora      — +merge damage (the mora's power within you)    ║
// ║    Vitality  — +max HP                                        ║
// ║    Speed     — +dodge chance                                  ║
// ║    Defense   — flat damage reduction taken                    ║
// ║  3 points granted per level up.                               ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

// Point grant per level up (decided 2026-05-28: 3/level, max player level 100)
const POINTS_PER_LEVEL = 3;

// Per-point effect magnitudes (kept here so combat code references one source)
const MELEE_DMG_PER_POINT   = 2;     // +2 damage on base/style hit
const MORA_DMG_PER_POINT    = 2;     // +2 damage on merge hit
const VIT_HP_PER_POINT      = 5;     // +5 max HP per point invested
const SPEED_DODGE_PER_POINT = 0.01;  // +1% dodge per point
const SPEED_DODGE_CAP       = 0.50;  // 50% max
const DEF_REDUCTION_PER_POINT = 1.5; // -1.5 damage taken per point (floored to >=1)

const CATEGORIES = ["melee", "mora", "vit", "speed", "def"];
const CATEGORY_ALIASES = {
  melee: "melee", m: "melee",
  mora: "mora",
  vit: "vit", vitality: "vit", v: "vit", hp: "vit",
  speed: "speed", spd: "speed", s: "speed",
  def: "def", defense: "def", defence: "def", d: "def",
};

function ensureStatFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.stats || typeof player.stats !== "object") {
    player.stats = { melee: 0, mora: 0, vit: 0, speed: 0, def: 0 };
  } else {
    for (const c of CATEGORIES) {
      if (typeof player.stats[c] !== "number") player.stats[c] = 0;
    }
  }
  if (typeof player.statPoints !== "number") player.statPoints = 0;
}

function getCategory(input) {
  const k = String(input || "").toLowerCase();
  return CATEGORY_ALIASES[k] || null;
}

// ── Derived combat stats ──
function meleeDamageBonus(player)   { ensureStatFields(player); return Number(player.stats.melee) * MELEE_DMG_PER_POINT; }
function moraDamageBonus(player)    { ensureStatFields(player); return Number(player.stats.mora)  * MORA_DMG_PER_POINT; }
function vitHpBonus(player)         { ensureStatFields(player); return Number(player.stats.vit)   * VIT_HP_PER_POINT; }
function dodgeChance(player) {
  ensureStatFields(player);
  return Math.min(SPEED_DODGE_CAP, Number(player.stats.speed) * SPEED_DODGE_PER_POINT);
}
function defenseReduction(player)   { ensureStatFields(player); return Number(player.stats.def)   * DEF_REDUCTION_PER_POINT; }

// ── Level-up hook (called when xpSystem reports a level gain) ──
function grantPointsForLevels(player, levelsGained = 1) {
  if (!Number.isFinite(levelsGained) || levelsGained <= 0) return 0;
  ensureStatFields(player);
  const grant = POINTS_PER_LEVEL * levelsGained;
  player.statPoints = Number(player.statPoints || 0) + grant;
  return grant;
}

// Vitality investments raise max HP immediately AND heal the difference.
function applyVitInvest(player, pointsInvested) {
  if (!pointsInvested) return 0;
  ensureStatFields(player);
  const gain = VIT_HP_PER_POINT * pointsInvested;
  player.playerMaxHp = Number(player.playerMaxHp || 100) + gain;
  player.playerHp    = Math.min(Number(player.playerHp || 0) + gain, player.playerMaxHp);
  return gain;
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

async function cmdStats(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureStatFields(player);

  const sub = String(args[0] || "").toLowerCase();
  if (sub === "invest" || sub === "i" || sub === "spend") {
    return cmdStatsInvest(ctx, chatId, senderId, msg, args.slice(1));
  }
  if (sub === "help") {
    return sock.sendMessage(chatId, {
      text:
        `📊 *.stats* — view & distribute stat points\n${DIVIDER}\n` +
        `• *.stats* — show your stats + unspent points\n` +
        `• *.stats invest <cat> <n>* — distribute N points to a category\n` +
        `  cats: *melee*, *mora*, *vit*, *speed*, *def*\n` +
        `  e.g. *.stats invest melee 3*\n${DIVIDER}\n` +
        `Each level up grants *${POINTS_PER_LEVEL}* points to distribute.`,
    }, { quoted: msg });
  }

  // Render
  const lines = [
    `📊 *YOUR STATS*  _Level ${player.level || 1}_`,
    DIVIDER,
    `⚔️ Melee: *${player.stats.melee}*  _(+${meleeDamageBonus(player)} dmg on base/style hits)_`,
    `🌀 Mora:  *${player.stats.mora}*  _(+${moraDamageBonus(player)} dmg on merge hits)_`,
    `❤️ Vit:   *${player.stats.vit}*  _(+${vitHpBonus(player)} max HP)_`,
    `💨 Speed: *${player.stats.speed}*  _(${Math.round(dodgeChance(player) * 100)}% dodge)_`,
    `🛡 Def:   *${player.stats.def}*  _(-${defenseReduction(player)} dmg taken)_`,
    DIVIDER,
    `🎯 *Unspent points: ${player.statPoints}*`,
    player.statPoints > 0
      ? `Use *.stats invest <cat> <n>* to distribute.`
      : `_Level up to earn more points._`,
  ];
  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

async function cmdStatsInvest(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  ensureStatFields(player);

  const cat = getCategory(args[0]);
  if (!cat) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.stats invest <melee|mora|vit|speed|def> <n>*\nExample: *.stats invest melee 3*`,
    }, { quoted: msg });
  }
  const n = parseInt(args[1], 10);
  if (!Number.isFinite(n) || n <= 0) {
    return sock.sendMessage(chatId, { text: `❌ N must be a positive integer.` }, { quoted: msg });
  }
  if (player.statPoints < n) {
    return sock.sendMessage(chatId, {
      text: `❌ Not enough points. You have *${player.statPoints}*, tried to spend *${n}*.`,
    }, { quoted: msg });
  }

  player.stats[cat] = Number(player.stats[cat] || 0) + n;
  player.statPoints -= n;

  let extraLine = "";
  if (cat === "vit") {
    const hpGain = applyVitInvest(player, n);
    extraLine = `\n❤️ Max HP increased by *${hpGain}* (now ${player.playerMaxHp}). Healed.`;
  }

  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `✅ *INVESTED* — +${n} ${cat.toUpperCase()}\n${DIVIDER}\n` +
      `New ${cat}: *${player.stats[cat]}*\n` +
      `Unspent: *${player.statPoints}*` +
      extraLine,
  }, { quoted: msg });
}

module.exports = {
  // commands
  cmdStats,
  cmdStatsInvest,

  // helpers
  ensureStatFields,
  grantPointsForLevels,
  applyVitInvest,
  meleeDamageBonus,
  moraDamageBonus,
  vitHpBonus,
  dodgeChance,
  defenseReduction,

  // constants
  POINTS_PER_LEVEL,
  MELEE_DMG_PER_POINT,
  MORA_DMG_PER_POINT,
  VIT_HP_PER_POINT,
  SPEED_DODGE_PER_POINT,
  SPEED_DODGE_CAP,
  DEF_REDUCTION_PER_POINT,
  CATEGORIES,
};

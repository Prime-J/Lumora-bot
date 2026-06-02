// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA STAT-POINT SYSTEM  v0.9.0                              ║
// ║  4 categories distributed by player:                          ║
// ║    Melee     — +base/style damage  AND  +combat-energy max    ║
// ║    Mora      — +merge damage (the Mora's power within you)    ║
// ║    Vitality  — +max HP (absorbed the old Defense stat;         ║
// ║                more HP IS the defense now)                     ║
// ║    Speed     — +dodge chance                                   ║
// ║  3 points granted per level up. Per-stat cap 100.              ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

// Point grant per level up (decided 2026-05-28: 3/level, max player level 100)
const POINTS_PER_LEVEL = 3;

// Per-point effect magnitudes (kept here so combat code references one source)
const MELEE_DMG_PER_POINT    = 2;     // +2 damage on base/style hit
const MELEE_ENERGY_PER_POINT = 1;     // +1 combat-energy max per point (stamina scales with dedication)
const MORA_DMG_PER_POINT     = 2;     // +2 damage on merge hit
const VIT_HP_PER_POINT       = 10;    // +10 max HP per point invested (v0.8.1 rebalance)
const SPEED_DODGE_PER_POINT  = 0.01;  // +1% dodge per point
const SPEED_DODGE_CAP        = 0.50;  // 50% max
// v0.9.0: Def merged into Vit. defenseReduction() kept as no-op for
// backward compatibility with any legacy callers.

// v0.8.1: per-stat investment cap. You cannot invest more than 100 points
// into any single stat. With 3 pts/level and level cap 100 you'd get 297
// points total — enough to fully max ~3 stats, not all 5.
const PER_STAT_CAP = 100;

const CATEGORIES = ["melee", "mora", "vit", "speed"];
const CATEGORY_ALIASES = {
  melee: "melee", m: "melee",
  mora: "mora",
  vit: "vit", vitality: "vit", v: "vit", hp: "vit",
  speed: "speed", spd: "speed", s: "speed",
  // Legacy aliases — silently redirected to Vit
  def: "vit", defense: "vit", defence: "vit", d: "vit",
};

// v0.9.0 — every stat seeds at 1, not 0. Gives new players a baseline +2 dmg,
// +1 stamina, +10 HP, +1% dodge before they invest anything.
function ensureStatFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.stats || typeof player.stats !== "object") {
    player.stats = { melee: 1, mora: 1, vit: 1, speed: 1 };
  } else {
    for (const c of CATEGORIES) {
      if (typeof player.stats[c] !== "number") player.stats[c] = 1;
    }
    // Migrate legacy Def → Vit if present
    if (typeof player.stats.def === "number" && player.stats.def > 0) {
      player.stats.vit = Number(player.stats.vit || 0) + player.stats.def;
      delete player.stats.def;
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
// v0.9.0: Def merged into Vit. This helper returns 0 so any lingering callers
// (older paths, smoke tests) continue to work without bumping damage.
function defenseReduction(_player) { return 0; }

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

// Melee investments raise the combat-energy max (stamina) AND refill to new max.
function applyMeleeInvest(player, pointsInvested) {
  if (!pointsInvested) return 0;
  ensureStatFields(player);
  const gain = MELEE_ENERGY_PER_POINT * pointsInvested;
  if (typeof player.combatMaxEnergy !== "number") player.combatMaxEnergy = 50;
  player.combatMaxEnergy += gain;
  if (typeof player.combatEnergy !== "number") player.combatEnergy = player.combatMaxEnergy;
  else player.combatEnergy = Math.min(player.combatMaxEnergy, Number(player.combatEnergy) + gain);
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
        `• *.invest <cat> <n>* — quick distribute\n` +
        `  cats: *melee*, *mora*, *vit*, *speed*\n` +
        `  e.g. *.invest mora 5*\n${DIVIDER}\n` +
        `Each level up grants *${POINTS_PER_LEVEL}* points to distribute.`,
    }, { quoted: msg });
  }

  // Render
  const lines = [
    `╭──────────────────────╮`,
    `│  📊  *YOUR STATS*       │`,
    `│  _Lv ${String(player.level || 1).padEnd(3)}                  │`,
    `╰──────────────────────╯`,
    ``,
    `⚔️  *Melee*  ${player.stats.melee}`,
    `   +${meleeDamageBonus(player)} dmg  •  +${player.stats.melee * MELEE_ENERGY_PER_POINT} stamina`,
    ``,
    `🌀  *Mora*   ${player.stats.mora}`,
    `   +${moraDamageBonus(player)} dmg on merge hits`,
    ``,
    `❤️  *Vit*    ${player.stats.vit}`,
    `   +${vitHpBonus(player)} max HP  _(${player.playerMaxHp || 100} total)_`,
    ``,
    `💨  *Speed*  ${player.stats.speed}`,
    `   ${Math.round(dodgeChance(player) * 100)}% dodge chance`,
    ``,
    DIVIDER,
    player.statPoints > 0
      ? `🎯  *${player.statPoints}* unspent — drop them with:\n   *.invest <melee|mora|vit|speed> <n>*\n   _shortcut: .invest m 3  •  .invest v 5_`
      : `_All points spent. Level up to earn more._`,
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
      text: `❌ Usage: *.invest <melee|mora|vit|speed> <n>*\nExample: *.invest melee 3*`,
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
  const current = Number(player.stats[cat] || 0);
  if (current + n > PER_STAT_CAP) {
    const room = Math.max(0, PER_STAT_CAP - current);
    return sock.sendMessage(chatId, {
      text:
        `❌ ${cat.toUpperCase()} caps at *${PER_STAT_CAP}*. You're at *${current}* — only *${room}* more allowed.`,
    }, { quoted: msg });
  }

  player.stats[cat] = current + n;
  player.statPoints -= n;

  let extraLine = "";
  if (cat === "vit") {
    const hpGain = applyVitInvest(player, n);
    extraLine = `\n❤️ Max HP increased by *${hpGain}* (now ${player.playerMaxHp}). Healed.`;
  } else if (cat === "melee") {
    const energyGain = applyMeleeInvest(player, n);
    extraLine = `\n🔋 Combat-energy max increased by *${energyGain}* (now ${player.combatMaxEnergy}). Stamina bar refilled.`;
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
  applyMeleeInvest,
  meleeDamageBonus,
  moraDamageBonus,
  vitHpBonus,
  dodgeChance,
  defenseReduction,

  // constants
  POINTS_PER_LEVEL,
  PER_STAT_CAP,
  MELEE_DMG_PER_POINT,
  MELEE_ENERGY_PER_POINT,
  MORA_DMG_PER_POINT,
  VIT_HP_PER_POINT,
  SPEED_DODGE_PER_POINT,
  SPEED_DODGE_CAP,
  CATEGORIES,
};

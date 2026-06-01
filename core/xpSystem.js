// core/xpSystem.js

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

// XP needed to go from level L -> L+1
function xpToNextLevel(level) {
  const lv = Math.max(1, Number(level || 1));
  return 50 + lv * lv * 10;
}

// Pull base stats safely
function getBaseStats(species) {
  return species?.baseStats && typeof species.baseStats === "object"
    ? species.baseStats
    : {};
}

// Base energy per Mora species
function getBaseEnergy(species) {
  const base = getBaseStats(species);

  const raw =
    base.energy ??
    base.en ??
    species?.baseEnergy ??
    species?.energy ??
    30;

  const baseEnergy = Number(raw);
  if (!Number.isFinite(baseEnergy) || baseEnergy <= 0) return 30;

  return clamp(baseEnergy, 10, 200);
}

// Energy growth per level
function getEnergyGrowth(species) {
  const base = getBaseStats(species);

  const raw =
    base.energyGrowth ??
    base.enGrowth ??
    species?.energyGrowth ??
    null;

  const g = Number(raw);

  if (Number.isFinite(g) && g > 0) return clamp(g, 1, 10);

  const baseEnergy = getBaseEnergy(species);
  const auto = 2 + Math.floor((baseEnergy - 30) / 20);

  return clamp(auto, 1, 6);
}

// Max energy scales with level
function calcMaxEnergy(species, level) {
  const lv = Math.max(1, Number(level || 1));
  const baseEnergy = getBaseEnergy(species);
  const growth = getEnergyGrowth(species);

  const maxE = baseEnergy + (lv - 1) * growth;

  return clamp(Math.floor(maxE), 10, 999);
}

// Apply level scaling to Mora stats
function applyLevelScaling(ownedMora, species) {
  if (!ownedMora || typeof ownedMora !== "object") return ownedMora;

  const lv = Math.max(1, Number(ownedMora.level || 1));
  const base = getBaseStats(species);

  const atk = Number(base.atk ?? 10) + lv * 2;
  const def = Number(base.def ?? 10) + lv * 2;
  const spd = Number(base.spd ?? 10) + lv * 1;

  const maxHp = Number(base.hp ?? 50) + lv * 3;

  const maxEnergy = calcMaxEnergy(species, lv);

  ownedMora.stats = {
    atk,
    def,
    spd,
    energy: maxEnergy,
  };

  ownedMora.maxHp = maxHp;
  ownedMora.maxEnergy = maxEnergy;

  if (typeof ownedMora.hp !== "number" || !Number.isFinite(ownedMora.hp)) {
    ownedMora.hp = maxHp;
  }

  if (ownedMora.hp > maxHp) ownedMora.hp = maxHp;
  if (ownedMora.hp < 0) ownedMora.hp = 0;

  if (typeof ownedMora.energy !== "number" || !Number.isFinite(ownedMora.energy)) {
    ownedMora.energy = maxEnergy;
  } else {
    ownedMora.energy = clamp(ownedMora.energy, 0, maxEnergy);
  }

  if (typeof ownedMora.xp !== "number" || !Number.isFinite(ownedMora.xp)) {
    ownedMora.xp = 0;
  }

  ownedMora.level = lv;

  return ownedMora;
}

// Add XP to Mora and handle level ups
function addMoraXp(ownedMora, species, amount) {
  if (!ownedMora || typeof ownedMora !== "object") {
    return { leveledUp: false, levelsGained: 0 };
  }

  const gain = Number(amount || 0);
  if (!Number.isFinite(gain) || gain <= 0) {
    return { leveledUp: false, levelsGained: 0 };
  }

  if (typeof ownedMora.xp !== "number") ownedMora.xp = 0;
  if (typeof ownedMora.level !== "number" || ownedMora.level < 1) {
    ownedMora.level = 1;
  }

  ownedMora.xp += gain;

  let levelsGained = 0;

  while (ownedMora.xp >= xpToNextLevel(ownedMora.level)) {
    ownedMora.xp -= xpToNextLevel(ownedMora.level);
    ownedMora.level += 1;
    levelsGained++;
  }

  applyLevelScaling(ownedMora, species);

  return {
    leveledUp: levelsGained > 0,
    levelsGained,
  };
}

// ----------------------------
// PLAYER XP SYSTEM
// ----------------------------

// v0.7.0 rebalance: linear curve. Roughly ~20-30 hunts per level at any tier.
// Level cap = 100. At 100, XP overflow is discarded and no further levels accrue.
const MAX_PLAYER_LEVEL = 100;
function playerXpToNextLevel(level) {
  const lv = Math.max(1, Number(level || 1));
  if (lv >= MAX_PLAYER_LEVEL) return Infinity;
  return 100 * lv + 50;
}

function addPlayerXp(player, amount) {
  if (!player) return { leveledUp: false, levels: 0 };

  const baseGain = Number(amount || 0);
  if (!Number.isFinite(baseGain) || baseGain <= 0) {
    return { leveledUp: false, levels: 0 };
  }

  // 0.1.3 — ±15% jitter so progress never feels mechanical. Same hunt path
  // doesn't always cough up the same XP number.
  const gain = Math.max(1, Math.floor(baseGain * (0.85 + Math.random() * 0.30)));

  if (typeof player.xp !== "number") player.xp = 0;
  if (typeof player.level !== "number") player.level = 1;

  const oldLevel = player.level;

  // Already at cap — discard the XP entirely so it doesn't pool.
  if (player.level >= MAX_PLAYER_LEVEL) {
    player.xp = 0;
    return { leveledUp: false, levels: 0, actualGain: 0, rankUp: null, statPointsGranted: 0 };
  }

  player.xp += gain;

  let levels = 0;
  while (player.level < MAX_PLAYER_LEVEL && player.xp >= playerXpToNextLevel(player.level)) {
    player.xp -= playerXpToNextLevel(player.level);
    player.level += 1;
    levels++;
  }
  // At cap — drain any leftover XP so the bar isn't stuck stuffed.
  if (player.level >= MAX_PLAYER_LEVEL) player.xp = 0;

  // 0.1.3 — rank-up detection. Returns rank info on the result so callers
  // (or the central tick) can fire the rank-up canvas reveal.
  let rankUp = null;
  if (levels > 0) {
    try {
      const ranks = require("../systems/ranks");
      const detect = ranks.detectRankUp(oldLevel, player.level);
      if (detect.crossed) rankUp = detect;
    } catch {}
  }

  // v0.6.0 — grant stat points for each level gained.
  let statPointsGranted = 0;
  if (levels > 0) {
    try {
      const stats = require("../systems/stats");
      statPointsGranted = stats.grantPointsForLevels(player, levels);
    } catch {}
    // v0.8.1 — combat-energy max gradually grows with level. +1 max
    // stamina per level gained. If the bar was already full, top it off.
    if (typeof player.combatMaxEnergy !== "number") player.combatMaxEnergy = 50;
    if (typeof player.combatEnergy    !== "number") player.combatEnergy    = player.combatMaxEnergy;
    const wasFull = player.combatEnergy >= player.combatMaxEnergy;
    player.combatMaxEnergy += levels;
    if (wasFull) player.combatEnergy = player.combatMaxEnergy;
  }

  return {
    leveledUp: levels > 0,
    levels,
    actualGain: gain,
    rankUp,
    statPointsGranted,
  };
}

module.exports = {
  xpToNextLevel,
  applyLevelScaling,
  addMoraXp,

  addPlayerXp,
  playerXpToNextLevel,
  MAX_PLAYER_LEVEL,

  getBaseEnergy,
  getEnergyGrowth,
  calcMaxEnergy,
};
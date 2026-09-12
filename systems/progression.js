// ══════════════════════════════════════════════════════════════════════════════
// LUMORA PROGRESSION ENGINE v1.1
// ══════════════════════════════════════════════════════════════════════════════
// Centralized system for all progression mechanics:
// - DΞP (XP) reward calculations (use xpSystem.addPlayerXp to apply)
// - Honor / Bounty / Resonance (faction PvP stats)
// - PvP reward scaling with anti-farm
// - Death penalty system (NPC + PvP)
// - Arena reward calculations
// - Leaderboard scoring
//
// DO NOT hardcode formulas in individual commands. Use this module.
// ══════════════════════════════════════════════════════════════════════════════
"use strict";

const fs = require("fs");
const path = require("path");

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CONFIGURATION
// All tunable values in one place. Adjust these to rebalance progression.
// ══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // ── DΞP (XP) SYSTEM ──────────────────────────────────────────────────────
  xp: {
    baseXP: 100,           // Base XP requirement at level 1
    exponent: 1.55,        // Scaling exponent (XP_REQUIRED = baseXP × level^exponent)
    maxLevel: 100,         // Maximum player level
    jitterPct: 0.15,       // ±15% random jitter on XP rewards
    underdogBonus: 1.25,   // 25% bonus when fighting enemies 5+ levels higher
    underdogThreshold: 5,  // Level difference required for underdog bonus
    lowLevelPenalty: true, // Enable anti-farm against low-level enemies
    lowLevelThreshold: 10, // Enemy must be within this many levels to give full XP
    lowLevelReduction: 0.2, // XP multiplier for enemies 10+ levels below player
  },

  // ── FACTION PvP STATS (HONOR / BOUNTY / RESONANCE) ───────────────────────
  factionStats: {
    cap: 2500000,              // Maximum value (2.5 million)
    startingValue: 0,          // New players start at 0
    npcDeathLossPercent: 0.02, // 2% loss on NPC death
    npcDeathLossMin: 100,      // Minimum loss
    npcDeathLossMax: 50000,    // Maximum loss per death
    pvpDeathLossPercent: 0.01, // 1% loss on PvP death
    pvpDeathLossMin: 50,       // Minimum PvP death loss
    pvpDeathLossMax: 25000,    // Maximum PvP death loss
  },

  // ── PvP REWARD SCALING ───────────────────────────────────────────────────
  pvp: {
    baseReward: 100,              // Base reward for a PvP win
    repeatedKillReduction: true,  // Enable diminishing returns on repeated kills
    repeatedKillDecay: 0.5,       // 50% reduction per repeated kill (stacks)
    repeatedKillReset: 24,        // Hours until repeated kill penalty resets
    levelScaling: true,           // Enable level-based scaling
    levelScalingFactor: 0.02,     // 2% bonus/penalty per level difference
    opponentValueScaling: true,   // Scale rewards based on opponent's faction stat
    opponentValueFactor: 0.3,     // How much opponent's value influences reward
    underdogBonus: true,          // Bonus for beating stronger opponents
    underdogMultiplier: 1.5,      // 50% bonus for underdog wins
    underdogThreshold: 0.2,       // 20% value difference triggers underdog
    farmingPenalty: true,         // Penalty for farming much weaker players
    farmingThreshold: 0.5,        // Opponent must have at least 50% of winner's value
    farmingMultiplier: 0.3,       // 70% reduction if opponent is too weak
    capApproachReduction: true,   // Reduce rewards near the cap
    capApproachStart: 0.8,        // Start reducing at 80% of cap
    capApproachMultiplier: 0.5,   // 50% reduction at 80%+ of cap
  },

  // ── BOSS REWARDS ─────────────────────────────────────────────────────────
  boss: {
    baseDEPReward: 500,       // Base DΞP from boss
    baseLuconReward: 1000,    // Base Lucons from boss
    baseFactionReward: 200,   // Base Honor/Bounty/Resonance from boss
    levelScalingFactor: 0.1,  // 10% bonus per level above player
    tierMultipliers: {        // Multiplier by boss tier
      1: 1.0,
      2: 1.5,
      3: 2.0,
      4: 3.0,
      5: 5.0,
    },
    underdogBonus: 1.5,       // 50% bonus if boss is 5+ levels higher
    underdogThreshold: 5,
  },

  // ── HUNTING GROUND REWARDS ───────────────────────────────────────────────
  hunting: {
    baseDEPReward: 50,        // Base DΞP from hunting
    difficultyMultipliers: {   // Multiplier by terrain difficulty
      safe: 1.0,
      normal: 1.5,
      dangerous: 2.0,
      nightmare: 3.0,
    },
    levelScalingFactor: 0.05, // 5% bonus per level above terrain requirement
    corruptionBonus: 1.25,    // 25% bonus for corrupted encounters
  },

  // ── ARENA REWARDS ────────────────────────────────────────────────────────
  arena: {
    baseDEPReward: 75,        // Base DΞP from arena NPC
    difficultyMultipliers: {   // Multiplier by NPC difficulty
      easy: 1.0,
      medium: 1.5,
      hard: 2.5,
      elite: 4.0,
      boss: 6.0,
    },
  },

  // ── LEADERBOARD ──────────────────────────────────────────────────────────
  leaderboard: {
    maxEntries: 10,
    // Scoring weights for global leaderboard (normalized)
    globalWeights: {
      factionStat: 0.4,   // 40% weight on Honor/Bounty/Resonance
      level: 0.2,         // 20% weight on level
      dep: 0.2,           // 20% weight on DΞP
      lucons: 0.1,        // 10% weight on Lucons
      tamed: 0.1,         // 10% weight on tamed Mora count
    },
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function jitter(value, pct) {
  const factor = 1 + (Math.random() * 2 - 1) * pct;
  return Math.max(1, Math.floor(value * factor));
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — DΞP (XP) SYSTEM
// Scalable XP curve: XP_REQUIRED = baseXP × level^exponent
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate XP required to reach the next level.
 * @param {number} level - Current level
 * @returns {number} XP required for next level
 */
function calculateXPRequired(level) {
  const lv = Math.max(1, Number(level || 1));
  if (lv >= CONFIG.xp.maxLevel) return Infinity;
  return Math.floor(CONFIG.xp.baseXP * Math.pow(lv, CONFIG.xp.exponent));
}

/**
 * Calculate DΞP reward for defeating an enemy/NPC.
 * Factors: player level, enemy level, difficulty, boss status, underdog bonus.
 * @param {object} player - Player object
 * @param {object} enemy - Enemy object { level, difficulty, isBoss, ... }
 * @param {object} options - { terrain, isCorrupted, ... }
 * @returns {object} { amount, modifiers[] }
 */
function calculateXPReward(player, enemy, options = {}) {
  const playerLevel = Number(player.level || 1);
  const enemyLevel = Number(enemy.level || 1);
  const baseReward = Number(options.baseReward || CONFIG.hunting.baseDEPReward);

  let amount = baseReward;
  const modifiers = [];

  // Level scaling: bonus for fighting higher-level enemies
  const levelDiff = enemyLevel - playerLevel;
  if (levelDiff > 0) {
    const levelBonus = 1 + levelDiff * 0.05;
    amount = Math.floor(amount * levelBonus);
    modifiers.push(`+${Math.round((levelBonus - 1) * 100)}% level bonus`);
  }

  // Difficulty multiplier
  if (options.difficulty) {
    const diffMult = CONFIG.hunting.difficultyMultipliers[options.difficulty] || 1.0;
    if (diffMult > 1) {
      amount = Math.floor(amount * diffMult);
      modifiers.push(`+${Math.round((diffMult - 1) * 100)}% difficulty bonus`);
    }
  }

  // Boss multiplier
  if (enemy.isBoss || options.isBoss) {
    const tier = Number(enemy.tier || options.tier || 1);
    const bossMult = CONFIG.boss.tierMultipliers[tier] || 1.0;
    amount = Math.floor(amount * bossMult);
    modifiers.push(`+${Math.round((bossMult - 1) * 100)}% boss tier bonus`);
  }

  // Underdog bonus: fighting much stronger enemy
  if (levelDiff >= CONFIG.xp.underdogThreshold) {
    amount = Math.floor(amount * CONFIG.xp.underdogBonus);
    modifiers.push(`+${Math.round((CONFIG.xp.underdogBonus - 1) * 100)}% underdog bonus`);
  }

  // Low-level penalty: farming weak enemies
  if (CONFIG.xp.lowLevelPenalty && levelDiff < -CONFIG.xp.lowLevelThreshold) {
    amount = Math.floor(amount * CONFIG.xp.lowLevelReduction);
    modifiers.push(`${Math.round((CONFIG.xp.lowLevelReduction - 1) * 100)}% anti-farm penalty`);
  }

  // Corruption bonus
  if (options.isCorrupted) {
    amount = Math.floor(amount * CONFIG.hunting.corruptionBonus);
    modifiers.push(`+${Math.round((CONFIG.hunting.corruptionBonus - 1) * 100)}% corruption bonus`);
  }

  // Apply jitter
  amount = jitter(amount, CONFIG.xp.jitterPct);

  return { amount: Math.max(1, amount), modifiers };
}

/**
 * Add DΞP to a player and handle level ups.
 * @param {object} player - Player object
 * @param {number} amount - DΞP to add
 * @returns {object} { leveledUp, levels, actualGain, rankUp, statPointsGranted }
 */
// addDEP removed — use xpSystem.addPlayerXp() from core/xpSystem.js instead.

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — HONOR / BOUNTY / RESONANCE SYSTEM
// Faction-dependent PvP progression stat.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get the faction stat key for a player's faction.
 * @param {string} faction - "harmony" | "purity" | "rift"
 * @returns {string} "resonance" | "honor" | "bounty"
 */
function getFactionStatKey(faction) {
  // Prime's decree (2026-09): Purity Order = Resonance,
  // Rift Seekers = Bounty, Harmony Lumorians = Honour.
  const map = {
    purity: "resonance",
    rift: "bounty",
    harmony: "honor",
  };
  return map[faction] || "resonance";
}

/**
 * Get the faction stat emoji.
 * @param {string} faction
 * @returns {string}
 */
function getFactionStatEmoji(faction) {
  const map = {
    harmony: "🌀",
    purity: "⚔️",
    rift: "🎯",
  };
  return map[faction] || "💠";
}

/**
 * Get a player's current faction stat value.
 * @param {object} player
 * @returns {number}
 */
function getFactionStat(player) {
  const key = getFactionStatKey(player.faction);
  return Number(player[key] || 0);
}

/**
 * Set a player's faction stat value.
 * @param {object} player
 * @param {number} value
 */
function setFactionStat(player, value) {
  const key = getFactionStatKey(player.faction);
  player[key] = clamp(Math.floor(value), 0, CONFIG.factionStats.cap);
}

/**
 * Add to a player's faction stat (with cap).
 * @param {object} player
 * @param {number} amount
 * @returns {object} { newValue, capped }
 */
function addFactionStat(player, amount) {
  const current = getFactionStat(player);
  const newValue = current + Number(amount || 0);
  const capped = newValue > CONFIG.factionStats.cap;
  setFactionStat(player, capped ? CONFIG.factionStats.cap : newValue);
  return { newValue: getFactionStat(player), capped };
}

/**
 * Subtract from a player's faction stat (with floor at 0).
 * @param {object} player
 * @param {number} amount
 * @returns {object} { newValue, depleted }
 */
function subtractFactionStat(player, amount) {
  const current = getFactionStat(player);
  const newValue = current - Number(amount || 0);
  const depleted = newValue < 0;
  setFactionStat(player, depleted ? 0 : newValue);
  return { newValue: getFactionStat(player), depleted };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PvP REWARD SCALING
// Anti-farm, underdog bonus, diminishing returns on repeated kills.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate PvP reward for the winner.
 * @param {object} winner - Winner player object
 * @param {object} loser - Loser player object
 * @param {object} options - { recentKills, killStreak, ... }
 * @returns {object} { reward, modifiers[], loserPenalty }
 */
function calculatePvPReward(winner, loser, options = {}) {
  const winnerStat = getFactionStat(winner);
  const loserStat = getFactionStat(loser);
  const winnerLevel = Number(winner.level || 1);
  const loserLevel = Number(loser.level || 1);

  let reward = CONFIG.pvp.baseReward;
  const modifiers = [];

  // ── Opponent Value Scaling ──────────────────────────────────────────────
  if (CONFIG.pvp.opponentValueScaling && loserStat > 0) {
    const valueFactor = 1 + (loserStat / CONFIG.factionStats.cap) * CONFIG.pvp.opponentValueFactor;
    reward = Math.floor(reward * valueFactor);
    if (valueFactor > 1) {
      modifiers.push(`+${Math.round((valueFactor - 1) * 100)}% opponent value`);
    }
  }

  // ── Level Scaling ──────────────────────────────────────────────────────
  if (CONFIG.pvp.levelScaling) {
    const levelDiff = loserLevel - winnerLevel;
    if (levelDiff !== 0) {
      const levelFactor = 1 + levelDiff * CONFIG.pvp.levelScalingFactor;
      reward = Math.floor(reward * Math.max(0.5, levelFactor));
      if (levelFactor > 1) {
        modifiers.push(`+${Math.round((levelFactor - 1) * 100)}% level advantage`);
      } else if (levelFactor < 1) {
        modifiers.push(`${Math.round((levelFactor - 1) * 100)}% level disadvantage`);
      }
    }
  }

  // ── Underdog Bonus ─────────────────────────────────────────────────────
  if (CONFIG.pvp.underdogBonus) {
    const diff = (loserStat - winnerStat) / Math.max(1, loserStat);
    if (diff >= CONFIG.pvp.underdogThreshold) {
      reward = Math.floor(reward * CONFIG.pvp.underdogMultiplier);
      modifiers.push(`+${Math.round((CONFIG.pvp.underdogMultiplier - 1) * 100)}% underdog bonus`);
    }
  }

  // ── Farming Penalty ────────────────────────────────────────────────────
  if (CONFIG.pvp.farmingPenalty) {
    const ratio = loserStat / Math.max(1, winnerStat);
    if (ratio < CONFIG.pvp.farmingThreshold) {
      reward = Math.floor(reward * CONFIG.pvp.farmingMultiplier);
      modifiers.push(`${Math.round((CONFIG.pvp.farmingMultiplier - 1) * 100)}% farming penalty`);
    }
  }

  // ── Repeated Kill Penalty ──────────────────────────────────────────────
  if (CONFIG.pvp.repeatedKillReduction && options.recentKills > 0) {
    const decay = Math.pow(CONFIG.pvp.repeatedKillDecay, options.recentKills);
    reward = Math.floor(reward * Math.max(0.1, decay));
    modifiers.push(`${Math.round((decay - 1) * 100)}% repeated kill penalty`);
  }

  // ── Cap Approach Reduction ─────────────────────────────────────────────
  if (CONFIG.pvp.capApproachReduction) {
    const capRatio = winnerStat / CONFIG.factionStats.cap;
    if (capRatio >= CONFIG.pvp.capApproachStart) {
      const reduction = 1 - ((capRatio - CONFIG.pvp.capApproachStart) / (1 - CONFIG.pvp.capApproachStart)) * (1 - CONFIG.pvp.capApproachMultiplier);
      reward = Math.floor(reward * Math.max(CONFIG.pvp.capApproachMultiplier, reduction));
      modifiers.push(`-${Math.round((1 - reduction) * 100)}% near-cap reduction`);
    }
  }

  // Apply cap
  reward = Math.max(0, Math.min(reward, CONFIG.factionStats.cap - winnerStat));

  // ── Loser Penalty ──────────────────────────────────────────────────────
  const loserPenalty = calculatePvPDeathPenalty(loser, winner);

  return {
    reward: Math.max(0, reward),
    modifiers,
    loserPenalty,
  };
}

/**
 * Calculate faction stat loss for PvP death.
 * @param {object} loser - Losing player
 * @param {object} winner - Winning player
 * @returns {object} { amount, reason }
 */
function calculatePvPDeathPenalty(loser, winner) {
  const current = getFactionStat(loser);
  let loss = Math.floor(current * CONFIG.factionStats.pvpDeathLossPercent);
  loss = clamp(loss, CONFIG.factionStats.pvpDeathLossMin, CONFIG.factionStats.pvpDeathLossMax);

  // Reduce loss if winner is much stronger (less punishing)
  const winnerStat = getFactionStat(winner);
  if (winnerStat > current * 2) {
    loss = Math.floor(loss * 0.5);
  }

  return {
    amount: Math.min(loss, current),
    reason: `Defeated by ${winner.username || "unknown"}`,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — DEATH PENALTIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate faction stat loss for NPC death.
 * @param {object} player - Player who died
 * @param {object} npc - NPC that killed them
 * @returns {object} { amount, reason }
 */
function calculateNPCDeathPenalty(player, npc) {
  const current = getFactionStat(player);
  let loss = Math.floor(current * CONFIG.factionStats.npcDeathLossPercent);

  // Scale with NPC difficulty
  const npcLevel = Number(npc.level || 1);
  const playerLevel = Number(player.level || 1);
  if (npcLevel > playerLevel) {
    const diff = npcLevel - playerLevel;
    loss = Math.floor(loss * (1 + diff * 0.05));
  }

  loss = clamp(loss, CONFIG.factionStats.npcDeathLossMin, CONFIG.factionStats.npcDeathLossMax);

  return {
    amount: Math.min(loss, current),
    reason: `Defeated by ${npc.name || "NPC"}`,
  };
}

/**
 * Apply death penalty to a player.
 * @param {object} player
 * @param {object} penalty - From calculateNPCDeathPenalty or calculatePvPDeathPenalty
 * @returns {object} { actualLoss, newValue }
 */
function applyDeathPenalty(player, penalty) {
  if (!penalty || !penalty.amount) return { actualLoss: 0, newValue: getFactionStat(player) };
  const result = subtractFactionStat(player, penalty.amount);
  return { actualLoss: penalty.amount, newValue: result.newValue };
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — BOSS REWARDS
// Bosses award DΞP + Lucons + Faction Stat + Loot
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate rewards for defeating a boss.
 * @param {object} player
 * @param {object} boss - { level, tier, name, isBoss: true }
 * @returns {object} { dep, lucons, factionStat, modifiers[] }
 */
// calculateBossReward removed — no boss encounter system exists yet.
// When bosses are added, create a boss system that uses calculateXPReward + addFactionStat directly.

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — ARENA REWARDS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate rewards for arena NPC combat.
 * @param {object} player
 * @param {object} npc - { level, difficulty, isBoss }
 * @returns {object} { dep, lucons, modifiers[] }
 */
// calculateArenaReward removed — npcArena already uses progression.calculateXPReward()
// with its own tier/difficulty multipliers. This function was redundant dead code.

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — LEADERBOARD SCORING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate normalized global leaderboard score.
 * Combines faction stat, level, DΞP, lucons, and tamed Mora.
 * @param {object} player
 * @returns {object} { total, breakdown }
 */
function calculateLeaderboardScore(player) {
  const factionStat = getFactionStat(player);
  const level = Number(player.level || 1);
  const dep = Number(player.xp || 0);
  const lucons = Number(player.lucons || 0);
  const tamed = Array.isArray(player.moraOwned) ? player.moraOwned.length : 0;

  // Normalize each component to 0-10000 range
  const maxFactionStat = CONFIG.factionStats.cap;
  const normalizedFaction = (factionStat / maxFactionStat) * 10000;
  const normalizedLevel = (level / CONFIG.xp.maxLevel) * 10000;
  const normalizedDEP = Math.min(10000, dep / 100); // Cap at 1M DEP for normalization
  const normalizedLucons = Math.min(10000, lucons / 100); // Cap at 1M Lucons
  const normalizedTamed = Math.min(10000, tamed * 100); // Cap at 100 tamed

  const w = CONFIG.leaderboard.globalWeights;
  const total = Math.floor(
    normalizedFaction * w.factionStat +
    normalizedLevel * w.level +
    normalizedDEP * w.dep +
    normalizedLucons * w.lucons +
    normalizedTamed * w.tamed
  );

  return {
    total,
    breakdown: {
      factionStat: Math.floor(normalizedFaction),
      level: Math.floor(normalizedLevel),
      dep: Math.floor(normalizedDEP),
      lucons: Math.floor(normalizedLucons),
      tamed: Math.floor(normalizedTamed),
    },
  };
}

/**
 * Get the faction-specific leaderboard score.
 * @param {object} player
 * @returns {number}
 */
function getFactionLeaderboardScore(player) {
  return getFactionStat(player);
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — COMBAT RESULT DATA
// Structured result object for every battle.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create a structured combat result object.
 * @param {object} data
 * @returns {object}
 */
// createCombatResult removed — battle systems build result objects inline.
// Re-add if a structured battle report system is needed later.

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Configuration
  CONFIG,

  // DΞP (XP) System
  calculateXPRequired,
  calculateXPReward,

  // Faction Stat System
  getFactionStatKey,
  getFactionStatEmoji,
  getFactionStat,
  addFactionStat,
  subtractFactionStat,

  // PvP Rewards
  calculatePvPReward,
  calculatePvPDeathPenalty,

  // Death Penalties
  calculateNPCDeathPenalty,
  applyDeathPenalty,

  // Leaderboard
  calculateLeaderboardScore,
  getFactionLeaderboardScore,
};

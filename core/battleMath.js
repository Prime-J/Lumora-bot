// core/battleMath.js
// ============================
// Battle Math (Lumora)
// - Accuracy + crit
// - Energy cost
// - Type effectiveness
// - Slower damage curve (longer battles)
// ============================

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Accuracy check (0–100)
function checkHit(accuracy = 100) {
  const acc = clamp(Number(accuracy || 100), 1, 100);
  const roll = randInt(1, 100);
  return roll <= acc;
}

// Crit system
function rollCrit(chancePercent = 10) {
  const c = clamp(Number(chancePercent || 10), 0, 100);
  const roll = randInt(1, 100);
  return roll <= c;
}

// Energy cost: based on move power + category
function calcEnergyCost(move) {
  const power = Number(move?.power || 0);
  const cat = String(move?.category || "").toLowerCase();

  if (cat === "status" || power <= 0) return 5;
  return clamp(6 + Math.floor(power / 10), 6, 18);
}

// ============================
// TYPE EFFECTIVENESS
// ============================
const TYPE_CHART = {
  Flame: { Nature: 1.25, Frost: 1.25, Aqua: 0.75, Terra: 0.75 },
  Aqua: { Flame: 1.25, Terra: 1.25, Nature: 0.75, Volt: 0.75 },
  Terra: { Volt: 1.25, Flame: 1.25, Aqua: 0.75, Wind: 0.75, Nature: 0.75 },
  Volt: { Aqua: 1.25, Wind: 1.25, Terra: 0.75 },
  Nature: { Aqua: 1.25, Terra: 1.25, Flame: 0.75, Frost: 0.75 },
  Frost: { Wind: 1.25, Nature: 1.25, Flame: 0.75 },
  Wind: { Terra: 1.25, Frost: 1.25, Volt: 0.75 },
  Shadow: { Shadow: 1.1 }, // small mirror edge
};

function getTypeMultiplier(attackType, defendType) {
  const atk = String(attackType || "").trim();
  const def = String(defendType || "").trim();
  const mult = TYPE_CHART?.[atk]?.[def];
  return typeof mult === "number" ? mult : 1.0;
}

// ============================
// DAMAGE (SLOWER CURVE)
// ============================
// Tuned so battles last longer across ALL levels.
// Key tuning knob: the "/ 6" divisor (increase -> longer battles)
function calcDamage({ attacker, defender, move, crit = false }) {
  const power = Number(move?.power || 0);
  if (power <= 0) return 0;

  // Apply mutation bonuses if active
  const atkMut = attacker?.mutation?.battlesLeft > 0 ? attacker.mutation : null;
  const defMut = defender?.mutation?.battlesLeft > 0 ? defender.mutation : null;
  const atkBonus = atkMut?.stat === "atk" ? (atkMut.bonus || 0) : 0;
  const defBonus = defMut?.stat === "def" ? (defMut.bonus || 0) : 0;

  const atkStat = clamp(Number(attacker?.stats?.atk ?? 10) + atkBonus, 1, 99999);
  const defStat = clamp(Number(defender?.stats?.def ?? 10) + defBonus, 1, 99999);

  const atkLv = clamp(Number(attacker?.level ?? 1), 1, 999);

  const attackerType =
    attacker?.type ||
    attacker?.moraType ||
    attacker?.element ||
    attacker?.moraElement ||
    attacker?.speciesType ||
    attacker?.typeName ||
    "Neutral";

  const moveType = String(move?.type || attackerType || "Neutral").trim();
  const defenderType = String(defender?.type || "Neutral").trim();

  // Smaller level factor + extra defender padding + big divisor
  const levelFactor = (atkLv + 10) / 18;
  const ratio = atkStat / (defStat + 8);
  let dmg = Math.floor((power * levelFactor * ratio) / 6);

  // Less swingy randomness
  dmg = Math.floor(dmg * (randInt(90, 100) / 100));

  // Small STAB
  if (moveType !== "Neutral" && attackerType !== "Neutral" && moveType === attackerType) {
    dmg = Math.floor(dmg * 1.05);
  }

  // Softened type multiplier (keeps your chart but reduces extremes)
  const typeMult = getTypeMultiplier(moveType, defenderType);
  dmg = Math.floor(dmg * (0.9 + (typeMult - 1) * 0.85));

  // Smaller crit spike
  if (crit) dmg = Math.floor(dmg * 1.35);

  // Min 1
  dmg = clamp(dmg, 1, 9999);
  return dmg;
}

module.exports = {
  checkHit,
  rollCrit,
  calcEnergyCost,
  getTypeMultiplier,
  calcDamage,
};
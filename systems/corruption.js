const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CORRUPTED_FILE = path.join(DATA_DIR, "corrupted_mora.json");

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function loadCorruptionData() {
  return loadJSON(CORRUPTED_FILE, {
    enabled: true,
    version: 1,
    publicCorruptedSpawns: { enabled: true, announceToGroup: true, announceTextPool: [], despawnSeconds: 300 },
    huntCorruption: { baseChance: 0.03, terrainBonusMultiplier: 1, riftStateBonus: {} },
    pvpCorruption: {
      enabled: true,
      baseChance: 0.01,
      statMultiplier: { hp: 1.18, atk: 1.35, def: 1.12, spd: 1.15, energy: 1.2 },
      controlLossChance: 0.22,
      ownerAttackChance: 0.18,
      randomTargetChance: 0.3,
      backlashTextPool: []
    },
    partyCorruption: {
      enabled: true,
      ownerAttackChancePerCheck: 0.12,
      protectiveItemsReduceChanceBy: 0.08,
      protectiveItems: [],
      durabilityLossPerBlockedHit: 1,
      ownerAttackTextPool: []
    },
    purification: {
      enabled: true,
      purifiableNaturalCorrupted: true,
      requiredItemTags: [],
      baseSuccessChance: 0.22,
      weakenedBonus: 0.18,
      harmonyFactionBonus: 0.15,
      capitalPurifyBonus: 0.1
    },
    genericVariantRules: {},
    explicitVariants: [],
    naturalCorruptedSpecies: []
  });
}

function rarityKey(rarity = "") {
  return String(rarity || "").trim().toLowerCase();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getExplicitVariantByBaseId(corruptionData, baseId) {
  const arr = Array.isArray(corruptionData?.explicitVariants) ? corruptionData.explicitVariants : [];
  return arr.find((x) => Number(x.baseId) === Number(baseId)) || null;
}

function getGenericRuleForRarity(corruptionData, rarity) {
  const rules = corruptionData?.genericVariantRules || {};
  return rules[rarityKey(rarity)] || null;
}

function pickAnnouncementText(corruptionData) {
  const pool = corruptionData?.publicCorruptedSpawns?.announceTextPool || [];
  if (!Array.isArray(pool) || !pool.length) {
    return "☠ A Corrupted Mora has spawned.";
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRiftBonus(corruptionData, riftState = "calm") {
  const map = corruptionData?.huntCorruption?.riftStateBonus || {};
  return Number(map[String(riftState).toLowerCase()] || 0);
}

function calcHuntCorruptionChance(corruptionData, terrainCorruptionSensitivity = 0, riftState = "calm") {
  const baseChance = Number(corruptionData?.huntCorruption?.baseChance || 0);
  const terrainBonusMultiplier = Number(corruptionData?.huntCorruption?.terrainBonusMultiplier || 1);
  const terrainBonus = Number(terrainCorruptionSensitivity || 0) * terrainBonusMultiplier;
  const riftBonus = getRiftBonus(corruptionData, riftState);

  return clamp(baseChance + terrainBonus + riftBonus, 0, 0.95);
}

function shouldCorruptHuntSpawn(corruptionData, terrainCorruptionSensitivity = 0, riftState = "calm") {
  const chance = calcHuntCorruptionChance(corruptionData, terrainCorruptionSensitivity, riftState);
  return Math.random() < chance;
}

function shouldTriggerPvpCorruption(corruptionData, extraChance = 0) {
  if (corruptionData?.pvpCorruption?.enabled === false) return false;
  const base = Number(corruptionData?.pvpCorruption?.baseChance || 0);
  return Math.random() < clamp(base + Number(extraChance || 0), 0, 0.95);
}

function getPvpCorruptionRules(corruptionData) {
  return corruptionData?.pvpCorruption || {
    enabled: true,
    baseChance: 0.01,
    statMultiplier: { hp: 1.18, atk: 1.35, def: 1.12, spd: 1.15, energy: 1.2 },
    controlLossChance: 0.22,
    ownerAttackChance: 0.18,
    randomTargetChance: 0.3,
    backlashTextPool: []
  };
}

function getPartyCorruptionRules(corruptionData) {
  return corruptionData?.partyCorruption || {
    enabled: true,
    ownerAttackChancePerCheck: 0.12,
    protectiveItemsReduceChanceBy: 0.08,
    protectiveItems: [],
    durabilityLossPerBlockedHit: 1,
    ownerAttackTextPool: []
  };
}

function getNaturalCorruptedById(corruptionData, id) {
  const arr = Array.isArray(corruptionData?.naturalCorruptedSpecies)
    ? corruptionData.naturalCorruptedSpecies
    : [];
  return arr.find((x) => String(x.id) === String(id)) || null;
}

function getAllNaturalCorrupted(corruptionData) {
  return Array.isArray(corruptionData?.naturalCorruptedSpecies)
    ? corruptionData.naturalCorruptedSpecies
    : [];
}

function getCorruptedPartyMora(player) {
  const owned = Array.isArray(player?.moraOwned) ? player.moraOwned : [];
  const party = Array.isArray(player?.party) ? player.party : [];

  const out = [];
  for (const idx of party) {
    if (idx === null || idx === undefined) continue;
    const mora = owned[idx];
    if (!mora) continue;
    if (mora.isCorrupted) out.push(mora);
  }
  return out;
}

function applyStatMultiplierToOwnedMora(ownedMora, statMultiplier = {}) {
  if (!ownedMora || typeof ownedMora !== "object") return ownedMora;

  const hpMul = Number(statMultiplier.hp || 1);
  const atkMul = Number(statMultiplier.atk || 1);
  const defMul = Number(statMultiplier.def || 1);
  const spdMul = Number(statMultiplier.spd || 1);
  const enMul = Number(statMultiplier.energy || 1);

  const prevMaxHp = Math.max(1, Number(ownedMora.maxHp || ownedMora.stats?.hp || 1));
  const prevHp = clamp(Number(ownedMora.hp || prevMaxHp), 0, prevMaxHp);
  const hpRatio = prevHp / prevMaxHp;

  ownedMora.maxHp = Math.max(1, Math.floor(prevMaxHp * hpMul));
  ownedMora.hp = Math.max(0, Math.floor(ownedMora.maxHp * hpRatio));

  if (!ownedMora.stats || typeof ownedMora.stats !== "object") {
    ownedMora.stats = {};
  }

  ownedMora.stats.atk = Math.max(1, Math.floor(Number(ownedMora.stats.atk || 1) * atkMul));
  ownedMora.stats.def = Math.max(1, Math.floor(Number(ownedMora.stats.def || 1) * defMul));
  ownedMora.stats.spd = Math.max(1, Math.floor(Number(ownedMora.stats.spd || 1) * spdMul));

  const oldMaxEnergy = Math.max(1, Number(ownedMora.maxEnergy || ownedMora.stats.energy || 1));
  const oldEnergy = clamp(Number(ownedMora.energy || oldMaxEnergy), 0, oldMaxEnergy);
  const energyRatio = oldEnergy / oldMaxEnergy;

  ownedMora.maxEnergy = Math.max(1, Math.floor(oldMaxEnergy * enMul));
  ownedMora.stats.energy = ownedMora.maxEnergy;
  ownedMora.energy = Math.max(0, Math.floor(ownedMora.maxEnergy * energyRatio));

  return ownedMora;
}

function buildCorruptedFromBaseSpecies(baseSpecies, corruptionData) {
  if (!baseSpecies) return null;

  const explicit = getExplicitVariantByBaseId(corruptionData, baseSpecies.id);
  const generic = getGenericRuleForRarity(corruptionData, baseSpecies.rarity);

  const out = deepClone(baseSpecies);

  out.isCorrupted = true;
  out.corruptionOrigin = explicit ? "explicit_variant" : "generic_variant";
  out.baseSpeciesId = baseSpecies.id;
  out.originalName = baseSpecies.name;

  if (explicit) {
    out.name = explicit.corruptedName || `Corrupted ${baseSpecies.name}`;
    out.corruptedTitle = explicit.corruptedTitle || null;

    if (explicit.moves && typeof explicit.moves === "object") {
      out.moves = deepClone(explicit.moves);
    }

    if (Array.isArray(explicit.moveSet) && explicit.moveSet.length) {
      out.corruptedMoveSet = deepClone(explicit.moveSet);
    }
  } else {
    out.name = `Corrupted ${baseSpecies.name}`;
    out.corruptedTitle = null;
    out.corruptedMoveSet = Object.keys(out.moves || {}).slice(0, 5);
  }

  const statMultiplier = explicit?.statMultiplier || generic?.statMultiplier || {
    hp: 1.15,
    atk: 1.25,
    def: 1.1,
    spd: 1.1,
    energy: 1.12
  };

  const baseStats = out.baseStats || {};
  out.baseStats = {
    ...baseStats,
    hp: Math.max(1, Math.floor(Number(baseStats.hp || 1) * Number(statMultiplier.hp || 1))),
    atk: Math.max(1, Math.floor(Number(baseStats.atk || 1) * Number(statMultiplier.atk || 1))),
    def: Math.max(1, Math.floor(Number(baseStats.def || 1) * Number(statMultiplier.def || 1))),
    spd: Math.max(1, Math.floor(Number(baseStats.spd || 1) * Number(statMultiplier.spd || 1))),
    energy: Math.max(1, Math.floor(Number(baseStats.energy || 1) * Number(statMultiplier.energy || 1)))
  };

  out.corruptionRules = {
    pvp: getPvpCorruptionRules(corruptionData),
    party: getPartyCorruptionRules(corruptionData),
    statMultiplier
  };

  return out;
}

function corruptOwnedMora(ownedMora, baseSpecies, corruptionData, mode = "pvp") {
  if (!ownedMora || !baseSpecies) return { ok: false, reason: "Missing owned Mora or species." };

  const corruptedSpecies = buildCorruptedFromBaseSpecies(baseSpecies, corruptionData);
  if (!corruptedSpecies) return { ok: false, reason: "Could not build corrupted species." };

  ownedMora.isCorrupted = true;
  ownedMora.corruptionMode = mode;
  ownedMora.baseSpeciesId = baseSpecies.id;
  ownedMora.originalName = ownedMora.name || baseSpecies.name;
  ownedMora.name = corruptedSpecies.name;
  ownedMora.type = corruptedSpecies.type || baseSpecies.type;
  ownedMora.rarity = corruptedSpecies.rarity || baseSpecies.rarity;
  ownedMora.corruptedTitle = corruptedSpecies.corruptedTitle || null;
  ownedMora.corruptionRules = corruptedSpecies.corruptionRules || {};

  if (Array.isArray(corruptedSpecies.corruptedMoveSet) && corruptedSpecies.corruptedMoveSet.length) {
    ownedMora.moves = deepClone(corruptedSpecies.corruptedMoveSet);
  }

  applyStatMultiplierToOwnedMora(
    ownedMora,
    corruptedSpecies?.corruptionRules?.statMultiplier || {}
  );

  return {
    ok: true,
    ownedMora,
    corruptedSpecies
  };
}

function hasProtectiveItemEquipped(player, corruptionData) {
  const rules = getPartyCorruptionRules(corruptionData);
  const protective = Array.isArray(rules.protectiveItems) ? rules.protectiveItems : [];
  const eq = player?.equipment || {};

  const slots = ["core", "charm", "tool", "relic", "cloak", "boots"];
  for (const slot of slots) {
    const equippedName = String(eq?.[slot] || "").trim().toLowerCase();
    if (!equippedName) continue;

    for (const itemName of protective) {
      if (equippedName === String(itemName).trim().toLowerCase()) {
        return { protected: true, slot, itemName };
      }
    }
  }

  return { protected: false, slot: null, itemName: null };
}

function rollPartyBacklash(corruptionData, player) {
  const rules = getPartyCorruptionRules(corruptionData);
  if (rules.enabled === false) {
    return { triggered: false, blocked: false, chance: 0 };
  }

  let chance = Number(rules.ownerAttackChancePerCheck || 0);
  const protection = hasProtectiveItemEquipped(player, corruptionData);

  if (protection.protected) {
    chance = Math.max(0, chance - Number(rules.protectiveItemsReduceChanceBy || 0.08));
  }

  const triggered = Math.random() < clamp(chance, 0, 0.95);

  return {
    triggered,
    blocked: protection.protected && triggered,
    chance,
    protection,
    durabilityLoss: protection.protected && triggered ? Number(rules.durabilityLossPerBlockedHit || 1) : 0
  };
}

function rollPvpControlOutcome(corruptionData) {
  const rules = getPvpCorruptionRules(corruptionData);

  const controlLoss = Math.random() < clamp(Number(rules.controlLossChance || 0), 0, 0.95);
  const ownerAttack = Math.random() < clamp(Number(rules.ownerAttackChance || 0), 0, 0.95);
  const randomTarget = Math.random() < clamp(Number(rules.randomTargetChance || 0), 0, 0.95);

  return {
    controlLoss,
    ownerAttack,
    randomTarget
  };
}

function pickBacklashText(corruptionData, mode = "pvp") {
  const pool =
    mode === "party"
      ? getPartyCorruptionRules(corruptionData)?.ownerAttackTextPool || []
      : getPvpCorruptionRules(corruptionData)?.backlashTextPool || [];

  if (!Array.isArray(pool) || !pool.length) {
    return mode === "party"
      ? "☠ The corrupted Mora lashes out at its owner!"
      : "☠ Corruption takes hold and the Mora loses control!";
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function canAttemptPurification(corruptionData, itemTags = []) {
  const req = Array.isArray(corruptionData?.purification?.requiredItemTags)
    ? corruptionData.purification.requiredItemTags
    : [];

  const tags = itemTags.map((x) => String(x).toLowerCase());

  return req.some((tag) => tags.includes(String(tag).toLowerCase()));
}

function rollPurification(corruptionData, options = {}) {
  const weakened = !!options.weakened;
  const harmonyFaction = !!options.harmonyFaction;
  const inCapital = !!options.inCapital;

  let chance = Number(corruptionData?.purification?.baseSuccessChance || 0);

  if (weakened) chance += Number(corruptionData?.purification?.weakenedBonus || 0);
  if (harmonyFaction) chance += Number(corruptionData?.purification?.harmonyFactionBonus || 0);
  if (inCapital) chance += Number(corruptionData?.purification?.capitalPurifyBonus || 0);

  chance = clamp(chance, 0, 0.98);

  return {
    success: Math.random() < chance,
    chance
  };
}

module.exports = {
  loadCorruptionData,
  pickAnnouncementText,
  getExplicitVariantByBaseId,
  getGenericRuleForRarity,
  calcHuntCorruptionChance,
  shouldCorruptHuntSpawn,
  shouldTriggerPvpCorruption,
  getPvpCorruptionRules,
  getPartyCorruptionRules,
  getNaturalCorruptedById,
  getAllNaturalCorrupted,
  getCorruptedPartyMora,
  buildCorruptedFromBaseSpecies,
  corruptOwnedMora,
  hasProtectiveItemEquipped,
  rollPartyBacklash,
  rollPvpControlOutcome,
  pickBacklashText,
  canAttemptPurification,
  rollPurification
};
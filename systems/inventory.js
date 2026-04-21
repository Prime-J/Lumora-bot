// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA INVENTORY + ITEM EFFECTS ENGINE  v2.0               ║
// ╠═══════════════════════════════════════════════════════════════╣
// ║  FIXES vs old version:                                       ║
// ║  • applyGearEffects no longer called at module-level         ║
// ║  • effects no longer referenced before declaration           ║
// ║  • buildConsumeResultText no longer has stray code inside    ║
// ║  • ALL 41 effect keys from items.json are now handled        ║
// ║  • Scrolls are consumed & applied through here               ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const itemsSystem = require("./items");

const DIVIDER      = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SMALL_DIVIDER = "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─";

// ══════════════════════════════════════════════════════════════
// SECTION 1 — HELPERS
// ══════════════════════════════════════════════════════════════
function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function getPlayerMaxHp(player) {
  return Number(player.playerMaxHp || 100);
}

function getPlayerMaxHuntEnergy(player) {
  return Number(player.maxHuntEnergy ?? player.huntEnergyMax ?? 100);
}

function buildSection(title, lines = []) {
  if (!lines.length) return "";
  return `${title}\n${lines.join("\n")}`;
}

// Lazy-load hunting to avoid circular dependency at startup
function getHunting() { return require("./hunting"); }

function syncEnergyFromHuntState(player, senderId) {
  try {
    const { loadHuntState, ensureHunter, saveHuntState } = getHunting();
    const huntState = loadHuntState();
    const hunter    = ensureHunter(huntState, senderId);
    if (Number.isFinite(hunter.huntEnergy)) player.huntEnergy = hunter.huntEnergy;
    player.huntEnergy = clamp(player.huntEnergy || 0, 0, getPlayerMaxHuntEnergy(player));
    player.playerHp   = clamp(player.playerHp   || 0, 0, getPlayerMaxHp(player));
    hunter.huntEnergy = player.huntEnergy;
    saveHuntState(huntState);
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — EFFECTS ENGINE
// Handles ALL 41 effect keys from items.json correctly.
// ctx is optional — used for mora-targeting effects (cleanse etc.)
// ══════════════════════════════════════════════════════════════
function applyItemEffects(player, effects = {}, ctx = {}) {
  if (!effects || typeof effects !== "object") return { log: [] };

  const log = [];
  const maxHp     = getPlayerMaxHp(player);
  const maxEnergy = getPlayerMaxHuntEnergy(player);

  for (const [key, value] of Object.entries(effects)) {
    const n = Number(value);

    switch (key) {

      // ─── HEALING ─────────────────────────────────────────
      case "heal": {
        const before = Number(player.playerHp || 0);
        player.playerHp = clamp(before + n, 0, maxHp);
        const gained = player.playerHp - before;
        if (gained > 0) log.push(`❤️ HP restored: *+${gained}*`);
        break;
      }

      // ─── HUNT ENERGY ─────────────────────────────────────
      case "energy": {
        const before = Number(player.huntEnergy || 0);
        player.huntEnergy = clamp(before + n, 0, maxEnergy);
        const gained = player.huntEnergy - before;
        if (gained > 0) log.push(`⚡ Energy restored: *+${gained}*`);
        break;
      }

      // ─── MAX HP PERMANENT BOOST ───────────────────────────
      case "maxHp": {
        player.playerMaxHp = clamp(Number(player.playerMaxHp || 100) + n, 10, 9999);
        player.playerHp    = clamp(Number(player.playerHp    || 0),       0, player.playerMaxHp);
        log.push(`❤️ Max HP increased by *+${n}*. Now *${player.playerMaxHp}*`);
        break;
      }

      // ─── STORAGE BOOST ───────────────────────────────────
      case "storage": {
        // Storage is handled by the items.js capacity system — it reads
        // the item from inventory. Logging only.
        log.push(`📦 Storage expanded by *+${n}* slots (active while in inventory)`);
        break;
      }

      // ─── CATCH CHANCE (session bonus) ────────────────────
      case "catchChance": {
        player.catchChanceBonus = clamp(Number(player.catchChanceBonus || 0) + n, 0, 100);
        log.push(`🎯 Catch bonus: *+${n}%* (lasts until next catch)`);
        break;
      }

      // ─── RARE SPAWN BOOST ────────────────────────────────
      case "rareSpawn": {
        player.rareSpawnBonus = clamp(Number(player.rareSpawnBonus || 0) + n, 0, 100);
        log.push(`🌌 Rare spawn boost: *+${n}%* (active this hunt)`);
        break;
      }

      // ─── SPAWN RATE BOOST ────────────────────────────────
      case "spawnRate": {
        player.spawnRateBonus = clamp(Number(player.spawnRateBonus || 0) + n, 0, 200);
        log.push(`🐉 Spawn rate increased by *${n}%*`);
        break;
      }

      // ─── ON-CATCH ENERGY REGEN ───────────────────────────
      case "onCatchEnergy": {
        if (!player.passives) player.passives = {};
        player.passives.onCatchEnergy = (player.passives.onCatchEnergy || 0) + n;
        log.push(`⚡ On-catch energy regen: *+${n}* (passive active)`);
        break;
      }

      // ─── AURA RESTORE ON FAINT ───────────────────────────
      case "auraRestoreOnFaint": {
        if (!player.passives) player.passives = {};
        player.passives.auraRestoreOnFaint = n;
        log.push(`✨ Aura protection enabled: restores *${n}* Aura on next faint`);
        break;
      }

      // ─── AURA LOSS REDUCTION (gear passive) ──────────────
      case "auraLossReduction": {
        if (!player.passives) player.passives = {};
        player.passives.auraLossReduction = Math.min(80, (player.passives.auraLossReduction || 0) + n);
        log.push(`✨ Aura loss reduction: *-${n}%*`);
        break;
      }

      // ─── AURA DRAIN REDUCTION (shadow terrain) ───────────
      case "auraDrainReduction": {
        if (!player.passives) player.passives = {};
        player.passives.auraDrainReduction = (player.passives.auraDrainReduction || 0) + n;
        log.push(`🌑 Shadow aura drain reduced by *${n}%*`);
        break;
      }

      // ─── PRIMORDIAL ENERGY CONTROL ───────────────────────
      case "primordialReduce": {
        // Applied to target Mora in ctx, or all owned Mora
        const targets = ctx.targetMora ? [ctx.targetMora]
          : (Array.isArray(player.moraOwned) ? player.moraOwned : []);
        let reduced = 0;
        for (const mora of targets) {
          if (!mora) continue;
          const before = Number(mora.pe || 0);
          mora.pe = Math.max(0, before - n);
          reduced += (before - mora.pe);
        }
        if (reduced > 0) log.push(`🌀 Primordial Energy reduced by *${reduced}* total`);
        break;
      }

      case "primordialGain": {
        // Gear effect that increases PE gain rate — stored as passive
        if (!player.passives) player.passives = {};
        player.passives.primordialGainMod = (player.passives.primordialGainMod || 0) + n;
        // n is negative for reducers like GER_001
        if (n < 0) log.push(`🌀 Primordial gain rate: *${n}%* (gear passive)`);
        else        log.push(`🌀 Primordial energy: *+${n}*`);
        break;
      }

      // ─── CLEANSE CORRUPTION ──────────────────────────────
      case "removeCorruption": {
        const targets = ctx.targetMora ? [ctx.targetMora]
          : (Array.isArray(player.moraOwned) ? player.moraOwned.filter(m => m?.corrupted) : []);
        if (!targets.length) {
          log.push(`🧼 No corrupted Mora to cleanse.`);
          break;
        }
        const target = targets[0]; // Cleanse Shard: one at a time
        target.corrupted  = false;
        target.pe         = Math.max(0, Number(target.pe || 0) - 30);
        target.corruptionWarned = false;
        log.push(`🧼 *${target.name}* has been cleansed of corruption!`);
        break;
      }

      // ─── ENV DAMAGE REDUCTION ────────────────────────────
      case "envDamageReduction": {
        if (!player.passives) player.passives = {};
        player.passives.envDamageReduction = n;
        log.push(`🛡️ Environmental damage reduced by *${n}%* this hunt`);
        break;
      }

      // ─── FLEE REDUCTION ──────────────────────────────────
      case "fleeReduction": {
        if (!player.passives) player.passives = {};
        player.passives.fleeReduction = (player.passives.fleeReduction || 0) + n;
        log.push(`🏃 Mora flee chance reduced by *${n}%*`);
        break;
      }

      // ─── BATTLE DAMAGE BOOST ─────────────────────────────
      case "battleDamage": {
        if (!player.passives) player.passives = {};
        player.passives.battleDamageBoost = (player.passives.battleDamageBoost || 0) + n;
        log.push(`⚔️ Battle damage boost: *+${n}%* (active)`);
        break;
      }

      // ─── BOND/TAME SUCCESS ───────────────────────────────
      case "bondSuccess": {
        player.catchChanceBonus = clamp(Number(player.catchChanceBonus || 0) + n, 0, 100);
        log.push(`🔗 Bond success rate: *+${n}%*`);
        break;
      }

      // ─── BATTLE CONTROL (Dominion effects) ───────────────
      case "battleControl": {
        if (!player.passives) player.passives = {};
        player.passives.battleControl = (player.passives.battleControl || 0) + n;
        log.push(`🎖 Battle control aura: *+${n}* (passive)`);
        break;
      }

      // ─── ACCURACY BOOST ──────────────────────────────────
      case "accuracy": {
        if (!player.passives) player.passives = {};
        player.passives.accuracyBoost = (player.passives.accuracyBoost || 0) + n;
        log.push(`🎯 Move accuracy: *+${n}%*`);
        break;
      }

      // ─── XP BOOST ────────────────────────────────────────
      case "xpBoost": {
        if (!player.passives) player.passives = {};
        player.passives.xpBoost = (player.passives.xpBoost || 0) + n;
        log.push(`✨ XP gain boosted: *+${n}%*`);
        break;
      }

      // ─── SELL BOOST ──────────────────────────────────────
      case "sellBoost": {
        if (!player.passives) player.passives = {};
        player.passives.sellBoost = (player.passives.sellBoost || 0) + n;
        log.push(`💰 Market sell value: *+${n}%*`);
        break;
      }

      // ─── HUNT EFFICIENCY ─────────────────────────────────
      case "huntEfficiency": {
        if (!player.passives) player.passives = {};
        player.passives.huntEfficiency = (player.passives.huntEfficiency || 0) + n;
        log.push(`🔍 Hunt track success: *+${n}%*`);
        break;
      }

      // ─── ENERGY REGEN ────────────────────────────────────
      case "energyRegen": {
        if (!player.passives) player.passives = {};
        player.passives.energyRegen = (player.passives.energyRegen || 0) + n;
        log.push(`⚡ Energy regen rate: *+${n}*`);
        break;
      }

      // ─── TERRAIN IMMUNITIES (gear passives) ──────────────
      case "heatResist":
      case "coldResist":
      case "lightningImmunity":
      case "quakeImmunity":
      case "stormImmunity":
      case "terrainImmunity": {
        if (!player.passives) player.passives = {};
        if (!player.passives.terrainResists) player.passives.terrainResists = [];
        if (!player.passives.terrainResists.includes(key)) {
          player.passives.terrainResists.push(key);
        }
        log.push(`🛡️ Terrain resist acquired: *${titleCase(key)}*`);
        break;
      }

      case "groundDamageReduction": {
        if (!player.passives) player.passives = {};
        player.passives.groundDamageReduction = (player.passives.groundDamageReduction || 0) + n;
        log.push(`🛡️ Ground hazard damage: *-${n}%*`);
        break;
      }

      // ─── MOVEMENT & EFFICIENCY ───────────────────────────
      case "movementEfficiency": {
        if (!player.passives) player.passives = {};
        player.passives.movementEfficiency = (player.passives.movementEfficiency || 0) + n;
        log.push(`👟 Travel energy cost: *-${n}%*`);
        break;
      }

      // ─── UNSTABLE ENCOUNTER / RIFT ACCESS ────────────────
      case "unstableEncounter": {
        if (!player.passives) player.passives = {};
        player.passives.unstableEncounterBoost = (player.passives.unstableEncounterBoost || 0) + n;
        log.push(`🌀 Unstable Mora encounter rate: *+${n}%*`);
        break;
      }

      case "flameSpawnBoost": {
        if (!player.passives) player.passives = {};
        player.passives.flameSpawnBoost = (player.passives.flameSpawnBoost || 0) + n;
        log.push(`🔥 Flame Mora spawn rate: *+${n}%*`);
        break;
      }

      // ─── CORRUPTION REDUCTION (gear) ─────────────────────
      case "corruptionReduction": {
        if (!player.passives) player.passives = {};
        player.passives.corruptionReduction = (player.passives.corruptionReduction || 0) + n;
        log.push(`🔵 Corruption accumulation: *-${n}%*`);
        break;
      }

      case "corruptionGain": {
        // GER_005 Riftbite: trade-off gear
        if (!player.passives) player.passives = {};
        player.passives.corruptionGainBoost = (player.passives.corruptionGainBoost || 0) + n;
        log.push(`⚠️ Corruption gain rate: *+${n}%* (Riftbite trade-off)`);
        break;
      }

      // ─── SPECIAL / ACCESS ────────────────────────────────
      case "blackMarketAccess": {
        player.blackMarketAccess = true;
        log.push(`🕶 Black Market access activated`);
        break;
      }

      case "forceSpawn": {
        if (!player.passives) player.passives = {};
        player.passives.forceSpawn = true;
        log.push(`🌟 Rare Mora lure active — guaranteed encounter next hunt`);
        break;
      }

      case "revealAnomalies": {
        if (!player.passives) player.passives = {};
        player.passives.revealAnomalies = true;
        log.push(`🔍 Anomalies revealed — hidden Mora visible this hunt`);
        break;
      }

      case "scanRarity": {
        if (!player.passives) player.passives = {};
        player.passives.scanRarity = true;
        log.push(`📊 Mora Scanner active — rarity shown on encounter`);
        break;
      }

      // ─── SCROLL EFFECTS (applied at use) ─────────────────
      // These are battle-session buffs stored as passives
      case "battleDamageBoost": {
        if (!player.passives) player.passives = {};
        player.passives.battleDamageBoost = (player.passives.battleDamageBoost || 0) + n;
        log.push(`⚔️ Battle damage: *+${n}%* (this battle)`);
        break;
      }

      case "incomingDamageReduction": {
        if (!player.passives) player.passives = {};
        player.passives.incomingDamageReduction = (player.passives.incomingDamageReduction || 0) + n;
        log.push(`🛡️ Incoming damage reduced: *-${n}%* (this battle)`);
        break;
      }

      case "playerHpRestore": {
        const before = Number(player.playerHp || 0);
        player.playerHp = clamp(before + n, 0, maxHp);
        log.push(`❤️ Player HP: *+${player.playerHp - before}*`);
        break;
      }

      case "moraHpRestore": {
        const targets = Array.isArray(player.moraOwned) ? player.moraOwned : [];
        for (const mora of targets) {
          if (!mora || Number(mora.hp || 0) <= 0) continue;
          mora.hp = Math.min(Number(mora.hp || 0) + n, Number(mora.maxHp || n));
        }
        log.push(`🐉 Active Mora HP restored: *+${n}*`);
        break;
      }

      case "auraShield": {
        if (!player.passives) player.passives = {};
        player.passives.auraShield = true;
        log.push(`✨ Aura Shield active — next faint will not cost Aura`);
        break;
      }

      case "corruptedSpawnBoost": {
        if (!player.passives) player.passives = {};
        player.passives.corruptedSpawnBoost = (player.passives.corruptedSpawnBoost || 0) + n;
        log.push(`☠ Corrupted Mora spawn rate: *+${n}%*`);
        break;
      }

      case "environmentImmunity": {
        if (!player.passives) player.passives = {};
        player.passives.environmentImmunity = true;
        log.push(`🛡️ Environmental damage: *IMMUNE* (this hunt)`);
        break;
      }

      case "primordialInstant": {
        const targets = ctx.targetMora ? [ctx.targetMora]
          : (Array.isArray(player.moraOwned) ? player.moraOwned.slice(0,1) : []);
        for (const mora of targets) {
          if (!mora) continue;
          mora.pe = Math.min(100, Number(mora.pe || 0) + n);
        }
        log.push(`🌀 Primordial Energy: *+${n}* to active Mora`);
        break;
      }

      // ─── DURATION (metadata, not applied directly) ───────
      case "duration":
        break;

      default:
        // Unknown key — silently skip
        break;
    }
  }

  return { log };
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — SCROLL EFFECTS MAP
// Maps scroll item IDs to their actual effect objects.
// Scrolls have no 'effects' field in items.json so we define them here.
// ══════════════════════════════════════════════════════════════
const SCROLL_EFFECTS = {
  SCR_001: { removeCorruption: true },                          // Harmony: Purification
  SCR_002: { incomingDamageReduction: 20 },                     // Harmony: Tranquility
  SCR_003: { playerHpRestore: 50, moraHpRestore: 30 },          // Harmony: Renewal
  SCR_004: { catchChance: 15 },                                  // Harmony: Spirit Bond
  SCR_005: { auraShield: true },                                 // Harmony: Aura Shield

  SCR_006: { battleControl: 15 },                               // Purity: Dominion
  SCR_007: { accuracy: 20 },                                     // Purity: Precision
  SCR_008: { battleControl: 20 },                               // Purity: Command
  SCR_009: { battleDamageBoost: 15 },                           // Purity: War Focus
  SCR_010: { scanRarity: true },                                 // Purity: Tactical Insight

  SCR_011: { battleDamageBoost: 30 },                           // Rift: Surge
  SCR_012: { corruptedSpawnBoost: 20 },                         // Rift: Corruption Pulse
  SCR_013: { revealAnomalies: true },                           // Rift: Abyss Echo
  SCR_014: { environmentImmunity: true },                       // Rift: Rift Step
  SCR_015: { primordialInstant: 10 },                           // Rift: Void Channel
};

// ══════════════════════════════════════════════════════════════
// SECTION 4 — GEAR EFFECTS (applied passively while equipped)
// Called by battle/hunt systems, not at module level.
// ══════════════════════════════════════════════════════════════
function applyGearEffects(player) {
  if (!player || !player.equipment) return;

  const itemsDb = itemsSystem.loadItems();

  // Reset gear-derived passives before recalculating
  if (!player.passives) player.passives = {};
  player.passives.gearBonusMaxHp = 0;

  let bonusMaxHp = 0;

  for (const slot of ["core","charm","tool","relic","cloak","boots","badge"]) {
    const itemId = player.equipment[slot];
    if (!itemId) continue;

    const item = itemsDb[itemId];
    if (!item || !item.effects) continue;

    const { log } = applyItemEffects(player, item.effects, {});

    if (item.effects.maxHp) bonusMaxHp += Number(item.effects.maxHp);
  }

  // Apply HP bonus without triggering consume logging
  if (bonusMaxHp > 0) {
    player.passives.gearBonusMaxHp = bonusMaxHp;
    // playerMaxHp is recalculated freshly — base 100 + gear bonus
    player.playerMaxHp = 100 + bonusMaxHp;
    player.playerHp = clamp(player.playerHp || 0, 0, player.playerMaxHp);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — INVENTORY UI BUILDERS
// ══════════════════════════════════════════════════════════════
function groupInventoryItems(player, itemsDb) {
  const inv = player.inventory || {};
  const sections = {
    consumables: [],
    scrolls:     [],
    hunting:     [],
    materials:   [],
    gear:        [],
    access:      [],
    specials:    [],
    crystals:    [],
    misc:        [],
  };

  for (const itemId of Object.keys(inv)) {
    const qty = Number(inv[itemId] || 0);
    if (!qty) continue;
    const item = itemsDb[itemId];
    if (!item) continue;

    const icon = itemsSystem.getRarityIcon(item.rarity);
    const fac  = item.faction ? ` _(${item.faction})_` : "";
    const line = `${icon} *${item.name}*${fac} ×${qty}`;

    switch (item.category) {
      case "consumable": sections.consumables.push(line); break;
      case "scroll":     sections.scrolls.push(line);     break;
      case "hunting":    sections.hunting.push(line);     break;
      case "material":   sections.materials.push(line);   break;
      case "gear":       sections.gear.push(line);        break;
      case "access":     sections.access.push(line);      break;
      case "special":    sections.specials.push(line);    break;
      case "crystal":    sections.crystals.push(line);    break;
      default:           sections.misc.push(line);        break;
    }
  }
  return sections;
}

function buildInventoryText(player, targetName = "Hunter") {
  itemsSystem.ensurePlayerItemData(player);
  const itemsDb  = itemsSystem.loadItems();
  const used     = itemsSystem.getUsedStorage(player, itemsDb);
  const cap      = itemsSystem.getPlayerStorageCapacity(player, itemsDb);
  const sections = groupInventoryItems(player, itemsDb);

  const parts = [
    buildSection("🧪 *Consumables*",    sections.consumables),
    buildSection("📜 *Scrolls*",        sections.scrolls),
    buildSection("🧰 *Hunting Items*",  sections.hunting),
    buildSection("💎 *Materials*",      sections.materials),
    buildSection("🛡️ *Gear*",           sections.gear),
    buildSection("🔮 *Crystals*",       sections.crystals),
    buildSection("🔑 *Access*",         sections.access),
    buildSection("✨ *Special*",        sections.specials),
    buildSection("📦 *Other*",          sections.misc),
  ].filter(Boolean);

  const empty = `🌌 Your inventory is empty.\nVisit *.market* or your faction market to stock up.`;

  return (
    `${DIVIDER}\n` +
    `🎒  *I N V E N T O R Y*\n` +
    `${DIVIDER}\n\n` +
    `👤 ${targetName}\n` +
    `📦 Storage: *${used}/${cap}*\n` +
    `❤️ HP: *${Number(player.playerHp || 0)}/${getPlayerMaxHp(player)}*\n` +
    `⚡ Hunt Energy: *${Number(player.huntEnergy || 0)}/${getPlayerMaxHuntEnergy(player)}*\n\n` +
    (parts.length ? parts.join(`\n\n${SMALL_DIVIDER}\n\n`) : empty) +
    `\n\n${DIVIDER}\n` +
    `📖 Commands:\n` +
    `*.item <name>*  ·  *.consume <name>*  ·  *.gear*`
  );
}

function buildItemDetailText(item, qty = 0) {
  const icon  = itemsSystem.getRarityIcon(item.rarity);
  const type  = item.category === "gear"
    ? `Gear · ${titleCase(item.slot || "?")}`
    : titleCase(item.category || "?");

  const effectsKeys = item.effects ? Object.entries(item.effects).map(([k,v]) => `${k}: ${v}`).join(", ") : "none";

  return (
    `${DIVIDER}\n` +
    `📜  *ITEM DETAILS*\n` +
    `${DIVIDER}\n\n` +
    `${icon} *${item.name}*\n` +
    `🆔 ID: \`${item.id}\`\n` +
    `💠 Rarity: *${item.rarity}*\n` +
    `🗂 Type: *${type}*\n` +
    (item.faction ? `⚔️ Faction: *${titleCase(item.faction)}*\n` : "") +
    `📦 Owned: *${qty}*\n` +
    `⚡ Effect: ${item.effect || "None"}\n` +
    `📜 ${item.desc || "No description."}\n\n` +
    `${DIVIDER}`
  );
}

function buildConsumeResultText({ item, usedAmount, before, after, log, remaining }) {
  const icon = itemsSystem.getRarityIcon(item.rarity);
  const changes = [];
  if (after.hp  !== before.hp)     changes.push(`❤️ HP: *${before.hp} → ${after.hp}*`);
  if (after.en  !== before.en)     changes.push(`⚡ Energy: *${before.en} → ${after.en}*`);

  return (
    `${DIVIDER}\n` +
    `🧪  *ITEM USED*\n` +
    `${DIVIDER}\n\n` +
    `${icon} *${item.name}* ×${usedAmount}\n\n` +
    (log.length   ? log.join("\n") + "\n\n"  : "") +
    (changes.length ? changes.join("\n") + "\n\n" : "") +
    `📦 Remaining: *${remaining}*\n` +
    `${DIVIDER}`
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — COMMANDS
// ══════════════════════════════════════════════════════════════

async function cmdInventory(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });

  itemsSystem.ensurePlayerItemData(player);
  syncEnergyFromHuntState(player, senderId);
  applyGearEffects(player); // recalculate gear passives

  const name = player.username?.trim() || "Unnamed Lumorian";
  return sock.sendMessage(chatId, { text: buildInventoryText(player, name) }, { quoted: msg });
}

async function cmdItem(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });

  const query = args.join(" ").trim();
  if (!query) return sock.sendMessage(chatId, { text: "Usage: `.item <name or id>`" }, { quoted: msg });

  const item = itemsSystem.findItem(query);
  if (!item) return sock.sendMessage(chatId, { text: `❌ Item not found: *${query}*` }, { quoted: msg });

  itemsSystem.ensurePlayerItemData(player);
  const qty = itemsSystem.getItemQuantity(player, item.id);
  return sock.sendMessage(chatId, { text: buildItemDetailText(item, qty) }, { quoted: msg });
}

// Effects that require picking a specific party mora as their target.
const MORA_TARGET_EFFECTS = ["removeCorruption", "primordialReduce"];

// Resolve a target mora from a party-slot number (1..5) or a name fragment.
// Returns the mora object from player.moraOwned, or null.
function findPartyMoraTarget(player, token) {
  const owned = Array.isArray(player?.moraOwned) ? player.moraOwned : [];
  const party = Array.isArray(player?.party) ? player.party : [];

  const t = String(token || "").trim();
  if (!t) return null;

  if (/^[1-5]$/.test(t)) {
    const ownedIdx = party[Number(t) - 1];
    if (Number.isInteger(ownedIdx) && owned[ownedIdx]) return owned[ownedIdx];
    return null;
  }

  const needle = t.toLowerCase();
  for (const ownedIdx of party) {
    if (!Number.isInteger(ownedIdx)) continue;
    const m = owned[ownedIdx];
    if (m && String(m.name || "").toLowerCase().includes(needle)) return m;
  }
  return null;
}

async function cmdConsume(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });

  itemsSystem.ensurePlayerItemData(player);
  syncEnergyFromHuntState(player, senderId);

  if (!args.length) return sock.sendMessage(chatId, { text: "Usage: `.consume <name or id> [amount | party-slot | mora-name]`" }, { quoted: msg });

  // Find the item by trying successively shorter prefixes of args.
  // This lets multi-word items like "cleanse shard" coexist with a trailing
  // target token (slot number or mora name).
  let item = null;
  let itemWordCount = args.length;
  while (itemWordCount > 0) {
    const q = args.slice(0, itemWordCount).join(" ").trim();
    const found = itemsSystem.findItem(q);
    if (found) { item = found; break; }
    itemWordCount--;
  }
  if (!item) return sock.sendMessage(chatId, { text: `❌ Item not found: *${args.join(" ")}*` }, { quoted: msg });

  const tail = args.slice(itemWordCount);

  // Scrolls are also consumed via this command
  const isConsumable = item.category === "consumable" || item.category === "scroll";
  if (!isConsumable) {
    return sock.sendMessage(chatId, {
      text: `❌ *${item.name}* cannot be consumed.\n` +
            (item.category === "gear" ? `Use *.equip ${item.id}* to equip it instead.` : ""),
    }, { quoted: msg });
  }

  const owned = itemsSystem.getItemQuantity(player, item.id);
  if (owned <= 0) return sock.sendMessage(chatId, { text: `❌ You don't own any *${item.name}*.` }, { quoted: msg });

  // Faction check for scrolls
  if (item.category === "scroll" && item.faction && player.faction !== item.faction) {
    return sock.sendMessage(chatId, {
      text:
        `🚫 *${item.name}* is a *${titleCase(item.faction)}* scroll.\n` +
        `You are in the *${titleCase(player.faction || "no")}* faction.\n` +
        `This scroll's power does not respond to you.`,
    }, { quoted: msg });
  }

  // Get effects — scrolls use SCROLL_EFFECTS, consumables use item.effects
  const effects = item.category === "scroll"
    ? (SCROLL_EFFECTS[item.id] || {})
    : (item.effects || {});

  if (!Object.keys(effects).length) {
    return sock.sendMessage(chatId, {
      text: `⚠️ *${item.name}* has no implemented effect yet.\n_(Effect: ${item.effect || "none"})_`,
    }, { quoted: msg });
  }

  // Resolve tail: either a numeric amount or a party-mora target token.
  // Effects like removeCorruption require the user to pick which party mora
  // to target — otherwise cleanse picks arbitrarily or fails silently.
  const needsTarget = Object.keys(effects).some(k => MORA_TARGET_EFFECTS.includes(k));
  let amount = 1;
  let targetMora = null;

  if (needsTarget) {
    if (!tail.length) {
      return sock.sendMessage(chatId, {
        text: `❌ *${item.name}* needs a target.\n` +
              `Usage: \`.consume ${String(item.name).toLowerCase()} <party-slot 1-5 | mora name>\`\n` +
              `Example: \`.consume ${String(item.name).toLowerCase()} 2\` or \`.consume ${String(item.name).toLowerCase()} sparko\``,
      }, { quoted: msg });
    }
    const targetToken = tail.join(" ").trim();
    targetMora = findPartyMoraTarget(player, targetToken);
    if (!targetMora) {
      return sock.sendMessage(chatId, {
        text: `❌ No mora in your party matches *${targetToken}*.\nCheck \`.party\` to see your 5 party slots.`,
      }, { quoted: msg });
    }
    if (Object.keys(effects).includes("removeCorruption") && !targetMora.corrupted) {
      return sock.sendMessage(chatId, {
        text: `✨ *${targetMora.name}* isn't corrupted — no need to cleanse.`,
      }, { quoted: msg });
    }
  } else if (tail.length && /^\d+$/.test(tail[0])) {
    amount = Math.max(1, Number(tail[0]));
  }

  const useAmount = Math.min(amount, owned);

  const maxHp  = getPlayerMaxHp(player);
  const maxEn  = getPlayerMaxHuntEnergy(player);

  // Check if anything can be gained (skip if already at max AND effect only heals/energizes)
  const healsOnly = Object.keys(effects).every(k => ["heal","energy","playerHpRestore","moraHpRestore"].includes(k));
  if (healsOnly) {
    const atFullHp = Number(player.playerHp || 0) >= maxHp;
    const atFullEn = Number(player.huntEnergy || 0) >= maxEn;
    if (atFullHp && atFullEn) {
      return sock.sendMessage(chatId, { text: `⚠️ You are already at full HP and Energy.` }, { quoted: msg });
    }
  }

  const before = { hp: Number(player.playerHp || 0), en: Number(player.huntEnergy || 0) };

  const allLog = [];
  for (let i = 0; i < useAmount; i++) {
    const { log } = applyItemEffects(player, effects, { targetMora });
    allLog.push(...log);
  }

  // Clamp after applying
  player.playerHp   = clamp(player.playerHp   || 0, 0, maxHp);
  player.huntEnergy = clamp(player.huntEnergy  || 0, 0, maxEn);

  // Remove from inventory
  const newQty = owned - useAmount;
  if (newQty <= 0) delete player.inventory[item.id];
  else             player.inventory[item.id] = newQty;

  const after = { hp: player.playerHp, en: player.huntEnergy };

  if (typeof savePlayers === "function") savePlayers(players);

  // Deduplicate log
  const deduped = [...new Set(allLog)];

  const text = buildConsumeResultText({
    item, usedAmount: useAmount, before, after,
    log: deduped, remaining: newQty,
  });

  return sock.sendMessage(chatId, { text }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  cmdInventory,
  cmdItem,
  cmdConsume,
  applyItemEffects,
  applyGearEffects,
  SCROLL_EFFECTS,
  syncEnergyFromHuntState,
};
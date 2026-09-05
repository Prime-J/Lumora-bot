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

const ui = require("./ui");
const interactiveUI = require("./interactiveUI");
const progression = require("./progression");

function buildSection(title, lines = []) {
  if (!lines.length) return "";
  return `${ui.subheader(title)}\n${lines.join("\n")}`;
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
// SECTION 2 — EFFECTS ENGINE  (v0.8.0)
// Handles every effect key in items.json. After the rework, "Mora-targeting"
// effects are redirected — there are no party Mora to act on anymore.
//   • removeCorruption → purifies the first corrupted shard in vault
//   • moraHpRestore    → heals player.playerHp (legacy alias for heal)
//   • primordialReduce → reduces player.riftPE
//   • primordialInstant→ increases player.riftPE
// New effect keys added in v0.8.0:
//   • purifyShard, healFull, energyRefill, resonanceBoost,
//     intelligenceBoost, statBoost (with stat field), forceShardDropNext,
//     questHintRefresh, statPointsGrant
// ctx is optional — passes loadMora for shard cleanse lookups.
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
        if (typeof player.baseMaxHp !== "number") {
          player.baseMaxHp = Math.max(100, Number(player.playerMaxHp || 100));
        }
        player.baseMaxHp   = clamp(Number(player.baseMaxHp) + n, 10, 9999);
        player.playerMaxHp = clamp(Number(player.baseMaxHp) + Number(player.passives?.gearBonusMaxHp || 0), 10, 9999);
        player.playerHp    = clamp(Number(player.playerHp    || 0), 0, player.playerMaxHp);
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
      // v0.8.0: PE now lives on the player (player.riftPE), not on Mora.
      case "primordialReduce": {
        const before = Number(player.riftPE || 0);
        player.riftPE = Math.max(0, before - n);
        const reduced = before - player.riftPE;
        if (reduced > 0) log.push(`🌀 Rift PE reduced by *${reduced}* (now ${player.riftPE})`);
        else             log.push(`🌀 Rift PE is already at 0.`);
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
      // v0.8.0: redirected — there are no party Mora to cleanse. Instead,
      // purify the player's first CORRUPTED SHARD in the vault (no Lucon cost).
      case "removeCorruption":
      case "purifyShard": {
        try {
          const shardSystem = require("./shards");
          shardSystem.ensureShardFields(player);
          const corrEntry = Object.entries(player.shards).find(
            ([k, count]) => Number(count) > 0 && shardSystem.isCorruptedKey(k)
          );
          if (!corrEntry) {
            log.push(`🧼 No corrupted shards to purify.`);
            break;
          }
          const [corrKey] = corrEntry;
          const baseKey = shardSystem.stripCorrupted(corrKey);

          // Cap check on normal slot first — refuse if it would overflow
          const cap = shardSystem.getStorageCap(player, baseKey);
          const have = shardSystem.getShardCount(player, baseKey);
          if (have >= cap) {
            log.push(`🧼 Normal vault for that shard is full (${have}/${cap}) — purify aborted.`);
            break;
          }

          player.shards[corrKey] -= 1;
          if (player.shards[corrKey] <= 0) delete player.shards[corrKey];
          player.shards[baseKey] = have + 1;

          // Try to name the species in the log
          let label = baseKey;
          try {
            const list = (ctx.loadMora || (() => []))();
            const sp = list.find((m) => String(m.id).toLowerCase() === baseKey);
            if (sp?.name) label = sp.name;
          } catch {}
          log.push(`🧼 Corrupted *${label}* shard cleansed back to normal.`);
        } catch (e) {
          log.push(`🧼 Purification failed: ${e?.message || "unknown"}`);
        }
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
        // v0.8.0: redirected — no party Mora. Treat as a player heal.
        const before = Number(player.playerHp || 0);
        player.playerHp = clamp(before + n, 0, maxHp);
        const gained = player.playerHp - before;
        if (gained > 0) log.push(`❤️ HP restored: *+${gained}* (legacy mora-heal redirected)`);
        else            log.push(`❤️ Already at full HP.`);
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
        // v0.8.0: redirected — PE is a player stat now.
        const before = Number(player.riftPE || 0);
        player.riftPE = Math.min(100, before + n);
        const gained = player.riftPE - before;
        if (gained > 0) log.push(`🌀 Rift PE: *+${gained}* (now ${player.riftPE})`);
        else            log.push(`🌀 Rift PE already maxed at 100.`);
        break;
      }

      // ══════════════════════════════════════════════════════
      // v0.8.0 NEW EFFECTS
      // ══════════════════════════════════════════════════════

      // Full HP heal
      case "healFull": {
        const before = Number(player.playerHp || 0);
        player.playerHp = maxHp;
        const gained = player.playerHp - before;
        if (gained > 0) log.push(`❤️ Restored *${gained}* HP — back to full (${maxHp}/${maxHp})`);
        else             log.push(`❤️ Already at full HP.`);
        break;
      }

      // Full combat-energy refill
      case "energyRefill": {
        if (typeof player.combatMaxEnergy !== "number") player.combatMaxEnergy = 50;
        if (typeof player.combatEnergy    !== "number") player.combatEnergy    = player.combatMaxEnergy;
        const before = Number(player.combatEnergy);
        player.combatEnergy = player.combatMaxEnergy;
        const gained = player.combatEnergy - before;
        log.push(`🔋 Combat energy restored: *+${gained}* (full ${player.combatMaxEnergy}/${player.combatMaxEnergy})`);
        break;
      }

      // Resonance boost
      case "resonanceBoost": {
        const resResult = progression.addFactionStat(player, n);
        log.push(`💠 ${progression.getFactionStatEmoji(player.faction)} *${progression.getFactionStatKey(player.faction).charAt(0).toUpperCase() + progression.getFactionStatKey(player.faction).slice(1)}*: *+${n}* (now ${resResult.newValue})`);
        break;
      }

      // Intelligence boost
      case "intelligenceBoost": {
        player.intelligence = Number(player.intelligence || 0) + n;
        log.push(`🧠 Intelligence: *+${n}* (now ${player.intelligence})`);
        break;
      }

      // Companion bond boost
      case "bondBoost": {
        if (player.companion) {
          if (!player.companionBond) player.companionBond = {};
          const key = player.companion;
          player.companionBond[key] = Number(player.companionBond[key] || 0) + n;
          log.push(`❤️ Companion bond: *+${n}* (now ${player.companionBond[key]})`);
        } else {
          log.push(`⚠️ No companion set — use *.companion <mora>* first.`);
        }
        break;
      }
      // Force next wild defeat to drop a shard (sets a one-shot passive)
      case "forceShardDropNext": {
        if (!player.passives) player.passives = {};
        player.passives.forceShardDropNext = true;
        log.push(`💎 *Shard Lure* primed — your next wild defeat guarantees a shard drop.`);
        break;
      }

      // Grant unspent stat points directly
      case "statPointsGrant": {
        try {
          const st = require("./stats");
          st.ensureStatFields(player);
          player.statPoints = Number(player.statPoints || 0) + n;
          log.push(`📊 Stat points granted: *+${n}* (unspent: ${player.statPoints})`);
        } catch (e) {
          log.push(`📊 Failed to grant stat points: ${e?.message || "unknown"}`);
        }
        break;
      }

      // Re-DM the next pending NPC hint for active chain quests
      case "questHintRefresh": {
        try {
          const qs    = require("./quests");
          const quests = qs.loadQuests();
          const hints = [];
          for (const [qId, active] of Object.entries(player.quests?.active || {})) {
            const def = quests[qId];
            if (!def || def.requirement?.kind !== "chain") continue;
            const sp = active.stepProgress || {};
            for (let i = 0; i < def.requirement.steps.length; i++) {
              if (sp[i]) continue;
              const step = def.requirement.steps[i];
              if (step.kind === "meetNpc" && def.hiddenCommands?.[step.npc]) {
                hints.push(
                  `📜 *${def.name}* — next: *${step.label || `Find ${step.npc}`}*\n` +
                  `   Hidden command: *.${def.hiddenCommands[step.npc].cmd}*`
                );
              }
              break; // only the FIRST incomplete step
            }
          }
          if (!hints.length) {
            log.push(`🧭 No pending chain-quest hints to refresh.`);
          } else {
            log.push(`🧭 *Quest Compass* spoke. Hints refreshed below:`);
            for (const h of hints) log.push(h);
          }
        } catch (e) {
          log.push(`🧭 Compass failed: ${e?.message || "unknown"}`);
        }
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

    // maxHp on gear is a passive bonus — apply the other effects for their
    // passives, but never let it mutate the player's permanent baseMaxHp.
    const gearPassives = { ...item.effects };
    delete gearPassives.maxHp;
    if (Object.keys(gearPassives).length) applyItemEffects(player, gearPassives, {});

    if (item.effects.maxHp) bonusMaxHp += Number(item.effects.maxHp);
  }

  // Apply HP bonus without triggering consume logging.
  // Permanent max-HP boosts (from consumed items) live in player.baseMaxHp;
  // gear adds on top instead of clobbering the permanent value.
  if (typeof player.baseMaxHp !== "number") {
    player.baseMaxHp = Math.max(100, Number(player.playerMaxHp || 100));
  }
  player.passives.gearBonusMaxHp = bonusMaxHp;
  player.playerMaxHp = Number(player.baseMaxHp) + bonusMaxHp;
  player.playerHp = clamp(player.playerHp || 0, 0, player.playerMaxHp);
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
    buildSection("Consumables",    sections.consumables),
    buildSection("Scrolls",        sections.scrolls),
    buildSection("Hunting Items",  sections.hunting),
    buildSection("Materials",      sections.materials),
    buildSection("Gear",           sections.gear),
    buildSection("Crystals",       sections.crystals),
    buildSection("Access",         sections.access),
    buildSection("Special",        sections.specials),
    buildSection("Other",          sections.misc),
  ].filter(Boolean);

  const empty = `🌌 Your inventory is empty.\nVisit *.market* or your faction market to stock up.`;

  return (
    ui.header('INVENTORY', '🎒') + `\n\n` +
    `👤 ${targetName}\n` +
    ui.card('STATUS', '📦', [
      { emoji: '📦', label: 'Storage', value: `${used}/${cap}` },
      { emoji: '❤️', label: 'HP', value: `${Number(player.playerHp || 0)}/${getPlayerMaxHp(player)}` },
      { emoji: '⚡', label: 'Energy', value: `${Number(player.huntEnergy || 0)}/${getPlayerMaxHuntEnergy(player)}` },
    ]) + `\n\n` +
    (parts.length ? parts.join(`\n\n${ui.DIVIDER}\n\n`) : empty) +
    `\n\n${ui.DIV}\n` +
    `📖 Commands:\n` +
    `*.item <name>*  ·  *.consume <name>*  ·  *.gear*`
  );
}

function buildItemDetailText(item, qty = 0) {
  const icon  = itemsSystem.getRarityIcon(item.rarity);
  const type  = item.category === "gear"
    ? `Gear · ${titleCase(item.slot || "?")}`
    : titleCase(item.category || "?");

  // Usage hint
  let usage = '';
  const id = (item.id || '').toUpperCase();
  if (item.category === 'consumable') {
    usage = '.consume ' + item.name;
  } else if (item.category === 'gear') {
    usage = '.equip ' + item.name;
  } else if (item.category === 'scroll') {
    usage = '.use ' + item.name;
  } else if (id.startsWith('MUT_')) {
    usage = '.mutate <mora> (uses ' + item.name + ' from inventory)';
  } else if (id === 'RES_001') {
    usage = '.escape (during raid capture)';
  } else if (id === 'CREATION_POWDER' || id === 'REOB') {
    usage = '.create-mora (Lumora Labs)';
  } else if (id === 'PROFILE_MASK') {
    usage = '.mask / .unmask (toggle profile visibility)';
  } else if (id.includes('GLOVE')) {
    usage = '.rob @user (attempt snatch)';
  } else if (id.startsWith('CRY_')) {
    usage = '.fortify-wall ' + item.name;
  }

  const rows = [
    { emoji: "🆔", label: 'ID', value: item.id },
    { emoji: "💎", label: 'Rarity', value: item.rarity },
    { emoji: "📂", label: 'Type', value: type },
    ...(item.faction ? [{ emoji: "⚔️", label: 'Faction', value: titleCase(item.faction) }] : []),
    { emoji: "📦", label: 'Owned', value: String(qty) },
    { emoji: "⚡", label: 'Effect', value: item.effect || 'None' },
    ...(usage ? [{ emoji: "👆", label: 'How to use', value: usage }] : []),
  ];

  return (
    ui.header(item.name, icon) + `

` +
    ui.card('DETAILS', "📜", rows) + `

` +
    `📜 ${item.desc || "No description."}`
  );
}

function buildConsumeResultText({ item, usedAmount, before, after, log, remaining }) {
  const icon = itemsSystem.getRarityIcon(item.rarity);
  const changes = [];
  if (after.hp  !== before.hp)     changes.push(`❤️ HP: *${before.hp} → ${after.hp}*`);
  if (after.en  !== before.en)     changes.push(`⚡ Energy: *${before.en} → ${after.en}*`);

  return (
    ui.header('ITEM USED', '🧪') + `\n\n` +
    `${icon} *${item.name}* ×${usedAmount}\n\n` +
    (log.length   ? log.join("\n") + "\n\n"  : "") +
    (changes.length ? changes.join("\n") + "\n\n" : "") +
    `📦 Remaining: *${remaining}*`
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — COMMANDS
// ══════════════════════════════════════════════════════════════

async function cmdInventory(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using `.register`." }, { quoted: msg });

  itemsSystem.ensurePlayerItemData(player);
  syncEnergyFromHuntState(player, senderId);
  applyGearEffects(player); // recalculate gear passives

  const name = player.username?.trim() || "Unnamed Lumorian";
  const page = Math.max(1, parseInt(args[0], 10) || 1);

  // Send interactive list menu for inventory browsing
  await interactiveUI.sendInventoryMenu(sock, chatId, player.inventory || {}, msg);

  // Visual inventory — falls back to the text card if render fails or it's empty.
  // Canvas module is optional (excluded from deploy for now); lazy-require it.
  try {
    const { generateInventoryCard } = require("./inventoryCanvas");
    const card = await generateInventoryCard(player, { page });
    if (card) {
      const itemsDb = itemsSystem.loadItems();
      const used = itemsSystem.getUsedStorage(player, itemsDb);
      const cap = itemsSystem.getPlayerStorageCapacity(player, itemsDb);
      const caption =
        `🎒 *${name}* — ${used}/${cap} used\n` +
        (page > 1 ? `_Page ${page}_\n` : ``) +
        `_Tap an item's name to look it up with .item <name>_`;
      return sock.sendMessage(chatId, { image: card, caption }, { quoted: msg });
    }
  } catch (err) {
    console.log(`[inventory] image render failed — falling back to text:`, err?.message || err);
  }
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

// NOTE: legacy mora-target effects (removeCorruption / primordialReduce) no
// longer act on party Mora — they target the player's shard vault and rift PE
// directly. A party-slot/mora target is neither required nor honored.

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

  // (Faction scroll barrier removed — any faction can use any scroll)

  // Get effects — scrolls use SCROLL_EFFECTS, consumables use item.effects
  const effects = item.category === "scroll"
    ? (SCROLL_EFFECTS[item.id] || {})
    : (item.effects || {});

  if (!Object.keys(effects).length) {
    return sock.sendMessage(chatId, {
      text: `⚠️ *${item.name}* has no implemented effect yet.\n_(Effect: ${item.effect || "none"})_`,
    }, { quoted: msg });
  }

  let amount = 1;

  if (tail.length && /^\d+$/.test(tail[0])) {
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
    // Only block if the item can't restore anything the player actually needs
    const canHeal   = ("heal" in effects || "playerHpRestore" in effects) && !atFullHp;
    const canEnergy = ("energy" in effects) && !atFullEn;
    if (!canHeal && !canEnergy) {
      return sock.sendMessage(chatId, { text: `⚠️ You are already at full HP and Energy.` }, { quoted: msg });
    }
  }

  const before = { hp: Number(player.playerHp || 0), en: Number(player.huntEnergy || 0) };

  const allLog = [];
  for (let i = 0; i < useAmount; i++) {
    const { log } = applyItemEffects(player, effects);
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
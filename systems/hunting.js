// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA HUNTING SYSTEM  v3.0 — "Into the Wild"              ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// ROOT CAUSE OF CRASH — FIXED:
//   cmdHunt was destructuring loadHuntState/loadGrounds/ensureHunter
//   from ctx, but index.js never puts those in ctx. They are
//   internal module functions. All commands now call them directly.
//
// NEW FEATURES ADDED:
//   ✦ Hunter Journal  — .journal  shows your hunt history, streak,
//                       terrains visited, total Mora caught.
//   ✦ Weather System  — random weather per hunt affects encounter
//                       rates, terrain damage, energy costs.
//   ✦ Relic Fragments — rare find during hunts. Collect 5 to
//                       assemble a Rift Relic via .assemble.
//   ✦ Hunt Bounties   — daily target Mora type (e.g. "Find 2 Flame
//                       Mora today"). Completing gives bonus Lucons.
//   ✦ Exhaustion Warn — when energy drops below 20% a warning fires
//                       so player knows to head back.
//   ✦ Lucky Streak    — 5+ hunt streak gives a 15% encounter boost.
//   ✦ Danger Pulse    — nightmare diff has chance to damage ALL
//                       party Mora (terrain brutality event).
//   ✦ Terrain Memory  — .lastterrain shows your last 3 terrains.
//
// ARCHITECTURE NOTE:
//   ctx (from index.js) contains:
//     sock, players, savePlayers, loadMora,
//     battleMath, xpSystem, auraSystem, hpBar,
//     createOwnedMoraFromSpecies, battleSystem,
//     settings, isOwner, assets, mentionTag, primordial
//
//   loadHuntState, saveHuntState, loadGrounds, ensureHunter etc.
//   are all LOCAL to this file. Never destructure them from ctx.
// ═══════════════════════════════════════════════════════════════

"use strict";

const fs   = require("fs");
const path = require("path");

const encountersSystem    = require("./encounters");
const itemsSystem         = require("./items");
const factionMarketSystem = require("./factionMarket");
const missionSystem       = require("./factionMissionSystem");

// ── PATHS ────────────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, "..", "data");
const GROUNDS_FILE    = path.join(DATA_DIR, "hunting_grounds.json");
const HUNT_STATE_FILE = path.join(DATA_DIR, "hunt_state.json");
const BOUNTY_FILE     = path.join(DATA_DIR, "hunt_bounties.json");

// ── VISUAL CONSTANTS ─────────────────────────────────────────
const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─";

// ══════════════════════════════════════════════════════════════
// SECTION 1 — FILE HELPERS
// ══════════════════════════════════════════════════════════════
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

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadGrounds() {
  return loadJSON(GROUNDS_FILE, {});
}

function loadHuntState() {
  return loadJSON(HUNT_STATE_FILE, { players: {}, defaults: {} });
}

function saveHuntState(data) {
  saveJSON(HUNT_STATE_FILE, data);
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — HUNTER STATE MANAGEMENT
// ══════════════════════════════════════════════════════════════
function ensureHunter(state, jid) {
  if (!state)         state = {};
  if (!state.players) state.players = {};

  if (!state.players[jid]) {
    state.players[jid] = {
      location:              "capital",
      huntEnergy:            200,
      huntEnergyMax:         200,
      huntStreak:            0,
      totalHunts:            0,
      totalMoraCaught:       0,
      pendingTravel:         null,
      activeEncounter:       null,
      activeTracks:          null,
      pendingItem:           null,
      returnCooldownUntil:   0,
      lastHuntAt:            0,
      currentDifficulty:     null,
      terrainHistory:        [],
      relicFragments:        0,
      lastTerrainDamageAt:   0,
      bountyProgress:        {},
      weatherExpiry:         0,
      currentWeather:        null,
    };
  }

  const h = state.players[jid];

  // ── Field guards (safe defaults for old players) ──────────
  if (typeof h.location           !== "string")  h.location           = "capital";
  if (typeof h.huntEnergy         !== "number")  h.huntEnergy         = 200;
  if (typeof h.huntEnergyMax      !== "number")  h.huntEnergyMax      = 200;
  if (typeof h.huntStreak         !== "number")  h.huntStreak         = 0;
  if (typeof h.totalHunts         !== "number")  h.totalHunts         = 0;
  if (typeof h.totalMoraCaught    !== "number")  h.totalMoraCaught    = 0;
  if (!("pendingTravel"    in h)) h.pendingTravel    = null;
  if (!("activeEncounter"  in h)) h.activeEncounter  = null;
  if (!("activeTracks"     in h)) h.activeTracks     = null;
  if (!("pendingItem"      in h)) h.pendingItem      = null;
  if (typeof h.returnCooldownUntil !== "number") h.returnCooldownUntil = 0;
  if (typeof h.lastHuntAt          !== "number") h.lastHuntAt          = 0;
  if (!("currentDifficulty" in h)) h.currentDifficulty = null;
  if (!Array.isArray(h.terrainHistory)) h.terrainHistory = [];
  if (typeof h.relicFragments     !== "number")  h.relicFragments     = 0;
  if (typeof h.lastTerrainDamageAt !== "number") h.lastTerrainDamageAt = 0;
  if (!h.bountyProgress || typeof h.bountyProgress !== "object") h.bountyProgress = {};
  if (typeof h.weatherExpiry !== "number") h.weatherExpiry = 0;
  if (!("currentWeather" in h)) h.currentWeather = null;

  return h;
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — WEATHER SYSTEM
// ══════════════════════════════════════════════════════════════
// Weather changes every 2 hours per player and affects:
//   ☀️ Clear:      Normal conditions
//   🌧 Rain:       +10% item find chance, Flame terrain less harsh
//   ⚡ Storm:      +15% wild encounter, +terrain damage
//   🌫 Mist:       -20% encounter rate, tracks easier to lose
//   🌑 Rift Surge: +30% corrupted chance, more relic fragments
//   ❄️ Frost Snap: Frost terrain free, all others +damage

const WEATHERS = [
  { id: "clear",      icon: "☀️",  label: "Clear",      itemBonus: 0,    encBonus: 0,    dmgMult: 1.0, trackLoss: 0,     relicBonus: 0,    desc: "Ideal hunting conditions." },
  { id: "rain",       icon: "🌧",  label: "Rain",       itemBonus: 0.10, encBonus: -0.05, dmgMult: 0.8, trackLoss: 0,    relicBonus: 0,    desc: "Rain dampens flames but loosens the earth. Items surface more easily." },
  { id: "storm",      icon: "⚡",  label: "Storm",      itemBonus: 0,    encBonus: 0.15, dmgMult: 1.3, trackLoss: 0.1,  relicBonus: 0,    desc: "Lightning tears the sky. Wild encounters surge. Stay alert." },
  { id: "mist",       icon: "🌫",  label: "Rift Mist",  itemBonus: 0,    encBonus: -0.20, dmgMult: 1.0, trackLoss: 0.2, relicBonus: 0,    desc: "The Primordial Rift breathes mist across the terrain. Tracks vanish quickly." },
  { id: "rift_surge", icon: "🌑",  label: "Rift Surge", itemBonus: 0,    encBonus: 0.10, dmgMult: 1.2, trackLoss: 0,    relicBonus: 2,    desc: "Raw Rift energy spikes across the land. Corrupted Mora are restless. Relics surface." },
  { id: "frost_snap", icon: "❄️", label: "Frost Snap",  itemBonus: 0,    encBonus: 0,    dmgMult: 1.15, trackLoss: 0,  relicBonus: 0,    desc: "Temperature plummets. Frost terrain hunters rejoice. Everyone else: brace." },
];

function getOrRollWeather(hunter) {
  const now = Date.now();
  // Weather lasts 2 hours per player
  if (hunter.currentWeather && hunter.weatherExpiry > now) {
    return WEATHERS.find(w => w.id === hunter.currentWeather) || WEATHERS[0];
  }
  // Roll new weather — rift surge and storm are rarer
  const weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
  hunter.currentWeather = weather.id;
  hunter.weatherExpiry  = now + 2 * 60 * 60 * 1000;
  return weather;
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — DAILY BOUNTY SYSTEM
// ══════════════════════════════════════════════════════════════
// Each day a random Mora type is the "bounty target".
// First player to catch 2 of that type gets 500 Lucon bonus.
// Bounty resets at midnight.

const BOUNTY_TYPES = ["Flame", "Aqua", "Nature", "Terra", "Volt", "Frost", "Wind", "Shadow"];

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadBounties() {
  return loadJSON(BOUNTY_FILE, {});
}
function saveBounties(b) { saveJSON(BOUNTY_FILE, b); }

function getTodayBounty() {
  const bounties = loadBounties();
  const today    = getTodayKey();
  if (!bounties[today]) {
    // Deterministically pick based on date so all players see the same target
    const seed = today.split("-").reduce((a, n) => a + Number(n), 0);
    bounties[today] = { type: BOUNTY_TYPES[seed % BOUNTY_TYPES.length], reward: 500 };
    saveBounties(bounties);
  }
  return bounties[today];
}

function checkBountyProgress(hunter, caughtType, player) {
  const bounty = getTodayBounty();
  const today  = getTodayKey();
  if (!hunter.bountyProgress[today]) hunter.bountyProgress[today] = 0;

  if (String(caughtType || "").toLowerCase() === bounty.type.toLowerCase()) {
    hunter.bountyProgress[today] += 1;
    if (hunter.bountyProgress[today] >= 2 && !hunter.bountyCompletedToday) {
      hunter.bountyCompletedToday = today;
      player.lucons = (player.lucons || 0) + bounty.reward;
      return { completed: true, reward: bounty.reward, type: bounty.type };
    }
  }
  return { completed: false, progress: hunter.bountyProgress[today], type: bounty.type };
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — TERRAIN & DAMAGE HELPERS
// ══════════════════════════════════════════════════════════════
function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function normalizeGroundQuery(query = "") {
  return String(query).trim().toLowerCase().replace(/\s+/g, "_");
}

function mentionText(jid, text) {
  return { text: text.replace(/\{mention\}/g, `@${String(jid).split("@")[0]}`), mentions: [jid] };
}

function getWildBattleSystem() { return require("./wildbattle"); }

function ensurePlayerVitals(player) {
  if (!player || typeof player !== "object") return;
  if (typeof player.playerMaxHp !== "number") player.playerMaxHp = 100;
  if (typeof player.playerHp    !== "number") player.playerHp    = player.playerMaxHp;
  player.playerHp = Math.max(0, Math.min(player.playerHp, player.playerMaxHp));
}

// Hunt energy regen — call from any hunting command so energy keeps ticking
// regardless of which command the player runs. 50% of max per 6h tick.
const HUNT_REGEN_INTERVAL_MS = 6 * 60 * 60 * 1000;
function regenHuntEnergy(player) {
  if (!player || typeof player !== "object") return;
  ensurePlayerVitals(player);

  const maxE = Number(player.maxHuntEnergy || 200);
  player.maxHuntEnergy = maxE;
  if (typeof player.huntEnergy !== "number") player.huntEnergy = maxE;

  const now  = Date.now();
  const last = Number(player.lastHuntRefill || 0);

  // First-time setup — just stamp it, don't grant a free tick
  if (!last) {
    player.lastHuntRefill = now;
    return;
  }

  if (player.huntEnergy >= maxE) {
    // Full energy — keep timer current so it doesn't accumulate dead ticks
    player.lastHuntRefill = now;
    return;
  }

  const elapsed = now - last;
  if (elapsed < HUNT_REGEN_INTERVAL_MS) return;

  const ticks       = Math.floor(elapsed / HUNT_REGEN_INTERVAL_MS);
  const regenAmount = ticks * Math.floor(maxE * 0.5); // 50% of max per tick
  player.huntEnergy    = Math.min(maxE, Number(player.huntEnergy || 0) + regenAmount);
  // Advance the refill timestamp by the consumed ticks (not all of `now`)
  // so partial progress toward the next tick is preserved.
  player.lastHuntRefill = last + ticks * HUNT_REGEN_INTERVAL_MS;
}

function getEquippedItem(player, slot) {
  if (!player?.equipment) return null;
  const id = player.equipment[slot];
  if (!id) return null;
  return itemsSystem.getItemById(id);
}

function getTerrainProtection(player, ground) {
  const candidates = ["cloak", "boots", "tool"].map(s => getEquippedItem(player, s)).filter(Boolean);
  const gType = String(ground?.type || "").toLowerCase();
  const hazard = String(ground?.hazard || "").toLowerCase();

  for (const item of candidates) {
    const eff = String(item.effect || "").toLowerCase();
    if (gType === "flame"  && (eff.includes("heat damage") || eff.includes("volcanic"))) return item;
    if (gType === "volt"   && eff.includes("lightning"))                                  return item;
    if (gType === "frost"  && eff.includes("freezing wind"))                              return item;
    if (gType === "terra"  && (eff.includes("earthquake") || eff.includes("ground hazards"))) return item;
    if (gType === "shadow" && eff.includes("aura drain"))                                 return item;
    if (gType === "rift"   && eff.includes("corruption buildup"))                         return item;
    if (hazard.includes("volcan")  && eff.includes("heat damage"))    return item;
    if (hazard.includes("storm")   && (eff.includes("storm") || eff.includes("lightning"))) return item;
    if (hazard.includes("freeze")  && eff.includes("freezing"))       return item;
    if (hazard.includes("earth")   && eff.includes("ground hazards")) return item;
  }
  return null;
}

function getTerrainDamageRange(diffKey, weather) {
  const base = { easy:[0,3], standard:[3,7], dangerous:[7,12], nightmare:[12,20] };
  const [min, max] = base[String(diffKey||"easy")] || [2,5];
  const mult = weather?.dmgMult || 1.0;
  return [Math.floor(min * mult), Math.ceil(max * mult)];
}

// Flavor text for terrain gear degradation
const TERRAIN_GEAR_WORN_FLAVOR = {
  "Ashen Veil":       "🔥 The heat is eating through the *Ashen Veil*...",
  "Stormshroud":      "⚡ Lightning cracks across the *Stormshroud* — it's taking strain.",
  "Frostmantle":      "❄️ The *Frostmantle* is icing over — durability dropping.",
  "Gloamwrap":        "🌑 Shadow aura is corroding the *Gloamwrap* from within.",
  "Emberthread":      "🔥 The *Emberthread* smolders — the heat is too intense.",
  "Quakewalkers":     "🌍 The tremors are cracking the soles of the *Quakewalkers*.",
  "Riftwalk Greaves": "🌀 Rift energy seeps into the *Riftwalk Greaves*, warping the metal.",
  "Deeproot Treads":  "🌿 The terrain is tearing at the roots woven into the *Deeproot Treads*.",
  "Tempest Striders": "⚡ The storm is shredding the stitching on the *Tempest Striders*.",
  "Faultstride Boots":"🌍 The earth is grinding down the *Faultstride Boots*.",
};
const TERRAIN_GEAR_DESTROYED_FLAVOR = {
  "Ashen Veil":       "🔥 The *Ashen Veil* has burned out completely. It crumbles to ash.",
  "Stormshroud":      "⚡ The *Stormshroud* explodes from the lightning overload. Gone.",
  "Frostmantle":      "❄️ The *Frostmantle* shatters into frozen shards.",
  "Gloamwrap":        "🌑 The *Gloamwrap* dissolves into shadow. It cannot be recovered.",
  "Emberthread":      "🔥 The *Emberthread* ignites and burns away entirely.",
  "Quakewalkers":     "🌍 The *Quakewalkers* crack apart under the seismic force.",
  "Riftwalk Greaves": "🌀 The *Riftwalk Greaves* are torn apart by unstable rift energy.",
  "Deeproot Treads":  "🌿 The *Deeproot Treads* are ripped apart by the terrain.",
  "Tempest Striders": "⚡ The *Tempest Striders* are destroyed by the storm.",
  "Faultstride Boots":"🌍 The *Faultstride Boots* are crushed by the quake.",
};

function applyTerrainGearWear(player) {
  const itemsSystem = require("./items");
  if (!player?.equipment) return null;
  // Only cloak and boots degrade from terrain
  const results = itemsSystem.applyDurabilityDamage(player, 0.5,
    Object.keys(player.equipment).filter(s => s !== "cloak" && s !== "boots")
  );
  if (!results.length) return null;
  const lines = [];
  for (const r of results) {
    if (r.status === "broken") {
      lines.push(TERRAIN_GEAR_DESTROYED_FLAVOR[r.item] || `💥 *${r.item}* has been destroyed by the terrain!`);
    } else {
      const flavor = TERRAIN_GEAR_WORN_FLAVOR[r.item];
      if (flavor) lines.push(`${flavor} _(${r.remaining} durability left)_`);
    }
  }
  return lines.length ? lines.join("\n") : null;
}

function applyTerrainEntryDamage(player, ground, diffKey, weather) {
  ensurePlayerVitals(player);
  const protector = getTerrainProtection(player, ground);
  if (protector) {
    // Even protective gear takes wear from terrain
    applyTerrainGearWear(player);
    return { damage: 0, prevented: true, protectorName: protector.name };
  }

  const [minD, maxD] = getTerrainDamageRange(diffKey, weather);
  if (maxD <= 0) return { damage: 0, prevented: false, protectorName: null, gearWear: null };

  const damage = Math.floor(Math.random() * (maxD - minD + 1)) + minD;
  player.playerHp = Math.max(0, Number(player.playerHp || 0) - damage);
  const gearWear = applyTerrainGearWear(player);
  return { damage, prevented: false, protectorName: null, gearWear };
}

function applyTerrainIdleDamage(player, hunter, ground, diffKey, weather) {
  ensurePlayerVitals(player);
  const now = Date.now();
  if (!hunter.lastTerrainDamageAt) { hunter.lastTerrainDamageAt = now; return null; }
  if (now - hunter.lastTerrainDamageAt < 180000) return null;
  hunter.lastTerrainDamageAt = now;

  const protector = getTerrainProtection(player, ground);
  if (protector) return { damage: 0, prevented: true, protectorName: protector.name };

  const dmgMap = { easy:[1,3], standard:[3,5], dangerous:[5,8], nightmare:[8,12] };
  const [min, max] = dmgMap[diffKey] || [2,4];
  const mult = weather?.dmgMult || 1.0;
  const damage = Math.floor((Math.floor(Math.random() * (max - min + 1)) + min) * mult);
  player.playerHp = Math.max(0, player.playerHp - damage);
  return { damage, prevented: false, protectorName: null };
}

function applyHuntTerrainStrain(player, ground, diffKey, weather) {
  ensurePlayerVitals(player);
  const protector = getTerrainProtection(player, ground);
  if (protector) return { damage: 0, prevented: true, protectorName: protector.name };

  const gType = String(ground?.type || "").toLowerCase();
  const strainChance = { easy:0.15, standard:0.25, dangerous:0.45, nightmare:0.70 }[diffKey] || 0.15;
  const adjustedChance = ["flame","volt","frost","terra","shadow","rift"].includes(gType)
    ? strainChance
    : strainChance * 0.5;

  if (Math.random() > adjustedChance) return { damage: 0, prevented: false, protectorName: null };

  const dmgMap = { easy:[1,2], standard:[2,4], dangerous:[4,7], nightmare:[6,10] };
  const [min, max] = dmgMap[String(diffKey||"easy")] || [1,3];
  const mult = weather?.dmgMult || 1.0;
  const damage = Math.floor((Math.floor(Math.random() * (max - min + 1)) + min) * mult);
  player.playerHp = Math.max(0, Number(player.playerHp || 0) - damage);
  return { damage, prevented: false, protectorName: null };
}

// Nightmare-exclusive: Rift pulse can damage all party Mora
function applyDangerPulse(player, ground, diffKey) {
  if (diffKey !== "nightmare") return null;
  if (Math.random() > 0.25) return null;
  if (!Array.isArray(player.moraOwned) || !player.moraOwned.length) return null;

  const damaged = [];
  for (const mora of player.moraOwned) {
    if (!mora || Number(mora.hp || 0) <= 0) continue;
    if (Math.random() > 0.5) continue;
    const dmg = Math.floor(Math.random() * 8) + 3;
    mora.hp = Math.max(0, Number(mora.hp) - dmg);
    damaged.push({ name: mora.name, dmg });
  }
  return damaged.length ? damaged : null;
}

function buildTerrainDamageText(result, phase = "entry") {
  if (!result) return "";
  let text = "";
  if (result.prevented) {
    text += phase === "entry"
      ? `\n🛡️ Terrain damage blocked by *${result.protectorName}*`
      : `\n🛡️ Field strain blocked by *${result.protectorName}*`;
  } else if (result.damage > 0) {
    text += phase === "entry"
      ? `\n🩸 Terrain Entry Damage: *-${result.damage} HP*`
      : `\n🩸 Environmental Strain: *-${result.damage} HP*`;
  }
  if (result.gearWear) text += `\n\n⚙️ *GEAR WEAR*\n${result.gearWear}`;
  return text;
}

function buildPulseText(pulseResult) {
  if (!pulseResult || !pulseResult.length) return "";
  const lines = pulseResult.map(r => `└ 🐉 ${r.name}: *-${r.dmg} HP*`).join("\n");
  return `\n\n⚡ *RIFT PULSE* — Primordial energy surges through your party!\n${lines}`;
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — ITEM ENCOUNTER POOL
// ══════════════════════════════════════════════════════════════
function pickEncounterItem(weather) {
  const pool = [
    { id:"MAT_001", name:"Rift Dust",              rarity:"Common",   quantity:1, effect:"Crafting material" },
    { id:"ITM_001", name:"Minor Healing Capsule",   rarity:"Common",   quantity:1, effect:"Restores 30 player HP" },
    { id:"ITM_004", name:"Energy Capsule",           rarity:"Common",   quantity:1, effect:"Restores 20 Mora energy" },
    { id:"ITM_014", name:"Capture Net",              rarity:"Common",   quantity:1, effect:"+5% catch success" },
    { id:"MAT_002", name:"Aura Crystal",             rarity:"Uncommon", quantity:1, effect:"Crafting material" },
    { id:"MAT_003", name:"Mora Fang",                rarity:"Uncommon", quantity:1, effect:"Crafting material" },
    { id:"MAT_005", name:"Shadow Resin",             rarity:"Rare",     quantity:1, effect:"Rare crafting material" },
  ];

  // Rain boosts item finds — add a duplicate common for higher chance
  if (weather?.id === "rain" && Math.random() < 0.40) {
    return pool[Math.floor(Math.random() * 4)]; // extra common weight
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Relic Fragments — surface during Rift Surge weather or rarely otherwise
function rollRelicFragment(hunter, weather) {
  const baseChance = 0.04; // 4% base
  const bonus      = weather?.id === "rift_surge" ? 0.18 : 0;
  if (Math.random() > baseChance + bonus) return 0;
  const gained = weather?.id === "rift_surge" ? (weather.relicBonus || 1) : 1;
  return gained;
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — MAP & TRAVEL TEXT BUILDERS
// ══════════════════════════════════════════════════════════════
function getPlayerName(player) {
  return player?.username && String(player.username).trim() ? String(player.username).trim() : "Unknown Hunter";
}

function getTrackToolBonus(player) {
  const inv = player?.inventory || {};
  return Number(inv.ITM_007 || 0) > 0 || Number(inv.GER_022 || 0) > 0;
}

function pushTerrainHistory(hunter, terrainId) {
  if (!terrainId) return;
  if (!Array.isArray(hunter.terrainHistory)) hunter.terrainHistory = [];
  hunter.terrainHistory.push({ terrainId, at: Date.now() });
  if (hunter.terrainHistory.length > 10) hunter.terrainHistory = hunter.terrainHistory.slice(-10);
}

function buildMapText(grounds, hunter) {
  const weather = hunter ? (WEATHERS.find(w => w.id === hunter.currentWeather) || WEATHERS[0]) : WEATHERS[0];
  const entries = Object.values(grounds).filter(g => g.travelable && g.id !== "capital");

  const lines = entries.map(g => {
    const modes  = Object.keys(g.difficultyModes || {}).map(x => titleCase(x)).join(", ");
    const hidden = g.hidden ? "\n🕳 Hidden Terrain" : "";
    return (
      `🗺️ *${g.name}*\n` +
      `⚡ Type: ${titleCase(g.type)}\n` +
      `📈 Level: ${g.recommendedLevel}+  |  ✨ Aura: ${g.recommendedAura}+\n` +
      `🎚️ Difficulties: ${modes || "None"}` +
      hidden
    );
  });

  return (
    `${DIV}\n` +
    `🗺️  *L U M O R A   M A P*\n` +
    `${SDIV}\n` +
    `${weather.icon} *Current Weather:* ${weather.label} — _${weather.desc}_\n` +
    `${DIV}\n\n` +
    lines.join(`\n\n${SDIV}\n\n`) +
    `\n\n${DIV}\n` +
    `📖 Use: \`.travel <terrain> <easy|standard|dangerous|nightmare>\`\n` +
    `📋 Use: \`.journal\` for your hunt stats\n` +
    `🎯 Use: \`.bounty\` to see today's reward target`
  );
}

function buildTravelPrompt(ground, diffKey, diff, weather) {
  const gear = Array.isArray(ground.suggestedGear) && ground.suggestedGear.length
    ? ground.suggestedGear.join(", ") : "None";
  const weatherNote = weather
    ? `\n${weather.icon} *Weather Effect:* ${weather.label} — ${weather.desc}`
    : "";

  return (
    `${DIV}\n` +
    `🧭  *T R A V E L   P R E V I E W*\n` +
    `${DIV}\n\n` +
    `📍 Terrain:    *${ground.name}*\n` +
    `🎚️ Difficulty: *${titleCase(diffKey)}*\n` +
    `📜 ${ground.description}\n\n` +
    `⚠️ Hazard:           ${ground.hazard || "None"}\n` +
    `📈 Suggested Level:  *${ground.recommendedLevel}+*\n` +
    `✨ Suggested Aura:   *${ground.recommendedAura}+*\n` +
    `🛡️ Suggested Gear:   ${gear}\n` +
    `🐉 Mora Level Range: *${diff.moraLevelMin}–${diff.moraLevelMax}*\n` +
    `📊 Stat Pressure:    *×${diff.statMultiplier}*\n` +
    `⚡ Energy Cost:      *${diff.energyCost}*` +
    weatherNote +
    `\n\n${DIV}\n` +
    `✅ *.proceed*  to confirm  |  ❌ *.dismiss*  to cancel\n` +
    `⏳ Expires in 120 seconds`
  );
}

function buildCorruptedAnnouncement(announcement, ground, diffKey, name) {
  return `${announcement}\n\n📍 *${ground?.name || "Unknown"}*  •  ${titleCase(diffKey)}\n☠ A corrupted presence has manifested.` +
    (name ? `\n👤 Triggered by: *${name}*` : "");
}

function buildTrackedCorruptedAnnouncement(announcement, ground, diffKey, name) {
  return `${announcement}\n\n📍 *${ground?.name || "Unknown"}*  •  ${titleCase(diffKey)}\n☠ The corrupted trail has awakened something dangerous.` +
    (name ? `\n👤 Tracker: *${name}*` : "");
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — BURNOUT / ENERGY SYSTEM
// ══════════════════════════════════════════════════════════════
// Players start with 200 energy (launch gift).
// When it hits 0, it drops to 100 unless they have Vigor blessing.
// Owner can override max via .set-gauge.
// Energy regens 100 every 12 hours via the regen check in cmdHunt.

function handleBurnout(player, hunter) {
  const hasVigor = player.blessings?.vigor && player.blessings.vigor > Date.now();
  if (player.huntEnergy <= 0 && player.maxHuntEnergy === 200) {
    if (!hasVigor) {
      player.maxHuntEnergy   = 100;
      hunter.huntEnergyMax   = 100;
      player.huntEnergy      = 0;
      return "⚠️ *BURNOUT* — Your beginner surge has faded. Max energy is now *100*.\n";
    } else {
      return "👑 *VIGOR BLESSING* — The Architect's seal protects your gauge from burnout!\n";
    }
  }
  // Low-energy warning (below 20% of max)
  if (player.huntEnergy <= Math.floor(player.maxHuntEnergy * 0.20) && player.huntEnergy > 0) {
    return "🪫 *LOW ENERGY* — You are running low. Consider returning to Capital soon.\n";
  }
  return "";
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — PLAYER DEATH
// ══════════════════════════════════════════════════════════════
async function handlePlayerDeath(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return;

  const state  = loadHuntState();
  const hunter = ensureHunter(state, senderId);

  const auraLoss  = Math.max(5,  Math.floor((player.aura   || 0) * 0.05));
  const luconLoss = Math.max(10, Math.floor((player.lucons || 0) * 0.10));
  player.aura   = Math.max(0, (player.aura   || 0) - auraLoss);
  player.lucons = Math.max(0, (player.lucons || 0) - luconLoss);

  const fledMoras = [];
  if (Array.isArray(player.moraOwned)) {
    const limit = Math.min(3, player.moraOwned.length);
    for (let i = limit - 1; i >= 0; i--) {
      const mora = player.moraOwned[i];
      if (mora && Math.random() < 0.15) {
        fledMoras.unshift(mora.name || "Unknown Mora");
        player.moraOwned.splice(i, 1);
      }
    }
  }

  hunter.location          = "capital";
  hunter.currentDifficulty = null;
  hunter.activeEncounter   = null;
  hunter.activeTracks      = null;
  hunter.pendingItem       = null;
  hunter.huntStreak        = 0;
  player.playerHp          = 50;

  saveHuntState(state);
  if (typeof savePlayers === "function") savePlayers(players);

  let report =
    `${DIV}\n☠️  *Y O U   H A V E   P E R I S H E D*  ☠️\n${DIV}\n\n` +
    `_The Primordial Rift's energy claimed you. You were carried back to Capital._\n\n` +
    `📉 *LOSSES*\n` +
    `├ ✨ Aura:   *-${auraLoss}*\n` +
    `└ 💰 Lucons: *-${luconLoss}*\n\n`;

  if (fledMoras.length) {
    report += `💨 *Mora that fled in the chaos:*\n` + fledMoras.map(m => `└ 🐉 ${m}`).join("\n") + `\n\n`;
  } else {
    report += `🛡️ All your Mora stayed by your side.\n\n`;
  }

  report += `🏛️ Location reset to *Capital*.\n❤️ HP restored to *50*.\n${DIV}`;

  const payload = mentionText(senderId, report);
  await sock.sendMessage(chatId, payload, { quoted: msg });
  return true;
}

// ══════════════════════════════════════════════════════════════
// SECTION 10 — COMMANDS
// ══════════════════════════════════════════════════════════════

// .map — show the Lumora hunting map with current weather
async function cmdMap(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const grounds  = loadGrounds();
  const state    = loadHuntState();
  const hunter   = ensureHunter(state, senderId);
  getOrRollWeather(hunter);
  saveHuntState(state);

  const mapText  = buildMapText(grounds, hunter);
  const imgPath  = path.join(__dirname, "../assets/map.jpg");

  if (!fs.existsSync(imgPath)) {
    return sock.sendMessage(chatId, { text: mapText }, { quoted: msg });
  }
  return sock.sendMessage(chatId, { image: fs.readFileSync(imgPath), caption: mapText }, { quoted: msg });
}

// .travel <terrain> <difficulty>
async function cmdTravel(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const grounds  = loadGrounds();
  const state    = loadHuntState();
  const hunter   = ensureHunter(state, senderId);

  // Run energy regen first so .travel never blocks on stale energy
  const travelPlayer = players?.[senderId];
  if (travelPlayer) {
    regenHuntEnergy(travelPlayer);
    if (typeof travelPlayer.huntEnergy    === "number") hunter.huntEnergy    = travelPlayer.huntEnergy;
    if (typeof travelPlayer.maxHuntEnergy === "number") hunter.huntEnergyMax = travelPlayer.maxHuntEnergy;
  }

  const diffOptions = new Set(["easy", "standard", "dangerous", "nightmare"]);
  const diffKey     = String(args[args.length - 1] || "").trim().toLowerCase();

  if (!diffOptions.has(diffKey)) {
    return sock.sendMessage(chatId, {
      text: "❌ Usage: `.travel <terrain> <easy|standard|dangerous|nightmare>`",
    }, { quoted: msg });
  }

  const groundKey = normalizeGroundQuery(args.slice(0, -1).join(" "));
  const ground    = grounds[groundKey];

  if (!ground || !ground.travelable || ground.id === "capital") {
    return sock.sendMessage(chatId, { text: "❌ Unknown or invalid terrain.\nUse `.map` to see available locations." }, { quoted: msg });
  }

  const diff = ground.difficultyModes?.[diffKey];
  if (!diff) {
    return sock.sendMessage(chatId, { text: "❌ That difficulty is not available for this terrain." }, { quoted: msg });
  }

  if (hunter.activeEncounter) {
    return sock.sendMessage(chatId, { text: "❌ Finish your current encounter before travelling." }, { quoted: msg });
  }

  if (hunter.pendingTravel && Date.now() < Number(hunter.pendingTravel.expiresAt || 0)) {
    return sock.sendMessage(chatId, { text: "⚠️ You already have a pending travel. Use `.proceed` or `.dismiss`." }, { quoted: msg });
  }

  if (Number(hunter.huntEnergy || 0) < Number(diff.energyCost || 0)) {
    return sock.sendMessage(chatId, { text: `❌ Not enough hunt energy.\nNeed: *${diff.energyCost}*  |  Have: *${hunter.huntEnergy}*` }, { quoted: msg });
  }

  const weather = getOrRollWeather(hunter);

  hunter.pendingTravel = {
    terrainId:   ground.id,
    difficulty:  diffKey,
    energyCost:  diff.energyCost,
    requestedAt: Date.now(),
    expiresAt:   Date.now() + 120000,
  };

  saveHuntState(state);

  const payload = mentionText(senderId, `{mention}\n\n${buildTravelPrompt(ground, diffKey, diff, weather)}`);
  return sock.sendMessage(chatId, payload, { quoted: msg });
}

// .proceed
async function cmdProceed(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const grounds = loadGrounds();
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);
  const player  = players[senderId];

  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });

  const pending = hunter.pendingTravel;
  if (!pending) return sock.sendMessage(chatId, { text: "❌ No pending travel request." }, { quoted: msg });

  if (Date.now() > Number(pending.expiresAt || 0)) {
    hunter.pendingTravel = null;
    saveHuntState(state);
    return sock.sendMessage(chatId, { text: "⌛ Travel request expired. You remain in Capital." }, { quoted: msg });
  }

  const ground = grounds[pending.terrainId];
  if (!ground) {
    hunter.pendingTravel = null;
    saveHuntState(state);
    return sock.sendMessage(chatId, { text: "❌ Terrain data missing." }, { quoted: msg });
  }

  const weather = getOrRollWeather(hunter);

  hunter.huntEnergy  = Math.max(0, Number(hunter.huntEnergy || 0) - Number(pending.energyCost || 0));
  player.huntEnergy  = hunter.huntEnergy;
  hunter.location    = pending.terrainId;
  hunter.currentDifficulty = pending.difficulty;
  hunter.pendingTravel     = null;
  pushTerrainHistory(hunter, ground.id);

  const terrainResult = applyTerrainEntryDamage(player, ground, pending.difficulty, weather);
  ensurePlayerVitals(player);

  saveHuntState(state);
  savePlayers(players);

  if (player.playerHp <= 0) return handlePlayerDeath(ctx, chatId, senderId, msg);

  const payload = mentionText(
    senderId,
    `${DIV}\n` +
    `🧭  *A R R I V A L*\n` +
    `${DIV}\n\n` +
    `{mention} arrived at *${ground.name}*\n` +
    `🎚️ Difficulty: *${titleCase(pending.difficulty)}*\n` +
    `${weather.icon} Weather: *${weather.label}*\n\n` +
    `⚡ Hunt Energy: *${hunter.huntEnergy}/${hunter.huntEnergyMax}*\n` +
    `❤️ Player HP:  *${player.playerHp}/${player.playerMaxHp}*` +
    buildTerrainDamageText(terrainResult, "entry") +
    `\n\n${SDIV}\n` +
    `Use *.hunt* to start scouting!`
  );
  return sock.sendMessage(chatId, payload, { quoted: msg });
}

// .dismiss
async function cmdDismiss(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);

  if (!hunter.pendingTravel) return sock.sendMessage(chatId, { text: "❌ No pending travel request." }, { quoted: msg });

  hunter.pendingTravel = null;
  saveHuntState(state);
  return sock.sendMessage(chatId, mentionText(senderId, `🛑 {mention} cancelled the journey. Remaining in *Capital*.`), { quoted: msg });
}

// .return
async function cmdReturn(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);

  if (hunter.location === "capital") {
    return sock.sendMessage(chatId, { text: "❌ You are already in Capital." }, { quoted: msg });
  }

  if (hunter.activeEncounter) {
    const elapsed = Date.now() - Number(hunter.activeEncounter.at || 0);
    if (elapsed < 300000) {
      return sock.sendMessage(chatId, { text: "❌ Cannot return during an active encounter." }, { quoted: msg });
    }
    hunter.activeEncounter = null; // auto-clear ghost encounters
  }

  const now = Date.now();
  if (Number(hunter.returnCooldownUntil || 0) > now) {
    const secs = Math.ceil((hunter.returnCooldownUntil - now) / 1000);
    return sock.sendMessage(chatId, { text: `⏳ Return cooldown: *${secs}s* remaining.` }, { quoted: msg });
  }

  const prevLocation = hunter.location;
  hunter.location              = "capital";
  hunter.currentDifficulty     = null;
  hunter.pendingTravel         = null;
  hunter.activeTracks          = null;
  hunter.pendingItem           = null;
  hunter.huntStreak            = 0;
  hunter.returnCooldownUntil   = now + 300000; // 5-min cooldown on rapid return abuse

  saveHuntState(state);

  return sock.sendMessage(chatId, mentionText(senderId,
    `🏛️ {mention} returned safely to *Capital*.\n` +
    `📍 Was at: *${titleCase(prevLocation)}*\n` +
    `_Rest up. The wilds will wait._`
  ), { quoted: msg });
}

// ── THE MAIN HUNT COMMAND ─────────────────────────────────────
// .hunt — core hunting loop. Fixed: uses local functions only,
//         no destructuring of state functions from ctx.
async function cmdHunt(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers, loadMora } = ctx;

  // ─ Load state via LOCAL functions (not from ctx) ──────────
  const state   = loadHuntState();          // ← local function
  const grounds = loadGrounds();            // ← local function
  const hunter  = ensureHunter(state, senderId); // ← local function
  const player  = players[senderId];

  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  // ─ Energy regen (shared helper, 6-hour tick) ─────────────
  // Pull max from hunter state first (for legacy data) then run regen.
  if (!player.maxHuntEnergy && hunter.huntEnergyMax) {
    player.maxHuntEnergy = hunter.huntEnergyMax;
  }
  regenHuntEnergy(player);
  const now = Date.now();

  // Sync energy from player object to hunter state
  if (typeof player.huntEnergy    === "number") hunter.huntEnergy    = player.huntEnergy;
  if (typeof player.maxHuntEnergy === "number") hunter.huntEnergyMax = player.maxHuntEnergy;

  // ─ Location checks ────────────────────────────────────────
  if (hunter.location === "capital") {
    return sock.sendMessage(chatId, {
      text:
        `🏛️ *You are in the Capital.*\n\n` +
        `Use *.map* to see terrains, then *.travel <terrain> <difficulty>* to set out.\n` +
        `🎯 Today's bounty: *.bounty*`,
    }, { quoted: msg });
  }

  if (hunter.activeEncounter) {
    return sock.sendMessage(chatId, {
      text: "⚠️ You are already in an active encounter.\nUse *.attack*, *.switch*, *.run*, *.track*, or *.return*.",
    }, { quoted: msg });
  }

  // ─ Ground & difficulty ────────────────────────────────────
  const ground  = grounds[hunter.location];
  const diffKey = String(hunter.currentDifficulty || "easy").toLowerCase();
  const diff    = ground?.difficultyModes?.[diffKey];

  if (!ground || !diff) {
    return sock.sendMessage(chatId, {
      text: "❌ Terrain data missing. Use `.return` then travel again.",
    }, { quoted: msg });
  }

  // Hunt costs 75% of the travel energy cost
  const huntCost = Math.max(4, Math.floor(Number(diff.energyCost || 8) * 0.75));

  // ─ Energy validation ──────────────────────────────────────
  if (Number(player.huntEnergy || 0) < huntCost) {
    return sock.sendMessage(chatId, {
      text:
        `🪫 *ENERGY DEPLETED*\n\n` +
        `Cost: *${huntCost}*  |  Have: *${player.huntEnergy}/${player.maxHuntEnergy}*\n\n` +
        `Energy regens 50% every 6 hours, or use an Energy Capsule from your inventory.`,
    }, { quoted: msg });
  }

  // ─ Deduct energy ─────────────────────────────────────────
  player.huntEnergy  -= huntCost;
  hunter.huntEnergy   = player.huntEnergy;
  hunter.lastHuntAt   = now;
  hunter.totalHunts   = (hunter.totalHunts || 0) + 1;

  // ─ Mission tracking ──────────────────────────────────────
  try { missionSystem.onHuntCompleted(senderId, player.faction, diffKey); } catch {}

  // ─ Burnout / low energy alert ────────────────────────────
  // Purity players never experience energy burnout (discipline perk)
  const burnoutAlert = factionMarketSystem.skipBurnoutForPurity(player)
    ? ""
    : handleBurnout(player, hunter);

  // ─ Weather ───────────────────────────────────────────────
  const weather = getOrRollWeather(hunter);

  // ─ Auto-pass stale item ───────────────────────────────────
  let autoPassText = "";
  if (hunter.pendingItem) {
    autoPassText = `📦 You left the previous item behind. The wild moves on.\n\n`;
    hunter.pendingItem = null;
  }

  // ─ Terrain damage ────────────────────────────────────────
  const strainResult = applyHuntTerrainStrain(player, ground, diffKey, weather);
  const idleDamage   = applyTerrainIdleDamage(player, hunter, ground, diffKey, weather);
  const pulseResult  = applyDangerPulse(player, ground, diffKey);

  if (player.playerHp <= 0) {
    saveHuntState(state);
    savePlayers(players);
    return handlePlayerDeath(ctx, chatId, senderId, msg);
  }

  // ─ Relic fragment roll ────────────────────────────────────
  const relicsGained = rollRelicFragment(hunter, weather);
  let relicText = "";
  if (relicsGained > 0) {
    hunter.relicFragments = (hunter.relicFragments || 0) + relicsGained;
    relicText = `\n🔮 *Relic Fragment found!* _(${hunter.relicFragments}/5 total)_`;
    if (hunter.relicFragments >= 5) {
      relicText += `\n✨ You have *5 fragments!* Use *.assemble* to forge a Rift Relic!`;
    }
  }

  // ─ Lucky streak boost ────────────────────────────────────
  const streakBoost = hunter.huntStreak >= 5 ? 0.15 : 0;

  // ─ RIFT: PE overflow check after terrain strain ───────────
  try {
    const _peExplosions = factionMarketSystem.checkPeOverflow(player);
    if (_peExplosions && _peExplosions.length) {
      for (const boom of _peExplosions) {
        await sock.sendMessage(chatId, { text: boom.message }, { quoted: msg });
      }
      savePlayers(players);
      saveHuntState(state);
    }
  } catch {}

  // ─ Build encounter ────────────────────────────────────────
  const moraDb = typeof loadMora === "function" ? loadMora() : [];
  const encounter = encountersSystem.buildEncounter(ctx, {
    moraList:  moraDb,
    ground,
    difficulty: diffKey,
    riftState:  "calm",
  });

  if (!encounter || !encounter.ok) {
    saveHuntState(state);
    savePlayers(players);
    return sock.sendMessage(chatId, {
      text: "❌ Encounter generation failed. The wild is too quiet.",
    }, { quoted: msg });
  }

  const introText = burnoutAlert + autoPassText;

  // ─ STATUS FOOTER used in all responses ────────────────────
  const statusFooter =
    `\n\n${SDIV}\n` +
    `⚡ Energy: *${player.huntEnergy}/${player.maxHuntEnergy}*\n` +
    `❤️ HP: *${player.playerHp}/${player.playerMaxHp}*\n` +
    `🔥 Streak: *${hunter.huntStreak}*  |  ${weather.icon} *${weather.label}*` +
    buildTerrainDamageText(strainResult, "hunt") +
    buildTerrainDamageText(idleDamage, "hunt") +
    buildPulseText(pulseResult) +
    relicText;

  // ── WILD / CORRUPTED ────────────────────────────────────
  if (encounter.type === "wild" || encounter.type === "corrupted") {
    hunter.activeEncounter = { type: encounter.type, at: Date.now(), terrainId: ground.id };
    saveHuntState(state);
    savePlayers(players);

    if (encounter.publicAnnouncement) {
      await sock.sendMessage(chatId, {
        text: buildCorruptedAnnouncement(encounter.publicAnnouncement, ground, diffKey, getPlayerName(player)),
      }, { quoted: msg });
    }
    if (introText.trim()) {
      await sock.sendMessage(chatId, { text: introText.trim() }, { quoted: msg });
    }

    return getWildBattleSystem().startWildBattle(ctx, chatId, senderId, msg, encounter.wild);
  }

  // ── TRACKS ──────────────────────────────────────────────
  if (encounter.type === "tracks") {
    hunter.activeTracks = { ...encounter.tracks, terrainId: ground.id, difficulty: diffKey };
    hunter.huntStreak   = (hunter.huntStreak || 0) + 1;
    saveHuntState(state);
    savePlayers(players);

    const isCorrupted = hunter.activeTracks.corrupted;
    const streakLine  = hunter.huntStreak >= 5 ? `\n✨ *Lucky Streak!* +15% encounter quality boost active.` : "";

    const payload = mentionText(senderId,
      `${introText}${encounter.text}\n\n` +
      `👣 Track State: *${titleCase(hunter.activeTracks.state)}*\n` +
      `☠ Corrupted: *${isCorrupted ? "Yes — danger" : "No"}*` +
      streakLine +
      statusFooter
    );
    return sock.sendMessage(chatId, payload, { quoted: msg });
  }

  // ── ITEM ────────────────────────────────────────────────
  if (encounter.type === "item") {
    const item = pickEncounterItem(weather);
    hunter.pendingItem = { ...item, foundAt: Date.now(), terrainId: ground.id, difficulty: diffKey };
    hunter.huntStreak  = (hunter.huntStreak || 0) + 1;
    saveHuntState(state);
    savePlayers(players);

    const itemCard =
      `\n${SDIV}\n` +
      `📦 *ITEM DISCOVERED*\n` +
      `${SDIV}\n` +
      `✨ *${item.name}*\n` +
      `📊 Rarity: ${item.rarity}\n` +
      `📜 ${item.effect}\n\n` +
      `*.pick* to take it  |  *.pass* to leave it`;

    const payload = mentionText(senderId,
      `${introText}${encounter.text}` + itemCard + statusFooter
    );
    return sock.sendMessage(chatId, payload, { quoted: msg });
  }

  // ── ENVIRONMENT EVENT ───────────────────────────────────
  if (encounter.type === "environment") {
    hunter.huntStreak = 0;
    saveHuntState(state);
    savePlayers(players);

    const severity = titleCase(encounter.environmentEvent?.severity || "low");
    const payload  = mentionText(senderId,
      `${introText}${encounter.text}\n\n🌍 Severity: *${severity}*` + statusFooter
    );
    return sock.sendMessage(chatId, payload, { quoted: msg });
  }

  // ── NOTHING FOUND ───────────────────────────────────────
  hunter.huntStreak = 0;
  saveHuntState(state);
  savePlayers(players);

  const payload = mentionText(senderId, `${introText}${encounter.text}` + statusFooter);
  return sock.sendMessage(chatId, payload, { quoted: msg });
}

// .pick
async function cmdPick(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state  = loadHuntState();
  const hunter = ensureHunter(state, senderId);
  const player = players[senderId];

  if (!player)          return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });
  if (!hunter.pendingItem) return sock.sendMessage(chatId, { text: "❌ No pending item to pick up." }, { quoted: msg });

  const itemData = hunter.pendingItem;
  const qty      = Number(itemData.quantity || 1);
  const entry    = itemsSystem.getItemById(itemData.id);

  if (!entry) {
    hunter.pendingItem = null;
    saveHuntState(state);
    return sock.sendMessage(chatId, { text: `❌ *${itemData.name}* is not registered in the item database yet.` }, { quoted: msg });
  }

  const canAdd = itemsSystem.canAddItemToInventory(player, entry.id, qty);
  if (!canAdd.ok) return sock.sendMessage(chatId, { text: `❌ ${canAdd.reason}` }, { quoted: msg });

  const added = itemsSystem.addItem(player, entry.id, qty);
  if (!added.ok) return sock.sendMessage(chatId, { text: `❌ ${added.reason}` }, { quoted: msg });

  hunter.pendingItem = null;
  savePlayers(players);
  saveHuntState(state);

  return sock.sendMessage(chatId, mentionText(senderId,
    `✅ {mention} picked up *${itemData.name}* ×${qty}.\n📦 Added to inventory.`
  ), { quoted: msg });
}

// .pass
async function cmdPass(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state    = loadHuntState();
  const hunter   = ensureHunter(state, senderId);

  if (!hunter.pendingItem) return sock.sendMessage(chatId, { text: "❌ No pending item to pass on." }, { quoted: msg });

  const name         = hunter.pendingItem.name;
  hunter.pendingItem = null;
  saveHuntState(state);

  return sock.sendMessage(chatId, mentionText(senderId,
    `🛑 {mention} left *${name}* behind.\n_The wild reclaims what was not taken._`
  ), { quoted: msg });
}

// .track
async function cmdTrack(ctx, chatId, senderId, msg) {
  const { sock, players, loadMora } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);
  const grounds = loadGrounds();
  const player  = players[senderId];

  if (!hunter.activeTracks) {
    return sock.sendMessage(chatId, { text: "❌ No active tracks to follow." }, { quoted: msg });
  }

  if (Date.now() > Number(hunter.activeTracks.expiresAt || 0)) {
    hunter.activeTracks = null;
    saveHuntState(state);
    return sock.sendMessage(chatId, { text: "⌛ The tracks went cold. Trail lost." }, { quoted: msg });
  }

  // Mist weather increases track-loss chance
  const weather    = getOrRollWeather(hunter);
  const trackBonus = getTrackToolBonus(player);
  const lostBonus  = weather?.trackLoss || 0;
  const lost       = encountersSystem.maybeLoseTrack(hunter.activeTracks.state, trackBonus, lostBonus);

  if (lost) {
    hunter.activeTracks = null;
    hunter.huntStreak   = 0;
    saveHuntState(state);
    return sock.sendMessage(chatId, mentionText(senderId,
      `💨 {mention} lost the trail.\n_${weather.id === "mist" ? "The Rift Mist swallowed every trace." : "The tracks vanish into the wild."}_`
    ), { quoted: msg });
  }

  const ground  = grounds[hunter.activeTracks.terrainId];
  const diffKey = hunter.activeTracks.difficulty || "easy";
  const moraDb  = typeof loadMora === "function" ? loadMora() : [];

  const encounter = encountersSystem.buildEncounter(ctx, {
    moraList:  moraDb,
    ground,
    difficulty: diffKey,
    riftState:  hunter.activeTracks.corrupted ? "agitated" : "calm",
    forceType:  hunter.activeTracks.corrupted ? "corrupted" : "wild",
  });

  hunter.activeTracks = null;

  if (!encounter.ok) {
    saveHuntState(state);
    return sock.sendMessage(chatId, { text: "❌ The trail leads nowhere useful." }, { quoted: msg });
  }

  if (encounter.type === "wild" || encounter.type === "corrupted") {
    hunter.activeEncounter = { type: encounter.type, at: Date.now(), terrainId: ground?.id || null };
    saveHuntState(state);

    if (encounter.publicAnnouncement) {
      await sock.sendMessage(chatId, {
        text: buildTrackedCorruptedAnnouncement(encounter.publicAnnouncement, ground, diffKey, getPlayerName(player)),
      }, { quoted: msg });
    }

    return getWildBattleSystem().startWildBattle(ctx, chatId, senderId, msg, encounter.wild);
  }

  saveHuntState(state);
  return sock.sendMessage(chatId, { text: "❌ The trail breaks unexpectedly." }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION 11 — NEW COMMANDS
// ══════════════════════════════════════════════════════════════

// .journal — hunter statistics and history
async function cmdJournal(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);
  const player  = players[senderId];
  const grounds = loadGrounds();

  const history = (hunter.terrainHistory || []).slice(-5).reverse().map(e => {
    const g = grounds[e.terrainId];
    const ago = Math.floor((Date.now() - e.at) / 60000);
    return `  • *${g?.name || e.terrainId}* — ${ago}m ago`;
  });

  const bounty      = getTodayBounty();
  const todayProgress = hunter.bountyProgress?.[getTodayKey()] || 0;
  const bountyDone  = hunter.bountyCompletedToday === getTodayKey();

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `📖  *H U N T E R   J O U R N A L*\n` +
      `${DIV}\n\n` +
      `👤 *${player?.username || "Hunter"}*\n` +
      `📍 Location: *${titleCase(hunter.location)}*\n` +
      `🎚️ Difficulty: *${titleCase(hunter.currentDifficulty || "none")}*\n\n` +
      `${SDIV}\n` +
      `📊 *STATISTICS*\n` +
      `${SDIV}\n` +
      `⚡ Energy:       *${hunter.huntEnergy}/${hunter.huntEnergyMax}*\n` +
      `❤️ Player HP:   *${player?.playerHp || 0}/${player?.playerMaxHp || 100}*\n` +
      `🔥 Streak:      *${hunter.huntStreak}*\n` +
      `🎯 Total Hunts: *${hunter.totalHunts || 0}*\n` +
      `🔮 Relic Frags: *${hunter.relicFragments || 0}/5*\n\n` +
      `${SDIV}\n` +
      `🎯 *TODAY'S BOUNTY*\n` +
      `${SDIV}\n` +
      `Target: *${bounty.type} Mora*  |  Reward: *${bounty.reward} Lucons*\n` +
      `Progress: *${todayProgress}/2*  ${bountyDone ? "✅ COMPLETED" : ""}\n\n` +
      (history.length ?
        `${SDIV}\n` +
        `🗺️ *RECENT TERRAINS*\n` +
        history.join("\n") + "\n\n" : "") +
      `${DIV}\n` +
      `💡 Tips:\n` +
      `• Streak ≥5 → *+15% encounter bonus*\n` +
      `• Collect 5 relic frags → *.assemble* a Rift Relic\n` +
      `• Check *.bounty* for today's Lucon reward`,
  }, { quoted: msg });
}

// .bounty — shows today's bounty target
async function cmdBounty(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);

  const bounty   = getTodayBounty();
  const today    = getTodayKey();
  const progress = hunter.bountyProgress?.[today] || 0;
  const done     = hunter.bountyCompletedToday === today;

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `🎯  *D A I L Y   B O U N T Y*\n` +
      `${DIV}\n\n` +
      `_"The Capital's hunters guild has posted a contract."_\n\n` +
      `🎪 *Target:* Catch *2 ${bounty.type} Mora* in the wild\n` +
      `💰 *Reward:* *${bounty.reward} Lucons* (first completion)\n\n` +
      `📊 Your progress: *${progress}/2* ${done ? "✅ *COMPLETED!*" : ""}\n\n` +
      `${SDIV}\n` +
      `• Bounty resets at midnight\n` +
      `• Travel to terrain where ${bounty.type} types spawn\n` +
      `• Use *.map* to find matching terrain types`,
  }, { quoted: msg });
}

// .assemble — forge a Rift Relic from 5 fragments
async function cmdAssemble(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state  = loadHuntState();
  const hunter = ensureHunter(state, senderId);
  const player = players[senderId];

  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });

  if ((hunter.relicFragments || 0) < 5) {
    return sock.sendMessage(chatId, {
      text:
        `🔮 *RELIC ASSEMBLY*\n\n` +
        `You need *5 Relic Fragments* to forge a Rift Relic.\n` +
        `Current: *${hunter.relicFragments || 0}/5*\n\n` +
        `_Fragments drop during hunts — especially during Rift Surge weather._`,
    }, { quoted: msg });
  }

  // Consume 5 fragments and reward a Rift Relic item
  hunter.relicFragments -= 5;

  // Give the player a relic item (MAT_005 Shadow Resin as placeholder — 
  // replace with your actual relic item ID when you create one)
  const relicItemId = "MAT_005"; // ← Change to your Rift Relic item ID
  const qty         = 1;
  let rewardLine    = "";

  const entry = itemsSystem.getItemById(relicItemId);
  if (entry) {
    const added = itemsSystem.addItem(player, relicItemId, qty);
    if (added.ok) {
      rewardLine = `\n📦 *Rift Relic* added to your inventory.`;
      savePlayers(players);
    }
  }

  // Also give a bonus aura and xp
  player.aura   = Math.min(9999, (player.aura   || 0) + 15);
  player.xp     = (player.xp || 0) + 80;
  savePlayers(players);
  saveHuntState(state);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `🔮  *R I F T   R E L I C   F O R G E D*\n` +
      `${DIV}\n\n` +
      `_"The fragments shatter and reform into something ancient."_\n\n` +
      `✅ *5 Relic Fragments* consumed\n` +
      rewardLine +
      `\n⚡ Bonus: *+15 Aura*  |  *+80 XP*\n\n` +
      `🔮 Remaining fragments: *${hunter.relicFragments}*\n` +
      `${DIV}`,
  }, { quoted: msg });
}

// .lastterrain — quick view of recent terrain history
async function cmdLastTerrain(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state   = loadHuntState();
  const hunter  = ensureHunter(state, senderId);
  const grounds = loadGrounds();

  const hist = (hunter.terrainHistory || []).slice(-5).reverse();
  if (!hist.length) {
    return sock.sendMessage(chatId, { text: "📍 You have not visited any hunting grounds yet." }, { quoted: msg });
  }

  const lines = hist.map((e, i) => {
    const g   = grounds[e.terrainId];
    const ago = Math.floor((Date.now() - e.at) / 60000);
    return `${i + 1}) *${g?.name || e.terrainId}* — ${ago} min ago`;
  });

  return sock.sendMessage(chatId, {
    text: `🗺️ *Recent Terrains*\n\n` + lines.join("\n"),
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION 12 — ENCOUNTER CLEAR (called by wildbattle.js on end)
// ══════════════════════════════════════════════════════════════
async function clearEncounterAfterWildBattle(senderId) {
  const state  = loadHuntState();
  const hunter = ensureHunter(state, senderId);
  hunter.activeEncounter = null;
  saveHuntState(state);
}

// ══════════════════════════════════════════════════════════════
// SECTION 13 — EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  // State helpers (used externally by index.js and other systems)
  loadGrounds,
  loadHuntState,
  saveHuntState,
  ensureHunter,
  clearEncounterAfterWildBattle,
  handlePlayerDeath,
  checkBountyProgress,   // called by wildbattle.js when a Mora is caught

  // Commands (routed from index.js)
  cmdMap,
  cmdTravel,
  cmdProceed,
  cmdDismiss,
  cmdReturn,
  cmdHunt,
  cmdPick,
  cmdPass,
  cmdTrack,

  // NEW commands (add to index.js routing + help text)
  cmdJournal,      // .journal
  cmdBounty,       // .bounty
  cmdAssemble,     // .assemble
  cmdLastTerrain,  // .lastterrain
};
// ============================
// LUMORA BOT (Baileys v7+)
// Era: Lumora: Awakening
// Prefix/Currency/Owner now stored in data/settings.json
// ✅ FIXED: Baileys is ESM-only -> dynamic import()
// ============================
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Lumora Bot is Pulsing! ⚡');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
const fs = require("fs");
const path = require("path");

const pino = require("pino");
const qrcode = require("qrcode-terminal");

// ✅ Baileys ESM loader
let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let makeCacheableSignalKeyStore;
let fetchLatestBaileysVersion;

async function loadBaileys() {
  const baileys = await import("@whiskeysockets/baileys");
  makeWASocket = baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
}

// ============================
// IMPORTANT: prevent random crashes (group decrypt noise)
// ============================
function isBaileysNoise(err) {
  const msg = String(err?.message || err || "");
  return /no sessions|failed to decrypt|sessionerror|bad mac/i.test(msg);
}

process.on("unhandledRejection", (err) => {
  if (isBaileysNoise(err)) return;
  console.log("UnhandledRejection:", err);
});

process.on("uncaughtException", (err) => {
  if (isBaileysNoise(err)) return;
  console.log("UncaughtException:", err);
});

// ============================
// MODULES (Lumora)
// ============================
const battleMath = require("./core/battleMath");
const xpSystem = require("./core/xpSystem");
const auraSystem = require("./core/auraSystem");
const hpBar = require("./core/hpBar");
const corruptionSystem = require("./systems/corruption");
const battleSystem = require("./systems/battle");
const huntingSystem = require("./systems/hunting");
const wildBattleSystem = require("./systems/wildbattle");
const economySystem = require("./systems/economy");
const transferSystem = require("./systems/transfer");
const healSystem = require("./systems/heal");
const spawnSystem = require("./systems/spawn");
const inventorySystem = require("./systems/inventory");
const gearSystem = require("./systems/gear");
const marketSystem = require("./systems/market");
const factionMarketSystem = require("./systems/factionMarket");
const giveItemSystem = require("./systems/giveItem");
const welcomeSystem = require("./systems/factionWelcomeSystem");
const partySystem = require("./systems/party");
const missionSystem = require("./systems/factionMissionSystem")
const fEngine = require('./factionWarEngine');
const { generateFactionGraph, generateFacPointsCard, generateBattleVsImage } = require('./factionCanvas');
const botPersonality = require('./systems/botPersonality');
const FACTION_FILE = './data/faction_state.json';
const lb = require('./leaderboard');
const factionsData = JSON.parse(fs.readFileSync('./data/factions.json'));

const { generateVsCanvas, generateBracketCanvas, generateWarResultCanvas } = require('./warCanvas');
const miscSystem = require('./systems/misc');
const arenaSystem = require('./systems/npcArena');
const proSystem = require('./systems/pro');
const moraCreationSystem = require('./systems/moraCreation');
const mongoDb = require('./db/mongo');
const { generateMoraCard } = require('./systems/moraCardCanvas');
const { generateProfileCard } = require('./systems/profileCardCanvas');
const { generateBattleResult } = require('./systems/battleResultCanvas');
const { generateAchievementUnlock, generateAchievementCard } = require('./systems/achievementUnlockCanvas');
const { generateLeaderboard } = require('./systems/leaderboardCanvas');

// ============================
// NEW COMMANDS — shown in .help for 12 hours after addedAt
// ============================
// Add new entries here when you ship a command. They auto-expire after 12h.
const NEW_COMMANDS_TTL_MS = 12 * 60 * 60 * 1000;
const NEW_COMMANDS = [
  { name: ".pro-info",     section: "pro",  blurb: "See subscription plans & USD pricing",            addedAt: 1776067200000 }, // 2026-04-13
  { name: ".pro",          section: "pro",  blurb: "View your subscription status",                    addedAt: 1776067200000 },
  { name: ".pro-grant",    section: "pro",  blurb: "Owner: grant a subscription tier",                 addedAt: 1776067200000 },
  { name: ".pro-daily",    section: "pro",  blurb: "Pro: daily Lucons + Lucrystals claim",             addedAt: 1776067200000 },
  { name: ".pro-market",   section: "pro",  blurb: "Browse the Lucrystal shop",                        addedAt: 1776067200000 },
  { name: ".pbuy",         section: "pro",  blurb: "Buy an item with Lucrystals",                      addedAt: 1776067200000 },
  { name: ".exchange",     section: "pro",  blurb: "Convert 1000 Lucons → 1 Lucrystal",                addedAt: 1776067200000 },
  { name: ".autocatch",    section: "pro",  blurb: "Arm the Eidolon Catcher in this group",            addedAt: 1776067200000 },
  { name: ".autocatch-log",section: "pro",  blurb: "See mora caught while you were away",              addedAt: 1776067200000 },
  { name: ".crystals",     section: "pro",  blurb: "Owner: top up a player's Lucrystals",              addedAt: 1776067200000 },
  { name: ".create-mora",  section: "companion", blurb: "Forge a new Mora at Lumora Labs (Int 15+)",    addedAt: 1776067200000 },
  { name: ".creations",    section: "admin", blurb: "Owner: list pending Mora submissions",             addedAt: 1776067200000 },
  { name: ".approve-mora", section: "admin", blurb: "Owner: approve a creation + pay creator",          addedAt: 1776067200000 },
  { name: ".reject-mora",  section: "admin", blurb: "Owner: reject a pending creation",                 addedAt: 1776067200000 },
];
function getActiveNewCommands() {
  const now = Date.now();
  return NEW_COMMANDS.filter(c => now - Number(c.addedAt || 0) < NEW_COMMANDS_TTL_MS);
}
// ============================
// PRIMORDIAL ENERGY (CONFIG)
// ============================
const PRIMORDIAL = {
  base: {
    light: [3, 6],
    medium: [7, 10],
    heavy: [11, 16],
    roundTick: 2,
    bigHitBonus: 8,
  },

  rarityMultiplier: {
    common: 1.0,
    uncommon: 0.92,
    rare: 0.85,
    epic: 0.78,
    legendary: 0.7,
    mythic: 0.65,
  },

  factionMultiplier: {
    harmony: 0.8,
    purity: 1.0,
    rift: 1.15,
  },

  thresholds: {
    unstable: 60,
    corrupted: 80,
    critical: 100,
  },

  fleeWindowMs: 60 * 1000,
};

// ============================
// FILE DB
// ============================
const DATA_DIR = path.join(__dirname, "data");

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PLAYERS_FILE = path.join(DATA_DIR, "players.json");
const BANS_FILE = path.join(DATA_DIR, "bans.json");
const MORA_FILE = path.join(DATA_DIR, "mora.json");
const AFK_FILE = path.join(DATA_DIR, "afk.json");
const PUNISH_FILE = path.join(DATA_DIR, "punishments.json");
const REFERRAL_FILE = path.join(DATA_DIR, "referrals.json");
const SUDOS_FILE = path.join(DATA_DIR, "sudos.json");
const THRONE_FILE = path.join(DATA_DIR, "throne.json");
const RULES_FILE = path.join(DATA_DIR, "rules.json");
const BUGS_FILE = path.join(DATA_DIR, "bugs.json");
const WARNS_FILE = path.join(DATA_DIR, "warns.json");
const startTime =Date.now();
const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━";
const SMALL_DIVIDER = "──────────────────────";
global.blackMarket = { active: false, type: null, owner: null, expiry: 0, items: [] };
// Mapping of Group WhatsApp JIDs to Factions
// To find a group JID: send any message in the group while bot is running and check console logs
const FACTION_GROUPS = {};

// Invite-link → faction mapping (used to resolve JIDs at runtime)
const FACTION_INVITE_MAP = {
    'G0msNxullTKKEfHVltjlXZ': 'harmony',
    'IYx4DKOR40w9gze32C9wKQ': 'purity',
    'EBPQYruOnigJX3jj7X3Npj': 'rift',
    'HUOV4vTSsSOBzpGcDxosiq': 'none',
};

// Resolve invite codes to JIDs on first use
let factionGroupsResolved = false;
async function resolveFactionGroups(sock) {
  if (factionGroupsResolved) return;
  factionGroupsResolved = true;
  for (const [code, faction] of Object.entries(FACTION_INVITE_MAP)) {
    try {
      const info = await sock.groupGetInviteInfo(code);
      if (info?.id) FACTION_GROUPS[normJid(info.id)] = { faction };
    } catch (e) {
      console.log(`⚠️ Could not resolve faction group invite ${code}: ${e.message}`);
    }
  }
  console.log("✅ Faction groups resolved:", Object.keys(FACTION_GROUPS).length);
}
// Assets
const ASSETS_DIR = path.join(__dirname, "assets");

const MORA_ASSETS_DIR = path.join(ASSETS_DIR, "mora");

// ============================
// FILE HELPERS
// ============================
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureFile(filePath, defaultValue) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function loadJSON(filePath, defaultValue) {
  ensureFile(filePath, defaultValue);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.log("loadJSON ERROR", filePath, e?.message || e);
    return defaultValue;
  }
}

function saveJSON(filePath, data) {
  ensureFile(filePath, {});
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Track which JIDs were modified in this message cycle
let dirtyJidsThisCycle = new Set();

// Async boot: initialize MongoDB and load all players
async function bootPlayers() {
  // Try to connect to MongoDB
  await mongoDb.initMongo();

  // Load from MongoDB (or empty if not connected)
  let players = await mongoDb.loadAllPlayers();

  // Fall back to JSON file if MongoDB gave us nothing
  if (Object.keys(players).length === 0) {
    players = loadJSON(PLAYERS_FILE, {});
    if (Object.keys(players).length > 0) {
      console.log(`[boot] Loaded ${Object.keys(players).length} players from JSON fallback`);

      // First run: sync all existing players to MongoDB immediately
      console.log("[boot] Syncing all players to MongoDB...");
      for (const jid of Object.keys(players)) {
        mongoDb.markDirty(players, jid);
      }
      console.log("[boot] All players marked for MongoDB sync (will flush in 3s)");
    }
  } else {
    // Mirror MongoDB data to the local JSON warm cache so synchronous
    // loadPlayers() calls throughout the codebase see it.
    saveJSON(PLAYERS_FILE, players);
  }

  return players;
}

// Mark a specific JID as needing MongoDB flush
function markPlayerDirty(jid, players) {
  dirtyJidsThisCycle.add(jid);
  if (players) {
    mongoDb.markDirty(players, jid);
  }
}

function loadPlayers() {
  return loadJSON(PLAYERS_FILE, {});
}

function savePlayers(players) {
  // Always save to JSON (warm cache for quick loads)
  saveJSON(PLAYERS_FILE, players);

  // Mark all dirty JIDs from this cycle for async MongoDB flush
  for (const jid of dirtyJidsThisCycle) {
    mongoDb.markDirty(players, jid);
  }
  dirtyJidsThisCycle.clear();
}
function parseMinutes(str) {
  const n = Number(str);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
function loadPunishments() {
  return loadJSON(PUNISH_FILE, {});
}
function savePunishments(p) {
  return saveJSON(PUNISH_FILE, p);
}
function getBanReason(banInfo) {
  if (typeof banInfo === "object" && banInfo.reason) return banInfo.reason;
  return "Reason not mentioned";
}
// ── SUDO SYSTEM ──────────────────────────────────────────
function loadSudos() { return loadJSON(SUDOS_FILE, []); }
function saveSudos(list) { return saveJSON(SUDOS_FILE, list); }
function isSudo(senderJid) {
  const num = normalizeNumberFromJid(senderJid);
  const list = loadSudos();
  return list.some(s => String(s).replace(/\D/g, "") === num);
}

// ── RIGHT-HAND MAN (THRONE) ─────────────────────────────
function loadThrone() { return loadJSON(THRONE_FILE, null); }
function saveThrone(jid) { return saveJSON(THRONE_FILE, jid); }
function isRightHandMan(senderJid) {
  const num = normalizeNumberFromJid(senderJid);
  const throne = loadThrone();
  if (!throne) return false;
  return String(throne).replace(/\D/g, "") === num;
}

// ── RULES SYSTEM ─────────────────────────────────────────
function loadRules() { return loadJSON(RULES_FILE, []); }
function saveRules(rules) { return saveJSON(RULES_FILE, rules); }

// ── BUG REPORT SYSTEM ───────────────────────────────────
function loadBugs() { return loadJSON(BUGS_FILE, []); }
function saveBugs(bugs) { return saveJSON(BUGS_FILE, bugs); }

// ── WARN SYSTEM ─────────────────────────────────────────
function loadWarns() { return loadJSON(WARNS_FILE, {}); }
function saveWarns(warns) { return saveJSON(WARNS_FILE, warns); }

// ── RANKS SYSTEM ────────────────────────────────────────
const RANK_TABLE = [
  [2, "Wanderer"],
  [5, "Scout"],
  [8, "Pathfinder"],
  [12, "Sentinel"],
  [16, "Warden"],
  [20, "Commander"],
  [25, "Champion"],
  [30, "Overlord"],
  [40, "Archon"],
  [50, "Mythic Sovereign"],
];

function getRankForLevel(level) {
  let rank = null;
  for (const [lvl, name] of RANK_TABLE) {
    if (level >= lvl) rank = name;
  }
  return rank;
}

// ── ACHIEVEMENTS & TITLES ───────────────────────────────
const ACHIEVEMENTS = {
  first_catch:   { title: "Mora Catcher",      desc: "Catch your first Mora",         icon: "🐾", aura: 2 },
  tamer_10:      { title: "Beast Tamer",        desc: "Own 10 Mora",                   icon: "🦁", aura: 5 },
  tamer_25:      { title: "Mora Warden",        desc: "Own 25 Mora",                   icon: "🛡️", aura: 8 },
  battle_1:      { title: "First Blood",        desc: "Win your first PvP battle",     icon: "⚔️", aura: 3 },
  battle_10:     { title: "Battle Hardened",     desc: "Win 10 PvP battles",            icon: "🗡️", aura: 7 },
  battle_50:     { title: "War Machine",         desc: "Win 50 PvP battles",            icon: "💀", aura: 15 },
  rich_5k:       { title: "Wealthy",            desc: "Hold 5,000 Lucons at once",     icon: "💰", aura: 4 },
  rich_20k:      { title: "Tycoon",             desc: "Hold 20,000 Lucons at once",    icon: "👑", aura: 10 },
  level_10:      { title: "Rising Star",        desc: "Reach level 10",                icon: "🌟", aura: 3 },
  level_25:      { title: "Veteran",            desc: "Reach level 25",                icon: "🎖️", aura: 8 },
  level_50:      { title: "Legend",             desc: "Reach level 50",                icon: "🏆", aura: 20 },
  hunter_50:     { title: "Master Hunter",      desc: "Complete 50 hunts",             icon: "🏹", aura: 12 },
  streak_7:      { title: "Devoted",            desc: "7-day login streak",            icon: "🔥", aura: 3 },
  streak_30:     { title: "Unbreakable",        desc: "30-day login streak",           icon: "⚡", aura: 12 },
  faction_500:   { title: "Faction Loyalist",   desc: "Earn 500 resonance",            icon: "🚩", aura: 10 },
  companion_100: { title: "Soulbound",          desc: "Reach 100 companion bond",      icon: "💞", aura: 8 },
  mutator:       { title: "Mutant Whisperer",   desc: "Trigger 10 mutations",          icon: "🧬", aura: 9 },
  creator_first: { title: "Architect",         desc: "Submit your first Mora design", icon: "⚗️", aura: 6 },
  creator_rare:  { title: "Crafted in Rift",   desc: "Create a Rare or higher Mora", icon: "💎", aura: 10 },
  creator_epic:  { title: "Epic Forger",       desc: "Create an Epic Mora",          icon: "🌀", aura: 15 },
  creator_legendary: { title: "Legendary Shaper", desc: "Create a Legendary Mora", icon: "🌟", aura: 25 },
  creator_3:     { title: "Serial Architect",  desc: "Create 3 Moras",               icon: "🔬", aura: 12 },
};

function checkAchievements(player) {
  if (!player) return [];
  if (!Array.isArray(player.achievements)) player.achievements = [];
  const earned = [];
  const p = player;
  const checks = {
    first_catch:   () => (p.moraOwned?.length || 0) >= 1,
    tamer_10:      () => (p.moraOwned?.length || 0) >= 10,
    tamer_25:      () => (p.moraOwned?.length || 0) >= 25,
    battle_1:      () => (p.battlesWon || 0) >= 1,
    battle_10:     () => (p.battlesWon || 0) >= 10,
    battle_50:     () => (p.battlesWon || 0) >= 50,
    rich_5k:       () => (p.lucons || 0) >= 5000,
    rich_20k:      () => (p.lucons || 0) >= 20000,
    level_10:      () => (p.level || 1) >= 10,
    level_25:      () => (p.level || 1) >= 25,
    level_50:      () => (p.level || 1) >= 50,
    hunter_50:     () => (p.totalHunts || 0) >= 50,
    streak_7:      () => (p.loginStreak || 0) >= 7,
    streak_30:     () => (p.loginStreak || 0) >= 30,
    faction_500:   () => (p.resonance || 0) >= 500,
    companion_100: () => (p.companionBond || 0) >= 100,
    mutator:       () => (p.totalMutations || 0) >= 10,
    creator_first: () => (p.totalCreations || 0) >= 1,
    creator_rare:  () => (p.topCreationRarity || 0) >= 3,
    creator_epic:  () => (p.topCreationRarity || 0) >= 4,
    creator_legendary: () => (p.topCreationRarity || 0) >= 5,
    creator_3:     () => (p.totalCreations || 0) >= 3,
  };
  for (const [key, check] of Object.entries(checks)) {
    if (!p.achievements.includes(key) && check()) {
      p.achievements.push(key);
      earned.push(key);
    }
  }
  return earned;
}

// ── MUTATION SYSTEM ─────────────────────────────────────
// Mutation = temporary stat boost lasting 1-3 battles
// Companion mora: uses bond, no item needed
// Non-companion mora: needs Mutation Shard or Primal Catalyst
// Legendary, Uncommon, and Common mora CANNOT mutate

const MUTATION_BUFFS = [
  { name: "Rift Surge",    stat: "atk", bonus: 8,  icon: "🔥" },
  { name: "Iron Shell",    stat: "def", bonus: 8,  icon: "🛡️" },
  { name: "Quickstep",     stat: "spd", bonus: 8,  icon: "💨" },
  { name: "Vital Pulse",   stat: "hp",  bonus: 25, icon: "❤️" },
  { name: "Energy Bloom",  stat: "energy", bonus: 15, icon: "⚡" },
];

function rollMutation(companionBond, isCompanion, itemId) {
  const buff = MUTATION_BUFFS[Math.floor(Math.random() * MUTATION_BUFFS.length)];
  let duration;
  if (isCompanion) {
    // Companion: base 2, +1 if bond >= 50, +1 if bond >= 150
    duration = 2;
    if (companionBond >= 50) duration = 3;
    if (companionBond >= 150) duration = 4;
  } else if (itemId === "MUT_002") {
    duration = 2 + Math.floor(Math.random() * 2); // 2-3
  } else {
    duration = 1 + Math.floor(Math.random() * 2); // 1-2
  }
  return { ...buff, battlesLeft: duration };
}

function loadFactionState() {
  return JSON.parse(fs.readFileSync(FACTION_FILE, "utf8"));
}
function saveFactionState(data) {
  fs.writeFileSync(FACTION_FILE, JSON.stringify(data, null, 2));
}
const factionState = loadFactionState();

function loadBans() {
  return loadJSON(BANS_FILE, {});
}

// ✅ FIXED: was calling loadJSON instead of saveJSON, and referencing undefined `Bans`
function saveBans(bans) {
  return saveJSON(BANS_FILE, bans);
}

function loadMora() {
  const data = loadJSON(MORA_FILE, []);
  return Array.isArray(data) ? data : [];
}

function loadAFK() {
  return loadJSON(AFK_FILE, {});
}
function saveAFK(afk) {
  return saveJSON(AFK_FILE, afk);
}

// ============================
// REFERRAL SYSTEM
// ============================
function loadReferrals() {
  return loadJSON(REFERRAL_FILE, {});
}
function saveReferrals(r) {
  return saveJSON(REFERRAL_FILE, r);
}

// Generate a short unique code: 3 letters + 4 digits
function generateRefCode(jid) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const tag = String(jid).split("@")[0].slice(-3).toUpperCase().replace(/\D/g, "X").padStart(3, "X");
  const num  = String(Math.floor(1000 + Math.random() * 9000));
  return tag + num;
}

// Milestones: how many uses → which reward tier unlocks
const REF_TIERS = [
  { uses: 1,  lucons: 500,  moraRarities: ["Uncommon", "Uncommon", "Rare"] },
  { uses: 3,  lucons: 1200, moraRarities: ["Uncommon", "Rare", "Rare"] },
  { uses: 5,  lucons: 2000, moraRarities: ["Rare", "Rare", "Epic"] },
  { uses: 10, lucons: 4000, moraRarities: ["Rare", "Epic", "Epic"] },
  { uses: 20, lucons: 8000, moraRarities: ["Epic", "Epic", "Legendary"] },
];

function getRefTier(uses) {
  let tier = REF_TIERS[0];
  for (const t of REF_TIERS) {
    if (uses >= t.uses) tier = t;
  }
  return tier;
}

// Pick 3 Mora options at the given rarities (min lv5, must be Uncommon-Epic range)
function pickRefMoraOptions(moraList, rarities) {
  const opts = [];
  for (const rarity of rarities) {
    const pool = moraList.filter(m => m.rarity === rarity);
    if (!pool.length) continue;
    const species = pool[Math.floor(Math.random() * pool.length)];
    opts.push(species);
  }
  return opts;
}

function nowMs() { return Date.now(); }

// ============================
// FACTION POINTS SYSTEM
// ============================
const FACTION_POINTS_FILE = path.join(DATA_DIR, "faction_points.json");

function loadFactionPoints() {
  return loadJSON(FACTION_POINTS_FILE, { harmony: 0, purity: 0, rift: 0 });
}
function saveFactionPoints(fp) {
  return saveJSON(FACTION_POINTS_FILE, fp);
}
function addFactionPoints(faction, amount, reason = "") {
  if (!faction || !["harmony","purity","rift"].includes(faction)) return;
  const fp = loadFactionPoints();
  fp[faction] = (fp[faction] || 0) + amount;
  saveFactionPoints(fp);
}

// ============================
// BOT PERSONALITY SPEECHES
// ============================
const BOT_SPEECHES = {
  battle_win: [
    "⚔️ *The Rift trembles.* Another warrior rises.",
    "🏆 *Victory echoes through the Lumora crystals.* The strong endure.",
    "✨ *The bond between Lumorian and Mora proved unbreakable today.*",
  ],
  battle_lose: [
    "💔 *Even the mightiest fall. Rise again, Lumorian.*",
    "🌌 *Defeat is not the end — it is the forge.*",
    "🩸 *The Rift does not mourn the fallen. Train harder.*",
  ],
  purify_success: [
    "🕊️ *The darkness retreats. The Mora breathes free once more.*",
    "🌿 *Harmony ripples outward — another soul reclaimed from the Rift's grasp.*",
    "✨ *The Primordial energy settles. Balance restored.*",
  ],
  purify_fail: [
    "☠️ *The corruption runs too deep. The Mora rejects you.*",
    "🌑 *Rift energy surges back. Purification failed.*",
    "⚠️ *The corrupted Mora snarls. Your will alone was not enough.*",
  ],
  mora_submit_harmony: [
    "🌿 *The Mora walks peacefully into the Sanctuary. It senses the calm here.*",
    "🕊️ *Your Mora will live freely at the Harmony Facility — safe from corruption's reach.*",
  ],
  mora_submit_purity: [
    "⚔️ *The Mora is taken to the Order's facility. Its fate rests in discipline.*",
    "🔬 *The Order records the specimen. Science and control prevail.*",
  ],
  mora_submit_rift: [
    "💀 *The corrupted Mora is claimed by the Rift Seekers. What they do next... best not to ask.*",
    "🕶️ *Chaos finds a new vessel. The Rift Seekers smile.*",
  ],
  pe_warning: [
    "⚠️ *Something stirs within your Mora — ancient, unstable energy.*",
    "🌀 *The Primordial Rift pulses. Your Mora is losing control.*",
  ],
  pe_damage: [
    "💥 *PRIMORDIAL BACKLASH — The unstable energy erupts, striking its own Lumorian!*",
    "🌌 *The Rift within your Mora screams outward — you take the blow.*",
  ],
  catch_success: [
    "🔗 *THE BOND SEALS — The Mora's energy aligns with yours. It follows.*",
    "💖 *RESONANCE ACHIEVED — Wild instinct fades, replaced by trust.*",
    "✨ *A new companion. The Rift brought you together for a reason.*",
  ],
  level_up: [
    "🆙 *Power recognized. The Lumora crystals glow brighter.*",
    "⚡ *You feel the Rift's energy coursing through you — you've grown stronger.*",
  ],
};

function pickSpeech(key) {
  const pool = BOT_SPEECHES[key];
  if (!pool || !pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

function cleanupExpiredPunishments(all, players) {
  let changed = false;
  const now = nowMs();

  for (const jid of Object.keys(all)) {
    const arr = Array.isArray(all[jid]) ? all[jid] : [];
    const kept = [];

    for (const pun of arr) {
      const until = Number(pun?.until || 0);
      if (until && now >= until) {
        if (pun.id === 12 && players?.[jid]) {
          const prev = pun?.meta?.prevMasked;
          if (typeof prev === "boolean") players[jid].profileMasked = prev;
        }
        if (pun.id === 15 && players?.[jid]) {
          const prevTitle = pun?.meta?.prevTitle;
          if (typeof prevTitle === "string") players[jid].title = prevTitle;
        }
        changed = true;
        continue;
      }
      kept.push(pun);
    }

    if (kept.length) all[jid] = kept;
    else {
      delete all[jid];
      changed = true;
    }
  }

  return changed;
}

function getActivePunishments(all, jid) {
  const arr = all[normJid(jid)];
  return Array.isArray(arr) ? arr : [];
}

function hasPunishment(active, id) {
  return active.some(p => Number(p?.id) === Number(id));
}

function punishRemaining(active) {
  const now = nowMs();
  const maxUntil = Math.max(0, ...active.map(p => Number(p?.until || 0)));
  if (!maxUntil) return "";
  const rem = Math.max(0, maxUntil - now);
  return formatDuration(rem);
}

function punishSummaryLines(active) {
  const now = nowMs();
  return active
    .map(p => {
      const id = Number(p?.id);
      const def = PUNISHMENTS[id];
      const until = Number(p?.until || 0);
      const rem = until ? formatDuration(Math.max(0, until - now)) : "—";
      return `#${id} • ${def?.name || "Unknown"} • ⏳ ${rem}`;
    })
    .join("\n");
}
let punishments = loadPunishments();

function formatPunishmentsList(activePun = []) {
  if (!activePun.length) return "✅ No active punishments.";

  return activePun
    .map((p) => {
      const meta = PUNISHMENTS[p.type] || { name: `Type ${p.type}`, desc: "" };
      const left = Math.max(0, (p.until || 0) - Date.now());
      const mins = Math.ceil(left / 60000);
      const time = mins <= 0 ? "ending now" : `${mins} min left`;
      return `#${p.type} • *${meta.name}* — ${time}\n↳ ${meta.desc}`;
    })
    .join("\n\n");
}

function clearAllPunishmentsFor(punishments, jid) {
  const id = normJid(jid);
  if (!punishments || typeof punishments !== "object") return false;

  const before = Array.isArray(punishments[id]) ? punishments[id].length : 0;
  punishments[id] = [];
  const after = punishments[id].length;

  return before !== after;
}

// ============================
// SETTINGS
// ============================
function loadSettings() {
  const defaults = {
    botName: "Lumora",
    eraName: "Lumora: Awakening",
    prefix: ".",
    linkDescription: "https://chat.whatsapp.com/HUOV4vTSsSOBzpGcDxosiq",
    currencyName: "LUCONS",
    ownerNumbers: ["263779982560"],
    media: {
      helpImagePath: "./assets/lumora_logo.jpg"
    },
    features: {
      factionsEnabled: true,
      groupSpawnsEnabled: true,
    },
  };

  const s = loadJSON(SETTINGS_FILE, defaults);
  return {
    ...defaults,
    ...s,
    media: { ...defaults.media, ...(s.media || {}) },
    features: { ...defaults.features, ...(s.features || {}) },
  };
}

function normalizeNumberFromJid(jid = "") {
  return String(jid).split("@")[0].replace(/\D/g, "");
}

function senderIsOwner(senderJid, settings) {
  const senderNum = normalizeNumberFromJid(senderJid);
  const owners = (settings?.ownerNumbers || []).map((n) => String(n).replace(/\D/g, ""));
  return owners.includes(senderNum);
}

// ============================
// GENERAL HELPERS
// ============================
function normJid(jid = "") {
  return String(jid || "").split(":")[0];
}
function isGroupJid(jid = "") {
  return jid.endsWith("@g.us");
}
function playerIsInCapital(userId) {
  const huntState = huntingSystem.loadHuntState();
  const hunter = huntState?.players?.[userId];
  if (!hunter) return true;
  return String(hunter.location || "capital") === "capital";
}
function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function isMarketAllowedInChat(chatId, settings) {
  const mg = settings?.marketGroups || { enabled: true, allowed: [] };
  if (mg.enabled === false) return false;
  if (!isGroupJid(chatId)) return false;
  const allowed = Array.isArray(mg.allowed) ? mg.allowed : [];
  return allowed.includes(chatId);
}

function denyMarketGroup(sock, chatId, msg) {
  return sock.sendMessage(chatId, {
    text: "🏪 Market is unavailable in this group.\nGo to the market group or contact the owner for more information.",
  }, { quoted: msg });
}
function isHuntAllowedInChat(chatId, settings) {
  const hg = settings?.huntingGroups || { enabled: true, allowed: [] };
  if (hg.enabled === false) return false;
  if (!isGroupJid(chatId)) return false;
  const allowed = Array.isArray(hg.allowed) ? hg.allowed : [];
  return allowed.includes(chatId);
}
function denyHuntGroup(sock, chatId, msg) {
  return sock.sendMessage(chatId, {
    text: "🏹 Hunting grounds are unavailable in this group.\nGo to the hunting grounds group or contact the owner for more information.",
  }, { quoted: msg });
}
function isArenaAllowedInChat(chatId, settings) {
  const ag = settings?.arenaGroups || { enabled: false, allowed: [] };
  if (ag.enabled === false) return false;
  if (!isGroupJid(chatId)) return false;
  const allowed = Array.isArray(ag.allowed) ? ag.allowed : [];
  return allowed.includes(chatId);
}
function denyArenaGroup(sock, chatId, msg) {
  return sock.sendMessage(chatId, {
    text: "🏟️ The Arena is unavailable in this group.\nGo to the arena group or contact the Architect.",
  }, { quoted: msg });
}
function isMoraCreationAllowedInChat(chatId, settings) {
  const mc = settings?.moraCreationGroups || { enabled: true, allowed: [] };
  if (mc.enabled === false) return false;
  if (!isGroupJid(chatId)) return true; // DMs always allowed
  const allowed = Array.isArray(mc.allowed) ? mc.allowed : [];
  if (allowed.length === 0) return true; // empty = all groups
  return allowed.includes(chatId);
}
function denyMoraCreationGroup(sock, chatId, msg) {
  return sock.sendMessage(chatId, {
    text: "🧪 Mora creation is unavailable in this group.\nVisit an allowed Lumora Labs location or contact the Architect.",
  }, { quoted: msg });
}
// (old mark/blessing expiration helper removed — replaced by pro.js tier system)

const LoreSpeeches = {
    start: [
        "✨ 'A new soul stirs in the Lumorian ether. Welcome, traveler.'",
        "🔮 'The crystals of the capital pulse as a new bond is forged...'",
        "🌌 'Another mortal steps into the light. Will you conquer the Rifts, or fall to them?'"
    ],
    catch: [
        "🔗 *THE BOND SEALS:* Your energy overlaps perfectly with the wild creature's aura. It surrenders to your command.",
        "💖 *RESONANCE ACHIEVED:* The wild Mora lowers its guard, accepting your soul's frequency."
    ]
};
async function maybeTriggerCorruptedPartyBacklash(sock, chatId, senderId, players, msg) {
  const player = players[senderId];
  if (!player) return false;

  const corruptedParty = corruptionSystem.getCorruptedPartyMora(player);
  if (!corruptedParty.length) return false;

  const corruptionData = corruptionSystem.loadCorruptionData();
  const result = corruptionSystem.rollPartyBacklash(corruptionData, player);

  if (!result.triggered) return false;

  const target = corruptedParty[Math.floor(Math.random() * corruptedParty.length)];
  const damage = Math.floor(Math.random() * 12) + 6;

  if (result.blocked) {
    return sock.sendMessage(chatId, {
      text:
        `🛡️ @${senderId.split("@")[0]}'s protective gear blocks a backlash from *${target.name}*`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  player.playerHp = Math.max(0, (player.playerHp || 100) - damage);

  return sock.sendMessage(chatId, {
    text:
      `☠ *CORRUPTED BACKLASH*\n` +
      `*${target.name}* lashes out at its owner!\n` +
      `🩸 @${senderId.split("@")[0]} takes *${damage}* damage`,
    mentions: [senderId]
  }, { quoted: msg });
}

function unwrapMessage(m) {
  let msg = m?.message;
  if (!msg) return null;

  if (msg.ephemeralMessage) msg = msg.ephemeralMessage.message;
  if (msg.viewOnceMessage) msg = msg.viewOnceMessage.message;
  if (msg.viewOnceMessageV2) msg = msg.viewOnceMessageV2.message;

  return msg;
}

function getText(m) {
  const msg = unwrapMessage(m);
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  );
}
// Function to check and update player energy based on time
function checkEnergyRegen(player) {
    const now = Date.now();
    const lastRefill = player.lastHuntRefill || now;
    
    // 24 hours in milliseconds = 86400000. For 12 hours, divide by 2.
    const timePassed = now - lastRefill;
    const regenInterval = 12 * 60 * 60 * 1000; // 12 Hours

    if (timePassed >= regenInterval) {
        const energyToGive = Math.floor(timePassed / regenInterval) * 100;
        player.huntEnergy = Math.min(player.maxHuntEnergy || 100, (player.huntEnergy || 0) + energyToGive);
        player.lastHuntRefill = now;
    }
}
function getMentionedJids(m) {
  const msg = unwrapMessage(m);
  return msg?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

function getRepliedJid(m) {
  const msg = unwrapMessage(m);
  const ctx = msg?.extendedTextMessage?.contextInfo;
  return ctx?.participant ? normJid(ctx.participant) : null;
}

function toUserJidFromArg(arg) {
  if (!arg) return null;
  if (arg.includes("@s.whatsapp.net")) return normJid(arg);
  const digits = String(arg).replace(/[^\d]/g, "");
  if (!digits) return null;
  return digits + "@s.whatsapp.net";
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function mentionTag(sock, chatId, jid, text, quotedMsg) {
  const id = normJid(jid);
  const n = normalizeNumberFromJid(id);
  const finalText = text.replace(/\{mention\}/g, `@${n}`);
  return sock.sendMessage(
    chatId,
    { text: finalText, mentions: [id] },
    quotedMsg ? { quoted: quotedMsg } : undefined
  );
}

function sanitizeUsername(input) {
  if (typeof input !== "string") return null;
  let name = input.trim();
  if (!name) return null;

  name = name.replace(/[\r\n\t]+/g, " ");
  if (name.length > 20) name = name.slice(0, 20);

  if (!name.trim()) return null;
  return name;
}

// ============================
// ASSET HELPERS
// ============================
function safeFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function moraImagePath(speciesOrOwned) {
  const id = Number(speciesOrOwned?.id ?? speciesOrOwned?.moraId ?? 0);
  const name = String(speciesOrOwned?.name || "").trim().toLowerCase();

  const tries = [
    name ? path.join(MORA_ASSETS_DIR, `${name}.png`) : null,
    id ? path.join(MORA_ASSETS_DIR, `id_${id}.png`) : null,
    id ? path.join(MORA_ASSETS_DIR, `${id}.png`) : null,
  ].filter(Boolean);

  for (const p of tries) {
    if (safeFileExists(p)) return p;
  }
  return null;
}

async function sendHelpWithLogo(sock, chatId, settings, caption, quotedMsg) {
  const imgPath = settings?.media?.helpImagePath || "./assets/lumora_logo.jpg";
  const absPath = path.isAbsolute(imgPath) ? imgPath : path.join(__dirname, imgPath);

  try {
    if (safeFileExists(absPath)) {
      return await sock.sendMessage(
        chatId,
        { image: fs.readFileSync(absPath), caption },
        quotedMsg ? { quoted: quotedMsg } : undefined
      );
    }
  } catch {}

  return sock.sendMessage(chatId, { text: caption }, quotedMsg ? { quoted: quotedMsg } : undefined);
}

// ============================
// MORA HELPERS
// ============================
function normalizePickToIdOrName(pick) {
  if (!pick) return "";
  const p = String(pick).trim().toLowerCase();
  const m = p.match(/\d+/);
  if (m && m[0]) return m[0];
  return p;
}

function findMora(moraList, query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();

  if (/^\d+$/.test(q)) {
    const idNum = Number(q);
    return moraList.find((m) => Number(m.id) === idNum) || null;
  }

  return moraList.find((m) => String(m.name || "").toLowerCase() === q) || null;
}

function pickRandomFromArray(arr, k) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(k, a.length));
}

function buildMovePool(species) {
  const pool = new Set();

  if (species?.moves && typeof species.moves === "object") {
    Object.keys(species.moves).forEach((m) => pool.add(m));
  }

  if (species?.learnset && typeof species.learnset === "object") {
    for (const lv of Object.keys(species.learnset)) {
      const arr = species.learnset[lv];
      if (Array.isArray(arr)) arr.forEach((m) => pool.add(m));
    }
  }

  return Array.from(pool);
}

function createOwnedMoraFromSpecies(species) {
  const rarity = String(species?.rarity || "Common");
  const level = 1;

  const pool = buildMovePool(species);
  const pickCount = Math.random() < 0.5 ? 4 : 5;
  const picked = pickRandomFromArray(pool, pickCount);

  const owned = {
    moraId: Number(species.id),
    name: String(species.name),
    type: String(species.type),
    rarity,
    level,
    xp: 0,
    hp: 0,
    maxHp: 0,
    pe: 0,
    corrupted: false,
    moves: picked,
    stats: { atk: 10, def: 10, spd: 10, energy: 30 },
    energy: undefined,
    maxEnergy: undefined,
  };

  xpSystem.applyLevelScaling(owned, species);
  return owned;
}

function autoFixOwnedMora(p, moraList) {
  if (!p || typeof p !== "object") return false;
  if (!Array.isArray(p.moraOwned)) p.moraOwned = [];

  let changed = false;

  p.moraOwned = p.moraOwned.map((m) => {
    if (!m || typeof m !== "object") return m;

    const species = moraList.find((x) => Number(x.id) === Number(m.moraId)) || null;

    if (typeof m.level !== "number" || !Number.isFinite(m.level) || m.level < 1) {
      m.level = 1;
      changed = true;
    }
    if (typeof m.xp !== "number" || !Number.isFinite(m.xp)) {
      m.xp = 0;
      changed = true;
    }
    if (!Array.isArray(m.moves)) {
      m.moves = [];
      changed = true;
    }
    if (typeof m.pe !== "number" || !Number.isFinite(m.pe)) {
      m.pe = 0;
      changed = true;
    }
    if (typeof m.corrupted !== "boolean") {
      m.corrupted = false;
      changed = true;
    }

    if (species) {
      if (!m.name) { m.name = species.name; changed = true; }
      if (!m.type) { m.type = species.type; changed = true; }
      if (!m.rarity) { m.rarity = species.rarity; changed = true; }

      if (!m.moves.length) {
        const pool = buildMovePool(species);
        const pickCount = Math.random() < 0.5 ? 4 : 5;
        m.moves = pickRandomFromArray(pool, pickCount);
        changed = true;
      }

      xpSystem.applyLevelScaling(m, species);
    } else {
      if (!m.stats || typeof m.stats !== "object") {
        m.stats = { atk: 10, def: 10, spd: 10, energy: 30 };
        changed = true;
      }
      if (typeof m.maxHp !== "number" || !Number.isFinite(m.maxHp) || m.maxHp <= 0) {
        m.maxHp = 50;
        changed = true;
      }
      if (typeof m.hp !== "number" || !Number.isFinite(m.hp) || m.hp < 0) {
        m.hp = m.maxHp;
        changed = true;
      }
    }

    return m;
  });

  return changed;
}

// ============================
// PLAYER MIGRATION
// ============================
function migratePlayers(players, moraList) {
  let changed = false;

  for (const id of Object.keys(players)) {
    const p = players[id];
    if (!p || typeof p !== "object") continue;

    if (!p.equipment || typeof p.equipment !== "object") {
      p.equipment = { core: null, charm: null, tool: null, relic: null, cloak: null, boots: null };
      changed = true;
    }

    if (typeof p.lucons !== "number") {
      if (typeof p.lumoraCoins === "number") {
        p.lucons = p.lumoraCoins;
        delete p.lumoraCoins;
        changed = true;
      } else {
        p.lucons = 0;
        changed = true;
      }
    }

    if (!("username" in p)) { p.username = null; changed = true; }
    if (typeof p.level !== "number") { p.level = 1; changed = true; }
    if (typeof p.xp !== "number") { p.xp = 0; changed = true; }
    if (!Array.isArray(p.moraOwned)) { p.moraOwned = []; changed = true; }
    if (typeof p.intelligence !== "number") { p.intelligence = 5; changed = true; }
    if (typeof p.aura !== "number") { p.aura = 10; changed = true; }
    if (typeof p.tameSkill !== "number") { p.tameSkill = 5; changed = true; }
    if (typeof p.playerMaxHp !== "number") { p.playerMaxHp = 100; changed = true; }
    if (typeof p.playerHp !== "number") { p.playerHp = p.playerMaxHp; changed = true; }

    p.playerMaxHp = clamp(p.playerMaxHp, 10, 9999);
    p.playerHp = clamp(p.playerHp, 0, p.playerMaxHp);

    if (!("faction" in p)) { p.faction = null; changed = true; }
    if (typeof p.riftShards !== "number") { p.riftShards = 0; changed = true; }
    if (!Array.isArray(p.starterOptions)) { p.starterOptions = []; changed = true; }
    if (typeof p.profileMasked !== "boolean") { p.profileMasked = false; changed = true; }
    if (!("profileIcon" in p)) { p.profileIcon = null; changed = true; }
    if (!("gender" in p)) { p.gender = null; changed = true; }
    if (!("companionId" in p)) { p.companionId = null; changed = true; }
    if (typeof p.companionBond !== "number") { p.companionBond = 0; changed = true; }
    if (!Array.isArray(p.achievements)) { p.achievements = []; changed = true; }
    if (typeof p.loginStreak !== "number") { p.loginStreak = 0; changed = true; }
    if (typeof p.lastLoginDate !== "string") { p.lastLoginDate = ""; changed = true; }
    if (typeof p.battlesWon !== "number") { p.battlesWon = 0; changed = true; }
    if (typeof p.totalHunts !== "number") { p.totalHunts = 0; changed = true; }
    if (typeof p.totalMutations !== "number") { p.totalMutations = 0; changed = true; }

    if (!p.inventory || typeof p.inventory !== "object") { p.inventory = {}; changed = true; }
    if (!p.equipment || typeof p.equipment !== "object") {
      p.equipment = { core: null, charm: null, tool: null, relic: null, cloak: null, boots: null };
      changed = true;
    }

    // One-time Creation Powder grant — every Lumorian starts with 1 in
    // their pouch (usable once they reach 15 intelligence). Tracked via a
    // per-player flag so we never double-grant on later restarts.
    if (!p.creationPowderGranted) {
      p.inventory.CREATION_POWDER = Number(p.inventory.CREATION_POWDER || 0) + 1;
      p.creationPowderGranted = true;
      changed = true;
    }

    p.intelligence = clamp(p.intelligence, 0, 999);
    p.aura = clamp(p.aura, 0, 9999);
    p.tameSkill = clamp(p.tameSkill, 0, 999);

    if (typeof p.lastDailyAt !== "number" || !Number.isFinite(p.lastDailyAt)) { p.lastDailyAt = 0; changed = true; }
    if (typeof p.lastWeeklyWeek !== "string") { p.lastWeeklyWeek = ""; changed = true; }
    if (typeof p.lastHealAt !== "number" || !Number.isFinite(p.lastHealAt)) { p.lastHealAt = 0; changed = true; }

    if (autoFixOwnedMora(p, moraList)) changed = true;
  }

  return { players, changed };
}

// ============================
// AWAKENING START FLOW
// ============================
const START_CAPTIONS = [
  "🌌 The Rift hums softly… your path begins now.",
  "⚡ The air feels heavier… as if the world is watching.",
  "🧭 Every Lumorian leaves a mark — even with their first step.",
  "🗝️ The Primordial energy stirs… and something answers back.",
  "🌿 A calm wind passes… then silence. The journey opens.",
];

const FACTIONS = {
  harmony: {
    emoji: "🌿",
    name: "Harmony Lumorians",
    belief: "Humans and Mora can live together peacfully as 1.\n " + "We must cleans all the rifts and help all the mora consumed " +
      "by the Primordial energy ",
    strength: "Higher stability + safer bonding path.",
    weakness: "Less access to risky Rift power paths.",
    styles: ["Nature", "Aqua", "Wind", "Terra"],
  },
  purity: {
    emoji: "⚔",
    name: "The Purity Order",
    belief: "*The rift must be closed*.These beasts were never part of the almighty's creation, " +
      "their the Devils pawns here to corrupt and destroy humanity ",
    strength: "More consistent combat/control path.",
    weakness: "Harder to adapt to chaos and unstable power.",
    styles: ["Terra", "Frost", "Volt"],
  },
  rift: {
    emoji: "🕶",
    name: "The Rift Seekers",
    belief: "The Primordial Rift was a blessing brought to us so we can harness its power and use these beasts for our own benefit",
    strength: "High-risk, high-reward power path.",
    weakness: "Unstable — harder to control consequences.",
    styles: ["Shadow", "Volt", "Flame", "Frost"],
  },
};

const PUNISHMENTS = {
  1:  { name: "Muted",           desc: "Bot ignores all commands from the user (no replies)." },
  2:  { name: "Command Jail",    desc: "User can only use: .profile, .help, .appeal" },
  3:  { name: "Cooldown",        desc: "User can only use 1 command every 20 seconds." },
  4:  { name: "No Economy",      desc: "Blocks: .daily .weekly .give .reverse" },
  5:  { name: "No Battle",       desc: "Blocks: .battle .accept .reject .attack .switch .forfeit .use .charge" },
  6:  { name: "No Catching",     desc: "Blocks: .catch and any spawn interaction." },
  7:  { name: "No Trading",      desc: "Blocks: .give .reverse .tamed-give" },
  8:  { name: "No Healing",      desc: "Blocks: .heal" },
  9:  { name: "LUCONS Fine",     desc: "Instant fine: 50 LUCONS × minutes (minimum 50)." },
  10: { name: "XP Drain",        desc: "Instant drain: 10 XP × minutes (minimum 10)." },
  11: { name: "Daily/Weekly Lock", desc: "Blocks: .daily and .weekly" },
  12: { name: "Forced Mask",     desc: "Forces profileMasked = true during punishment (restored after expiry)." },
  13: { name: "Shadow Silence",  desc: "Bot replies with a generic 'Command failed' message to every command." },
  14: { name: "Soft Ban",        desc: "Blocks ALL commands except: .help and .appeal" },
  15: { name: "Strike Mark",     desc: "Adds a visible '⚠ Punished' marker to player title temporarily." },
};

function pickStarterOptionsByFaction(moraList, factionKey) {
  const faction = FACTIONS[factionKey];
  if (!faction) return [];

  const commons = moraList.filter((m) => String(m?.rarity || "").trim().toLowerCase() === "common");
  const preferred = commons.filter((m) => faction.styles.includes(String(m.type)));

  const pool = preferred.length >= 5 ? preferred : commons;
  const picked = pickRandomFromArray(pool, 5);
  return picked.map((m) => Number(m.id)).filter(Boolean);
}

function starterSpeechForFaction(factionKey) {
  if (factionKey === "harmony") return "🌿 You walk the path of harmony. Your bond with Mora grows through balance and trust.";
  if (factionKey === "purity")  return "⚔ You walk the path of purity. Discipline and control define your strength.";
  if (factionKey === "rift")    return "🕶 You walk the path of the Rift. Power responds… but it always demands something back.";
  return "A path is chosen.";
}

// ============================
// AFK SYSTEM
// ============================
function removeAfkIfExists(afk, senderId) {
  if (afk[senderId]) {
    delete afk[senderId];
    return true;
  }
  return false;
}

// ✅ FIXED: removed "observe" and "capture" which had no handler; added "pass"
function isHuntingCommand(cmd = "") {
  return [
    "map",
    "travel",
    "proceed",
    "dismiss",
    "return",
    "hunt",
    "track",
    "pick",
    "pass"
  ].includes(String(cmd).toLowerCase());
}

function isHuntingGroupAllowed(chatId, settings) {
  const hg = settings?.huntingGroups || {};
  if (hg.enabled === false) return false;
  const allowed = Array.isArray(hg.allowed) ? hg.allowed : [];
  return allowed.includes(chatId);
}

// ============================
// BOT START
// ============================
let isStarting = false;
let isReady = false;
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// Cache of WhatsApp pushNames seen in messages (used by .q sticker to show real WA name)
const pushNameCache = {};

const punishRuntime = {
  lastCmdAt: {},
};

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  await loadBaileys();

  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const logger = pino({ level: "silent" });

  let waVersion = null;
  try {
    if (typeof fetchLatestBaileysVersion === "function") {
      const v = await fetchLatestBaileysVersion();
      waVersion = v?.version || null;
    }
  } catch {}

  const sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ["Lumora", "Chrome", "1.0.0"],
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    ...(waVersion ? { version: waVersion } : {}),
  });

  // Initialize MongoDB and load players once at bot startup
  console.log("[bot] Initializing player storage...");
  const initialPlayers = await bootPlayers();
  console.log(`[bot] Loaded ${Object.keys(initialPlayers).length} players`);

  sock.ev.on("creds.update", saveCreds);

  let spawnStarted = false;

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n✅ Scan this QR in WhatsApp → Linked Devices\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isReady = true;
      isStarting = false;
      console.log("🔥 Lumora Bot Connected Successfully!");
      resolveFactionGroups(sock).catch(e => console.log("⚠️ Faction resolve error:", e.message));

      if (!spawnStarted) {
        spawnStarted = true;
        try {
          spawnSystem.start?.(sock, loadMora);
        } catch {}

        // Start bot personality idle loop — sends to all registered faction groups
        const idleGroupJids = Object.keys(FACTION_GROUPS);
        botPersonality.startIdleLoop(sock, idleGroupJids);
      }
    }

    if (connection === "close") {
      isReady = false;

      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || lastDisconnect?.error;

      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnecting:", shouldReconnect, "code:", code, "reason:", reason);

      isStarting = false;
      if (shouldReconnect) {
        // Code 440 = conflict (two instances running during redeploy). Wait before retrying
        // so the old instance has time to die and release the session.
        const delay = code === 440 ? 5000 : 0;
        if (delay) setTimeout(() => startBot(), delay);
        else startBot();
      }
    }
  });
// ── GROUP WELCOME / LEAVE (registered ONCE, outside messages.upsert) ──
sock.ev.removeAllListeners("group-participants.update");
sock.ev.on('group-participants.update', async (update) => {
  try {
    const { id, participants, action } = update;
    const factionWelcome = require('./systems/factionWelcomeSystem');

    // Load fresh data each time since this fires outside messages.upsert scope
    const playersNow = loadPlayers();
    const moraListNow = loadMora();

    if (action === 'add' || action === 'join') {
        try { await resolveFactionGroups(sock); } catch {}
        const normId = normJid(id);
        const groupInfo = FACTION_GROUPS[normId];

        for (const jid of participants) {
            const normed = normJid(jid);
            const p = playersNow[normed];

            if (p && groupInfo && groupInfo.faction !== 'none') {
                p.faction = groupInfo.faction;
                p.joinedFactionGroup = true;
                p.starterOptions = pickStarterOptionsByFaction(moraListNow, p.faction);
                savePlayers(playersNow);
            }

            const faction = groupInfo ? groupInfo.faction : 'none';
            const pool = factionWelcome.WELCOME_MESSAGES[faction] || factionWelcome.WELCOME_MESSAGES.none;
            const welcomeMsg = pool[Math.floor(Math.random() * pool.length)];
            const tag = `@${String(jid).split('@')[0]}`;

            let welcomeText = `${welcomeMsg}\n\n` +
              `hey ${tag}........welcome to the family bro 🌌\n\n` +
              `if this is your first time here........type *.tutorial* and i'll walk you through everything step by step........trust me it's easy\n\n` +
              `we're glad you're here 💪`;

            if (p && groupInfo && groupInfo.faction !== 'none') {
                welcomeText += `\n\n🐉 oh and pick your starter Mora real quick:\n*.choose 1* or *.choose 2*`;
            }

            try {
              await sock.sendMessage(id, { text: welcomeText, mentions: [jid] });
            } catch (e) {
              console.log("Welcome send error:", e?.message || e);
            }
        }
    }

    if (action === 'remove') {
        for (const jid of participants) {
            try {
              await factionWelcome.sendLeaveTaunt(sock, id, jid);
            } catch (e) {
              console.log("Leave taunt error:", e?.message || e);
            }
        }
    }
  } catch (err) {
    if (!isBaileysNoise(err)) console.log("group-participants.update error:", err?.stack || err);
  }
});

sock.ev.removeAllListeners("messages.upsert");
  sock.ev.on("messages.upsert", async ({ messages, type }) => {

    // ✅ ONLY ONE LISTENER NOW
    if (type !== "notify") return;
    if (!isReady) return;

    const msg = messages?.[0];
    if (!msg || !msg.message) return;

    // Debug print
    const debugBody = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

    if (debugBody) console.log(`📩 Message Received: ${debugBody}`);

    try {
      const msg = messages?.[0];
      if (!msg || !msg.message) return;
      // ============================
      // IGNORE OFFLINE / OLD MESSAGES
      // ✅ FIXED: drop anything sent more than 15 seconds before bot connected
      // ============================
      const msgTimestamp = Number(msg.messageTimestamp || 0);
      if (msgTimestamp && msgTimestamp < BOT_START_TIME - 15) return;

      const settings = loadSettings();
      const PREFIX = settings.prefix || ".";

      const chatId = normJid(msg.key.remoteJid);
      const senderId = normJid(msg.key.participant || msg.key.remoteJid);

      // Cache WhatsApp pushName for this sender (used by .q sticker)
      if (msg.pushName) {
        const digitsOnly = String(senderId).split(":")[0].split("@")[0].replace(/\D/g, "");
        pushNameCache[senderId] = msg.pushName;
        pushNameCache[senderId.split(":")[0]] = msg.pushName;
        if (digitsOnly) pushNameCache[digitsOnly] = msg.pushName;
      }

      let players = loadPlayers();
      const bans = loadBans();
      const moraList = loadMora();
      let afk = loadAFK();
      let punishments = loadPunishments();

      const expiredChanged = cleanupExpiredPunishments(punishments, players);
      if (expiredChanged) {
        savePunishments(punishments);
        savePlayers(players);
      }

      const mig = migratePlayers(players, moraList);
      players = mig.players;
      if (mig.changed) savePlayers(players);

      const isOwner = senderIsOwner(senderId, settings);
      const isSudoUser = isSudo(senderId);
      const isRightHand = isRightHandMan(senderId);
      const isPrivileged = isOwner || isRightHand || isSudoUser;   // sudo = owner-lite (no energy cmds)

      // ============================
      // BAN SYSTEM — match by phone-number (JID-agnostic) so bans stick
      // across s.whatsapp.net / lid / device variants
      // ============================
      let bansChanged = false;
      for (const jid of Object.keys(bans)) {
        const b = bans[jid];
        if (b && typeof b === "object" && typeof b.until === "number" && Date.now() >= b.until) {
          delete bans[jid];
          bansChanged = true;
        }
      }
      if (bansChanged) saveBans(bans);

      function findBanForSender(senderJid) {
        const senderNum = normalizeNumberFromJid(senderJid);
        // Direct hit first
        if (bans[normJid(senderJid)]) return bans[normJid(senderJid)];
        // Fallback: match by digits
        for (const k of Object.keys(bans)) {
          if (normalizeNumberFromJid(k) === senderNum) return bans[k];
        }
        return null;
      }

      const banInfo = findBanForSender(senderId);
      if (!isOwner && !isRightHand && !isSudoUser && banInfo) {
        const textNow = getText(msg).trim();
        const PREFIX_NOW = settings.prefix || ".";
        const isCmdNow = textNow.startsWith(PREFIX_NOW);

        if (isCmdNow) {
          const reason =
            typeof banInfo === "object" && banInfo.reason
              ? banInfo.reason
              : "Reason not mentioned";

          try {
            await mentionTag(
              sock,
              chatId,
              senderId,
              `⛔ {mention} cannot use the bot because you have been banned.\n📝 Reason: ${reason}`,
              msg
            );
          } catch {}
        }

        return;
      }

      // ============================
      // AFK: auto-remove if sender speaks again
      // ============================
      const senderWasAfk = removeAfkIfExists(afk, senderId);
      if (senderWasAfk) {
        saveAFK(afk);
        try {
          await mentionTag(sock, chatId, senderId, "✅ Welcome back {mention}. AFK removed.", msg);
        } catch {}
      }

      // ============================
      // AFK: notify if tagged person is AFK
      // ============================
      const mentioned = getMentionedJids(msg);
      const replied = getRepliedJid(msg);
      const targets = [...mentioned, ...(replied ? [replied] : [])];

      for (const t of targets) {
        const tid = normJid(t);
        if (afk[tid] && tid !== senderId) {
          const since = afk[tid].since || Date.now();
          const reason = afk[tid].reason || "No reason set.";
          const away = formatDuration(Date.now() - since);

          await mentionTag(
            sock,
            chatId,
            tid,
            `⏳ {mention} is AFK.\n📝 Reason: ${reason}\n🕒 Away: ${away}`,
            msg
          );
        }
      }

      // Context for modules
      const ctx = {
        sock,
        players,
        savePlayers,
        loadMora,
        battleMath,
        xpSystem,
        auraSystem,
        hpBar,
        createOwnedMoraFromSpecies,
        battleSystem,
        settings,
        isOwner,
        assets: { ASSETS_DIR, MORA_ASSETS_DIR, moraImagePath },
        mentionTag,
        primordial: PRIMORDIAL,
        pushNames: pushNameCache,
      };

      if (isGroupJid(chatId) && settings.features.groupSpawnsEnabled !== false) {
        try {
          await spawnSystem.maybeSpawn(ctx, chatId);
        } catch (e) {
          if (!isBaileysNoise(e)) console.log("Spawn maybeSpawn error:", e?.message || e);
        }
      }

      const text = getText(msg).trim();

      // ── PENDING CREATION FLOW INTERCEPTOR ──
      const moraCreationSystem = require("./systems/moraCreation");
      if (moraCreationSystem.hasPendingCreation(senderId)) {
        return moraCreationSystem.handlePendingCreation(ctx, chatId, senderId, msg, text);
      }

      const isCommand = text.startsWith(PREFIX);

      if (!isCommand) return;

      const args = text.slice(PREFIX.length).trim().split(/\s+/);
      const command = (args.shift() || "").toLowerCase();

      if (isHuntingCommand(command) && !isHuntingGroupAllowed(chatId, settings)) {
        return mentionTag(
          sock,
          chatId,
          senderId,
          `⚔️ {mention} hunting grounds are unavailable in this group.\nGo to the Hunting Grounds group or contact the owner for more information.`,
          msg
        );
      }

      // ================= PUNISH VIEW =================
      if (command === "punishments" || command === "punishinfo") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." });

        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);
        const target = mentioned[0] || replied || argJid;

        if (!target) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}${command} @user  (or reply)` });
        }

        const activePun = getActivePunishments(punishments, normJid(target));
        const list = formatPunishmentsList(activePun);

        return mentionTag(
          sock,
          chatId,
          target,
          `📌 Active punishments for {mention}:\n\n${list}`,
          msg
        );
      }

      // ================= GROUP LINK =================
      if (command === "link") {
        if (!isGroupJid(chatId)) {
          return sock.sendMessage(chatId, { text: "❌ This command only works in groups." });
        }

        try {
          const code = await sock.groupInviteCode(chatId);
          const link = `https://chat.whatsapp.com/${code}`;
          const desc = settings.linkDescription || "🔗 Group link";

          return sock.sendMessage(chatId, { text: `${desc}\n\n${link}` }, { quoted: msg });
        } catch (err) {
          return sock.sendMessage(chatId, {
            text: "❌ I could not fetch the group link. The bot may need admin rights.",
          }, { quoted: msg });
        }
      }

      // ================= FORGIVE =================
      if (command === "forgive") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." });

        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);
        const target = mentioned[0] || replied || argJid;

        if (!target) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}forgive @user  (or reply)` });
        }

        const tid = normJid(target);
        const changed = clearAllPunishmentsFor(punishments, tid);
        if (changed) saveJSON(PUNISH_FILE, punishments);

        return mentionTag(sock, chatId, tid, `✅ {mention} has been forgiven.\nAll punishments cleared.`, msg);
      }

      if (command === "setlinkdesc" || command === "s-l-d") {
        if (!isOwner) {
          return sock.sendMessage(chatId, { text: "❌ Owner-only command." });
        }

        const newDesc = text.slice((PREFIX + "setlinkdesc").length).trim();

        if (!newDesc) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}setlinkdesc Your custom text here` });
        }

        const currentSettings = loadSettings();
        currentSettings.linkDescription = newDesc;
        saveJSON(SETTINGS_FILE, currentSettings);

        return sock.sendMessage(chatId, { text: `✅ Link description updated to:\n${newDesc}` });
      }

      // ============================
      // PUNISH ENFORCEMENT
      // ============================
      const activePun = getActivePunishments(punishments, senderId);

      // ── FACTION CONSEQUENCE CHECK ─────────────────────────
      // Handles: Harmony backlash, Purity quarantine, Rift PE overflow
      const _skipConsequences = new Set(["help","ping","profile","appeal","start","faction"]);
      if (!_skipConsequences.has(command) && players[senderId]) {
        try {
          const _consequences = factionMarketSystem.checkFactionConsequences(
            players[senderId],
            players[senderId].faction
          );
          if (_consequences && _consequences.length) {
            for (const result of _consequences) {
              await sock.sendMessage(chatId, { text: result.message }, { quoted: msg });
            }
            savePlayers(players);
            if (_consequences.some(r => r.backlash)) return;
          }
        } catch {}
      }

      if (!isOwner && !isRightHand && !isSudoUser && activePun.length) {
        if (hasPunishment(activePun, 1)) return;

        const allowOnlyHelpAppeal = hasPunishment(activePun, 14);
        const commandJail = hasPunishment(activePun, 2);
        const shadowSilence = hasPunishment(activePun, 13);
        const cooldown = hasPunishment(activePun, 3);

        const allowInSoft = new Set(["help", "appeal"]);
        const allowInJail = new Set(["profile", "help", "appeal"]);

        if (allowOnlyHelpAppeal && !allowInSoft.has(command)) {
          await mentionTag(
            sock, chatId, senderId,
            `⛔ {mention} you are under *Soft Ban*.\nOnly allowed: .help, .appeal\n⏳ Remaining: ${punishRemaining(activePun)}`,
            msg
          );
          return;
        }

        if (commandJail && !allowInJail.has(command)) {
          await mentionTag(
            sock, chatId, senderId,
            `🚫 {mention} you are in *Command Jail*.\nAllowed: .profile, .help, .appeal\n⏳ Remaining: ${punishRemaining(activePun)}`,
            msg
          );
          return;
        }

        if (cooldown) {
          const last = punishRuntime.lastCmdAt[senderId] || 0;
          if (Date.now() - last < 20000) {
            if (shadowSilence) {
              return sock.sendMessage(chatId, { text: "⚠️ Command failed. Try again later." }, { quoted: msg });
            }
            await mentionTag(
              sock, chatId, senderId,
              `⏳ {mention} slow down — you can use 1 command every 20s.\n⏳ Remaining: ${punishRemaining(activePun)}`,
              msg
            );
            return;
          }
          punishRuntime.lastCmdAt[senderId] = Date.now();
        }

        const blockedEconomy = hasPunishment(activePun, 4);
        const blockedBattle = hasPunishment(activePun, 5);
        const blockedCatch = hasPunishment(activePun, 6);
        const blockedTrade = hasPunishment(activePun, 7);
        const blockedHeal = hasPunishment(activePun, 8);
        const blockedDailyWeekly = hasPunishment(activePun, 11);

        const economyCmds = new Set(["daily", "weekly", "give", "reverse"]);
        const battleCmds = new Set(["battle", "accept", "reject", "refuse", "attack", "switch", "forfeit", "use", "e-charge", "charge", "energy"]);
        const catchCmds = new Set(["catch"]);
        const tradeCmds = new Set(["give", "reverse", "tamed-give"]);
        const healCmds = new Set(["heal"]);

        const deny = async (label) => {
          if (shadowSilence) {
            return sock.sendMessage(chatId, { text: "⚠️ Command failed. Try again later." }, { quoted: msg });
          }
          return mentionTag(
            sock, chatId, senderId,
            `🚫 {mention} you cannot use *${label}* right now.\n⏳ Remaining: ${punishRemaining(activePun)}`,
            msg
          );
        };

        if (blockedDailyWeekly && (command === "daily" || command === "weekly")) return deny("Daily/Weekly");
        if (blockedEconomy && economyCmds.has(command)) return deny("Economy");
        if (blockedBattle && battleCmds.has(command)) return deny("Battles");
        if (blockedCatch && catchCmds.has(command)) return deny("Catching");
        if (blockedTrade && tradeCmds.has(command)) return deny("Trading");
        if (blockedHeal && healCmds.has(command)) return deny("Healing");
      }

      // ============================
      // REFILL HUNT ENERGY (OWNER ONLY)
      // ✅ NEW: .refill --hunt-energy @user
      // ============================
      if (command === "refill") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });

        const subFlag = String(args[0] || "").toLowerCase();
        if (subFlag !== "--hunt-energy") {
          return sock.sendMessage(chatId, {
            text: `Usage: ${PREFIX}refill --hunt-energy @user`,
          }, { quoted: msg });
        }

        const mentionedR = getMentionedJids(msg);
        const repliedR = getRepliedJid(msg);
        const argJidR = toUserJidFromArg(args[1]);
        const refillTarget = mentionedR[0] || repliedR || argJidR;

        if (!refillTarget) {
          return sock.sendMessage(chatId, {
            text: `Usage: ${PREFIX}refill --hunt-energy @user`,
          }, { quoted: msg });
        }

        const refillId = normJid(refillTarget);
        const huntState = huntingSystem.loadHuntState();
        const refillHunter = huntingSystem.ensureHunter(huntState, refillId);

        const maxEnergy = Number(players[refillId]?.maxHuntEnergy || refillHunter.huntEnergyMax || 100);
        refillHunter.huntEnergyMax = maxEnergy;
        refillHunter.huntEnergy = maxEnergy;

        if (players[refillId]) {
          players[refillId].huntEnergy = maxEnergy;
          players[refillId].maxHuntEnergy = maxEnergy;
          savePlayers(players);
        }

        huntingSystem.saveHuntState(huntState);

        return mentionTag(
          sock,
          chatId,
          refillId,
          `⚡ {mention}'s hunt energy has been fully refilled.\n🔋 Hunt Energy: *${maxEnergy}/${maxEnergy}*`,
          msg
        );
      }
 
    // --- PLAYER COMMAND: REGISTER ---
   // --- Inside your message listener ---
// --- PLAYER COMMAND: REGISTER ---
// ============================
// FACTION WAR COMMANDS
// ============================
if (command === "war") {
  const sub = (args[0] || "").toLowerCase();

  // .war join
  if (sub === "join") {
    const result = fEngine.registerPlayer(senderId, players);
    if (!result.ok) return sock.sendMessage(chatId, { text: `❌ ${result.msg}` }, { quoted: msg });
    const p = players[senderId];
    return sock.sendMessage(chatId, {
      text:
        `🌌 *[ ENERGY SYNCED ]*\n\n` +
        `✅ @${String(senderId).split("@")[0]} has entered the war!\n` +
        `Faction: *${(p.faction || "none").toUpperCase()}*\n` +
        `Lobby: *${result.count}* fighters registered.`,
      mentions: [senderId],
    }, { quoted: msg });
  }

  // .war init (owner)
  if (sub === "init") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Only the Architect can initiate a war." }, { quoted: msg });
    const res = fEngine.initWar();
    return sock.sendMessage(chatId, {
      text: `⚔️ *FACTION WAR #${res.count}*\n\n_${res.msg}_\n\nRegistration is *OPEN*! Use *.war join* to enter!`,
    }, { quoted: msg });
  }

  // .war bracket
  if (sub === "bracket" || sub === "status" || sub === "view") {
    try {
      const bracketImg = await generateBracketCanvas(fEngine.war, players);
      return sock.sendMessage(chatId, {
        image: bracketImg,
        caption: fEngine.getBracketText(players),
      }, { quoted: msg });
    } catch {
      return sock.sendMessage(chatId, { text: fEngine.getBracketText(players) }, { quoted: msg });
    }
  }

  // .war winner @user (owner - report match result)
  if (sub === "winner" && isOwner) {
    const mentionedJid = (msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
    const winnerId = mentionedJid ? String(mentionedJid).split(":")[0] : null;
    if (!winnerId) return sock.sendMessage(chatId, { text: "Tag the winner: *.war winner @user*" }, { quoted: msg });

    const result = fEngine.reportMatchWinner(winnerId);
    if (!result.ok) return sock.sendMessage(chatId, { text: `❌ ${result.msg}` }, { quoted: msg });

    const winnerName = players[winnerId]?.username || "???";

    if (result.finished) {
      // WAR IS OVER - apply rewards and show results
      const rewards = fEngine.applyWarRewards(players, savePlayers);

      try {
        const resultImg = await generateWarResultCanvas(result.champion, result.runnerUp, fEngine.war, players);
        const champName = players[result.champion]?.username || "???";
        const ruName = players[result.runnerUp]?.username || "???";

        const rewardLines = rewards.map(r => {
          const icon = r.tier === "champion" ? "👑" : r.tier === "runnerUp" ? "🥈" : r.tier === "winner" ? "✅" : "📦";
          return `  ${icon} *${r.username}*: +${r.lucons} Lucons, +${r.aura} Aura, +${r.resonance} Resonance`;
        });

        await sock.sendMessage(chatId, {
          image: resultImg,
          caption:
            `🏆 *FACTION WAR #${fEngine.war.warCount} ENDED!*\n\n` +
            `👑 Champion: *${champName}*\n` +
            `🥈 Runner-Up: *${ruName}*\n\n` +
            `*REWARDS:*\n${rewardLines.join("\n")}`,
        });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `🏆 *WAR OVER!* Champion: *${winnerName}*\nRewards have been distributed!` });
      }
      return;
    }

    if (result.newRound) {
      await sock.sendMessage(chatId, {
        text: `✅ *${winnerName}* wins the match!\n\n🔔 *ROUND ${result.round}* begins!`,
      });
    } else {
      await sock.sendMessage(chatId, {
        text: `✅ *${winnerName}* wins the match!`,
      });
    }

    // Show next matchup
    const nextMatch = fEngine.showNextMatch();
    if (nextMatch) {
      const np1 = players[nextMatch.p1];
      const np2 = players[nextMatch.p2];
      try {
        const vsImg = await generateVsCanvas(np1, np2, `WAR #${fEngine.war.warCount} - ROUND ${fEngine.war.round}`);
        await sock.sendMessage(chatId, {
          image: vsImg,
          caption:
            `⚔️ *NEXT MATCH*\n\n` +
            `_${fEngine.getMatchIntro()}_\n\n` +
            `@${String(nextMatch.p1).split("@")[0]}  vs  @${String(nextMatch.p2).split("@")[0]}\n\n` +
            `Use *.ready* when prepared!`,
          mentions: [nextMatch.p1, nextMatch.p2],
        });
      } catch {
        await sock.sendMessage(chatId, {
          text: `⚔️ *NEXT MATCH:* @${String(nextMatch.p1).split("@")[0]} vs @${String(nextMatch.p2).split("@")[0]}\nUse *.ready* when prepared!`,
          mentions: [nextMatch.p1, nextMatch.p2],
        });
      }
    }
    return;
  }

  // .war history
  if (sub === "history") {
    const history = fEngine.getWarHistory();
    if (!history.length) return sock.sendMessage(chatId, { text: "No war history yet." }, { quoted: msg });

    const lines = history.slice(-5).map(h => {
      const champName = players[h.champion]?.username || "???";
      return `  ⚔️ War #${h.war}: 👑 *${champName}* (${h.participants} fighters)`;
    });
    return sock.sendMessage(chatId, {
      text: `📜 *WAR HISTORY* (Last 5)\n\n${lines.join("\n")}`,
    }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text:
      `⚔️ *FACTION WAR*\n\n` +
      `*.war join* — register for war\n` +
      `*.war bracket* — view bracket\n` +
      `*.war history* — past wars\n` +
      `*.ready* — ready up for match\n` +
      `*.withdraw* — leave (penalties!)`,
  }, { quoted: msg });
}

// .war-start (owner)
if (command === "war-start") {
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Only the Architect can start the war." }, { quoted: msg });

  const started = fEngine.createBrackets();
  if (!started) return sock.sendMessage(chatId, { text: "❌ Not enough players (minimum 2 required)." }, { quoted: msg });

  const match = fEngine.showNextMatch();
  if (match) {
    const p1 = players[match.p1];
    const p2 = players[match.p2];
    try {
      const vsImg = await generateVsCanvas(p1, p2, `WAR #${fEngine.war.warCount}`);
      await sock.sendMessage(chatId, {
        image: vsImg,
        caption:
          `⚔️ *FACTION WAR #${fEngine.war.warCount} HAS BEGUN!*\n\n` +
          `_${fEngine.getMatchIntro()}_\n\n` +
          `First Match:\n@${String(match.p1).split("@")[0]}  vs  @${String(match.p2).split("@")[0]}\n\n` +
          `Use *.ready* when prepared!`,
        mentions: [match.p1, match.p2],
      });
    } catch {
      await sock.sendMessage(chatId, {
        text: `⚔️ *WAR BEGUN!*\nFirst Match: @${String(match.p1).split("@")[0]} vs @${String(match.p2).split("@")[0]}`,
        mentions: [match.p1, match.p2],
      });
    }
  }
  return;
}

// .ready
if (command === "ready") {
  const result = fEngine.markReady(senderId);
  if (!result.ok) return sock.sendMessage(chatId, { text: `❌ ${result.msg}` }, { quoted: msg });

  if (result.bothReady) {
    const match = fEngine.getActiveMatch();
    return sock.sendMessage(chatId, {
      text:
        `⚡ *BOTH FIGHTERS READY!*\n\n` +
        `@${String(match.p1).split("@")[0]} vs @${String(match.p2).split("@")[0]}\n\n` +
        `_The battle can begin! Use *.battle @opponent* to fight!_\n` +
        `Owner: use *.war winner @user* to report the result.`,
      mentions: [match.p1, match.p2],
    }, { quoted: msg });
  }

  return sock.sendMessage(chatId, { text: "🏁 You're ready! Waiting for your opponent..." }, { quoted: msg });
}

// .withdraw
if (command === "withdraw") {
  if (!fEngine.war.participants.find(x => x.id === senderId)) {
    return sock.sendMessage(chatId, { text: "❌ You're not in the war!" }, { quoted: msg });
  }
  fEngine.war.pendingWithdrawal = senderId;
  return sock.sendMessage(chatId, {
    text:
      `⚠️ *DESERTION WARNING*\n\n` +
      `Withdrawing will cost you:\n` +
      `  • -1,000 Lucons\n` +
      `  • -50 Resonance\n` +
      `  • Opponent auto-wins\n\n` +
      `*.confirm* to leave  |  *.cancel* to stay`,
  }, { quoted: msg });
}

if (command === "confirm") {
  if (fEngine.war.pendingWithdrawal !== senderId) return;
  const p = players[senderId];
  p.lucons = Math.max(0, (p.lucons || 0) - 1000);
  p.resonance = Math.max(0, (p.resonance || 0) - 50);
  fEngine.withdrawPlayer(senderId);
  fEngine.war.pendingWithdrawal = null;
  savePlayers(players);
  return sock.sendMessage(chatId, { text: "🏳️ You deserted the war. Penalties applied." }, { quoted: msg });
}

if (command === "cancel") {
  if (fEngine.war.pendingWithdrawal !== senderId) return;
  fEngine.war.pendingWithdrawal = null;
  return sock.sendMessage(chatId, { text: "🛡️ Good. Stand your ground, Lumorian!" }, { quoted: msg });
}

      if (command === "ownercheck") {
        return sock.sendMessage(chatId, {
          text:
            `senderId: ${senderId}\n` +
            `normalized: ${normalizeNumberFromJid(senderId)}\n` +
            `ownerNumbers: ${(settings.ownerNumbers || []).join(", ")}\n` +
            `isOwner: ${isOwner}`,
        });
      }

      // ============================
      // CORE COMMANDS
      // ============================
      if (command === "ping") {
        return sock.sendMessage(chatId, { text: "🏓 Pong! STAR Is AWAKE🏓" });
      }

      if (command === "missions") {
        return missionSystem.cmdMissions(ctx, chatId, senderId, msg);
      }

      if (command === "complete") {
        return missionSystem.cmdComplete(ctx, chatId, senderId, msg, args);
      }
// UPTIME COMMAND
if (command === "uptime") {
  const now = Date.now();
  const uptimeMs = now - startTime;

  const seconds = Math.floor((uptimeMs / 1000) % 60);
  const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
  const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
  const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  return sock.sendMessage(chatId, {
    text: `⏱️ *Lumora Uptime*\n\n${uptimeStr}`
  }, { quoted: msg });
}
      // ============================
      // INVENTORY & GEAR
      // ============================
      if (command === "inventory" || command === "inv") {
        return inventorySystem.cmdInventory(ctx, chatId, senderId, msg, args);
      }
      if (command === "item") {
        return inventorySystem.cmdItem(ctx, chatId, senderId, msg, args);
      }
      if (command === "consume") {
        return inventorySystem.cmdConsume(ctx, chatId, senderId, msg, args);
      }
      if (command === "gear") {
        return gearSystem.cmdGear(ctx, chatId, senderId, msg, args, {
          getMentionedJids,
          getRepliedJid,
          toUserJidFromArg,
          normJid,
        });
      }
      if (command === "equip") {
        return gearSystem.cmdEquip(ctx, chatId, senderId, msg, args);
      }
      if (command === "unequip") {
        return gearSystem.cmdUnequip(ctx, chatId, senderId, msg, args);
      }
      if (command === "eradicate") {
        return gearSystem.cmdEradicate(ctx, chatId, senderId, msg, args);
      }

      // ============================
      // MARKET
      // ============================
      if (
        command === "market" ||
        command === "buy" ||
        command === "subscribe-market" ||
        command === "unsubscribe-market" ||
        command === "market-items" ||
        command === "market-refresh" ||
        command === "market-add" ||
        command === "market-remove" ||
        command === "market-set" ||
        command === "fbuy" ||
        (command === "faction" && String(args[0] || "").toLowerCase() === "market")
      ) {
        const isOwnerMarketCmd =
          command === "market-items" ||
          command === "market-refresh" ||
          command === "market-add" ||
          command === "market-remove" ||
          command === "market-set";

        if (!isOwnerMarketCmd) {
          if (!isMarketAllowedInChat(chatId, settings)) {
            return denyMarketGroup(sock, chatId, msg);
          }
        }

        if (command === "market") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ The main market is only available in *Capital*.\nUse `.return` to go back.",
            }, { quoted: msg });
          }
          return marketSystem.cmdMarket(ctx, chatId, senderId, msg);
        }

        if (command === "buy") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ You can only buy from the main market while in *Capital*.",
            }, { quoted: msg });
          }
          return marketSystem.cmdBuy(ctx, chatId, senderId, msg, args);
        }
        if (command === "subscribe-market") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ Market subscriptions can only be managed in *Capital*.",
            }, { quoted: msg });
          }
          return marketSystem.cmdSubscribeMarket(ctx, chatId, senderId, msg);
        }

        if (command === "unsubscribe-market") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ Market subscriptions can only be managed in *Capital*.",
            }, { quoted: msg });
          }
          return marketSystem.cmdUnsubscribeMarket(ctx, chatId, senderId, msg);
        }

        if (command === "faction" && String(args[0] || "").toLowerCase() === "market") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ Faction market access is only available in *Capital* for now.",
            }, { quoted: msg });
          }
          return factionMarketSystem.cmdFactionMarket(ctx, chatId, senderId, msg);
        }

        if (command === "fbuy") {
          if (!playerIsInCapital(senderId)) {
            return sock.sendMessage(chatId, {
              text: "🏛️ You can only buy from the faction market while in *Capital*.",
            }, { quoted: msg });
          }
          return factionMarketSystem.cmdFbuy(ctx, chatId, senderId, msg, args);
        }

        if (command === "market-items")   return marketSystem.cmdMarketItems(ctx, chatId, senderId, msg);
        if (command === "market-refresh") return marketSystem.cmdMarketRefresh(ctx, chatId, senderId, msg);
        if (command === "market-add")     return marketSystem.cmdMarketAdd(ctx, chatId, senderId, msg, args);
        if (command === "market-remove")  return marketSystem.cmdMarketRemove(ctx, chatId, senderId, msg, args);
        if (command === "market-set")     return marketSystem.cmdMarketSet(ctx, chatId, senderId, msg, args);
      }

      if (command === "gitem") {
        return giveItemSystem.cmdGiveItem(ctx, chatId, senderId, msg, args, {
          getMentionedJids,
          getRepliedJid,
          toUserJidFromArg,
        });
      }

      // ============================
      // ECONOMY
      // ============================
      if (command === "daily") return economySystem.cmdDaily(ctx, chatId, senderId);
      if (command === "weekly") return economySystem.cmdWeekly(ctx, chatId, senderId);
      if (command === "reverse") return economySystem.cmdReverse(ctx, chatId, senderId, args);

      if (command === "give") {
        return economySystem.cmdGive(ctx, chatId, senderId, msg, args, {
          getMentionedJids,
          getRepliedJid,
          toUserJidFromArg,
          normJid,
        });
      }

      // ============================
      // HEAL
      // ============================
      if (command === "heal") {
  const p = players[senderId];
  if (!p) return;

  // 1. Check for Active Duel (Global)
  // Assuming your battle system sets p.inBattle = true when a fight starts
  if (p.inBattle) {
    return sock.sendMessage(chatId, {
      text: "❌ *RESONANCE INTERRUPTED*\n\nYou cannot heal while your consciousness is tied to an active duel! Finish your fight first.",
    });
  }

  // 2. Check for Active Hunt (Global)
  // Assuming your hunt system sets p.activeHunt = true when they travel
  if (p.activeHunt) {
    return sock.sendMessage(chatId, {
      text: "❌ *STAMINA LOCKED*\n\nYou are currently tracking Mora in the wild. Return to the Capital or finish your encounter to heal.",
    });
  }

  // 3. If they are safe, run the heal
  return healSystem.cmdHeal(ctx, chatId, senderId);
}
      if (command === "sub") {
  const p = players[senderId];
  if (!p || !p.moraOwned) return;

  const slot1 = parseInt(args[0]) - 1;
  const slot2 = parseInt(args[1]) - 1;

  if (isNaN(slot1) || isNaN(slot2) || slot1 === slot2) {
    return sock.sendMessage(chatId, { text: "❌ Use: .sub <slot1> <slot2> (e.g., .sub 1 5)" });
  }

  if (!p.moraOwned[slot1] || !p.moraOwned[slot2]) {
    return sock.sendMessage(chatId, { text: "❌ Invalid slots chosen." });
  }

  // Remove the selected Mora from the ACTIVE battle party (assuming you track that)
  // Or create a temporary 'warParty' array for the tournament.
  p.warParty = p.moraOwned.filter((_, index) => index !== slot1 && index !== slot2);
  
  savePlayers(players);
  return sock.sendMessage(chatId, { text: "✅ Lineup adjusted. You are now ready for the bracket!" });
}

      // ============================
      // SPAWN
      // ============================
      if (command === "spawnrates") return spawnSystem.cmdSpawnRates(ctx, chatId);
      if (command === "catch" || command === "c") return spawnSystem.cmdCatch(ctx, chatId, senderId, args);

      // ============================
      // TRANSFER
      // ============================
      if (command === "tamed-give") {
        return transferSystem.cmdTamedGive(ctx, chatId, senderId, msg, args, {
          getMentionedJids,
          getRepliedJid,
          toUserJidFromArg,
          normJid,
        });
      }

      // ============================
      // PARTY
      // ============================
      if (command === "party")    return partySystem.cmdParty(ctx, chatId, senderId, msg);
      if (command === "t2party")  return partySystem.cmdT2Party(ctx, chatId, senderId, msg, args);
      if (command === "t2tamed")  return partySystem.cmdT2Tamed(ctx, chatId, senderId, msg, args);

      // ============================
      // AFK
      // ============================
      if (command === "afk") {
        const reason = text.slice((PREFIX + "afk").length).trim() || "No reason set.";
        afk[senderId] = { reason, since: Date.now() };
        saveAFK(afk);
        return sock.sendMessage(chatId, { text: `⏳ AFK set.\n📝 Reason: ${reason}` });
      }

      // ============================
      // SET ICON — ✅ max size raised to 2MB
      // ============================
      if (command === "set-icon") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });

        const rawMsg = unwrapMessage(msg);
        const quoted = rawMsg?.extendedTextMessage?.contextInfo?.quotedMessage;

        const imgMsg = rawMsg?.imageMessage || quoted?.imageMessage || null;
        const vidMsg = rawMsg?.videoMessage || quoted?.videoMessage || null;
        const mediaMsg = imgMsg || vidMsg;

        if (!mediaMsg) {
          return sock.sendMessage(chatId, {
            text:
              `📸 *Set Profile Icon*\n\n` +
              `Send your image/video with the caption: *${PREFIX}set-icon*\n` +
              `Or reply to an image/video with: *${PREFIX}set-icon*\n\n` +
              `📏 Size limit: 2MB\n` +
              `✅ Supported: JPG, PNG, short video thumbnail`,
          }, { quoted: msg });
        }

        const fileSize = Number(mediaMsg.fileLength || mediaMsg.fileSha256?.length || 0);
        const MAX_BYTES = 2 * 1024 * 1024; // ✅ 2MB
        if (fileSize > MAX_BYTES) {
          return sock.sendMessage(chatId, {
            text: `❌ File too large. Max size is *2MB*.\nYour file: ${Math.round(fileSize / 1024)}KB`,
          }, { quoted: msg });
        }

        try {
          const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
          const buffer = await downloadMediaMessage(
            { message: rawMsg?.imageMessage ? { imageMessage: imgMsg } : { videoMessage: vidMsg }, key: msg.key },
            "buffer",
            {}
          );

          if (buffer.length > MAX_BYTES) {
            return sock.sendMessage(chatId, {
              text: `❌ File too large after download. Max size is *2MB*.`,
            }, { quoted: msg });
          }

          const mimeType = imgMsg ? (imgMsg.mimetype || "image/jpeg") : "image/jpeg";
          const b64 = buffer.toString("base64");
          const dataUri = `data:${mimeType};base64,${b64}`;

          players[senderId].profileIcon = dataUri;
          savePlayers(players);

          return sock.sendMessage(chatId, {
            text: `✅ Profile icon updated! It will show on your *.profile*.`,
          }, { quoted: msg });
        } catch (e) {
          console.log("set-icon download error:", e?.message || e);
          return sock.sendMessage(chatId, {
            text: `❌ Failed to download the image. Try again.`,
          }, { quoted: msg });
        }
      }
// ==========================================
// 📊 USER COMMAND: VIEW FACTION PROGRESS
// ==========================================
if (command === "facprogress" || command === "factionprogress") {
  if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  
  const p = players[senderId];
  const cost = 200;

  // Assuming you store currency as p.lucons. Adjust if it's named differently!
  if ((p.lucons || 0) < cost) {
    return sock.sendMessage(chatId, { text: `❌ You need at least ${cost} Lucons to view the global intel.` });
  }

  // Deduct Lucons
  p.lucons -= cost;
  savePlayers(players);

  // Determine Leader
  const pts = factionState.points;
  let leader = "Harmony";
  let max = pts.harmony;
  if (pts.purity > max) { leader = "Purity"; max = pts.purity; }
  if (pts.rift > max) { leader = "Rift"; max = pts.rift; }

  const caption = 
    `📊 *SEASON ${factionState.season} INTEL* 📊\n${DIVIDER}\n` +
    `🏆 *Current Leader:* ${leader}\n` +
    `💰 *Reward Pool:* ${factionState.rewards.lucons} Lucons to all winners\n\n` +
    `_200 Lucons were deducted from your account to access this terminal._`;

  // Generate Image
  const imageBuffer = await generateFactionGraph(pts, factionState.season, factionState.style);

  return sock.sendMessage(chatId, { 
    image: imageBuffer, 
    caption: caption 
  }, { quoted: msg });
}

// ==========================================
// 👑 OWNER COMMANDS: FACTION MANAGEMENT
// ==========================================
// Replace with your actual owner's WhatsApp number


if (command === "owner-fac-p") {
  if (!isOwner) return;
  const menu = 
    `👑 *OWNER FACTION PANEL*\n${DIVIDER}\n` +
    `*.addfacpts <faction> <amt>* - Add points\n` +
    `*.setfacstyle <classic/dark/neon>* - Change graph style\n` +
    `*.setfacreward <amt>* - Set Lucon reward pool\n` +
    `*.endseason* - Conclude the season & distribute rewards\n` +
    `*.resetseason* - Wipe points to 0\n`;
  return sock.sendMessage(chatId, { text: menu });
}

if (command === "addfacpts") {
  if (!isOwner) return;
  const fac = args[0]?.toLowerCase();
  const amt = parseInt(args[1]);
  
  if (!fac || !factionState.points[fac] === undefined || isNaN(amt)) {
    return sock.sendMessage(chatId, { text: "Use: .addfacpts harmony/purity/rift 500" });
  }
  
  factionState.points[fac] += amt;
  saveFactionState(factionState);
  return sock.sendMessage(chatId, { text: `✅ Added ${amt} points to ${fac}.` });
}

if (command === "setfacstyle") {
  if (!isOwner) return;
  const style = args[0]?.toLowerCase();
  if (!["classic", "dark", "neon"].includes(style)) {
    return sock.sendMessage(chatId, { text: "Valid styles: classic, dark, neon" });
  }
  factionState.style = style;
  saveFactionState(factionState);
  return sock.sendMessage(chatId, { text: `✅ Canvas style updated to *${style}*.` });
}

if (command === "setfacreward") {
  if (!isOwner) return;
  const amt = parseInt(args[0]);
  if (isNaN(amt)) return sock.sendMessage(chatId, { text: "Use: .setfacreward 1000" });
  
  factionState.rewards.lucons = amt;
  saveFactionState(factionState);
  return sock.sendMessage(chatId, { text: `✅ Season reward set to ${amt} Lucons.` });
}
if (command === "endseason") {
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." });

  const pts = factionState.points;
  let winner = "harmony";
  let max = pts.harmony;
  
  if (pts.purity > max) { winner = "purity"; max = pts.purity; }
  if (pts.rift > max) { winner = "rift"; max = pts.rift; }

  const reward = factionState.rewards.lucons || 1000;
  let winnersCount = 0;

  // 💰 Distribute rewards to all players in the winning faction
  for (const jid in players) {
    if (players[jid].faction === winner) {
      players[jid].lucons = (players[jid].lucons || 0) + reward;
      winnersCount++;
    }
  }
  
  savePlayers(players);

  // 🔄 Reset Season Data
  factionState.season += 1;
  factionState.points = { harmony: 0, purity: 0, rift: 0 };
  saveFactionState(factionState);

  // 📢 Announce to the chat
  return sock.sendMessage(chatId, {
    text: `🎉 *L U M O R A  •  S E A S O N   E N D E D* 🎉\n${DIVIDER}\n` +
          `🏆 The victorious faction is *${titleCase(winner)}* with ${max} points!\n\n` +
          `💰 Distributed *${reward} Lucons* to ${winnersCount} loyal members.\n\n` +
          `Welcome to Season ${factionState.season}! The board has been wiped clean. Let the new hunt begin!`
  });
}
      // ============================
      // USERNAME
      // ============================
      if (command === "set-username") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });

        const raw = text.slice((PREFIX + "set-username").length).trim();
        const cleaned = sanitizeUsername(raw);

        if (!cleaned) {
          return sock.sendMessage(chatId, {
            text: "Usage: .set-username YourName\n(max 20 characters, emojis & symbols allowed)",
          });
        }

        players[senderId].username = cleaned;
        savePlayers(players);

        return sock.sendMessage(chatId, { text: `✅ Username set to: *${cleaned}*` });
      }

      // ============================
      // PUNISH SYSTEM (OWNER ONLY)
      // ============================
      if (command === "punish" || command === "p") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." });

        if (!args.length) {
          const lines = Object.keys(PUNISHMENTS).map((k) => {
            const id = Number(k);
            return `#${id} • *${PUNISHMENTS[id].name}*\n- ${PUNISHMENTS[id].desc}`;
          });

          return sock.sendMessage(chatId, {
            text:
              `🧷 *PUNISHMENTS (Owner Only)*\n\n` +
              lines.join("\n\n") +
              `\n\nUsage:\n` +
              `• ${PREFIX}punish <id> @user <minutes>\n` +
              `• ${PREFIX}p <id> @user <minutes>\n\n` +
              `Example:\n${PREFIX}p 3 @user 10`,
          });
        }

        const id = Number(args[0]);
        if (!PUNISHMENTS[id]) {
          return sock.sendMessage(chatId, { text: `❌ Invalid punishment id.\nUse: ${PREFIX}punish (to list)` });
        }

        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[1]);

        const target = mentioned[0] || replied || argJid;
        if (!target) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}p ${id} @user <minutes>` });
        }

        const minutes = Number(args[2] || args[1] || 0);
        const durMin = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 10;
        const until = Date.now() + durMin * 60 * 1000;

        punishments = loadPunishments();
        players = loadPlayers();

        const tId = normJid(target);
        if (!Array.isArray(punishments[tId])) punishments[tId] = [];

        const entry = { id, at: Date.now(), until, by: senderId, meta: {} };

        if (id === 9) {
          const fine = Math.max(50, 50 * durMin);
          if (players[tId]) {
            players[tId].lucons = Math.max(0, Number(players[tId].lucons || 0) - fine);
            savePlayers(players);
          }
          entry.meta.fine = fine;
        }

        if (id === 10) {
          const drain = Math.max(10, 10 * durMin);
          if (players[tId]) {
            players[tId].xp = Math.max(0, Number(players[tId].xp || 0) - drain);
            savePlayers(players);
          }
          entry.meta.drain = drain;
        }

        if (id === 12 && players[tId]) {
          entry.meta.prevMasked = !!players[tId].profileMasked;
          players[tId].profileMasked = true;
          savePlayers(players);
        }

        if (id === 15 && players[tId]) {
          entry.meta.prevTitle = String(players[tId].title || "Rookie 🚼");
          players[tId].title = "⚠ Punished";
          savePlayers(players);
        }

        punishments[tId].push(entry);
        savePunishments(punishments);

        let extra = "";
        if (id === 9)  extra = `\n💸 Fine: ${entry.meta.fine} LUCONS`;
        if (id === 10) extra = `\n✨ XP drained: ${entry.meta.drain}`;
        if (id === 12) extra = `\n🎭 Profile forced masked`;
        if (id === 15) extra = `\n🏷 Title set to: ⚠ Punished`;

        return mentionTag(
          sock, chatId, tId,
          `✅ Applied punishment to {mention}\n` +
          `🧷 #${id} • *${PUNISHMENTS[id].name}*\n` +
          `⏳ Duration: ${durMin} minute(s)\n` +
          `📝 Effect: ${PUNISHMENTS[id].desc}${extra}`,
          msg
        );
      }

      if (command === "appeal") {
        return sock.sendMessage(chatId, {
          text: "📝 Appeal received.\nAsk the owner politely to review your punishment.",
        });
      }

      // ================= START (AWAKENING) =================
      if (command === "start") {
        if (players[senderId]) {
          const p = players[senderId];

          if (!p.faction && settings.features.factionsEnabled !== false) {
            return sock.sendMessage(chatId, {
              text:
                `✅ You are already a Lumorian.\n\n⚔ You must choose ONE faction:\n` +
                `${PREFIX}faction harmony\n${PREFIX}faction purity\n${PREFIX}faction rift`,
            });
          }

          if (!p.starterChosen) {
            return sock.sendMessage(chatId, {
              text: `✅ You are already a Lumorian.\n\n🐉 Choose your starter Mora using: ${PREFIX}choose 1-5`,
            });
          }

          return sock.sendMessage(chatId, {
            text: `✅ You are already a Lumorian.\nUse ${PREFIX}profile to view your profile.`,
          });
        }

        players[senderId] = {
          username: null,
          id: senderId,
          level: 1,
          xp: 0,
          lucons: 350,
          rank: "Trainee",
          title: "Rookie 🚼",
          intelligence: 5,
          aura: 10,
          tameSkill: 5,
          playerMaxHp: 100,
          playerHp: 100,
          faction: settings.features.factionsEnabled === false ? null : null,
          starterOptions: [],
          moraOwned: [],
          starterChosen: false,
          createdAt: new Date().toISOString(),
          lastDailyAt: 0,
          lastWeeklyWeek: "",
          lastHealAt: 0,
          profileMasked: false,
          huntEnergy: 200,
          maxHuntEnergy: 200,
          lastHuntRefill: Date.now(),
          inventory: { CREATION_POWDER: 1 },
          creationPowderGranted: true,
          equipment: {
            core: null,
            charm: null,
            tool: null,
            relic: null,
            cloak: null,
            boots: null,
          },
        };

        savePlayers(players);

        // ── Referral code check ──────────────────────────────
        const enteredCode = String(args[0] || "").trim().toUpperCase();
        if (enteredCode) {
          const refs = loadReferrals();
          // Find whose code this is
          const refEntry = Object.values(refs).find(r => r.code === enteredCode);
          if (!refEntry) {
            await sock.sendMessage(chatId, { text: `⚠️ Referral code *${enteredCode}* not found. You joined without a referral.` }, { quoted: msg });
          } else if (refEntry.ownerJid === senderId) {
            await sock.sendMessage(chatId, { text: `⚠️ You can't use your own referral code!` }, { quoted: msg });
          } else if (refEntry.usedBy && refEntry.usedBy.includes(senderId)) {
            await sock.sendMessage(chatId, { text: `⚠️ You already used this referral code.` }, { quoted: msg });
          } else {
            // Record use
            if (!refEntry.usedBy) refEntry.usedBy = [];
            refEntry.usedBy.push(senderId);
            refEntry.totalUses = (refEntry.totalUses || 0) + 1;
            // Mark a pending reward for the referrer (claimed via .claim-ref)
            if (!refEntry.pendingRewards) refEntry.pendingRewards = [];
            const tier = getRefTier(refEntry.totalUses);
            refEntry.pendingRewards.push({
              triggeredAt: Date.now(),
              newPlayer: senderId,
              lucons: tier.lucons,
              moraRarities: tier.moraRarities,
              uses: refEntry.totalUses,
              claimed: false,
            });
            saveReferrals(refs);
            // Notify referrer in DM
            const referrer = players[refEntry.ownerJid];
            const referrerName = referrer?.username || String(refEntry.ownerJid).split("@")[0];
            try {
              await sock.sendMessage(refEntry.ownerJid, {
                text:
                  `🎉 *REFERRAL ACTIVATED!*\n\n` +
                  `Someone used your referral code *${enteredCode}*!\n` +
                  `👥 Total referrals: *${refEntry.totalUses}*\n\n` +
                  `🎁 A reward is waiting for you!\n` +
                  `Use *.claim-ref* in DM to choose your prize.`,
              });
            } catch {}
            await sock.sendMessage(chatId, { text: `✅ Referral code accepted! *${referrerName}* will be rewarded for bringing you in.` }, { quoted: msg });
          }
        }

        const cap = START_CAPTIONS[Math.floor(Math.random() * START_CAPTIONS.length)];

        if (settings.features.factionsEnabled === false) {
          return sock.sendMessage(chatId, {
            text:
              `🌌 *${settings.eraName}*\n${cap}\n\n` +
              `✅ You are now a *Lumorian*.\n\n` +
              `Choose a Mora to start your venture:\n` +
              `1) Nylon (ID_1 • Aqua)\n` +
              `2) Thornel (ID_2 • Nature)\n` +
              `3) Terron (ID_3 • Terra)\n` +
              `4) Sparko (ID_4 • Volt)\n` +
              `5) Emberu (ID_5 • Flame)\n\n` +
              `Use: .choose 1  (or .choose Emberu)`,
          });
        }

        return sock.sendMessage(chatId, {
          text:
            `🌌 *${settings.eraName}*\n${cap}\n\n` +
            `✅ You are now a *Lumorian*.\n\n` +
            `⚔ *Choose ONE faction*\n\n` +
            `🌿 *Harmony Lumorians*\n•Belief ${FACTIONS.harmony.belief}\n• Strength: ${FACTIONS.harmony.strength}\n• Weakness: ${FACTIONS.harmony.weakness}\n\n` +
            `⚔ *The Purity Order*\n•Belief ${FACTIONS.purity.belief}\n• Strength: ${FACTIONS.purity.strength}\n• Weakness: ${FACTIONS.purity.weakness}\n\n` +
            `🕶 *The Rift Seekers*\n•Belief ${FACTIONS.rift.belief}\n• Strength: ${FACTIONS.rift.strength}\n• Weakness: ${FACTIONS.rift.weakness}\n\n` +
            `👉 Choose by typing:\n` +
            `*${PREFIX}faction harmony*\n*${PREFIX}faction purity*\n*${PREFIX}faction rift*`,
        });
      }

      // ================= REFERRAL COMMANDS =================

      // .myref — get or create your referral code
      if (command === "myref") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const refs = loadReferrals();
        if (!refs[senderId]) {
          refs[senderId] = {
            ownerJid: senderId,
            code: generateRefCode(senderId),
            totalUses: 0,
            usedBy: [],
            pendingRewards: [],
          };
          saveReferrals(refs);
        }
        const r = refs[senderId];
        const tier = getRefTier(r.totalUses);
        const pending = (r.pendingRewards || []).filter(x => !x.claimed).length;
        return sock.sendMessage(chatId, {
          text:
            `🔗 *YOUR REFERRAL CODE*\n\n` +
            `Code: *${r.code}*\n` +
            `👥 Total uses: *${r.totalUses}*\n` +
            `🎁 Unclaimed rewards: *${pending}*\n\n` +
            `📣 Share this code! When a new player types:\n` +
            `*.start ${r.code}*\n` +
            `You earn a prize!\n\n` +
            `🏆 *Current tier reward:*\n` +
            `💰 Lucons: *${tier.lucons}*\n` +
            `🐉 Mora choices: *${tier.moraRarities.join(", ")}* (pick 1, Level 5)\n\n` +
            `_Use *.claim-ref* in DM to collect._`,
        }, { quoted: msg });
      }

      // .claim-ref — claim a pending referral reward (DM only)
      if (command === "claim-ref") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const refs = loadReferrals();
        const r = refs[senderId];
        if (!r) return sock.sendMessage(chatId, { text: "❌ You have no referral code yet. Use *.myref* first." }, { quoted: msg });

        const pending = (r.pendingRewards || []).filter(x => !x.claimed);
        if (!pending.length) return sock.sendMessage(chatId, { text: "🎁 No unclaimed referral rewards right now.\nKeep sharing your code!" }, { quoted: msg });

        const reward = pending[0];
        const moraList = loadMora();
        const options = pickRefMoraOptions(moraList, reward.moraRarities);

        // Store reward state for the pick step
        if (!r.activePick) r.activePick = {};
        r.activePick = {
          rewardIndex: r.pendingRewards.indexOf(reward),
          options: options.map(m => ({ id: m.id, name: m.name, type: m.type, rarity: m.rarity })),
          lucons: reward.lucons,
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
        saveReferrals(refs);

        const optLines = options.map((m, i) =>
          `${i + 1}. *${m.name}* (${m.type} | ${m.rarity})`
        ).join("\n");

        return sock.sendMessage(senderId, {
          text:
            `🎁 *REFERRAL REWARD — CLAIM IT!*\n\n` +
            `From referral #${reward.uses} (${new Date(reward.triggeredAt).toLocaleDateString()})\n\n` +
            `Choose ONE reward:\n\n` +
            `🐉 *A) Mora* (Level 5) — pick one:\n${optLines}\n\n` +
            `💰 *B) Lucons* — *${reward.lucons} Lucons*\n\n` +
            `📦 *C) Random Item* — mystery item from the Rift\n\n` +
            `Reply with: *.pick-ref A1*, *.pick-ref A2*, *.pick-ref A3*, *.pick-ref B*, or *.pick-ref C*\n` +
            `_(Expires in 5 minutes)_`,
        }, { quoted: msg });
      }

      // .pick-ref <choice> — finalize the reward pick
      if (command === "pick-ref") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const refs = loadReferrals();
        const r = refs[senderId];
        const pick = r?.activePick;
        if (!pick || Date.now() > pick.expiresAt) {
          return sock.sendMessage(senderId, { text: "⌛ Your reward pick expired. Use *.claim-ref* again." }, { quoted: msg });
        }

        const choice = String(args[0] || "").trim().toUpperCase();
        const p = players[senderId];

        if (choice === "B") {
          p.lucons = (p.lucons || 0) + pick.lucons;
          savePlayers(players);
          r.pendingRewards[pick.rewardIndex].claimed = true;
          r.activePick = null;
          saveReferrals(refs);
          return sock.sendMessage(senderId, {
            text: `💰 *REWARD CLAIMED!*\n+${pick.lucons} Lucons added to your wallet!\n💳 New balance: *${p.lucons} Lucons*`,
          }, { quoted: msg });
        }

        if (choice === "C") {
          const itemsDb = require("./systems/items").loadItems();
          const itemKeys = Object.keys(itemsDb).filter(k => itemsDb[k].category === "consumable");
          const randomItem = itemKeys[Math.floor(Math.random() * itemKeys.length)];
          const item = itemsDb[randomItem];
          if (!p.inventory) p.inventory = {};
          p.inventory[randomItem] = (p.inventory[randomItem] || 0) + 1;
          savePlayers(players);
          r.pendingRewards[pick.rewardIndex].claimed = true;
          r.activePick = null;
          saveReferrals(refs);
          return sock.sendMessage(senderId, {
            text: `📦 *REWARD CLAIMED!*\nYou received: *${item?.name || randomItem}* (${item?.rarity || "?"})!\n${item?.desc || ""}`,
          }, { quoted: msg });
        }

        if (choice === "A1" || choice === "A2" || choice === "A3") {
          const idx = Number(choice[1]) - 1;
          const chosen = pick.options[idx];
          if (!chosen) return sock.sendMessage(senderId, { text: "❌ Invalid choice." }, { quoted: msg });
          const moraList = loadMora();
          const species = moraList.find(m => m.id === chosen.id);
          if (!species) return sock.sendMessage(senderId, { text: "❌ Mora data missing, try again." }, { quoted: msg });
          const newMora = createOwnedMoraFromSpecies(species);
          newMora.level = 5;
          xpSystem.applyLevelScaling(newMora, species);
          if (!Array.isArray(p.moraOwned)) p.moraOwned = [];
          p.moraOwned.push(newMora);
          savePlayers(players);
          r.pendingRewards[pick.rewardIndex].claimed = true;
          r.activePick = null;
          saveReferrals(refs);
          return sock.sendMessage(senderId, {
            text:
              `🐉 *REWARD CLAIMED!*\n\n` +
              `*${newMora.name}* joined your party!\n` +
              `Type: *${newMora.type}* | Rarity: *${newMora.rarity}*\n` +
              `Level: *5* | HP: *${newMora.maxHp}* | ATK: *${newMora.stats?.atk}*`,
          }, { quoted: msg });
        }

        return sock.sendMessage(senderId, { text: "❓ Invalid choice. Use A1, A2, A3, B, or C." }, { quoted: msg });
      }

      // ================= FACTION PICK =================
      if (command === "faction") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
        if (settings.features.factionsEnabled === false) return sock.sendMessage(chatId, { text: "⚠ Factions are disabled by the owner." });

        const key = String(args[0] || "").trim().toLowerCase();
        if (!FACTIONS[key]) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}faction harmony / purity / rift` });
        }

        const p = players[senderId];
        if (p.faction) return sock.sendMessage(chatId, { text: `✅ You already chose a faction: *${p.faction}*` });

        p.faction = key;
      
savePlayers(players);

// ============================
// 📩 SEND DM WITH GROUP LINK
// ============================

// 🔧 CHANGEABLE: put your real links here
const FACTION_GROUPS = {
  harmony: "https://chat.whatsapp.com/G0msNxullTKKEfHVltjlXZ",
  purity: "https://chat.whatsapp.com/EBPQYruOnigJX3jj7X3Npj?mode=gi_t",
  rift: "https://chat.whatsapp.com/IYx4DKOR40w9gze32C9wKQ"
};

try {
  await sock.sendMessage(senderId, {
    text:
      `⚔ *Faction Joined*\n\n` +
      `${FACTIONS[key].emoji} *${FACTIONS[key].name}*\n\n` +
      `🔗 Join your faction group:\n${FACTION_GROUPS[key]}\n\n` +
      `📌USE .f-lb to view leader of your faction.`
  });
} catch (err) {
  return sock.sendMessage(chatId, {
    text:
      "❌ I couldn't DM you.\n\n👉 Please message me privately first, then try again."
  });
}

// ============================
// ✅ GROUP CONFIRMATION
// ============================
return sock.sendMessage(chatId, {
  text:
    `✅ You joined *${FACTIONS[key].name}*\n` +
    `📩 Check your DM for the faction group link\n\n` +
    `⚠ You must join the group before choosing your starter`
});
      }
      // ================= CHOOSE STARTER =================
if (command === "choose") {
  if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  
  const p = players[senderId];
  if (p.starterChosen) return sock.sendMessage(chatId, { text: "✅ You already chose a starter Mora." });
  if (!moraList.length) return sock.sendMessage(chatId, { text: "❌ Mora database missing." });

  // 1. Check Faction Requirements
  if (settings.features.factionsEnabled !== false) {
    if (!p.faction) {
      return sock.sendMessage(chatId, { text: `⚔ Choose your faction first:\n${PREFIX}faction harmony / purity / rift` });
    }
    if (!p.joinedFactionGroup) {
      return sock.sendMessage(chatId, { 
        text: "⚠ You must join your faction group first.\nCheck your DM for the invite link." 
      });
    }
  }

  // 2. Define Faction Starters (IDs of Common Mora from your mora.json)
  const factionStarters = {
    "harmony": [2, 11, 14],  // Thornel (Nature), Brinlock (Aqua), Gustling (Wind)
    "purity": [1, 3, 13],    // Nylon (Aqua), Terron (Terra), Pebbrum (Terra)
    "rift": [5, 7, 15]       // Emberu (Flame), Umbrake (Shadow), Noctik (Shadow)
  };

  const allowedIds = factionStarters[p.faction] || factionStarters["harmony"];
  const starters = moraList.filter(m => allowedIds.includes(m.id));

  const rawPick = args.join(" ").trim();

  // 3. DISPLAY STARTERS (If no argument provided)
  if (!rawPick) {
    let menu = `🐾 *${p.faction.toUpperCase()}  •  S T A R T E R S*\n${DIVIDER}\n`;
    menu += `Select your first companion to begin your journey.\n\n`;
    
    starters.forEach((m, i) => {
      menu += `*${i + 1}. ${m.name}* [${m.type.toUpperCase()}]\n`;
      menu += `📜 ${m.description || "A mysterious Mora."}\n`;
      menu += `⚔ Atk: ${m.baseStats?.atk} | 🛡 Def: ${m.baseStats?.def}\n${SMALL_DIVIDER}\n`;
    });

    menu += `\n👉 Use: *.choose 1-3* or *.choose Name*`;
    
    return sock.sendMessage(chatId, { text: menu }, { quoted: msg });
  }

  // 4. PROCESS THE PICK
  const pickNum = parseInt(rawPick);
  let selectedMora;
  
  if (!isNaN(pickNum) && pickNum >= 1 && pickNum <= starters.length) {
      selectedMora = starters[pickNum - 1];
  } else {
      selectedMora = starters.find(m => m.name.toLowerCase() === rawPick.toLowerCase());
  }

  if (!selectedMora) {
    return sock.sendMessage(chatId, { text: "❌ Invalid choice. Please pick from the list above." });
  }

  // 5. GIVE STARTER
  p.starterChosen = true;
  p.moraOwned = p.moraOwned || [];
  
  // Create the instance (Level 5)
  const newMora = {
    ...selectedMora,
    level: 5,
    xp: 0,
    hp: selectedMora.baseStats.hp + 15,
    maxHp: selectedMora.baseStats.hp + 15,
    energy: selectedMora.baseStats.energy || 30,
    maxEnergy: selectedMora.baseStats.energy || 30,
    isWild: false
  };

  p.moraOwned.push(newMora);
  p.party = [0, null, null, null, null]; // Put starter in slot 1

  savePlayers(players);

  return sock.sendMessage(chatId, { 
    text: `🎉 *CONGRATULATIONS!*\n\nYou have bonded with *${newMora.name}*!\n\n` +
          `Use *.profile* to see your stats or *.hunt* to begin your first battle.`,
    mentions: [senderId]
  }, { quoted: msg });
}

      // ================= MORA =================
      if (command === "mora") {
        if (!moraList.length) return sock.sendMessage(chatId, { text: "❌ Mora database is empty. Check data/mora.json" });

        const queryRaw = args.join(" ").trim();
        const query = normalizePickToIdOrName(queryRaw);

        if (!query) {
          const lines = moraList.map((m) => `ID_${m.id} • *${m.name}* • ${m.type} • ${String(m.rarity || "—").toLowerCase()}`);
          return sock.sendMessage(chatId, {
            text: `📜 *MORA AVAILABLE* (${moraList.length})\n\n` + lines.join("\n") + `\n\nUse: *.mora 2* or *.mora Thornel*`,
          });
        }

        const mora = findMora(moraList, query) || findMora(moraList, queryRaw);
        if (!mora) return sock.sendMessage(chatId, { text: `❌ Mora not found: *${queryRaw}*` });

        // Send visual mora card
        try {
          const moraCard = await generateMoraCard({
            id: mora.id,
            name: mora.name,
            type: mora.type,
            rarity: mora.rarity,
            description: mora.description,
            stats: mora.stats,
            moves: mora.moves,
            special: mora.special,
            creator: mora.creator || "Wild Mora"
          });
          await sock.sendMessage(chatId, { image: moraCard });
        } catch (e) {
          console.log("Mora card generation failed:", e.message);
        }

        return sock.sendMessage(chatId, {
          text:
            `🐉 *MORA INFO*\n\n` +
            `🆔 ID: *${mora.id}*\n` +
            `🔰 Name: *${mora.name}*\n` +
            `⚡ Type: *${mora.type}*\n` +
            `💠 Rarity: *${mora.rarity}*\n\n` +
            `📖 *Description*\n${mora.description || "—"}\n`,
        });
      }
// --- OWNER GAUGE COMMANDS ---
if (command === "set-gauge") {
    if (!isOwner) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const amount = parseInt(args[1]);

    if (!target || isNaN(amount)) return sock.sendMessage(chatId, { text: "❓ Usage: *.set-gauge @user <amount>*" });
    if (!players[target]) return sock.sendMessage(chatId, { text: "❌ Player not found." });

    players[target].maxHuntEnergy = amount;
    players[target].huntEnergy = amount;

    // Sync to hunter state so hunt system stays consistent
    const gaugeHuntState = huntingSystem.loadHuntState();
    const gaugeHunter = huntingSystem.ensureHunter(gaugeHuntState, target);
    gaugeHunter.huntEnergyMax = amount;
    gaugeHunter.huntEnergy = amount;
    huntingSystem.saveHuntState(gaugeHuntState);

    savePlayers(players);

    return sock.sendMessage(chatId, { text: `🔋 Gauge upgraded to ${amount} for @${target.split('@')[0]}.`, mentions: [target] });
}

if (command === "reduce-gauge") {
    if (!isOwner) return;
    const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const amount = parseInt(args[1]);

    if (!target || isNaN(amount)) return sock.sendMessage(chatId, { text: "❓ Usage: *.reduce-gauge @user <amount>*" });
    if (!players[target]) return;

    players[target].maxHuntEnergy = amount;
    players[target].huntEnergy = Math.min(players[target].huntEnergy || 0, amount);

    // Sync to hunter state so hunt system stays consistent
    const reduceHuntState = huntingSystem.loadHuntState();
    const reduceHunter = huntingSystem.ensureHunter(reduceHuntState, target);
    reduceHunter.huntEnergyMax = amount;
    reduceHunter.huntEnergy = players[target].huntEnergy;
    huntingSystem.saveHuntState(reduceHuntState);

    savePlayers(players);

    return sock.sendMessage(chatId, { text: `📉 Gauge reduced to ${amount} for @${target.split('@')[0]}.`, mentions: [target] });
}

// ─────────────────────────────────────────────
// PRO SUBSCRIPTION SYSTEM (systems/pro.js)
// ─────────────────────────────────────────────
if (command === "pro-info") {
    return proSystem.cmdProInfo(ctx, chatId, senderId, msg);
}
if (command === "pro") {
    return proSystem.cmdProStatus(ctx, chatId, senderId, msg, args);
}
if (command === "pro-daily") {
    return proSystem.cmdProDaily(ctx, chatId, senderId, msg);
}
if (command === "exchange") {
    return proSystem.cmdExchange(ctx, chatId, senderId, msg, args);
}
if (command === "pro-market") {
    return proSystem.cmdProMarket(ctx, chatId, senderId, msg);
}
if (command === "pbuy") {
    return proSystem.cmdProBuy(ctx, chatId, senderId, msg, args);
}
if (command === "crystals") {
    const p = players[senderId];
    if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
    proSystem.ensureProState(p);
    if (isOwner && (args[0] === "grant" || args[0] === "give")) {
        return proSystem.cmdGrantCrystals(ctx, chatId, senderId, msg, args.slice(1));
    }
    return sock.sendMessage(chatId, {
        text:
            `━━━━━━━━━━━━━━━━━━\n` +
            `💎 *LUCRYSTAL BALANCE*\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `🔷 ${Number(p.pro?.crystals || 0)} LCR\n\n` +
            `• *.exchange <lucons>* — trade 1000 Lucons → 1 LCR\n` +
            `• *.pro-market* — browse LCR items\n` +
            `• *.pro-info* — subscription tiers`,
    }, { quoted: msg });
}
if (command === "pro-grant") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    return proSystem.cmdProGrant(ctx, chatId, senderId, msg, args, {
        getMentionedJids: (m) => m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
        getRepliedJid: (m) => m?.message?.extendedTextMessage?.contextInfo?.participant || null,
        toUserJidFromArg: (a) => a && /^\d+$/.test(String(a)) ? `${a}@s.whatsapp.net` : null,
        normJid: (x) => x,
    });
}
if (command === "pros") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    const proPlayers = Object.entries(players)
        .filter(([, p]) => p && proSystem.hasActivePro(p))
        .map(([jid, p]) => ({
            jid,
            username: p.username || jid.split("@")[0],
            tier: proSystem.getActiveTier(p)?.label || "unknown",
            expiresAt: p.pro?.expiresAt || 0
        }));

    if (!proPlayers.length) {
        return sock.sendMessage(chatId, { text: "📊 No active pro subscribers." });
    }

    const lines = [];
    lines.push(`${DIVIDER}`);
    lines.push(`💎 *ACTIVE PRO SUBSCRIBERS*`);
    lines.push(`${DIVIDER}\n`);
    for (const pp of proPlayers) {
        const expiryDate = new Date(pp.expiresAt).toLocaleDateString();
        lines.push(`👤 *${pp.username}*`);
        lines.push(`   Tier: ${pp.tier}`);
        lines.push(`   Expires: ${expiryDate}\n`);
    }
    lines.push(`${DIVIDER}`);
    lines.push(`Total: *${proPlayers.length}* subscriber${proPlayers.length === 1 ? "" : "s"}`);

    return sock.sendMessage(chatId, { text: lines.join("\n") });
}
if (command === "autocatch") {
    return proSystem.cmdAutocatch(ctx, chatId, senderId, msg, args);
}
if (command === "autocatch-log") {
    return proSystem.cmdAutocatchLog(ctx, chatId, senderId, msg);
}

// ─────────────────────────────────────────────
// LUMORA LABS — Mora Creation (systems/moraCreation.js)
// ─────────────────────────────────────────────
if (command === "create-mora" || command === "createmora" || command === "cmora") {
    return moraCreationSystem.cmdCreateMora(ctx, chatId, senderId, msg, args);
}
if (command === "cancel-create" || command === "cancelcreate") {
    return moraCreationSystem.cmdCancelCreate(ctx, chatId, senderId, msg);
}
if (command === "creations") {
    return moraCreationSystem.cmdCreationsList(ctx, chatId, senderId, msg);
}
if (command === "approve-mora" || command === "approvemora") {
    return moraCreationSystem.cmdApproveMora(ctx, chatId, senderId, msg, args);
}
if (command === "reject-mora" || command === "rejectmora") {
    return moraCreationSystem.cmdRejectMora(ctx, chatId, senderId, msg, args);
}

// ─────────────────────────────────────────────
// MORA CREATION GROUP MANAGEMENT (Owner-only)
// ─────────────────────────────────────────────
if (command === "moragroups") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    const mc = settings?.moraCreationGroups || { enabled: true, allowed: [] };
    let text = `${DIVIDER}\n🧪 *MORA CREATION LABS — SETTINGS*\n${DIVIDER}\n\n`;
    text += `Status: ${mc.enabled ? "✅ *ENABLED*" : "❌ *DISABLED*"}\n\n`;
    text += `Allowed groups (empty = all groups):\n`;
    if (mc.allowed && mc.allowed.length > 0) {
        mc.allowed.forEach(g => text += `  • ${g}\n`);
    } else {
        text += `  _(all groups allowed)_\n`;
    }
    text += `\nCommands:\n• *.addmoragroup* — add this group\n• *.removemoragroup* — remove this group\n• *.moracreation-on* — enable\n• *.moracreation-off* — disable`;
    return sock.sendMessage(chatId, { text }, { quoted: msg });
}
if (command === "addmoragroup") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." });
    const mc = settings?.moraCreationGroups || { enabled: true, allowed: [] };
    if (!Array.isArray(mc.allowed)) mc.allowed = [];
    if (mc.allowed.includes(chatId)) {
        return sock.sendMessage(chatId, { text: "ℹ️ This group is already in the list." });
    }
    mc.allowed.push(chatId);
    settings.moraCreationGroups = mc;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "✅ This group added to Mora Creation Labs." });
}
if (command === "removemoragroup") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." });
    const mc = settings?.moraCreationGroups || { enabled: true, allowed: [] };
    if (!Array.isArray(mc.allowed)) mc.allowed = [];
    const idx = mc.allowed.indexOf(chatId);
    if (idx === -1) {
        return sock.sendMessage(chatId, { text: "ℹ️ This group is not in the list." });
    }
    mc.allowed.splice(idx, 1);
    settings.moraCreationGroups = mc;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "✅ This group removed from Mora Creation Labs." });
}
if (command === "moracreation-on") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    settings.moraCreationGroups = settings.moraCreationGroups || { enabled: true, allowed: [] };
    settings.moraCreationGroups.enabled = true;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "✅ Mora Creation Labs *enabled*." });
}
if (command === "moracreation-off") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    settings.moraCreationGroups = settings.moraCreationGroups || { enabled: true, allowed: [] };
    settings.moraCreationGroups.enabled = false;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "✅ Mora Creation Labs *disabled*." });
}

// ─────────────────────────────────────────────
// GIVE ORB (Owner-only)
// ─────────────────────────────────────────────
if (command === "give-orb" || command === "giveorb") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });

    const mentioned = getMentionedJids(msg);
    const replied = getRepliedJid(msg);
    const argJid = toUserJidFromArg(args[0]);
    const targetJid = mentioned[0] || replied || argJid;

    if (!targetJid) {
        return sock.sendMessage(chatId, { text: "Usage: *.give-orb @user [amount]*\nExample: `.give-orb @player 5`" });
    }

    const amount = Number(args[1]) || 1;
    if (amount <= 0 || !Number.isFinite(amount)) {
        return sock.sendMessage(chatId, { text: "❌ Amount must be a positive number." });
    }

    const target = players[normJid(targetJid)];
    if (!target) {
        return sock.sendMessage(chatId, { text: "❌ Player not registered." });
    }

    const itemsSystem = require("./systems/items");
    itemsSystem.ensurePlayerItemData(target);
    const result = itemsSystem.addItem(target, "REOB", amount);

    if (!result.ok) {
        return sock.sendMessage(chatId, { text: `❌ ${result.reason}` });
    }

    savePlayers(players);
    const targetName = target.username || targetJid.split("@")[0];
    return sock.sendMessage(chatId, {
        text: `✅ Given *${amount} Rift Energy Orb${amount === 1 ? "" : "s"}* to *${targetName}*.`,
        mentions: [targetJid]
    }, { quoted: msg });
}

// 🕶️ SUMMON MERCHANT — now a perk of any active pro subscription
if (command === "summon-merchant") {
    const p = players[senderId];
    if (!proSystem.hasActivePro(p)) {
        return sock.sendMessage(chatId, { text: "🔮 *The Rift is silent...*\nOnly bearers of an active *Lumoran Mark* may summon the Void Merchant. See *.pro-info*." }, { quoted: msg });
    }

    const mode = args[0]?.toLowerCase();
    if (mode !== "public" && mode !== "private") {
        return sock.sendMessage(chatId, { text: "📜 Usage: `.summon-merchant public` or `.summon-merchant private`" });
    }

    // 🎲 ROTATION LOGIC: Pick 4 random items from the pool of 12
    const shuffled = BLACK_MARKET_POOL.sort(() => 0.5 - Math.random());
    const selectedItems = shuffled.slice(0, 4).map(item => ({ ...item, stock: Math.floor(Math.random() * 3) + 1 }));

    global.blackMarket = {
        active: true,
        type: mode,
        owner: senderId,
        expiry: Date.now() + (15 * 60 * 1000),
        items: selectedItems
    };

    const storyText = mode === "public"
        ? `🌌 *THE RIFT TEARS OPEN*\n\n"Ah, looking for the good stuff?"\n\n@${senderName} has summoned the Void Merchant! He rolls out his wagon for *EVERYONE* in the chat. Browse with \`.black-market\`. He leaves in 15 mins.`
        : `🕶️ *A PRIVATE PACT IS STRUCK*\n\nA dark portal opens exclusively for @${senderName}. The void merchant has arrived for a private deal. Use \`.black-market\` to browse. He leaves in 15 mins.`;

    return sock.sendMessage(chatId, { text: storyText, mentions: [senderId] });
}

// 📜 VIEW BLACK MARKET
if (command === "black-market") {
    if (!global.blackMarket.active || Date.now() > global.blackMarket.expiry) {
        global.blackMarket.active = false;
        return sock.sendMessage(chatId, { 
            text: "💨 *The vortex has closed.*\nThe void merchant grew bored and vanished back into the Primordial Rifts." 
        });
    }

    if (global.blackMarket.type === "private" && global.blackMarket.owner !== senderId) {
        return sock.sendMessage(chatId, { 
            text: "🛑 *A cold, dark hand stops you.*\n\n\"Not for your eyes, traveler. This is a private transaction.\"" 
        });
    }

    let marketText = `🕶️ *THE BLACK MARKET* 🕶️\n`;
    marketText += `_"I trade in things the Capital claims do not exist."_\n${DIVIDER}\n`;
    
    global.blackMarket.items.forEach((item, index) => {
        marketText += `**[${index + 1}] ${item.name}** — 💰 ${item.price} Lucons\n`;
        marketText += `📜 _${item.desc}_\n`;
        marketText += `📦 Stock: ${item.stock}\n${SMALL_DIVIDER}\n`;
    });

    marketText += `\n🛒 Use \`.buy-bm <item name> <quantity>\` to purchase.`;
    
    return sock.sendMessage(chatId, { text: marketText });
}

// 🛒 BUY FROM BLACK MARKET
if (command === "buy-bm") {
    if (!global.blackMarket.active || Date.now() > global.blackMarket.expiry) {
        return sock.sendMessage(chatId, { text: "💨 The merchant is no longer here." });
    }
    if (global.blackMarket.type === "private" && global.blackMarket.owner !== senderId) {
        return sock.sendMessage(chatId, { text: "🛑 This is a private shop!" });
    }

    const itemName = args[0]?.toLowerCase();
    const quantity = parseInt(args[1]) || 1;

    if (!itemName) {
        return sock.sendMessage(chatId, { text: "❓ Usage: `.buy-bm <item name> <quantity>`" });
    }

    // Find the item in the market
    const item = global.blackMarket.items.find(i => i.name.toLowerCase() === itemName);

    if (!item) {
        return sock.sendMessage(chatId, { text: "🤔 \"I don't carry such junk in my caravans. Pick something from the list.\"" });
    }

    if (item.stock < quantity) {
        return sock.sendMessage(chatId, { text: "❌ \"I don't have that many in stock. Don't be greedy.\"" });
    }

    const p = players[senderId];
    const totalCost = item.price * quantity;

    if ((p.lucons || 0) < totalCost) {
        return sock.sendMessage(chatId, { text: "💸 \"You're short on Lucons, friend. Come back when your pockets are heavier.\"" });
    }

    // Process Transaction
    p.lucons -= totalCost;
    item.stock -= quantity;
    
    // Add to inventory (assuming p.inventory is an object)
    if (!p.inventory) p.inventory = {};
    p.inventory[item.name] = (p.inventory[item.name] || 0) + quantity;

    savePlayers(players);

    return sock.sendMessage(chatId, { 
        text: `💰 *PURCHASE SUCCESSFUL*\n\n"A pleasure doing business. May it serve you well in the wild."\n\nYou bought **${quantity}x ${item.name}** for ${totalCost} Lucons.` 
    });
}
      // ================= TAMED =================
      if (command === "tamed") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });

        const owned = Array.isArray(p.moraOwned) ? p.moraOwned : [];
        if (!owned.length) return sock.sendMessage(chatId, { text: "😔 You don't own any Mora yet." });

        const queryRaw = args.join(" ").trim();
        const query = normalizePickToIdOrName(queryRaw);

        if (!query) {
          const partySet = new Set(
            Array.isArray(p.party)
              ? p.party.filter((x) => x !== null && x !== undefined)
              : []
          );

          const lines = owned.map((m, i) => {
            const lv = m.level ?? 1;
            const need = xpSystem.xpToNextLevel(lv);
            const xpNow = typeof m.xp === "number" ? m.xp : 0;
            const inParty = partySet.has(i) ? " ⚔️ [PARTY]" : "";

            return (
              `${i + 1}️⃣ *${m.name}*${inParty}\n` +
              `🆔 ID_${m.moraId} • ⚡ ${m.type || "—"} • 💠 ${m.rarity || "—"}\n` +
              `📈 Lv ${lv} • ✨ ${xpNow}/${need}\n` +
              `❤️ ${m.hp}/${m.maxHp}`
            );
          });

          return sock.sendMessage(chatId, {
            text:
              `━━━━━━━━━━━━━━━━━━\n` +
              `🐉 *YOUR TAMED MORA*\n` +
              `━━━━━━━━━━━━━━━━━━\n\n` +
              lines.join(`\n\n──────────────────\n\n`) +
              `\n\n━━━━━━━━━━━━━━━━━━\n` +
              `Tips:\n` +
              `• *.tamed 1* to inspect a Mora\n` +
              `• *.t2party 1 3 5* to move Mora into party\n` +
              `• *.party* to view current party`,
          });
        }

        let chosen = null;
        if (/^\d+$/.test(query)) {
          const num = Number(query);
          if (num >= 1 && num <= owned.length) chosen = owned[num - 1];
          else chosen = owned.find((m) => Number(m.moraId) === num) || null;
        } else {
          chosen = owned.find((m) => String(m.name || "").toLowerCase() === String(queryRaw).trim().toLowerCase()) || null;
        }

        if (!chosen) return sock.sendMessage(chatId, { text: "❌ That Mora is not in your tamed list." });

        const species = moraList.find((x) => Number(x.id) === Number(chosen.moraId)) || null;
        if (species) {
          xpSystem.applyLevelScaling(chosen, species);
          savePlayers(players);
        }

        const lv = chosen.level ?? 1;
        const need = xpSystem.xpToNextLevel(lv);
        const xpNow = typeof chosen.xp === "number" ? chosen.xp : 0;

        const atk = chosen.stats?.atk ?? "—";
        const def = chosen.stats?.def ?? "—";
        const spd = chosen.stats?.spd ?? "—";
        const energy = chosen.stats?.energy ?? "—";

        const moveNames = Array.isArray(chosen.moves) ? chosen.moves : [];
        const moveBlocks = moveNames.length
          ? moveNames
              .map((mvName) => {
                const mv = species?.moves?.[mvName] || null;
                if (!mv) return `🃏 *${mvName}*\n📝 (no data)`;
                return (
                  `🃏 *${mvName}*\n` +
                  `💥 Power: ${mv.power ?? "—"}\n` +
                  `🎯 Accuracy: ${mv.accuracy ?? "—"}\n` +
                  `🧩 Category: ${mv.category ?? "—"}\n` +
                  `📝 ${mv.desc ?? ""}`.trim()
                );
              })
              .join("\n\n")
          : "🃏 (no moves saved yet)";

        return sock.sendMessage(chatId, {
          text:
            `🗡️ *${String(chosen.name).toUpperCase()}* (ID_${chosen.moraId})\n\n` +
            `⚡ Type: *${chosen.type || species?.type || "—"}*\n` +
            `💠 Rarity: *${chosen.rarity || species?.rarity || "—"}*\n` +
            `📈 Level: *${lv}*  •  ✨ XP: *${xpNow}/${need}*\n` +
            `❤️ HP: *${chosen.hp}/${chosen.maxHp}*\n` +
            `🕷 PE: *${Math.floor(chosen.pe || 0)}*\n\n` +
            `📌 *STATS*\n` +
            `⚔️ ATK: ${atk}   🛡️ DEF: ${def}\n` +
            `💨 SPD: ${spd}   🔋 ENERGY: ${energy}\n\n` +
            `🎴 *CURRENT MOVES*\n\n` +
            moveBlocks +
            `\n\n📖 *DESCRIPTION*\n${species?.description || "—"}\n`,
        });
      }

      // ================= FACTION POINTS =================
      if (command === "facpoints" || command === "factionpoints") {
        const fp = loadFactionPoints();
        const { generateFacPointsCard } = require('./factionCanvas');
        const fpImage = await generateFacPointsCard(fp);
        return sock.sendMessage(chatId, {
          image: fpImage,
          caption: `🌌 *FACTION POINTS — Season Standing*\n_Points earned through missions, battles & submissions._`,
        }, { quoted: msg });
      }

      // ================= SUBMIT MORA =================
      if (command === "submit-mora") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        if (!p.faction) return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });

        const queryRaw = args.join(" ").trim();
        if (!queryRaw) {
          return sock.sendMessage(chatId, {
            text:
              `📤 *MORA SUBMISSION*\n\n` +
              `Submit a Mora to your faction facility.\n\n` +
              `🌿 *Harmony* — Mora lives freely at the Sanctuary. You earn Lucons + FP.\n` +
              `⚔️ *Purity* — Mora is taken for discipline/research. You earn Lucons + FP.\n` +
              `🕶️ *Rift* — Corrupted Mora sold into the Rift market. Higher reward for corrupted.\n\n` +
              `Usage: *.submit-mora <mora name or number>*`,
          }, { quoted: msg });
        }

        const owned = Array.isArray(p.moraOwned) ? p.moraOwned : [];
        if (!owned.length) return sock.sendMessage(chatId, { text: "😔 You don't own any Mora to submit." }, { quoted: msg });

        let chosen = null;
        let chosenIdx = -1;
        if (/^\d+$/.test(queryRaw)) {
          const num = Number(queryRaw);
          chosenIdx = num >= 1 && num <= owned.length ? num - 1 : -1;
        } else {
          chosenIdx = owned.findIndex(m => String(m.name||"").toLowerCase() === queryRaw.toLowerCase());
        }
        if (chosenIdx === -1) return sock.sendMessage(chatId, { text: "❌ Mora not found in your list." }, { quoted: msg });
        chosen = owned[chosenIdx];

        // Can't submit party Mora
        if (Array.isArray(p.party) && p.party.includes(chosenIdx)) {
          return sock.sendMessage(chatId, { text: "❌ Remove this Mora from your party before submitting." }, { quoted: msg });
        }

        const faction = p.faction;
        const isCorrupted = !!chosen.corrupted;

        // Calculate reward
        let luconReward = 100 + (chosen.level || 1) * 15;
        let fpReward = 5;
        const RARITY_BONUS = { Common:0, Uncommon:50, Rare:150, Epic:300, Legendary:600, Mythic:1000 };
        luconReward += RARITY_BONUS[chosen.rarity] || 0;

        if (faction === "rift" && isCorrupted) { luconReward = Math.floor(luconReward * 1.6); fpReward = 12; }
        if (faction === "harmony")              fpReward = 10;
        if (faction === "purity")               fpReward = 8;

        const speech = pickSpeech(`mora_submit_${faction}`);

        // Remove from owned
        p.moraOwned.splice(chosenIdx, 1);
        // Fix party indices pointing past removed slot
        if (Array.isArray(p.party)) {
          p.party = p.party.map(idx => {
            if (idx === null || idx === undefined) return null;
            if (idx > chosenIdx) return idx - 1;
            return idx;
          });
        }

        p.lucons = (p.lucons || 0) + luconReward;
        addFactionPoints(faction, fpReward);
        savePlayers(players);

        return sock.sendMessage(chatId, {
          text:
            `${speech}\n\n` +
            `📤 *${chosen.name}* (${chosen.rarity} • Lv ${chosen.level}) has been submitted.\n\n` +
            `💰 Reward: *+${luconReward} Lucons*\n` +
            `🏅 Faction Points: *+${fpReward}*\n` +
            `💳 Balance: *${p.lucons} Lucons*`,
        }, { quoted: msg });
      }

      // ================= PRIMORDIAL BACKLASH CHECK =================
      // Called passively when player uses .profile or .tamed — shows warning if any Mora is at critical PE
      if (command === "pe-check" || command === "pecheck") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });
        const owned = Array.isArray(p.moraOwned) ? p.moraOwned : [];
        const critical = owned.filter(m => Number(m.pe || 0) >= 100);
        if (!critical.length) return sock.sendMessage(chatId, { text: "✅ All your Mora have stable Primordial Energy." }, { quoted: msg });
        const lines = critical.map(m => `• *${m.name}* — PE: *${m.pe}* ⚠️ CRITICAL`);
        return sock.sendMessage(chatId, {
          text:
            `🌀 *PRIMORDIAL ENERGY ALERT*\n\n` +
            `${pickSpeech("pe_warning")}\n\n` +
            lines.join("\n") + "\n\n" +
            `⚠️ At critical PE, your Mora may *backlash and damage you* in battle!\n` +
            `Use *.consume* a Primordial Shard or purify items to reduce PE.`,
        }, { quoted: msg });
      }

      // ================= PROFILE =================
      if (command === "profile") {
        const mJ = getMentionedJids(msg)[0];
        const rJ = getRepliedJid(msg);
        const aJ = toUserJidFromArg(args[0]);
        const targetId = normJid(mJ || rJ || aJ || senderId);

        const p = players[targetId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ That player is not registered." });

        const username = p.username && String(p.username).trim() ? String(p.username).trim() : "NOT SET";
        const moraCount = Array.isArray(p.moraOwned) ? p.moraOwned.length : 0;
        const main = Array.isArray(p.moraOwned) ? p.moraOwned[0] : null;

        const masked = !!p.profileMasked && targetId !== senderId && !isOwner;

        const factionLine = p.faction
          ? `${FACTIONS[p.faction]?.emoji || "⚔"} ${FACTIONS[p.faction]?.name || p.faction}`
          : "None";

       // 1. Load hunting data once at the top
const huntingSystem = require("./systems/hunting");
const huntState = huntingSystem.loadHuntState();
const hunter = huntingSystem.ensureHunter(huntState, targetId);

// 2. Set up the display variables
const locationLine =
  hunter?.location && hunter.location !== "capital"
    ? titleCase(String(hunter.location))
    : "Capital";

// 3. Sync the Vitals (Priority to hunt_state, fallback to player object)
const currentEnergy = hunter.huntEnergy ?? p.huntEnergy ?? 0;
const maxEnergy    = hunter.huntEnergyMax ?? p.maxHuntEnergy ?? 100;
const currentHp    = hunter.playerHp ?? p.playerHp ?? 100;
const maxHp        = p.playerMaxHp ?? 100;

// 4. Handle Masked Profile
if (masked) {
  return sock.sendMessage(chatId, {
    text:
      `🎭 *L U M O R A  •  P R O F I L E*\n\n` +
      `👤 *${username}*\n` +
      `🆔 ID: ${normalizeNumberFromJid(targetId)}\n\n` +
      `🕶 Profile Masked: *Yes*\n` +
      `⚔ Faction: *${factionLine}*`,
  });
}
// Compute dynamic fields for profile
const playerRank = getRankForLevel(p.level || 1) || "Unranked";
const genderLine = p.gender ? `🧑 Gender: *${p.gender}*\n` : "";
const companionMora = p.companionId != null ? (p.moraOwned || []).find(m => m.moraId === p.companionId) : null;
const companionLine = companionMora
  ? `💞 Companion: *${companionMora.name}* (Bond: ${p.companionBond || 0})\n`
  : "";
const streakLine = (p.loginStreak || 0) > 1 ? `🔥 Login Streak: *${p.loginStreak} days*\n` : "";

// Re-run the achievement check so newly-earned ones show without waiting for another action
try { checkAchievements(p); } catch {}

const earnedAch = (p.achievements || [])
  .map(k => ACHIEVEMENTS[k])
  .filter(Boolean);
const achCount = earnedAch.length;
const totalAch = Object.keys(ACHIEVEMENTS).length;

// Build a short title-strip showing the three most-recent achievement titles
const showTitles = earnedAch.slice(-3).map(a => `${a.icon} *${a.title}*`).join("  •  ");
const achTitleLine = achCount
  ? `🏅 Titles: ${showTitles}${achCount > 3 ? `  (+${achCount - 3} more)` : ""}\n`
  : "";

// Calculate aura with equipped achievement bonus
let displayAura = p.aura ?? 0;
let equippedAchLine = "";
if (p.equippedAchievement && ACHIEVEMENTS[p.equippedAchievement]) {
  const ach = ACHIEVEMENTS[p.equippedAchievement];
  const auraBonus = ach.aura || 0;
  displayAura += auraBonus;
  equippedAchLine = `🎖️ Equipped: ${ach.icon} *${ach.title}* (+${auraBonus} Aura)\n`;
}

const profileCaption =
    `⚔️ *L U M O R A  •  P R O F I L E* ⚔️\n\n` +

    `👤 *${username}*\n` +
    `🏷️ Title: *${p.title || "Rookie"}*\n` +
    achTitleLine +
    `🎖️ Rank: *${playerRank}*\n` +
    genderLine +
    `🆔 ID: ${normalizeNumberFromJid(targetId)}\n\n` +

    `📊 *V I T A L S*\n` +
    `├ ❤️ Player HP: *${currentHp}/${p.playerMaxHp ?? 100}*\n` +
    `└ ⚡ Hunt Energy: *${currentEnergy}/${maxEnergy}*\n\n` +

    `🔰 *S T A T S*\n` +
    `├ 📊 Level: *${p.level ?? 1}* (${p.xp ?? 0} XP)\n` +
    `├ 💠 Resonance: *${p.resonance || 0}*\n` +
    `├ 🧠 Intelligence: *${p.intelligence ?? 0}*\n` +
    `├ ✨ Aura: *${displayAura}*${p.aura !== displayAura ? ` (base: ${p.aura ?? 0})` : ""}\n` +
    `└ 🪢 Tame Skill: *${p.tameSkill ?? 0}*\n\n` +
    (equippedAchLine ? `${equippedAchLine}\n` : "") +

    `🚩 *F A C T I O N*\n` +
    `├ ⚔ Faction: *${factionLine}*\n` +
    `├ 💠 Resonance: *${p.resonance ?? 0}*\n` +
    (p.faction === "rift" ? `├ 🔮 Rift Shards: *${p.riftShards ?? 0}*\n` : "") +
    (p.riftFury && Number(p.riftFury.battles) > 0 ? `├ 🔥 Rift Fury: *${p.riftFury.battles} battles left*\n` : "") +
    `└ 🏷 Faction Points: *${factionLine !== "None" ? "check .facpoints" : "—"}*\n\n` +

    `💰 *W E A L T H*\n` +
    `├ 💰 Lucons: *${p.lucons ?? 0}*\n` +
    `└ 💠 Lucrystals: *${Number(p.pro?.crystals || 0)} LCR*\n\n` +

    `📍 *L O C A T I O N*\n` +
    `└ 📍 Current: *${locationLine}*\n\n` +

    companionLine +
    streakLine +
    `🏆 Achievements: *${achCount}/${totalAch}*\n\n` +

    `🐉 *M O R A*\n` +
    `├ 🐾 Owned: *${moraCount}*\n` +
    `└ ⭐ Main Mora: *${main?.name || "None"}*` +
    (main ? ` (${main.type || "—"}) • Lv *${main.level ?? 1}*` : "");
        // Try to send visual profile card
        try {
          const profileData = {
            username: p.username || "Player",
            faction: p.faction || "neutral",
            level: p.level || 1,
            xp: p.xp || 0,
            intel: p.intelligence ?? 0,
            aura: p.aura ?? 0,
            totalCreations: p.totalCreations || 0,
            equippedAchievement: p.equippedAchievement ? ACHIEVEMENTS[p.equippedAchievement] : null,
            achievementAura: p.equippedAchievement && ACHIEVEMENTS[p.equippedAchievement] ? (ACHIEVEMENTS[p.equippedAchievement].aura || 0) : 0
          };
          const profileCard = await generateProfileCard(profileData);
          await sock.sendMessage(chatId, { image: profileCard }, { quoted: msg });
        } catch (e) {
          console.log("Profile card generation failed:", e.message);
        }

        if (p.profileIcon && typeof p.profileIcon === "string" && p.profileIcon.startsWith("data:")) {
          try {
            const [header, b64] = p.profileIcon.split(",");
            const mimeMatch = header.match(/data:([^;]+);/);
            const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const imgBuffer = Buffer.from(b64, "base64");
            return sock.sendMessage(chatId, { image: imgBuffer, mimetype: mime, caption: profileCaption }, { quoted: msg });
          } catch {
            // fallback to text
          }
        }

        return sock.sendMessage(chatId, { text: profileCaption }, { quoted: msg });
      }

      // ============================
      // NPC ARENA BATTLE INTERCEPT (before wild/PvP)
      // ============================
      if (arenaSystem.hasActiveArenaBattle(chatId, senderId)) {
        if (command === "attack") {
          const handled = await arenaSystem.cmdNpcAttack(ctx, chatId, senderId, msg, args);
          if (handled !== false) return;
        }
        if (command === "switch") {
          const handled = await arenaSystem.cmdNpcSwitch(ctx, chatId, senderId, msg, args);
          if (handled !== false) return;
        }
        if (command === "arena-flee") return arenaSystem.cmdArenaFlee(ctx, chatId, senderId, msg);
      }

      // ============================
      // NPC ARENA COMMANDS
      // ============================
      if (command === "arena") {
        if (!isArenaAllowedInChat(chatId, settings)) return denyArenaGroup(sock, chatId, msg);
        return arenaSystem.cmdArena(ctx, chatId, senderId, msg);
      }
      if (command === "npc") {
        if (!isArenaAllowedInChat(chatId, settings)) return denyArenaGroup(sock, chatId, msg);
        return arenaSystem.cmdNpcChallenge(ctx, chatId, senderId, msg, args);
      }
      if (command === "challenge") {
        if (!isArenaAllowedInChat(chatId, settings)) return denyArenaGroup(sock, chatId, msg);
        return arenaSystem.cmdChallenge(ctx, chatId, senderId, msg, args);
      }
      if (command === "intel") {
        if (!isArenaAllowedInChat(chatId, settings)) return denyArenaGroup(sock, chatId, msg);
        return arenaSystem.cmdIntel(ctx, chatId, senderId, msg, args);
      }
      if (command === "arena-flee") return arenaSystem.cmdArenaFlee(ctx, chatId, senderId, msg);

      // ============================
      // WILD BATTLE ROUTING FIRST
      // ============================
      if (wildBattleSystem.getWildBattle(chatId, senderId)) {
        if (!isHuntAllowedInChat(chatId, settings)) {
          return denyHuntGroup(sock, chatId, msg);
        }
if (command === "reset-stats") {
  if (!isOwner) return;

  const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0];
  if (!target || !players[target]) {
    return sock.sendMessage(chatId, { text: "❌ Please tag the user you wish to reset." });
  }

  // Force reset all activity locks
  players[target].inBattle = false;
  players[target].activeHunt = false;
  players[target].isStuck = false; // If you have a stuck flag
  
  // Refill energy for launch support
  const resetMaxE = players[target].maxHuntEnergy || 100;
  players[target].huntEnergy = resetMaxE;
  players[target].maxHuntEnergy = resetMaxE;

  // Sync to hunter state
  const resetHuntState = huntingSystem.loadHuntState();
  const resetHunter = huntingSystem.ensureHunter(resetHuntState, target);
  resetHunter.huntEnergy = resetMaxE;
  resetHunter.huntEnergyMax = resetMaxE;
  huntingSystem.saveHuntState(resetHuntState);

  savePlayers(players);

  return sock.sendMessage(chatId, { 
    text: `⚙️ *SYSTEM OVERRIDE*\n\nAll activity locks for @${target.split('@')[0]} have been purged. Energy restored to maximum.`,
    mentions: [target]
  });
}
        if (command === "charge" || command === "e-charge" || command === "energy") {
          return wildBattleSystem.cmdWildCharge(ctx, chatId, senderId, msg);
        }

        if (command === "attack")  return wildBattleSystem.cmdWildAttack(ctx, chatId, senderId, msg, args);
        if (command === "switch")  return wildBattleSystem.cmdWildSwitch(ctx, chatId, senderId, msg, args);
        if (command === "run")     return wildBattleSystem.cmdWildRun(ctx, chatId, senderId, msg);
        if (command === "purify")  return wildBattleSystem.cmdWildPurify(ctx, chatId, senderId, msg, args);

        // ── Faction post-battle decisions ─────────────────────
        if (command === "release")   return wildBattleSystem.cmdWildRelease(ctx, chatId, senderId, msg);
        if (command === "tame")      return wildBattleSystem.cmdWildTame(ctx, chatId, senderId, msg);
        if (command === "sanctuary") return wildBattleSystem.cmdWildSanctuary(ctx, chatId, senderId, msg);
        if (command === "execute")   return wildBattleSystem.cmdWildExecute(ctx, chatId, senderId, msg);
        if (command === "conscript") return wildBattleSystem.cmdWildConscript(ctx, chatId, senderId, msg);
        if (command === "fortify")   return wildBattleSystem.cmdWildFortify(ctx, chatId, senderId, msg);
        if (command === "devour")    return wildBattleSystem.cmdWildDevour(ctx, chatId, senderId, msg);
        if (command === "bind")      return wildBattleSystem.cmdWildBind(ctx, chatId, senderId, msg);
        if (command === "harvest")   return wildBattleSystem.cmdWildHarvest(ctx, chatId, senderId, msg);
      }

      // ============================
      // PVP BATTLE SYSTEM
      // ============================
      if (command === "battle")  return battleSystem.cmdBattle(ctx, chatId, senderId, msg, args);
      if (command === "accept")  return battleSystem.cmdAccept?.(ctx, chatId, senderId, msg);
      if (command === "reject" || command === "refuse") return battleSystem.cmdReject?.(ctx, chatId, senderId, msg);
      if (command === "attack")  return battleSystem.cmdAttack?.(ctx, chatId, senderId, args, msg);
      if (command === "switch")  return battleSystem.cmdSwitch?.(ctx, chatId, senderId, args, msg);
      if (command === "forfeit") return battleSystem.cmdForfeit(ctx, chatId, senderId, msg);
      if (command === "use")     return battleSystem.cmdUse?.(ctx, chatId, senderId, msg, args);

      // ============================
      // HUNTING COMMANDS
      // ============================
      if (
  command === "map" ||
  command === "travel" ||
  command === "proceed" ||
  command === "dismiss" ||
  command === "return" ||
  command === "hunt" ||
  command === "pick" ||
  command === "pass" ||
  command === "track"
) {
  if (!isHuntAllowedInChat(chatId, settings)) {
    return denyHuntGroup(sock, chatId, msg);
  }

  // 🛑 GLOBAL LOCK: Stop hunting while in a battle
  const p = players[senderId];
  if (p?.inBattle) {
    return sock.sendMessage(chatId, { text: "❌ You cannot hunt while your soul is bound to a battle! Finish your duel first." });
  }

  if (command === "map")     return huntingSystem.cmdMap(ctx, chatId, senderId, msg);
  if (command === "travel")  return huntingSystem.cmdTravel(ctx, chatId, senderId, msg, args);
  if (command === "proceed") return huntingSystem.cmdProceed(ctx, chatId, senderId, msg);
  if (command === "dismiss") return huntingSystem.cmdDismiss(ctx, chatId, senderId, msg);
  if (command === "return")  return huntingSystem.cmdReturn(ctx, chatId, senderId, msg);
  if (command === "hunt")    return huntingSystem.cmdHunt(ctx, chatId, senderId, msg);
  if (command === "pick")    return huntingSystem.cmdPick(ctx, chatId, senderId, msg);
  if (command === "pass")    return huntingSystem.cmdPass(ctx, chatId, senderId, msg);
  if (command === "track")   return huntingSystem.cmdTrack(ctx, chatId, senderId, msg);
}

      // ENERGY CHARGE — PvP battle turn action
      if (command === "e-charge" || command === "charge" || command === "energy") {
        return battleSystem.cmdCharge(ctx, chatId, senderId, msg);
      }
      if (command === "journal")      return huntingSystem.cmdJournal(ctx, chatId, senderId, msg);
if (command === "bounty")       return huntingSystem.cmdBounty(ctx, chatId, senderId, msg);
if (command === "assemble")     return huntingSystem.cmdAssemble(ctx, chatId, senderId, msg);
if (command === "lastterrain")  return huntingSystem.cmdLastTerrain(ctx, chatId, senderId, msg);
      if (command === "joined") {
  const p = players[senderId];
  if (!p) return;

  p.joinedFactionGroup = true;
  p.starterOptions = pickStarterOptionsByFaction(moraList, p.faction);

  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      "✅ Group join confirmed!\n\n" +
      "🐉 Now choose your starter using:\n" +
      `${PREFIX}choose 1`
  });
}

      // ============================
      // GUIDE — full walkthrough for new players
      // ============================
      if (command === "guide" || command === "help-game" || command === "tutorial") {
        return sock.sendMessage(chatId, {
          text:
            `hey hey welcome........glad you're here bro 🌌\n\n` +
            `alright so let me walk you through everything real quick........don't worry it's simple once you get the hang of it\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 1 — SET YOURSELF UP*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `first things first........type *.start* to create your profile\n\n` +
            `then give yourself a name:\n` +
            `*.username YourName*\n\n` +
            `and set your profile icon (pick a number 1-20):\n` +
            `*.icon 1*\n\n` +
            `you can also set your gender if you want:\n` +
            `*.gender male* or *.gender female*\n\n` +
            `cool........you're officially a Lumorian now 💪\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 2 — JOIN A FACTION*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `so Lumora has 3 factions........each one gives you different perks:\n\n` +
            `🌿 *Harmony* — the balanced ones........protectors........+5% catch bonus\n` +
            `⚔️ *Purity* — the warriors........disciplined........+10% PvP damage\n` +
            `🕶️ *Rift* — the chaotic ones........risky but powerful........15% chance to double aura\n\n` +
            `just join your faction's group chat and you're in........ask an admin for the links\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 3 — GET YOUR FIRST MORA*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `mora are your creatures........your fighters........your squad\n\n` +
            `once you join a faction you'll get 2 starter options........pick one with:\n` +
            `*.choose 1* or *.choose 2*\n\n` +
            `check your mora anytime with *.party*\n` +
            `want details on a specific mora? *.mora <name>*\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 4 — GO HUNTING*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `this is where it gets fun........\n\n` +
            `type *.map* to see all the terrains you can explore\n` +
            `then travel to one: *.travel forest easy*\n` +
            `now hunt for wild mora: *.hunt*\n\n` +
            `a wild mora shows up........you battle it with *.attack 1* (or 2, 3, 4 for different moves)\n` +
            `once you beat it you get 3 choices........tame it, release it, or send it to the sanctuary\n\n` +
            `when you're done exploring........type *.return* to go back\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 5 — BATTLE OTHER PLAYERS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `this is the real deal........\n\n` +
            `challenge someone: *.battle @player*\n` +
            `they accept with *.accept*\n\n` +
            `in battle you can:\n` +
            `  *.attack 1-4* — use a move\n` +
            `  *.switch 1-5* — swap your active mora\n` +
            `  *.charge* — power up for next hit\n` +
            `  *.forfeit* — if it's not going well lol\n\n` +
            `winning gives you aura and XP........and bragging rights obviously\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 6 — DAILY STUFF*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `don't forget to claim your free stuff every day:\n` +
            `*.daily* — daily Lucons (keep your streak going for bonus!)\n` +
            `*.weekly* — bigger weekly reward\n\n` +
            `spend Lucons at the *.market* on items, gear, and mutation shards\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*QUICK REFERENCE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*.profile* — see your stats and rank\n` +
            `*.party* — your mora squad\n` +
            `*.companion <mora>* — set your ride-or-die mora\n` +
            `*.mutate* — temporarily boost your companion\n` +
            `*.achievements* — check your titles\n` +
            `*.heal* — heal all your mora\n` +
            `*.lb* — leaderboard\n` +
            `*.help* — full command list\n\n` +

            `that's basically it bro........you'll figure out the rest as you play\n\n` +
            `if something's confusing just ask in the group........or type *.help* for every command\n\n` +
            `now go out there and build your legacy 🔥`,
        }, { quoted: msg });
      }

      // ============================
      // TIPS — random gameplay tip
      // ============================
      if (command === "tip" || command === "tips") {
        const tip = botPersonality.pickRandom(botPersonality.TIPS);
        return sock.sendMessage(chatId, { text: tip }, { quoted: msg });
      }

      // ============================
      // RULES SYSTEM
      // ============================
      if (command === "rules") {
        const rules = loadRules();
        if (!rules.length) {
          return sock.sendMessage(chatId, { text: "📜 No rules have been set yet." }, { quoted: msg });
        }
        const rulesList = rules.map((r, i) => `  *${i + 1}.* ${r}`).join("\n");
        return sock.sendMessage(chatId, {
          text:
            `╔═══════════════════════════╗\n` +
            `║     📜  *GROUP RULES*  📜     ║\n` +
            `╚═══════════════════════════╝\n\n` +
            rulesList + `\n\n` +
            `_Break the rules, face the consequences._`,
        }, { quoted: msg });
      }

      if (command === "add-rule") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const ruleText = args.join(" ").trim();
        if (!ruleText) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}add-rule <rule text>` }, { quoted: msg });
        const rules = loadRules();
        rules.push(ruleText);
        saveRules(rules);
        return sock.sendMessage(chatId, { text: `✅ Rule #${rules.length} added:\n_${ruleText}_` }, { quoted: msg });
      }

      if (command === "remove-rule") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const idx = parseInt(args[0]);
        const rules = loadRules();
        if (!idx || idx < 1 || idx > rules.length) {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}remove-rule <number>\nTotal rules: ${rules.length}` }, { quoted: msg });
        }
        const removed = rules.splice(idx - 1, 1)[0];
        saveRules(rules);
        return sock.sendMessage(chatId, { text: `🗑️ Rule #${idx} removed:\n_${removed}_` }, { quoted: msg });
      }

      // ============================
      // GENDER SYSTEM
      // ============================
      if (command === "gender") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const genderInput = args.join(" ").trim();
        if (!genderInput) {
          const current = players[senderId].gender || "Not set";
          return sock.sendMessage(chatId, {
            text: `🧑 Your gender: *${current}*\n\nUse: ${PREFIX}gender <male/female/other>`,
          }, { quoted: msg });
        }
        const allowed = ["male", "female", "other"];
        const g = genderInput.toLowerCase();
        if (!allowed.includes(g)) {
          return sock.sendMessage(chatId, { text: `❌ Choose: *male*, *female*, or *other*` }, { quoted: msg });
        }
        players[senderId].gender = g.charAt(0).toUpperCase() + g.slice(1);
        savePlayers(players);
        return sock.sendMessage(chatId, { text: `✅ Gender set to: *${players[senderId].gender}*` }, { quoted: msg });
      }

      // ============================
      // COMPANION SYSTEM
      // ============================
      if (command === "companion") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const p = players[senderId];
        if (!args.length) {
          if (p.companionId == null) {
            return sock.sendMessage(chatId, {
              text: `💞 *COMPANION*\n\nYou have no companion set.\nUse: ${PREFIX}companion <mora name or #>\n\nSetting a companion builds a bond over time.\nHigher bond = stronger & longer mutations!`,
            }, { quoted: msg });
          }
          const comp = (p.moraOwned || []).find(m => m.moraId === p.companionId || m.name?.toLowerCase() === String(p.companionId).toLowerCase());
          const compName = comp?.name || "Unknown";
          return sock.sendMessage(chatId, {
            text:
              `💞 *COMPANION*\n\n` +
              `🐾 Companion: *${compName}*\n` +
              `💕 Bond: *${p.companionBond || 0}*\n\n` +
              `_Bond grows when you claim .daily, win battles, and hunt._\n` +
              `Use ${PREFIX}companion <mora> to change companion.`,
          }, { quoted: msg });
        }
        const query = args.join(" ").trim().toLowerCase();
        const moraList = p.moraOwned || [];
        let target;
        if (/^\d+$/.test(query)) {
          const idx = parseInt(query) - 1;
          target = moraList[idx];
        } else {
          target = moraList.find(m => m.name?.toLowerCase() === query);
        }
        if (!target) {
          return sock.sendMessage(chatId, { text: `❌ Mora not found. Check your tamed list with ${PREFIX}tamed` }, { quoted: msg });
        }
        const oldId = p.companionId;
        p.companionId = target.moraId;
        if (oldId !== target.moraId) p.companionBond = 0;
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text: `💞 *${target.name}* is now your companion!\nYour bond starts at *0* — grow it through daily play.`,
        }, { quoted: msg });
      }

      // ============================
      // MUTATION SYSTEM
      // ============================
      if (command === "mutate") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const p = players[senderId];
        const query = args.join(" ").trim().toLowerCase();
        if (!query) {
          return sock.sendMessage(chatId, {
            text:
              `🧬 *MUTATION SYSTEM*\n\n` +
              `Mutations give temporary stat boosts lasting 1-3 battles.\n\n` +
              `*Companion Mora:* No items needed (uses bond strength)\n` +
              `*Other Mora:* Needs a *Mutation Shard* or *Primal Catalyst*\n\n` +
              `⚠️ Legendary, Uncommon & Common Mora cannot mutate.\n\n` +
              `Use: ${PREFIX}mutate <mora name or #>`,
          }, { quoted: msg });
        }
        const moraList = p.moraOwned || [];
        let target;
        if (/^\d+$/.test(query)) {
          const idx = parseInt(query) - 1;
          target = moraList[idx];
        } else {
          target = moraList.find(m => m.name?.toLowerCase() === query);
        }
        if (!target) return sock.sendMessage(chatId, { text: "❌ Mora not found in your tamed list." }, { quoted: msg });

        const rarity = String(target.rarity || "Common");
        if (rarity === "Legendary" || rarity === "Uncommon" || rarity === "Common") {
          return sock.sendMessage(chatId, { text: `❌ *${target.name}* (${rarity}) cannot mutate. Only Rare, Epic, and Mythic Mora can mutate.` }, { quoted: msg });
        }
        if (target.mutation && target.mutation.battlesLeft > 0) {
          return sock.sendMessage(chatId, {
            text: `⚠️ *${target.name}* already has an active mutation: *${target.mutation.name}* (${target.mutation.battlesLeft} battles left)`,
          }, { quoted: msg });
        }

        const isCompanion = p.companionId === target.moraId;
        let itemUsed = null;
        if (!isCompanion) {
          const itemsSystem = require("./systems/items");
          const hasShard = itemsSystem.getItemQuantity(p, "MUT_001") > 0;
          const hasCatalyst = itemsSystem.getItemQuantity(p, "MUT_002") > 0;
          if (hasCatalyst) {
            itemsSystem.removeItem(p, "MUT_002", 1);
            itemUsed = "MUT_002";
          } else if (hasShard) {
            itemsSystem.removeItem(p, "MUT_001", 1);
            itemUsed = "MUT_001";
          } else {
            return sock.sendMessage(chatId, {
              text: `❌ You need a *Mutation Shard* or *Primal Catalyst* to mutate non-companion Mora.\nBuy them from the market!`,
            }, { quoted: msg });
          }
        }

        const mutation = rollMutation(p.companionBond || 0, isCompanion, itemUsed);
        target.mutation = mutation;
        p.totalMutations = (p.totalMutations || 0) + 1;

        // Companion bond +5 on mutation
        if (isCompanion) p.companionBond = (p.companionBond || 0) + 5;

        // Check achievements
        const newAch = checkAchievements(p);
        savePlayers(players);

        let achLine = "";
        if (newAch.length) {
          achLine = "\n\n🏆 *NEW ACHIEVEMENT" + (newAch.length > 1 ? "S" : "") + ":*\n" +
            newAch.map(k => `${ACHIEVEMENTS[k].icon} *${ACHIEVEMENTS[k].title}* — ${ACHIEVEMENTS[k].desc}`).join("\n");
        }

        await sock.sendMessage(chatId, {
          text:
            `🧬 *MUTATION TRIGGERED!*\n\n` +
            `🐾 *${target.name}* mutated!\n` +
            `${mutation.icon} *${mutation.name}*: +${mutation.bonus} ${mutation.stat}\n` +
            `⏳ Lasts: *${mutation.battlesLeft}* battles\n` +
            (isCompanion ? `💞 Companion bond amplified the mutation!` : `📦 Used: *${itemUsed === "MUT_002" ? "Primal Catalyst" : "Mutation Shard"}*`) +
            achLine,
        }, { quoted: msg });

        // Send visual cards for new achievements
        for (const achKey of newAch) {
          try {
            const ach = ACHIEVEMENTS[achKey];
            const achCard = await generateAchievementUnlock(ach, p);
            await sock.sendMessage(chatId, { image: achCard });
          } catch (e) {
            console.log("Achievement card generation failed:", e.message);
          }
        }

        return;
      }

      // ============================
      // ACHIEVEMENTS
      // ============================
      if (command === "achievements" || command === "titles") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const p = players[senderId];
        checkAchievements(p);
        savePlayers(players);

        const earned = (p.achievements || []).map(k => {
          const a = ACHIEVEMENTS[k];
          return a ? `${a.icon} *${a.title}* — ${a.desc}` : null;
        }).filter(Boolean);

        const locked = Object.entries(ACHIEVEMENTS)
          .filter(([k]) => !(p.achievements || []).includes(k))
          .map(([, a]) => `🔒 _${a.title}_ — ${a.desc}`);

        return sock.sendMessage(chatId, {
          text:
            `🏆 *ACHIEVEMENTS & TITLES*\n\n` +
            (earned.length ? `✅ *Earned:*\n${earned.join("\n")}\n\n` : "") +
            (locked.length ? `🔒 *Locked:*\n${locked.join("\n")}` : "All achievements unlocked! 🎉"),
        }, { quoted: msg });
      }

      // ============================
      // EQUIP ACHIEVEMENT
      // ============================
      if (command === "equip" || command === "equip-achievement") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const p = players[senderId];
        const achievementKey = (args[0] || "").toLowerCase();

        if (!achievementKey) {
          const earned = (p.achievements || []).map(k => `${ACHIEVEMENTS[k].icon} *${k}*`).join("\n");
          return sock.sendMessage(chatId, {
            text: earned ?
              `Usage: *.equip <achievement_key>*\n\nYour achievements:\n${earned}` :
              `❌ You have no achievements to equip.`
          }, { quoted: msg });
        }

        const ach = ACHIEVEMENTS[achievementKey];
        if (!ach) {
          return sock.sendMessage(chatId, { text: `❌ Achievement not found.` }, { quoted: msg });
        }

        if (!(p.achievements || []).includes(achievementKey)) {
          return sock.sendMessage(chatId, { text: `❌ You haven't earned this achievement yet.` }, { quoted: msg });
        }

        p.equippedAchievement = achievementKey;
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text: `✨ Equipped: ${ach.icon} *${ach.title}*\n\nYou gain *+${ach.aura}* Aura!`,
          mentions: [senderId]
        }, { quoted: msg });
      }

      // ============================
      // UNEQUIP ACHIEVEMENT
      // ============================
      if (command === "unequip" || command === "unequip-achievement") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const p = players[senderId];

        if (!p.equippedAchievement) {
          return sock.sendMessage(chatId, { text: `❌ You don't have an achievement equipped.` }, { quoted: msg });
        }

        const ach = ACHIEVEMENTS[p.equippedAchievement];
        p.equippedAchievement = null;
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text: `Unequipped: ${ach.icon} *${ach.title}*`,
          mentions: [senderId]
        }, { quoted: msg });
      }

      // ============================
      // BUG REPORT SYSTEM
      // ============================
      if (command === "bug-report") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
        const desc = args.join(" ").trim();
        if (!desc) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}bug-report <describe the bug>` }, { quoted: msg });
        const bugs = loadBugs();
        const bugId = bugs.length + 1;
        bugs.push({
          id: bugId,
          reporter: senderId,
          reporterName: players[senderId]?.username || senderId.split("@")[0],
          description: desc,
          date: new Date().toISOString().slice(0, 10),
          status: "open",
        });
        saveBugs(bugs);
        return sock.sendMessage(chatId, {
          text: `🐛 *Bug Report #${bugId}* submitted!\n\n_"${desc}"_\n\nThank you for helping improve Lumora!`,
        }, { quoted: msg });
      }

      if (command === "bugs") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const bugs = loadBugs().filter(b => b.status === "open");
        if (!bugs.length) return sock.sendMessage(chatId, { text: "✅ No open bugs!" }, { quoted: msg });
        const list = bugs.map(b =>
          `*#${b.id}* — ${b.description}\n  📝 By: ${b.reporterName} | 📅 ${b.date}`
        ).join("\n\n");
        return sock.sendMessage(chatId, {
          text: `🐛 *OPEN BUG REPORTS*\n\n${list}\n\nUse: ${PREFIX}bug <id> fixed — to close a bug`,
        }, { quoted: msg });
      }

      if (command === "bug") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        const bugId = parseInt(args[0]);
        const action = String(args[1] || "").toLowerCase();
        if (!bugId || action !== "fixed") {
          return sock.sendMessage(chatId, { text: `Use: ${PREFIX}bug <id> fixed` }, { quoted: msg });
        }
        const bugs = loadBugs();
        const bug = bugs.find(b => b.id === bugId);
        if (!bug) return sock.sendMessage(chatId, { text: `❌ Bug #${bugId} not found.` }, { quoted: msg });
        if (bug.status === "fixed") return sock.sendMessage(chatId, { text: `⚠️ Bug #${bugId} is already marked as fixed.` }, { quoted: msg });
        bug.status = "fixed";
        saveBugs(bugs);
        return sock.sendMessage(chatId, {
          text: `✅ Bug #${bugId} marked as *fixed*!\n_"${bug.description}"_`,
        }, { quoted: msg });
      }

      // ============================
      // WARN SYSTEM
      // ============================
      if (command === "warn") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const target = mentioned[0] || replied;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}warn @user <reason>` }, { quoted: msg });
        const tid = normJid(target);
        const reason = args.filter(a => !a.includes("@")).join(" ").trim() || "No reason given";
        const warns = loadWarns();
        if (!Array.isArray(warns[tid])) warns[tid] = [];
        warns[tid].push({ reason, date: new Date().toISOString().slice(0, 10), by: senderId });
        saveWarns(warns);
        const count = warns[tid].length;
        return sock.sendMessage(chatId, {
          text: `⚠️ @${tid.split("@")[0]} has been warned!\n\n📝 Reason: _${reason}_\n⚠️ Total warnings: *${count}*`,
          mentions: [tid],
        }, { quoted: msg });
      }

      if (command === "warns") {
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const targetId = normJid(mentioned[0] || replied || senderId);
        const warns = loadWarns();
        const userWarns = warns[targetId] || [];
        if (!userWarns.length) {
          return sock.sendMessage(chatId, { text: `✅ @${targetId.split("@")[0]} has no warnings.`, mentions: [targetId] }, { quoted: msg });
        }
        const list = userWarns.map((w, i) => `  *${i + 1}.* ${w.reason} _(${w.date})_`).join("\n");
        return sock.sendMessage(chatId, {
          text: `⚠️ *WARNINGS* for @${targetId.split("@")[0]}\n\n${list}\n\nTotal: *${userWarns.length}*`,
          mentions: [targetId],
        }, { quoted: msg });
      }

      if (command === "unwarn") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const target = mentioned[0] || replied;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}unwarn @user` }, { quoted: msg });
        const tid = normJid(target);
        const warns = loadWarns();
        if (!warns[tid] || !warns[tid].length) {
          return sock.sendMessage(chatId, { text: `✅ @${tid.split("@")[0]} has no warnings to remove.`, mentions: [tid] }, { quoted: msg });
        }
        warns[tid].pop();
        if (!warns[tid].length) delete warns[tid];
        saveWarns(warns);
        return sock.sendMessage(chatId, {
          text: `✅ Removed latest warning from @${tid.split("@")[0]}.\nRemaining: *${(warns[tid] || []).length}*`,
          mentions: [tid],
        }, { quoted: msg });
      }

      // ============================
      // PROMOTE / DEMOTE (GROUP ADMIN)
      // ============================
      if (command === "promote") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const target = mentioned[0] || replied;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}promote @user` }, { quoted: msg });
        try {
          await sock.groupParticipantsUpdate(chatId, [target], "promote");
          return sock.sendMessage(chatId, {
            text: `👑 @${target.split("@")[0]} has been promoted to admin!`,
            mentions: [target],
          }, { quoted: msg });
        } catch (e) {
          return sock.sendMessage(chatId, { text: `❌ Failed to promote. Make sure the bot is admin.` }, { quoted: msg });
        }
      }

      if (command === "demote") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const target = mentioned[0] || replied;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}demote @user` }, { quoted: msg });
        try {
          await sock.groupParticipantsUpdate(chatId, [target], "demote");
          return sock.sendMessage(chatId, {
            text: `⬇️ @${target.split("@")[0]} has been demoted from admin.`,
            mentions: [target],
          }, { quoted: msg });
        } catch (e) {
          return sock.sendMessage(chatId, { text: `❌ Failed to demote. Make sure the bot is admin.` }, { quoted: msg });
        }
      }

      // ============================
      // KICK / REMOVE (GROUP ADMIN)
      // ============================
      if (command === "kick" || command === "remove") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const target = mentioned[0] || replied;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}kick @user or reply to a message` }, { quoted: msg });
        try {
          await sock.groupParticipantsUpdate(chatId, [target], "remove");
          return sock.sendMessage(chatId, {
            text: `👢 @${target.split("@")[0]} has been kicked from the group.`,
            mentions: [target],
          }, { quoted: msg });
        } catch (e) {
          return sock.sendMessage(chatId, { text: `❌ Failed to kick. Make sure the bot is admin.` }, { quoted: msg });
        }
      }

      // ============================
      // ANNOUNCE & TAGALL
      // ============================
      if (command === "announce") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const announcement = args.join(" ").trim();
        if (!announcement) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}announce <message>` }, { quoted: msg });
        return sock.sendMessage(chatId, {
          text:
            `╔═══════════════════════════╗\n` +
            `║   📢  *A N N O U N C E M E N T*   ║\n` +
            `╚═══════════════════════════╝\n\n` +
            `${announcement}\n\n` +
            `_— ${players[senderId]?.username || "Architect"}_`,
        }, { quoted: msg });
      }

      if (command === "tagall") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command only works in groups." }, { quoted: msg });
        try {
          const groupMeta = await sock.groupMetadata(chatId);
          const members = groupMeta.participants.map(p => p.id);
          const mentions = members.map(m => `@${m.split("@")[0]}`).join(" ");
          const note = args.join(" ").trim();
          return sock.sendMessage(chatId, {
            text: `📢 *TAG ALL*${note ? `\n\n${note}\n\n` : "\n\n"}${mentions}`,
            mentions: members,
          }, { quoted: msg });
        } catch (e) {
          return sock.sendMessage(chatId, { text: "❌ Failed to tag all. Make sure bot is in the group." }, { quoted: msg });
        }
      }

      // ============================
      // RIGHT-HAND MAN (THRONE)
      // ============================
      if (command === "throne") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);
        const target = mentioned[0] || replied || argJid;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}throne @user` }, { quoted: msg });
        const tid = normalizeNumberFromJid(target);
        const current = loadThrone();
        if (current && String(current).replace(/\D/g, "") === tid) {
          return sock.sendMessage(chatId, { text: "⚠️ Already your Right-Hand Man." }, { quoted: msg });
        }
        saveThrone(tid);
        // Also make sure they're a sudo
        const sudos = loadSudos();
        if (!sudos.includes(tid)) { sudos.push(tid); saveSudos(sudos); }
        return mentionTag(sock, chatId, target,
          `👑⚔️ {mention} has been crowned as the *Right-Hand Man*!\n\n` +
          `You now hold authority second only to the Architect.\n` +
          `Use your power wisely.`, msg);
      }

      if (command === "unthrone") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        const current = loadThrone();
        if (!current) return sock.sendMessage(chatId, { text: "⚠️ No Right-Hand Man is currently set." }, { quoted: msg });
        const throneJid = `${String(current).replace(/\D/g, "")}@s.whatsapp.net`;
        saveThrone(null);
        return mentionTag(sock, chatId, throneJid,
          `🚫 {mention} has been removed from the *Right-Hand Man* throne.\n` +
          `Their elevated privileges have been revoked.`, msg);
      }

      // ============================
      // SUDO MANAGEMENT (OWNER / RIGHT-HAND)
      // ============================
      if (command === "sudo") {
        if (!isOwner && !isRightHand) return sock.sendMessage(chatId, { text: "❌ Owner / Right-Hand only." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);
        const target = mentioned[0] || replied || argJid;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}sudo @user` }, { quoted: msg });
        const tid = normalizeNumberFromJid(target);
        const sudos = loadSudos();
        if (sudos.includes(tid)) return sock.sendMessage(chatId, { text: "⚠️ Already a sudo." }, { quoted: msg });
        sudos.push(tid);
        saveSudos(sudos);
        return mentionTag(sock, chatId, target, `👑 {mention} has been granted *Sudo* privileges!`, msg);
      }

      if (command === "unsudo") {
        if (!isOwner && !isRightHand) return sock.sendMessage(chatId, { text: "❌ Owner / Right-Hand only." }, { quoted: msg });
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);
        const target = mentioned[0] || replied || argJid;
        if (!target) return sock.sendMessage(chatId, { text: `Use: ${PREFIX}unsudo @user` }, { quoted: msg });
        const tid = normalizeNumberFromJid(target);
        // Right-hand man cannot unsudo another right-hand man
        const throne = loadThrone();
        if (!isOwner && throne && String(throne).replace(/\D/g, "") === tid) {
          return sock.sendMessage(chatId, { text: "❌ You cannot remove the Right-Hand Man. Only the Architect can unthrone." }, { quoted: msg });
        }
        let sudos = loadSudos();
        if (!sudos.includes(tid)) return sock.sendMessage(chatId, { text: "⚠️ Not a sudo." }, { quoted: msg });
        sudos = sudos.filter(s => s !== tid);
        saveSudos(sudos);
        return mentionTag(sock, chatId, target, `🚫 {mention} has been removed from *Sudo*.`, msg);
      }

      if (command === "sudolist" || command === "sudos") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." }, { quoted: msg });
        const sudos = loadSudos();
        const throne = loadThrone();
        const throneNum = throne ? String(throne).replace(/\D/g, "") : null;
        if (!sudos.length) return sock.sendMessage(chatId, { text: "📋 No sudos set." }, { quoted: msg });
        let throneSection = "";
        const regularSudos = [];
        for (const num of sudos) {
          const cleanNum = String(num).replace(/\D/g, "");
          const jid = `${cleanNum}@s.whatsapp.net`;
          const name = players[jid]?.username || cleanNum;
          if (throneNum && cleanNum === throneNum) {
            throneSection = `⚔️👑 *RIGHT-HAND MAN*\n  ${name} (${cleanNum})\n\n`;
          } else {
            regularSudos.push(`  *${regularSudos.length + 1}.* ${name} (${cleanNum})`);
          }
        }
        const sudoSection = regularSudos.length ? `🛡️ *SUDOS*\n${regularSudos.join("\n")}` : "";
        return sock.sendMessage(chatId, {
          text: `👑 *HIERARCHY*\n\n${throneSection}${sudoSection}`,
        }, { quoted: msg });
      }

      // ============================
      // MISCELLANEOUS / FUN
      // ============================
      if (command === "q" || command === "quote") return miscSystem.cmdQuote(ctx, chatId, senderId, msg);
      if (command === "sticker" || command === "s") return miscSystem.cmdSticker(ctx, chatId, senderId, msg);
      if (command === "toimg") return miscSystem.cmdToImage(ctx, chatId, senderId, msg);
      if (command === "8ball") return miscSystem.cmd8Ball(ctx, chatId, senderId, msg, args);
      if (command === "flip" || command === "coinflip") return miscSystem.cmdFlip(ctx, chatId, senderId, msg);
      if (command === "roll" || command === "dice") return miscSystem.cmdRoll(ctx, chatId, senderId, msg, args);
      if (command === "ship") return miscSystem.cmdShip(ctx, chatId, senderId, msg, args);
      if (command === "rate") return miscSystem.cmdRate(ctx, chatId, senderId, msg, args);
      if (command === "roast") return miscSystem.cmdRoast(ctx, chatId, senderId, msg);
      if (command === "truth") return miscSystem.cmdTruthOrDare(ctx, chatId, senderId, msg, "truth");
      if (command === "dare") return miscSystem.cmdTruthOrDare(ctx, chatId, senderId, msg, "dare");

      // ============================
      // OWNER COMMANDS
      // ============================
      if (command === "players") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." });

        const total = Object.keys(players).length;
        const counts = { harmony: 0, purity: 0, rift: 0, none: 0 };

        for (const jid of Object.keys(players)) {
          const f = players[jid]?.faction;
          if (counts[f] !== undefined) counts[f]++;
          else counts.none++;
        }

        return sock.sendMessage(chatId, {
          text:
            `👥 *PLAYERS*\n\n` +
            `Total: *${total}*\n\n` +
            `🌿 Harmony: ${counts.harmony}\n` +
            `⚔ Purity: ${counts.purity}\n` +
            `🕶 Rift: ${counts.rift}\n` +
            `❔ No faction: ${counts.none}`,
        });
      }

      if (command === "owner-hunt") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });

        return sock.sendMessage(chatId, {
          text:
            `🎯 *HUNT GROUP OWNER MENU*\n\n` +
            `${PREFIX}huntgroups\n` +
            `${PREFIX}addhuntgroup\n` +
            `${PREFIX}removehuntgroup\n` +
            `${PREFIX}huntgroup-on\n` +
            `${PREFIX}huntgroup-off`,
        }, { quoted: msg });
      }

      if (command === "huntgroups") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });

        const hg = settings.huntingGroups || { enabled: true, allowed: [] };
        const allowed = Array.isArray(hg.allowed) ? hg.allowed : [];

        return sock.sendMessage(chatId, {
          text:
            `🎯 *HUNT GROUPS*\n\n` +
            `Enabled: *${hg.enabled === false ? "No" : "Yes"}*\n\n` +
            (allowed.length
              ? allowed.map((g, i) => `${i + 1}. ${g}`).join("\n")
              : "No hunting groups added yet."),
        }, { quoted: msg });
      }

      if (command === "addhuntgroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.huntingGroups || typeof settings.huntingGroups !== "object") {
          settings.huntingGroups = { enabled: true, allowed: [] };
        }
        if (!Array.isArray(settings.huntingGroups.allowed)) settings.huntingGroups.allowed = [];

        if (!settings.huntingGroups.allowed.includes(chatId)) {
          settings.huntingGroups.allowed.push(chatId);
          saveJSON(SETTINGS_FILE, settings);
        }

        return sock.sendMessage(chatId, { text: `✅ This group has been added to hunting grounds access.` }, { quoted: msg });
      }

      if (command === "removehuntgroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.huntingGroups || typeof settings.huntingGroups !== "object") {
          settings.huntingGroups = { enabled: true, allowed: [] };
        }
        if (!Array.isArray(settings.huntingGroups.allowed)) settings.huntingGroups.allowed = [];

        settings.huntingGroups.allowed = settings.huntingGroups.allowed.filter((g) => g !== chatId);
        saveJSON(SETTINGS_FILE, settings);

        return sock.sendMessage(chatId, { text: `✅ This group has been removed from hunting grounds access.` }, { quoted: msg });
      }

      if (command === "huntgroup-on") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.huntingGroups || typeof settings.huntingGroups !== "object") settings.huntingGroups = { enabled: true, allowed: [] };
        settings.huntingGroups.enabled = true;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Hunting grounds have been enabled.` }, { quoted: msg });
      }

      if (command === "huntgroup-off") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.huntingGroups || typeof settings.huntingGroups !== "object") settings.huntingGroups = { enabled: true, allowed: [] };
        settings.huntingGroups.enabled = false;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Hunting grounds have been disabled.` }, { quoted: msg });
      }

      // ============================
      // OWNER MARKET COMMANDS
      // ============================
      if (command === "owner-market") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });

        return sock.sendMessage(chatId, {
          text:
            `🏪 *MARKET OWNER MENU*\n\n` +
            `📍 *Group Control*\n` +
            `${PREFIX}marketgroups\n` +
            `${PREFIX}addmarketgroup\n` +
            `${PREFIX}removemarketgroup\n` +
            `${PREFIX}marketgroup-on\n` +
            `${PREFIX}marketgroup-off\n\n` +
            `🧪 *Testing & Rotation*\n` +
            `${PREFIX}market-items\n` +
            `${PREFIX}market-refresh\n` +
            `${PREFIX}market-add <item> <price> <stock>\n` +
            `${PREFIX}market-remove <item>\n` +
            `${PREFIX}market-set <item> <price> <stock>`,
        }, { quoted: msg });
      }
      // --- COMMAND: GLOBAL LEADERBOARD ---
if (command === "lb") {
    const text = lb.getGlobalLeaderboard(players);

    // Send visual leaderboard card
    try {
      const topPlayers = Object.values(players)
        .filter(p => p.username && p.level)
        .sort((a, b) => (b.level || 0) - (a.level || 0))
        .slice(0, 10)
        .map((p, i) => ({
          rank: i + 1,
          username: p.username,
          level: p.level || 1,
          faction: p.faction || "neutral",
          xp: p.xp || 0,
          aura: p.aura || 0,
          totalCreations: p.totalCreations || 0
        }));

      if (topPlayers.length > 0) {
        const lbCard = await generateLeaderboard(topPlayers, "level");
        await sock.sendMessage(chatId, { image: lbCard });
      }
    } catch (e) {
      console.log("Leaderboard card generation failed:", e.message);
    }

    await sock.sendMessage(chatId, { text });
}

// --- COMMAND: FACTION LEADERBOARD ---
if (command === "f-lb") {
    const user = players[senderId];
    if (!user || !user.faction) return sock.sendMessage(chatId, { text: "❌ You must join a faction first!" });

    const text = lb.getFactionLeaderboard(players, user.faction);
    await sock.sendMessage(chatId, { text });
}

      if (command === "marketgroups") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });

        const mg = settings.marketGroups || { enabled: true, allowed: [] };
        const allowed = Array.isArray(mg.allowed) ? mg.allowed : [];

        return sock.sendMessage(chatId, {
          text:
            `🏪 *MARKET GROUPS*\n\n` +
            `Enabled: *${mg.enabled === false ? "No" : "Yes"}*\n\n` +
            (allowed.length
              ? allowed.map((g, i) => `${i + 1}. ${g}`).join("\n")
              : "No market groups added yet."),
        }, { quoted: msg });
      }

      if (command === "addmarketgroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.marketGroups || typeof settings.marketGroups !== "object") settings.marketGroups = { enabled: true, allowed: [] };
        if (!Array.isArray(settings.marketGroups.allowed)) settings.marketGroups.allowed = [];

        if (!settings.marketGroups.allowed.includes(chatId)) {
          settings.marketGroups.allowed.push(chatId);
          saveJSON(SETTINGS_FILE, settings);
        }

        return sock.sendMessage(chatId, { text: `✅ This group has been added to market access.` }, { quoted: msg });
      }

      if (command === "removemarketgroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.marketGroups || typeof settings.marketGroups !== "object") settings.marketGroups = { enabled: true, allowed: [] };
        if (!Array.isArray(settings.marketGroups.allowed)) settings.marketGroups.allowed = [];

        settings.marketGroups.allowed = settings.marketGroups.allowed.filter((g) => g !== chatId);
        saveJSON(SETTINGS_FILE, settings);

        return sock.sendMessage(chatId, { text: `✅ This group has been removed from market access.` }, { quoted: msg });
      }

      if (command === "marketgroup-on") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.marketGroups || typeof settings.marketGroups !== "object") settings.marketGroups = { enabled: true, allowed: [] };
        settings.marketGroups.enabled = true;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Market access has been enabled.` }, { quoted: msg });
      }

      if (command === "marketgroup-off") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.marketGroups || typeof settings.marketGroups !== "object") settings.marketGroups = { enabled: true, allowed: [] };
        settings.marketGroups.enabled = false;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Market access has been disabled.` }, { quoted: msg });
      }

      // ============================
      // OWNER ARENA COMMANDS
      // ============================
      if (command === "owner-arena" || command === "arena-status") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaStatus(ctx, chatId, senderId, msg);
      }

      if (command === "arena-toggle") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaToggle(ctx, chatId, senderId, msg);
      }

      if (command === "arena-setlimit") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaSetLimit(ctx, chatId, senderId, msg, args);
      }

      if (command === "arena-setaura") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaSetAura(ctx, chatId, senderId, msg, args);
      }

      if (command === "arena-crossbonus") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaSetCrossBonus(ctx, chatId, senderId, msg, args);
      }

      if (command === "arena-resetcounts") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaResetCounts(ctx, chatId, senderId, msg);
      }

      if (command === "arena-clearall") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaClearAll(ctx, chatId, senderId, msg);
      }

      if (command === "arena-clearplayer") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return arenaSystem.cmdArenaClearPlayer(ctx, chatId, senderId, msg, args, { getMentionedJids, toUserJidFromArg });
      }

      if (command === "arenagroups") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        const ag = settings.arenaGroups || { enabled: false, allowed: [] };
        const allowed = Array.isArray(ag.allowed) ? ag.allowed : [];
        return sock.sendMessage(chatId, {
          text:
            `🏟️ *ARENA GROUPS*\n\n` +
            `Enabled: *${ag.enabled ? "Yes" : "No"}*\n\n` +
            (allowed.length
              ? allowed.map((g, i) => `${i + 1}. ${g}`).join("\n")
              : "No arena groups added yet."),
        }, { quoted: msg });
      }

      if (command === "addarenagroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.arenaGroups || typeof settings.arenaGroups !== "object") settings.arenaGroups = { enabled: true, allowed: [] };
        if (!Array.isArray(settings.arenaGroups.allowed)) settings.arenaGroups.allowed = [];

        if (!settings.arenaGroups.allowed.includes(chatId)) {
          settings.arenaGroups.allowed.push(chatId);
        }
        // Auto-enable when adding first group
        settings.arenaGroups.enabled = true;
        saveJSON(SETTINGS_FILE, settings);

        return sock.sendMessage(chatId, { text: `✅ This group has been added to arena access. The Arena is now *OPEN*.` }, { quoted: msg });
      }

      if (command === "removearenagroup") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!isGroupJid(chatId)) return sock.sendMessage(chatId, { text: "❌ This command must be used inside a group." }, { quoted: msg });

        if (!settings.arenaGroups || typeof settings.arenaGroups !== "object") settings.arenaGroups = { enabled: false, allowed: [] };
        if (!Array.isArray(settings.arenaGroups.allowed)) settings.arenaGroups.allowed = [];

        settings.arenaGroups.allowed = settings.arenaGroups.allowed.filter((g) => g !== chatId);
        saveJSON(SETTINGS_FILE, settings);

        return sock.sendMessage(chatId, { text: `✅ This group has been removed from arena access.` }, { quoted: msg });
      }

      if (command === "arenagroup-on") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.arenaGroups || typeof settings.arenaGroups !== "object") settings.arenaGroups = { enabled: false, allowed: [] };
        settings.arenaGroups.enabled = true;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Arena access has been enabled.` }, { quoted: msg });
      }

      if (command === "arenagroup-off") {
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        if (!settings.arenaGroups || typeof settings.arenaGroups !== "object") settings.arenaGroups = { enabled: false, allowed: [] };
        settings.arenaGroups.enabled = false;
        saveJSON(SETTINGS_FILE, settings);
        return sock.sendMessage(chatId, { text: `✅ Arena access has been disabled. Arena commands hidden from help.` }, { quoted: msg });
      }

      if (command === "ban" || command === "unban" || command === "autounban") {
        if (!isPrivileged) return sock.sendMessage(chatId, { text: "❌ Owner/Sudo-only command." });

        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const argJid = toUserJidFromArg(args[0]);

        const target = mentioned[0] || replied || argJid;
        if (!target) {
          return sock.sendMessage(chatId, {
            text:
              `Use:\n` +
              `• ${PREFIX}ban @user <minutes?> <reason?>\n` +
              `• ${PREFIX}autounban @user <minutes>\n` +
              `• ${PREFIX}unban @user`,
          });
        }

        const targetId = normJid(target);
        const bansNow = loadBans();

        if (command === "unban") {
          delete bansNow[targetId];
          saveBans(bansNow);
          return mentionTag(sock, chatId, targetId, `✅ Unbanned: {mention}`, msg);
        }

        if (command === "autounban") {
          const minutes = parseMinutes(args[1] || args[0]);
          if (!minutes) {
            return sock.sendMessage(chatId, { text: `Use: ${PREFIX}autounban @user <minutes>` });
          }

          const current = bansNow[targetId];
          if (!current) {
            return sock.sendMessage(chatId, { text: "⚠ That user is not banned yet. Use .ban first." });
          }

          const until = Date.now() + minutes * 60 * 1000;
          if (typeof current === "object") current.until = until;
          else bansNow[targetId] = { by: senderId, at: Date.now(), reason: "Reason not mentioned", until };

          saveBans(bansNow);

          return mentionTag(
            sock, chatId, targetId,
            `⏳ Auto-unban set for {mention}\n🕒 Duration: ${minutes} minute(s)`,
            msg
          );
        }

        let minutes = null;
        let reasonText = "Reason not mentioned";
        const afterBan = text.slice((PREFIX + "ban").length).trim();

        if (args[1] && /^\d+$/.test(args[1])) minutes = parseMinutes(args[1]);
        else if (args[0] && /^\d+$/.test(args[0]) && !argJid) {
          minutes = parseMinutes(args[0]);
        }

        if (mentioned.length > 0) {
          let cleaned = afterBan.replace(/@\d+/g, "").trim();
          if (minutes) cleaned = cleaned.replace(new RegExp(`^${minutes}\\b`), "").trim();
          reasonText = cleaned || "Reason not mentioned";
        } else if (replied) {
          let cleaned = afterBan.trim();
          if (minutes) cleaned = cleaned.replace(new RegExp(`^${minutes}\\b`), "").trim();
          reasonText = cleaned || "Reason not mentioned";
        } else {
          reasonText = minutes ? args.slice(2).join(" ").trim() : args.slice(1).join(" ").trim();
          reasonText = reasonText || "Reason not mentioned";
        }

        const until = minutes ? Date.now() + minutes * 60 * 1000 : null;

        bansNow[targetId] = {
          by: senderId,
          at: Date.now(),
          reason: reasonText,
          ...(until ? { until } : {}),
        };

        saveBans(bansNow);

        return mentionTag(
          sock, chatId, targetId,
          `⛔ Banned: {mention}\n📝 Reason: ${reasonText}` + (minutes ? `\n⏳ Auto-unban: ${minutes} min` : ""),
          msg
        );
      }

      // HELP
if (command === "help") {
    const p = players[senderId];
    const hasPro = proSystem.hasActivePro(p);
    const pFaction = p?.faction ? p.faction.charAt(0).toUpperCase() + p.faction.slice(1) : "None";
    const fIcon = p?.faction === "harmony" ? "🌿" : p?.faction === "purity" ? "⚔" : p?.faction === "rift" ? "🔶" : "⚡";

    const greeting = hasPro
        ? `👑 *Welcome back, Bearer of the Mark.* The Rifts recognize your rank.`
        : `🌌 *Greetings, traveler.* The Lumorian crystals hum at your presence.`;

    const divider = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

    // ── Always-shown Getting Started block ───────────────────
    const gettingStarted =
      `${divider}\n` +
      `  🚀  *GETTING STARTED*\n` +
      `${divider}\n` +
      `┃ ${PREFIX}lumora ─ enter the world\n` +
      `┃ ${PREFIX}start ─ begin your journey\n` +
      `┃ ${PREFIX}choose ─ pick your starter Mora\n` +
      `┃ ${PREFIX}profile ─ view stats & rank\n` +
      `┃ ${PREFIX}set-username ─ set display name\n` +
      `┃ ${PREFIX}set-icon ─ set profile icon\n` +
      `┃ ${PREFIX}gender <m/f/other> ─ set gender\n` +
      `┃ ${PREFIX}mora ─ browse all Mora data\n` +
      `┃ ${PREFIX}tamed ─ your captured Mora\n`;

    // ── Section content map ─────────────────────────────────
    const SECTIONS = {
      companion:
        `${divider}\n  💞  *COMPANION & MUTATION*\n${divider}\n` +
        `┃ ${PREFIX}companion <mora> ─ set companion\n` +
        `┃ ${PREFIX}companion ─ view companion & bond\n` +
        `┃ ${PREFIX}mutate <mora> ─ trigger mutation\n` +
        `┃ ${PREFIX}achievements ─ view titles & achievements\n\n` +
        `${divider}\n  🧪  *LUMORA LABS (Int 15+)*\n${divider}\n` +
        `┃ ${PREFIX}create-mora ─ forge a new Mora (costs 1 Creation Powder)\n` +
        `┃ _Submit a name, type, 4 starter moves + 1 special._\n` +
        `┃ _Architect must approve before it enters the registry._\n`,

      gear:
        `${divider}\n  🎒  *INVENTORY & GEAR*\n${divider}\n` +
        `┃ ${PREFIX}inventory ─ your items\n` +
        `┃ ${PREFIX}item <name> ─ item details\n` +
        `┃ ${PREFIX}consume <name> ─ use consumable\n` +
        `┃ ${PREFIX}gear ─ equipped loadout\n` +
        `┃ ${PREFIX}equip <item> ─ equip from bag\n` +
        `┃ ${PREFIX}unequip <slot> ─ remove gear\n` +
        `┃ ${PREFIX}eradicate <item|slot> ─ destroy gear\n`,

      economy:
        `${divider}\n  💰  *ECONOMY & TRADING*\n${divider}\n` +
        `┃ ${PREFIX}daily ─ daily Lucons + streak bonus\n` +
        `┃ ${PREFIX}weekly ─ weekly Lucons (faction taxed)\n` +
        `┃ ${PREFIX}give ─ send Lucons\n` +
        `┃ ${PREFIX}reverse <code> ─ undo a transaction\n` +
        `┃ ${PREFIX}tamed-give ─ trade Mora\n` +
        `┃ ${PREFIX}gitem <item> <qty> @user ─ give items\n`,

      referrals:
        `${divider}\n  🔗  *REFERRALS*\n${divider}\n` +
        `┃ ${PREFIX}myref ─ share your code\n` +
        `┃ ${PREFIX}start <code> ─ join via referral\n` +
        `┃ ${PREFIX}claim-ref ─ claim reward (DM)\n` +
        `┃ ${PREFIX}pick-ref <choice> ─ pick reward (DM)\n`,

      market:
        `${divider}\n  🏪  *MARKET*\n${divider}\n` +
        `┃ ${PREFIX}market ─ browse the shop\n` +
        `┃ ${PREFIX}buy <item> ─ purchase\n` +
        `┃ ${PREFIX}subscribe-market ─ notifications ON\n` +
        `┃ ${PREFIX}unsubscribe-market ─ notifications OFF\n\n` +
        `${divider}\n  🕶  *BLACK MARKET (Pro perk)*\n${divider}\n` +
        `┃ ${PREFIX}summon-merchant ─ call the void shop (pro)\n` +
        `┃ ${PREFIX}black-market ─ browse forbidden items\n` +
        `┃ ${PREFIX}buy-bm <item> <qty> ─ buy from void\n`,

      factions:
        `${divider}\n  🛡  *FACTIONS & WARS*\n${divider}\n` +
        `┃ ${PREFIX}factioninfo <name> ─ perks & drawbacks\n` +
        `┃ ${PREFIX}faction market ─ exclusive faction shop\n` +
        `┃ ${PREFIX}fbuy <item> ─ buy faction gear\n` +
        `┃ ${PREFIX}missions ─ weekly faction missions\n` +
        `┃ ${PREFIX}complete <ID> ─ claim mission reward\n` +
        `┃ ${PREFIX}facpoints ─ faction point standings\n` +
        `┃ ${PREFIX}submit-mora <mora> ─ submit to facility\n` +
        `┃ ${PREFIX}pe-check ─ Primordial Energy levels\n` +
        `┃ ${PREFIX}facprogress ─ season graph (200L)\n` +
        `┃ ${PREFIX}war join ─ register for war\n` +
        `┃ ${PREFIX}war bracket ─ view war bracket\n` +
        `┃ ${PREFIX}war history ─ past war results\n` +
        `┃ ${PREFIX}ready ─ ready up for match\n` +
        `┃ ${PREFIX}withdraw ─ leave war (penalties!)\n` +
        `┃ ${PREFIX}f-lb ─ resonance leaderboard\n`,

      arena:
        `${divider}\n  🏟️  *NPC ARENA*\n${divider}\n` +
        `┃ ${PREFIX}arena ─ view arena tiers & NPCs\n` +
        `┃ ${PREFIX}challenge <name> <difficulty> ─ fight an NPC\n` +
        `┃   _difficulty: weak / normal / strong / nightmare_\n` +
        `┃ ${PREFIX}intel <name> ─ NPC dossier (unlock by winning)\n` +
        `┃ ${PREFIX}arena-flee ─ abandon arena battle\n`,

      pvp:
        `${divider}\n  ⚔  *PvP BATTLE*\n${divider}\n` +
        `┃ ${PREFIX}battle @user ─ challenge\n` +
        `┃ ${PREFIX}accept / ${PREFIX}reject ─ respond\n` +
        `┃ ${PREFIX}attack 1-5 ─ use a move\n` +
        `┃ ${PREFIX}switch 1-5 ─ swap Mora\n` +
        `┃ ${PREFIX}use ─ use item in battle\n` +
        `┃ ${PREFIX}charge ─ recover energy\n` +
        `┃ ${PREFIX}forfeit ─ surrender\n`,

      hunting:
        `${divider}\n  🌲  *HUNTING & EXPLORATION*\n${divider}\n` +
        `┃ ${PREFIX}map ─ world map\n` +
        `┃ ${PREFIX}travel <terrain> <diff> ─ set out\n` +
        `┃ ${PREFIX}proceed / ${PREFIX}dismiss ─ confirm/cancel\n` +
        `┃ ${PREFIX}return ─ head back to Capital\n` +
        `┃ ${PREFIX}hunt ─ scout for Mora\n` +
        `┃ ${PREFIX}track ─ follow tracks\n` +
        `┃ ${PREFIX}pick / ${PREFIX}pass ─ loot or leave\n` +
        `┃ ${PREFIX}journal ─ hunt history & streak\n` +
        `┃ ${PREFIX}bounty ─ today's bounty target\n` +
        `┃ ${PREFIX}assemble ─ forge Rift Relic (5 frags)\n` +
        `┃ ${PREFIX}lastterrain ─ last 3 terrains\n\n` +
        `${divider}\n  🕊  *POST-BATTLE ACTIONS*\n${divider}\n` +
        `┃ _After defeating wild Mora:_\n` +
        `┃ ${PREFIX}tame ─ bond with it (+Tame Skill)\n` +
        `┃ ${PREFIX}release ─ free it (+Intelligence)\n` +
        `┃ ${PREFIX}sanctuary ─ shelter it (+Lucons +Resonance)\n` +
        `┃\n` +
        `┃ _Harmony:_ ${PREFIX}purify [scroll] ─ purify corrupted\n` +
        `┃ _Purity:_ ${PREFIX}execute · ${PREFIX}conscript · ${PREFIX}fortify\n` +
        `┃ _Rift:_ ${PREFIX}devour · ${PREFIX}bind · ${PREFIX}harvest\n`,

      fun:
        `${divider}\n  🎲  *FUN & MISC*\n${divider}\n` +
        `┃ ${PREFIX}q ─ quote reply → sticker\n` +
        `┃ ${PREFIX}sticker ─ image → sticker\n` +
        `┃ ${PREFIX}toimg ─ sticker → image\n` +
        `┃ ${PREFIX}8ball <question> ─ magic 8-ball\n` +
        `┃ ${PREFIX}flip ─ coin flip\n` +
        `┃ ${PREFIX}roll <max> ─ dice roll\n` +
        `┃ ${PREFIX}ship @user ─ love calculator\n` +
        `┃ ${PREFIX}rate <thing> ─ rate anything\n` +
        `┃ ${PREFIX}roast @user ─ roast someone\n` +
        `┃ ${PREFIX}truth / ${PREFIX}dare ─ truth or dare\n`,

      utilities:
        `${divider}\n  🔧  *UTILITY*\n${divider}\n` +
        `┃ ${PREFIX}lb ─ global leaderboard\n` +
        `┃ ${PREFIX}heal ─ heal all Mora\n` +
        `┃ ${PREFIX}catch ─ catch spawned Mora\n` +
        `┃ ${PREFIX}afk <reason> ─ set AFK\n` +
        `┃ ${PREFIX}link ─ group invite link\n` +
        `┃ ${PREFIX}rules ─ view group rules\n` +
        `┃ ${PREFIX}warns @user ─ view warnings\n` +
        `┃ ${PREFIX}bug-report <desc> ─ report a bug\n` +
        `┃ ${PREFIX}appeal ─ request review\n` +
        `┃ ${PREFIX}ping ─ test bot\n` +
        `┃ ${PREFIX}uptime ─ bot uptime\n`,

      pro:
        `${divider}\n  💎  *PRO / SUBSCRIPTIONS*\n${divider}\n` +
        `┃ ${PREFIX}pro-info ─ tier plans & USD pricing\n` +
        `┃ ${PREFIX}pro ─ your subscription status\n` +
        `┃ ${PREFIX}pro-daily ─ daily Lucons bonus\n` +
        `┃ ${PREFIX}pro --hunt-energy ─ refill hunt gauge\n` +
        `┃ ${PREFIX}pro-market ─ browse Lucrystal shop\n` +
        `┃ ${PREFIX}pbuy <item> ─ buy with Lucrystals\n` +
        `┃ ${PREFIX}exchange <lucons> ─ 1000L → 1 LCR\n` +
        `┃ ${PREFIX}autocatch <n> ─ arm offline mora catcher\n` +
        `┃ ${PREFIX}autocatch off ─ disarm\n` +
        `┃ ${PREFIX}autocatch-log ─ view mora caught while away\n` +
        `┃ _Pro users bypass faction tax on daily/weekly._\n`,

      admin:
        `${divider}\n  🛡️  *SUDO (Admin)*\n${divider}\n` +
        `┃ ${PREFIX}ban / ${PREFIX}unban / ${PREFIX}punish / ${PREFIX}forgive\n` +
        `┃ ${PREFIX}warn @user / ${PREFIX}unwarn @user\n` +
        `┃ ${PREFIX}promote / ${PREFIX}demote ─ group admin\n` +
        `┃ ${PREFIX}kick @user ─ remove from group\n` +
        `┃ ${PREFIX}announce <msg> ─ announcement\n` +
        `┃ ${PREFIX}tagall ─ tag all members\n` +
        `┃ ${PREFIX}players ─ player count\n` +
        `┃ ${PREFIX}add-rule / ${PREFIX}remove-rule\n` +
        `┃ ${PREFIX}bugs ─ view bug reports\n` +
        `┃ ${PREFIX}sudolist ─ view hierarchy\n\n` +
        `${divider}\n  ⚔️👑  *RIGHT-HAND MAN*\n${divider}\n` +
        `┃ ${PREFIX}sudo / ${PREFIX}unsudo ─ manage sudos\n` +
        `┃ _All Sudo powers + sudo management_\n\n` +
        `${divider}\n  👑  *ARCHITECT (Owner)*\n${divider}\n` +
        `┃ ${PREFIX}throne / ${PREFIX}unthrone ─ set Right-Hand\n` +
        `┃ ${PREFIX}pro-grant @user <tier> ─ subscribe a player\n` +
        `┃ ${PREFIX}crystals @user <amt> ─ top up Lucrystals\n` +
        `┃ ${PREFIX}creations ─ list pending Mora submissions\n` +
        `┃ ${PREFIX}approve-mora <id> <amt> <lucons|lcr> ─ approve + pay creator\n` +
        `┃ ${PREFIX}reject-mora <id> ─ reject a submission\n` +
        `┃ ${PREFIX}set-gauge / ${PREFIX}reduce-gauge\n` +
        `┃ ${PREFIX}war init / ${PREFIX}war-start\n` +
        `┃ ${PREFIX}war winner @user ─ report match result\n` +
        `┃ ${PREFIX}owner-fac-p ─ faction panel\n` +
        `┃ ${PREFIX}bug <id> fixed ─ close bug report\n` +
        `┃ ${PREFIX}owner-arena ─ arena control panel\n` +
        `┃ ${PREFIX}addarenagroup ─ add arena group\n` +
        `┃ ${PREFIX}arenagroup-on/off ─ toggle arena\n`,
    };

    // Section aliases (so users can type natural variants)
    const SECTION_ALIASES = {
      companion: "companion", mutation: "companion", achievements: "companion",
      gear: "gear", inventory: "gear", inv: "gear", items: "gear",
      economy: "economy", lucons: "economy", trading: "economy", trade: "economy",
      referrals: "referrals", referral: "referrals", ref: "referrals",
      market: "market", shop: "market", bm: "market", "black-market": "market",
      factions: "factions", faction: "factions", war: "factions", wars: "factions",
      arena: "arena", npc: "arena", challenge: "arena",
      pvp: "pvp", battle: "pvp",
      hunting: "hunting", hunt: "hunting", explore: "hunting", exploration: "hunting",
      fun: "fun", misc: "fun", sticker: "fun",
      utilities: "utilities", utility: "utilities", util: "utilities",
      pro: "pro", premium: "pro", subscription: "pro", sub: "pro", crystals: "pro", lcr: "pro",
      admin: "admin", sudo: "admin", owner: "admin", architect: "admin",
    };

    // ── "New commands" banner (entries <12h old) ────────────
    const freshCmds = getActiveNewCommands();
    const newCmdsBlock = freshCmds.length
      ? `${divider}\n  ✨  *NEW COMMANDS* _(<12h)_\n${divider}\n` +
        freshCmds.map(c => `┃ ${c.name} ─ ${c.blurb}`).join("\n") + `\n\n`
      : "";

    const requestedSection = String(args[0] || "").toLowerCase().trim();

    // ── If user asked for a specific section ────────────────
    if (requestedSection && SECTION_ALIASES[requestedSection]) {
      const key = SECTION_ALIASES[requestedSection];
      const sectionText =
        `╔═══════════════════════════╗\n` +
        `║    ✦  *L U M O R A*  ✦    ║\n` +
        `║   _Help — ${key.toUpperCase()}_   ║\n` +
        `╚═══════════════════════════╝\n\n` +
        newCmdsBlock +
        gettingStarted + `\n` +
        SECTIONS[key] + `\n` +
        `${divider}\n` +
        `_Use *.help* to see all sections._`;
      await sock.sendMessage(chatId, {
        image: { url: "./help.jpg" },
        caption: sectionText,
      });
      return;
    }

    // ── If they typed an unknown section ─────────────────────
    if (requestedSection) {
      const known = Object.keys(SECTIONS).join(", ");
      return sock.sendMessage(chatId, {
        text:
          `❌ Unknown help section: *${requestedSection}*\n\n` +
          `Available sections:\n${known}\n\n` +
          `Use *.help <section>* (e.g. *.help arena*)`,
      }, { quoted: msg });
    }

    // ── Default: index page ──────────────────────────────────
    const indexText =
      `╔═══════════════════════════╗\n` +
      `║    ✦  *L U M O R A*  ✦    ║\n` +
      `║   _Dominion Command Codex_  ║\n` +
      `╚═══════════════════════════╝\n\n` +
      greeting + `\n` +
      `${fIcon} Faction: *${pFaction}* | 💰 ${p?.lucons || 0} Lucons\n\n` +
      newCmdsBlock +
      gettingStarted + `\n` +
      `${divider}\n` +
      `  📚  *HELP SECTIONS*\n` +
      `${divider}\n` +
      `┃ ${PREFIX}help companion  ─ companions, mutation, achievements\n` +
      `┃ ${PREFIX}help gear       ─ inventory, gear, eradicate\n` +
      `┃ ${PREFIX}help economy    ─ daily, weekly, give, reverse\n` +
      `┃ ${PREFIX}help referrals  ─ referral codes & rewards\n` +
      `┃ ${PREFIX}help market     ─ market & black market\n` +
      `┃ ${PREFIX}help factions   ─ factions, missions, wars\n` +
      (settings?.arenaGroups?.enabled
        ? `┃ ${PREFIX}help arena      ─ NPC arena & .challenge\n`
        : "") +
      `┃ ${PREFIX}help pvp        ─ player vs player battles\n` +
      `┃ ${PREFIX}help hunting    ─ hunting, terrains, post-battle\n` +
      `┃ ${PREFIX}help fun        ─ stickers, dice, roast, etc.\n` +
      `┃ ${PREFIX}help utilities  ─ leaderboard, ping, bug-report\n` +
      `┃ ${PREFIX}help pro        ─ subscriptions, Lucrystals, autocatch\n` +
      `┃ ${PREFIX}help admin      ─ sudo / owner / architect\n\n` +
      `╔═══════════════════════════╗\n` +
      `║  💰 Currency: *${settings.currencyName}*\n` +
      `║  📝 *.confirm* / *.cancel* when prompted\n` +
      `║  _"The Rift watches. Choose wisely."_\n` +
      `╚═══════════════════════════╝`;

    await sock.sendMessage(chatId, {
      image: { url: "./help.jpg" },
      caption: indexText,
    });
    return;
}

      // .factioninfo — show perks AND drawbacks for any faction
      if (command === "factioninfo") {
        const key = String(args[0] || "").toLowerCase().trim();
        const info = factionMarketSystem.FACTION_BENEFITS?.[key];
        if (!info) {
          return sock.sendMessage(chatId, {
            text: "❌ Use: *.factioninfo harmony / purity / rift*",
          }, { quoted: msg });
        }
        const perks     = (info.perks     || []).map(p => `  ✅ ${p}`).join("\n");
        const drawbacks = (info.drawbacks || []).map(d => `  ❌ ${d}`).join("\n");
        return sock.sendMessage(chatId, {
          text:
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${info.emoji || "⚡"}  *${(info.name || key).toUpperCase()}*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `_"${info.belief || ""}"_\n\n` +
            `✅ *BENEFITS*\n${perks || "  None listed"}\n\n` +
            `❌ *DRAWBACKS*\n${drawbacks || "  None listed"}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Use *.fbuy <item>* to access this faction's market.`,
        }, { quoted: msg });
      }

      if (command === "lumora") {
        return sock.sendMessage(chatId, {
          text:
            `✨ ${settings.eraName}\n\n` +
            `Welcome to the Dominion of Lumora ⚔️💎🔥\n` +
            `🐾 Catch mighty Mora • ⚡ Battle rivals • 🏹 Complete quests • 🌟 Rise in rank\n\n` +
            `⚔ Choose your path:\n` +
            `🌿 Harmony Lumorians — stability & safer bonding\n` +
            `⚔ The Purity Order — discipline & control\n` +
            `🕶 Rift Seekers — high-risk, high-reward power\n\n` +
            `Use *${PREFIX}help* to get commands.`,
        });
      }

      return sock.sendMessage(chatId, { text: `❓ Unknown command. Use *${PREFIX}help*` });

    } catch (err) {
      if (isBaileysNoise(err)) return;
      console.log("Handler error:", err?.stack || err);
    }
  });
}

// ============================
// GRACEFUL SHUTDOWN: Flush MongoDB writes on exit
// ============================
let players = {}; // Global reference for shutdown handlers

// Store players reference after bootPlayers
const originalStartBot = startBot;
startBot = async function() {
  const result = await originalStartBot.call(this);
  // Note: players will be loaded in bootPlayers inside startBot
  return result;
};

process.on("SIGTERM", async () => {
  console.log("[shutdown] SIGTERM received, flushing data...");
  await mongoDb.gracefulShutdown(loadPlayers());
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[shutdown] SIGINT received, flushing data...");
  await mongoDb.gracefulShutdown(loadPlayers());
  process.exit(0);
});

startBot();
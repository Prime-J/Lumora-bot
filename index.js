// ============================
// LUMORA BOT (Baileys v7+)
// Era: Lumora: Awakening
// Prefix/Currency/Owner now stored in data/settings.json
// ✅ FIXED: Baileys is ESM-only -> dynamic import()
// ============================
try { require("dotenv").config(); } catch {}

// Silence libsignal's noisy session dumps (Railway rate-limits >500 logs/sec).
// libsignal console.info's the full session object on every open/close/rotate,
// which on an active bot easily crosses 500 logs/sec and kills the deployment.
{
  const SIGNAL_NOISE = [
    "Closing session:",
    "Opening session:",
    "Session already closed",
    "Session already open",
    "Removing old closed session:",
    "Migrating session to:",
    "Closing open session in favor of incoming prekey bundle",
    "Closing stale open session for new outgoing prekey bundle",
    "Decrypted message with closed session.",
    "Failed to decrypt message with any known session",
    "Session error:",
    "V1 session storage migration error",
  ];
  const isNoise = (args) => typeof args[0] === "string" && SIGNAL_NOISE.some(p => args[0].includes(p));
  for (const m of ["info", "warn", "error", "log"]) {
    const orig = console[m].bind(console);
    console[m] = (...args) => { if (!isNoise(args)) orig(...args); };
  }
}

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const fs = require("fs");
const path = require("path");
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// ── Web Dashboard API ─────────────────────────────────────
app.get('/api/players', (req, res) => {
  try {
    const data = loadPlayers();
    const list = Object.values(data).map(p => ({
      id: p.id, username: p.username, level: p.level, xp: p.xp,
      rank: p.rank, faction: p.faction, gender: p.gender, age: p.age,
      lucons: p.lucons, aura: p.aura, intelligence: p.intelligence,
      tameSkill: p.tameSkill, playerMaxHp: p.playerMaxHp, playerHp: p.playerHp,
      moraOwned: p.moraOwned, equipment: p.equipment, statPoints: p.statPoints || 0,
    }));
    res.json({ ok: true, players: list });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/mora', (req, res) => {
  try {
    const moraPath = path.join(__dirname, 'data', 'mora.json');
    const mora = JSON.parse(fs.readFileSync(moraPath, 'utf8'));
    res.json({ ok: true, mora });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/stats/invest', (req, res) => {
  try {
    const { playerId, stat, delta } = req.body;
    if (!playerId || !stat || !delta) return res.json({ ok: false, error: 'Missing params' });
    const data = loadPlayers();
    const p = data[playerId];
    if (!p) return res.json({ ok: false, error: 'Player not found' });
    const validStats = ['intelligence', 'aura', 'tameSkill', 'playerMaxHp'];
    if (!validStats.includes(stat)) return res.json({ ok: false, error: 'Invalid stat' });
    if (delta > 0 && (p.statPoints || 0) <= 0) return res.json({ ok: false, error: 'No stat points available' });
    if (delta < 0 && (p[stat] || 0) <= 0) return res.json({ ok: false, error: 'Cannot reduce below 0' });
    p[stat] = (p[stat] || 0) + delta;
    if (stat === 'playerMaxHp') p.playerHp = Math.min(p.playerHp || p.playerMaxHp, p.playerMaxHp);
    p.statPoints = (p.statPoints || 0) - delta;
    savePlayers(data);
    res.json({ ok: true, stat, value: p[stat], statPoints: p.statPoints });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

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
const factionProgressSystem = require("./systems/factionProgressSystem");
const fEngine = require('./factionWarEngine');
const { generateFactionGraph, generateFacPointsCard, generateBattleVsImage } = require('./factionCanvas');
const botPersonality = require('./systems/botPersonality');
const onboardingSystem = require('./systems/onboarding');
const ui = require('./systems/ui');
const interactiveUI = require('./systems/interactiveUI');
const helpUI = require('./systems/helpUI');
const FACTION_FILE = './data/faction_state.json';
const lb = require('./leaderboard');
const factionsData = JSON.parse(fs.readFileSync('./data/factions.json'));

const { generateVsCanvas, generateBracketCanvas, generateWarResultCanvas } = require('./warCanvas');
const miscSystem = require('./systems/misc');
const arenaSystem = require('./systems/npcArena');
const proSystem = require('./systems/pro');
const moraCreationSystem = require('./systems/moraCreation');
const raidsSystem = require('./systems/raids');
const starSystem = require('./systems/star');
const updatesSystem = require('./systems/updates');
const bankSystem = require('./systems/bank');
const robberySystem = require('./systems/robbery');
const ranksSystem = require('./systems/ranks');
const shardSystem = require('./systems/shards');
const questSystem = require('./systems/quests');
const statSystem  = require('./systems/stats');
const apologySystem = require('./systems/apology');
const scrollSystem  = require('./systems/scrolls');
const combatLockSystem = require('./systems/combatLock');
const autoRaidSystem = require('./systems/autoRaid');
const playerBattleSystem = require('./systems/playerBattle');
const ownerToolsSystem  = require('./systems/ownerTools');
const testModeSystem = require('./systems/testMode');
const meetingsSystem = require('./systems/meetings');
const buttonsSystem = require('./systems/buttons');
const { sendButtons } = buttonsSystem;
const artpackSystem = require('./systems/artpack');
const { generateRankCard, generateRankUpCard } = require('./systems/rankCardCanvas');
const { generateWealthCard, findWealthRank, buildWealthLb } = require('./systems/wealthCanvas');
const { generateAlverahCard } = require('./systems/alverahCanvas');
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
  { name: ".meeting",        section: "utilities", blurb: "Owner: save & recall meeting decisions",         addedAt: Date.now() },
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
// Historical filename is capitalized. Railway/Linux is case-sensitive, while
// Windows is not; using "players.json" makes the JSON fallback look empty.
const PLAYERS_FILE = path.join(DATA_DIR, "Players.json");
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

// 🕶️ BLACK MARKET POOL — real catalog items the Void Merchant can carry.
// Every entry resolves to a live item in data/items.json, so buying works
// through the normal inventory pipeline (by item ID, not name).
const BLACK_MARKET_POOL = [
  { id: "GER_005",  name: "Riftbite Core" },
  { id: "GER_013",  name: "Gloam Thread Charm" },
  { id: "GER_023",  name: "Echo Drill" },
  { id: "GER_033",  name: "Gloamwrap" },
  { id: "GER_041",  name: "Riftwalk Greaves" },
  { id: "GER_043",  name: "Tempest Striders" },
  { id: "ITM_008",  name: "Forbidden Mora Lure" },
  { id: "ITM_012",  name: "Dimensional Pouch" },
  { id: "ITM_013",  name: "Shadow Permit" },
  { id: "PHANTOM_GLOVE", name: "Phantom Glove" },
  { id: "CRY_004",  name: "Rift Crystal" },
  { id: "REL_003",  name: "Echo Relic" },
];

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

// Async boot: initialize MongoDB and load all players
async function bootPlayers() {
  // Try to connect to MongoDB
  await mongoDb.initMongo();

  // Load from MongoDB. Returns:
  //   - object with data: success
  //   - {}: connected but truly empty database
  //   - null: load FAILED (network/timeout) — don't trust JSON fallback
  let players = await mongoDb.loadAllPlayers();

  if (players === null) {
    const fallbackPlayers = loadJSON(PLAYERS_FILE, {});
    // CRITICAL: Mongo connected but the read failed even after retries.
    // Writes are blocked by mongo.markDirty's bootLoadFailed guard. Use the
    // warm cache for reads so players do not appear unregistered.
    console.error("[boot] ⚠️  Mongo load failed. Bot is in READ-ONLY-FOR-MONGO mode.");
    console.error(`[boot] ⚠️  Loaded ${Object.keys(fallbackPlayers).length} players from JSON warm cache.`);
    console.error("[boot] ⚠️  No saves will reach Mongo, so existing data is SAFE.");
    return fallbackPlayers;
  }

  // Fall back to JSON file if MongoDB returned nothing (genuinely empty DB)
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

  console.log(`[boot] Loaded ${Object.keys(players).length} players total`);
  return players;
}

function loadPlayers() {
  return loadJSON(PLAYERS_FILE, {});
}

function savePlayers(players) {
  // Always save to JSON (warm cache for quick loads)
  saveJSON(PLAYERS_FILE, players);

  // Mark EVERY jid dirty for MongoDB. The batched flush (3s debounce)
  // will write them efficiently. Previously dirtyJidsThisCycle was never
  // populated, so MongoDB never received updates after boot — causing
  // data to revert on every redeploy.
  for (const jid of Object.keys(players)) {
    mongoDb.markDirty(players, jid);
  }
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
// 0.1.3 — achievements now ALSO grant unlock rewards (lucons / items)
// in addition to the passive aura bonus. Rewards fire ONCE when the
// achievement is first earned (handled in checkAchievements).
const ACHIEVEMENTS = {
  first_catch:   { title: "Mora Catcher",      desc: "Catch your first Mora",         icon: "🐾", aura: 2,  reward: { lucons: 200 } },
  tamer_10:      { title: "Beast Tamer",        desc: "Own 10 Mora",                   icon: "🦁", aura: 5,  reward: { lucons: 750 } },
  tamer_25:      { title: "Mora Warden",        desc: "Own 25 Mora",                   icon: "🛡️", aura: 8,  reward: { lucons: 2000, items: { CRY_001: 2 } } },
  battle_1:      { title: "First Blood",        desc: "Win your first PvP battle",     icon: "⚔️", aura: 3,  reward: { lucons: 300 } },
  battle_10:     { title: "Battle Hardened",     desc: "Win 10 PvP battles",            icon: "🗡️", aura: 7,  reward: { lucons: 1500 } },
  battle_50:     { title: "War Machine",         desc: "Win 50 PvP battles",            icon: "💀", aura: 15, reward: { lucons: 6000, items: { CRY_002: 1 } } },
  rich_5k:       { title: "Wealthy",            desc: "Hold 5,000 Lucons at once",     icon: "💰", aura: 4,  reward: { lucons: 500 } },
  rich_20k:      { title: "Tycoon",             desc: "Hold 20,000 Lucons at once",    icon: "👑", aura: 10, reward: { lucons: 2500 } },
  level_10:      { title: "Rising Star",        desc: "Reach level 10",                icon: "🌟", aura: 3,  reward: { lucons: 500 } },
  level_25:      { title: "Veteran",            desc: "Reach level 25",                icon: "🎖️", aura: 8,  reward: { lucons: 2500, items: { REOB: 1 } } },
  level_50:      { title: "Legend",             desc: "Reach level 50",                icon: "🏆", aura: 20, reward: { lucons: 8000, lcr: 5, items: { REOB: 2 } } },
  hunter_50:     { title: "Master Hunter",      desc: "Complete 50 hunts",             icon: "🏹", aura: 12, reward: { lucons: 3500 } },
  streak_7:      { title: "Devoted",            desc: "7-day login streak",            icon: "🔥", aura: 3,  reward: { lucons: 700 } },
  streak_30:     { title: "Unbreakable",        desc: "30-day login streak",           icon: "⚡", aura: 12, reward: { lucons: 5000, lcr: 3 } },
  faction_500:   { title: "Faction Loyalist",   desc: "Earn 500 resonance",            icon: "🚩", aura: 10, reward: { lucons: 2000 } },
  companion_100: { title: "Soulbound",          desc: "Reach 100 companion bond",      icon: "💞", aura: 8,  reward: { lucons: 1500 } },
  mutator:       { title: "Mutant Whisperer",   desc: "Trigger 10 mutations",          icon: "🧬", aura: 9,  reward: { lucons: 2000, items: { MUT_001: 2 } } },
  creator_first: { title: "Architect",         desc: "Submit your first Mora design", icon: "⚗️", aura: 6,  reward: { lucons: 1500 } },
  creator_rare:  { title: "Crafted in Rift",   desc: "Create a Rare or higher Mora", icon: "💎", aura: 10, reward: { lucons: 3000 } },
  creator_epic:  { title: "Epic Forger",       desc: "Create an Epic Mora",          icon: "🌀", aura: 15, reward: { lucons: 6000 } },
  creator_legendary: { title: "Legendary Shaper", desc: "Create a Legendary Mora",   icon: "🌟", aura: 25, reward: { lucons: 12000, lcr: 5 } },
  creator_3:     { title: "Serial Architect",  desc: "Create 3 Moras",               icon: "🔬", aura: 12, reward: { lucons: 3500 } },
  rift_survivor: { title: "Survivor of the Rift Tear", desc: "Endured the data-storm crisis of patch 0.1.1", icon: "🌀", aura: 15, reward: { lucons: 0 } },

  // 0.1.3 — new achievements
  banker:        { title: "Vault Keeper",      desc: "Deposit 10,000L into the bank", icon: "🏦", aura: 6,  reward: { lucons: 1500 } },
  rich_100k:     { title: "Mogul",              desc: "Hold 100,000L total wealth",    icon: "💎", aura: 18, reward: { lucons: 5000, lcr: 3 } },
  snatcher:      { title: "Glove Hand",         desc: "Successfully snatch 5 victims", icon: "🥷", aura: 8,  reward: { lucons: 2000 } },
  defender_5:    { title: "Sharp Reflexes",     desc: "Defend against 5 snatch attempts", icon: "🛡️", aura: 10, reward: { lucons: 2500 } },
  donor_5k:      { title: "Treasury Patron",    desc: "Donate 5,000L (lucon-equivalent) to your faction", icon: "🏛️", aura: 7, reward: { lucons: 1000 } },
  ranked_elite:  { title: "Elite Ascendant",    desc: "Reach the Elite rank (Lv 40)",  icon: "🟣", aura: 14, reward: { lucons: 4000, lcr: 2 } },
  ranked_champion: { title: "Champion's Crown", desc: "Reach the Champion rank (Lv 59)", icon: "🥇", aura: 20, reward: { lucons: 7000, lcr: 4 } },
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
    // 0.1.3 — new
    banker:          () => Number(p.bankDepositTotal || 0) >= 10000,
    rich_100k:       () => ((p.lucons || 0) + (p.bankBalance || 0)) >= 100000,
    snatcher:        () => Number(p.snatchSuccesses || 0) >= 5,
    defender_5:      () => Number(p.snatchDefenses || 0) >= 5,
    donor_5k:        () => Number(p.totalDonatedL || 0) >= 5000,
    ranked_elite:    () => (p.level || 1) >= 40,
    ranked_champion: () => (p.level || 1) >= 59,
  };
  for (const [key, check] of Object.entries(checks)) {
    if (!p.achievements.includes(key) && check()) {
      p.achievements.push(key);
      earned.push(key);
      // 0.1.3 — pay out unlock rewards (one-shot)
      try {
        const ach = ACHIEVEMENTS[key];
        if (ach?.reward) {
          if (ach.reward.lucons) p.lucons = (p.lucons || 0) + Number(ach.reward.lucons);
          if (ach.reward.lcr) {
            const proSys = require("./systems/pro");
            const pro = proSys.ensureProState(p);
            pro.crystals = Number(pro.crystals || 0) + Number(ach.reward.lcr);
          }
          if (ach.reward.items && typeof ach.reward.items === "object") {
            if (!p.inventory) p.inventory = {};
            for (const [itemId, qty] of Object.entries(ach.reward.items)) {
              p.inventory[itemId] = Number(p.inventory[itemId] || 0) + Number(qty);
            }
          }
        }
      } catch (e) { console.log("[ach-reward]", key, e?.message); }
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

function hasRiftEnergyBuff(player) {
  return !!player && Number(player.riftEnergyUntil || 0) > Date.now();
}

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
  // Delegate to factionProgressSystem — single source of truth
  factionProgressSystem.addFactionPoints(faction, amount);
}

// ============================
// FACTION TREASURY + HONOUR
// ============================
const FACTION_TREASURY_FILE = path.join(DATA_DIR, "faction_treasury.json");
const TREASURY_DEFAULT = () => ({
  lucons: 0,
  moraDeployed: [],
  treasures: [],
  wallHp: 500,
  wallMaxHp: 500,
  wallLevel: 1,
  wallMaterials: [],
  wallRegenAt: 0,
  honour: 100,
  contributions: {},
});

function loadTreasury() {
  const t = loadJSON(FACTION_TREASURY_FILE, {
    harmony: TREASURY_DEFAULT(),
    purity: TREASURY_DEFAULT(),
    rift: TREASURY_DEFAULT(),
  });
  for (const f of ["harmony", "purity", "rift"]) {
    if (!t[f]) t[f] = TREASURY_DEFAULT();
    const def = TREASURY_DEFAULT();
    for (const k of Object.keys(def)) {
      if (t[f][k] === undefined) t[f][k] = def[k];
    }
  }
  return t;
}

function saveTreasury(t) {
  return saveJSON(FACTION_TREASURY_FILE, t);
}

function addTreasuryLucons(faction, amount, jid = null) {
  if (!faction || !["harmony","purity","rift"].includes(faction)) return;
  if (!amount || amount <= 0) return;
  const t = loadTreasury();
  t[faction].lucons = Math.max(0, (t[faction].lucons || 0) + Math.floor(amount));
  if (jid) {
    t[faction].contributions[jid] = (t[faction].contributions[jid] || 0) + Math.floor(amount);
  }
  saveTreasury(t);
}

function addTreasuryMora(faction, moraEntry) {
  if (!faction || !["harmony","purity","rift"].includes(faction)) return;
  const t = loadTreasury();
  t[faction].moraDeployed.push(moraEntry);
  saveTreasury(t);
}

function adjustHonour(faction, delta) {
  if (!faction || !["harmony","purity","rift"].includes(faction)) return;
  const t = loadTreasury();
  t[faction].honour = Math.max(0, Math.min(300, (t[faction].honour || 100) + delta));
  saveTreasury(t);
}

function regenWallIfDue(faction) {
  if (!faction) return;
  const t = loadTreasury();
  const f = t[faction];
  if (!f) return;
  const now = Date.now();
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (!f.wallRegenAt) f.wallRegenAt = now + SIX_HOURS;
  if (now >= f.wallRegenAt && f.wallHp < f.wallMaxHp) {
    const regen = Math.floor(f.wallMaxHp * 0.1);
    f.wallHp = Math.min(f.wallMaxHp, f.wallHp + regen);
    f.wallRegenAt = now + SIX_HOURS;
    saveTreasury(t);
  }
}

function getWallLevelCapacity(level) {
  const caps = { 1: 500, 2: 700, 3: 1000, 4: 1400, 5: 2000 };
  return caps[level] || 500;
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
  // 🧪 TEST MODE groups get full hunting/battle access
  if (testModeSystem.isTestGroup(chatId)) return true;
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
  // 🧪 TEST MODE groups get full arena access
  if (testModeSystem.isTestGroup(chatId)) return true;
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

// ── TAP DEDUP ──────────────────────────────────────────────────
// Some clients post the button label as a chat message AND deliver
// the button response — without a guard, a single tap would run the
// command twice (e.g. spend 2 stat points on one tap of "❤️ +1 Vit").
// Exact same (chat, sender, text) repeats within 2.5s are swallowed.
const _tapDedup = new Map();
function isTapDuplicate(chatId, senderId, text) {
  if (!text) return false;
  const key = `${chatId}|${senderId}|${text}`;
  const now = Date.now();
  const prev = _tapDedup.get(key);
  if (prev && now - prev < 2500) return true;
  _tapDedup.set(key, now);
  return false;
}

function getText(m) {
  const msg = unwrapMessage(m);
  if (!msg) return "";
  // Button/template responses — return what the user tapped.
  // v2.1: button ids ARE the commands (".inv"), so a command-id is
  // returned directly; labels fall back to the translated text path.
  // v2.2: handle templateButtonReplyMessage — live taps on several
  // clients arrive as this type, not interactiveResponseMessage.
  if (msg.templateButtonReplyMessage) {
    const tbr = msg.templateButtonReplyMessage;
    const sid = tbr.selectedId;
    if (sid && String(sid).startsWith(".")) return String(sid);
    return sid || tbr.selectedDisplayText || "";
  }
  if (msg.buttonsResponseMessage) {
    const bid = msg.buttonsResponseMessage.selectedButtonId;
    const bdt = msg.buttonsResponseMessage.selectedDisplayText;
    if (bid && String(bid).startsWith(".")) return String(bid);
    return bid || bdt || "";
  }
  if (msg.interactiveResponseMessage) {
    const nfrm = msg.interactiveResponseMessage.nativeFlowResponseMessage;
    if (nfrm && nfrm.paramsJson) {
      try {
        const parsed = JSON.parse(nfrm.paramsJson);
        if (parsed.id && String(parsed.id).startsWith(".")) return String(parsed.id);
        return parsed.display_text || parsed.id || "";
      } catch {}
    }
    const br = msg.interactiveResponseMessage.buttonReplyMessage;
    if (br) return (br.id && String(br.id).startsWith(".")) ? br.id : (br.displayText || br.id || "");
  }
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
  // No custom art → anime art pack (assets/artpack, any source).
  return artpackSystem.artPathFor(speciesOrOwned) || null;
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
    generation: species.generation || 1,
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

    // ── Shard / merge system (v0.5.0 rework) ─────────────────
    if (!p.shards || typeof p.shards !== "object") { p.shards = {}; changed = true; }
    if (!p.shardStorage || typeof p.shardStorage !== "object") { p.shardStorage = {}; changed = true; }
    if (!("currentMerge" in p)) { p.currentMerge = null; changed = true; }

    // ── Stat-point system (v0.6.0 → v0.9.0: Def merged into Vit, init=1) ──
    if (!p.stats || typeof p.stats !== "object") {
      p.stats = { melee: 1, mora: 1, vit: 1, speed: 1 };
      changed = true;
    } else {
      for (const k of ["melee","mora","vit","speed"]) {
        if (typeof p.stats[k] !== "number") { p.stats[k] = 1; changed = true; }
      }
      // Migrate any legacy Def points → Vit, then strip
      if (typeof p.stats.def === "number" && p.stats.def > 0) {
        p.stats.vit = Number(p.stats.vit || 0) + p.stats.def;
        delete p.stats.def;
        changed = true;
      } else if ("def" in p.stats) {
        delete p.stats.def;
        changed = true;
      }
    }
    if (typeof p.statPoints !== "number") { p.statPoints = 0; changed = true; }

    // ── v0.9.0: starter picks (style + shard) ─────────────
    if (typeof p.starterStyleChosen !== "boolean") { p.starterStyleChosen = false; changed = true; }
    if (typeof p.starterShardChosen !== "boolean") { p.starterShardChosen = false; changed = true; }

    if (!p.scrolls || typeof p.scrolls !== "object") { p.scrolls = {}; changed = true; }
    if (!p.quests || typeof p.quests !== "object") { p.quests = { active: {}, completed: [] }; changed = true; }
    if (!Array.isArray(p.styles)) { p.styles = []; changed = true; }

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
    "pass",
    "gather",
    "intel"
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

// Convert any shape of Baileys messageTimestamp (number, string, Date, protobuf
// Long, {low,high}) to Unix seconds — or 0 when absent/invalid. Baileys can hand
// us a Long / Date / NaN here; Number() alone silently yields NaN, which disabled
// the old-message guard and let the post-relink history replay flood through.
function toUnixSeconds(ts) {
  if (ts == null) return 0;
  if (typeof ts === "number") return Number.isFinite(ts) ? ts : 0;
  if (typeof ts === "string") {
    const n = Number(ts);
    return Number.isFinite(n) ? n : 0;
  }
  if (ts instanceof Date) return Math.floor(ts.getTime() / 1000);
  if (typeof ts === "object") {
    if (typeof ts.toNumber === "function") {
      const n = ts.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof ts.low === "number") return ts.low;
  }
  return 0;
}

// Cache of WhatsApp pushNames seen in messages (used by .q sticker to show real WA name)
const pushNameCache = {};

const punishRuntime = {
  lastCmdAt: {},
};

// ── SINGLE-INSTANCE LOCK ────────────────────────────────────────
// Two bots sharing ./auth corrupts creds.json and forces a re-link.
// Refuse to boot if another instance is already running on this folder.
function acquireInstanceLock() {
  const fs = require("fs");
  const LOCK_PATH = "./auth/.lock";
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const oldPid = parseInt(fs.readFileSync(LOCK_PATH, "utf8"), 10);
      let alive = false;
      if (oldPid && oldPid !== process.pid) {
        if (process.platform === 'win32') {
          try { const { execSync } = require('child_process');
            execSync(`tasklist /FI "PID eq ${oldPid}" /NH`, { stdio: 'pipe' }).toString().includes(String(oldPid)) && (alive = true);
          } catch { alive = false; }
        } else {
          try { process.kill(oldPid, 0); alive = true; } catch { alive = false; }
        }
      }
      if (alive) {
        console.log(`[lock] Another Lumora instance is already running (PID ${oldPid}). Refusing to start — this protects your WhatsApp session.`);
        process.exit(1);
      }
      console.log(`[lock] Stale lock from PID ${oldPid} — removing.`);
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
    process.on("exit", () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
  } catch (e) {
    console.log("[lock] Lock unavailable — continuing without it.");
  }
}

async function startBot() {
  if (isStarting) return;
  isStarting = true;

  acquireInstanceLock();

  await loadBaileys();
  try { starSystem.init(); } catch (e) { console.warn("[star] init failed:", e.message); }

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
    syncFullHistory: false,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    // Without this stub Baileys can't retry decryption on stale sender keys,
    // which causes "bot stops responding in some old groups" after restarts.
    // Returning an empty conversation lets the retry loop succeed harmlessly.
    getMessage: async () => ({ conversation: "" }),
    ...(waVersion ? { version: waVersion } : {}),
  });

  console.log("[socket] Socket created, waiting for connection...");
  console.log("[socket] Credentials registered:", state.creds?.registered);

  // CRITICAL: Register handlers IMMEDIATELY before any async work.
  // Baileys emits connection events from the moment the socket is created — if we
  // await MongoDB or anything else first, those early events get dropped and the bot
  // hangs forever waiting for a connection update that already fired.
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.error", (err) => {
    console.log("[socket] Connection error:", err?.message || err);
  });

  let spawnStarted = false;

  sock.ev.on("connection.update", (update) => {
    console.log("[socket] Connection update received:", update.connection);
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n✅ SCAN THIS QR CODE IN WHATSAPP → LINKED DEVICES:\n");
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

        // Star loneliness loop — pings Prime when groups go quiet
        try {
          starSystem.startLonelinessLoop(() => sock, () => ({ settings: loadSettings() }));
        } catch (e) { console.warn("[star] loneliness loop failed:", e.message); }
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
        const groupIdStr = String(id); // Ensure id is a string

        for (const rawJid of participants) {
            // Baileys may pass participants as strings OR objects {id: '...'}
            const jid = (typeof rawJid === 'string') ? rawJid : (rawJid?.id || rawJid?.jid || '');
            if (!jid) continue;
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
            const jidStr = String(jid);
            const tag = `@${jidStr.split('@')[0]}`;

            let welcomeText = `${welcomeMsg}\n\n` +
              `hey ${tag}........welcome to the family bro 🌌\n\n` +
              `if this is your first time here........type *.tutorial* and i'll walk you through everything step by step........trust me it's easy\n\n` +
              `we're glad you're here 💪\n\n` +
              `🔗 *Main Group:* https://chat.whatsapp.com/HRwht4ktwZ6F9DnldqissZ`;

            if (p && groupInfo && groupInfo.faction !== 'none') {
                welcomeText += `\n\n🐉 *next up:* join your faction group and pick your starter Mora with:\n*.choose 1*, *.choose 2*, or *.choose 3*`;
            }

            try {
              await sock.sendMessage(groupIdStr, { text: welcomeText, mentions: [jidStr] });
            } catch (e) {
              console.log("Welcome send error:", e?.message || e);
            }
        }
    }

    if (action === 'remove') {
        for (const rawJid of participants) {
            const jid = (typeof rawJid === 'string') ? rawJid : (rawJid?.id || rawJid?.jid || '');
            if (!jid) continue;
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

// Initialize MongoDB and load players AFTER connection handlers are wired but
// BEFORE the message handler — so connection events aren't lost and message
// handlers won't fire against uninitialized player data.
console.log("[bot] Initializing player storage...");
const initialPlayers = await bootPlayers();
console.log(`[bot] Loaded ${Object.keys(initialPlayers).length} players`);

sock.ev.removeAllListeners("messages.upsert");
  sock.ev.on("messages.upsert", async ({ messages, type }) => {

    // Replay diagnostics: history/offline replays arrive as non-notify batches.
    // Log them so any post-relink flood is visible (and provable) in the console.
    if (type !== "notify") {
      for (const _m of messages || []) {
        const _ts = _m?.messageTimestamp;
        console.log(`[upsert:${type}] ts=${_ts} (${typeof _ts}) fromMe=${!!_m?.key?.fromMe} jid=${_m?.key?.remoteJid} body=${String(_m?.message?.conversation || _m?.message?.extendedTextMessage?.text || "").slice(0, 60)}`);
      }
    }

    // ✅ ONLY ONE LISTENER NOW
    if (type !== "notify") return;
    if (!isReady) return;

    const msg = messages?.[0];
    if (!msg) return;
    // Drop the bot's own messages at the top — emitOwnEvents:false isn't
    // always honoured (paired devices, history sync) and self-events caused
    // a Star → reply → Star loop that flooded groups with blank bubbles.
    if (msg.key?.fromMe) return;
    if (!msg.message) {
      // Decryption failure / sender-key issue — log so we can spot stale-session groups
      if (msg.messageStubType) {
        console.log(`[no-decrypt] chat=${msg.key?.remoteJid} stubType=${msg.messageStubType}`);
      }
      return;
    }

    // Debug print — also surface button taps & interactive responses,
    // which arrive with empty conversation text and used to be invisible.
    const debugBody = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if (debugBody) {
      console.log(`📩 Message Received: ${debugBody}`);
    } else {
      const tapText = getText(msg);
      // v2.2 — dump the raw tap payload so we can see exactly what the
      // client sent (selectedId vs display text) on every client type.
      const raw = (() => {
        try {
          const m = msg.message;
          if (m.templateButtonReplyMessage) {
            const t = m.templateButtonReplyMessage;
            return `template[id=${JSON.stringify(t.selectedId)} text=${JSON.stringify(t.selectedDisplayText)}]`;
          }
          if (m.buttonsResponseMessage) {
            const b = m.buttonsResponseMessage;
            return `buttons[id=${JSON.stringify(b.selectedButtonId)} text=${JSON.stringify(b.selectedDisplayText)}]`;
          }
          if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            return `native[${m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson}]`;
          }
          return JSON.stringify(Object.keys(m));
        } catch { return "?"; }
      })();
      if (tapText) console.log(`🔘 Button tap received: ${tapText}  (${raw})`);
      else console.log(`[msg] non-text type: ${Object.keys(msg.message).join(",")}  ${raw}`);
    }

    try {
      const msg = messages?.[0];
      if (!msg || !msg.message) return;
      // ============================
      // IGNORE OFFLINE / OLD MESSAGES
      // Hard gate against the post-relink replay flood: after a fresh QR link
      // (or reconnect), WhatsApp can surface old group messages as 'notify'.
      // Drop anything that predates this process by 30s+, or that is older
      // than 5 minutes outright (offline/history replays).
      // ============================
      const msgTimestamp = toUnixSeconds(msg.messageTimestamp);
      const msgAgeSec = msgTimestamp ? Math.floor(Date.now() / 1000) - msgTimestamp : 0;
      const bootAgeSec = Math.floor(Date.now() / 1000) - BOT_START_TIME;
      if (msgTimestamp && (msgTimestamp < BOT_START_TIME - 60 || msgAgeSec > 120)) {
        console.log(`[msg] dropped stale message (age ${msgAgeSec}s, jid ${msg.key.remoteJid})`);
        return;
      }
      // No usable timestamp: always drop.
      // Real WhatsApp messages always carry a timestamp. An unstamped message
      // is replay noise from history sync or stale sender keys.
      if (!msgTimestamp) {
        console.log(`[msg] dropped unstamped message (jid ${msg.key.remoteJid})`);
        return;
      }

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
        loadTreasury,
        saveTreasury,
        addTreasuryLucons,
        addTreasuryMora,
        adjustHonour,
        regenWallIfDue,
        getWallLevelCapacity,
        addFactionPoints,
        shardSystem,
        questSystem,
        statSystem,
      };

      if (isGroupJid(chatId) && settings.features.groupSpawnsEnabled !== false) {
        try {
          await spawnSystem.maybeSpawn(ctx, chatId);
        } catch (e) {
          if (!isBaileysNoise(e)) console.log("Spawn maybeSpawn error:", e?.message || e);
        }
      }

      // Tap-to-command: button taps come back as chat text — translate
      // known button labels ("🌿 Harmony" → ".faction harmony") first.
      let text = buttonsSystem.translateText(getText(msg).trim());
      // ── HARDCODED FALLBACK LABEL MAP ──
      // Ensures button taps always resolve even if button_labels.json
      // is stale (e.g. after a restart before mapButtons was called).
      const TAP_FALLBACK = {
        '🎮 Game Menu': `${PREFIX}help-game`,
        '🛡️ Bot Menu': `${PREFIX}help-bot`,
        '🔙 Back': `${PREFIX}help`,
        '👤 Profile': `${PREFIX}profile`,
        '🎒 Inventory': `${PREFIX}inv`,
        '🥋 Styles': `${PREFIX}styles`,
        '💎 Shards': `${PREFIX}shards`,
        '⚔️ Battle': `${PREFIX}battle`,
        '📖 Guide': `${PREFIX}guide`,
        '📚 Help': `${PREFIX}help`,
        '🗺️ Map': `${PREFIX}map`,
        '🌲 Hunt': `${PREFIX}hunt`,
        '⚔️ Attack': `${PREFIX}attack`,
        '⚡ Charge': `${PREFIX}charge`,
        '🏃 Run': `${PREFIX}run`,
        '🎯 Capture': `${PREFIX}capture`,
        '✨ Purify': `${PREFIX}purify`,
        '🎮 Quick Menu': `${PREFIX}menu`,
        '✅ Accept': `${PREFIX}accept`,
        '❌ Reject': `${PREFIX}reject`,
      };
      if (!text.startsWith(PREFIX) && TAP_FALLBACK[text]) {
        text = TAP_FALLBACK[text];
      }

      // Swallow double-delivered taps (label bubble + button response).
      if (isTapDuplicate(chatId, senderId, text)) {
        console.log(`[tap] deduped repeat: ${JSON.stringify(text)}`);
        return;
      }

      // ── PENDING CREATION FLOW INTERCEPTOR ──
      const moraCreationSystem = require("./systems/moraCreation");
      if (moraCreationSystem.hasPendingCreation(senderId)) {
        return moraCreationSystem.handlePendingCreation(ctx, chatId, senderId, msg, text);
      }

      // ── STAR INTERCEPTOR (non-command "star" mentions + replies to Star) ──
      // Skip anything that starts with the bot prefix — those are commands,
      // Star was hallucinating fake commands when she tried to "answer" them.
      try {
        if (!text.startsWith(PREFIX) && starSystem.shouldHandle(msg, text, sock)) {
          const handled = await starSystem.handleMessage(ctx, chatId, senderId, msg, text);
          if (handled) return;
        }
      } catch (e) {
        if (!isBaileysNoise(e)) console.log("[star] handler error:", e?.message || e);
      }

      const isCommand = text.startsWith(PREFIX);

      if (!isCommand) return;

      const args = text.slice(PREFIX.length).trim().split(/\s+/);
      let command = (args.shift() || "").toLowerCase();

      // ── OWNER TOOLBOX (.ow) — registered EARLY so it works even mid-battle ──
      // Superset router: native toolbox subs are handled here; anything else falls
      // through as a legacy owner command (e.g. .ow warn → warn), so the whole
      // owner surface lives under one prefix.
      if (command === "ow" || command.startsWith("ow-")) {
        const sub = String(args[0] || "").toLowerCase();
        const isToolboxSub = sub === "" || ownerToolsSystem.isToolboxCommand(sub);

        if (isToolboxSub) {
          try {
            return ownerToolsSystem.cmdOwnerTools(ctx, chatId, senderId, msg, args, {
              getMentionedJids,
              getRepliedJid,
              toUserJidFromArg,
              normJid,
            });
          } catch (e) {
            console.log("[ow] error:", e?.message || e);
            return sock.sendMessage(chatId, { text: "⚠️ Owner toolbox error. Check logs." });
          }
        }

        // Legacy merge: .ow <legacy-cmd> <args...> → rewrite and fall through.
        // Architect-only surface; the legacy handlers re-check isOwner / isPrivileged.
        if (!isOwner) {
          return sock.sendMessage(chatId, { text: "❌ Architect-only toolbox." });
        }
        if (command === "ow") {
          command = (args.shift() || "").toLowerCase();
        } else {
          command = command.slice(3); // "ow-refill" → "refill"
        }
      }

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

        const newDesc = args.join(" ").trim() || text.slice((PREFIX + "setlinkdesc").length).trim();

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
    const warName = p?.username || '???';
    return sock.sendMessage(chatId, {
      text:
        `🌌 *[ ENERGY SYNCED ]*\n\n` +
        `✅ @${String(senderId).split("@")[0]} *${warName}* has entered the war!\n` +
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
    const bracket = fEngine.getBracketText(players);
    try {
      const bracketImg = await generateBracketCanvas(fEngine.war, players);
      return sock.sendMessage(chatId, {
        image: bracketImg,
        caption: bracket.text,
        mentions: bracket.mentions,
      }, { quoted: msg });
    } catch {
      return sock.sendMessage(chatId, { text: bracket.text, mentions: bracket.mentions }, { quoted: msg });
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
        const champPhone = result.champion?.split("@")[0];
        const ruPhone = result.runnerUp?.split("@")[0];

        const rewardMentions = [];
        const rewardLines = rewards.map(r => {
          const icon = r.tier === "champion" ? "👑" : r.tier === "runnerUp" ? "🥈" : r.tier === "winner" ? "✅" : "📦";
          const rPhone = r.id?.split("@")[0];
          if (rPhone && r.id) rewardMentions.push(r.id);
          return rPhone
            ? `  ${icon} @${rPhone} *${r.username}*: +${r.lucons} Lucons, +${r.aura} Aura, +${r.resonance} Resonance`
            : `  ${icon} *${r.username}*: +${r.lucons} Lucons, +${r.aura} Aura, +${r.resonance} Resonance`;
        });

        await sock.sendMessage(chatId, {
          image: resultImg,
          caption:
            `🏆 *FACTION WAR #${fEngine.war.warCount} ENDED!*\n\n` +
            `👑 Champion: @${champPhone} *${champName}*\n` +
            `🥈 Runner-Up: @${ruPhone} *${ruName}*\n\n` +
            `*REWARDS:*\n${rewardLines.join("\n")}`,
          mentions: [result.champion, result.runnerUp, ...rewardMentions],
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
        const p1Name = players[nextMatch.p1]?.username || '???';
        const p2Name = players[nextMatch.p2]?.username || '???';
        await sock.sendMessage(chatId, {
          image: vsImg,
          caption:
            `⚔️ *NEXT MATCH*\n\n` +
            `_${fEngine.getMatchIntro()}_\n\n` +
            `@${String(nextMatch.p1).split("@")[0]} *${p1Name}*  vs  @${String(nextMatch.p2).split("@")[0]} *${p2Name}*\n\n` +
            `Use *.ready* when prepared!`,
          mentions: [nextMatch.p1, nextMatch.p2],
        });
      } catch {
        const p1Name = players[nextMatch.p1]?.username || '???';
        const p2Name = players[nextMatch.p2]?.username || '???';
        await sock.sendMessage(chatId, {
          text: `⚔️ *NEXT MATCH:* @${String(nextMatch.p1).split("@")[0]} *${p1Name}* vs @${String(nextMatch.p2).split("@")[0]} *${p2Name}*\nUse *.ready* when prepared!`,
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
      const m1Name = p1?.username || '???';
      const m2Name = p2?.username || '???';
      await sock.sendMessage(chatId, {
        image: vsImg,
        caption:
          `⚔️ *FACTION WAR #${fEngine.war.warCount} HAS BEGUN!*\n\n` +
          `_${fEngine.getMatchIntro()}_\n\n` +
          `First Match:\n@${String(match.p1).split("@")[0]} *${m1Name}*  vs  @${String(match.p2).split("@")[0]} *${m2Name}*\n\n` +
          `Use *.ready* when prepared!`,
        mentions: [match.p1, match.p2],
      });
    } catch {
      const m1Name = p1?.username || '???';
      const m2Name = p2?.username || '???';
      await sock.sendMessage(chatId, {
        text: `⚔️ *WAR BEGUN!*\nFirst Match: @${String(match.p1).split("@")[0]} *${m1Name}* vs @${String(match.p2).split("@")[0]} *${m2Name}*`,
        mentions: [match.p1, match.p2],
      });
    }
  }
  return;
}

// .ready  — war ready (falls through to raid ready if sender isn't in a war)
if (command === "ready") {
  const inWar = !!fEngine.war?.participants?.find?.(x => x.id === senderId);
  if (inWar) {
    const result = fEngine.markReady(senderId);
    if (!result.ok) return sock.sendMessage(chatId, { text: `❌ ${result.msg}` }, { quoted: msg });

    if (result.bothReady) {
      const match = fEngine.getActiveMatch();
      const ready1 = players[match.p1]?.username || '???';
      const ready2 = players[match.p2]?.username || '???';
      return sock.sendMessage(chatId, {
        text:
          `⚡ *BOTH FIGHTERS READY!*\n\n` +
          `@${String(match.p1).split("@")[0]} *${ready1}* vs @${String(match.p2).split("@")[0]} *${ready2}*\n\n` +
          `_The battle can begin! Use *.battle @opponent* to fight!_\n` +
          `Owner: use *.war winner @user* to report the result.`,
        mentions: [match.p1, match.p2],
      }, { quoted: msg });
    }

    return sock.sendMessage(chatId, { text: "🏁 You're ready! Waiting for your opponent..." }, { quoted: msg });
  }
  // not in war → fall through; the raid-ready handler later will pick it up
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

      // ============================
      // CORE COMMANDS
      // ============================
      if (command === "ping") {
        const t0 = Number(msg?.messageTimestamp || 0) * 1000;
        const ms = t0 ? Math.max(0, Date.now() - t0) : 0;
        return sock.sendMessage(chatId, {
          text:
            `🏓 *Pong.*\n` +
            `⏱️ Response: *${ms}ms*\n\n` +
            `_Star is online._`,
        }, { quoted: msg });
      }

      if (command === "menu") {
        // Redirect to the new help system
        return sendButtons(sock, chatId, helpUI.buildMainMenuText(players[senderId]), ["🎮 Game Menu", "🛡️ Bot Menu"], { footer: "Tap a section or type .help-game / .help-bot", quoted: msg });
      }
      if (command === "update" || command === "updates") {
        return updatesSystem.cmdUpdate(ctx, chatId, msg);
      }
      if (command === "update-release" || command === "release-update") {
        return updatesSystem.cmdUpdateRelease(ctx, chatId, msg, args, isOwner);
      }

      // ── Track activity for robbery auto-defense odds ──
      try {
        const _p = players[senderId];
        if (_p) { _p.lastCmdAt = Date.now(); }
      } catch {}

      // ── Achievement unlock tick ──
      // After every command, check whether anything just qualified. If so,
      // pay out the rewards (handled inside checkAchievements) and post a
      // notification card per unlock.
      try {
        const _pa = players[senderId];
        if (_pa) {
          const earned = checkAchievements(_pa);
          if (earned && earned.length) {
            savePlayers(players);
            (async () => {
              for (const key of earned) {
                const ach = ACHIEVEMENTS[key];
                if (!ach) continue;
                const rewardLines = [];
                if (ach.reward?.lucons) rewardLines.push(`💰 +${ach.reward.lucons.toLocaleString()} Lucons`);
                if (ach.reward?.lcr)    rewardLines.push(`💠 +${ach.reward.lcr} Lucrystals`);
                if (ach.reward?.items) {
                  for (const [iid, q] of Object.entries(ach.reward.items)) {
                    rewardLines.push(`🎁 +${q}× ${iid}`);
                  }
                }
                rewardLines.push(`🔮 +${ach.aura || 0} Aura (passive while equipped)`);
                try {
                  await sock.sendMessage(chatId, {
                    text:
                      `🏅 *ACHIEVEMENT UNLOCKED*\n\n` +
                      `${ach.icon} *${ach.title}*\n` +
                      `_${ach.desc}_\n\n` +
                      `*Rewards:*\n${rewardLines.join("\n")}\n\n` +
                      `_Use *.equip ${key}* to display this title on your *.rank* card._`,
                    mentions: [senderId],
                  });
                } catch {}
              }
            })();
          }
        }
      } catch {}

      // ── Rank-up reveal tick ──
      // After any command, if the player's level pushed them into a new
      // rank tier since we last saw them, fire the reveal canvas in this
      // chat. Marker is stamped on the player so it never double-fires.
      try {
        const _p2 = players[senderId];
        if (_p2) {
          const promo = ranksSystem.checkRankUpTick(_p2);
          if (promo) {
            (async () => {
              try {
                const card = await generateRankUpCard(_p2, promo.oldRank, promo.newRank);
                await sock.sendMessage(chatId, {
                  image: card,
                  caption: `🎉 *${_p2.username || "Lumorian"}* ascended to *${promo.newRank.name}*!`,
                  mentions: [senderId],
                });
              } catch (e) {
                console.log("[rank-up reveal]", e?.message || e);
                await sock.sendMessage(chatId, {
                  text: `🎉 *${_p2.username || "Lumorian"}* — RANK UP!\n\n*${promo.oldRank.name}* → *${promo.newRank.name}* (Lv ${_p2.level})`,
                  mentions: [senderId],
                });
              }
              try { savePlayers(players); } catch {}
            })();
          }
        }
      } catch {}

      // ── KO lockout — robber knocked unconscious by a defender ──
      if (robberySystem.isKnockedOut(senderId) > 0) {
        const left = robberySystem.isKnockedOut(senderId);
        return sock.sendMessage(chatId, {
          text: `💫 You're still knocked out cold. Recover in *${Math.ceil(left / 60000)} min* before issuing commands.`,
        }, { quoted: msg });
      }

      // ── BANK ──
      if (command === "bank") {
        return bankSystem.cmdBank(ctx, chatId, senderId, msg, args);
      }
      if (command === "bank-tax" || command === "banktax") {
        return bankSystem.cmdBankTax(ctx, chatId, msg, args, isOwner, senderId);
      }
      if (command === "bank-assign" || command === "bankassign") {
        return bankSystem.cmdBankAssign(ctx, chatId, senderId, msg, args, isOwner, { getMentionedJids, getRepliedJid, normJid });
      }
      if (command === "bank-remove" || command === "bankremove" || command === "bank-dismiss") {
        return bankSystem.cmdBankRemove(ctx, chatId, msg, isOwner);
      }
      if (command === "bank-pool" || command === "bankpool") {
        return bankSystem.cmdBankPool(ctx, chatId, msg, isOwner, senderId);
      }
      if (command === "bank-grant" || command === "bankgrant") {
        return bankSystem.cmdBankGrant(ctx, chatId, senderId, msg, args, isOwner, { getMentionedJids, getRepliedJid, normJid });
      }
      if (command === "bank-vault" || command === "bankvault" || command === "vault-audit") {
        return bankSystem.cmdBankVault(ctx, chatId, msg, isOwner, senderId);
      }
      // PUBLIC: Alverah portrait + welcome / registration card
      // Anyone can run this — it's the bank's storefront.
      if (command === "main-bank" || command === "mainbank") {
        const s = bankSystem.loadBankSettings();
        const p = players[senderId] || null;
        if (p) bankSystem.ensureBank(p);
        const registered = !!(p && p.bankRegistered);

        const ownerHandle = s.bankOwnerJid ? String(s.bankOwnerJid).split("@")[0] : null;
        const ownerLine = ownerHandle
          ? `Steward: *${s.bankOwnerName || "Alverah"}* (@${ownerHandle})`
          : `Steward: *${s.bankOwnerName || "Alverah"}* (Architect rules direct)`;

        const taxBracketLines = [
          "  • <500L total       —  0%",
          "  • 500-2k             —  1%",
          "  • 2k-10k             —  3%",
          "  • 10k-50k            —  5%",
          "  • 50k-200k           —  8%",
          "  • >200k              —  12%",
        ].join("\n");

        const depositTaxLine = s.depositTaxOn
          ? `🟢 Deposit tax: *ON* @ ${s.depositTaxPct}%`
          : `⚪ Deposit tax: *OFF*`;

        const statusBlock = registered
          ? `✅ You are *registered* — vault active.\n` +
            `💼 Wallet: *${(p.lucons || 0).toLocaleString()}L*\n` +
            `🏦 Vault: *${(p.bankBalance || 0).toLocaleString()}L*`
          : `⚠️ You're *not registered* with the bank yet.\n` +
            `Run *.bank register* to open a vault (free).`;

        const caption =
          ui.header('THE MAIN BANK', '🏦') + '\n' +
          `${ownerLine}\n\n` +
          `_"Coin trusted to stone never bleeds in the alley."_\n\n` +
          ui.subheader('YOUR STATUS', '📜') + '\n' +
          `${statusBlock}\n\n` +
          ui.subheader('TAX POLICY', '💸') + '\n' +
          `${depositTaxLine}\n\n` +
          `_Claim tax (auto, on .daily / .weekly while banked):_\n` +
          `${taxBracketLines}\n\n` +
          ui.subheader('COMMANDS', '📖') + '\n' +
          `• ${'.bank register'} — open a vault\n` +
          `• ${'.bank deposit <amt>'} / ${'.bank withdraw <amt>'}\n` +
          `• ${'.bank'} — your balances\n` +
          `• ${'.wealth'} — wealth ledger card`;

        try {
          // Public card uses Alverah's image only — no internal numbers.
          const card = await generateAlverahCard({
            ownerName: s.bankOwnerName || "Alverah",
            ownerHandle,
            totalBanked: 0,        // hidden from public card
            depositors: 0,
            taxPool: 0,
            depositTaxOn: !!s.depositTaxOn,
            depositTaxPct: Number(s.depositTaxPct || 0),
            claimTaxNote: "Coin trusted to stone never bleeds in the alley.",
            topVault: { name: "—", amount: 0 },
            publicMode: true,
          });
          await sock.sendMessage(chatId, {
            image: card,
            caption,
            mentions: s.bankOwnerJid ? [s.bankOwnerJid] : [],
          }, { quoted: msg });
        } catch (e) {
          console.log("[main-bank]", e?.message || e);
          await sock.sendMessage(chatId, {
            text: caption,
            mentions: s.bankOwnerJid ? [s.bankOwnerJid] : [],
          }, { quoted: msg });
        }
        return;
      }

      // PRIVATE: full internal ledger canvas — Architect or Bank Owner only.
      // Same Alverah image but the caption surfaces total banked, tax pool,
      // depositors, top vault, etc.
      if (command === "bank-info" || command === "bankinfo" || command === "main-bank-info") {
        const s = bankSystem.loadBankSettings();
        if (!isOwner && !bankSystem.isBankOwner(senderId)) {
          return sock.sendMessage(chatId, {
            text: "❌ Only the Architect or Bank Owner can view the internal ledger. Try *.main-bank* for the public view.",
          }, { quoted: msg });
        }
        let totalBanked = 0, depositors = 0;
        let topName = "—", topAmt = 0;
        for (const [, _p] of Object.entries(players)) {
          const b = Number(_p?.bankBalance || 0);
          if (b > 0) {
            totalBanked += b;
            depositors++;
            if (b > topAmt) { topAmt = b; topName = _p.username || "Anonymous"; }
          }
        }
        const ownerHandle = s.bankOwnerJid ? String(s.bankOwnerJid).split("@")[0] : null;
        try {
          const card = await generateAlverahCard({
            ownerName: s.bankOwnerName || "Alverah",
            ownerHandle,
            totalBanked,
            depositors,
            taxPool: Number(s.totalTaxPool || 0),
            depositTaxOn: !!s.depositTaxOn,
            depositTaxPct: Number(s.depositTaxPct || 0),
            claimTaxNote: "Wealthier Lumorians pay a larger cut on every .daily / .weekly when banked.",
            topVault: { name: topName, amount: topAmt },
            publicMode: false,
          });
          await sock.sendMessage(chatId, {
            image: card,
            caption:
              `🏛️ *INTERNAL BANK LEDGER*\n\n` +
              `Steward: *${s.bankOwnerName || "Alverah"}*${ownerHandle ? ` (@${ownerHandle})` : ""}\n` +
              `📦 Total banked: *${totalBanked.toLocaleString()}L*\n` +
              `🏛️ Tax pool: *${(s.totalTaxPool || 0).toLocaleString()}L*\n` +
              `👥 Depositors: *${depositors}*\n` +
              `🥇 Top vault: *${topName}* — ${topAmt.toLocaleString()}L\n` +
              `${s.depositTaxOn ? `🟢 Deposit tax: ON @ ${s.depositTaxPct}%` : "⚪ Deposit tax: OFF"}`,
            mentions: s.bankOwnerJid ? [s.bankOwnerJid] : [],
          }, { quoted: msg });
        } catch (e) {
          console.log("[bank-info]", e?.message || e);
          await sock.sendMessage(chatId, {
            text:
              `🏛️ *INTERNAL BANK LEDGER*\n\n` +
              `Steward: *${s.bankOwnerName || "Alverah"}*${ownerHandle ? ` (@${ownerHandle})` : ""}\n` +
              `📦 Total banked: *${totalBanked.toLocaleString()}L*\n` +
              `🏛️ Tax pool: *${(s.totalTaxPool || 0).toLocaleString()}L*\n` +
              `👥 Depositors: *${depositors}*`,
          }, { quoted: msg });
        }
        return;
      }

      // ── ROBBERY ──
      if (command === "rob" || command === "snatch") {
        return robberySystem.cmdRob(ctx, chatId, senderId, msg, args, { getMentionedJids, getRepliedJid });
      }
      if (command === "defend") {
        return robberySystem.cmdDefend(ctx, chatId, senderId, msg);
      }

      // ── RANK ──
      if (command === "rank") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using *.begin*." }, { quoted: msg });
        try {
          const card = await generateRankCard(p);
          await sock.sendMessage(chatId, {
            image: card,
            caption: `🎖️ *${ranksSystem.rankForLevel(p.level || 1).name}* — Lv ${p.level || 1}`,
          }, { quoted: msg });
        } catch (e) {
          console.log("[rank-card]", e?.message || e);
          const r = ranksSystem.rankForLevel(p.level || 1);
          await sock.sendMessage(chatId, {
            text: `🎖️ *${r.name}* — Lv ${p.level || 1}\n_(rank card render failed — text fallback)_`,
          }, { quoted: msg });
        }
        return;
      }
      // ── WEALTH ──
      if (command === "wealth") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using *.begin*." }, { quoted: msg });
        bankSystem.ensureBank(p);
        const { position, total } = findWealthRank(players, senderId);
        try {
          const card = await generateWealthCard(p, position, total);
          await sock.sendMessage(chatId, {
            image: card,
            caption: `💰 *${p.username || "Lumorian"}* — wealth ledger`,
          }, { quoted: msg });
        } catch (e) {
          console.log("[wealth-card]", e?.message || e);
          const wallet = (p.lucons || 0).toLocaleString();
          const bank = (p.bankBalance || 0).toLocaleString();
          const tot = ((p.lucons || 0) + (p.bankBalance || 0)).toLocaleString();
          const rank = position ? `#${position} / ${total}` : "Unranked";
          await sock.sendMessage(chatId, {
            text: `💰 *WEALTH LEDGER*\n\n💼 Wallet: *${wallet}L*\n🏦 Bank: *${bank}L*\n💎 Total: *${tot}L*\n📊 Wealth Rank: *${rank}*`,
          }, { quoted: msg });
        }
        return;
      }
      if (command === "wealth-lb" || command === "wealthlb" || command === "wlb") {
        const sorted = buildWealthLb(players).slice(0, 10);
        if (!sorted.length) {
          return sock.sendMessage(chatId, { text: "💰 No Lumorians have any Lucons yet." }, { quoted: msg });
        }
        const lines = sorted.map((e, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
          return `${medal}  *${e.username}*  —  ${e.total.toLocaleString()}L`;
        });
        return sock.sendMessage(chatId, {
          text: `💎 *WEALTH LEADERBOARD*\n_Top 10 by total (wallet + bank)_\n\n${lines.join("\n")}`,
        }, { quoted: msg });
      }

      // ── PROFILE MASK ──
      if (command === "mask") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using *.begin*." }, { quoted: msg });
        const inv = p.inventory || {};
        if (Number(inv.PROFILE_MASK || 0) <= 0) {
          return sock.sendMessage(chatId, {
            text: "❌ You need a *Veil Mask* (regular market — 3,500L) to mask your profile.",
          }, { quoted: msg });
        }
        p.profileMasked = true;
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text: "🎭 *Veil Mask equipped.* Your profile is hidden from prying eyes.\n\n_Use *.unmask* to remove._",
        }, { quoted: msg });
      }
      if (command === "unmask") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using *.begin*." }, { quoted: msg });
        if (!p.profileMasked) {
          return sock.sendMessage(chatId, { text: "🪞 You're not masked." }, { quoted: msg });
        }
        p.profileMasked = false;
        savePlayers(players);
        return sock.sendMessage(chatId, { text: "🪞 *Veil removed.* Your profile is visible again." }, { quoted: msg });
      }

      if (command === "ranks") {
        const lines = ranksSystem.RANKS.map(r => {
          const range = r.max >= 9999 ? `Lv ${r.min}+` : `Lv ${r.min}–${r.max}`;
          return `┃ *${r.name}*  —  ${range}`;
        });
        return sock.sendMessage(chatId, {
          text:
            `🏆 *RANK LADDER*\n\n` +
            lines.join("\n") +
            `\n\n_Use *.rank* to see your card._`,
        }, { quoted: msg });
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

      // ============================
      // M1 COMBAT LOCK — deny out-of-battle actions mid-fight.
      // One shared check (wildbattle + PvP); kills the heal/invest/
      // awaken/shed/trade/storage/open exploit cluster. (M1, L-01..L-04)
      // ============================
      const lock = (action) => {
        const denied = combatLockSystem.denyIfInCombat(chatId, senderId, action);
        return denied
          ? sock.sendMessage(chatId, { text: denied.text }, { quoted: msg })
          : null;
      };

      // ============================
      // SHARD / MERGE SYSTEM (v0.5.0 rework)
      // ============================
      if (command === "shards" || command === "shard" || command === "vault") {
        return shardSystem.cmdShards(ctx, chatId, senderId, msg);
      }
      if (command === "choose-shard" || command === "chooseshard") {
        return shardSystem.cmdChooseShard(ctx, chatId, senderId, msg, args);
      }
      if (command === "choose-style" || command === "choosestyle") {
        return questSystem.cmdChooseStyle(ctx, chatId, senderId, msg, args);
      }
      if (command === "awaken" || command === "equip-shard" || command === "equipshard") {
        const denied = lock("awaken (merge forms)"); if (denied) return denied;
        return shardSystem.cmdAwaken(ctx, chatId, senderId, msg, args);
      }
      if (command === "shed" || command === "unmerge") {
        const denied = lock("shed (drop merge)"); if (denied) return denied;
        return shardSystem.cmdShed(ctx, chatId, senderId, msg);
      }
      if (command === "merge") {
        const denied = lock("merge"); if (denied) return denied;
        // Retired in v0.5.0 — soft-alias users back to .awaken
        return shardSystem.cmdLegacyMerge(ctx, chatId, senderId, msg, args);
      }
      if (command === "trade") {
        const denied = lock("trade"); if (denied) return denied;
        return shardSystem.cmdTrade(ctx, chatId, senderId, msg, args, {
          getMentionedJids,
        });
      }
      if (command === "storage" || command === "shardstorage") {
        const denied = lock("change shard storage"); if (denied) return denied;
        return shardSystem.cmdStorage(ctx, chatId, senderId, msg, args);
      }
      if (command === "purify") {
        // The wild-battle Harmony rite (.purify on a defeated Mora) ALSO uses
        // this command. If there's a pending wild-battle decision for this
        // player, fall through so the wildbattle dispatcher catches it.
        const wbState = wildBattleSystem.getWildBattle?.(chatId, senderId);
        if (!wbState?.pendingDecision) {
          return shardSystem.cmdPurify(ctx, chatId, senderId, msg, args);
        }
      }
      if (command === "destroy") {
        return shardSystem.cmdDestroy(ctx, chatId, senderId, msg, args);
      }
      if (command === "quests") {
        return questSystem.cmdQuests(ctx, chatId, senderId, msg);
      }
      if (command === "quest") {
        return questSystem.cmdQuest(ctx, chatId, senderId, msg, args);
      }
      if (command === "styles") {
        return questSystem.cmdStyles(ctx, chatId, senderId, msg);
      }
      if (command === "style") {
        // .style <name> — style deep-dive with art (assets/styles/<id>.png)
        return questSystem.cmdStyleDetail(ctx, chatId, senderId, msg, args);
      }
      if (command === "equip-style" || command === "equipstyle") {
        // .equip-style <name> — switch the ONE style active in combat
        return questSystem.cmdEquipStyle(ctx, chatId, senderId, msg, args);
      }
      if (command === "testkit") {
        // 🧪 TEST MODE only — free tester wallet + starter items
        return testModeSystem.cmdTestKit(ctx, chatId, senderId, msg);
      }
      if (command === "meeting" || command === "mnotes") {
        // 📋 save & recall meeting decisions (owner-only)
        if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
        return meetingsSystem.cmdMeeting(ctx, chatId, senderId, msg, args);
      }
      if (command === "stats" || command === "stat") {
        return statSystem.cmdStats(ctx, chatId, senderId, msg, args);
      }
      if (command === "invest") {
        const denied = lock("invest stat points"); if (denied) return denied;
        return statSystem.cmdStatsInvest(ctx, chatId, senderId, msg, args);
      }
      if (command === "gift" || command === "apology") {
        return apologySystem.cmdGift(ctx, chatId, senderId, msg, args);
      }
      if (command === "scrolls") {
        return scrollSystem.cmdScrolls(ctx, chatId, senderId, msg);
      }
      if (command === "open") {
        const denied = lock("open scrolls"); if (denied) return denied;
        return scrollSystem.cmdOpen(ctx, chatId, senderId, msg, args);
      }
      if (command === "whisper") {
        return questSystem.cmdWhisper(ctx, chatId, senderId, msg, args);
      }
      // ── Auto-raids (v0.7.0) ─────────────────────────────────
      if (command === "respond") {
        return autoRaidSystem.cmdRespond(ctx, chatId, senderId, msg, args);
      }
      if (command === "engage") {
        return autoRaidSystem.cmdEngage(ctx, chatId, senderId, msg);
      }
      if (command === "raid-status" || command === "raidstatus") {
        return autoRaidSystem.cmdRaidStatus(ctx, chatId, senderId, msg);
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

  // 1. Check for Active Duel (Global) — M1: real combat lock now reads
  // the live wildbattle/PvP state instead of the never-set p.inBattle flag.
  const denied = combatLockSystem.denyIfInCombat(chatId, senderId, "heal");
  if (denied) {
    return sock.sendMessage(chatId, { text: denied.text }, { quoted: msg });
  }

  // 2. Check for Active Hunt (Global)
  // 0.1.3 — was checking the never-set p.activeHunt flag, so heal worked
  // mid-hunt and trivialised exploration. Now reads the real hunt-state
  // location: anything other than "capital" means you're out in the wild.
  try {
    const huntState = require("./systems/hunting").loadHuntState();
    const hunter = huntState?.players?.[senderId];
    const loc = hunter?.location || "capital";
    if (loc !== "capital" || hunter?.activeEncounter || hunter?.pendingTravel) {
      return sock.sendMessage(chatId, {
        text: "❌ *STAMINA LOCKED*\n\nYou are currently in the wild. Use *.return* to head back to the Capital before healing.",
      });
    }
  } catch {}

  // 3. If they are safe, run the heal
  return healSystem.cmdHeal(ctx, chatId, senderId);
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });

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
  if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
  
  const p = players[senderId];
  const cost = 200;

  // Assuming you store currency as p.lucons. Adjust if it's named differently!
  if ((p.lucons || 0) < cost) {
    return sock.sendMessage(chatId, { text: `❌ You need at least ${cost} Lucons to view the global intel.` });
  }

  // Deduct Lucons
  p.lucons -= cost;
  savePlayers(players);

  // Read from factionProgressSystem — single source of truth
  const factionData = factionProgressSystem.loadFactions();
  const pts = { harmony: factionData.harmony.points, purity: factionData.purity.points, rift: factionData.rift.points };
  let leader = "Harmony";
  let max = pts.harmony;
  if (pts.purity > max) { leader = "Purity"; max = pts.purity; }
  if (pts.rift > max) { leader = "Rift"; max = pts.rift; }

  // Season number from factionState (season metadata stays in faction_state.json)
  const seasonNum = factionState.season || 1;
  const rewardPool = factionState.rewards?.lucons || 1000;
  const style = factionState.style || "classic";

  const caption = 
    `📊 *SEASON ${seasonNum} INTEL* 📊\n${DIVIDER}\n` +
    `🏆 *Current Leader:* ${leader}\n` +
    `💰 *Reward Pool:* ${rewardPool} Lucons to all winners\n\n` +
    `_200 Lucons were deducted from your account to access this terminal._`;

  // Generate Image
  const imageBuffer = await generateFactionGraph(pts, seasonNum, style);

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

// ==========================================
// 💋 STAR COMMANDS
// ==========================================
if (command === "star-on") {
  if (!isOwner) return;
  return starSystem.cmdStarOn(ctx, chatId, msg);
}
if (command === "star-off") {
  if (!isOwner) return;
  return starSystem.cmdStarOff(ctx, chatId, msg);
}
if (command === "star-mode") {
  if (!isOwner) return;
  return starSystem.cmdStarMode(ctx, chatId, msg, args);
}
if (command === "star-stats") {
  if (!isOwner) return;
  return starSystem.cmdStarStats(ctx, chatId, msg);
}
if (command === "star-reset") {
  if (!isOwner) return;
  return starSystem.cmdStarReset(ctx, chatId, msg, args);
}
if (command === "star-ping") {
  if (!isOwner) return;
  return starSystem.cmdStarPing(ctx, chatId, msg, args);
}
if (command === "star-bestie") {
  if (!isOwner) return;
  return starSystem.cmdStarBestie(ctx, chatId, msg, args);
}
if (command === "gift-star") {
  const amount = parseInt(args[0], 10);
  return starSystem.receiveGift(ctx, chatId, senderId, msg, amount);
}
if (command === "orders") {
  if (!isOwner) return;
  return starSystem.cmdListOrders(ctx, chatId, msg);
}
if (command === "order-del") {
  if (!isOwner) return;
  return starSystem.cmdRemoveOrder(ctx, chatId, msg, args);
}

if (command === "addfacpts") {
  if (!isOwner) return;
  const fac = args[0]?.toLowerCase();
  const amt = parseInt(args[1]);
  
  if (!fac || !["harmony","purity","rift"].includes(fac) || isNaN(amt)) {
    return sock.sendMessage(chatId, { text: "Use: .addfacpts harmony/purity/rift 500" });
  }
  
  // Delegate to factionProgressSystem — single source of truth
  factionProgressSystem.addFactionPoints(fac, amt);
  // Sync factionState.points for the graph/season metadata
  const factionData = factionProgressSystem.loadFactions();
  factionState.points = { harmony: factionData.harmony.points, purity: factionData.purity.points, rift: factionData.rift.points };
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

  // Read points from factionProgressSystem — single source of truth
  const factionData = factionProgressSystem.loadFactions();
  const pts = { harmony: factionData.harmony.points, purity: factionData.purity.points, rift: factionData.rift.points };
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

  // 🔄 Reset Season via factionProgressSystem (resets faction points + records win)
  factionProgressSystem.endSeason();
  // Bump season number in factionState (season metadata stays here)
  factionState.season = (factionState.season || 1) + 1;
  // Sync factionState.points from factionProgressSystem (now zeroed)
  const freshData = factionProgressSystem.loadFactions();
  factionState.points = { harmony: freshData.harmony.points, purity: freshData.purity.points, rift: freshData.rift.points };
  saveFactionState(factionState);

  // 📢 Announce to the chat
  return sock.sendMessage(chatId, {
    text: `🎉 *L U M O R A  •  S E A S O N   E N D E D* 🎉\n${DIVIDER}\n` +
          `🏆 The victorious faction is *${titleCase(winner)}* with ${max} points!\n\n` +
          `💰 Distributed *${reward} Lucons* to ${winnersCount} loyal members.\n\n` +
          `Welcome to Season ${factionState.season}! The board has been wiped clean. Let the new hunt begin!`
  });
}
if (command === "resetseason") {
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." });

  // Wipe points via factionProgressSystem — single source of truth
  factionProgressSystem.resetPoints();
  // Sync factionState.points
  factionState.points = { harmony: 0, purity: 0, rift: 0 };
  saveFactionState(factionState);

  return sock.sendMessage(chatId, {
    text: `🧹 *SEASON RESET* — faction points wiped to 0.\nThe hunt begins anew.`,
  });
}
      // ============================
      // USERNAME
      // ============================
      if (command === "set-username") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });

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
          entry.meta.prevTitle = String(players[tId].title || "");
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
      // ── .begin — Star's intro ──────────────────────────────
      if (command === "begin") {
        if (players[senderId]) {
          const p = players[senderId];
          return sock.sendMessage(chatId, {
            text: `🌟 *Welcome back, ${p.username || 'Lumorian'}!*

You're already registered. Use ${PREFIX}profile to check your stats!`,
            mentions: [senderId],
          });
        }
        return sock.sendMessage(chatId, {
          text: [
            ui.header('LUMORA', '🌌'),
            '',
            ui.subheader('STAR', '✨'),
            '',
            'Hey there, traveler... 👋',
            '',
            'I\'m *Star* — your guide through',
            'the world of *Lumora*.',
            '',
            'The Rift hums softly. Somewhere out',
            'there, *Mora* are waiting to be found, ',
            'factions are waging quiet wars, and',
            'old legends are being rewritten.',
            '',
            'But every legend starts with a',
            'single step.',
            '',
            ui.card('YOUR JOURNEY', '🚀', [
              { emoji: '1️⃣', label: 'Register', value: 'choose your identity' },
              { emoji: '2️⃣', label: 'Explore', value: 'find your faction & Mora' },
              { emoji: '3️⃣', label: 'Grow', value: 'battle, hunt, and rise' },
            ]),
            '',
            `_Type ${PREFIX}register to take that first step 👇`,
          ].join('\n'),
          mentions: [senderId],
        });
      }

      // ── .register — Start guided onboarding ────────────────
      if (command === "register") {
        if (players[senderId]) {
          const p = players[senderId];
          return sock.sendMessage(chatId, {
            text: `🌟 You're already registered, *${p.username || 'Lumorian'}*! ✅\n\nUse ${PREFIX}profile to check your stats.`,
            mentions: [senderId],
          });
        }

        // Create player and start guided onboarding at username step
        const phoneNum = senderId.split('@')[0];
        players[senderId] = {
          username: phoneNum,
          id: senderId,
          level: 1,
          xp: 0,
          lucons: 350,
          rank: "Trainee",
          title: "",
          intelligence: 5,
          aura: 10,
          tameSkill: 5,
          playerMaxHp: 100,
          playerHp: 100,
          faction: null,
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
          onboardingStep: "username",
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

        // Show Star's first guided prompt
        return sock.sendMessage(chatId, {
          text: onboardingSystem.stepMessage('username', {}),
          mentions: [senderId],
        }, { quoted: msg });
      }

      // ── .start — legacy alias for .begin ───────────────────
      if (command === "start") {
        // Redirect to .begin
        command = "begin";
        // Re-enter the begin handler above by falling through
        // (we already handled it, so just return)
        if (players[senderId]) {
          const p = players[senderId];
          return sock.sendMessage(chatId, {
            text: `🌟 *Welcome back, ${p.username || 'Lumorian'}!*\n\nUse ${PREFIX}profile to check your stats!`,
            mentions: [senderId],
          });
        }
        return sock.sendMessage(chatId, {
          text: [
            ui.header('LUMORA', '🌌'),
            '',
            '╔═══════════════════════╗',
            '║  ✨ *I am STAR* ✨    ║',
            '╚═══════════════════════╝',
            '',
            'Hey there, stranger... 👋',
            '',
            'I\'m *Star* — your guide through',
            'the world of *Lumora*.',
            '',
            `Type ${PREFIX}register to begin 👇`,
          ].join('\n'),
          mentions: [senderId],
        });
      }

      // ================= REFERRAL COMMANDS =================

      // .myref — get or create your referral code
      if (command === "myref") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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

      // ================= OWNER: SET / FIX FACTION =================
      // 0.1.3 — added to repair players mis-stamped by the swapped invite-map
      // bug (purity-choosers were getting tagged rift). Use:
      //   .set-faction @user <harmony|purity|rift|none>
      // Owner / right-hand only.
      if (command === "set-faction" || command === "setfaction" || command === "fix-faction") {
        if (!isOwner && !isRightHand) return;
        const targets = getMentionedJids(msg);
        const repliedTo = getRepliedJid(msg);
        const targetJid = targets[0] || repliedTo || (args[0] && toUserJidFromArg(args[0]));
        const factionArg = String(args[args.length - 1] || "").trim().toLowerCase();
        if (!targetJid || !["harmony", "purity", "rift", "none"].includes(factionArg)) {
          return sock.sendMessage(chatId, {
            text: "Usage: *.set-faction @user <harmony|purity|rift|none>*\nReply to a user or mention them.",
          }, { quoted: msg });
        }
        const tNorm = normJid(targetJid);
        const target = players[tNorm];
        if (!target) {
          return sock.sendMessage(chatId, { text: "❌ That user isn't registered." }, { quoted: msg });
        }
        const before = target.faction || "none";
        target.faction = factionArg === "none" ? null : factionArg;
        if (factionArg === "none") {
          target.joinedFactionGroup = false;
        } else {
          target.joinedFactionGroup = true;
          // refresh starter options if they haven't picked yet
          if (!target.starterChosen) {
            try {
              target.starterOptions = pickStarterOptionsByFaction(moraList, target.faction);
            } catch {}
          }
        }
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text:
            `✅ *Faction repaired.*\n\n` +
            `Player: @${tNorm.split("@")[0]}\n` +
            `Was: *${before}*\n` +
            `Now: *${factionArg}*`,
          mentions: [tNorm],
        }, { quoted: msg });
      }

      // ================= FACTION PICK =================
      // ── .username — set display name ──────────────────────
      if (command === "username" || command === "name") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
        const p = players[senderId];
        const newName = args.join(' ').trim();
        if (!newName) {
          return sock.sendMessage(chatId, {
            text: `📝 *Set your username*\n\nUsage: ${PREFIX}username <name>\n\nCurrent: *${p.username || 'Not set'}*`,
            mentions: [senderId]
          });
        }
        if (newName.length < 2 || newName.length > 20) {
          return sock.sendMessage(chatId, { text: "❌ Username must be 2-20 characters.", mentions: [senderId] });
        }
        p.username = newName;
        // If in onboarding, advance to gender step
        if (p.onboardingStep === 'username') {
          p.onboardingStep = 'gender';
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text: `✅ Username set to *${newName}*!\n\n` + onboardingSystem.stepMessage('gender', { username: newName }),
            mentions: [senderId]
          }, { quoted: msg });
        }
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text: `✅ Username updated to *${newName}*!`,
          mentions: [senderId]
        });
      }

      // ── .set-icon — set profile icon from image ────────────
      if (command === "set-icon" || command === "seticon" || command === "icon") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
        
        // Check for image in message or quoted message
        const rawMsg = unwrapMessage ? unwrapMessage(msg) : msg;
        const hasImage = rawMsg?.message?.imageMessage 
          || rawMsg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        
        if (!hasImage) {
          return sock.sendMessage(chatId, {
            text: `📸 *Set your profile icon*\n\nSend an image with ${PREFIX}set-icon as the caption,\nor reply to an image with ${PREFIX}set-icon`,
            mentions: [senderId]
          });
        }
        
        try {
          const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
          const buffer = await downloadMediaMessage(
            { message: rawMsg.message, key: msg.key },
            'buffer', {}
          );
          const iconDir = path.join(__dirname, 'data', 'icons');
          if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });
          const iconPath = path.join(iconDir, `${senderId}.jpg`);
          fs.writeFileSync(iconPath, buffer);
          players[senderId].profileIcon = iconPath;
          // If in onboarding, advance to faction step
          if (players[senderId].onboardingStep === 'icon') {
            players[senderId].onboardingStep = 'faction';
            savePlayers(players);
            return sock.sendMessage(chatId, {
              text: `✅ Profile icon updated!\n\n` + onboardingSystem.stepMessage('faction', { username: players[senderId].username }),
              mentions: [senderId]
            }, { quoted: msg });
          }
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text: `✅ Profile icon updated!`,
            mentions: [senderId]
          });
        } catch (e) {
          console.log('[set-icon] error:', e.message);
          return sock.sendMessage(chatId, { text: '❌ Failed to save image. Try again.' });
        }
      }

      if (command === "faction") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
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

// 0.1.3 — derived from FACTION_INVITE_MAP at the top of this file so the
// DM link can never disagree with the resolver again. Previously these two
// maps had purity/rift codes swapped, which sent purity-choosers into the
// rift group and the welcome handler stamped them as rift for life.
const FACTION_GROUPS = (() => {
  const out = {};
  for (const [code, faction] of Object.entries(FACTION_INVITE_MAP)) {
    if (faction === "none") continue;
    out[faction] = `https://chat.whatsapp.com/${code}`;
  }
  return out;
})();

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

// If in onboarding, advance to mora step
if (p.onboardingStep === 'faction') {
  p.onboardingStep = 'done';
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text: onboardingSystem.stepMessage('complete', { username: p.username }),
    mentions: [senderId],
  }, { quoted: msg });
}

return sock.sendMessage(chatId, {
  text:
    `✅ Joined *${FACTIONS[key].name}* — 📩 DM sent with your faction group link\n` +
    `⚠ Join the group, then *.choose* your starter`
});
      }
      // ================= CHOOSE STARTER =================
if (command === "choose") {
  if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
  
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
    const labelToCmd = {};
    starters.forEach((m, i) => {
      labelToCmd[`${i + 1}. ${m.name}`] = `${PREFIX}choose ${i + 1}`;
    });
    buttonsSystem.mapButtons(labelToCmd);
    const detail = starters
      .map((m, i) => `${i + 1}. *${m.name}* [${m.type.toUpperCase()}] — _${m.description || "A mysterious Mora."}_`)
      .join("\n");
    return sendButtons(sock, chatId,
      `🐾 *CHOOSE YOUR STARTER* — _${p.faction} path_\n${detail}\n\n👉 Tap below 👇`,
      starters.map((m, i) => `${i + 1}. ${m.name}`),
      { footer: `Or type: ${PREFIX}choose <name>`, quoted: msg }
    );
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
    moraId: Number(selectedMora.id), // Assign the mora ID
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

  // If in onboarding, show GAME BEGINS and complete
  if (p.onboardingStep === 'mora') {
    p.onboardingStep = 'done';
    savePlayers(players);
    return sock.sendMessage(chatId, {
      text: onboardingSystem.stepMessage('complete', { username: p.username }),
      mentions: [senderId],
    });
  }

  buttonsSystem.mapButtons({ "🥋 Pick a Style": `${PREFIX}choose-style` });
  return sendButtons(sock, chatId,
    `🎉 *CONGRATULATIONS!* — you bonded with *${newMora.name}*!\n\nNext: pick your *fighting style* 👇`,
    ["🥋 Pick a Style"],
    { footer: `Or type: ${PREFIX}choose-style`, quoted: msg, mentions: [senderId] }
  );
}

      // ================= ANIME ART PACK =================
      // 🎴 Every Mora can carry anime art. Custom art (assets/mora) wins,
      // then the art pack (assets/artpack — any source: Kaggle / Danbooru /
      // live fetch), then the live API fills on demand.
      if (command === "artpack" || command === "art-pack") {
        const sub = String(args[0] || "").toLowerCase();

        if (sub === "fetch" || sub === "fill") {
          // Owner can bulk-fetch; testers too (they push the pack in test GCs)
          if (!isOwner && !testModeSystem.isTestGroup(chatId)) {
            return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
          }
          const limit = parseInt(args[1], 10) || 0;
          const s = artpackSystem.getStatus();
          if (!s.missing) return sock.sendMessage(chatId, { text: "❌ Art pack unavailable." }, { quoted: msg });
          await sock.sendMessage(chatId, {
            text: `🎴 *ART PACK — FETCHING*\n${DIVIDER}\n` +
              `Fetching anime art for *${limit > 0 ? Math.min(limit, s.missing) : s.missing}* missing Mora…\n` +
              `_This runs in the background and pings when done._`,
          }, { quoted: msg });
          const res = await artpackSystem.fillMissing({ limit, onProgress: async (p) => {
            // Throttle progress pings so the group isn't spammed
            if (p.done % 10 === 0 || p.done === p.total) {
              try {
                await sock.sendMessage(chatId, { text: `🎴 Progress: *${p.done}/${p.total}*` });
              } catch {}
            }
          } });
          const s2 = artpackSystem.getStatus();
          return sock.sendMessage(chatId, {
            text: `🎴 *ART PACK — DONE*\n${DIVIDER}\n` +
              `✅ Fetched: *${res.fetched}*  ❌ Failed: *${res.failed}*\n` +
              `Now: *${s2.custom}* custom  +  *${s2.pack}* pack  =  *${s2.pack + s2.custom}/${s2.total}* Mora with art` +
              (res.errors.length ? `\n\n⚠️ ${res.errors.join("\n")}` : ""),
          }, { quoted: msg });
        }

        if (sub === "reset" || sub === "clear") {
          if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
          const query = args.slice(1).join(" ").trim();
          if (!query) return sock.sendMessage(chatId, { text: "❌ Use: .artpack reset <mora name or id>" }, { quoted: msg });
          const m = findMora(moraList, normalizePickToIdOrName(query));
          if (!m) return sock.sendMessage(chatId, { text: `❌ Unknown Mora: *${query}*` }, { quoted: msg });
          const removed = artpackSystem.clearArt(m);
          return sock.sendMessage(chatId, {
            text: removed ? `🗑 Cleared *${m.name}*'s pack art (${removed} file${removed > 1 ? "s" : ""}). Next view refetches.` : `*${m.name}* had no cached pack art.`,
          }, { quoted: msg });
        }

        // Default: status panel
        const s = artpackSystem.getStatus();
        if (!s.total) return sock.sendMessage(chatId, { text: "❌ Art pack unavailable." }, { quoted: msg });
        return sock.sendMessage(chatId, {
          text:
            `🎴 *ANIME ART PACK*\n${DIVIDER}\n` +
            `🖼 Custom art (assets/mora): *${s.custom}*\n` +
            `🗂 Pack art (assets/artpack): *${s.pack}*  _(${s.packFiles} files)_\n` +
            `❓ Still missing: *${s.missing}*\n` +
            (s.missingNames.length ? `   ↳ ${s.missingNames.join(", ")}${s.missing > s.missingNames.length ? "…" : ""}\n` : "") +
            `${DIVIDER}\n` +
            `✨ Art = raw anime image. *Tiers* (Common→Legendary) are drawn by Lumora's card design on top.\n` +
            `📦 Pack is source-agnostic — drop Kaggle/Danbooru art into *assets/artpack* as *id_<id>.png* or *<name>.png* and it wins over live.\n` +
            `🔌 Live source: ${s.liveSource}\n` +
            `${DIVIDER}\n` +
            `Commands:\n` +
            `┃ *.artpack fetch* — fill all missing now\n` +
            `┃ *.artpack fetch <n>* — fill first n\n` +
            `┃ *.artpack reset <name>* — clear one (owner)\n` +
            `┃ *.art <name>* — view a Mora's art\n` +
            `┃ *.mora <name>* — bio now shows art too`,
        }, { quoted: msg });
      }

      // .art <name> — show a single Mora's anime art (fetch on demand)
      if (command === "art" || command === "artpic") {
        const query = args.join(" ").trim();
        const m = query ? findMora(moraList, normalizePickToIdOrName(query)) : null;
        if (!m) {
          return sock.sendMessage(chatId, { text: "❌ Use: .art <mora name or id>" }, { quoted: msg });
        }
        // Custom art → pack art → live fetch (cached)
        let p = moraImagePath(m) || artpackSystem.artPathFor(m);
        if (!p) {
          const r = await artpackSystem.fetchArtFor(m);
          if (!r.ok) return sock.sendMessage(chatId, { text: `❌ Couldn't fetch art for *${m.name}*: ${r.reason}` }, { quoted: msg });
          p = r.path;
        }
        const sprite = moraImagePath(m) || p; // custom art still wins for display
        const src = artpackSystem.hasCustomArt(m) ? "custom" : (artpackSystem.artPathFor(m) ? "pack" : "live");
        try {
          return sock.sendMessage(chatId, {
            image: fs.readFileSync(sprite),
            caption: `🎴 *${m.name}* — 💠 ${m.rarity} • ⚡ ${m.type}\n🆔 ID ${m.id}  •  _source: ${src}_`,
          }, { quoted: msg });
        } catch (e) {
          return sock.sendMessage(chatId, { text: `❌ Art render failed: ${e?.message}` }, { quoted: msg });
        }
      }

      // ================= MORA =================
      if (command === "mora") {
        if (!moraList.length) return sock.sendMessage(chatId, { text: "❌ Mora database is empty. Check data/mora.json" });

        const pMora = players[senderId];
        const queryRaw = args.join(" ").trim();
        const query = normalizePickToIdOrName(queryRaw);

        // A Mora is "known" once the player has MET it: dex (wild encounters /
        // awakenings), owns one, holds a shard of it, or is currently merged.
        const isMoraKnown = (mora) => {
          if (!pMora || !mora) return false;
          const id = String(mora.id ?? "");
          if (Array.isArray(pMora.dex) && pMora.dex.includes(id)) return true;
          if (Array.isArray(pMora.moraOwned) && pMora.moraOwned.some((m) => String(m.moraId) === id)) return true;
          const merge = pMora.currentMerge;
          if (merge && (String(merge.moraId) === id || String(merge.name || "") === String(mora.name || ""))) return true;
          const baseKey = String(mora.id ?? mora.name ?? "").toLowerCase();
          return Object.keys(pMora.shards || {}).some((k) => {
            const clean = String(k).toLowerCase().replace(/@corrupted$/, "");
            return clean === baseKey || String(mora.name || "").toLowerCase() === clean;
          });
        };

        // No query → the player's biography collection (only what they've met)
        if (!query) {
          const seen = moraList.filter((m) => isMoraKnown(m));
          if (!seen.length) {
            return sock.sendMessage(chatId, {
              text: ui.header('MORA DEX', '📖') + `\n\n` +
                `_You haven't met any Mora yet._\n\n` +
                `Use *.hunt* / *.travel* to explore the wilds — every encounter unlocks a Mora's biography here.`,
            }, { quoted: msg });
          }
          // Group by type
          const typeEmoji = { fire: '🔥', water: '💧', earth: '🪨', electric: '⚡', grass: '🌿', ice: '❄️', dark: '🌑', light: '✨', wind: '💨', poison: '☠️', psychic: '🔮', dragon: '🐉', normal: '⚪' };
          const grouped = {};
          for (const m of seen) {
            const t = (m.type || 'other').toLowerCase();
            if (!grouped[t]) grouped[t] = [];
            grouped[t].push(m);
          }
          const lines = [];
          lines.push(ui.header('MORA DEX', '📖'));
          lines.push(`  _${seen.length}/${moraList.length} discovered_`);
          lines.push('');
          for (const [type, mora] of Object.entries(grouped)) {
            lines.push(ui.subheader(type.toUpperCase(), typeEmoji[type] || '❓'));
            for (const m of mora) {
              const r = String(m.rarity || '—').toLowerCase();
              lines.push(`  ◉ *${m.name}*  ·  ${m.type}  ·  ${r}`);
            }
            lines.push('');
          }
          lines.push(ui.DIV);
          lines.push(`_Unlock more by encountering Mora in the wild — *.hunt*._`);
          lines.push(`Use: *.mora 2* or *.mora Thornel*`);
          return sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: msg });
        }

        const mora = findMora(moraList, query) || findMora(moraList, queryRaw);
        if (!mora) return sock.sendMessage(chatId, { text: `❌ No Mora matches *${queryRaw}* in the registry.` });

        // Not encountered yet → mystery. No image, no stats, no lore.
        if (!isMoraKnown(mora)) {
          return sock.sendMessage(chatId, {
            text: ui.header('???', '❓') + `\n\n` +
              `_A Mora by that name walks the wilds — but its biography is still a mystery._\n\n` +
              ui.card('LOCKED', '🔒', [
                { emoji: '🔰', label: 'Name', value: '???' },
                { emoji: '⚡', label: 'Type', value: '???' },
                { emoji: '💠', label: 'Rarity', value: '???' },
              ]) + `\n\n` +
              `_Encounter it to unlock its full biography._`,
          }, { quoted: msg });
        }

        const base = mora.baseStats || {};
        const moveNames = Object.keys(mora.moves || {}).slice(0, 3).join(", ");
        const caption =
          ui.header(mora.name, '🐉') + `\n\n` +
          ui.card('BIOGRAPHY', '📖', [
            { emoji: '🆔', label: 'ID', value: String(mora.id) },
            { emoji: '💠', label: 'Rarity', value: mora.rarity },
            { emoji: '⚡', label: 'Type', value: mora.type },
            { emoji: '🧬', label: 'Merge', value: mora.merge || '—' },
          ]) + `\n\n` +
          `📖 *Description*\n${mora.description || "—"}\n\n` +
          ui.card('BASE STATS', '📊', [
            { emoji: '❤️', label: 'HP', value: String(base.hp ?? '?') },
            { emoji: '⚔️', label: 'ATK', value: String(base.atk ?? '?') },
            { emoji: '🛡️', label: 'DEF', value: String(base.def ?? '?') },
            { emoji: '💨', label: 'SPD', value: String(base.spd ?? '?') },
          ]) + `\n` +
          (moveNames ? `\n🎴 *Signature moves:* ${moveNames}` : "");

        // Try to send with sprite image; fall back to text-only if no image.
        const sprite = moraImagePath(mora);
        if (sprite) {
          try {
            const fs = require("fs");
            return sock.sendMessage(chatId, {
              image: fs.readFileSync(sprite),
              caption,
            }, { quoted: msg });
          } catch (e) {
            // fall through to text
          }
        }
        return sock.sendMessage(chatId, { text: caption });
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
    if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });
    proSystem.ensureProState(p);
    if (isOwner && (args[0] === "grant" || args[0] === "give")) {
        return proSystem.cmdGrantCrystals(ctx, chatId, senderId, msg, args.slice(1));
    }
    return sock.sendMessage(chatId, {
        text:
            ui.header('LUCRYSTAL', '💎') + '\n\n' +
            ui.card('BALANCE', '🔷', [
              { emoji: '🔷', label: 'LCR', value: Number(p.pro?.crystals || 0) },
            ]) + '\n\n' +
            ui.subheader('COMMANDS', '📋') + '\n' +
            `• ${'.exchange <lucons>'} — trade 1000 Lucons → 1 LCR\n` +
            `• ${'.pro-market'} — browse LCR items\n` +
            `• ${'.pro-info'} — subscription tiers`,
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

// ─── MORA SPAWN TOGGLE (Owner only) ───────────
if (command === "spawn-on" || command === "spawnon") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    settings.features = settings.features || {};
    settings.features.groupSpawnsEnabled = true;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "🌌 Wild Mora spawns *ENABLED* across all groups." });
}
if (command === "spawn-off" || command === "spawnoff") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    settings.features = settings.features || {};
    settings.features.groupSpawnsEnabled = false;
    const settingsModule = require("./lib/settings");
    settingsModule.saveSettings(settings);
    return sock.sendMessage(chatId, { text: "🌑 Wild Mora spawns *DISABLED*. The wilds fall silent." });
}
if (command === "spawn-status" || command === "spawnstatus") {
    if (!isOwner) return sock.sendMessage(chatId, { text: "🛑 Owner only." });
    const on = settings?.features?.groupSpawnsEnabled !== false;
    return sock.sendMessage(chatId, {
        text: `🌌 *Wild Mora spawns:* ${on ? "✅ ENABLED" : "🌑 DISABLED"}\n_Toggle with_ *.spawn-on* / *.spawn-off*`,
    });
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

// ─────────────────────────────────────────────
// PLAYER-TO-PLAYER TRANSFERS: LCR (Lucrystals) and REOB
// ─────────────────────────────────────────────
if (command === "transfer-lcr" || command === "transfer-reob") {
    const sender = players[senderId];
    if (!sender) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });

    const mentioned = getMentionedJids(msg);
    const replied = getRepliedJid(msg);
    const argJid = toUserJidFromArg(args[0]);

    let targetJid = null;
    let amountStr = null;
    if (mentioned[0] || replied) {
        targetJid = mentioned[0] || replied;
        amountStr = args[0];
    } else {
        targetJid = argJid;
        amountStr = args[1];
    }

    const label = command === "transfer-lcr" ? "Lucrystals (LCR)" : "Rift Energy Orbs (REOB)";
    if (!targetJid || !amountStr) {
        return sock.sendMessage(chatId, {
            text: `Usage:\n• .${command} @user <amount>\n• Reply to a user then .${command} <amount>\n\nSends *${label}* to another player.`
        }, { quoted: msg });
    }

    const target = players[normJid(targetJid)];
    if (!target) return sock.sendMessage(chatId, { text: "❌ That user isn't registered in Lumora." });
    if (normJid(targetJid) === senderId) return sock.sendMessage(chatId, { text: `😑 You can't transfer ${label} to yourself.` });

    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return sock.sendMessage(chatId, { text: "❌ Amount must be a positive number." });
    }

    const targetName = target.username || targetJid.split("@")[0];
    const senderName = sender.username || senderId.split("@")[0];

    if (command === "transfer-lcr") {
        const proSystem = require("./systems/pro");
        const senderPro = proSystem.ensureProState(sender);
        const targetPro = proSystem.ensureProState(target);
        if (Number(senderPro.crystals || 0) < amount) {
            return sock.sendMessage(chatId, { text: `❌ You only have *${Number(senderPro.crystals || 0)} LCR*.` });
        }
        senderPro.crystals = Number(senderPro.crystals || 0) - amount;
        targetPro.crystals = Number(targetPro.crystals || 0) + amount;
        savePlayers(players);
        return sock.sendMessage(chatId, {
            text: `💠 *LCR TRANSFER*\n\n${senderName} sent *${amount} Lucrystals* to ${targetName}.`,
            mentions: [targetJid]
        }, { quoted: msg });
    }

    // transfer-reob
    const itemsSystem = require("./systems/items");
    itemsSystem.ensurePlayerItemData(sender);
    itemsSystem.ensurePlayerItemData(target);
    const owned = itemsSystem.getItemQuantity(sender, "REOB");
    if (owned < amount) {
        return sock.sendMessage(chatId, { text: `❌ You only have *${owned}* Rift Energy Orb${owned === 1 ? "" : "s"}.` });
    }
    const removed = itemsSystem.removeItem(sender, "REOB", amount);
    if (!removed?.ok && removed !== true) {
        // removeItem may return a truthy/ok shape — fall through if successful
    }
    const added = itemsSystem.addItem(target, "REOB", amount);
    if (!added?.ok) {
        // rollback
        itemsSystem.addItem(sender, "REOB", amount);
        return sock.sendMessage(chatId, { text: `❌ Transfer failed: ${added?.reason || "target inventory full"}` });
    }
    savePlayers(players);
    return sock.sendMessage(chatId, {
        text: `🔮 *REOB TRANSFER*\n\n${senderName} sent *${amount} Rift Energy Orb${amount === 1 ? "" : "s"}* to ${targetName}.`,
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

    // 🎲 ROTATION LOGIC: Pick 4 random items from the pool of 12.
    // Resolve each entry against the live catalog so prices/descs are real
    // and purchases flow through the normal item-ID inventory pipeline.
    const itemsSystem = require("./systems/items");
    const itemsDb = itemsSystem.loadItems();
    const shuffled = [...BLACK_MARKET_POOL].sort(() => 0.5 - Math.random());
    const selectedItems = [];
    for (const entry of shuffled) {
      const def = itemsDb[entry.id];
      if (!def) continue; // never sell a dead/missing item
      selectedItems.push({
        id: def.id,
        name: def.name,
        desc: def.desc || def.description || def.effect || "Forbidden wares from beyond the Rift.",
        price: Number(def.price || 0),
        stock: Math.floor(Math.random() * 3) + 1,
      });
      if (selectedItems.length >= 4) break;
    }

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

    let marketText =
      `🕶️ *T H E   V O I D   M E R C H A N T* 🕶️\n` +
      `_\"I trade in things the Capital claims do not exist.\"_\n` +
      `${DIVIDER}\n\n`;

    global.blackMarket.items.forEach((item, index) => {
        marketText += `\`[${index + 1}]\`  💀 *${item.name}*\n`;
        marketText += `    💰 ${item.price} Lucons   ·   📦 Stock: ${item.stock}\n`;
        marketText += `    📜 _${item.desc}_\n`;
        marketText += (index < global.blackMarket.items.length - 1) ? `${SMALL_DIVIDER}\n` : "";
    });

    marketText += `\n${DIVIDER}\n🛒 Buy: \`.buy-bm <name> <qty>\``;
    
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
    
    // Add to inventory via the normal item-ID pipeline (not by display name)
    const itemsSystem = require("./systems/items");
    const itemsDb = itemsSystem.loadItems();
    const def = itemsDb[item.id] || null;
    if (def) {
      const added = itemsSystem.addItem(p, item.id, quantity);
      if (!added?.ok) {
        // rollback payment
        p.lucons += totalCost;
        item.stock += quantity;
        return sock.sendMessage(chatId, { text: `❌ ${added?.reason || "Could not add to inventory."}` });
      }
    } else {
      // fallback: store by ID anyway so the item still exists in the inventory map
      if (!p.inventory) p.inventory = {};
      p.inventory[item.id] = Number(p.inventory[item.id] || 0) + quantity;
    }

    savePlayers(players);

    const icon = def ? itemsSystem.getRarityIcon(def.rarity) : "🕶️";
    return sock.sendMessage(chatId, {
        text:
          `🕶️ *VOID PURCHASE*\n${DIVIDER}\n\n` +
          `${icon} *${item.name}* ×${quantity}\n` +
          `💰 Paid: *${totalCost} Lucons*\n` +
          (def?.effect ? `⚡ Effect: ${def.effect}\n` : "") +
          `\n💳 Lucons left: *${p.lucons}*`,
    });
}
      // ================= TAMED =================
      if (command === "tamed") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });

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
            const genBadge = Number(m.generation) === 2 ? " 🧬 2nd Gen" : "";

            return (
              `${i + 1}️⃣ *${m.name}*${inParty}${genBadge}\n` +
              `🆔 ID_${m.moraId} • ⚡ ${m.type || "—"} • 💠 ${m.rarity || "—"}\n` +
              `📈 Lv ${lv} • ✨ ${xpNow}/${need}\n` +
              `❤️ ${m.hp}/${m.maxHp}`
            );
          });

          const tamedLines = owned.map((m, i) => {
            const lv = m.level ?? 1;
            const need = xpSystem.xpToNextLevel(lv);
            const xpNow = typeof m.xp === "number" ? m.xp : 0;
            const inParty = partySet.has(i) ? ' ⚔️' : '';
            const genBadge = Number(m.generation) === 2 ? ' 🧬' : '';
            return ui.card(`${i + 1}. ${m.name}${inParty}${genBadge}`, '', [
              { emoji: '🆔', label: 'ID', value: `ID_${m.moraId}` },
              { emoji: '⚡', label: 'Type', value: m.type || '—' },
              { emoji: '💠', label: 'Rarity', value: m.rarity || '—' },
              { emoji: '📈', label: 'Level', value: `${lv} (${xpNow}/${need} XP)` },
              { emoji: '❤️', label: 'HP', value: `${m.hp}/${m.maxHp}` },
            ]);
          });

          // Send interactive list menu for Mora collection
          // sendListMenu removed — plain text sent below

          return sock.sendMessage(chatId, {
            text:
              ui.header('TAMED MORA', '🐉') + `\n\n` +
              tamedLines.join(`\n\n`) +
              `\n\n` + ui.DIV + `\n` +
              `_💎 Combat now uses SHARDS, not party Mora._\n` +
              `• *.tamed 1* to inspect a Mora\n` +
              `• *.shards* — your shard vault (used in combat)\n` +
              `• *.awaken <name>* — merge with a shard`,
          });
        }

        let chosen = null;
        if (/^\d+$/.test(query)) {
          const num = Number(query);
          if (num >= 1 && num <= owned.length) chosen = owned[num - 1];
          else chosen = owned.find((m) => Number(m.moraId) === num) || null;
        } else {
          // NAME-BASED LOOKUP: gather ALL matches. If exactly one, drop into the
          // single-mora detail view below. If multiple, show a picker list with sprite.
          const nameQ = String(queryRaw).trim().toLowerCase();
          const matches = owned
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => String(m?.name || "").toLowerCase().includes(nameQ));

          if (matches.length === 0) {
            return sock.sendMessage(chatId, { text: `❌ No tamed Mora match *${queryRaw}*.` });
          }
          if (matches.length === 1) {
            chosen = matches[0].m;
          } else {
            const partySet = new Set(
              Array.isArray(p.party)
                ? p.party.filter((x) => x !== null && x !== undefined)
                : []
            );
            const lines = matches.map(({ m, i }) => {
              const lv = m.level ?? 1;
              const pe = Math.floor(m.pe || 0);
              const inParty = partySet.has(i) ? " ⚔️ [PARTY]" : "";
              const corrupt = m.corrupted ? " 🕷 CORRUPTED" : "";
              return (
                `${i + 1}️⃣ *${m.name}*${inParty}${corrupt}\n` +
                `🆔 ID_${m.moraId} • Lv ${lv}\n` +
                `❤️ ${m.hp}/${m.maxHp} • 🕷 PE ${pe}`
              );
            });

            const caption =
              `━━━━━━━━━━━━━━━━━━\n` +
              `🐉 *YOUR ${String(queryRaw).toUpperCase()}s* (${matches.length})\n` +
              `━━━━━━━━━━━━━━━━━━\n\n` +
              lines.join(`\n\n──────────────────\n\n`) +
              `\n\n━━━━━━━━━━━━━━━━━━\n` +
              `Pick one with *.tamed <slot>* — e.g. *.tamed ${matches[0].i + 1}*\n` +
              `Move into party with *.t2party <slot>*`;

            const sprite = moraImagePath(matches[0].m);
            if (sprite) {
              try {
                const fs = require("fs");
                return sock.sendMessage(chatId, {
                  image: fs.readFileSync(sprite),
                  caption,
                }, { quoted: msg });
              } catch {}
            }
            return sock.sendMessage(chatId, { text: caption });
          }
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

        const detailCaption =
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
          `\n\n📖 *DESCRIPTION*\n${species?.description || "—"}\n`;

        const detailSprite = moraImagePath(chosen);
        if (detailSprite) {
          try {
            const fs = require("fs");
            return sock.sendMessage(chatId, {
              image: fs.readFileSync(detailSprite),
              caption: detailCaption,
            }, { quoted: msg });
          } catch {}
        }
        return sock.sendMessage(chatId, { text: detailCaption });
      }

      // ================= TAMED SEARCH =================
      // List every owned mora whose name matches the query, with their IDs.
      // Useful when a player has multiple of the same species.
      if (command === "tamed-search" || command === "tsearch") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });

        const owned = Array.isArray(p.moraOwned) ? p.moraOwned : [];
        if (!owned.length) return sock.sendMessage(chatId, { text: "😔 You don't own any Mora yet." }, { quoted: msg });

        const query = args.join(" ").trim().toLowerCase();
        if (!query) {
          return sock.sendMessage(chatId, {
            text: `Usage: *.tamed-search <name>*\nExample: \`.tamed-search sparko\``,
          }, { quoted: msg });
        }

        const partySet = new Set(
          Array.isArray(p.party) ? p.party.filter((x) => x !== null && x !== undefined) : []
        );

        const matches = [];
        owned.forEach((m, i) => {
          if (!m) return;
          if (String(m.name || "").toLowerCase().includes(query)) {
            matches.push({ m, i });
          }
        });

        if (!matches.length) {
          return sock.sendMessage(chatId, {
            text: `🔍 No tamed Mora match *${query}*.`,
          }, { quoted: msg });
        }

        const lines = matches.map(({ m, i }) => {
          const lv = m.level ?? 1;
          const inParty = partySet.has(i) ? " ⚔️ [PARTY]" : "";
          const pe = Math.floor(m.pe || 0);
          const corrupt = m.corrupted ? " 🕷 CORRUPTED" : "";
          return (
            `#${i + 1} • *${m.name}*${inParty}${corrupt}\n` +
            `🆔 ID_${m.moraId} • Lv ${lv}\n` +
            `❤️ ${m.hp}/${m.maxHp} • 🕷 PE ${pe}`
          );
        });

        return sock.sendMessage(chatId, {
          text:
            `🔎 *TAMED SEARCH — "${query}"*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Found *${matches.length}* match${matches.length === 1 ? "" : "es"}\n\n` +
            lines.join(`\n\n──────────────────\n\n`) +
            `\n\n━━━━━━━━━━━━━━━━━━\n` +
            `Use \`.tamed <#>\` to inspect by slot.`,
        }, { quoted: msg });
      }

      // ================= VIEW SANCTUARY (faction status roll-up) =================
      if (command === "view-sanctuary" || command === "viewsanctuary" || command === "sanctuary-view") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });
        if (!p.faction || !["harmony","purity","rift"].includes(p.faction)) {
          return sock.sendMessage(chatId, { text: "❌ You must belong to a faction to view its sanctuary." }, { quoted: msg });
        }

        const faction = p.faction;
        regenWallIfDue(faction);
        const fp = loadFactionPoints();
        const treasury = loadTreasury()[faction] || {};
        const factionMeta = FACTIONS[faction] || {};
        const factionName = factionMeta.name || faction;
        const factionEmoji = factionMeta.emoji || "⚔";

        // Roll up live player data
        let memberCount = 0;
        let corruptedMora = 0;
        const contributors = [];
        for (const [jid, pl] of Object.entries(players)) {
          if (!pl || pl.faction !== faction) continue;
          memberCount++;
          const owned = Array.isArray(pl.moraOwned) ? pl.moraOwned : [];
          corruptedMora += owned.filter(m => m?.corrupted).length;
          contributors.push({
            name: pl.username || jid.split("@")[0],
            donated: Number(treasury.contributions?.[jid] || 0),
          });
        }
        contributors.sort((a, b) => b.donated - a.donated);
        const topLines = contributors.slice(0, 5)
          .filter(c => c.donated > 0)
          .map((c, i) => `${i + 1}. *${c.name}* — 🧱 ${c.donated.toLocaleString()}L donated`);

        // Wall bar
        const wallHp = Math.max(0, Number(treasury.wallHp || 0));
        const wallMax = Math.max(1, Number(treasury.wallMaxHp || 500));
        const wallPct = wallHp / wallMax;
        const filled = Math.round(wallPct * 10);
        const wallBar = "█".repeat(filled) + "░".repeat(10 - filled);
        const wallLevel = Number(treasury.wallLevel || 1);

        // Honour
        const honour = Number(treasury.honour || 100);
        const honourIcon = honour >= 150 ? "⭐ *REVERED*" : honour >= 100 ? "🏅 *Honoured*" : honour >= 50 ? "⚪ *Standing*" : "💀 *Disgraced*";
        const honourNote = honour >= 150
          ? "_Market discounts active; +20% FP on missions._"
          : honour < 50
          ? "_Market +10%; -10% FP on missions._"
          : "_No honour modifiers active._";

        const deployedCount = (treasury.moraDeployed || []).length;
        const treasuryLucons = Number(treasury.lucons || 0);
        const stockpile = (treasury.wallMaterials || []).length;

        const factionLabel =
          faction === "harmony" ? "Sanctuary" :
          faction === "purity"  ? "Citadel" :
          faction === "rift"    ? "Rift Nexus" : "Sanctuary";

        return sock.sendMessage(chatId, {
          text:
            ui.header(`${factionName.toUpperCase()} — ${factionLabel.toUpperCase()}`, factionEmoji) + '\n\n' +
            ui.card('FACTION', '👥', [
              { emoji: '👥', label: 'Members', value: memberCount },
              { emoji: '🏅', label: 'Faction Points', value: fp[faction] || 0 },
            ]) + '\n\n' +
            ui.subheader('TREASURY', '🛡️') + '\n' +
            ui.card('VAULT', '💰', [
              { emoji: '💰', label: 'Lucons', value: treasuryLucons.toLocaleString() },
              { emoji: '🐉', label: 'Deployed', value: `${deployedCount} Mora` },
              ...(corruptedMora ? [{ emoji: '🕷', label: 'Corrupted', value: corruptedMora }] : []),
              { emoji: '💎', label: 'Crystals', value: stockpile },
            ]) + '\n\n' +
            ui.subheader(`WALL — Lv ${wallLevel}`, '🧱') + '\n' +
            `\`${wallBar}\`  *${wallHp}/${wallMax}*\n` +
            `_${'.fortify-wall'} to reinforce_\n\n` +
            ui.card('HONOUR', '⭐', [
              { emoji: '⭐', label: 'Status', value: honour >= 150 ? 'REVERED' : honour >= 100 ? 'Honoured' : honour >= 50 ? 'Standing' : 'Disgraced' },
              { emoji: '📊', label: 'Points', value: honour },
            ]) + '\n' +
            `_${honourNote}_\n\n` +
            ui.subheader('TOP DONORS', '🏆') + '\n' +
            (topLines.length ? topLines.join('\n') : '_(none yet — be the first!)_') + '\n\n' +
            ui.divider() + '\n' +
            `_${'.fortify-wall <crystal|amount>'}  •  ${'.upgrade-wall'}_`,
        }, { quoted: msg });
      }

      // ================= FORTIFY WALL =================
      if (command === "fortify-wall" || command === "fortifywall") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });
        if (!p.faction || !["harmony","purity","rift"].includes(p.faction)) {
          return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });
        }
        const faction = p.faction;
        regenWallIfDue(faction);

        const queryRaw = args.join(" ").trim();
        if (!queryRaw) {
          return sock.sendMessage(chatId, {
            text:
              `🧱 *FORTIFY THE WALL*\n\n` +
              `Donate crystals OR lucons to strengthen your faction's wall.\n\n` +
              `*Crystals:*\n` +
              `• Shard Crystal (+50 HP each)\n` +
              `• Core Crystal (+150 HP each)\n` +
              `• Prismatic Crystal (+400 HP each)\n` +
              `• Rift Crystal (+1000 HP each)\n\n` +
              `*Usage:*\n` +
              `• \`.fortify-wall shard crystal 3\` — use 3 shard crystals\n` +
              `• \`.fortify-wall 500\` — donate 500 lucons (1L = 1 HP)\n\n` +
              `_Crystals stored in the wall may DROP as loot when raiders break it._`,
          }, { quoted: msg });
        }

        const itemsDb = require("./systems/items").loadItems();
        const t = loadTreasury();
        const f = t[faction];

        // Check if it's a pure-number = lucon donation
        if (/^\d+$/.test(queryRaw)) {
          const amt = Number(queryRaw);
          if (amt <= 0) return sock.sendMessage(chatId, { text: "❌ Amount must be positive." }, { quoted: msg });
          if ((p.lucons || 0) < amt) return sock.sendMessage(chatId, { text: "❌ Not enough Lucons." }, { quoted: msg });
          const addHp = Math.min(amt, f.wallMaxHp - f.wallHp);
          if (addHp <= 0) return sock.sendMessage(chatId, { text: "🧱 The wall is already at full strength." }, { quoted: msg });

          p.lucons -= amt;
          f.wallHp = Math.min(f.wallMaxHp, f.wallHp + addHp);
          f.contributions[senderId] = (f.contributions[senderId] || 0) + amt;
          saveTreasury(t);
          savePlayers(players);

          const unused = amt - addHp;
          const returnNote = unused > 0 ? `\n\n_Wall was near full — ${unused} Lucons returned._` : "";
          if (unused > 0) { p.lucons += unused; savePlayers(players); }

          return sock.sendMessage(chatId, {
            text:
              `🧱 *Wall reinforced.*\n\n` +
              `+${addHp} HP  →  *${f.wallHp}/${f.wallMaxHp}*\n` +
              `💸 -${amt - unused} Lucons\n` +
              `🏆 Your total wall donations: *${f.contributions[senderId]}*${returnNote}`,
          }, { quoted: msg });
        }

        // Otherwise parse as "<crystal name> [qty]"
        let qty = 1;
        let nameTokens = queryRaw.split(/\s+/);
        const lastToken = nameTokens[nameTokens.length - 1];
        if (/^\d+$/.test(lastToken)) {
          qty = Math.max(1, Number(lastToken));
          nameTokens = nameTokens.slice(0, -1);
        }
        const itemName = nameTokens.join(" ").toLowerCase();

        const crystalIds = ["CRY_001","CRY_002","CRY_003","CRY_004"];
        const crystal = crystalIds.map(id => itemsDb[id]).find(it =>
          it && it.name.toLowerCase() === itemName || (it && it.name.toLowerCase().startsWith(itemName))
        );
        if (!crystal) {
          return sock.sendMessage(chatId, { text: "❌ Unknown crystal. Try: *shard crystal*, *core crystal*, *prismatic crystal*, *rift crystal*." }, { quoted: msg });
        }

        const inv = p.inventory || {};
        const have = Number(inv[crystal.id] || 0);
        if (have < qty) {
          return sock.sendMessage(chatId, { text: `❌ You only have ${have} ${crystal.name}${have === 1 ? "" : "s"}.` }, { quoted: msg });
        }

        const hpPer = Number(crystal.effects?.wallHp || 0);
        const roomLeft = f.wallMaxHp - f.wallHp;
        if (roomLeft <= 0) return sock.sendMessage(chatId, { text: "🧱 The wall is already at full strength." }, { quoted: msg });
        const maxUsable = Math.max(1, Math.ceil(roomLeft / Math.max(1, hpPer)));
        const useQty = Math.min(qty, maxUsable);
        const hpGain = Math.min(roomLeft, hpPer * useQty);

        inv[crystal.id] = have - useQty;
        if (inv[crystal.id] <= 0) delete inv[crystal.id];
        p.inventory = inv;
        f.wallHp = Math.min(f.wallMaxHp, f.wallHp + hpGain);
        for (let i = 0; i < useQty; i++) {
          f.wallMaterials.push({ id: crystal.id, name: crystal.name, hp: hpPer, by: senderId });
        }
        const luconEquiv = hpGain; // for contribution tracking
        f.contributions[senderId] = (f.contributions[senderId] || 0) + luconEquiv;

        saveTreasury(t);
        savePlayers(players);

        return sock.sendMessage(chatId, {
          text:
            `🧱 *Wall reinforced with ${crystal.name}.*\n\n` +
            `-${useQty}× ${crystal.name}\n` +
            `+${hpGain} HP  →  *${f.wallHp}/${f.wallMaxHp}*\n` +
            `💎 Crystals stored in wall: *${f.wallMaterials.length}*\n` +
            `🏆 Total contribution value: *${f.contributions[senderId]}*\n\n` +
            `_If raiders break through, these crystals drop as loot._`,
        }, { quoted: msg });
      }

      // ================= DONATE TO TREASURY =================
      // Manual treasury donation. Lucons go in 1:1, Lucrystals go in at the
      // same exchange rate as .exchange (1 LCR = 1000 Lucons of treasury value).
      if (command === "donate") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });
        if (!p.faction || !["harmony","purity","rift"].includes(p.faction)) {
          return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });
        }

        const amount = Number(args[0]);
        const currency = (args[1] || "lucons").toLowerCase();

        if (!Number.isFinite(amount) || amount <= 0 || !["lucons","lucon","l","lcr","crystal","crystals"].includes(currency)) {
          return sock.sendMessage(chatId, {
            text:
              `🏦 *DONATE TO TREASURY*\n\n` +
              `Strengthen your faction's war chest.\n\n` +
              `*Usage:*\n` +
              `• \`.donate 500\` — donate 500 Lucons\n` +
              `• \`.donate 500 lucons\` — same\n` +
              `• \`.donate 2 lcr\` — donate 2 Lucrystals (1 LCR = 1000L of treasury value)\n\n` +
              `_Donations grow the treasury raiders fight over and your name appears on the contributors board._`,
          }, { quoted: msg });
        }

        const isLcr = ["lcr","crystal","crystals"].includes(currency);
        const t = loadTreasury();
        const f = t[p.faction];

        if (isLcr) {
          const proSystem = require("./systems/pro");
          const pro = proSystem.ensureProState(p);
          const have = Number(pro.crystals || 0);
          if (have < amount) {
            return sock.sendMessage(chatId, { text: `❌ You only have *${have} LCR*.` }, { quoted: msg });
          }
          const luconValue = amount * 1000;
          pro.crystals = have - amount;
          f.lucons = (f.lucons || 0) + luconValue;
          f.contributions[senderId] = (f.contributions[senderId] || 0) + luconValue;
          // 0.1.3 — Treasury Patron achievement counter (lucon-equivalent)
          p.totalDonatedL = Number(p.totalDonatedL || 0) + luconValue;
          saveTreasury(t);
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text:
              `🏦 *TREASURY DONATION*\n\n` +
              `💠 -${amount} Lucrystals\n` +
              `💰 +${luconValue.toLocaleString()}L → treasury\n\n` +
              `🏦 ${p.faction.charAt(0).toUpperCase() + p.faction.slice(1)} Treasury: *${f.lucons.toLocaleString()}L*\n` +
              `🏆 Your total contribution: *${f.contributions[senderId].toLocaleString()}L*`,
          }, { quoted: msg });
        }

        // lucons path
        const have = Number(p.lucons || 0);
        if (have < amount) {
          return sock.sendMessage(chatId, { text: `❌ Not enough Lucons. You have *${have}L*.` }, { quoted: msg });
        }
        p.lucons = have - amount;
        f.lucons = (f.lucons || 0) + amount;
        f.contributions[senderId] = (f.contributions[senderId] || 0) + amount;
        // 0.1.3 — Treasury Patron achievement counter
        p.totalDonatedL = Number(p.totalDonatedL || 0) + amount;
        saveTreasury(t);
        savePlayers(players);
        return sock.sendMessage(chatId, {
          text:
            `🏦 *TREASURY DONATION*\n\n` +
            `💸 -${amount.toLocaleString()} Lucons\n` +
            `💰 +${amount.toLocaleString()}L → treasury\n\n` +
            `🏦 ${p.faction.charAt(0).toUpperCase() + p.faction.slice(1)} Treasury: *${f.lucons.toLocaleString()}L*\n` +
            `🏆 Your total contribution: *${f.contributions[senderId].toLocaleString()}L*`,
        }, { quoted: msg });
      }

      // ================= UPGRADE WALL =================
      if (command === "upgrade-wall" || command === "upgradewall") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });
        if (!p.faction || !["harmony","purity","rift"].includes(p.faction)) {
          return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });
        }
        const faction = p.faction;

        // Require top-5 by level within faction
        const members = Object.entries(players)
          .filter(([, pl]) => pl && pl.faction === faction)
          .map(([jid, pl]) => ({ jid, level: Number(pl.level || 1) }))
          .sort((a, b) => b.level - a.level);
        const top5Jids = members.slice(0, 5).map(m => m.jid);
        if (!top5Jids.includes(senderId) && !isOwner) {
          return sock.sendMessage(chatId, { text: "❌ Only the top 5 members of your faction (by level) may order wall upgrades." }, { quoted: msg });
        }

        const t = loadTreasury();
        const f = t[faction];
        const currentLv = Number(f.wallLevel || 1);
        if (currentLv >= 5) return sock.sendMessage(chatId, { text: "🧱 The wall is already at its maximum level (5)." }, { quoted: msg });

        const nextLv = currentLv + 1;
        const cost = nextLv * 500;
        if ((f.lucons || 0) < cost) {
          return sock.sendMessage(chatId, { text: `❌ Treasury has only *${f.lucons}L*. Upgrade to Lv${nextLv} costs *${cost}L*.` }, { quoted: msg });
        }

        f.lucons -= cost;
        f.wallLevel = nextLv;
        f.wallMaxHp = getWallLevelCapacity(nextLv);
        f.wallHp = f.wallMaxHp; // full heal on upgrade
        saveTreasury(t);

        return sock.sendMessage(chatId, {
          text:
            `🧱 *WALL UPGRADED — Lv ${currentLv} → Lv ${nextLv}*\n\n` +
            `💰 Treasury -${cost}L  →  *${f.lucons}L remaining*\n` +
            `🛡️ New max HP: *${f.wallMaxHp}* (fully restored)\n\n` +
            `_The wall hums with new resonance. Let the raiders come._`,
        }, { quoted: msg });
      }

      // ================= RAIDS =================
      try { await raidsSystem.tickRaid(ctx); } catch (e) { console.log("[tickRaid]", e?.message || e); }
      try { raidsSystem.tickKael(ctx); } catch (e) { console.log("[tickKael]", e?.message || e); }
      // v0.7.0 auto-raids: piggyback on every message tick (cheap state read)
      try { await autoRaidSystem.tickAutoRaid(ctx); } catch (e) { console.log("[tickAutoRaid]", e?.message || e); }

      if (command === "summon-kael" || command === "summonkael") {
        return raidsSystem.cmdSummonKael(ctx, chatId, senderId, msg);
      }
      if (command === "claim-raidcontract" || command === "claimraidcontract" || command === "claim-contract") {
        return raidsSystem.cmdClaimContract(ctx, chatId, senderId, msg);
      }
      if (command === "raid") {
        const sub = (args[0] || "").toLowerCase();
        if (sub === "join") return raidsSystem.cmdRaidJoin(ctx, chatId, senderId, msg);
        if (sub === "launch") return raidsSystem.cmdRaidLaunch(ctx, chatId, senderId, msg, args.slice(1));
        if (sub === "status") return raidsSystem.cmdRaidStatus(ctx, chatId, msg);
        if (sub === "history") return raidsSystem.cmdRaidHistory(ctx, chatId, msg);
        return sock.sendMessage(chatId, { text: "📖 *.raid join* | *.raid launch <faction>* | *.raid status* | *.raid history*" }, { quoted: msg });
      }
      if (command === "raid-attack" || command === "raidattack") {
        return raidsSystem.cmdRaidAttackEncounter(ctx, chatId, senderId, msg);
      }
      if (command === "raid-reinforce" || command === "raidreinforce") {
        return raidsSystem.cmdRaidReinforce(ctx, chatId, senderId, msg);
      }
      if (command === "engage" || command === "raid-engage") {
        return raidsSystem.cmdRaidEngage(ctx, chatId, senderId, msg, { getMentionedJids, normJid });
      }
      if (command === "reroll-roles" || command === "rerollroles") {
        return raidsSystem.cmdRerollRoles(ctx, chatId, senderId, msg);
      }
      if (command === "ready") {
        return raidsSystem.cmdReady(ctx, chatId, senderId, msg);
      }
      if (command === "raid-go" || command === "raidgo") {
        return raidsSystem.cmdRaidGo(ctx, chatId, senderId, msg);
      }
      if (command === "raid-kick" || command === "raidkick") {
        return raidsSystem.cmdRaidKick(ctx, chatId, senderId, msg, { getMentionedJids, normJid });
      }
      if (command === "escape" || command === "raid-escape") {
        return raidsSystem.cmdEscapeCapture(ctx, chatId, senderId, msg);
      }
      if (command === "add-raidgroup" || command === "addraidgroup") {
        return raidsSystem.cmdAddRaidGroup(ctx, chatId, senderId, msg);
      }
      if (command === "remove-raidgroup" || command === "removeraidgroup") {
        return raidsSystem.cmdRemoveRaidGroup(ctx, chatId, senderId, msg);
      }
      if (command === "raids-on") return raidsSystem.cmdRaidsToggle(ctx, chatId, senderId, msg, true);
      if (command === "raids-off") return raidsSystem.cmdRaidsToggle(ctx, chatId, senderId, msg, false);
      if (command === "raid-end" || command === "raidend") {
        return raidsSystem.cmdForceEnd(ctx, chatId, senderId, msg);
      }

      // ================= CLAIM RESTORATION GIFT (Patch 0.1.1) =================
      if (command === "claim-gift" || command === "claimgift") {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first with *.register*." }, { quoted: msg });
        if (p.giftClaimedAt) {
          const when = new Date(p.giftClaimedAt).toISOString().slice(0, 10);
          return sock.sendMessage(chatId, { text: `✨ You already received the Rift Restoration on *${when}*. The gift was a one-time gesture.` }, { quoted: msg });
        }

        const moraList = loadMora();
        const byRarity = (r) => moraList.filter(m => String(m.rarity).toLowerCase() === r.toLowerCase());
        const legends = byRarity("Legendary");
        const rares = byRarity("Rare");
        const uncommons = byRarity("Uncommon");

        if (!legends.length || rares.length < 1 || uncommons.length < 1) {
          return sock.sendMessage(chatId, { text: "⚠️ Mora pools missing. Contact the owner." }, { quoted: msg });
        }

        const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const grantedNames = [];
        p.moraOwned ||= [];

        // 1× Legendary, level 10–15
        {
          const species = pickRandom(legends);
          const lvl = 10 + Math.floor(Math.random() * 6);
          const owned = createOwnedMoraFromSpecies(species);
          owned.level = lvl;
          xpSystem.applyLevelScaling(owned, species);
          owned.hp = owned.maxHp;
          p.moraOwned.push(owned);
          grantedNames.push(`🌟 *${owned.name}* — Legendary • Lv ${lvl}`);
        }

        // 3× Rare
        for (let i = 0; i < 3; i++) {
          const species = pickRandom(rares);
          const owned = createOwnedMoraFromSpecies(species);
          owned.hp = owned.maxHp;
          p.moraOwned.push(owned);
          grantedNames.push(`💎 *${owned.name}* — Rare • Lv 1`);
        }

        // 3× Uncommon
        for (let i = 0; i < 3; i++) {
          const species = pickRandom(uncommons);
          const owned = createOwnedMoraFromSpecies(species);
          owned.hp = owned.maxHp;
          p.moraOwned.push(owned);
          grantedNames.push(`✨ *${owned.name}* — Uncommon • Lv 1`);
        }

        // 7000 Lucons
        p.lucons = Number(p.lucons || 0) + 7000;

        // 1× REOB
        p.inventory ||= {};
        p.inventory.REOB = Number(p.inventory.REOB || 0) + 1;

        // 18 hours of infinite hunt energy
        const eighteenHours = 18 * 60 * 60 * 1000;
        p.riftEnergyUntil = Date.now() + eighteenHours;

        // Survivor achievement
        p.achievements ||= [];
        if (!p.achievements.includes("rift_survivor")) p.achievements.push("rift_survivor");

        p.giftClaimedAt = Date.now();
        savePlayers(players);

        return sock.sendMessage(chatId, {
          text:
            ui.header('RIFT RESTORATION', '🌀') + '\n' +
            `_Patch 0.1.1 — A gift from the Rift._\n\n` +
            `_When the Rift convulsed, the data-storm tore through every Stronghold._\n` +
            `_Vaults blinked. Records faltered. For one terrible moment, even the names of bonded Mora flickered out of the world._\n\n` +
            `_But you stayed. You held the line while we patched the tear._\n\n` +
            `🎭 *Kael:* "You weathered the storm, little Lumorian. The Rift owes you a debt. Take what is yours."\n\n` +
            ui.subheader('RESTORATION REWARDS', '🎁') + '\n\n' +
            ui.card('NEW MORA', '🐉', grantedNames.map((n, i) => {
              const parts = n.split(' — ');
              return { emoji: i === 0 ? '🌟' : i < 4 ? '💎' : '✨', label: parts[0].replace(/[🌟💎✨*]/g, '').trim(), value: parts[1] || '' };
            })) + '\n\n' +
            ui.card('BONUS', '💰', [
              { emoji: '💰', label: 'Lucons', value: '+7,000 — Rift Treasury' },
              { emoji: '🌀', label: 'REOB', value: '+1 — Forge-spark' },
              { emoji: '🏆', label: 'Title', value: 'Survivor of the Rift Tear' },
            ]) + '\n\n' +
            ui.subheader('RIFT ENERGY SURGE', '⚡') + '\n\n' +
            `_Raw Primordial Energy floods your veins._\n` +
            `_For the next *18 hours*, hunting costs *no energy*._\n\n` +
            ui.card('SURGE ACTIVE', '⏳', [
              { emoji: '⏰', label: 'Ends', value: new Date(p.riftEnergyUntil).toLocaleString() },
            ]) + '\n\n' +
            ui.divider() + '\n' +
            `_Thank you for surviving with us._\n` +
            `_— The Lumora Team_`,
        }, { quoted: msg });
      }

      // ================= CHRONICLES =================
      if (command === "chronicles" || command === "lore") {
        const fs = require("fs");
        const cpath = path.join(DATA_DIR, "chronicles.json");
        let entries = [];
        try { entries = JSON.parse(fs.readFileSync(cpath, "utf8")).entries || []; } catch {}
        const recent = entries.slice(-5).reverse();
        const recentLines = recent.length
          ? recent.map((e, i) => `${i + 1}. _${e.text}_`).join("\n")
          : "_The pages are still blank._";
        return sock.sendMessage(chatId, {
          text:
            `📜 *THE CHRONICLES OF LUMORA*\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `_The full saga — a living narrator voicing the rise of warriors, the fall of vaults, the arcs of factions — is being written._\n\n` +
            `🌀 *Coming soon:* A two-part chronicle:\n` +
            `• *The Present* — today's heroes, their paths, their choices.\n` +
            `• *The Past* — raids won and lost, honour shifts, faction milestones.\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📖 *Recent events recorded:*\n${recentLines}\n\n` +
            `━━━━━━━━━━━━━━━━━━`,
        }, { quoted: msg });
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
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
        if (!p.faction) return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });

        const queryRaw = args.join(" ").trim();
        if (!queryRaw) {
          return sock.sendMessage(chatId, {
            text:
              `📤 *MORA SUBMISSION*\n\n` +
              `Submit a Mora to your faction facility.\n\n` +
              `🌿 *Harmony* — Mora lives freely at the Sanctuary. You earn Faction Points.\n` +
              `⚔️ *Purity* — Mora is taken for discipline/research. You earn Faction Points.\n` +
              `🕶️ *Rift* — Corrupted Mora sold into the Rift market. Higher FP for corrupted.\n\n` +
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

        // Submit reward — FP only. Lucons removed in 0.1.3 because the
        // submit/buy-back cycle was minting easy money.
        let fpReward = 5;
        if (faction === "rift" && isCorrupted) fpReward = 12;
        if (faction === "harmony")             fpReward = 10;
        if (faction === "purity")              fpReward = 8;

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

        addFactionPoints(faction, fpReward);

        // Deploy mora into the faction treasury
        const treasuryEntry = {
          name: chosen.name,
          rarity: chosen.rarity,
          level: chosen.level || 1,
          moraId: chosen.moraId,
          type: chosen.type,
          stats: chosen.stats,
          corrupted: !!chosen.corrupted,
          submittedBy: senderId,
          submittedByName: p.username || senderId.split("@")[0],
          submittedAt: Date.now(),
        };
        addTreasuryMora(faction, treasuryEntry);

        savePlayers(players);

        return sock.sendMessage(chatId, {
          text:
            `${speech}\n\n` +
            `📤 *${chosen.name}* (${chosen.rarity} • Lv ${chosen.level}) has been submitted.\n\n` +
            `🏅 Faction Points: *+${fpReward}*\n` +
            `🛡️ Deployed to *${titleCase(faction)} Treasury* — will defend during raids.`,
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
      ui.header(username, '⚔️') + `\n\n` +
      ui.card('STATUS', '📊', [
        { emoji: '🕶️', label: 'Masked', value: 'Yes' },
        { emoji: '⚔️', label: 'Faction', value: factionLine },
        { emoji: '🆔', label: 'ID', value: normalizeNumberFromJid(targetId) },
      ]),
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

const xpNeeded = xpSystem.playerXpToNextLevel(p.level || 1);
      const xpCurrent = p.xp ?? 0;
      const mergeText = (() => {
        const merge = p.currentMerge || null;
        if (!merge) return "Base form";
        const tierTag = merge.tier === "full" ? "🔥 FULL" : merge.tier === "partial" ? "✨ PARTIAL" : "—";
        const corrTag = merge.corrupted ? "  ☠ CORRUPTED" : "";
        return `[${merge.name}] (${tierTag})${corrTag}`;
      })();

      const profileCaption =
        ui.header(username, '⚔️') + `\n\n` +
        (p.title && String(p.title).trim() ? `🏷️ *${p.title}*\n` : "") +
        ui.card('STATUS', '📊', [
          { emoji: '🏅', label: 'Rank', value: playerRank },
          { emoji: '📊', label: 'Level', value: `${p.level ?? 1}` },
          { emoji: '⚔️', label: 'Faction', value: factionLine },
          { emoji: '🆔', label: 'ID', value: normalizeNumberFromJid(targetId) },
        ]) + `\n\n` +
        ui.card('ECONOMY', '💰', [
          { emoji: '💰', label: 'Lucons', value: String(p.lucons ?? 0) },
          { emoji: '🌀', label: 'Merge', value: mergeText },
        ]) + `\n\n` +
        `${ui.statBar(xpCurrent, xpNeeded)}  _XP to next: ${xpNeeded === Infinity ? 'MAX' : (xpNeeded - xpCurrent)}_\n` +
        (genderLine || "") +
        (companionLine ? companionLine : "") +
        (streakLine ? streakLine : "") +
        (achTitleLine ? achTitleLine : "") +
        (equippedAchLine ? equippedAchLine : "") +
        `🔮 Aura: *${displayAura}*\n\n` +
        ui.DIV + `\n` +
        `_Dive deeper: *.inv*  •  *.gear*  •  *.stats*  •  *.shards*  •  *.help*_`;
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
          // Canvas images disabled - user preference
        } catch (e) {
          console.log("Profile card generation error (disabled):", e.message);
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

        // Profile buttons below (sendListMenu removed — broken on PC)
        buttonsSystem.mapButtons({
          "🎒 Inventory": `${PREFIX}inv`,
          "🥋 Styles": `${PREFIX}styles`,
          "💎 Shards": `${PREFIX}shards`,
          "📊 Stats": `${PREFIX}stats`,
          "🎮 Menu": `${PREFIX}menu`,
        });
        return sendButtons(sock, chatId, profileCaption,
          ["🎒 Inventory", "🥋 Styles", "💎 Shards", "📊 Stats", "🎮 Menu"],
          { footer: `Tap to jump — or type ${PREFIX}help for everything`, quoted: msg }
        );
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

  // M2.6: force-release ALL live battles (wildbattle + PvP, every chat).
  // The old p.inBattle / p.activeHunt / p.isStuck flags were never set by
  // any engine — the real locks live in the battle maps now.
  const released = combatLockSystem.forceRelease(target);

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

  const battleLine = (released.wild || released.pvp)
    ? `Released *${released.wild} wild* + *${released.pvp} PvP* battle${(released.wild + released.pvp) === 1 ? "" : "s"}.\n`
    : `No live battles found.\n`;
  return sock.sendMessage(chatId, { 
    text: `⚙️ *SYSTEM OVERRIDE*\n\n${battleLine}Energy restored to maximum for @${target.split('@')[0]}.`,
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
      // PVP BATTLE SYSTEM (v0.7.1 — playerBattle.js, shard/style/stats aware)
      // The OLD systems/battle.js is no longer reachable from .battle/.accept/etc.
      // ============================
      if (command === "battle")  return playerBattleSystem.cmdBattle(ctx, chatId, senderId, msg, args);
      if (command === "accept")  return playerBattleSystem.cmdAccept(ctx, chatId, senderId, msg);
      if (command === "reject" || command === "refuse") return playerBattleSystem.cmdReject(ctx, chatId, senderId, msg);
      // .attack only enters PvP if a PvP battle is live in this chat — otherwise fall through
      if (command === "attack" && playerBattleSystem.getBattle?.(chatId)) {
        return playerBattleSystem.cmdAttack(ctx, chatId, senderId, msg, args);
      }
      // .charge in PvP context only
      if (command === "charge" && playerBattleSystem.getBattle?.(chatId)) {
        return playerBattleSystem.cmdCharge(ctx, chatId, senderId, msg);
      }
      if (command === "switch" && playerBattleSystem.getBattle?.(chatId)) {
        return sock.sendMessage(chatId, {
          text:
            `🔁 *.switch* is retired in PvP — you fight as yourself.\n` +
            `Use *.awaken <shard>* or *.shed* outside battle to change form.`,
        }, { quoted: msg });
      }
      if (command === "forfeit" && playerBattleSystem.getBattle?.(chatId)) {
        return playerBattleSystem.cmdForfeit(ctx, chatId, senderId, msg);
      }
      // Items in PvP: not implemented in v0.7.1. Fall through to .consume.
      if (command === "use") {
        if (battleSystem.getBattle?.(chatId)) {
          return battleSystem.cmdUse?.(ctx, chatId, senderId, msg, args);
        }
        return inventorySystem.cmdConsume(ctx, chatId, senderId, msg, args);
      }

      // ============================
      // HUNTING COMMANDS
      // ============================
      if (
  command === "map" ||
  command === "select-terrain" ||
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

  // 🛑 GLOBAL LOCK: Stop hunting while in a battle (M2.6 — was reading the
  // never-set p.inBattle flag; now consults the live battle maps directly)
  const battleKind = combatLockSystem.isInCombat(chatId, senderId);
  if (battleKind) {
    return sock.sendMessage(chatId, {
      text: battleKind === "pvp"
        ? "❌ You cannot hunt while locked in a PvP duel! Finish your battle first."
        : "❌ You cannot hunt while a wild Mora has you pinned! Finish or flee first.",
    });
  }

  if (command === "map")             return huntingSystem.cmdMap(ctx, chatId, senderId, msg);
  if (command === "select-terrain")  return huntingSystem.cmdSelectTerrain(ctx, chatId, senderId, msg, args);
  if (command === "travel")          return huntingSystem.cmdTravel(ctx, chatId, senderId, msg, args);
  if (command === "proceed") return huntingSystem.cmdProceed(ctx, chatId, senderId, msg);
  if (command === "dismiss") return huntingSystem.cmdDismiss(ctx, chatId, senderId, msg);
  if (command === "return")  return huntingSystem.cmdReturn(ctx, chatId, senderId, msg);
  if (command === "hunt")    return huntingSystem.cmdHunt(ctx, chatId, senderId, msg);
  if (command === "pick")    return huntingSystem.cmdPick(ctx, chatId, senderId, msg);
  if (command === "pass")    return huntingSystem.cmdPass(ctx, chatId, senderId, msg);
  if (command === "track")   return huntingSystem.cmdTrack(ctx, chatId, senderId, msg);
  if (command === "gather" || command === "intel") return huntingSystem.cmdGatherIntel(ctx, chatId, senderId, msg);
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
      if (command === "guide" || command === "tutorial") {
        return sock.sendMessage(chatId, {
          text:
            `hey hey welcome........glad you're here bro 🌌\n\n` +
            `big heads up — Lumora got REWORKED recently........combat is totally different now........you don't send mora to fight like before, you literally BECOME them........read on, it's wild 💎\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 1 — SET YOURSELF UP*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `first things first........type *.begin* then *.register* to create your profile\n\n` +
            `then give yourself a name:\n` +
            `*.set-username YourName*\n\n` +
            `set your profile icon (pick a number 1-20):\n` +
            `*.set-icon 1*\n\n` +
            `and your gender if you want:\n` +
            `*.gender male* or *.gender female*\n\n` +
            `cool........you're officially a Lumorian now 💪\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 2 — JOIN A FACTION*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Lumora has 3 factions........each one shapes how you play:\n\n` +
            `🌿 *Harmony* — balanced........heals........+5% catch bonus\n` +
            `⚔️ *Purity* — disciplined........heavy strikes........+10% PvP damage\n` +
            `🕶️ *Rift* — chaotic........corruption-touched........15% double aura chance\n\n` +
            `join your faction's group chat and you're in........ask an admin for links\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 3 — THE MERGE LOOP (THIS IS THE GAME NOW)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `okay listen........this is the whole thing\n\n` +
            `when you defeat a wild mora it drops a *SHARD* (a crystal of its essence)\n` +
            `that shard goes into your *vault*........check it anytime with *.shards*\n\n` +
            `to fight, you *shatter* a shard and *merge* with that mora:\n` +
            `*.awaken Nylon* — you literally become Nylon, full moveset, full vibes\n` +
            `*.shed* — go back to your normal self (base form)\n\n` +
            `the merge sticks........you stay merged until you awaken a different shard or shed\n\n` +
            `two merge tiers:\n` +
            `  🔥 *FULL* — you ARE the mora, full stats\n` +
            `  ✨ *PARTIAL* — your stats, their moveset\n\n` +
            `also........you can only hold *1* shard of each mora type by default........*.storage <Mora> buy* to hold more (Lucons sink, up to 10/type)\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 4 — GO HUNTING*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*.map* to see terrains........*.travel forest easy* to go somewhere........*.hunt* to find wild mora\n\n` +
            `a wild mora shows up........you fight it AS YOURSELF (not your party — that's old):\n` +
            `*.attack* — see your moveset........*.attack 1* — fire move 1\n` +
            `*.charge* — focus, restore combat energy\n` +
            `*.run* — flee\n\n` +
            `your base form has *Punch* and *Block*........that's it until you unlock styles or merge\n\n` +
            `when you win you get a shard drop (80% chance) PLUS faction-flavored choices:\n` +
            `  *.tame* / *.release* / *.sanctuary* (Harmony)\n` +
            `  *.execute* / *.conscript* / *.fortify* (Purity)\n` +
            `  *.devour* / *.bind* / *.harvest* (Rift)\n\n` +
            `🕶️ *Rift heads listen* — *.bind* drops a *CORRUPTED* shard.\n` +
            `corrupted = +25% damage when merged, but 10% chance of self-damage per move........high risk\n` +
            `awaken it with *.awaken corrupted Nylon*\n\n` +
            `*.return* to head back when you're done exploring\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 5 — STAT POINTS (LEVEL UP TO GROW)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `every level up gives you *3 stat points*........you choose where they go\n\n` +
            `5 categories, all matter:\n` +
            `  ⚔️ *Melee* — more damage on base/style hits\n` +
            `  🌀 *Mora* — more damage on merge hits (the mora's power within you)\n` +
            `  ❤️ *Vit* — more max HP\n` +
            `  💨 *Speed* — dodge chance (cap 50%)\n` +
            `  🛡 *Def* — flat damage reduction taken\n\n` +
            `*.stats* — view your spread + unspent points\n` +
            `*.stats invest mora 3* — drop 3 points into Mora\n\n` +
            `pick a build........glass-cannon mora? tanky vit/def? speedy dodger? up to you\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 6 — SCROLLS & QUESTS (UNLOCK STYLES)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `merge moves come from shards........but PERMANENT fighting styles come from quests\n\n` +
            `quests are discovered by *SCROLLS* you find while hunting\n` +
            `each scroll grants a specific quest when you open it\n\n` +
            `*.scrolls* — what's in your scroll inventory\n` +
            `*.open Windworn* — read it, +1 Intelligence, quest auto-accepts\n` +
            `*.quests* — see what's active\n` +
            `*.styles* — view all 5 unlockable styles\n\n` +
            `current styles:\n` +
            `  🌬️ *Wind Step* (unaligned) — fast, never-miss leaps\n` +
            `  ☀️ *Sun Walk* (unaligned) — radiant strikes\n` +
            `  🌊 *Tide Veil* (Harmony) — Mending Wave heals you mid-fight\n` +
            `  🗿 *Bone Crush* (Purity) — Iron Stance brace + counter\n` +
            `  🕳️ *Void Sever* (Rift) — Void Drain refunds energy on hit\n\n` +
            `bigger scrolls (epic, legendary) start LONG QUESTS with chained steps........meet NPCs, prove yourself, etc\n` +
            `when those quests need you to find someone special, the bot will *DM you the hidden command* — keep an eye on your private chat\n\n` +
            `🔥 *FACTION RITES ON CORRUPTED SHARDS*\n` +
            `your faction gets a unique verb for the corrupted shards floating around:\n` +
            `  🌿 *Harmony* — *.purify <shard>* cleans a corrupted shard back to normal (costs 100 Lucons)\n` +
            `  🗡 *Purity* — *.destroy <shard>* shatters it for Resonance + faction points (free, no salvage)\n` +
            `  🕶️ *Rift* — *.bind* during a fight CREATES corrupted shards from defeated mora\n` +
            `the three rites make the corruption loop go round\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 7 — TRADE SHARDS WITH PLAYERS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `got a duplicate? want a rare one someone else has? *.trade* exists\n\n` +
            `*.trade @user Nylon Voltrix* — offer your Nylon for their Voltrix\n` +
            `*.trade accept* / *.trade reject* — answer an incoming offer\n` +
            `*.trade list* — see your pending offer\n\n` +
            `offers expire in 10 min........the swap is atomic, no shenanigans\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*STEP 8 — DAILY STUFF*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `claim your free stuff every day:\n` +
            `*.daily* — daily Lucons (keep your streak for bonuses!)\n` +
            `*.weekly* — bigger weekly reward\n\n` +
            `spend Lucons at the *.market* on items, gear, and shards\n\n` +

            `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*QUICK REFERENCE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*.profile* — your stats, rank, AND current merge state\n` +
            `*.shards* — your shard vault (the new combat currency)\n` +
            `*.awaken <name>* — merge with a shard\n` +
            `*.shed* — return to base form\n` +
            `*.attack* — see your full moveset (base + styles + merge)\n` +
            `*.storage [Mora]* — check shard caps · *.storage <Mora> buy* to upgrade (Lucons)\n` +
            `*.stats* / *.stats invest <cat> <n>* — distribute level-up points\n` +
            `*.scrolls* / *.open <name>* — discover and read quest scrolls\n` +
            `*.quests* / *.quest accept <id>* / *.styles* — unlock movesets\n` +
            `*.trade @user A B* — swap shards\n` +
            `*.purify <shard>* (Harmony) / *.destroy <shard>* (Purity) — faction rites on corrupted shards\n` +
            `*.gift* — check your post-wipe apology gift (claimable 48d after launch)\n` +
            `*.tamed* — your *legacy* mora collection (pre-rework)\n` +
            `*.heal* — heal yourself\n` +
            `*.lb* — leaderboard\n` +
            `*.help* — full command list\n\n` +

            `that's basically it bro........the merge loop is the heart of it now\n` +
            `defeat → shard → awaken → fight → swap when you find better → trade what you don't need\n\n` +
            `if something's confusing just ask in the group........or type *.help* for every command\n\n` +
            `now go out there and shatter some crystals 💎🔥`,
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        // If in onboarding, advance to age step
        if (players[senderId].onboardingStep === 'gender') {
          players[senderId].onboardingStep = 'age';
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text: `✅ Gender set to: *${players[senderId].gender}*!\n\n` + onboardingSystem.stepMessage('age', { username: players[senderId].username }),
            mentions: [senderId]
          }, { quoted: msg });
        }
        savePlayers(players);
        return sock.sendMessage(chatId, { text: `✅ Gender set to: *${players[senderId].gender}*` }, { quoted: msg });
      }

      // ── .age — set age during onboarding ────────────────
      if (command === "age") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
        const p = players[senderId];
        const ageInput = args.join(" ").trim();
        if (!ageInput) {
          return sock.sendMessage(chatId, {
            text: onboardingSystem.stepMessage('age', { username: p.username }),
            mentions: [senderId]
          }, { quoted: msg });
        }
        const age = parseInt(ageInput, 10);
        if (isNaN(age) || age < 10 || age > 99) {
          return sock.sendMessage(chatId, { text: "❌ Enter a valid age (*10-99*)." }, { quoted: msg });
        }
        p.age = age;
        // If in onboarding, advance to icon step
        if (p.onboardingStep === 'age') {
          p.onboardingStep = 'icon';
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text: `✅ Age set to *${age}*!\n\n` + onboardingSystem.stepMessage('icon', { username: p.username }),
            mentions: [senderId]
          }, { quoted: msg });
        }
        savePlayers(players);
        return sock.sendMessage(chatId, { text: `✅ Age set to: *${age}*` }, { quoted: msg });
      }

      // ── .skip-icon — skip icon during onboarding ─────────
      if (command === "skip-icon" || command === "skipicon") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
        const p = players[senderId];
        if (p.onboardingStep === 'icon') {
          p.onboardingStep = 'faction';
          savePlayers(players);
          return sock.sendMessage(chatId, {
            text: onboardingSystem.stepMessage('faction', { username: p.username }),
            mentions: [senderId]
          }, { quoted: msg });
        }
        return sock.sendMessage(chatId, { text: "✅ Icon skipped." }, { quoted: msg });
      }

      // ============================
      // COMPANION SYSTEM
      // ============================
      if (command === "companion") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
      if (command === "equip-achievement") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
      if (command === "unequip-achievement") {
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
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
        const warnName = players[tid]?.username || '???';
        const adminName = players[senderId]?.username || '???';
        return sock.sendMessage(chatId, {
          text: `⚠️ @${tid.split("@")[0]} *${warnName}* has been warned!\n\n📝 Reason: _${reason}_\n⚠️ Total warnings: *${count}*\n👤 By: *${adminLabel}*`,
          mentions: [tid],
        }, { quoted: msg });
      }

      if (command === "warns") {
        const mentioned = getMentionedJids(msg);
        const replied = getRepliedJid(msg);
        const targetId = normJid(mentioned[0] || replied || senderId);
        const warns = loadWarns();
        const userWarns = warns[targetId] || [];
        const warnsName = players[targetId]?.username || '???';
        if (!userWarns.length) {
          return sock.sendMessage(chatId, { text: `✅ @${targetId.split("@")[0]} *${warnsName}* has no warnings.`, mentions: [targetId] }, { quoted: msg });
        }
        const list = userWarns.map((w, i) => `  *${i + 1}.* ${w.reason} _(${w.date})_`).join("\n");
        return sock.sendMessage(chatId, {
          text: `⚠️ *WARNINGS* for @${targetId.split("@")[0]} *${warnsName}*\n\n${list}\n\nTotal: *${userWarns.length}*`,
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
        const adminName = players[senderId]?.username || '???';
        return sock.sendMessage(chatId, {
          text: `✅ Removed latest warning from @${tid.split("@")[0]}.\nRemaining: *${(warns[tid] || []).length}*\n👤 By: *${adminLabel}*`,
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
          const promoName = players[target]?.username || '???';
          const adminName = players[senderId]?.username || '???';
          await sock.groupParticipantsUpdate(chatId, [target], "promote");
          return sock.sendMessage(chatId, {
            text: `👑 @${target.split("@")[0]} *${promoName}* has been promoted to admin!\n👤 By: *${adminLabel}*`,
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
          const demoName = players[target]?.username || '???';
          const adminName = players[senderId]?.username || '???';
          await sock.groupParticipantsUpdate(chatId, [target], "demote");
          return sock.sendMessage(chatId, {
            text: `⬇️ @${target.split("@")[0]} *${demoName}* has been demoted from admin.\n👤 By: *${adminLabel}*`,
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
          const adminName = players[senderId]?.username || '???';
          await sock.groupParticipantsUpdate(chatId, [target], "remove");
          return sock.sendMessage(chatId, {
            text: `👢 @${target.split("@")[0]} has been kicked from the group.\n👤 By: *${adminLabel}*`,
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

        // Hidden tag — pull every group participant and pass them in `mentions`
        // WITHOUT writing @handles in the visible text. WhatsApp fires a push
        // notification to every mentioned user but the message reads clean.
        // Falls back to a normal send if metadata fetch fails (e.g. DMs).
        let participantJids = [];
        if (isGroupJid(chatId)) {
          try {
            const meta = await sock.groupMetadata(chatId);
            participantJids = (meta?.participants || []).map(p => p.id).filter(Boolean);
          } catch (e) {
            console.log("[announce] groupMetadata failed:", e?.message || e);
          }
        }

        return sock.sendMessage(chatId, {
          text:
            `╔═══════════════════════════╗\n` +
            `║   📢  *A N N O U N C E M E N T*   ║\n` +
            `╚═══════════════════════════╝\n\n` +
            `${announcement}\n\n` +
            `_— ${players[senderId]?.username || "Architect"}_`,
          mentions: participantJids,
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
        const mentions = [];
        for (const num of sudos) {
          const cleanNum = String(num).replace(/\D/g, "");
          const jid = `${cleanNum}@s.whatsapp.net`;
          const displayName = players[jid]?.username || players[jid]?.name || null;
          const waName = pushNameCache[jid] || pushNameCache[`${cleanNum}@s.whatsapp.net`] || null;
          const tag = displayName ? `@${displayName}` : `@${cleanNum}`;
          const waLabel = waName ? ` _(${waName})_` : '';
          mentions.push(jid);
          if (throneNum && cleanNum === throneNum) {
            throneSection = `⚔️👑 *RIGHT-HAND MAN*\n  ${tag}${waLabel}\n\n`;
          } else {
            regularSudos.push(`  *${regularSudos.length + 1}.* ${tag}${waLabel}`);
          }
        }
        const sudoSection = regularSudos.length ? `🛡️ *SUDOS*\n${regularSudos.join("\n")}` : "";
        return sock.sendMessage(chatId, {
          text: `👑 *HIERARCHY*\n\n${throneSection}${sudoSection}`,
          mentions,
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
    // Single source of truth — text + canvas pull from the SAME sorted list
    // so #1 in the image == #1 in the text. Was using two different sorts
    // (text by aura/tamed/lucons, canvas by level only) which produced wildly
    // different rankings.
    const sortedTop = lb.getGlobalLeaderboardData(players);
    const text = lb.getGlobalLeaderboard(players);

    // Send interactive leaderboard menu
    await lb.sendLeaderboardMenu(sock, chatId, msg);

    try {
      const topPlayers = sortedTop
        .filter(p => p.username && p.level)
        .map((p, i) => ({
          rank: i + 1,
          username: p.username,
          level: p.level || 1,
          faction: p.faction || "neutral",
          xp: p.xp || 0,
          aura: p.aura || 0,
          totalCreations: p.totalCreations || 0,
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
          const adminName = players[senderId]?.username || '???';
          return mentionTag(sock, chatId, targetId, `✅ Unbanned: {mention}\n👤 By: *${adminLabel}*`, msg);
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
        const adminName = players[senderId]?.username || '???';
        return mentionTag(
          sock, chatId, targetId,
          `⛔ Banned: {mention}\n📝 Reason: ${reasonText}` + (minutes ? `\n⏳ Auto-unban: ${minutes} min` : "") + `\n👤 By: *${adminLabel}*`,
          msg
        );
      }


      // ── HELP SYSTEM ────────────────────────────────────────────
      // .help        → main menu (Game Menu + Bot Menu)
      // .help-game   → game category list / category detail
      // .help-bot    → bot category list / category detail
      if (command === "help" || command === "help-game" || command === "help-bot") { try {
        const p = players[senderId];
        const sub = String(args[0] || "").toLowerCase().trim();

        // ── .help — Main menu ──
        if (command === "help") {
          const text = helpUI.buildMainMenuText(p);
          buttonsSystem.mapButtons({
            "🎮 Game Menu": `${PREFIX}help-game`,
            "🛡️ Bot Menu": `${PREFIX}help-bot`,
          });
          return sendButtons(sock, chatId, text,
            ["🎮 Game Menu", "🛡️ Bot Menu"],
            { footer: "Tap a section or type .help-game / .help-bot", quoted: msg }
          );
        }

        // ── .help-game — Game menu / category detail ──
        if (command === "help-game") {
          const validGameCats = require("./systems/commandRegistry").getGameCategories();
          const catIds = validGameCats.map(c => c.id);
          if (sub && catIds.includes(sub)) {
            const text = helpUI.buildGameCategoryText(sub);
            if (!text) return sock.sendMessage(chatId, { text: "No commands in that category." }, { quoted: msg });
            return sock.sendMessage(chatId, { text }, { quoted: msg });
          }
          // Game category menu — show as text with clickable category names
          const text = helpUI.buildGameMenuText();
          // Map the top 8 categories to buttons for quick access
          const topCats = validGameCats.slice(0, 8);
          const btnLabels = topCats.map(c => `${c.emoji} ${c.name}`);
          const btnMap = {};
          for (const c of topCats) btnMap[`${c.emoji} ${c.name}`] = `${PREFIX}help-game ${c.id}`;
          btnMap["🔙 Back"] = `${PREFIX}help`;
          buttonsSystem.mapButtons(btnMap);
          return sendButtons(sock, chatId, text + "\n\n💠 *Quick categories:*", btnLabels,
            { footer: "Or type .help-game <name>", quoted: msg }
          );
        }

        // ── .help-bot — Bot menu / category detail ──
        if (command === "help-bot") {
          const validBotCats = require("./systems/commandRegistry").getBotCategories();
          const catIds = validBotCats.map(c => c.id);
          if (sub && catIds.includes(sub)) {
            const text = helpUI.buildBotCategoryText(sub);
            if (!text) return sock.sendMessage(chatId, { text: "No commands in that category." }, { quoted: msg });
            return sock.sendMessage(chatId, { text }, { quoted: msg });
          }
          // Bot category menu
          const text = helpUI.buildBotMenuText();
          const btnLabels = validBotCats.map(c => `${c.emoji} ${c.name}`);
          const btnMap = {};
          for (const c of validBotCats) btnMap[`${c.emoji} ${c.name}`] = `${PREFIX}help-bot ${c.id}`;
          btnMap["🔙 Back"] = `${PREFIX}help`;
          buttonsSystem.mapButtons(btnMap);
          return sendButtons(sock, chatId, text + "\n\n💠 *Quick categories:*", btnLabels,
            { footer: "Or type .help-bot <name>", quoted: msg }
          );
        }
      } catch (helpErr) {
        console.log("[help-handler]", helpErr?.message || helpErr);
        try {
          await sock.sendMessage(chatId, {
            text: `Help temporarily unavailable.

Try: *.help-game* or *.help-bot*`,
          }, { quoted: msg });
        } catch {}
        return;
      } }
      if (command === "factioninfo" || command === "faction" && !args[0]) {
        const p = players[senderId];
        if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" });

        // Faction info shown as formatted text below

        const key = String(args[0] || "").toLowerCase().trim();
        const info = factionMarketSystem.FACTION_BENEFITS?.[key];
        if (!info) {
          // If no specific faction requested, show the user's faction info
          if (p.faction) {
            const factionInfo = factionMarketSystem.FACTION_BENEFITS?.[p.faction];
            if (factionInfo) {
              const perks     = (factionInfo.perks     || []).map(p => `  ✅ ${p}`).join("\n");
              const drawbacks = (factionInfo.drawbacks || []).map(d => `  ❌ ${d}`).join("\n");
              return sock.sendMessage(chatId, {
                text:
                  ui.header(factionInfo.name || p.faction, factionInfo.emoji || '⚔️') + `\n\n` +
                  `_"${factionInfo.belief || ""}"_\n\n` +
                  ui.subheader('BENEFITS', '✅') + `\n${perks || "  None listed"}\n\n` +
                  ui.subheader('DRAWBACKS', '❌') + `\n${drawbacks || "  None listed"}\n\n` +
                  ui.divider() + `\n` +
                  `Use *.fbuy <item>* to access this faction's market.`,
              }, { quoted: msg });
            }
          }
          return sock.sendMessage(chatId, {
            text: "❌ Use: *.factioninfo harmony / purity / rift*",
          }, { quoted: msg });
        }
        const perks     = (info.perks     || []).map(p => `  ✅ ${p}`).join("\n");
        const drawbacks = (info.drawbacks || []).map(d => `  ❌ ${d}`).join("\n");
        return sock.sendMessage(chatId, {
          text:
            ui.header(info.name || key, info.emoji || '⚔️') + `\n\n` +
            `_"${info.belief || ""}"_\n\n` +
            ui.subheader('BENEFITS', '✅') + `\n${perks || "  None listed"}\n\n` +
            ui.subheader('DRAWBACKS', '❌') + `\n${drawbacks || "  None listed"}\n\n` +
            ui.divider() + `\n` +
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
      const _msg0 = messages?.[0];
      const _chat = _msg0?.key?.remoteJid || "?";
      const _text = _msg0?.message?.conversation || _msg0?.message?.extendedTextMessage?.text || "";
      console.log(`[handler-error] chat=${_chat} text=${JSON.stringify(_text).slice(0,120)}`);
      console.log(err?.stack || err);
      try {
        if (_chat) {
          await sock.sendMessage(_chat, {
            text: `⚠️ The Rift hiccupped on that command. The owner has been notified — try again or use a different command.`,
          }, { quoted: _msg0 });
        }
      } catch {}
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

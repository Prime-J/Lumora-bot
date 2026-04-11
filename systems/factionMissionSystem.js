// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA FACTION MISSION SYSTEM  v2.0                        ║
// ╠═══════════════════════════════════════════════════════════════╣
// ║  Replaces the old 3-mission placeholder with a full system:  ║
// ║  • 5 missions per faction (rotating weekly)                  ║
// ║  • Each mission has a clear goal, reward, and track field    ║
// ║  • Missions are TRACKED — not just claimed manually          ║
// ║  • Faction points from missions go to the season leaderboard ║
// ║  • .missions — see current missions and progress             ║
// ║  • .complete <id> — claim a completed mission                ║
// ║  • Progress auto-tracked via hook functions called from      ║
// ║    battle, hunt, and market events                           ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const progressSystem = require("./factionProgressSystem");

const DATA_DIR     = path.join(__dirname, "..", "data");
const MISSIONS_FILE = path.join(DATA_DIR, "factionMissions.json");

const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─";

function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 — MISSION DEFINITIONS
// Each mission has:
//   id:         Unique across all factions
//   faction:    Which faction it belongs to
//   title:      Short name
//   desc:       What to do (shown in .missions)
//   trackKey:   What player stat/event to track
//   trackGoal:  How many times to complete it
//   rewardFP:   Faction Points awarded on complete
//   rewardXP:   Player XP on complete
//   rewardLucons: Lucons on complete
//   resetType:  "weekly" | "never" (never = one-time achievement)
// ══════════════════════════════════════════════════════════════
const MISSIONS = {
  // ─── HARMONY MISSIONS ──────────────────────────────────────
  harmony: [
    {
      id:           "HM_01",
      faction:      "harmony",
      title:        "The Healer's Path",
      desc:         "Heal your Mora or yourself *3 times* using consumables.",
      trackKey:     "consumableUses",
      trackGoal:    3,
      rewardFP:     25,
      rewardXP:     40,
      rewardLucons: 80,
      resetType:    "weekly",
      icon:         "❤️",
    },
    {
      id:           "HM_02",
      faction:      "harmony",
      title:        "Purifier's Duty",
      desc:         "Cleanse *2 corrupted Mora* using Cleanse Shards or Purification Scrolls.",
      trackKey:     "moraCleansed",
      trackGoal:    2,
      rewardFP:     40,
      rewardXP:     60,
      rewardLucons: 120,
      resetType:    "weekly",
      icon:         "🧼",
    },
    {
      id:           "HM_03",
      faction:      "harmony",
      title:        "The Bond Forger",
      desc:         "Successfully catch *3 wild Mora* in hunting grounds.",
      trackKey:     "moraCaught",
      trackGoal:    3,
      rewardFP:     35,
      rewardXP:     55,
      rewardLucons: 100,
      resetType:    "weekly",
      icon:         "🔗",
    },
    {
      id:           "HM_04",
      faction:      "harmony",
      title:        "Rift Scout",
      desc:         "Complete *5 hunts* in any terrain (use .hunt).",
      trackKey:     "huntsCompleted",
      trackGoal:    5,
      rewardFP:     30,
      rewardXP:     50,
      rewardLucons: 90,
      resetType:    "weekly",
      icon:         "🌲",
    },
    {
      id:           "HM_05",
      faction:      "harmony",
      title:        "Keeper of Balance",
      desc:         "Win *2 PvP battles* while your active Mora are not corrupted.",
      trackKey:     "cleanPvpWins",
      trackGoal:    2,
      rewardFP:     50,
      rewardXP:     80,
      rewardLucons: 150,
      resetType:    "weekly",
      icon:         "🌿",
    },
  ],

  // ─── PURITY MISSIONS ───────────────────────────────────────
  purity: [
    {
      id:           "PU_01",
      faction:      "purity",
      title:        "Field Discipline",
      desc:         "Complete *5 hunts* in terrain rated Dangerous or Nightmare.",
      trackKey:     "dangerousHunts",
      trackGoal:    5,
      rewardFP:     30,
      rewardXP:     50,
      rewardLucons: 100,
      resetType:    "weekly",
      icon:         "⚔️",
    },
    {
      id:           "PU_02",
      faction:      "purity",
      title:        "Rift Slayer",
      desc:         "Defeat *3 corrupted Mora* in wild battles.",
      trackKey:     "corruptedDefeated",
      trackGoal:    3,
      rewardFP:     45,
      rewardXP:     65,
      rewardLucons: 130,
      resetType:    "weekly",
      icon:         "🗡",
    },
    {
      id:           "PU_03",
      faction:      "purity",
      title:        "Combat Record",
      desc:         "Win *3 PvP battles* against any opponent.",
      trackKey:     "pvpWins",
      trackGoal:    3,
      rewardFP:     40,
      rewardXP:     70,
      rewardLucons: 120,
      resetType:    "weekly",
      icon:         "🏆",
    },
    {
      id:           "PU_04",
      faction:      "purity",
      title:        "Precision Strike",
      desc:         "Land *5 critical hits* across any battles this week.",
      trackKey:     "critHitsLanded",
      trackGoal:    5,
      rewardFP:     35,
      rewardXP:     55,
      rewardLucons: 90,
      resetType:    "weekly",
      icon:         "🎯",
    },
    {
      id:           "PU_05",
      faction:      "purity",
      title:        "Order's Mandate",
      desc:         "Reach level *5* on any Mora in your party.",
      trackKey:     "moraLevelFive",
      trackGoal:    1,
      rewardFP:     60,
      rewardXP:     100,
      rewardLucons: 200,
      resetType:    "never",
      icon:         "🛡️",
    },
  ],

  // ─── RIFT MISSIONS ─────────────────────────────────────────
  rift: [
    {
      id:           "RF_01",
      faction:      "rift",
      title:        "Chaos Harvest",
      desc:         "Encounter and battle *3 corrupted Mora* (win or lose).",
      trackKey:     "corruptedEncountered",
      trackGoal:    3,
      rewardFP:     35,
      rewardXP:     55,
      rewardLucons: 110,
      resetType:    "weekly",
      icon:         "☠",
    },
    {
      id:           "RF_02",
      faction:      "rift",
      title:        "Rift Pusher",
      desc:         "Let any of your Mora's Primordial Energy reach *50 or above*.",
      trackKey:     "highPeReached",
      trackGoal:    1,
      rewardFP:     40,
      rewardXP:     60,
      rewardLucons: 120,
      resetType:    "weekly",
      icon:         "🌀",
    },
    {
      id:           "RF_03",
      faction:      "rift",
      title:        "Shadow Tamer",
      desc:         "Catch a *Shadow-type Mora* in any terrain.",
      trackKey:     "shadowMoraCaught",
      trackGoal:    1,
      rewardFP:     50,
      rewardXP:     80,
      rewardLucons: 150,
      resetType:    "weekly",
      icon:         "🌑",
    },
    {
      id:           "RF_04",
      faction:      "rift",
      title:        "Seeker's Trial",
      desc:         "Complete *5 hunts* in Nightmare difficulty.",
      trackKey:     "nightmareHunts",
      trackGoal:    5,
      rewardFP:     55,
      rewardXP:     85,
      rewardLucons: 160,
      resetType:    "weekly",
      icon:         "🕶",
    },
    {
      id:           "RF_05",
      faction:      "rift",
      title:        "Power at Any Cost",
      desc:         "Win a PvP battle using a *corrupted Mora* as your active fighter.",
      trackKey:     "corruptedPvpWin",
      trackGoal:    1,
      rewardFP:     70,
      rewardXP:     100,
      rewardLucons: 200,
      resetType:    "weekly",
      icon:         "👁",
    },
  ],
};

// ══════════════════════════════════════════════════════════════
// SECTION 2 — PROGRESS FILE HELPERS
// Player progress is stored in data/factionMissions.json
// Structure: { playerId: { missionId: { progress, completed, completedWeek } } }
// ══════════════════════════════════════════════════════════════
function loadProgress() {
  try {
    if (!fs.existsSync(MISSIONS_FILE)) {
      fs.writeFileSync(MISSIONS_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    return JSON.parse(fs.readFileSync(MISSIONS_FILE, "utf8"));
  } catch { return {}; }
}

function saveProgress(data) {
  try { fs.writeFileSync(MISSIONS_FILE, JSON.stringify(data, null, 2)); }
  catch (e) { console.log("[Missions] saveProgress error:", e?.message); }
}

function getCurrentWeek() {
  const now  = new Date();
  const year = now.getFullYear();
  const d1   = new Date(year, 0, 1);
  const week = Math.ceil(((now - d1) / 86400000 + d1.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function getPlayerProgress(allProgress, playerId, missionId) {
  return allProgress?.[playerId]?.[missionId] || { progress: 0, completed: false, completedWeek: null };
}

function isCompletedThisWeek(entry, mission) {
  if (!entry.completed) return false;
  if (mission.resetType === "never") return true;
  return entry.completedWeek === getCurrentWeek();
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — HOOK FUNCTIONS
// Called from other systems when relevant events happen.
// Each returns nothing — silently updates progress.
// ══════════════════════════════════════════════════════════════

// Track any mission progress by trackKey and playerId
function trackProgress(playerId, faction, trackKey, amount = 1) {
  if (!faction || !MISSIONS[faction]) return;

  const allProgress = loadProgress();
  if (!allProgress[playerId]) allProgress[playerId] = {};

  const missions = MISSIONS[faction].filter(m => m.trackKey === trackKey);

  for (const mission of missions) {
    const entry = allProgress[playerId][mission.id] || { progress: 0, completed: false, completedWeek: null };

    // Don't double-track completed non-resettable missions
    if (mission.resetType === "never" && entry.completed) continue;

    // Reset weekly missions if new week
    if (mission.resetType === "weekly" && entry.completedWeek && entry.completedWeek !== getCurrentWeek()) {
      entry.progress   = 0;
      entry.completed  = false;
    }

    if (!entry.completed) {
      entry.progress = Math.min(mission.trackGoal, (entry.progress || 0) + amount);
    }

    allProgress[playerId][mission.id] = entry;
  }

  saveProgress(allProgress);
}

// Convenience wrappers called from other systems:
function onHealUsed(playerId, faction)                { trackProgress(playerId, faction, "consumableUses"); }
function onMoraCleansed(playerId, faction)            { trackProgress(playerId, faction, "moraCleansed"); }
function onMoraCaught(playerId, faction, moraType)    {
  trackProgress(playerId, faction, "moraCaught");
  if (String(moraType || "").toLowerCase() === "shadow") {
    trackProgress(playerId, faction, "shadowMoraCaught");
  }
}
function onHuntCompleted(playerId, faction, diffKey)  {
  trackProgress(playerId, faction, "huntsCompleted");
  if (["dangerous","nightmare"].includes(String(diffKey||"").toLowerCase())) {
    trackProgress(playerId, faction, "dangerousHunts");
  }
  if (String(diffKey||"").toLowerCase() === "nightmare") {
    trackProgress(playerId, faction, "nightmareHunts");
  }
}
function onPvpWin(playerId, faction, activeMoraCorrupted, cleanParty) {
  trackProgress(playerId, faction, "pvpWins");
  if (cleanParty) trackProgress(playerId, faction, "cleanPvpWins");
  if (activeMoraCorrupted) trackProgress(playerId, faction, "corruptedPvpWin");
}
function onCorruptedDefeated(playerId, faction)       { trackProgress(playerId, faction, "corruptedDefeated"); }
function onCorruptedEncountered(playerId, faction)    { trackProgress(playerId, faction, "corruptedEncountered"); }
function onCritHit(playerId, faction)                 { trackProgress(playerId, faction, "critHitsLanded"); }
function onHighPeReached(playerId, faction)           { trackProgress(playerId, faction, "highPeReached"); }
function onMoraLevelFive(playerId, faction)           { trackProgress(playerId, faction, "moraLevelFive"); }

// ══════════════════════════════════════════════════════════════
// SECTION 4 — COMMANDS
// ══════════════════════════════════════════════════════════════

// .missions — show current missions and progress
async function cmdMissions(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];

  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });
  if (!player.faction) {
    return sock.sendMessage(chatId, {
      text: "❌ Join a faction first to access missions.\n*.faction harmony / purity / rift*",
    }, { quoted: msg });
  }

  const missions    = MISSIONS[player.faction] || [];
  const allProgress = loadProgress();
  const week        = getCurrentWeek();

  const lines = missions.map(m => {
    const entry  = getPlayerProgress(allProgress, senderId, m.id);
    const done   = isCompletedThisWeek(entry, m);
    const prog   = done ? m.trackGoal : Math.min(entry.progress || 0, m.trackGoal);
    const bar    = `${prog}/${m.trackGoal}`;
    const status = done ? "✅ *CLAIMED*" : prog >= m.trackGoal ? "🎯 *READY TO CLAIM*" : `⏳ ${bar}`;
    const reset  = m.resetType === "never" ? "_One-time_" : `_Resets weekly_`;

    return (
      `${m.icon} *[${m.id}] ${m.title}*  ${reset}\n` +
      `📜 ${m.desc}\n` +
      `📊 Progress: ${status}\n` +
      `🎁 Rewards: *${m.rewardFP} FP* · *${m.rewardXP} XP* · *${m.rewardLucons} Lucons*`
    );
  });

  const completedCount = missions.filter(m => {
    const e = getPlayerProgress(allProgress, senderId, m.id);
    return isCompletedThisWeek(e, m);
  }).length;

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `📋  *FACTION MISSIONS*\n` +
      `${titleCase(player.faction).toUpperCase()} — Week *${week.split("-W")[1]}*\n` +
      `${DIV}\n\n` +
      `Completed this week: *${completedCount}/${missions.length}*\n\n` +
      `${SDIV}\n\n` +
      lines.join(`\n\n${SDIV}\n\n`) +
      `\n\n${DIV}\n` +
      `📖 Use *.complete <ID>* to claim a ready mission.\n` +
      `_Example: .complete HM_01_`,
  }, { quoted: msg });
}

// .complete <id> — claim a completed mission
async function cmdComplete(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });
  if (!player.faction) {
    return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });
  }

  const idArg = String(args[0] || "").toUpperCase().trim();
  if (!idArg) {
    return sock.sendMessage(chatId, {
      text: "❌ Usage: *.complete <mission id>*\nExample: *.complete HM_01*\nUse *.missions* to see your IDs.",
    }, { quoted: msg });
  }

  const missions = MISSIONS[player.faction] || [];
  const mission  = missions.find(m => m.id === idArg);

  if (!mission) {
    return sock.sendMessage(chatId, {
      text: `❌ Mission *${idArg}* not found for your faction.\nUse *.missions* to see available missions.`,
    }, { quoted: msg });
  }

  const allProgress = loadProgress();
  if (!allProgress[senderId]) allProgress[senderId] = {};

  const entry = allProgress[senderId][mission.id] || { progress: 0, completed: false, completedWeek: null };

  // Check if already claimed
  if (isCompletedThisWeek(entry, mission)) {
    return sock.sendMessage(chatId, {
      text: `✅ You already completed *${mission.title}* ${mission.resetType === "weekly" ? "this week" : "(one-time)"}!`,
    }, { quoted: msg });
  }

  // Check if goal reached
  if ((entry.progress || 0) < mission.trackGoal) {
    const remaining = mission.trackGoal - (entry.progress || 0);
    return sock.sendMessage(chatId, {
      text:
        `⏳ *${mission.title}* not yet complete.\n\n` +
        `📊 Progress: *${entry.progress || 0}/${mission.trackGoal}*\n` +
        `📜 ${mission.desc}\n\n` +
        `Still need: *${remaining} more*`,
    }, { quoted: msg });
  }

  // CLAIM REWARDS
  entry.completed     = true;
  entry.completedWeek = getCurrentWeek();
  allProgress[senderId][mission.id] = entry;
  saveProgress(allProgress);

  player.xp     = (player.xp     || 0) + mission.rewardXP;
  player.lucons = (player.lucons || 0) + mission.rewardLucons;

  savePlayers(players);
  progressSystem.addFactionPoints(player.faction, mission.rewardFP);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `${mission.icon}  *MISSION COMPLETE!*\n` +
      `${DIV}\n\n` +
      `*${mission.title}*\n` +
      `📜 _${mission.desc}_\n\n` +
      `🎁 *REWARDS*\n` +
      `├ 🏛 Faction Points: *+${mission.rewardFP}*\n` +
      `├ 🌟 Player XP:      *+${mission.rewardXP}*\n` +
      `└ 💰 Lucons:         *+${mission.rewardLucons}*\n\n` +
      `💳 Balance: *${player.lucons}*\n` +
      `${DIV}`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// Legacy function kept for backwards compatibility
// ══════════════════════════════════════════════════════════════
function getFactionMissions(faction) {
  return MISSIONS[faction] || [];
}
function completeMission(player, missionId) {
  return { ok: false, reason: "Use .complete <ID> command instead." };
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  // Commands
  cmdMissions,
  cmdComplete,

  // Tracking hooks (called from other systems)
  onHealUsed,
  onMoraCleansed,
  onMoraCaught,
  onHuntCompleted,
  onPvpWin,
  onCorruptedDefeated,
  onCorruptedEncountered,
  onCritHit,
  onHighPeReached,
  onMoraLevelFive,
  trackProgress,

  // Data
  MISSIONS,
  getCurrentWeek,

  // Legacy compat
  getFactionMissions,
  completeMission,
};
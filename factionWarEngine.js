// ============================
// FACTION WAR ENGINE (v2)
// Full tournament bracket, match flow, rewards, persistence
// ============================

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const WAR_DATA_PATH = path.join(DATA_DIR, "factionWars.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── War State ────────────────────────────────────────────────
let war = {
  status: "idle",       // idle | registration | active | finished
  round: 1,
  maxRounds: 1,
  participants: [],     // [{ id, faction, username, wins, losses }]
  matches: [],          // [{ p1, p2, winner, status: pending|active|done }]
  results: [],          // [{ round, p1, p2, winner, loser }]
  readyCheck: [],
  pendingWithdrawal: null,
  warCount: 0,
  startedAt: 0,
};

// ── Persistence ──────────────────────────────────────────────
function loadWarData() {
  try {
    if (fs.existsSync(WAR_DATA_PATH)) {
      return JSON.parse(fs.readFileSync(WAR_DATA_PATH, "utf8"));
    }
  } catch {}
  return { warCount: 0, history: [] };
}

function saveWarData() {
  const data = loadWarData();
  data.warCount = war.warCount;
  fs.writeFileSync(WAR_DATA_PATH, JSON.stringify(data, null, 2));
}

function saveWarHistory(champion, runnerUp) {
  const data = loadWarData();
  if (!data.history) data.history = [];
  data.history.push({
    war: war.warCount,
    champion: champion,
    runnerUp: runnerUp,
    participants: war.participants.length,
    date: new Date().toISOString(),
    results: war.results,
  });
  // Keep last 20 wars
  if (data.history.length > 20) data.history = data.history.slice(-20);
  fs.writeFileSync(WAR_DATA_PATH, JSON.stringify(data, null, 2));
}

// ── Announcements ────────────────────────────────────────────
const ANNOUNCEMENTS = [
  "The Lumora Bell tolls! A great war is upon us!",
  "Tension rises across the factions! The War draws near!",
  "The stars align... warriors, prepare for combat!",
  "The Rift pulses with energy — a Faction War has been declared!",
  "Crystals shatter as the call to arms echoes through the land!",
];

const MATCH_INTROS = [
  "The arena trembles as two warriors face off!",
  "The crowd goes silent... it's time.",
  "Crystals flare! The next match is about to begin!",
  "The Rift itself watches this battle with interest...",
  "Two factions clash — only one will advance!",
];

// ── Core Functions ───────────────────────────────────────────

function initWar() {
  const data = loadWarData();
  data.warCount = (data.warCount || 0) + 1;
  fs.writeFileSync(WAR_DATA_PATH, JSON.stringify(data, null, 2));

  war.status = "registration";
  war.round = 1;
  war.maxRounds = 1;
  war.participants = [];
  war.matches = [];
  war.results = [];
  war.warCount = data.warCount;
  war.readyCheck = [];
  war.pendingWithdrawal = null;
  war.startedAt = Date.now();

  const msg = ANNOUNCEMENTS[Math.floor(Math.random() * ANNOUNCEMENTS.length)];
  return { msg, count: data.warCount };
}

function registerPlayer(playerId, playersDB) {
  if (war.status !== "registration") {
    return { ok: false, msg: "Registration is not open right now." };
  }

  const p = playersDB[playerId];
  if (!p) return { ok: false, msg: "Register in Lumora first! (.start)" };
  if (!p.username) return { ok: false, msg: "Set a username first! (.set-username)" };
  if (!p.faction) return { ok: false, msg: "You must belong to a faction to join the War!" };

  if (war.participants.find((x) => x.id === playerId)) {
    return { ok: false, msg: "You're already registered!" };
  }

  // Max 5 per faction
  const myFaction = p.faction.toLowerCase();
  const factionCount = war.participants.filter((x) => x.faction.toLowerCase() === myFaction).length;
  if (factionCount >= 5) {
    return { ok: false, msg: `*${myFaction.toUpperCase()}* is full (5/5)! No more slots.` };
  }

  war.participants.push({
    id: playerId,
    faction: p.faction,
    username: p.username,
    wins: 0,
    losses: 0,
  });

  return { ok: true, count: war.participants.length };
}

// Smart bracket: tries to match different factions first
function createBrackets() {
  if (war.participants.length < 2) return false;

  const shuffled = [...war.participants].sort(() => 0.5 - Math.random());
  war.matches = [];
  war.readyCheck = [];

  const matchedIds = new Set();

  // Pair different factions first
  for (let i = 0; i < shuffled.length; i++) {
    if (matchedIds.has(shuffled[i].id)) continue;
    for (let j = i + 1; j < shuffled.length; j++) {
      if (matchedIds.has(shuffled[j].id)) continue;
      if (shuffled[i].faction.toLowerCase() !== shuffled[j].faction.toLowerCase()) {
        war.matches.push({
          p1: shuffled[i].id,
          p2: shuffled[j].id,
          winner: null,
          status: "pending",
        });
        matchedIds.add(shuffled[i].id);
        matchedIds.add(shuffled[j].id);
        break;
      }
    }
  }

  // Pair leftovers (same faction if needed)
  const leftovers = shuffled.filter((p) => !matchedIds.has(p.id));
  for (let i = 0; i < leftovers.length - 1; i += 2) {
    war.matches.push({
      p1: leftovers[i].id,
      p2: leftovers[i + 1].id,
      winner: null,
      status: "pending",
    });
  }

  // Activate first match
  if (war.matches.length > 0) war.matches[0].status = "active";

  // Calculate max rounds based on bracket size
  war.maxRounds = Math.ceil(Math.log2(war.participants.length));
  war.status = "active";
  war.round = 1;

  return true;
}

function getActiveMatch() {
  return war.matches.find((m) => m.status === "active") || null;
}

function showNextMatch() {
  let active = getActiveMatch();
  if (active) return active;

  // Activate next pending match
  const next = war.matches.find((m) => m.status === "pending");
  if (next) {
    next.status = "active";
    war.readyCheck = [];
    return next;
  }
  return null;
}

// Report match winner - advances bracket
function reportMatchWinner(winnerId) {
  const match = getActiveMatch();
  if (!match) return { ok: false, msg: "No active match to report." };

  if (winnerId !== match.p1 && winnerId !== match.p2) {
    return { ok: false, msg: "This player is not in the current match." };
  }

  const loserId = winnerId === match.p1 ? match.p2 : match.p1;
  match.winner = winnerId;
  match.status = "done";
  war.readyCheck = [];

  // Update participant stats
  const wp = war.participants.find((x) => x.id === winnerId);
  const lp = war.participants.find((x) => x.id === loserId);
  if (wp) wp.wins++;
  if (lp) lp.losses++;

  war.results.push({
    round: war.round,
    p1: match.p1,
    p2: match.p2,
    winner: winnerId,
    loser: loserId,
  });

  // Check if current round is done
  const pendingInRound = war.matches.filter((m) => m.status !== "done");
  if (pendingInRound.length === 0) {
    // All matches this round are done - advance to next round
    const winners = war.matches.filter((m) => m.winner).map((m) => m.winner);

    if (winners.length <= 1) {
      // Tournament is over
      war.status = "finished";
      const champion = war.participants.find((x) => x.id === winners[0]);
      const runnerUp = war.participants.find((x) => x.id === loserId);
      saveWarHistory(champion?.id, runnerUp?.id);
      return {
        ok: true,
        finished: true,
        champion: champion?.id || winners[0],
        runnerUp: runnerUp?.id || loserId,
      };
    }

    // Create next round
    war.round++;
    war.matches = [];
    for (let i = 0; i < winners.length - 1; i += 2) {
      war.matches.push({
        p1: winners[i],
        p2: winners[i + 1],
        winner: null,
        status: "pending",
      });
    }

    // Handle odd winner (bye)
    if (winners.length % 2 !== 0) {
      const byePlayer = winners[winners.length - 1];
      war.matches.push({
        p1: byePlayer,
        p2: null,
        winner: byePlayer,
        status: "done",
      });
      war.results.push({
        round: war.round,
        p1: byePlayer,
        p2: null,
        winner: byePlayer,
        loser: null,
      });
    }

    // Activate first match of new round
    const nextMatch = war.matches.find((m) => m.status === "pending");
    if (nextMatch) nextMatch.status = "active";

    return { ok: true, newRound: true, round: war.round };
  }

  // More matches left in this round
  const nextMatch = showNextMatch();
  return { ok: true, nextMatch };
}

// Mark player ready
function markReady(playerId) {
  const match = getActiveMatch();
  if (!match) return { ok: false, msg: "No active match." };
  if (playerId !== match.p1 && playerId !== match.p2) {
    return { ok: false, msg: "You're not in this match!" };
  }
  if (!war.readyCheck.includes(playerId)) {
    war.readyCheck.push(playerId);
  }
  const bothReady = war.readyCheck.includes(match.p1) && war.readyCheck.includes(match.p2);
  return { ok: true, bothReady };
}

// Withdraw with penalties
function withdrawPlayer(playerId) {
  const idx = war.participants.findIndex((x) => x.id === playerId);
  if (idx === -1) return { ok: false, msg: "You're not in the war!" };

  war.participants.splice(idx, 1);

  // If player was in an active match, opponent auto-wins
  const match = getActiveMatch();
  if (match && (match.p1 === playerId || match.p2 === playerId)) {
    const winnerId = match.p1 === playerId ? match.p2 : match.p1;
    return reportMatchWinner(winnerId);
  }

  // Remove from pending matches
  war.matches = war.matches.filter((m) => {
    if (m.status === "done") return true;
    if (m.p1 === playerId || m.p2 === playerId) return false;
    return true;
  });

  return { ok: true };
}

// Get bracket text for viewing
function getBracketText(playersDB) {
  if (war.status === "idle") return "No war is active right now.";

  const lines = [];
  lines.push(`*FACTION WAR #${war.warCount}*  —  Round ${war.round}`);
  lines.push(`Status: *${war.status.toUpperCase()}*`);
  lines.push(`Fighters: ${war.participants.length}\n`);

  if (war.status === "registration") {
    lines.push(`*REGISTERED FIGHTERS:*`);
    for (const p of war.participants) {
      const fIcon = p.faction === "harmony" ? "🌿" : p.faction === "purity" ? "⚔️" : p.faction === "rift" ? "🔶" : "⚡";
      lines.push(`  ${fIcon} ${p.username} (${p.faction})`);
    }
    lines.push(`\nUse *.war join* to enter!`);
    return lines.join("\n");
  }

  lines.push(`┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`);

  for (let i = 0; i < war.matches.length; i++) {
    const m = war.matches[i];
    const p1Name = war.participants.find((x) => x.id === m.p1)?.username || playersDB?.[m.p1]?.username || "???";
    const p2Name = m.p2 ? (war.participants.find((x) => x.id === m.p2)?.username || playersDB?.[m.p2]?.username || "???") : "BYE";

    let statusIcon = "⏳";
    if (m.status === "active") statusIcon = "⚡";
    if (m.status === "done") statusIcon = "✅";

    let winnerMark = "";
    if (m.winner === m.p1) winnerMark = ` 🏆`;
    if (m.winner === m.p2) winnerMark = ` 🏆`;

    const p1Display = m.winner === m.p1 ? `*${p1Name}* 🏆` : p1Name;
    const p2Display = m.winner === m.p2 ? `*${p2Name}* 🏆` : p2Name;

    lines.push(`${statusIcon} Match ${i + 1}:  ${p1Display}  vs  ${p2Display}`);
  }

  lines.push(`┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`);

  // Show standings
  const sorted = [...war.participants].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  lines.push(`\n*STANDINGS:*`);
  for (const p of sorted) {
    const fIcon = p.faction === "harmony" ? "🌿" : p.faction === "purity" ? "⚔️" : p.faction === "rift" ? "🔶" : "⚡";
    lines.push(`  ${fIcon} ${p.username}  W:${p.wins} L:${p.losses}`);
  }

  return lines.join("\n");
}

function getMatchIntro() {
  return MATCH_INTROS[Math.floor(Math.random() * MATCH_INTROS.length)];
}

function getWarHistory() {
  const data = loadWarData();
  return data.history || [];
}

// ── REWARDS ─────────────────────────────────────────────────
const WAR_REWARDS = {
  champion: { lucons: 3000, aura: 50, resonance: 30, title: "War Champion" },
  runnerUp: { lucons: 1500, aura: 25, resonance: 15 },
  winner:   { lucons: 500, aura: 10, resonance: 5 },
  loser:    { lucons: 100, aura: 0, resonance: 2 },
  participation: { lucons: 200, resonance: 3 },
};

function applyWarRewards(playersDB, savePlayers) {
  const rewards = [];

  for (const p of war.participants) {
    const player = playersDB[p.id];
    if (!player) continue;

    let tier = "participation";
    if (war.status === "finished") {
      const lastResult = war.results[war.results.length - 1];
      if (lastResult?.winner === p.id) tier = "champion";
      else if (lastResult?.loser === p.id) tier = "runnerUp";
      else if (p.wins > 0) tier = "winner";
      else tier = "loser";
    }

    const r = WAR_REWARDS[tier];
    player.lucons = (player.lucons || 0) + r.lucons;
    player.aura = (player.aura || 0) + (r.aura || 0);
    player.resonance = (player.resonance || 0) + (r.resonance || 0);

    rewards.push({
      id: p.id,
      username: p.username,
      tier,
      lucons: r.lucons,
      aura: r.aura || 0,
      resonance: r.resonance || 0,
    });
  }

  savePlayers(playersDB);
  return rewards;
}

module.exports = {
  war,
  initWar,
  registerPlayer,
  createBrackets,
  showNextMatch,
  getActiveMatch,
  reportMatchWinner,
  markReady,
  withdrawPlayer,
  getBracketText,
  getMatchIntro,
  getWarHistory,
  applyWarRewards,
  WAR_REWARDS,
};

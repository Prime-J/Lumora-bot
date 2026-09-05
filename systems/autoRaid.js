// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA AUTO-RAIDS  v0.7.0                                     ║
// ║                                                                ║
// ║  Kael's teleporter spawns autonomously. All 3 faction chats   ║
// ║  get pinged. First player to .respond <victim> names a         ║
// ║  DIFFERENT faction as the raid target. The targeted faction's  ║
// ║  members then fight Kael as a raid via .engage. Win → loot     ║
// ║  for the victim. Lose → treasury hit for the victim. The       ║
// ║  responder also gets a finder's-fee reward.                    ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");
const ui           = require("./ui");
const botPersonality = require("./botPersonality");

const DIVIDER         = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const STATE_FILE      = path.join(__dirname, "..", "data", "auto_raid_state.json");
const SETTINGS_FILE   = path.join(__dirname, "..", "data", "settings.json");
const FACTION_TREASURY_FILE = path.join(__dirname, "..", "data", "faction_treasury.json");
const FACTION_POINTS_FILE   = path.join(__dirname, "..", "data", "faction_points.json");

const FACTIONS = ["harmony", "purity", "rift"];
const FACTION_LABEL = { harmony: "🌿 Harmony", purity: "⚔ Purity Order", rift: "🕶 Rift Seekers" };

// ── Tunables (mirrored from settings.autoRaid for sane defaults) ──
const DEFAULTS = {
  spawnMinHours:     4,
  spawnMaxHours:    10,
  responseWindowMin: 5,
  raidDurationMin:  30,
  cooldownHours:    24,
};

// Reward / loss amounts (locked here for now — settings file knobs come later)
const VICTIM_WIN_LUCONS         = 500;
const VICTIM_WIN_FAC_PTS        = 20;
const VICTIM_LOSE_LUCONS        = 300;
const VICTIM_LOSE_FAC_PTS       = 10;
const RESPONDER_REWARD_LUCONS   = 200;
const RESPONDER_REWARD_FAC_PTS  = 10;

// ── State helpers ─────────────────────────────────────────────
function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return fallback; }
}
function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function loadState() {
  const s = loadJSON(STATE_FILE, {});
  if (!s.phase)             s.phase = "idle"; // idle | waiting_response | active | ended
  if (typeof s.spawnedAt   !== "number") s.spawnedAt = 0;
  if (typeof s.responseDeadline !== "number") s.responseDeadline = 0;
  if (typeof s.raidDeadline !== "number") s.raidDeadline = 0;
  if (!s.responder)         s.responder = null; // { jid, faction }
  if (!s.victim)            s.victim = null;     // "harmony" | "purity" | "rift"
  if (typeof s.kaelHpMax   !== "number") s.kaelHpMax = 0;
  if (typeof s.kaelHp      !== "number") s.kaelHp = 0;
  if (!s.engagements)       s.engagements = []; // [{ jid, dmg, at }]
  if (!s.history)           s.history = [];
  return s;
}
function saveState(s) { saveJSON(STATE_FILE, s); }

function loadSettings() { return loadJSON(SETTINGS_FILE, {}); }
function getCfg() {
  const s = loadSettings();
  const ar = s.autoRaid || {};
  return {
    enabled:           !!ar.enabled,
    spawnMinHours:     Number(ar.spawnMinHours     ?? DEFAULTS.spawnMinHours),
    spawnMaxHours:     Number(ar.spawnMaxHours     ?? DEFAULTS.spawnMaxHours),
    responseWindowMin: Number(ar.responseWindowMin ?? DEFAULTS.responseWindowMin),
    raidDurationMin:   Number(ar.raidDurationMin   ?? DEFAULTS.raidDurationMin),
    cooldownHours:     Number(ar.cooldownHours     ?? DEFAULTS.cooldownHours),
    lastResolvedAt:    Number(ar.lastResolvedAt    || 0),
    factionGroups:     s.factionGroups || {},
  };
}
function setLastResolvedAt(ts) {
  const s = loadSettings();
  s.autoRaid = s.autoRaid || {};
  s.autoRaid.lastResolvedAt = ts;
  saveJSON(SETTINGS_FILE, s);
}

function getFactionTreasury() { return loadJSON(FACTION_TREASURY_FILE, {}); }
function saveFactionTreasury(t) { saveJSON(FACTION_TREASURY_FILE, t); }
function getFactionPoints() { return loadJSON(FACTION_POINTS_FILE, { harmony: 0, purity: 0, rift: 0 }); }
function saveFactionPoints(p) { saveJSON(FACTION_POINTS_FILE, p); }

function adjustTreasury(faction, deltaLucons) {
  const t = getFactionTreasury();
  if (!t[faction] || typeof t[faction] !== "object") t[faction] = { lucons: 0, mora: 0 };
  t[faction].lucons = Math.max(0, Number(t[faction].lucons || 0) + Number(deltaLucons || 0));
  saveFactionTreasury(t);
  return t[faction].lucons;
}
function adjustFactionPoints(faction, delta) {
  const p = getFactionPoints();
  p[faction] = Math.max(0, Number(p[faction] || 0) + Number(delta || 0));
  saveFactionPoints(p);
  return p[faction];
}

function countMembers(players, faction) {
  return Object.values(players || {}).filter((p) => p?.faction === faction).length;
}

// ── Spawn tick (called periodically from the bot loop) ───────
// Returns the new state if a spawn happened, null otherwise.
async function tickAutoRaid(ctx) {
  const cfg = getCfg();
  if (!cfg.enabled) return null;

  const state = loadState();
  const now = Date.now();

  // ── Resolve in-progress raids first ──
  if (state.phase === "waiting_response" && now > state.responseDeadline) {
    return endRaid(ctx, state, "no_response");
  }
  if (state.phase === "active" && now > state.raidDeadline) {
    return endRaid(ctx, state, "timeout"); // Kael wins by timer
  }
  if (state.phase === "active" && state.kaelHp <= 0) {
    return endRaid(ctx, state, "victim_wins");
  }

  // ── Maybe spawn a new raid ──
  if (state.phase !== "idle") return null;
  if (now - cfg.lastResolvedAt < cfg.cooldownHours * 3600_000) return null;

  // Random window since last resolution
  const spawnReady = state._nextSpawnAt && now >= state._nextSpawnAt;
  if (!state._nextSpawnAt) {
    const minMs = cfg.spawnMinHours * 3600_000;
    const maxMs = cfg.spawnMaxHours * 3600_000;
    state._nextSpawnAt = now + minMs + Math.random() * (maxMs - minMs);
    saveState(state);
    return null;
  }
  if (!spawnReady) return null;

  // Validate at least 2 factionGroups are configured (need 2+ for politics)
  const configuredGroups = FACTIONS.filter((f) => cfg.factionGroups[f]);
  if (configuredGroups.length < 2) {
    // Push back the next attempt and bail
    state._nextSpawnAt = now + 30 * 60_000;
    saveState(state);
    return null;
  }

  // ── SPAWN ──
  state.phase = "waiting_response";
  state.spawnedAt = now;
  state.responseDeadline = now + cfg.responseWindowMin * 60_000;
  state.responder = null;
  state.victim = null;
  state.kaelHp = 0;
  state.kaelHpMax = 0;
  state.engagements = [];
  delete state._nextSpawnAt;
  saveState(state);

  await broadcastSpawn(ctx, cfg, state);
  return state;
}

async function broadcastSpawn(ctx, cfg, state) {
  const { sock } = ctx;
  const minLeft = cfg.responseWindowMin;
  const starComment = botPersonality.getBattleCommentary("startBattle");
  const text =
    ui.header("KAEL'S TELEPORTER", "🌀") + '\n\n' +
    `A void-tear hangs in the air. Kael is somewhere on the other side.\n\n` +
    `_The first faction to *${'.respond'} <victim>* names a different faction\n` +
    `as Kael's target. That faction must fight him together to survive._\n\n` +
    ui.card("TELEPORTER", "⏳", [
      { emoji: "⏳", label: "Response", value: `${minLeft} min${minLeft === 1 ? '' : 's'}` },
    ]) + '\n\n' +
    `_"The faction that hesitates is the one that loses."_\n\n` +
    `✨ *Star:* ${starComment}`;

  for (const f of FACTIONS) {
    const gid = cfg.factionGroups[f];
    if (!gid) continue;
    try { await sock.sendMessage(gid, { text }); } catch (e) { /* swallow */ }
  }
}

// ── .respond <victim> ─────────────────────────────────────────
async function cmdRespond(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  if (!player.faction) return sock.sendMessage(chatId, { text: "❌ You need a faction to respond to a teleporter." }, { quoted: msg });

  const state = loadState();
  if (state.phase !== "waiting_response") {
    return sock.sendMessage(chatId, { text: "❌ No teleporter awaiting a response right now." }, { quoted: msg });
  }
  if (Date.now() > state.responseDeadline) {
    return sock.sendMessage(chatId, { text: "❌ The response window has closed." }, { quoted: msg });
  }
  if (state.responder) {
    return sock.sendMessage(chatId, {
      text: `❌ @${state.responder.jid} (${FACTION_LABEL[state.responder.faction]}) already responded — Kael is targeting *${FACTION_LABEL[state.victim]}*.`,
      mentions: [state.responder.jid],
    }, { quoted: msg });
  }

  const victimRaw = String(args[0] || "").toLowerCase();
  if (!victimRaw || !FACTIONS.includes(victimRaw)) {
    return sock.sendMessage(chatId, {
      text:
        `❌ Usage: *.respond <faction>*\n` +
        `Valid: harmony, purity, rift\n` +
        `_You cannot name your own faction._`,
    }, { quoted: msg });
  }
  if (victimRaw === player.faction) {
    return sock.sendMessage(chatId, { text: "❌ You can't name your own faction as the victim." }, { quoted: msg });
  }

  // ── Lock the response, transition to active ──
  const cfg = getCfg();
  const now = Date.now();
  state.responder = { jid: senderId, faction: player.faction };
  state.victim = victimRaw;
  state.phase = "active";
  state.raidDeadline = now + cfg.raidDurationMin * 60_000;
  const memberCount = countMembers(players, victimRaw);
  state.kaelHpMax = 500 + memberCount * 50;
  state.kaelHp = state.kaelHpMax;
  saveState(state);

  // Responder reward
  adjustTreasury(player.faction, +RESPONDER_REWARD_LUCONS);
  adjustFactionPoints(player.faction, +RESPONDER_REWARD_FAC_PTS);

  // Broadcast to all faction groups
  const starComment = botPersonality.getBattleCommentary("startBattle");
  const announce =
    ui.header("RESPONSE LOCKED", "⚔️") + '\n\n' +
    `@${senderId} (${FACTION_LABEL[player.faction]}) named *${FACTION_LABEL[victimRaw]}* as the victim.\n\n` +
    ui.card("RAID STATUS", "🌀", [
      { emoji: "🎯", label: "Target", value: FACTION_LABEL[victimRaw] },
      { emoji: "❤️", label: "Kael HP", value: `${state.kaelHp}/${state.kaelHpMax}` },
      { emoji: "⏳", label: "Duration", value: `${cfg.raidDurationMin} min` },
      { emoji: "👥", label: "Members", value: `${memberCount} defenders` },
    ]) + '\n\n' +
    `📜 Victim faction members: use *${'.engage'}* to take a swing at Kael.\n\n` +
    ui.card("REWARD", "🎁", [
      { emoji: "💰", label: "Lucons", value: `+${RESPONDER_REWARD_LUCONS}` },
      { emoji: "🏷️", label: "FP", value: `+${RESPONDER_REWARD_FAC_PTS}` },
    ]) + '\n\n' +
    `✨ *Star:* ${starComment}`;

  for (const f of FACTIONS) {
    const gid = cfg.factionGroups[f];
    if (!gid) continue;
    try { await sock.sendMessage(gid, { text: announce, mentions: [senderId] }); } catch {}
  }

  return null; // already broadcast everywhere
}

// ── .engage ────────────────────────────────────────────────
async function cmdEngage(ctx, chatId, senderId, msg) {
  const { sock, players, statSystem } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });

  const state = loadState();
  if (state.phase !== "active") {
    return sock.sendMessage(chatId, { text: "❌ No raid is active right now." }, { quoted: msg });
  }
  if (Date.now() > state.raidDeadline) {
    return sock.sendMessage(chatId, { text: "❌ Raid has expired — waiting for resolution." }, { quoted: msg });
  }
  if (player.faction !== state.victim) {
    return sock.sendMessage(chatId, {
      text: `❌ Only members of *${FACTION_LABEL[state.victim]}* can engage Kael in this raid.`,
    }, { quoted: msg });
  }

  // One engagement per player per raid
  if (state.engagements.some((e) => e.jid === senderId)) {
    return sock.sendMessage(chatId, { text: "❌ You've already engaged Kael in this raid." }, { quoted: msg });
  }

  // Damage = level * 5 + melee stat bonus
  const lv = Number(player.level || 1);
  let meleeBonus = 0;
  try { meleeBonus = statSystem?.meleeDamageBonus?.(player) || 0; } catch {}
  const dmg = Math.max(1, lv * 5 + meleeBonus);
  state.kaelHp = Math.max(0, state.kaelHp - dmg);
  state.engagements.push({ jid: senderId, dmg, at: Date.now() });
  saveState(state);

  // Star commentary based on damage
  let starComment = "";
  if (dmg >= 50) {
    starComment = botPersonality.getBattleCommentary("bigHit");
  } else if (state.kaelHp <= 0) {
    starComment = botPersonality.getBattleCommentary("faint");
  }

  const hpPct = Math.round((state.kaelHp / state.kaelHpMax) * 100);
  const text =
    ui.header("ENGAGEMENT", "⚔️") + '\n\n' +
    `@${senderId} struck Kael for *${dmg}* damage!\n\n` +
    ui.card("KAEL STATUS", "❤️", [
      { emoji: "❤️", label: "HP", value: `${state.kaelHp}/${state.kaelHpMax}` },
      { emoji: "📊", label: "Remaining", value: `${hpPct}%` },
    ]) +
    (state.kaelHp <= 0 ? `\n\n💥 *KAEL HAS FALLEN!*` : "") +
    (starComment ? `\n\n✨ *Star:* ${starComment}` : "");

  await sock.sendMessage(chatId, { text, mentions: [senderId] }, { quoted: msg });

  if (state.kaelHp <= 0) {
    await endRaid(ctx, state, "victim_wins");
  }
  return null;
}

// ── End-of-raid resolution ───────────────────────────────────
async function endRaid(ctx, state, reason) {
  const { sock } = ctx;
  const cfg = getCfg();
  let summary = "";

  if (reason === "no_response") {
    summary =
      ui.header("TELEPORTER CLOSED", "🌫") + '\n\n' +
      `No faction responded in time. Kael withdraws into the void, unsated.\n\n` +
      `_No spoils. No losses. The Rift took the silence as an answer._`;
  } else if (reason === "victim_wins") {
    const dmgLeaders = [...state.engagements].sort((a, b) => b.dmg - a.dmg).slice(0, 3);
    adjustTreasury(state.victim, +VICTIM_WIN_LUCONS);
    adjustFactionPoints(state.victim, +VICTIM_WIN_FAC_PTS);
    const starComment = botPersonality.getBattleCommentary("bigHit");
    summary =
      ui.header(`${FACTION_LABEL[state.victim]} DEFEATED KAEL`, "🏆") + '\n\n' +
      ui.card("TOP DAMAGE", "⚔️", dmgLeaders.map((e, i) => ({
        emoji: i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉',
        label: `#${i+1}`,
        value: `${e.dmg} dmg`
      }))) + '\n\n' +
      ui.card("REWARDS", "🎁", [
        { emoji: "💰", label: "Lucons", value: `+${VICTIM_WIN_LUCONS}` },
        { emoji: "🏷️", label: "FP", value: `+${VICTIM_WIN_FAC_PTS}` },
      ]) + '\n\n' +
      `_"Survival is the only proof Kael respects."_\n\n` +
      `✨ *Star:* ${starComment}`;
  } else if (reason === "timeout") {
    adjustTreasury(state.victim, -VICTIM_LOSE_LUCONS);
    adjustFactionPoints(state.victim, -VICTIM_LOSE_FAC_PTS);
    const starComment = botPersonality.getBattleCommentary("miss");
    summary =
      ui.header(`KAEL WINS — ${FACTION_LABEL[state.victim]} BLED OUT`, "💀") + '\n\n' +
      `Time ran out. ${state.engagements.length} member${state.engagements.length === 1 ? "" : "s"} tried. None were enough.\n\n` +
      ui.card("LOSSES", "💸", [
        { emoji: "💰", label: "Lucons", value: `-${VICTIM_LOSE_LUCONS}` },
        { emoji: "🏷️", label: "FP", value: `-${VICTIM_LOSE_FAC_PTS}` },
      ]) + '\n\n' +
      `_"Hesitation has a price."_\n\n` +
      `✨ *Star:* ${starComment}`;
  }

  // History trim — keep last 20
  state.history.push({
    spawnedAt: state.spawnedAt,
    resolvedAt: Date.now(),
    reason,
    responder: state.responder,
    victim: state.victim,
    engagements: state.engagements.length,
  });
  if (state.history.length > 20) state.history.shift();

  // Collect all engager JIDs for mentions in summary (before clearing)
  const engagerJids = state.engagements.map(e => e.jid);

  // Reset core fields
  state.phase = "idle";
  state.responder = null;
  state.victim = null;
  state.kaelHp = 0;
  state.kaelHpMax = 0;
  state.engagements = [];
  state.spawnedAt = 0;
  state.responseDeadline = 0;
  state.raidDeadline = 0;
  delete state._nextSpawnAt;
  saveState(state);
  setLastResolvedAt(Date.now());
  for (const f of FACTIONS) {
    const gid = cfg.factionGroups[f];
    if (!gid) continue;
    try { await sock.sendMessage(gid, { text: summary, mentions: engagerJids }); } catch {}
  }
  return state;
}

// ── .raid-status ─────────────────────────────────────────────
async function cmdRaidStatus(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state = loadState();
  const cfg = getCfg();

  if (state.phase === "idle") {
    const cdMs = cfg.lastResolvedAt + cfg.cooldownHours * 3600_000 - Date.now();
    const cdLabel = cdMs > 0
      ? `Next spawn possible in ~${Math.ceil(cdMs / 3600_000)}h`
      : `Spawn window open — Kael could appear any time`;
    return sock.sendMessage(chatId, {
      text: ui.header("AUTO-RAID STATUS", "🌀") + '\n\n' +
        ui.card("STATUS", "📋", [
          { emoji: "🌀", label: "Raid", value: "No active raid" },
          { emoji: "⏳", label: "Spawn", value: cdLabel },
        ]),
    }, { quoted: msg });
  }

  if (state.phase === "waiting_response") {
    const minLeft = Math.max(0, Math.ceil((state.responseDeadline - Date.now()) / 60_000));
    return sock.sendMessage(chatId, {
      text: ui.header("TELEPORTER OPEN", "🌀") + '\n\n' +
        ui.card("AWAITING RESPONSE", "⏳", [
          { emoji: "⏳", label: "Time left", value: `${minLeft} min` },
        ]),
    }, { quoted: msg });
  }

  if (state.phase === "active") {
    const minLeft = Math.max(0, Math.ceil((state.raidDeadline - Date.now()) / 60_000));
    return sock.sendMessage(chatId, {
      text: ui.header("RAID IN PROGRESS", "⚔️") + '\n\n' +
        ui.card("RAID STATUS", "⚔️", [
          { emoji: "🎯", label: "Responder", value: FACTION_LABEL[state.responder.faction] },
          { emoji: "💀", label: "Target", value: FACTION_LABEL[state.victim] },
          { emoji: "❤️", label: "Kael HP", value: `${state.kaelHp}/${state.kaelHpMax}` },
          { emoji: "👥", label: "Engagements", value: state.engagements.length },
          { emoji: "⏳", label: "Time left", value: `${minLeft} min` },
        ]),
    }, { quoted: msg });
  }

  return sock.sendMessage(chatId, { text: `🌀 Unknown state: ${state.phase}` }, { quoted: msg });
}

module.exports = {
  // commands
  cmdRespond,
  cmdEngage,
  cmdRaidStatus,

  // periodic
  tickAutoRaid,

  // helpers exposed for tests
  loadState,
  saveState,
  getCfg,
  endRaid,
  FACTIONS,
  FACTION_LABEL,
  VICTIM_WIN_LUCONS,
  VICTIM_LOSE_LUCONS,
  RESPONDER_REWARD_LUCONS,
};

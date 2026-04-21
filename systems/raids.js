// ══════════════════════════════════════════════════════════════════
//  LUMORA RAIDS — Cross-Faction Stronghold Assaults
//  Kael the Riftwalker summons the factions to war.
// ══════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const RAID_STATE_FILE = path.join(DATA_DIR, "raid_state.json");
const CHRONICLES_FILE = path.join(DATA_DIR, "chronicles.json");

const FACTIONS = ["harmony", "purity", "rift"];
const FACTION_LABEL = { harmony: "Harmony Lumorians", purity: "The Purity Order", rift: "The Rift Seekers" };
const FACTION_EMOJI = { harmony: "🌿", purity: "⚔", rift: "🕶" };

const WALL_PHASE_MS = 10 * 60 * 1000;       // 10 minutes
const ENCOUNTER_PHASE_MS = 15 * 60 * 1000;  // 15 minutes
const CONTRACT_WINDOW_MS = 3 * 60 * 1000;   // 3 minutes
const KAEL_RANDOM_TTL_MS = 8 * 60 * 1000;   // random Kael stays 8 min
const RAID_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CAPTURE_FINE = 200;
const ENGAGE_WINDOW_MS = 2 * 60 * 1000;

// ── helpers ─────────────────────────────────────────────────────
function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function saveJSON(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch {}
}
function loadState() {
  const s = loadJSON(RAID_STATE_FILE, {});
  s.active ||= null;
  s.cooldowns ||= { harmony: 0, purity: 0, rift: 0 };
  s.kaelState ||= { active: false, expiresAt: 0, claimedBy: null, summonedBy: null };
  s.raidGroups ||= { enabled: true, allowed: [] };
  s.history ||= [];
  return s;
}
function saveState(s) { saveJSON(RAID_STATE_FILE, s); }

function isRaidGroup(state, chatId) {
  return !!(state.raidGroups?.allowed || []).includes(chatId);
}

function getDisplayName(players, jid) {
  const p = players[jid];
  return (p?.username && String(p.username).trim()) || jid.split("@")[0];
}

function playerScore(p) {
  return (Number(p.level || 1) * 10) + Number(p.resonance || 0);
}

function topThreeJids(players, faction) {
  return Object.entries(players)
    .filter(([, pl]) => pl?.faction === faction)
    .sort(([, a], [, b]) => playerScore(b) - playerScore(a))
    .slice(0, 3)
    .map(([jid]) => jid);
}

function hasProMark(player) {
  try { return !!require("./pro").hasActivePro(player); } catch { return false; }
}

function pickCompanionOrFirstMora(player) {
  const owned = Array.isArray(player?.moraOwned) ? player.moraOwned : [];
  if (!owned.length) return null;
  if (player.companionId != null) {
    const c = owned.find(m => m.moraId === player.companionId);
    if (c && !c.corrupted) return { mora: c, isCompanion: true };
  }
  return { mora: owned[0], isCompanion: false };
}

function wallBar(cur, max) {
  const pct = Math.max(0, Math.min(1, cur / Math.max(1, max)));
  const filled = Math.round(pct * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function pickKaelLine(event) {
  const LINES = {
    arrive_summon: [
      "🌀 _The air tears. Kael steps through, mask gleaming._\n\n🎭 *Kael:* \"Ah-ah-ah. Someone called me. How _delicious._\"",
      "🌀 _A rift splits the sky. A silhouette drifts down._\n\n🎭 *Kael:* \"Tell me, little Lumorians — whose precious vault shall bleed today?\"",
    ],
    arrive_random: [
      "🌀 _Reality hiccups. Kael saunters into existence._\n\n🎭 *Kael:* \"Free labour? Free chaos? *I'll work for anyone who pays.*\"",
      "🌀 _Between one breath and the next, Kael is there._\n\n🎭 *Kael:* \"The first faction to open their purse gets my blade. Shall we see who bleeds today?\"",
    ],
    contract_claimed: [
      "🎭 *Kael:* \"Bound. The contract is ink now. Do *not* disappoint me.\"",
    ],
    contract_expired: [
      "🎭 *Kael:* \"Cold feet? How boring.\" _He fades, leaving only a chill._",
    ],
    launch: [
      "🎭 *Kael:* \"The gate is open. The wall awaits. *Bleed them.*\"",
    ],
    wall_break: [
      "🎭 *Kael:* \"Oh, that lovely crack. Feed me more, little Lumorians.\"",
    ],
    resolve_success: [
      "🎭 *Kael:* \"Delicious work. Until the next tear.\" _He bows and dissolves._",
    ],
    resolve_fail: [
      "🎭 *Kael:* \"Pathetic.\" _He waves a bandaged hand; the rift seals._",
    ],
  };
  const arr = LINES[event] || [""];
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── chronicles ──────────────────────────────────────────────────
function logChronicle(type, text, factions = [], players = []) {
  const c = loadJSON(CHRONICLES_FILE, { entries: [], nextId: 1 });
  c.entries ||= [];
  c.nextId ||= 1;
  c.entries.push({
    id: c.nextId++,
    at: Date.now(),
    type,
    text,
    factions,
    players,
  });
  if (c.entries.length > 500) c.entries = c.entries.slice(-500);
  saveJSON(CHRONICLES_FILE, c);
}

// ══════════════════════════════════════════════════════════════════
//  KAEL
// ══════════════════════════════════════════════════════════════════
async function cmdSummonKael(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.raidGroups.enabled) return sock.sendMessage(chatId, { text: "🚫 Raids are currently disabled." }, { quoted: msg });
  if (!isRaidGroup(state, chatId)) return sock.sendMessage(chatId, { text: "⚠️ This group is not a designated Raid Ground." }, { quoted: msg });
  if (state.active) return sock.sendMessage(chatId, { text: "⚠️ A raid is already in progress." }, { quoted: msg });
  if (state.kaelState.active) return sock.sendMessage(chatId, { text: "🌀 Kael has already arrived. Use *.claim-raidcontract* to bind them." }, { quoted: msg });

  const p = players[senderId];
  if (!p || !p.faction) return sock.sendMessage(chatId, { text: "❌ You must belong to a faction to summon Kael." }, { quoted: msg });
  const faction = p.faction;

  const cd = Number(state.cooldowns[faction] || 0);
  if (Date.now() < cd) {
    const mins = Math.ceil((cd - Date.now()) / 60000);
    return sock.sendMessage(chatId, { text: `⏳ Your faction is on raid cooldown for another ~${mins} minute(s).` }, { quoted: msg });
  }

  const top3 = topThreeJids(players, faction);
  const isPro = hasProMark(p);
  const inv = p.inventory || {};
  const hasTear = Number(inv.RIFT_TEAR_SHARD || 0) > 0;
  if (!top3.includes(senderId) && !(isPro && hasTear)) {
    return sock.sendMessage(chatId, {
      text:
        `🚫 Only the *top 3 of your faction* (by level + resonance) or Pro members with a Rift Tear Shard can summon Kael.\n\n` +
        `Your faction's current top 3:\n` +
        top3.map((j, i) => `${i + 1}. *${getDisplayName(players, j)}*`).join("\n"),
    }, { quoted: msg });
  }
  if (isPro && hasTear && !top3.includes(senderId)) {
    inv.RIFT_TEAR_SHARD = hasTear - 1;
    if (inv.RIFT_TEAR_SHARD <= 0) delete inv.RIFT_TEAR_SHARD;
    p.inventory = inv;
    ctx.savePlayers(players);
  }

  state.kaelState = {
    active: true,
    expiresAt: Date.now() + CONTRACT_WINDOW_MS,
    claimedBy: null,
    summonedBy: faction,
    summonChat: chatId,
    summonerJid: senderId,
  };
  saveState(state);

  return sock.sendMessage(chatId, {
    text:
      `${pickKaelLine("arrive_summon")}\n\n` +
      `⚔️ Summoned by: *${FACTION_LABEL[faction]}* (${getDisplayName(players, senderId)})\n` +
      `⏳ Contract window: *3 minutes*\n\n` +
      `📖 The summoning faction must now use *.claim-raidcontract* within 3 minutes to bind Kael.\n` +
      `_Failure to claim releases Kael; a 5-min window lets other factions claim._`,
  }, { quoted: msg });
}

async function cmdClaimContract(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!isRaidGroup(state, chatId)) return sock.sendMessage(chatId, { text: "⚠️ Not a raid group." }, { quoted: msg });
  if (!state.kaelState.active) return sock.sendMessage(chatId, { text: "🌀 Kael is not present." }, { quoted: msg });
  if (state.active) return sock.sendMessage(chatId, { text: "⚠️ A raid is already active." }, { quoted: msg });

  const p = players[senderId];
  if (!p || !p.faction) return sock.sendMessage(chatId, { text: "❌ Join a faction first." }, { quoted: msg });

  if (Date.now() > state.kaelState.expiresAt) {
    state.kaelState = { active: false, expiresAt: 0, claimedBy: null, summonedBy: null };
    saveState(state);
    return sock.sendMessage(chatId, { text: `${pickKaelLine("contract_expired")}` }, { quoted: msg });
  }

  // summoned Kael: only summoning faction may claim during contract window
  if (state.kaelState.summonedBy && state.kaelState.summonedBy !== p.faction) {
    return sock.sendMessage(chatId, { text: "🚫 Only the faction that summoned Kael may claim this contract." }, { quoted: msg });
  }

  // contract fee: 10% of claimant's balance
  const bal = Number(p.lucons || 0);
  const fee = Math.floor(bal * 0.1);
  if (fee <= 0) return sock.sendMessage(chatId, { text: "❌ You have no Lucons to pay Kael's contract fee." }, { quoted: msg });
  p.lucons = bal - fee;
  ctx.savePlayers(players);

  state.active = {
    phase: "recruit",
    faction: p.faction,
    leader: senderId,
    target: null,
    raiders: {}, // jid => { paid, role, ready, captured, reward: [] }
    pot: fee,
    startedAt: Date.now(),
    wallBreakAt: 0,
    encountersAssigned: {},  // jid => treasury mora
    rerolls: 0,
    chatId,
    kills: [],
    loot: {},
    captures: [],
  };
  state.kaelState = { active: false, expiresAt: 0, claimedBy: p.faction, summonedBy: null };
  saveState(state);

  return sock.sendMessage(chatId, {
    text:
      `${pickKaelLine("contract_claimed")}\n\n` +
      `💳 *${getDisplayName(players, senderId)}* paid the contract: *${fee} Lucons*\n` +
      `⚔️ *${FACTION_LABEL[p.faction]}* now leads the raid.\n\n` +
      `📖 Recruits: *.raid join* (costs 10% of your Lucons)\n` +
      `📖 Launch target: *.raid launch <harmony|purity|rift>*\n` +
      `🎯 Minimum 3 raiders to launch.`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════════
//  RAID PARTY
// ══════════════════════════════════════════════════════════════════
async function cmdRaidJoin(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active) return sock.sendMessage(chatId, { text: "❌ No active raid to join." }, { quoted: msg });
  if (state.active.phase !== "recruit") return sock.sendMessage(chatId, { text: "❌ Recruitment is closed." }, { quoted: msg });

  const p = players[senderId];
  if (!p || !p.faction) return sock.sendMessage(chatId, { text: "❌ Register and pick a faction first." }, { quoted: msg });
  if (p.faction !== state.active.faction) return sock.sendMessage(chatId, { text: "🚫 Only members of the raiding faction may join." }, { quoted: msg });
  if (state.active.raiders[senderId]) return sock.sendMessage(chatId, { text: "⚠️ You've already joined this raid." }, { quoted: msg });

  const bal = Number(p.lucons || 0);
  const fee = Math.floor(bal * 0.1);
  if (fee <= 0) return sock.sendMessage(chatId, { text: "❌ You have no Lucons to pay the raid entry." }, { quoted: msg });

  p.lucons = bal - fee;
  ctx.savePlayers(players);

  state.active.raiders[senderId] = { paid: fee, role: null, ready: false, captured: false, reward: [] };
  state.active.pot += fee;
  saveState(state);

  const count = Object.keys(state.active.raiders).length;
  return sock.sendMessage(chatId, {
    text:
      `⚔️ *${getDisplayName(players, senderId)}* joins the raid.\n` +
      `💳 Paid: *${fee}L*  •  Raiders: *${count}*  •  Pot: *${state.active.pot}L*\n\n` +
      (count >= 3 ? `✅ Minimum reached. Leader may *.raid launch <faction>* now.` : `_Need ${3 - count} more raider(s) before launch._`),
  }, { quoted: msg });
}

async function cmdRaidLaunch(ctx, chatId, senderId, msg, args) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active) return sock.sendMessage(chatId, { text: "❌ No active raid." }, { quoted: msg });
  if (state.active.phase !== "recruit") return sock.sendMessage(chatId, { text: "❌ Raid already launched." }, { quoted: msg });
  if (state.active.leader !== senderId) return sock.sendMessage(chatId, { text: "🚫 Only the raid leader can launch." }, { quoted: msg });

  const count = Object.keys(state.active.raiders).length;
  if (count < 3) return sock.sendMessage(chatId, { text: `❌ Need at least 3 raiders. Currently ${count}.` }, { quoted: msg });

  const target = (args[0] || "").toLowerCase();
  if (!FACTIONS.includes(target)) return sock.sendMessage(chatId, { text: "❌ Target must be: *harmony*, *purity*, or *rift*." }, { quoted: msg });
  if (target === state.active.faction) return sock.sendMessage(chatId, { text: "🚫 You cannot raid your own faction." }, { quoted: msg });

  const treasury = ctx.loadTreasury()[target];
  if (!treasury || treasury.lucons <= 0) {
    return sock.sendMessage(chatId, { text: "🏚️ That treasury is empty. Pick another target." }, { quoted: msg });
  }

  // Assign roles randomly
  const raiderJids = Object.keys(state.active.raiders);
  assignRoles(state.active, raiderJids);

  state.active.target = target;
  state.active.phase = "ready";
  saveState(state);

  const rolesList = raiderJids.map(j => {
    const r = state.active.raiders[j].role;
    const icon = r === "Frontline" ? "⚔️" : r === "Mid" ? "🎯" : "🛡️";
    return `${icon} *${getDisplayName(players, j)}* — ${r}`;
  }).join("\n");

  return sock.sendMessage(chatId, {
    text:
      `${pickKaelLine("launch")}\n\n` +
      `🎯 Target: *${FACTION_EMOJI[target]} ${FACTION_LABEL[target]}*\n` +
      `🧱 Wall: *${treasury.wallHp}/${treasury.wallMaxHp}*  (Lv ${treasury.wallLevel})\n\n` +
      `🎭 *ROLE ASSIGNMENT*\n${rolesList}\n\n` +
      `📖 All raiders must *.ready* to confirm.\n` +
      `📖 Leader: *.reroll-roles* (max 2) · *.raid-kick @user* · *.raid-go* (force start)`,
  }, { quoted: msg });
}

function assignRoles(raid, jids) {
  const roles = ["Frontline", "Mid", "Support"];
  for (const j of jids) {
    const r = roles[Math.floor(Math.random() * roles.length)];
    raid.raiders[j].role = r;
    raid.raiders[j].ready = false;
  }
}

async function cmdRerollRoles(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "ready") return sock.sendMessage(chatId, { text: "❌ Not in role-assignment phase." }, { quoted: msg });
  if (state.active.leader !== senderId) return sock.sendMessage(chatId, { text: "🚫 Only the leader can reroll." }, { quoted: msg });
  if ((state.active.rerolls || 0) >= 2) return sock.sendMessage(chatId, { text: "❌ Rerolls exhausted (max 2)." }, { quoted: msg });

  state.active.rerolls = (state.active.rerolls || 0) + 1;
  assignRoles(state.active, Object.keys(state.active.raiders));
  saveState(state);

  const lines = Object.keys(state.active.raiders).map(j => {
    const r = state.active.raiders[j].role;
    const icon = r === "Frontline" ? "⚔️" : r === "Mid" ? "🎯" : "🛡️";
    return `${icon} *${getDisplayName(players, j)}* — ${r}`;
  });
  return sock.sendMessage(chatId, {
    text:
      `🎲 *ROLES REROLLED* (${state.active.rerolls}/2)\n\n` +
      lines.join("\n") + `\n\n_All raiders must *.ready* again._`,
  }, { quoted: msg });
}

async function cmdReady(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "ready") return sock.sendMessage(chatId, { text: "❌ Not in ready phase." }, { quoted: msg });
  const r = state.active.raiders[senderId];
  if (!r) return sock.sendMessage(chatId, { text: "🚫 You are not in this raid." }, { quoted: msg });
  r.ready = true;
  saveState(state);
  const readyCount = Object.values(state.active.raiders).filter(x => x.ready).length;
  const total = Object.keys(state.active.raiders).length;
  let txt = `✅ *${getDisplayName(players, senderId)}* is ready. (${readyCount}/${total})`;
  if (readyCount === total) {
    await beginWallPhase(ctx, state);
    return;
  }
  return ctx.sock.sendMessage(chatId, { text: txt }, { quoted: msg });
}

async function cmdRaidGo(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "ready") return sock.sendMessage(chatId, { text: "❌ Not in ready phase." }, { quoted: msg });
  if (state.active.leader !== senderId) return sock.sendMessage(chatId, { text: "🚫 Only the leader can force-start." }, { quoted: msg });
  // remove unready
  for (const [j, r] of Object.entries(state.active.raiders)) {
    if (!r.ready) delete state.active.raiders[j];
  }
  if (Object.keys(state.active.raiders).length < 3) {
    return sock.sendMessage(chatId, { text: "❌ Fewer than 3 ready raiders — raid aborted. Entry fees NOT refunded (Kael's rules)." }, { quoted: msg });
  }
  await beginWallPhase(ctx, state);
}

async function cmdRaidKick(ctx, chatId, senderId, msg, helpers) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "ready") return sock.sendMessage(chatId, { text: "❌ Not in ready phase." }, { quoted: msg });
  if (state.active.leader !== senderId) return sock.sendMessage(chatId, { text: "🚫 Only the leader can kick." }, { quoted: msg });

  const { getMentionedJids, normJid } = helpers;
  const target = normJid(getMentionedJids(msg)[0] || "");
  if (!target || !state.active.raiders[target]) {
    return sock.sendMessage(chatId, { text: "❌ Tag a raider to kick." }, { quoted: msg });
  }
  // Refund half their fee
  const refund = Math.floor((state.active.raiders[target].paid || 0) / 2);
  if (refund > 0 && players[target]) {
    players[target].lucons = (players[target].lucons || 0) + refund;
    ctx.savePlayers(players);
  }
  state.active.pot -= refund;
  delete state.active.raiders[target];
  saveState(state);
  return sock.sendMessage(chatId, { text: `🚪 *${getDisplayName(players, target)}* has been kicked. ${refund}L refunded.` }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════════
//  WALL PHASE
// ══════════════════════════════════════════════════════════════════
async function beginWallPhase(ctx, state) {
  const { sock } = ctx;
  state.active.phase = "wall";
  state.active.wallPhaseEnds = Date.now() + WALL_PHASE_MS;
  saveState(state);

  const t = ctx.loadTreasury();
  const tgt = t[state.active.target];
  await sock.sendMessage(state.active.chatId, {
    text:
      `🧨 *WALL ASSAULT BEGINS*\n\n` +
      `🧱 ${FACTION_EMOJI[state.active.target]} *${FACTION_LABEL[state.active.target]}* Wall\n` +
      `${wallBar(tgt.wallHp, tgt.wallMaxHp)}  ${tgt.wallHp}/${tgt.wallMaxHp}\n\n` +
      `📖 Raiders: *.raid-attack* to strike the wall.\n` +
      `📖 Defenders: *.raid-reinforce* to restore wall HP.\n` +
      `⏳ Wall phase: *10 minutes*.`,
  });

  // Alert all members of target faction
  const { players } = ctx;
  const defenderJids = Object.entries(players)
    .filter(([, pl]) => pl?.faction === state.active.target)
    .map(([jid]) => jid);
  for (const j of defenderJids.slice(0, 50)) {
    try {
      await sock.sendMessage(j, {
        text:
          `🚨 *YOUR STRONGHOLD IS UNDER ATTACK*\n\n` +
          `⚔️ Attacker: *${FACTION_LABEL[state.active.faction]}*\n` +
          `🧱 Wall: *${tgt.wallHp}/${tgt.wallMaxHp}*\n\n` +
          `🛡️ Use *.raid-reinforce* in the raid group, or *.engage @raider* during the encounter phase.`,
      });
    } catch {}
  }
}

async function cmdRaidAttack(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "wall") return sock.sendMessage(chatId, { text: "❌ No wall phase active." }, { quoted: msg });
  const r = state.active.raiders[senderId];
  if (!r) return sock.sendMessage(chatId, { text: "🚫 You are not in this raid." }, { quoted: msg });
  if (r.captured) return sock.sendMessage(chatId, { text: "⛓️ You are captured. You cannot act." }, { quoted: msg });
  if (r.lastAttackAt && Date.now() - r.lastAttackAt < 8000) {
    return sock.sendMessage(chatId, { text: "⏳ Your mora is catching its breath. Wait a few seconds." }, { quoted: msg });
  }

  const p = players[senderId];
  const pick = pickCompanionOrFirstMora(p);
  if (!pick) return sock.sendMessage(chatId, { text: "❌ You have no Mora to attack with." }, { quoted: msg });

  const mora = pick.mora;
  const baseAtk = Number(mora.stats?.atk || mora.atk || 50);
  const lvl = Number(mora.level || 1);
  let dmg = baseAtk + (lvl * 3);
  if (!pick.isCompanion) dmg *= 0.5;

  const roleMul = r.role === "Frontline" ? 1.2 : r.role === "Mid" ? 1.1 : 0.9;
  dmg = Math.floor(dmg * roleMul);

  const t = ctx.loadTreasury();
  const tgt = t[state.active.target];
  tgt.wallHp = Math.max(0, tgt.wallHp - dmg);
  ctx.saveTreasury(t);

  r.lastAttackAt = Date.now();
  saveState(state);

  await sock.sendMessage(chatId, {
    text:
      `💥 *${getDisplayName(players, senderId)}'s ${mora.name}* strikes the wall!\n` +
      `⚔️ Role: *${r.role}*  •  Damage: *${dmg}*\n\n` +
      `🧱 ${wallBar(tgt.wallHp, tgt.wallMaxHp)}  ${tgt.wallHp}/${tgt.wallMaxHp}`,
  }, { quoted: msg });

  if (tgt.wallHp <= 0) {
    await onWallBreached(ctx, state);
  }
}

async function cmdRaidReinforce(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "wall") return sock.sendMessage(chatId, { text: "❌ No wall phase active." }, { quoted: msg });
  const p = players[senderId];
  if (!p || p.faction !== state.active.target) return sock.sendMessage(chatId, { text: "🚫 Only members of the defending faction can reinforce." }, { quoted: msg });

  const pick = pickCompanionOrFirstMora(p);
  if (!pick) return sock.sendMessage(chatId, { text: "❌ You have no Mora to reinforce with." }, { quoted: msg });

  if (p.lastReinforceAt && Date.now() - p.lastReinforceAt < 10000) {
    return sock.sendMessage(chatId, { text: "⏳ Your mora needs to rest briefly." }, { quoted: msg });
  }

  const def = Number(pick.mora.stats?.def || pick.mora.def || 40);
  const lvl = Number(pick.mora.level || 1);
  const restore = Math.floor(def + lvl * 2);

  const t = ctx.loadTreasury();
  const tgt = t[state.active.target];
  const actual = Math.min(restore, tgt.wallMaxHp - tgt.wallHp);
  tgt.wallHp = Math.min(tgt.wallMaxHp, tgt.wallHp + actual);
  ctx.saveTreasury(t);

  p.lastReinforceAt = Date.now();
  ctx.savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `🛡️ *${getDisplayName(players, senderId)}'s ${pick.mora.name}* reinforces the wall!\n` +
      `+${actual} HP restored.\n\n` +
      `🧱 ${wallBar(tgt.wallHp, tgt.wallMaxHp)}  ${tgt.wallHp}/${tgt.wallMaxHp}`,
  }, { quoted: msg });
}

async function onWallBreached(ctx, state) {
  const { sock, players } = ctx;
  const chatId = state.active.chatId;
  await sock.sendMessage(chatId, {
    text:
      `💥💥💥 *THE WALL SHATTERS* 💥💥💥\n\n` +
      `${pickKaelLine("wall_break")}`,
  });

  // Drop wall materials as loot to raiders
  const t = ctx.loadTreasury();
  const tgt = t[state.active.target];
  const crystalDrops = (tgt.wallMaterials || []).slice();
  tgt.wallMaterials = [];
  ctx.saveTreasury(t);

  const raiderJids = Object.keys(state.active.raiders).filter(j => !state.active.raiders[j].captured);
  if (crystalDrops.length && raiderJids.length) {
    for (let i = 0; i < crystalDrops.length; i++) {
      const drop = crystalDrops[i];
      const recipient = raiderJids[i % raiderJids.length];
      const pl = players[recipient];
      if (!pl) continue;
      pl.inventory ||= {};
      pl.inventory[drop.id] = (pl.inventory[drop.id] || 0) + 1;
      state.active.raiders[recipient].reward.push({ id: drop.id, name: drop.name });
    }
    ctx.savePlayers(players);
  }
  state.active.wallBreakAt = Date.now();
  saveState(state);

  if (crystalDrops.length) {
    await sock.sendMessage(chatId, {
      text: `💎 *WALL LOOT DROPPED* — ${crystalDrops.length} crystal(s) distributed to raiders.`,
    });
  }

  await beginEncounterPhase(ctx, state);
}

// ══════════════════════════════════════════════════════════════════
//  ENCOUNTER PHASE
// ══════════════════════════════════════════════════════════════════
async function beginEncounterPhase(ctx, state) {
  const { sock, players } = ctx;
  state.active.phase = "encounter";
  state.active.encounterEnds = Date.now() + ENCOUNTER_PHASE_MS;

  // Assign treasury mora to raiders
  const t = ctx.loadTreasury();
  const tgt = t[state.active.target];
  const deployed = (tgt.moraDeployed || []).slice();
  const raiderJids = Object.keys(state.active.raiders).filter(j => !state.active.raiders[j].captured);
  const assigned = {};
  for (const j of raiderJids) {
    if (!deployed.length) {
      assigned[j] = null; // empty treasury — auto-loot
    } else {
      const idx = Math.floor(Math.random() * deployed.length);
      assigned[j] = deployed.splice(idx, 1)[0];
    }
  }
  state.active.encountersAssigned = assigned;
  state.active.encounterRemaining = deployed;  // unassigned defenders
  saveState(state);

  const lines = raiderJids.map(j => {
    const m = assigned[j];
    return m
      ? `⚔️ *${getDisplayName(players, j)}* meets *${m.name}* (${m.rarity} • Lv ${m.level}) — submitted by ${m.submittedByName}`
      : `👻 *${getDisplayName(players, j)}* finds empty vault halls.`;
  }).join("\n");

  await sock.sendMessage(state.active.chatId, {
    text:
      `🔥 *ENCOUNTER PHASE BEGINS*\n\n` +
      `${lines}\n\n` +
      `📖 Raiders: *.raid-attack* to engage assigned treasury Mora.\n` +
      `📖 Defenders: *.engage @raider* to intercept (PvP).\n` +
      `⏳ Encounter phase: *15 minutes*.`,
  });

  // Auto-resolve empty-slot raiders: they plunder the vault directly
  for (const j of raiderJids) {
    if (!assigned[j]) {
      state.active.kills.push({ raider: j, mora: null });
    }
  }
  saveState(state);
}

async function cmdRaidEngage(ctx, chatId, senderId, msg, helpers) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "encounter") return sock.sendMessage(chatId, { text: "❌ No encounter phase." }, { quoted: msg });
  const p = players[senderId];
  if (!p || p.faction !== state.active.target) return sock.sendMessage(chatId, { text: "🚫 Only defenders can engage." }, { quoted: msg });

  const { getMentionedJids, normJid } = helpers;
  const raiderJid = normJid(getMentionedJids(msg)[0] || "");
  const raider = state.active.raiders[raiderJid];
  if (!raider) return sock.sendMessage(chatId, { text: "❌ Tag a valid raider." }, { quoted: msg });
  if (raider.captured) return sock.sendMessage(chatId, { text: "⛓️ That raider is already captured." }, { quoted: msg });
  if (raider.engagedBy) return sock.sendMessage(chatId, { text: "⚠️ Already being engaged by another defender." }, { quoted: msg });

  const defMora = pickCompanionOrFirstMora(p);
  const atkMora = pickCompanionOrFirstMora(players[raiderJid]);
  if (!defMora || !atkMora) return sock.sendMessage(chatId, { text: "❌ One of the combatants has no mora." }, { quoted: msg });

  // Simple deterministic-ish PvP: compare effective power
  const power = (m) => (Number(m.stats?.atk || m.atk || 50) + Number(m.stats?.def || m.def || 40)) * Math.max(1, Number(m.level || 1));
  const defPow = power(defMora.mora);
  const atkPow = power(atkMora.mora);
  const roleMul = raider.role === "Frontline" ? 1.1 : raider.role === "Support" ? 0.85 : 1.0;
  const atkEff = atkPow * roleMul;
  const defEff = defPow * (raider.role === "Support" ? 1.2 : 1.0);
  const roll = (Math.random() * 0.3) + 0.85; // 0.85-1.15 variance
  const defWins = defEff * roll > atkEff;

  raider.engagedBy = senderId;

  if (defWins) {
    raider.captured = true;
    state.active.captures.push(raiderJid);
    saveState(state);
    return sock.sendMessage(chatId, {
      text:
        `🛡️ *${getDisplayName(players, senderId)}'s ${defMora.mora.name}* crushes *${getDisplayName(players, raiderJid)}'s ${atkMora.mora.name}*!\n\n` +
        `⛓️ *${getDisplayName(players, raiderJid)}* has been *CAPTURED.*\n` +
        `💸 They will pay a *${CAPTURE_FINE}L* fine at raid end.\n\n` +
        `_Captured raiders can use a *Rift Escape Shard* to break free._`,
    }, { quoted: msg });
  } else {
    // Raider wins — loots defender
    const defBal = Number(p.lucons || 0);
    const loot = Math.min(500, Math.floor(defBal * 0.15));
    p.lucons = defBal - loot;
    ctx.savePlayers(players);
    raider.reward.push({ id: "LUCONS", amount: loot });
    state.active.kills.push({ raider: raiderJid, mora: state.active.encountersAssigned[raiderJid] || null });
    saveState(state);
    return sock.sendMessage(chatId, {
      text:
        `💀 *${getDisplayName(players, raiderJid)}'s ${atkMora.mora.name}* overpowers the defender!\n\n` +
        `💰 Looted: *${loot} Lucons* from ${getDisplayName(players, senderId)}.`,
    }, { quoted: msg });
  }
}

async function cmdRaidAttackEncounter(ctx, chatId, senderId, msg) {
  // Called during encounter phase — raider attacks their assigned treasury mora
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active || state.active.phase !== "encounter") return cmdRaidAttack(ctx, chatId, senderId, msg);
  const r = state.active.raiders[senderId];
  if (!r) return sock.sendMessage(chatId, { text: "🚫 You are not in this raid." }, { quoted: msg });
  if (r.captured) return sock.sendMessage(chatId, { text: "⛓️ You are captured. You cannot act." }, { quoted: msg });
  if (r.encounterResolved) return sock.sendMessage(chatId, { text: "✅ You've already cleared your encounter." }, { quoted: msg });

  const assigned = state.active.encountersAssigned[senderId];
  if (!assigned) {
    r.encounterResolved = true;
    saveState(state);
    return sock.sendMessage(chatId, { text: "👻 Empty vault halls — nothing to fight. Your loot share is secured." }, { quoted: msg });
  }

  const p = players[senderId];
  const pick = pickCompanionOrFirstMora(p);
  if (!pick) return sock.sendMessage(chatId, { text: "❌ You have no Mora to fight with." }, { quoted: msg });

  // Defender-less treasury mora: 50% stats
  const hasDefender = r.engagedBy;
  const statMul = hasDefender ? 1.0 : 0.5;

  const roleMul = r.role === "Frontline" ? 1.2 : r.role === "Mid" ? 1.1 : 0.9;
  const raiderPower = (Number(pick.mora.stats?.atk || pick.mora.atk || 50) + Number(pick.mora.stats?.def || pick.mora.def || 40)) * Math.max(1, Number(pick.mora.level || 1)) * roleMul;
  const treasurePower = (Number(assigned.stats?.atk || 50) + Number(assigned.stats?.def || 40)) * Math.max(1, Number(assigned.level || 1)) * statMul;
  const roll = (Math.random() * 0.3) + 0.85;

  if (raiderPower * roll > treasurePower) {
    // Raider wins — loots the mora
    r.encounterResolved = true;
    r.reward.push({ type: "mora", mora: assigned });
    state.active.kills.push({ raider: senderId, mora: assigned });
    saveState(state);
    return sock.sendMessage(chatId, {
      text:
        `⚔️ *${getDisplayName(players, senderId)}'s ${pick.mora.name}* defeats *${assigned.name}*!\n\n` +
        `🐉 *Looted: ${assigned.name}* (${assigned.rarity} • Lv ${assigned.level})`,
    }, { quoted: msg });
  } else {
    // Raider loses encounter — mora stays deployed, raider blocked
    r.encounterResolved = true;
    r.reward = r.reward.filter(x => x.type !== "mora");
    saveState(state);
    return sock.sendMessage(chatId, {
      text:
        `💥 *${assigned.name}* drives back *${pick.mora.name}*!\n\n` +
        `_You are locked out of further encounters this raid._`,
    }, { quoted: msg });
  }
}

async function cmdEscapeCapture(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active) return sock.sendMessage(chatId, { text: "❌ No active raid." }, { quoted: msg });
  const r = state.active.raiders[senderId];
  if (!r || !r.captured) return sock.sendMessage(chatId, { text: "❌ You are not captured." }, { quoted: msg });

  const p = players[senderId];
  const inv = p.inventory || {};
  const have = Number(inv.RES_001 || 0);
  if (have < 1) return sock.sendMessage(chatId, { text: "❌ You need a *Rift Escape Shard* to break free." }, { quoted: msg });

  inv.RES_001 = have - 1;
  if (inv.RES_001 <= 0) delete inv.RES_001;
  p.inventory = inv;
  ctx.savePlayers(players);

  r.captured = false;
  state.active.captures = state.active.captures.filter(j => j !== senderId);
  saveState(state);

  return sock.sendMessage(chatId, {
    text:
      `🌀 *The shard cracks open a tear. You slip through.*\n\n` +
      `⛓️→💨 *${getDisplayName(players, senderId)}* escapes captivity!`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════════
//  RESOLUTION
// ══════════════════════════════════════════════════════════════════
async function resolveRaid(ctx, state, reason = "timeout") {
  const { sock, players } = ctx;
  if (!state.active) return;
  const raid = state.active;

  const t = ctx.loadTreasury();
  const tgt = t[raid.target];
  const atk = t[raid.faction];

  const wallSurvived = tgt.wallHp > 0 && raid.phase === "wall"; // defenders held wall

  // Compute kills and loot
  const uncaptured = Object.keys(raid.raiders).filter(j => !raid.raiders[j].captured);
  const successfulKills = raid.kills.filter(k => uncaptured.includes(k.raider));

  let summary = "";
  if (wallSurvived || (!successfulKills.length && !raid.wallBreakAt)) {
    // Raid FAILED — defenders held
    summary =
      `🛡️ *RAID FAILED*\n` +
      `The *${FACTION_LABEL[raid.target]}* held their wall.\n\n` +
      `${pickKaelLine("resolve_fail")}\n\n`;
    ctx.adjustHonour(raid.target, 15);
    ctx.adjustHonour(raid.faction, -20);
    ctx.addFactionPoints(raid.target, 50, "raid defense");
    logChronicle("raid_fail", `${FACTION_LABEL[raid.faction]} attacked ${FACTION_LABEL[raid.target]} — the wall held.`, [raid.faction, raid.target], []);
  } else {
    // Raid SUCCESS — distribute loot
    const treasuryTake = Math.floor(tgt.lucons * 0.30);
    tgt.lucons = Math.max(0, tgt.lucons - treasuryTake);
    const perRaider = uncaptured.length ? Math.floor(treasuryTake / uncaptured.length) : 0;

    for (const j of uncaptured) {
      const pl = players[j];
      if (!pl) continue;
      pl.lucons = (pl.lucons || 0) + perRaider;
      // Grant mora rewards (treasury mora loot)
      for (const rw of raid.raiders[j].reward) {
        if (rw.type === "mora" && rw.mora) {
          pl.moraOwned ||= [];
          const newMora = {
            ...rw.mora,
            hp: rw.mora.stats?.hp || 100,
            maxHp: rw.mora.stats?.hp || 100,
            pe: 0,
            corrupted: !!rw.mora.corrupted,
          };
          delete newMora.submittedBy;
          delete newMora.submittedByName;
          delete newMora.submittedAt;
          pl.moraOwned.push(newMora);
        }
      }
    }
    ctx.savePlayers(players);

    // Fines from captured raiders
    let fineTotal = 0;
    for (const jid of raid.captures) {
      const pl = players[jid];
      if (!pl) continue;
      const fine = Math.min(CAPTURE_FINE, Number(pl.lucons || 0));
      pl.lucons = (pl.lucons || 0) - fine;
      fineTotal += fine;
    }
    tgt.lucons += fineTotal;
    ctx.savePlayers(players);

    // Remove looted deployed mora from treasury
    const lootedIds = new Set(
      raid.kills.filter(k => k.mora).map(k => k.mora.moraId + "|" + k.mora.submittedAt)
    );
    tgt.moraDeployed = (tgt.moraDeployed || []).filter(m => !lootedIds.has(m.moraId + "|" + m.submittedAt));

    // FP
    for (const j of uncaptured) ctx.addFactionPoints(raid.faction, 20, "raid success");

    ctx.adjustHonour(raid.faction, 10);
    ctx.adjustHonour(raid.target, tgt.lucons <= 0 ? -30 : -20);

    summary =
      `🏆 *RAID SUCCESS*\n` +
      `*${FACTION_LABEL[raid.faction]}* tore open *${FACTION_LABEL[raid.target]}*.\n\n` +
      `${pickKaelLine("resolve_success")}\n\n` +
      `💰 Treasury looted: *${treasuryTake}L* (${perRaider}L per survivor)\n` +
      `🐉 Mora looted: *${raid.kills.filter(k => k.mora).length}*\n` +
      `⛓️ Captured raiders: *${raid.captures.length}* (fined ${CAPTURE_FINE}L each)\n\n`;

    logChronicle(
      "raid_success",
      `${FACTION_LABEL[raid.faction]} breached ${FACTION_LABEL[raid.target]} — ${treasuryTake}L looted, ${raid.kills.filter(k => k.mora).length} mora taken.`,
      [raid.faction, raid.target],
      uncaptured,
    );
  }

  ctx.saveTreasury(t);

  // Apply cooldown to attacker
  state.cooldowns[raid.faction] = Date.now() + RAID_COOLDOWN_MS;

  // Archive
  state.history.unshift({
    at: Date.now(),
    attacker: raid.faction,
    defender: raid.target,
    outcome: wallSurvived ? "failed" : "success",
    raiders: Object.keys(raid.raiders),
    captures: raid.captures,
  });
  state.history = state.history.slice(0, 25);

  state.active = null;
  saveState(state);

  const chatId = raid.chatId;
  await sock.sendMessage(chatId, { text: summary + `_24h cooldown now active for ${FACTION_LABEL[raid.faction]}._` });
}

// Called periodically on message traffic — advances state on timeouts
async function tickRaid(ctx) {
  const state = loadState();
  if (!state.active) return;
  const now = Date.now();
  if (state.active.phase === "wall" && now > state.active.wallPhaseEnds) {
    await resolveRaid(ctx, state, "wall_timeout");
  } else if (state.active.phase === "encounter" && now > state.active.encounterEnds) {
    await resolveRaid(ctx, state, "encounter_timeout");
  }
}

// Also check Kael random expiry
function tickKael(ctx) {
  const state = loadState();
  if (state.kaelState.active && Date.now() > state.kaelState.expiresAt) {
    state.kaelState = { active: false, expiresAt: 0, claimedBy: null, summonedBy: null };
    saveState(state);
  }
}

// ══════════════════════════════════════════════════════════════════
//  STATUS / HISTORY / ADMIN
// ══════════════════════════════════════════════════════════════════
async function cmdRaidStatus(ctx, chatId, msg) {
  const { sock, players } = ctx;
  const state = loadState();
  if (!state.active) return sock.sendMessage(chatId, { text: "🌌 No active raid." }, { quoted: msg });
  const r = state.active;
  const t = ctx.loadTreasury();
  const tgt = r.target ? t[r.target] : null;
  const wallLine = tgt ? `🧱 ${wallBar(tgt.wallHp, tgt.wallMaxHp)}  ${tgt.wallHp}/${tgt.wallMaxHp}` : "_(no target yet)_";
  const raiderLines = Object.entries(r.raiders).map(([j, info]) => {
    const tag = info.captured ? "⛓️" : info.ready ? "✅" : "⏳";
    const roleIcon = info.role === "Frontline" ? "⚔️" : info.role === "Mid" ? "🎯" : info.role === "Support" ? "🛡️" : "❓";
    return `${tag} ${roleIcon} *${getDisplayName(players, j)}*${info.role ? ` (${info.role})` : ""}`;
  }).join("\n") || "_no raiders_";

  return sock.sendMessage(chatId, {
    text:
      `🌀 *RAID STATUS*\n\n` +
      `⚔️ Attacker: *${FACTION_LABEL[r.faction]}*\n` +
      `🎯 Target: *${r.target ? FACTION_LABEL[r.target] : "_(not launched)_"}*\n` +
      `🎭 Phase: *${r.phase.toUpperCase()}*\n` +
      `${wallLine}\n\n` +
      `💰 Pot: *${r.pot}L*\n\n` +
      `*RAIDERS:*\n${raiderLines}`,
  }, { quoted: msg });
}

async function cmdRaidHistory(ctx, chatId, msg) {
  const { sock } = ctx;
  const state = loadState();
  const h = (state.history || []).slice(0, 5);
  if (!h.length) return sock.sendMessage(chatId, { text: "📜 No raid history yet." }, { quoted: msg });
  const lines = h.map((e, i) => {
    const when = new Date(e.at).toISOString().slice(0, 10);
    const outcome = e.outcome === "success" ? "🏆 SUCCESS" : "🛡️ FAILED";
    return `${i + 1}. [${when}] ${FACTION_EMOJI[e.attacker]} ${FACTION_LABEL[e.attacker]} → ${FACTION_EMOJI[e.defender]} ${FACTION_LABEL[e.defender]}  ${outcome}`;
  });
  return sock.sendMessage(chatId, {
    text: `📜 *RAID HISTORY (recent 5)*\n\n${lines.join("\n")}`,
  }, { quoted: msg });
}

// Owner commands
async function cmdAddRaidGroup(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." }, { quoted: msg });
  if (!chatId.endsWith("@g.us")) return sock.sendMessage(chatId, { text: "❌ Run in a group." }, { quoted: msg });
  const state = loadState();
  state.raidGroups.allowed ||= [];
  if (!state.raidGroups.allowed.includes(chatId)) state.raidGroups.allowed.push(chatId);
  saveState(state);
  return sock.sendMessage(chatId, { text: `✅ This group is now a Raid Ground.` }, { quoted: msg });
}

async function cmdRemoveRaidGroup(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." }, { quoted: msg });
  const state = loadState();
  state.raidGroups.allowed = (state.raidGroups.allowed || []).filter(id => id !== chatId);
  saveState(state);
  return sock.sendMessage(chatId, { text: `✅ Group removed from Raid Grounds.` }, { quoted: msg });
}

async function cmdRaidsToggle(ctx, chatId, senderId, msg, enable) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." }, { quoted: msg });
  const state = loadState();
  state.raidGroups.enabled = !!enable;
  saveState(state);
  return sock.sendMessage(chatId, { text: enable ? "✅ Raids enabled." : "🛑 Raids disabled." }, { quoted: msg });
}

async function cmdForceEnd(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner only." }, { quoted: msg });
  const state = loadState();
  if (!state.active) return sock.sendMessage(chatId, { text: "No active raid." }, { quoted: msg });
  await resolveRaid(ctx, state, "force_end");
  return sock.sendMessage(chatId, { text: "✅ Raid force-ended." }, { quoted: msg });
}

module.exports = {
  cmdSummonKael,
  cmdClaimContract,
  cmdRaidJoin,
  cmdRaidLaunch,
  cmdRerollRoles,
  cmdReady,
  cmdRaidGo,
  cmdRaidKick,
  cmdRaidAttack,
  cmdRaidAttackEncounter,
  cmdRaidReinforce,
  cmdRaidEngage,
  cmdEscapeCapture,
  cmdRaidStatus,
  cmdRaidHistory,
  cmdAddRaidGroup,
  cmdRemoveRaidGroup,
  cmdRaidsToggle,
  cmdForceEnd,
  tickRaid,
  tickKael,
  loadState,
  saveState,
  isRaidGroup,
};

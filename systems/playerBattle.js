// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA PvP BATTLE  v0.7.1                                     ║
// ║                                                                ║
// ║  Player-vs-player turn-based combat using the SAME engine as   ║
// ║  wild fights:                                                  ║
// ║    • Both players use their full moveset (base + style + merge)║
// ║    • Stats apply on both sides (melee/mora attack, def/speed   ║
// ║      defense, vit affects max HP)                              ║
// ║    • Style rarity buff, corrupted-merge bonus, status moves    ║
// ║      (selfHeal/brace/counter/energyRestore/neverMisses) all     ║
// ║      work identically to wild combat                           ║
// ║                                                                ║
// ║  Differences from wild:                                        ║
// ║    • Opponent fights back with THEIR moveset, not Mora AI      ║
// ║    • Optional Lucons stake transferred on win                  ║
// ║    • Loser's HP set to 1 (not 0) — no permadeath               ║
// ║    • Winner gets player XP, faction points; loser nicked some  ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

// Late-required to avoid circular import issues — both modules live in
// /systems and reference each other at startup.
let _wb = null;
function wb() { if (!_wb) _wb = require("./wildbattle"); return _wb; }
let _shards = null;
function shards() { if (!_shards) _shards = require("./shards"); return _shards; }
let _stats = null;
function stats() { if (!_stats) _stats = require("./stats"); return _stats; }
let _quests = null;
function quests() { if (!_quests) _quests = require("./quests"); return _quests; }

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function getDisplayNameWithMerge(players, jid) {
  const p = players?.[jid];
  const base = p?.username && String(p.username).trim() ? String(p.username).trim() : String(jid).split("@")[0];
  try { return shards().getMergedDisplayName(p, base); } catch { return base; }
}

// ── State storage ──
const pvpBattles    = new Map(); // chatId -> battle state
const pvpChallenges = new Map(); // chatId -> challenge

const CHALLENGE_TTL_MS = 60_000; // 1 minute to accept

function getBattle(chatId)         { return pvpBattles.get(chatId) || null; }
function setBattle(chatId, state)  { pvpBattles.set(chatId, state); }
function clearBattle(chatId)       { pvpBattles.delete(chatId); }
function getChallenge(chatId) {
  const ch = pvpChallenges.get(chatId);
  if (!ch) return null;
  if (Date.now() - ch.createdAt > CHALLENGE_TTL_MS) {
    pvpChallenges.delete(chatId);
    return null;
  }
  return ch;
}
function setChallenge(chatId, ch)  { pvpChallenges.set(chatId, ch); }
function clearChallenge(chatId)    { pvpChallenges.delete(chatId); }

// ── Helper: player is "engaged" elsewhere? ──
function isElsewhereEngaged(chatId, jid) {
  try {
    const wbs = wb();
    // Iterate the wildBattles map indirectly by checking a per-(chat, player) key
    // Wild battles are keyed per chat-sender; just check this chat.
    if (wbs.getWildBattle && wbs.getWildBattle(chatId, jid)) return "wild";
  } catch {}
  // No global lookup of all PvP for this player — we only allow one PvP per
  // chat by design, so checking the chat's own battle is enough.
  const here = getBattle(chatId);
  if (here && (here.p1 === jid || here.p2 === jid)) return "pvp";
  return null;
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

// .battle @user [stake]
async function cmdBattle(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;

  if (!String(chatId).endsWith("@g.us")) {
    return sock.sendMessage(chatId, { text: "❌ PvP battles only work in groups." }, { quoted: msg });
  }
  if (getBattle(chatId)) {
    return sock.sendMessage(chatId, { text: "⚠️ A battle is already active in this group." }, { quoted: msg });
  }
  if (getChallenge(chatId)) {
    return sock.sendMessage(chatId, { text: "⚠️ A challenge is already pending in this group." }, { quoted: msg });
  }

  const challenger = players[senderId];
  if (!challenger) {
    return sock.sendMessage(chatId, { text: "❌ Use *.start* first." }, { quoted: msg });
  }
  wb().ensurePlayerCombatFields(challenger);

  // Resolve target — first mention or first numeric arg
  let targetJid = null;
  try {
    const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length) targetJid = mentioned[0];
  } catch {}
  if (!targetJid && args[0]) {
    const num = String(args[0]).replace(/^@/, "").replace(/[^0-9]/g, "");
    if (num) targetJid = Object.keys(players).find((j) => j.startsWith(num)) || null;
  }
  if (!targetJid || !players[targetJid]) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.battle @user [stake]*\nMention or type the user's number.`,
    }, { quoted: msg });
  }
  if (targetJid === senderId) {
    return sock.sendMessage(chatId, { text: "❌ You can't challenge yourself." }, { quoted: msg });
  }

  // Stake parsing — find a positive integer in args (after the mention)
  let stake = 0;
  for (const a of args) {
    const n = parseInt(a, 10);
    if (Number.isFinite(n) && n > 0) { stake = n; break; }
  }
  if (stake > 0 && Number(challenger.lucons || 0) < stake) {
    return sock.sendMessage(chatId, {
      text: `❌ You can't stake *${stake} Lucons* — you have *${challenger.lucons || 0}*.`,
    }, { quoted: msg });
  }
  const target = players[targetJid];
  wb().ensurePlayerCombatFields(target);
  if (stake > 0 && Number(target.lucons || 0) < stake) {
    return sock.sendMessage(chatId, {
      text: `❌ @${targetJid.split("@")[0]} doesn't have *${stake} Lucons* to match the stake.`,
      mentions: [targetJid],
    }, { quoted: msg });
  }

  // Engagement gates
  const challEng = isElsewhereEngaged(chatId, senderId);
  if (challEng) return sock.sendMessage(chatId, { text: `❌ You're already in a ${challEng} battle.` }, { quoted: msg });
  const tgtEng = isElsewhereEngaged(chatId, targetJid);
  if (tgtEng) return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]} is already in a ${tgtEng} battle.`, mentions: [targetJid] }, { quoted: msg });

  if (Number(challenger.playerHp || 0) <= 0) {
    return sock.sendMessage(chatId, { text: "❌ You're knocked out. Heal first." }, { quoted: msg });
  }
  if (Number(target.playerHp || 0) <= 0) {
    return sock.sendMessage(chatId, { text: `❌ @${targetJid.split("@")[0]} is knocked out.`, mentions: [targetJid] }, { quoted: msg });
  }

  setChallenge(chatId, {
    challenger: senderId,
    target: targetJid,
    stake,
    createdAt: Date.now(),
  });

  const stakeLine = stake > 0 ? `\n💰 Stake: *${stake} Lucons*` : "";
  return sock.sendMessage(chatId, {
    text:
      `⚔️ *PvP CHALLENGE*\n${DIVIDER}\n` +
      `@${senderId.split("@")[0]} challenges @${targetJid.split("@")[0]}!${stakeLine}\n${DIVIDER}\n` +
      `Target: respond with *.accept* or *.reject*.\n` +
      `Expires in 60s.`,
    mentions: [senderId, targetJid],
  }, { quoted: msg });
}

// .accept
async function cmdAccept(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const ch = getChallenge(chatId);
  if (!ch) return sock.sendMessage(chatId, { text: "❌ No pending challenge." }, { quoted: msg });
  if (ch.target !== senderId) {
    return sock.sendMessage(chatId, { text: "❌ This challenge isn't aimed at you." }, { quoted: msg });
  }
  if (getBattle(chatId)) {
    return sock.sendMessage(chatId, { text: "⚠️ A battle is already active." }, { quoted: msg });
  }

  const p1 = players[ch.challenger];
  const p2 = players[ch.target];
  if (!p1 || !p2) return sock.sendMessage(chatId, { text: "❌ One participant missing." }, { quoted: msg });

  wb().ensurePlayerCombatFields(p1);
  wb().ensurePlayerCombatFields(p2);

  if (Number(p1.playerHp || 0) <= 0 || Number(p2.playerHp || 0) <= 0) {
    clearChallenge(chatId);
    return sock.sendMessage(chatId, { text: "❌ Someone has 0 HP — challenge dropped." }, { quoted: msg });
  }
  if (ch.stake > 0) {
    if (Number(p1.lucons || 0) < ch.stake || Number(p2.lucons || 0) < ch.stake) {
      clearChallenge(chatId);
      return sock.sendMessage(chatId, { text: "❌ One side no longer has Lucons for the stake — dropped." }, { quoted: msg });
    }
  }

  // Reset combat energy fresh for both sides
  p1.combatEnergy = p1.combatMaxEnergy;
  p2.combatEnergy = p2.combatMaxEnergy;

  // Speed determines who swings first; tie → challenger
  let firstJid = ch.challenger;
  try {
    const sp1 = stats().dodgeChance(p1) / stats().SPEED_DODGE_PER_POINT; // back out raw speed
    const sp2 = stats().dodgeChance(p2) / stats().SPEED_DODGE_PER_POINT;
    if (sp2 > sp1) firstJid = ch.target;
  } catch {}

  const state = {
    chatId,
    p1: ch.challenger,
    p2: ch.target,
    stake: ch.stake,
    turnOwner: firstJid,
    round: 1,
    startedAt: Date.now(),
    lastActionAt: Date.now(),
  };
  setBattle(chatId, state);
  clearChallenge(chatId);

  const stakeLine = ch.stake > 0 ? `\n💰 Stake: *${ch.stake} Lucons*` : "";
  const header = renderBattleHeader(players, state);
  return sock.sendMessage(chatId, {
    text:
      `⚔️ *BATTLE BEGINS*\n${DIVIDER}\n` +
      `@${state.p1.split("@")[0]}  vs  @${state.p2.split("@")[0]}${stakeLine}\n${DIVIDER}\n` +
      `${header}\n\n` +
      `🌀 First to swing: @${firstJid.split("@")[0]}\n` +
      `Use *.attack* to view your moves, *.attack <n>* to strike, *.charge* to refresh energy, *.forfeit* to bail.`,
    mentions: [state.p1, state.p2, firstJid],
  }, { quoted: msg });
}

// .reject
async function cmdReject(ctx, chatId, senderId, msg) {
  const ch = getChallenge(chatId);
  if (!ch) return ctx.sock.sendMessage(chatId, { text: "❌ No challenge to reject." }, { quoted: msg });
  if (ch.target !== senderId) return ctx.sock.sendMessage(chatId, { text: "❌ Not your challenge." }, { quoted: msg });
  clearChallenge(chatId);
  return ctx.sock.sendMessage(chatId, {
    text: `🚫 @${senderId.split("@")[0]} rejected @${ch.challenger.split("@")[0]}'s challenge.`,
    mentions: [senderId, ch.challenger],
  }, { quoted: msg });
}

// .attack [n]
async function cmdAttack(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, battleMath, savePlayers, loadMora } = ctx;

  const state = getBattle(chatId);
  if (!state) return null; // not a PvP — let the dispatcher fall through

  // Only allow the turn owner to swing
  if (senderId !== state.p1 && senderId !== state.p2) {
    return sock.sendMessage(chatId, { text: "❌ You aren't in this battle." }, { quoted: msg });
  }
  if (state.turnOwner !== senderId) {
    return sock.sendMessage(chatId, {
      text: `⏳ Not your turn. Waiting for @${state.turnOwner.split("@")[0]}.`,
      mentions: [state.turnOwner],
    }, { quoted: msg });
  }

  const attacker = players[senderId];
  const defenderJid = senderId === state.p1 ? state.p2 : state.p1;
  const defender = players[defenderJid];
  wb().ensurePlayerCombatFields(attacker);
  wb().ensurePlayerCombatFields(defender);

  const moveset = wb().buildPlayerMoveset(attacker, loadMora);
  const pickRaw = args.join(" ").trim();
  if (!pickRaw) {
    return sock.sendMessage(chatId, {
      text:
        `🎴 *Your moves* — pick with *.attack <n>*\n\n` +
        wb().renderPlayerMoveset(moveset, attacker),
    }, { quoted: msg });
  }

  const move = wb().resolvePlayerMove(pickRaw, moveset);
  if (!move) return sock.sendMessage(chatId, { text: "❌ Move not found." }, { quoted: msg });
  if (attacker.combatEnergy < move.energyCost) {
    return sock.sendMessage(chatId, {
      text: `❌ Not enough energy. Need ${move.energyCost}, you have *${attacker.combatEnergy}*.`,
    }, { quoted: msg });
  }

  attacker.combatEnergy -= move.energyCost;
  const logs = [];
  const tag = move.source === "merge"
    ? (move.tier === "full" ? " 🔥" : " ✨")
    : move.source === "style" ? " 🥋" : " 🩶";

  // ── Pure-status moves (selfHeal-only / brace-only) ──
  const isPureStatus = move.power === 0 && (move.selfHeal || move.brace);
  if (move.name === "Block" || isPureStatus) {
    const fx = [];
    if (move.brace || move.name === "Block") {
      attacker.blockNextHit = true;
      if (move.counter) attacker.counterDamage = Number(move.counter);
      fx.push(`🛡 braces — next incoming hit halved` + (move.counter ? ` AND counter for *${move.counter}*` : ""));
    }
    if (move.selfHeal) {
      const heal = Number(move.selfHeal);
      const before = Number(attacker.playerHp || 0);
      attacker.playerHp = clamp(before + heal, 0, Number(attacker.playerMaxHp || 100));
      fx.push(`💚 +${attacker.playerHp - before} HP _(${attacker.playerHp}/${attacker.playerMaxHp})_`);
    }
    logs.push(`✨ @${senderId.split("@")[0]}${tag} used *${move.name}*\n   ${fx.join("\n   ")}`);
  } else {
    // ── Damage roll ──
    const aComb = wb().getPlayerCombatant(attacker, loadMora);
    const dComb = wb().getPlayerCombatant(defender, loadMora);

    // Defender dodge
    let dodged = false;
    try { if (Math.random() < stats().dodgeChance(defender)) dodged = true; } catch {}

    // Attacker hit roll (neverMisses bypass)
    const hit = move.neverMisses ? true : battleMath.checkHit(move.accuracy ?? 100);

    if (dodged) {
      logs.push(`💨 @${defenderJid.split("@")[0]} dodges @${senderId.split("@")[0]}${tag}'s *${move.name}*!`);
    } else if (!hit) {
      logs.push(`💨 @${senderId.split("@")[0]}${tag} used *${move.name}* and missed!`);
    } else {
      const crit = battleMath.rollCrit(10);
      const moveData = { power: move.power, accuracy: move.accuracy, category: move.category, type: aComb.type };
      const res = wb().calcDamage(battleMath, aComb, dComb, moveData, crit);

      // Stat bonuses
      try {
        if (move.source === "merge") res.dmg += stats().moraDamageBonus(attacker);
        else                          res.dmg += stats().meleeDamageBonus(attacker);
      } catch {}

      // Style rarity buff
      let rarityPct = 0;
      if (move.source === "style" && move.styleRarity) {
        try {
          rarityPct = quests().getRarityBuff(move.styleRarity);
          if (rarityPct > 0) res.dmg = Math.floor(res.dmg * (1 + rarityPct));
        } catch {}
      }

      // Corrupted merge bonus
      let corruptedActive = false;
      const merge = shards().getCurrentMerge(attacker);
      if (merge?.corrupted && move.source === "merge") {
        res.dmg = Math.floor(res.dmg * (1 + shards().CORRUPTED_DMG_BONUS));
        corruptedActive = true;
      }

      // Defender brace from previous turn
      let braceHalved = false;
      let counterDealt = 0;
      if (defender.blockNextHit) {
        res.dmg = Math.floor(res.dmg / 2);
        braceHalved = true;
        delete defender.blockNextHit;
        if (Number(defender.counterDamage) > 0) {
          counterDealt = Number(defender.counterDamage);
          delete defender.counterDamage;
        }
      }

      // Defender flat defense reduction
      try {
        const r = stats().defenseReduction(defender);
        if (r > 0) res.dmg = Math.max(1, Math.floor(res.dmg - r));
      } catch {}

      // Energy refund on damage hits
      if (move.energyRestore) {
        attacker.combatEnergy = clamp(
          attacker.combatEnergy + Number(move.energyRestore), 0, attacker.combatMaxEnergy
        );
      }

      defender.playerHp = Math.max(0, Number(defender.playerHp || 0) - res.dmg);

      const effTxt =
        res.mult >= 1.2 ? "  🔥*SUPER!*"
        : res.mult <= 0.85 ? "  🥶*WEAK*"
        : "";
      const rarityTag =
        rarityPct >= 0.20 ? "  🌟*LEGENDARY!*"
        : rarityPct >= 0.10 ? "  💎*EPIC!*"
        : rarityPct >= 0.05 ? "  ✨*RARE!*"
        : "";

      logs.push(
        `⚔️ @${senderId.split("@")[0]}${tag} used *${move.name}* → *${res.dmg}* to @${defenderJid.split("@")[0]}` +
        (crit ? "  ✨*CRIT!*" : "") +
        effTxt +
        (corruptedActive ? "  ☠*CORRUPTED!*" : "") +
        rarityTag +
        (braceHalved ? "  🛡*BRACED — halved!*" : "")
      );
      if (counterDealt) {
        attacker.playerHp = Math.max(0, Number(attacker.playerHp || 0) - counterDealt);
        logs.push(`⚔️ *Counter!* @${defenderJid.split("@")[0]} strikes back for *${counterDealt}*.`);
      }

      // Corrupted instability backlash on attacker
      if (merge?.corrupted && Math.random() < shards().CORRUPTED_BACKLASH_PCT) {
        const back = Math.max(3, Math.floor(Number(attacker.playerMaxHp || 100) * shards().CORRUPTED_BACKLASH_FRAC));
        attacker.playerHp = Math.max(0, Number(attacker.playerHp || 0) - back);
        logs.push(`☠ The corruption recoils — @${senderId.split("@")[0]} takes *${back}* instability damage!`);
      }
    }
  }

  // ── End-of-turn: check KO ──
  if (Number(defender.playerHp || 0) <= 0) {
    return finishBattle(ctx, chatId, msg, state, senderId, defenderJid, logs);
  }
  if (Number(attacker.playerHp || 0) <= 0) {
    return finishBattle(ctx, chatId, msg, state, defenderJid, senderId, logs);
  }

  // ── Pass turn ──
  state.turnOwner = defenderJid;
  state.round += 1;
  state.lastActionAt = Date.now();
  // Both sides regen a sliver of energy on turn pass
  wb().regenPlayerCombatEnergy(attacker);
  wb().regenPlayerCombatEnergy(defender);
  setBattle(chatId, state);
  savePlayers(players);

  const header = renderBattleHeader(players, state);
  return sock.sendMessage(chatId, {
    text: `${logs.join("\n")}\n\n${header}\n\n🌀 Now: @${state.turnOwner.split("@")[0]}`,
    mentions: [state.p1, state.p2, state.turnOwner],
  }, { quoted: msg });
}

// .charge — spend turn for energy
async function cmdCharge(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const state = getBattle(chatId);
  if (!state) return null;
  if (state.turnOwner !== senderId) {
    return sock.sendMessage(chatId, { text: "⏳ Not your turn." }, { quoted: msg });
  }
  const me = players[senderId];
  wb().ensurePlayerCombatFields(me);
  const gain = Math.max(8, Math.floor(me.combatMaxEnergy * 0.30));
  me.combatEnergy = clamp(me.combatEnergy + gain, 0, me.combatMaxEnergy);

  const defenderJid = senderId === state.p1 ? state.p2 : state.p1;
  state.turnOwner = defenderJid;
  state.round += 1;
  setBattle(chatId, state);
  savePlayers(players);

  const header = renderBattleHeader(players, state);
  return sock.sendMessage(chatId, {
    text:
      `🔋 @${senderId.split("@")[0]} focused — +${gain} energy.\n\n${header}\n\n🌀 Now: @${defenderJid.split("@")[0]}`,
    mentions: [state.p1, state.p2, defenderJid],
  }, { quoted: msg });
}

// .forfeit
async function cmdForfeit(ctx, chatId, senderId, msg) {
  const state = getBattle(chatId);
  if (!state) return null;
  if (senderId !== state.p1 && senderId !== state.p2) {
    return ctx.sock.sendMessage(chatId, { text: "❌ You aren't in this battle." }, { quoted: msg });
  }
  const winnerJid = senderId === state.p1 ? state.p2 : state.p1;
  return finishBattle(ctx, chatId, msg, state, winnerJid, senderId, [
    `🏳 @${senderId.split("@")[0]} forfeits the match.`,
  ]);
}

// ── Header render ──
function renderBattleHeader(players, state) {
  const p1 = players[state.p1];
  const p2 = players[state.p2];
  const n1 = getDisplayNameWithMerge(players, state.p1);
  const n2 = getDisplayNameWithMerge(players, state.p2);
  const hp1 = `${p1.playerHp}/${p1.playerMaxHp}`;
  const hp2 = `${p2.playerHp}/${p2.playerMaxHp}`;
  const e1  = `${p1.combatEnergy}/${p1.combatMaxEnergy}`;
  const e2  = `${p2.combatEnergy}/${p2.combatMaxEnergy}`;
  return (
    `🟥 *${n1}*\n` +
    `   ❤️ ${hp1}   🔋 ${e1}\n` +
    `🟦 *${n2}*\n` +
    `   ❤️ ${hp2}   🔋 ${e2}\n` +
    `🌀 Round ${state.round}`
  );
}

// ── Finish + reward ──
async function finishBattle(ctx, chatId, msg, state, winnerJid, loserJid, logs = []) {
  const { sock, players, savePlayers, xpSystem } = ctx;
  const W = players[winnerJid];
  const L = players[loserJid];

  // HP floors so loser stays alive
  if (Number(L.playerHp || 0) <= 0) L.playerHp = 1;

  // Stake transfer
  let stakeLine = "";
  if (state.stake > 0) {
    const amt = Number(state.stake);
    if (Number(L.lucons || 0) >= amt) {
      L.lucons = Number(L.lucons) - amt;
      W.lucons = Number(W.lucons || 0) + amt;
      stakeLine = `\n💰 *Stake transferred:* +${amt} → @${winnerJid.split("@")[0]} / -${amt} from @${loserJid.split("@")[0]}`;
    } else {
      const got = Number(L.lucons || 0);
      L.lucons = 0;
      W.lucons = Number(W.lucons || 0) + got;
      stakeLine = `\n💰 *Partial stake:* +${got} (loser only had ${got})`;
    }
  }

  // Player XP — winner gets a healthy bump, loser still learns a little
  const winXp = 60;
  const loseXp = 25;
  const wRes = xpSystem.addPlayerXp(W, winXp);
  const lRes = xpSystem.addPlayerXp(L, loseXp);
  const xpLine =
    `🌟 XP — winner +${winXp}${wRes.leveledUp ? ` 🆙 +${wRes.levels}` : ""}` +
    `  •  loser +${loseXp}${lRes.leveledUp ? ` 🆙 +${lRes.levels}` : ""}`;

  // Faction points — only if both factioned
  let factionLine = "";
  if (W.faction && L.faction && W.faction !== L.faction) {
    try {
      const fs = require("fs"); const path = require("path");
      const f = path.join(__dirname, "..", "data", "faction_points.json");
      const fp = JSON.parse(fs.readFileSync(f, "utf8"));
      fp[W.faction] = (fp[W.faction] || 0) + 5;
      fp[L.faction] = Math.max(0, (fp[L.faction] || 0) - 3);
      fs.writeFileSync(f, JSON.stringify(fp, null, 2));
      factionLine = `\n🏷 Faction points: *${W.faction}* +5  /  *${L.faction}* -3`;
    } catch {}
  }

  clearBattle(chatId);
  savePlayers(players);

  const winnerName = getDisplayNameWithMerge(players, winnerJid);
  const loserName  = getDisplayNameWithMerge(players, loserJid);
  return sock.sendMessage(chatId, {
    text:
      `${logs.join("\n")}\n${DIVIDER}\n` +
      `🏆 *${winnerName}* defeats *${loserName}*\n${DIVIDER}\n` +
      xpLine +
      factionLine +
      stakeLine +
      `\n_Loser's HP set to 1 — heal up before the next fight._`,
    mentions: [winnerJid, loserJid],
  }, { quoted: msg });
}

module.exports = {
  cmdBattle,
  cmdAccept,
  cmdReject,
  cmdAttack,
  cmdCharge,
  cmdForfeit,
  getBattle,
  clearBattle,
};

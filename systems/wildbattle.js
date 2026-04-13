const corruptionSystem    = require("./corruption");
const huntingSystem       = require("./hunting");
const factionMarketSystem = require("./factionMarket");
const missionSystem       = require("./factionMissionSystem");
const itemsSystem         = require("./items");

// ── RARITY-BASED REWARD TABLE ────────────────────────────────
const RARITY_REWARDS = {
  common:    { intelligence: 2,  sanctuary_lucons: 20,  sanctuary_resonance: 2,  execute_resonance: 3,  execute_lucons: 25,  harvest_lucons: 30,  harvest_resonance: 2  },
  uncommon:  { intelligence: 3,  sanctuary_lucons: 35,  sanctuary_resonance: 4,  execute_resonance: 5,  execute_lucons: 40,  harvest_lucons: 50,  harvest_resonance: 3  },
  rare:      { intelligence: 5,  sanctuary_lucons: 60,  sanctuary_resonance: 6,  execute_resonance: 8,  execute_lucons: 65,  harvest_lucons: 80,  harvest_resonance: 5  },
  epic:      { intelligence: 8,  sanctuary_lucons: 100, sanctuary_resonance: 10, execute_resonance: 12, execute_lucons: 100, harvest_lucons: 130, harvest_resonance: 7  },
  legendary: { intelligence: 12, sanctuary_lucons: 160, sanctuary_resonance: 15, execute_resonance: 18, execute_lucons: 160, harvest_lucons: 200, harvest_resonance: 10 },
  mythic:    { intelligence: 18, sanctuary_lucons: 250, sanctuary_resonance: 22, execute_resonance: 25, execute_lucons: 250, harvest_lucons: 300, harvest_resonance: 15 },
};

function getRewards(rarity) {
  return RARITY_REWARDS[String(rarity || "common").toLowerCase()] || RARITY_REWARDS.common;
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const wildBattles = new Map(); // chatId:senderId -> state

function makeKey(chatId, senderId) {
  return `${chatId}::${senderId}`;
}

function getWildBattle(chatId, senderId) {
  return wildBattles.get(makeKey(chatId, senderId)) || null;
}

function setWildBattle(chatId, senderId, state) {
  wildBattles.set(makeKey(chatId, senderId), state);
}

function clearWildBattle(chatId, senderId) {
  wildBattles.delete(makeKey(chatId, senderId));
}

function getDisplayName(players, jid) {
  const p = players?.[jid];
  return p?.username && String(p.username).trim()
    ? String(p.username).trim()
    : String(jid).split("@")[0];
}

function hpLine(hpBar, m) {
  const hp = clamp(Number(m.hp || 0), 0, 999999);
  const max = clamp(Number(m.maxHp || 0), 1, 999999);
  return `❤️ HP: ${hpBar.createHpBar(hp, max)}  *${hp}/${max}*`;
}

function energyLine(m) {
  const maxE = Math.max(1, Number(m.maxEnergy || m.stats?.energy || 1));
  const en = clamp(Number(m.energy || maxE), 0, maxE);
  return `🔋 EN: *${en}/${maxE}*`;
}

function isFainted(m) {
  return !m || Number(m.hp || 0) <= 0;
}

function ensureEnergyFields(m) {
  if (!m) return;
  const maxE = Math.max(1, Number(m.maxEnergy || m.stats?.energy || 30));
  m.maxEnergy = maxE;
  if (typeof m.energy !== "number" || !Number.isFinite(m.energy)) m.energy = maxE;
  m.energy = clamp(Math.floor(m.energy), 0, maxE);
}

function getSpecies(moraList, moraId) {
  return moraList.find((x) => Number(x.id) === Number(moraId)) || null;
}

function getMoveData(species, moveName) {
  if (!species?.moves || typeof species.moves !== "object") return null;
  return species.moves[moveName] || null;
}

function typeMultiplier(attType, defType) {
  const a = String(attType || "").toLowerCase();
  const d = String(defType || "").toLowerCase();

  const chart = {
    aqua: { flame: 1.25, terra: 0.85, volt: 0.85 },
    flame: { nature: 1.25, aqua: 0.85, frost: 1.15 },
    nature: { terra: 1.25, flame: 0.85, wind: 0.9 },
    terra: { volt: 1.25, aqua: 1.15, wind: 0.85 },
    volt: { aqua: 1.25, terra: 0.85, wind: 1.05 },
    frost: { wind: 1.25, aqua: 0.95, flame: 0.85 },
    wind: { terra: 1.25, nature: 1.1, frost: 0.85 },
    shadow: { shadow: 1.1 },
    light: { shadow: 1.2 },
    dragon: { dragon: 1.15 },
    cosmic: { omni: 1.05, light: 1.05, shadow: 1.05 },
    omni: {
      aqua: 1.05, flame: 1.05, nature: 1.05, terra: 1.05, volt: 1.05,
      frost: 1.05, wind: 1.05, shadow: 1.05, light: 1.05, dragon: 1.05, cosmic: 1.05
    }
  };

  return chart?.[a]?.[d] ?? 1;
}

function pickWildIntro(isCorrupted = false) {
  const normal = [
    "🌿 The ground shifts... a wild Mora steps forward.",
    "👁 You sense movement in the terrain — a wild Mora reveals itself.",
    "⚔ The hunt sharpens. A wild Mora blocks your path.",
    "🩸 The air tightens. Something hostile emerges from the wilds."
  ];

  const corrupted = [
    "☠ A twisted howl tears through the terrain — a Corrupted Mora emerges.",
    "🩸 The Rift stirs violently... a corrupted beast forces its way into the field.",
    "🌑 The atmosphere darkens. A Corrupted Mora lurches forward with killing intent.",
    "⚠ Raw corruption erupts nearby — an unstable beast has appeared."
  ];

  const pool = isCorrupted ? corrupted : normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickWildBattleLabel(isCorrupted = false) {
  const normal = [
    "⚔️ *WILD HUNT SKIRMISH*",
    "🗡️ *BEAST ENGAGEMENT*",
    "🌿 *HUNTER'S CLASH*"
  ];
  const corrupted = [
    "☠ *CORRUPTED BEAST ENGAGEMENT*",
    "🩸 *RIFT HUNT NIGHTMARE*",
    "🌑 *CORRUPTION SKIRMISH*"
  ];
  const pool = isCorrupted ? corrupted : normal;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickWildAiPersonality(isCorrupted = false) {
  const normal = ["aggressive", "cautious", "skittish", "territorial"];
  const corrupted = ["feral", "berserk", "unstable", "malicious"];
  const pool = isCorrupted ? corrupted : normal;
  return pool[randInt(0, pool.length - 1)];
}

function getPlayerParty(player) {
  const owned = Array.isArray(player?.moraOwned) ? player.moraOwned : [];
  const party = Array.isArray(player?.party) ? player.party.slice(0, 5) : [0, 1, 2, null, null];

  const out = [];
  for (let i = 0; i < 5; i++) {
    const idx = party[i];
    out.push(idx === null || idx === undefined ? null : (owned[idx] || null));
  }
  return out;
}

function pickFirstAliveIndex(party) {
  for (let i = 0; i < party.length; i++) {
    if (party[i] && !isFainted(party[i])) return i;
  }
  return -1;
}

function buildWildHeader(players, senderId, playerMora, wildMora, hpBar, state) {
  const hunterName = getDisplayName(players, senderId);
  const label = pickWildBattleLabel(!!state.isCorrupted);

  return (
    `${label}\n` +
    `👤 Hunter: @${String(senderId).split("@")[0]}\n` +
    `🧾 *${hunterName}* vs *${wildMora.name}*\n` +
    `🎭 Wild Nature: *${state.personality}*\n` +
    (state.isCorrupted ? `☠ Corruption Class: *${state.corruptionClass || "Variant"}*\n` : "") +
    `\n🟥 *${String(playerMora.name).toUpperCase()}* (Lv ${playerMora.level})\n` +
    `${hpLine(hpBar, playerMora)}\n${energyLine(playerMora)}\n\n` +
    `🟪 *${String(wildMora.name).toUpperCase()}* (Lv ${wildMora.level})\n` +
    `${hpLine(hpBar, wildMora)}\n${energyLine(wildMora)}`
  );
}

function scaleWildOwnedMora(baseSpecies, level, statMultiplier = 1) {
  const lv = Math.max(1, Number(level || 1));
  const base = baseSpecies?.baseStats || {};

  const maxHp = Math.max(1, Math.floor((Number(base.hp || 50) + lv * 3) * statMultiplier));
  const atk = Math.max(1, Math.floor((Number(base.atk || 10) + lv * 2) * statMultiplier));
  const def = Math.max(1, Math.floor((Number(base.def || 10) + lv * 2) * statMultiplier));
  const spd = Math.max(1, Math.floor((Number(base.spd || 10) + lv * 1) * statMultiplier));
  const maxEnergy = Math.max(1, Math.floor((Number(base.energy || 30) + (lv - 1) * 2) * statMultiplier));

  const allMoves = Object.keys(baseSpecies?.moves || {});
  const learnedMoves = Array.isArray(baseSpecies?.corruptedMoveSet) && baseSpecies.corruptedMoveSet.length
    ? baseSpecies.corruptedMoveSet.slice(0, 5)
    : allMoves.slice(0, 5);

  return {
    moraId: baseSpecies.id,
    name: baseSpecies.name,
    type: baseSpecies.type,
    rarity: baseSpecies.rarity,
    level: lv,
    xp: 0,
    hp: maxHp,
    maxHp,
    maxEnergy,
    energy: maxEnergy,
    moves: learnedMoves,
    stats: {
      atk,
      def,
      spd,
      energy: maxEnergy
    },
    isWild: true,
    isCorrupted: !!baseSpecies.isCorrupted
  };
}

function calcDamage(battleMath, attacker, defender, move, crit = false) {
  let dmg = battleMath.calcDamage({
    attacker,
    defender,
    move: { ...move, type: attacker.type },
    crit
  });

  const power = clamp(Number(move.power ?? 35), 10, 200);
  const powerFactor = 0.55 + (power / 200) * 0.7;
  dmg = Math.floor(dmg * powerFactor);

  const mult = typeMultiplier(attacker.type, defender.type);
  dmg = Math.floor(dmg * mult);
  dmg = Math.floor(dmg * (randInt(92, 108) / 100));

  const aLv = Number(attacker.level || 1);
  const dLv = Number(defender.level || 1);
  const lvDiff = clamp(aLv - dLv, -10, 10);
  dmg = Math.floor(dmg * (1 + lvDiff * 0.03));

  const enemyMax = Math.max(1, Number(defender.maxHp || 1));
  const capPct = Math.max(aLv, dLv) <= 6 ? 0.38 : 0.55;
  const cap = Math.max(4, Math.floor(enemyMax * capPct));
  dmg = Math.min(dmg, cap);

  const minDmg = power <= 25 ? 2 : 4;
  dmg = Math.max(minDmg, dmg);

  return { dmg, mult };
}

function chooseWildMove(species, wildMora, personality) {
  const names = Array.isArray(wildMora.moves) ? wildMora.moves : [];
  const moves = names
    .map((name) => ({ name, data: getMoveData(species, name) }))
    .filter((x) => x.data);

  if (!moves.length) return null;

  if (personality === "skittish") {
    const statusMove = moves.find((x) => String(x.data.category).toLowerCase() === "status");
    if (statusMove && Math.random() < 0.45) return statusMove;
  }

  if (personality === "berserk" || personality === "feral" || personality === "aggressive") {
    const sorted = [...moves].sort((a, b) => Number(b.data.power || 0) - Number(a.data.power || 0));
    if (Math.random() < 0.7) return sorted[0];
  }

  if (personality === "cautious") {
    const statusMove = moves.find((x) => String(x.data.category).toLowerCase() === "status");
    if (statusMove && Math.random() < 0.35) return statusMove;
  }

  return moves[randInt(0, moves.length - 1)];
}

function buildMoveList(mora, species, battleMath) {
  const moves = Array.isArray(mora?.moves) ? mora.moves : [];
  if (!moves.length) return "No moves saved.";

  return moves.map((name, i) => {
    const mv = getMoveData(species, name);
    if (!mv) return `${i + 1}) *${name}* ⚠️ missing data`;
    return (
      `${i + 1}) *${name}*\n` +
      `   💥 ${mv.power ?? 0}  🎯 ${mv.accuracy ?? 100}  🔋 ${battleMath.calcEnergyCost(mv)}\n` +
      `   📝 ${mv.desc || ""}`
    );
  }).join("\n\n");
}

function regenWildPartyEnergy(player, activeIdx) {
  const party = getPlayerParty(player);

  for (let i = 0; i < party.length; i++) {
    const m = party[i];
    if (!m || isFainted(m)) continue;

    ensureEnergyFields(m);

    if (i === activeIdx) {
      const gain = Math.max(3, Math.floor(m.maxEnergy * 0.10));
      m.energy = clamp(m.energy + gain, 0, m.maxEnergy);
    } else {
      const gain = Math.max(5, Math.floor(m.maxEnergy * 0.20));
      m.energy = clamp(m.energy + gain, 0, m.maxEnergy);
    }
  }
}

async function finishWildBattle(chatId, senderId) {
  clearWildBattle(chatId, senderId);
  await huntingSystem.clearEncounterAfterWildBattle(senderId);
}

// Decay mutation battlesLeft for all mora in a player's party
function decayMutations(player) {
  if (!player || !Array.isArray(player.moraOwned)) return;
  for (const m of player.moraOwned) {
    if (m?.mutation && m.mutation.battlesLeft > 0) {
      m.mutation.battlesLeft -= 1;
      if (m.mutation.battlesLeft <= 0) delete m.mutation;
    }
  }
}

async function startWildBattle(ctx, chatId, senderId, msg, options = {}) {
  const { sock, players, hpBar, loadMora } = ctx;

  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using .start" }, { quoted: msg });
  }

  const existing = getWildBattle(chatId, senderId);
  if (existing) {
    return sock.sendMessage(chatId, { text: "⚠️ You already have an active wild battle." }, { quoted: msg });
  }

  const party = getPlayerParty(player);
  const activeIdx = pickFirstAliveIndex(party);
  if (activeIdx === -1) {
    return sock.sendMessage(chatId, { text: "❌ You have no unfainted Mora in your party." }, { quoted: msg });
  }

  const playerMora = party[activeIdx];
  ensureEnergyFields(playerMora);

  const moraList = loadMora();
  const corruptionData = corruptionSystem.loadCorruptionData();

  let wildSpecies = null;
  let isCorrupted = false;
  let corruptionClass = null;

  if (options.naturalCorruptedId) {
    const natural = corruptionSystem.getNaturalCorruptedById(corruptionData, options.naturalCorruptedId);
    if (!natural) {
      return sock.sendMessage(chatId, { text: "❌ Natural corrupted Mora data missing." }, { quoted: msg });
    }
    wildSpecies = {
      id: natural.id,
      name: natural.name,
      type: natural.type,
      rarity: natural.rarity,
      description: natural.description,
      baseStats: natural.baseStats,
      moves: Object.fromEntries(
        (natural.moves || []).map((name) => [
          name,
          { power: 75, accuracy: 90, category: "Physical", desc: `${name} tears through the field with corrupted force.` }
        ])
      ),
      corruptedMoveSet: natural.moves || [],
      isCorrupted: true
    };
    isCorrupted = true;
    corruptionClass = "Natural";
  } else {
    const baseSpecies =
      options.baseSpecies ||
      getSpecies(moraList, options.baseId) ||
      moraList[randInt(0, Math.max(0, moraList.length - 1))];

    if (!baseSpecies) {
      return sock.sendMessage(chatId, { text: "❌ Could not build a wild encounter." }, { quoted: msg });
    }

    if (options.forceCorrupted) {
      wildSpecies = corruptionSystem.buildCorruptedFromBaseSpecies(baseSpecies, corruptionData);
      isCorrupted = true;
      corruptionClass = wildSpecies?.corruptedTitle || "Variant";
    } else {
      wildSpecies = baseSpecies;
    }
  }

  const level = Math.max(1, Number(options.level || playerMora.level || 1));
  const statMultiplier = Math.max(1, Number(options.statMultiplier || 1));
  const wildMora = scaleWildOwnedMora(wildSpecies, level, statMultiplier);

  const personality = options.personality || pickWildAiPersonality(isCorrupted);

  const state = {
    chatId,
    senderId,
    startedAt: Date.now(),
    playerActiveIndex: activeIdx,
    playerMoraRefName: playerMora.name,
    playerTurn: true,
    isCorrupted,
    corruptionClass,
    personality,
    allowCapture: options.allowCapture !== false,
    allowPurify: !!options.allowPurify,
    allowCharge: true,
    rewards: {
      moraXp: Number(options.moraXp || (30 + level * 5)),
      playerXp: Number(options.playerXp || (20 + level * 3))
    },
    wildSpecies,
    wildMora,
    flavorIntro: pickWildIntro(isCorrupted)
  };

  setWildBattle(chatId, senderId, state);

  const header = buildWildHeader(players, senderId, playerMora, wildMora, hpBar, state);

  return sock.sendMessage(chatId, {
    text:
      `${state.flavorIntro}\n\n` +
      `${header}\n\n` +
      `🎯 Commands:\n` +
      `• *.attack 1-5*\n` +
      `• *.switch 1-5*\n` +
      `• *.charge*\n` +
      `• *.run*\n` +
      (state.allowCapture ? `• *.capture*\n` : "") +
      (state.allowPurify ? `• *.purify*\n` : ""),
    mentions: [senderId]
  }, { quoted: msg });
}

async function cmdWildAttack(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, battleMath, hpBar, savePlayers, xpSystem } = ctx;

  const state = getWildBattle(chatId, senderId);
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ The battle is over. Make your faction decision first." }, { quoted: msg });
  }

  const player = players[senderId];
  const party = getPlayerParty(player);
  const playerMora = party[state.playerActiveIndex];
  if (!playerMora || isFainted(playerMora)) {
    return sock.sendMessage(chatId, { text: "❌ Your active Mora cannot act. Use *.switch*." }, { quoted: msg });
  }

  const playerSpecies = ctx.loadMora().find((x) => Number(x.id) === Number(playerMora.moraId));
  const pickRaw = args.join(" ").trim();

  if (!pickRaw) {
    return sock.sendMessage(chatId, {
      text:
        `🎴 *Choose your move*\n` +
        `Use: *.attack 1-5* or *.attack MoveName*\n\n` +
        buildMoveList(playerMora, playerSpecies, battleMath)
    }, { quoted: msg });
  }

  let moveName = null;
  const moves = Array.isArray(playerMora.moves) ? playerMora.moves : [];

  if (/^\d+$/.test(pickRaw)) {
    const n = Number(pickRaw);
    if (n < 1 || n > moves.length) {
      return sock.sendMessage(chatId, { text: "❌ Invalid move number." }, { quoted: msg });
    }
    moveName = moves[n - 1];
  } else {
    const q = pickRaw.toLowerCase();
    moveName =
      moves.find((m) => String(m).toLowerCase() === q) ||
      moves.find((m) => String(m).toLowerCase().includes(q)) ||
      null;
  }

  if (!moveName) {
    return sock.sendMessage(chatId, { text: "❌ Move not found." }, { quoted: msg });
  }

  const mv = getMoveData(playerSpecies, moveName);
  if (!mv) {
    return sock.sendMessage(chatId, { text: "❌ Move data missing in mora.json." }, { quoted: msg });
  }

  regenWildPartyEnergy(player, state.playerActiveIndex);

  ensureEnergyFields(playerMora);
  const cost = battleMath.calcEnergyCost(mv);
  if (playerMora.energy < cost) {
    return sock.sendMessage(chatId, { text: `❌ Not enough energy. Need ${cost}, you have ${playerMora.energy}.` }, { quoted: msg });
  }

  const logs = [];

  playerMora.energy = clamp(playerMora.energy - cost, 0, playerMora.maxEnergy);

  const hit = battleMath.checkHit(mv.accuracy ?? 100);
  if (!hit) {
    logs.push(`💨 @${String(senderId).split("@")[0]}'s *${playerMora.name}* used *${moveName}* and missed!`);
  } else {
    const crit = battleMath.rollCrit(10);
    const res = calcDamage(battleMath, playerMora, state.wildMora, mv, crit);

    // ── Rift Fury buff: +15% damage ──────────────────────────
    let furyActive = false;
    if (player.riftFury && Number(player.riftFury.battles) > 0) {
      res.dmg = Math.floor(res.dmg * (1 + Number(player.riftFury.bonus || 0.15)));
      player.riftFury.battles = Number(player.riftFury.battles) - 1;
      if (player.riftFury.battles <= 0) delete player.riftFury;
      furyActive = true;
    }

    state.wildMora.hp = clamp(Number(state.wildMora.hp || 0) - res.dmg, 0, Number(state.wildMora.maxHp || 1));

    const effTxt =
      res.mult >= 1.2 ? "  🔥*SUPER EFFECTIVE!*"
      : res.mult <= 0.85 ? "  🥶*NOT VERY EFFECTIVE*"
      : "";

    logs.push(
      `⚔️ @${String(senderId).split("@")[0]}'s *${playerMora.name}* used *${moveName}* and dealt *${res.dmg}* to wild *${state.wildMora.name}*` +
      (crit ? "  ✨*CRIT!*" : "") +
      effTxt +
      (furyActive ? "  🔥*RIFT FURY!*" : "")
    );
  }

  if (isFainted(state.wildMora)) {
    const moraRes = xpSystem.addMoraXp(playerMora, playerSpecies, state.rewards.moraXp);
    const playerRes = xpSystem.addPlayerXp(player, state.rewards.playerXp);

    // ── Mutation decay + companion bond ──────────────────────
    decayMutations(player);
    if (player.companionId != null) player.companionBond = (player.companionBond || 0) + 1;

    // ── Mission hooks ─────────────────────────────────────────
    try {
      if (state.isCorrupted) {
        missionSystem.onCorruptedDefeated(senderId, player.faction);
        missionSystem.onCorruptedEncountered(senderId, player.faction);
      }
    } catch {}

    // ── Gear durability wear from wild battle ────────────────
    try {
      const itemsSystem = require("./items");
      const gearResults = itemsSystem.applyDurabilityDamage(player, 0.20, ["cloak", "boots"]);
      for (const r of gearResults) {
        if (r.status === "broken") {
          logs.push(`💥 Your *${r.item}* shattered from the battle!`);
        } else if (r.status === "damaged") {
          logs.push(`⚙️ Your *${r.item}* took wear _(${r.remaining} durability left)_`);
        }
      }
    } catch {}

    const xpLines =
      `⭐ Mora XP +${state.rewards.moraXp}\n` +
      `🌟 Player XP +${state.rewards.playerXp}` +
      (moraRes.leveledUp ? `\n🆙 Your Mora leveled up +${moraRes.levelsGained}!` : "") +
      (playerRes.leveledUp ? `\n🆙 You leveled up +${playerRes.levels}!` : "");

    // ── PURITY ORDER: post-defeat decision ─────────────────────
    if (player.faction === "purity") {
      state.pendingDecision = "purity";
      savePlayers(players);
      setWildBattle(chatId, senderId, state);
      return sock.sendMessage(chatId, {
        text:
          `${logs.join("\n")}\n\n` +
          `🏁 *WILD MORA DEFEATED*\n` +
          `☠ Wild *${state.wildMora.name}* has fallen.\n\n` +
          `${xpLines}\n\n` +
          `⚔️ *PURITY ORDER — JUDGMENT AWAITS*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Choose what to do with the fallen Mora:\n\n` +
          `🗡 *.execute* — Destroy it. Gain *Resonance* + bonus *Lucons*.\n` +
          `📜 *.conscript* — Discipline it. Gain *Tame Skill*.\n` +
          `🏰 *.fortify* — Send to Stronghold. Gain *Intelligence*.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        mentions: [senderId]
      }, { quoted: msg });
    }

    // ── RIFT SEEKERS: post-defeat decision ─────────────────────
    if (player.faction === "rift") {
      state.pendingDecision = "rift";
      savePlayers(players);
      setWildBattle(chatId, senderId, state);
      return sock.sendMessage(chatId, {
        text:
          `${logs.join("\n")}\n\n` +
          `🏁 *WILD MORA DEFEATED*\n` +
          `☠ Wild *${state.wildMora.name}* has fallen.\n\n` +
          `${xpLines}\n\n` +
          `🔥 *RIFT SEEKERS — THE VOID HUNGERS*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `The fallen Mora's energy lingers. Claim it:\n\n` +
          `🩸 *.devour* — Absorb its energy. Gain *PE* + *Rift Fury* buff.\n` +
          `⛓ *.bind* — Force-bind with Rift chains. *30%* chance to tame as *corrupted*.\n` +
          `🔮 *.harvest* — Strip materials. Gain *Lucons* + *Resonance*.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        mentions: [senderId]
      }, { quoted: msg });
    }

    // ── DEFAULT: post-battle choices (Harmony / no faction) ────
    if (player.faction === "harmony") {
      state.pendingDecision = "harmony_wild";
      savePlayers(players);
      setWildBattle(chatId, senderId, state);
      return sock.sendMessage(chatId, {
        text:
          `${logs.join("\n")}\n\n` +
          `🏁 *WILD MORA DEFEATED*\n` +
          `☠ Wild *${state.wildMora.name}* has fallen.\n\n` +
          `${xpLines}\n\n` +
          `🌿 *HARMONY — WHAT WILL YOU DO?*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🌬 *.release* — Set it free. Gain *Intelligence*.\n` +
          `🤝 *.tame* — Bond with it. Gain *Tame Skill*.\n` +
          `🏛 *.sanctuary* — Send to Sanctuary. Gain *Lucons* + *Resonance*.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        mentions: [senderId]
      }, { quoted: msg });
    }

    // No faction — generic choices
    state.pendingDecision = "default";
    savePlayers(players);
    setWildBattle(chatId, senderId, state);
    return sock.sendMessage(chatId, {
      text:
        `${logs.join("\n")}\n\n` +
        `🏁 *WILD MORA DEFEATED*\n` +
        `☠ Wild *${state.wildMora.name}* has fallen.\n\n` +
        `${xpLines}\n\n` +
        `⚔️ *CHOOSE YOUR ACTION*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🤝 *.tame* — Bond with it. Gain *Tame Skill*.\n` +
        `🌬 *.release* — Set it free. Gain *Intelligence*.\n` +
        `🏛 *.sanctuary* — Study it. Gain *Lucons*.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  const wildLogs = await doWildTurn(ctx, player, playerMora, state, senderId);
  logs.push(...wildLogs);

  if (isFainted(playerMora)) {
    savePlayers(players);
    await finishWildBattle(chatId, senderId);
    return sock.sendMessage(chatId, {
      text:
        `${logs.join("\n")}\n\n` +
        `☠ *YOUR MORA FAINTED*\n` +
        `Wild *${state.wildMora.name}* overpowered your active Mora.`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  savePlayers(players);
  setWildBattle(chatId, senderId, state);

  const header = buildWildHeader(players, senderId, playerMora, state.wildMora, hpBar, state);

  return sock.sendMessage(chatId, {
    text: `${logs.join("\n")}\n\n${header}`,
    mentions: [senderId]
  }, { quoted: msg });
}
async function doWildTurn(ctx, player, playerMora, state, senderId) {
  const { battleMath, savePlayers } = ctx;
  const logs = [];
  const chatId = state.chatId; // Needed for messaging and clearing battle
  
  ensureEnergyFields(state.wildMora);

  // 🔋 ---- NEW & IMPROVED WILD MORA ENERGY REGEN ----
  // 1. Give it passive energy every single turn (10% of max energy)
  const passiveRegen = Math.max(4, Math.floor(state.wildMora.maxEnergy * 0.10));
  state.wildMora.energy = clamp(state.wildMora.energy + passiveRegen, 0, state.wildMora.maxEnergy);

  // 2. If it's STILL dangerously low (below 20%), let it draw a massive burst
  if (state.wildMora.energy <= state.wildMora.maxEnergy * 0.20) { 
      const riftGain = Math.max(6, Math.floor(state.wildMora.maxEnergy * 0.18));
      state.wildMora.energy = clamp(state.wildMora.energy + riftGain, 0, state.wildMora.maxEnergy);
      logs.push(`⚡ Wild *${state.wildMora.name}* draws *${riftGain}* energy from its surroundings!`);
  }
  // --------------------------------------------------

  // Pick a move AFTER restoring energy
  const choice = chooseWildMove(state.wildSpecies, state.wildMora, state.personality);
  if (!choice) {
      logs.push(`👁 Wild *${state.wildMora.name}* hesitates.`);
      return logs;
  }

  const cost = battleMath.calcEnergyCost(choice.data);

  // Check if enough energy
  if (state.wildMora.energy < cost) {
      logs.push(`🔋 Wild *${state.wildMora.name}* crackles with strain and cannot act properly.`);
      return logs;
  }

  // Deduct energy and continue with attack
  state.wildMora.energy = clamp(state.wildMora.energy - cost, 0, state.wildMora.maxEnergy);
  
  // Proceed with attack
  const control = state.isCorrupted
    ? corruptionSystem.rollPvpControlOutcome(corruptionSystem.loadCorruptionData())
    : { controlLoss: false, ownerAttack: false, randomTarget: false };

  // 💀 THE PLAYER TOOK BACKLASH DAMAGE
  if (state.isCorrupted && control.controlLoss && control.ownerAttack) {
    const backlashText = corruptionSystem.pickBacklashText(corruptionSystem.loadCorruptionData(), "pvp");
    const backlashDmg = randInt(8, 18);
    player.playerHp = Math.max(0, Number(player.playerHp || 100) - backlashDmg);
    logs.push(`${backlashText}\n🩸 @${String(senderId).split("@")[0]} is struck for *${backlashDmg}* damage!`);
    
    // 🪦 PLAYER DEATH CHECK!
    if (player.playerHp <= 0) {
      // 1. Save state so HP stays 0
      savePlayers(players); 
      // 2. Remove them from the active battle state so they aren't trapped
      clearWildBattle(chatId, senderId);
      // 3. Clear the map encounter 
      await huntingSystem.clearEncounterAfterWildBattle(senderId);
      // 4. Send them back to the Capital
      await huntingSystem.handlePlayerDeath(ctx, chatId, senderId, state.msg);
      
      return logs;
    }
    
    return logs;
  }

  const hit = battleMath.checkHit(choice.data.accuracy ?? 100);
  if (!hit) {
    logs.push(`💨 Wild *${state.wildMora.name}* used *${choice.name}* and missed!`);
    return logs;
  }

  const crit = battleMath.rollCrit(8);
  const res = calcDamage(battleMath, state.wildMora, playerMora, choice.data, crit);

  playerMora.hp = clamp(Number(playerMora.hp || 0) - res.dmg, 0, Number(playerMora.maxHp || 1));

  const effTxt =
    res.mult >= 1.2 ? "  🔥*SUPER EFFECTIVE!*"
    : res.mult <= 0.85 ? "  🥶*NOT VERY EFFECTIVE*"
    : "";

  logs.push(
    `☠ Wild *${state.wildMora.name}* used *${choice.name}* and dealt *${res.dmg}* to *${playerMora.name}*` +
    (crit ? "  ✨*CRIT!*" : "") +
    effTxt
  );

  return logs;
}
async function cmdWildSwitch(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, hpBar, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ The battle is over. Make your faction decision first." }, { quoted: msg });
  }

  const player = players[senderId];
  const party = getPlayerParty(player);
  const pickRaw = args.join(" ").trim();

  if (!/^\d+$/.test(pickRaw)) {
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const m = party[i];
      if (!m) {
        lines.push(`${i + 1}) — empty —`);
        continue;
      }
      ensureEnergyFields(m);
      lines.push(`${i + 1}) ${m.name} • Lv ${m.level} • ❤️ ${m.hp}/${m.maxHp} • 🔋 ${m.energy}/${m.maxEnergy}`);
    }
    return sock.sendMessage(chatId, { text: `Use: *.switch 1-5*\n\n${lines.join("\n")}` }, { quoted: msg });
  }

  const slot = Number(pickRaw) - 1;
  if (slot < 0 || slot > 4) {
    return sock.sendMessage(chatId, { text: "❌ Invalid party slot." }, { quoted: msg });
  }

  const chosen = party[slot];
  if (!chosen) {
    return sock.sendMessage(chatId, { text: "❌ That slot is empty." }, { quoted: msg });
  }
  if (isFainted(chosen)) {
    return sock.sendMessage(chatId, { text: "❌ You can’t switch to a fainted Mora." }, { quoted: msg });
  }

  regenWildPartyEnergy(player, state.playerActiveIndex);

  state.playerActiveIndex = slot;
  savePlayers(players);
  setWildBattle(chatId, senderId, state);

  const header = buildWildHeader(players, senderId, chosen, state.wildMora, hpBar, state);
  return sock.sendMessage(chatId, {
    text: `🔁 @${String(senderId).split("@")[0]} switched to *${chosen.name}*!\n\n${header}`,
    mentions: [senderId]
  }, { quoted: msg });
}

async function cmdWildRun(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state = getWildBattle(chatId, senderId);
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ The battle is over. Make your faction decision first." }, { quoted: msg });
  }

  const successChance = state.isCorrupted ? 0.35 : 0.65;
  const success = Math.random() < successChance;

  if (success) {
    await finishWildBattle(chatId, senderId);
    return sock.sendMessage(chatId, {
      text: `🏃 @${String(senderId).split("@")[0]} escaped from wild *${state.wildMora.name}*!`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text: `❌ @${String(senderId).split("@")[0]} failed to escape from *${state.wildMora.name}*!`,
    mentions: [senderId]
  }, { quoted: msg });
}

async function cmdWildCapture(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  const player = players[senderId];

  // 1. Basic State Checks
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ The battle is over. Make your faction decision first." }, { quoted: msg });
  }
  
  if (!state.allowCapture) {
    return sock.sendMessage(chatId, { text: "❌ This wild target cannot be captured." }, { quoted: msg });
  }

  const target = state.wildMora;
  
  // 2. Pro Subscription Check for Premium Mora
  if (target.isPremium) {
    let hasPro = false;
    try { hasPro = require("./pro").hasActivePro(player); } catch { hasPro = false; }

    if (!hasPro) {
      return sock.sendMessage(chatId, {
        text: `❌ *ACCESS DENIED*\n\n@${senderId.split('@')[0]}, your soul frequency is too weak to bind with **${target.name}**.\n\nOnly *Marked Lumorians* (active Pro subscribers) may tame Premium-tier beasts. See *.pro-info*.`,
        mentions: [senderId]
      }, { quoted: msg });
    }
  }

  // 3. Capture Math & Logic
  const hpRatio = Number(target.hp || 1) / Math.max(1, Number(target.maxHp || 1));

  let chance = 0.08;
  if (hpRatio <= 0.7) chance = 0.16;
  if (hpRatio <= 0.5) chance = 0.28;
  if (hpRatio <= 0.25) chance = 0.45;
  if (hpRatio <= 0.1) chance = 0.62;
  if (state.isCorrupted) chance *= 0.55;

  // ── HARMONY: +5% flat catch bonus ────────────────────────
  chance += factionMarketSystem.getHarmonyCatchBonus(player);

  // ── RIFT: 10% rejection chance on non-Shadow Mora ─────────
  if (factionMarketSystem.rollRiftUnstableCatch(player, target.type)) {
    return sock.sendMessage(chatId, {
      text:
        `🔥 *RIFT BOND REJECTED!*\n\n` +
        `*${target.name}* senses the Rift energy and flees!\n` +
        `_10% rejection chance for non-Shadow Mora._`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  const success = Math.random() < chance;

  if (!success) {
    return sock.sendMessage(chatId, {
      text: `💥 Capture failed! Wild *${target.name}* broke free.`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  if (!Array.isArray(player.moraOwned)) player.moraOwned = [];
  player.moraOwned.push({ ...target, isWild: false });

  // ── Mission hook ─────────────────────────────────────────
  try { missionSystem.onMoraCaught(senderId, player.faction, target.type); } catch {}

  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  const harmonyBonus = player.faction === "harmony" ? "\n🌿 *Harmony Bond:* +5% catch bonus applied!" : "";

  return sock.sendMessage(chatId, {
    text:
      `🎉 @${String(senderId).split("@")[0]} captured *${target.name}*!\n` +
      `🆔 Added to tamed Mora list.` +
      harmonyBonus,
    mentions: [senderId]
  }, { quoted: msg });
}
async function cmdWildPurify(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ You already have a pending decision. Choose your action." }, { quoted: msg });
  }
  if (!state.allowPurify) {
    return sock.sendMessage(chatId, { text: "❌ This target cannot be purified right now." }, { quoted: msg });
  }

  const player = players[senderId];
  const isHarmony = player?.faction === "harmony";

  // ── ITEM CHECK: Orb (Harmony implicit) or Scroll (SCR_001) ─
  const argText = args.join(" ").trim().toLowerCase();
  const useScroll = argText === "scroll" || argText === "scroll of purification";
  const hasScroll = itemsSystem.getItemQuantity(player, "SCR_001") > 0;

  if (useScroll && !hasScroll) {
    return sock.sendMessage(chatId, {
      text: "❌ You don't have a *Scroll of Purification* in your inventory.\nUse *.purify* to use your Orb instead.",
      mentions: [senderId]
    }, { quoted: msg });
  }

  if (!isHarmony && !hasScroll) {
    return sock.sendMessage(chatId, {
      text:
        `❌ *Purification Denied*\n\n` +
        `Only *Harmony Lumorians* carry the Orb of Purification.\n` +
        `You need a *Scroll of Purification* to attempt this.`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  // ── Determine success chance ─────────────────────────────────
  let chance;
  let itemUsedLabel;

  if (useScroll && hasScroll) {
    chance = 0.90;
    itemUsedLabel = "📜 *Scroll of Purification*";
    itemsSystem.removeItem(player, "SCR_001", 1);
  } else if (isHarmony) {
    // Orb of Purification: base 22% + weakened bonus + harmony bonus
    const corruptionData = corruptionSystem.loadCorruptionData();
    const weakened = Number(state.wildMora.hp || 0) <= Math.floor(Number(state.wildMora.maxHp || 1) * 0.25);
    chance = Number(corruptionData?.purification?.baseSuccessChance || 0.22);
    if (weakened) chance += Number(corruptionData?.purification?.weakenedBonus || 0.18);
    chance += Number(corruptionData?.purification?.harmonyFactionBonus || 0.15);
    chance = Math.min(chance, 0.65);
    itemUsedLabel = "🔮 *Orb of Purification*";
  } else {
    // Non-harmony with scroll (already consumed above in useScroll block)
    chance = 0.60;
    itemUsedLabel = "📜 *Scroll of Purification*";
  }

  const success = Math.random() < chance;

  const PURIFY_FAIL_SPEECHES = [
    "☠️ *The corruption runs too deep. The Mora rejects you.*",
    "🌑 *Rift energy surges back. Purification failed.*",
    "⚠️ *The corrupted Mora snarls. Your will alone was not enough.*",
  ];
  const PURIFY_WIN_SPEECHES = [
    "🕊️ *The darkness retreats. The Mora breathes free once more.*",
    "🌿 *Harmony ripples outward — another soul reclaimed from the Rift's grasp.*",
    "✨ *The Primordial energy settles. Balance restored.*",
  ];
  const speech = (pool) => pool[Math.floor(Math.random() * pool.length)];

  if (!success) {
    return sock.sendMessage(chatId, {
      text:
        `${speech(PURIFY_FAIL_SPEECHES)}\n\n` +
        `${itemUsedLabel} — *${Math.round(chance * 100)}%* chance\n` +
        `@${String(senderId).split("@")[0]} *${state.wildMora.name}* resisted purification.\n` +
        (useScroll ? `_Your scroll was consumed._` : `_The Orb flickers and dims. Try again or use a Scroll for better odds._`),
      mentions: [senderId]
    }, { quoted: msg });
  }

  // ── Purification SUCCESS — faction points ────────────────────
  const fp = loadFactionPointsWild();
  if (isHarmony) {
    fp.harmony = (fp.harmony || 0) + 10;
  }
  saveFactionPointsWild(fp);

  // ── Mission hook ─────────────────────────────────────────────
  try { missionSystem.onMoraCleansed(senderId, player.faction); } catch {}

  // ── Enter pending decision state ─────────────────────────────
  state.pendingDecision = "harmony_purify";
  state.purifiedMoraName = state.wildMora.name;
  state.purifiedMoraRarity = state.wildSpecies?.rarity || state.wildMora?.rarity || "common";
  savePlayers(players);
  setWildBattle(chatId, senderId, state);

  return sock.sendMessage(chatId, {
    text:
      `${speech(PURIFY_WIN_SPEECHES)}\n\n` +
      `${itemUsedLabel} — *${Math.round(chance * 100)}%* chance — *SUCCESS!*\n` +
      `@${String(senderId).split("@")[0]} purified *${state.wildMora.name}*!\n` +
      `🌿 +10 Faction Points for Harmony\n\n` +
      `🕊️ *THE PURIFIED MORA AWAITS YOUR DECISION*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `What will you do with the freed Mora?\n\n` +
      `🌬 *.release* — Set it free. Gain *Intelligence*.\n` +
      `🤝 *.tame* — Bond with it. Gain *Tame Skill*.\n` +
      `🏛 *.sanctuary* — Send to Sanctuary. Gain *Lucons* + *Resonance*.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    mentions: [senderId]
  }, { quoted: msg });
}

// Lazy helpers so wildbattle.js doesn't need to import index.js
function loadFactionPointsWild() {
  const fs   = require("fs");
  const path = require("path");
  const f    = path.join(__dirname, "..", "data", "faction_points.json");
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return { harmony:0, purity:0, rift:0 }; }
}
function saveFactionPointsWild(data) {
  const fs   = require("fs");
  const path = require("path");
  const f    = path.join(__dirname, "..", "data", "faction_points.json");
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

async function cmdWildCharge(ctx, chatId, senderId, msg) {
  const { sock, players, hpBar, savePlayers } = ctx;

  const state = getWildBattle(chatId, senderId);
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No active wild battle." }, { quoted: msg });
  }
  if (state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ The battle is over. Make your faction decision first." }, { quoted: msg });
  }

  const player = players[senderId];
  const party = getPlayerParty(player);
  const playerMora = party[state.playerActiveIndex];

  if (!playerMora || isFainted(playerMora)) {
    return sock.sendMessage(chatId, { text: "❌ Your active Mora cannot charge right now." }, { quoted: msg });
  }

  regenWildPartyEnergy(player, state.playerActiveIndex);

  ensureEnergyFields(playerMora);
  const gain = Math.max(6, Math.floor(playerMora.maxEnergy * 0.22));
  playerMora.energy = clamp(playerMora.energy + gain, 0, playerMora.maxEnergy);

  const logs = [
    `🔋 @${String(senderId).split("@")[0]}'s *${playerMora.name}* focuses and restores *${gain}* energy!`
  ];

  const wildLogs = await doWildTurn(ctx, player, playerMora, state, senderId);
  logs.push(...wildLogs);

  if (isFainted(playerMora)) {
    savePlayers(players);
    await finishWildBattle(chatId, senderId);
    return sock.sendMessage(chatId, {
      text:
        `${logs.join("\n")}\n\n` +
        `☠ *YOUR MORA FAINTED*\n` +
        `Wild *${state.wildMora.name}* overpowered your active Mora.`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  savePlayers(players);
  setWildBattle(chatId, senderId, state);

  const header = buildWildHeader(players, senderId, playerMora, state.wildMora, hpBar, state);

  return sock.sendMessage(chatId, {
    text: `${logs.join("\n")}\n\n${header}`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION — FACTION POST-BATTLE DECISION HANDLERS
// ══════════════════════════════════════════════════════════════

function getPendingState(sock, chatId, senderId, msg, requiredType) {
  const state = getWildBattle(chatId, senderId);
  if (!state || !state.pendingDecision) return null;
  if (requiredType && state.pendingDecision !== requiredType) return null;
  return state;
}

// ── .release ─────────────────────────────────────────────────
async function cmdWildRelease(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  const validTypes = ["harmony_purify", "harmony_wild", "default"];
  if (!state || !state.pendingDecision || !validTypes.includes(state.pendingDecision)) {
    return sock.sendMessage(chatId, { text: "❌ No defeated Mora awaiting your decision." }, { quoted: msg });
  }

  const player = players[senderId];
  const moraName = state.purifiedMoraName || state.wildMora?.name || "the Mora";
  const rarity = state.purifiedMoraRarity || state.wildSpecies?.rarity || state.wildMora?.rarity || "common";
  const rewards = getRewards(rarity);
  const intGain = rewards.intelligence;

  player.intelligence = (player.intelligence || 0) + intGain;
  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🌬 *RELEASED*\n\n` +
      `@${String(senderId).split("@")[0]} set *${moraName}* free.\n` +
      `The Mora shares its memories before departing.\n\n` +
      `🧠 *+${intGain} Intelligence* _(${rarity} rarity)_\n\n` +
      `_"Knowledge is the truest gift of mercy."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── .tame ────────────────────────────────────────────────────
async function cmdWildTame(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  if (!state || !state.pendingDecision) {
    return sock.sendMessage(chatId, { text: "❌ No pending decision." }, { quoted: msg });
  }

  const validTypes = ["harmony_purify", "harmony_wild", "default", "purity"];
  if (!validTypes.includes(state.pendingDecision)) {
    return sock.sendMessage(chatId, { text: "❌ This command isn't available for your current decision." }, { quoted: msg });
  }

  const player = players[senderId];
  const tameGain = 3;
  player.tameSkill = (player.tameSkill || 0) + tameGain;

  const moraName = state.purifiedMoraName || state.wildMora?.name || "the Mora";
  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  const flavor = state.pendingDecision === "harmony_purify"
    ? `The grateful Mora bonds with @${String(senderId).split("@")[0]}.\n_"A bond forged in light never breaks."_`
    : `@${String(senderId).split("@")[0]} disciplines the fallen Mora into submission.\n_"Even the wild can learn obedience."_`;

  return sock.sendMessage(chatId, {
    text:
      `🤝 *TAMED*\n\n` +
      `${flavor}\n\n` +
      `🪢 *+${tameGain} Tame Skill*`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── .sanctuary ───────────────────────────────────────────────
async function cmdWildSanctuary(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getWildBattle(chatId, senderId);
  const validTypes = ["harmony_purify", "harmony_wild", "default"];
  if (!state || !state.pendingDecision || !validTypes.includes(state.pendingDecision)) {
    return sock.sendMessage(chatId, { text: "❌ No defeated Mora awaiting your decision." }, { quoted: msg });
  }

  const player = players[senderId];
  const moraName = state.purifiedMoraName || state.wildMora?.name || "the Mora";
  const rarity = state.purifiedMoraRarity || state.wildSpecies?.rarity || state.wildMora?.rarity || "common";
  const rewards = getRewards(rarity);

  player.lucons = (player.lucons || 0) + rewards.sanctuary_lucons;
  player.resonance = (player.resonance || 0) + rewards.sanctuary_resonance;
  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🏛 *SENT TO SANCTUARY*\n\n` +
      `@${String(senderId).split("@")[0]} guided *${moraName}* to the Sanctuary.\n` +
      `The Mora rests peacefully, and the Sanctuary grows stronger.\n\n` +
      `💰 *+${rewards.sanctuary_lucons} Lucons* _(${rarity} rarity)_\n` +
      `💠 *+${rewards.sanctuary_resonance} Resonance* _(${rarity} rarity)_\n\n` +
      `_"Every soul sheltered strengthens the light."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── PURITY: .execute ──────────────────────────────────────────
async function cmdWildExecute(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "purity");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora awaiting judgment." }, { quoted: msg });
  }

  const player = players[senderId];
  const rarity = String(state.wildSpecies?.rarity || state.wildMora?.rarity || "common").toLowerCase();
  const rewards = getRewards(rarity);

  player.resonance = (player.resonance || 0) + rewards.execute_resonance;
  player.lucons = (player.lucons || 0) + rewards.execute_lucons;

  const fp = loadFactionPointsWild();
  fp.purity = (fp.purity || 0) + 5;
  saveFactionPointsWild(fp);

  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🗡 *EXECUTED*\n\n` +
      `@${String(senderId).split("@")[0]} destroyed *${state.wildMora.name}* without hesitation.\n` +
      `The Purity Order demands absolute resolution.\n\n` +
      `💠 *+${rewards.execute_resonance} Resonance* _(${rarity} rarity)_\n` +
      `💰 *+${rewards.execute_lucons} Lucons* _(${rarity} rarity)_\n` +
      `⚔️ *+5 Faction Points* for Purity Order\n\n` +
      `_"Mercy is a luxury the Order cannot afford."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── PURITY: .conscript ────────────────────────────────────────
async function cmdWildConscript(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "purity");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora awaiting judgment." }, { quoted: msg });
  }

  const player = players[senderId];
  const tameGain = 3;
  player.tameSkill = (player.tameSkill || 0) + tameGain;
  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `📜 *CONSCRIPTED*\n\n` +
      `@${String(senderId).split("@")[0]} disciplines *${state.wildMora.name}* into submission.\n` +
      `Discipline bends even the wild.\n\n` +
      `🪢 *+${tameGain} Tame Skill*\n\n` +
      `_"Obedience is not given. It is taken."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── PURITY: .fortify ──────────────────────────────────────────
async function cmdWildFortify(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "purity");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora awaiting judgment." }, { quoted: msg });
  }

  const player = players[senderId];
  const rarity = String(state.wildSpecies?.rarity || state.wildMora?.rarity || "common").toLowerCase();
  const rewards = getRewards(rarity);
  const intGain = rewards.intelligence;

  player.intelligence = (player.intelligence || 0) + intGain;
  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🏰 *FORTIFIED*\n\n` +
      `@${String(senderId).split("@")[0]} sent *${state.wildMora.name}*'s remains to the Stronghold for study.\n` +
      `The Purity Order's knowledge deepens.\n\n` +
      `🧠 *+${intGain} Intelligence* _(${rarity} rarity)_\n\n` +
      `_"Knowledge is the sharpest blade."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── RIFT: .devour ─────────────────────────────────────────────
async function cmdWildDevour(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "rift");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora energy to claim." }, { quoted: msg });
  }

  const player = players[senderId];
  const party = getPlayerParty(player);
  const activeMora = party[state.playerActiveIndex];

  // PE gain: 5 + level/5, capped at 15
  const wildLevel = Number(state.wildMora?.level || 1);
  const peGain = Math.min(15, 5 + Math.floor(wildLevel / 5));

  if (activeMora) {
    activeMora.pe = Math.min(100, Number(activeMora.pe || 0) + peGain);
  }

  // Rift Fury buff: +15% damage for 3 battles
  player.riftFury = { battles: 3, bonus: 0.15, appliedAt: Date.now() };

  const fp = loadFactionPointsWild();
  fp.rift = (fp.rift || 0) + 5;
  saveFactionPointsWild(fp);

  const peWarning = activeMora && Number(activeMora.pe || 0) >= 80
    ? `\n⚠️ *WARNING:* ${activeMora.name}'s PE is now *${activeMora.pe}*! Overflow danger!`
    : "";

  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🩸 *DEVOURED*\n\n` +
      `@${String(senderId).split("@")[0]}'s *${activeMora?.name || "Mora"}* absorbs the dying energy of *${state.wildMora.name}*.\n` +
      `Raw power floods through the Rift bond.\n\n` +
      `🕷 *+${peGain} Primordial Energy*\n` +
      `🔥 *Rift Fury* — +15% damage for 3 battles\n` +
      `🔥 *+5 Faction Points* for Rift Seekers` +
      peWarning + `\n\n` +
      `_"The Rift takes everything. Even death."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── RIFT: .bind ───────────────────────────────────────────────
async function cmdWildBind(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "rift");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora energy to claim." }, { quoted: msg });
  }

  const player = players[senderId];
  const party = getPlayerParty(player);
  const activeMora = party[state.playerActiveIndex];

  const bindChance = 0.30;
  const success = Math.random() < bindChance;

  if (!success) {
    // Backlash: active Mora takes 15% maxHP damage
    if (activeMora && !isFainted(activeMora)) {
      const backlashDmg = Math.max(5, Math.floor(Number(activeMora.maxHp || 1) * 0.15));
      activeMora.hp = Math.max(0, Number(activeMora.hp || 0) - backlashDmg);
      savePlayers(players);
      await finishWildBattle(chatId, senderId);

      return sock.sendMessage(chatId, {
        text:
          `⛓ *BIND FAILED!*\n\n` +
          `The Rift chains shatter! *${state.wildMora.name}*'s dying rage lashes back!\n\n` +
          `💥 *${activeMora.name}* takes *${backlashDmg} backlash damage!*\n` +
          (isFainted(activeMora) ? `☠ *${activeMora.name} FAINTED from the backlash!*\n` : "") +
          `\n_"Chaos obeys no one. Not even you."_`,
        mentions: [senderId]
      }, { quoted: msg });
    }

    savePlayers(players);
    await finishWildBattle(chatId, senderId);
    return sock.sendMessage(chatId, {
      text: `⛓ *BIND FAILED!*\n\nThe Rift chains dissolve. *${state.wildMora.name}* fades into nothing.`,
      mentions: [senderId]
    }, { quoted: msg });
  }

  // Success: add corrupted Mora to party
  if (!Array.isArray(player.moraOwned)) player.moraOwned = [];
  const boundMora = {
    ...state.wildMora,
    isWild: false,
    corrupted: true,
    boundByRift: true,
    pe: Math.min(100, Number(state.wildMora.pe || 0) + 10),
  };
  player.moraOwned.push(boundMora);

  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `⛓ *RIFT BOUND!*\n\n` +
      `@${String(senderId).split("@")[0]} forced *${state.wildMora.name}* into servitude using raw Rift chains!\n\n` +
      `☠ Added as *CORRUPTED MORA* to your collection.\n` +
      `⚠️ _Corrupted Mora deal more damage but are unstable._\n\n` +
      `_"The bold don't ask permission. They take."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

// ── RIFT: .harvest ────────────────────────────────────────────
async function cmdWildHarvest(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const state = getPendingState(sock, chatId, senderId, msg, "rift");
  if (!state) {
    return sock.sendMessage(chatId, { text: "❌ No fallen Mora energy to claim." }, { quoted: msg });
  }

  const player = players[senderId];
  const rarity = String(state.wildSpecies?.rarity || state.wildMora?.rarity || "common").toLowerCase();
  const rewards = getRewards(rarity);

  player.lucons = (player.lucons || 0) + rewards.harvest_lucons;
  player.resonance = (player.resonance || 0) + rewards.harvest_resonance;

  // Rift Shards: 1-3 based on rarity tier
  const shardCount = rarity === "mythic" || rarity === "legendary" ? 3
    : rarity === "epic" ? 2 : 1;
  player.riftShards = (player.riftShards || 0) + shardCount;

  savePlayers(players);
  await finishWildBattle(chatId, senderId);

  return sock.sendMessage(chatId, {
    text:
      `🔮 *HARVESTED*\n\n` +
      `@${String(senderId).split("@")[0]} strips raw materials from *${state.wildMora.name}*'s remains.\n` +
      `The void yields its treasures.\n\n` +
      `💰 *+${rewards.harvest_lucons} Lucons* _(${rarity} rarity)_\n` +
      `💠 *+${rewards.harvest_resonance} Resonance* _(${rarity} rarity)_\n` +
      `🔮 *+${shardCount} Rift Shard${shardCount > 1 ? "s" : ""}*\n\n` +
      `_"Even death has value to those who know where to look."_`,
    mentions: [senderId]
  }, { quoted: msg });
}

module.exports = {
  startWildBattle,
  cmdWildAttack,
  cmdWildSwitch,
  cmdWildRun,
  cmdWildPurify,
  cmdWildCharge,
  // Faction decision commands
  cmdWildRelease,
  cmdWildTame,
  cmdWildSanctuary,
  cmdWildExecute,
  cmdWildConscript,
  cmdWildFortify,
  cmdWildDevour,
  cmdWildBind,
  cmdWildHarvest,
  getWildBattle,
  clearWildBattle,
  decayMutations,
};
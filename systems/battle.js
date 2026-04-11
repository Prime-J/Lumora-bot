// ============================
// SYSTEM: BATTLE (Group-only, 1 active per group)
// PvP battle system
// - Uses player.party (max 5)
// - Proper @mentions in PvP
// - Player XP rewards
// - Mora XP rewards + level-ups
// - Safer auto-switch logic
// - Ready for future AI battles
// ============================

const factionMarketSystem = require("./factionMarket");
const missionSystem       = require("./factionMissionSystem");
const { generateBattleVsImage } = require("../factionCanvas");
const { getBattleCommentary } = require("./botPersonality");

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normJid(jid = "") {
  return String(jid).split(":")[0];
}

function isGroupJid(jid = "") {
  return String(jid).endsWith("@g.us");
}

function getDisplayName(players, jid) {
  const p = players?.[jid];
  const name =
    p?.username && String(p.username).trim()
      ? String(p.username).trim()
      : String(jid).split("@")[0];
  return name;
}

// ============================
// PARTY HELPERS
// ============================
function ensureParty(player) {
  if (!player || typeof player !== "object") return;
  if (!Array.isArray(player.party)) {
    player.party = [null, null, null, null, null];
  }
  while (player.party.length < 5) player.party.push(null);
  if (player.party.length > 5) player.party = player.party.slice(0, 5);
}

function getParty(player) {
  if (!player || typeof player !== "object") return [];
  ensureParty(player);

  const owned = Array.isArray(player.moraOwned) ? player.moraOwned : [];
  const out = [];

  for (let i = 0; i < 5; i++) {
    const ownedIdx = player.party[i];
    if (ownedIdx === null || ownedIdx === undefined) {
      out.push(null);
      continue;
    }
    out.push(owned[ownedIdx] || null);
  }

  return out;
}

function isFainted(m) {
  return !m || typeof m.hp !== "number" || m.hp <= 0;
}

function partyAllFainted(party) {
  const real = party.filter(Boolean);
  return real.length === 0 || real.every((m) => isFainted(m));
}

function pickFirstAliveIndex(party) {
  for (let i = 0; i < party.length; i++) {
    if (party[i] && !isFainted(party[i])) return i;
  }
  return -1;
}

function getSpecies(moraList, moraId) {
  return moraList.find((x) => Number(x.id) === Number(moraId)) || null;
}

function getMoveData(species, moveName) {
  if (!species || !species.moves || typeof species.moves !== "object") return null;
  return species.moves[moveName] || species.moves[String(moveName)] || null;
}

// ============================
// ENERGY
// ============================
function ensureEnergyFields(ownedMora) {
  if (!ownedMora) return;

  const maxE = Number(ownedMora?.maxEnergy ?? ownedMora?.stats?.energy ?? 30);

  if (typeof ownedMora.maxEnergy !== "number" || !Number.isFinite(ownedMora.maxEnergy)) {
    ownedMora.maxEnergy = Number.isFinite(maxE) && maxE > 0 ? Math.floor(maxE) : 30;
  }

  ownedMora.maxEnergy = Math.max(1, Math.floor(ownedMora.maxEnergy));

  if (typeof ownedMora.energy !== "number" || !Number.isFinite(ownedMora.energy)) {
    ownedMora.energy = ownedMora.maxEnergy;
  }

  ownedMora.energy = clamp(Math.floor(ownedMora.energy), 0, ownedMora.maxEnergy);
}

function calcRegen(m, percent, minFlat) {
  ensureEnergyFields(m);
  const p = Number(percent || 0);
  const regen = Math.floor(m.maxEnergy * p);
  return Math.max(Number(minFlat || 0), regen);
}

function regenEnergyActive(m) {
  ensureEnergyFields(m);
  const regen = calcRegen(m, 0.10, 3);
  m.energy = clamp(m.energy + regen, 0, m.maxEnergy);
}

function regenEnergyBenched(m) {
  ensureEnergyFields(m);
  const regen = calcRegen(m, 0.20, 5);
  m.energy = clamp(m.energy + regen, 0, m.maxEnergy);
}

function regenPartyEnergyForTurn(player, activeIdx) {
  const party = getParty(player);
  for (let i = 0; i < party.length; i++) {
    const m = party[i];
    if (!m || isFainted(m)) continue;
    if (i === activeIdx) regenEnergyActive(m);
    else regenEnergyBenched(m);
  }
}

// ============================
// UI
// ============================
const TYPE_EMOJI = {
  aqua: "💧", flame: "🔥", nature: "🌿", terra: "🪨",
  volt: "⚡", frost: "❄️", wind: "🌪️", shadow: "🌑",
};

function typeEmoji(type) {
  return TYPE_EMOJI[String(type || "").toLowerCase()] || "✦";
}

function hpLine(hpBar, m) {
  const hp = clamp(Number(m.hp || 0), 0, 999999);
  const max = clamp(Number(m.maxHp || 0), 1, 999999);
  return `${hpBar.createHpBar(hp, max)}  *${hp}/${max}*`;
}

function hpWarning(m) {
  const hp = clamp(Number(m.hp || 0), 0, 999999);
  const max = clamp(Number(m.maxHp || 0), 1, 999999);
  const pct = hp / max;
  if (pct <= 0.15) return `  ⚠️ _CRITICAL — barely standing!_`;
  if (pct <= 0.30) return `  🩸 _Wounded — hanging on..._`;
  return "";
}

function energyLine(m) {
  ensureEnergyFields(m);
  const pct = Math.round((m.energy / m.maxEnergy) * 100);
  const icon = pct >= 60 ? "🔋" : pct >= 25 ? "🪫" : "💀";
  return `${icon} *${m.energy}/${m.maxEnergy}* (${pct}%)`;
}

function battleHeader(players, aJid, bJid, aM, bM, hpBar) {
  const aName = getDisplayName(players, aJid);
  const bName = getDisplayName(players, bJid);
  const tA = typeEmoji(aM.type);
  const tB = typeEmoji(bM.type);

  const div = `╔══════════════════════╗`;
  const div2 = `╚══════════════════════╝`;
  const mid = `╟──────────────────────╢`;

  const aWarn = hpWarning(aM);
  const bWarn = hpWarning(bM);

  return (
    `${div}\n` +
    `   ⚔️  *${aName}*  vs  *${bName}*\n` +
    `${mid}\n\n` +
    `${tA} *${String(aM.name).toUpperCase()}*  ┃  Lv.${aM.level}  ┃  ${String(aM.type || "???").toUpperCase()}\n` +
    `  ❤️ ${hpLine(hpBar, aM)}\n` +
    `  ${energyLine(aM)}` +
    `${aWarn ? "\n" + aWarn : ""}\n\n` +
    `${tB} *${String(bM.name).toUpperCase()}*  ┃  Lv.${bM.level}  ┃  ${String(bM.type || "???").toUpperCase()}\n` +
    `  ❤️ ${hpLine(hpBar, bM)}\n` +
    `  ${energyLine(bM)}` +
    `${bWarn ? "\n" + bWarn : ""}\n` +
    `${div2}`
  );
}

// ============================
// TYPE MULTIPLIER
// ============================
function typeMultiplier(attType, defType) {
  const a = String(attType || "").toLowerCase();
  const d = String(defType || "").toLowerCase();

  const chart = {
    aqua: { flame: 1.25, terra: 0.85, volt: 0.85 },
    flame: { nature: 1.25, aqua: 0.85, frost: 1.15 },
    nature: { terra: 1.25, flame: 0.85, wind: 0.90 },
    terra: { volt: 1.25, aqua: 1.15, wind: 0.85 },
    volt: { aqua: 1.25, terra: 0.85, wind: 1.05 },
    frost: { wind: 1.25, aqua: 0.95, flame: 0.85 },
    wind: { terra: 1.25, nature: 1.10, frost: 0.85 },
    shadow: { shadow: 1.10 },
  };

  return chart?.[a]?.[d] ?? 1.0;
}

// ============================
// STATE
// ============================
const battlesByGroup = new Map();
const challengesByGroup = new Map();

function getBattle(groupId) {
  return battlesByGroup.get(groupId) || null;
}

function setBattle(groupId, state) {
  battlesByGroup.set(groupId, state);
}

function clearBattle(groupId) {
  battlesByGroup.delete(groupId);
}

function getChallenge(groupId) {
  const ch = challengesByGroup.get(groupId) || null;
  if (!ch) return null;
  if (Date.now() - ch.createdAt > 60_000) {
    challengesByGroup.delete(groupId);
    return null;
  }
  return ch;
}

function setChallenge(groupId, ch) {
  challengesByGroup.set(groupId, ch);
}

function clearChallenge(groupId) {
  challengesByGroup.delete(groupId);
}

// ============================
// HELPERS
// ============================
function resolveChosenMora(players, jid, battle) {
  const p = players[jid];
  const party = getParty(p);
  const idx = battle.activeIndex[jid] ?? 0;
  return { p, party, idx, mora: party[idx] || null };
}

function buildMoveListTextDetailed(mora, species, battleMath) {
  const moves = Array.isArray(mora?.moves) ? mora.moves : [];
  if (!moves.length) return "No moves saved.";

  const lines = [];
  for (let i = 0; i < moves.length; i++) {
    const name = moves[i];
    const mv = getMoveData(species, name);

    if (!mv) {
      lines.push(`${i + 1}) *${name}*\n   ⚠️ (missing data in mora.json)`);
      continue;
    }

    const cost = battleMath.calcEnergyCost(mv);

    lines.push(
      `${i + 1}) *${name}*\n` +
        `   💥 Power: ${mv.power ?? 0}\n` +
        `   🎯 Accuracy: ${mv.accuracy ?? 100}\n` +
        `   🔋 Energy: ${cost}\n` +
        `   🧩 Category: ${mv.category ?? "—"}\n` +
        `   📝 ${mv.desc ?? ""}`.trim()
    );
  }

  return lines.join("\n\n");
}

// ============================
// COMMANDS
// ============================
async function cmdBattle(ctx, chatId, senderId, msg, args) {
  const { sock, players } = ctx;

  if (!isGroupJid(chatId)) {
    return sock.sendMessage(chatId, { text: "❌ Battles only work in groups." }, { quoted: msg });
  }

  if (getBattle(chatId)) {
    return sock.sendMessage(chatId, {
      text: "⚠️ There is already an active battle in this group. Finish it first.",
    }, { quoted: msg });
  }

  if (getChallenge(chatId)) {
    return sock.sendMessage(chatId, {
      text: "⚠️ There is already a pending challenge in this group. Use .accept / .reject.",
    }, { quoted: msg });
  }

  const targetMention =
    (msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
  const targetJid = targetMention ? normJid(targetMention) : null;

  if (!targetJid) {
    return sock.sendMessage(chatId, { text: "Use: *.battle @user*" }, { quoted: msg });
  }

  if (targetJid === senderId) {
    return sock.sendMessage(chatId, { text: "😑 You can’t battle yourself." }, { quoted: msg });
  }

  const a = players[senderId];
  const b = players[targetJid];

  if (!a || !b) {
    return sock.sendMessage(chatId, { text: "❌ Both players must be registered (.start)." }, { quoted: msg });
  }

  const aParty = getParty(a);
  const bParty = getParty(b);

  if (aParty.filter(Boolean).length === 0 || bParty.filter(Boolean).length === 0) {
    return sock.sendMessage(chatId, { text: "❌ Both players must have at least 1 Mora in party." }, { quoted: msg });
  }

  if (pickFirstAliveIndex(aParty) === -1 || pickFirstAliveIndex(bParty) === -1) {
    return sock.sendMessage(chatId, { text: "❌ Someone has fainted Mora in theirparty. Use *.heal* first." }, { quoted: msg });
  }

  setChallenge(chatId, {
    groupId: chatId,
    fromJid: senderId,
    toJid: targetJid,
    createdAt: Date.now(),
  });

  const fromName = getDisplayName(players, senderId);

  return sock.sendMessage(chatId, {
    text:
      `⚔️ *BATTLE CHALLENGE*\n\n` +
      `@${String(targetJid).split("@")[0]}, *${fromName}* challenged you!\n\n` +
      `✅ *.accept* to start\n` +
      `❌ *.reject* to decline\n\n` +
      `⏳ Challenge expires in 60 seconds.`,
    mentions: [targetJid, senderId],
  }, { quoted: msg });
}

async function cmdAccept(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers, hpBar } = ctx;

  if (!isGroupJid(chatId)) {
    return sock.sendMessage(chatId, { text: "❌ Battles only work in groups." }, { quoted: msg });
  }

  if (getBattle(chatId)) {
    return sock.sendMessage(chatId, { text: "⚠️ There is already an active battle in this group." }, { quoted: msg });
  }

  const ch = getChallenge(chatId);
  if (!ch) {
    return sock.sendMessage(chatId, { text: "❌ No pending challenge in this group." }, { quoted: msg });
  }

  if (normJid(ch.toJid) !== senderId) {
    return sock.sendMessage(chatId, { text: "❌ Only the challenged player can accept." }, { quoted: msg });
  }

  const aJid = normJid(ch.fromJid);
  const bJid = normJid(ch.toJid);

  const a = players[aJid];
  const b = players[bJid];

  if (!a || !b) {
    clearChallenge(chatId);
    return sock.sendMessage(chatId, { text: "❌ Both players must be registered (.start)." }, { quoted: msg });
  }

  const aParty = getParty(a);
  const bParty = getParty(b);

  const aIdx = pickFirstAliveIndex(aParty);
  const bIdx = pickFirstAliveIndex(bParty);

  if (aIdx === -1 || bIdx === -1) {
    clearChallenge(chatId);
    return sock.sendMessage(chatId, { text: "❌ Someone has no unfainted Mora in party. Use *.heal* first." }, { quoted: msg });
  }

  ensureEnergyFields(aParty[aIdx]);
  ensureEnergyFields(bParty[bIdx]);

  const state = {
    groupId: chatId,
    aJid,
    bJid,
    activeIndex: { [aJid]: aIdx, [bJid]: bIdx },
    pending: {},
    startedAt: Date.now(),
    battleType: "pvp",
  };

  clearChallenge(chatId);
  setBattle(chatId, state);

  const header = battleHeader(players, aJid, bJid, aParty[aIdx], bParty[bIdx], hpBar);
  savePlayers(players);

  // Send VS image
  try {
    const vsImage = await generateBattleVsImage(a, b);
    await sock.sendMessage(chatId, {
      image: vsImage,
      caption: getBattleCommentary("startBattle"),
      mentions: [aJid, bJid],
    });
  } catch {}

  const startPrompt =
    `┌─────── ✦ YOUR MOVE ✦ ───────┐\n` +
    `│  *.attack 1-4*  ┃  *.switch 1-5*  │\n` +
    `│  *.charge*      ┃  *.forfeit*     │\n` +
    `└────────────────────────────┘\n` +
    `⏳ _Both choose an action. Speed decides who strikes first._`;

  return sock.sendMessage(chatId, {
    text: header + `\n\n` + startPrompt,
    mentions: [aJid, bJid],
  }, { quoted: msg });
}

async function cmdReject(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;

  if (!isGroupJid(chatId)) {
    return sock.sendMessage(chatId, { text: "❌ Battles only work in groups." }, { quoted: msg });
  }

  const ch = getChallenge(chatId);
  if (!ch) {
    return sock.sendMessage(chatId, { text: "❌ No pending challenge in this group." }, { quoted: msg });
  }

  const to = normJid(ch.toJid);
  const from = normJid(ch.fromJid);

  if (senderId !== to && senderId !== from) {
    return sock.sendMessage(chatId, { text: "❌ Only the challenger or challenged player can reject." }, { quoted: msg });
  }

  clearChallenge(chatId);

  const fromName = getDisplayName(players, from);
  const toName = getDisplayName(players, to);

  return sock.sendMessage(chatId, {
    text: `❌ *CHALLENGE DECLINED*\n\n*${toName}* declined *${fromName}*'s battle request.`,
    mentions: [from, to],
  }, { quoted: msg });
}

async function cmdAttack(ctx, chatId, senderId, args, msg) {
  const { sock, players, loadMora, battleMath } = ctx;

  const battle = getBattle(chatId);
  if (!battle) {
    return sock.sendMessage(chatId, { text: "❌ No active battle in this group." }, { quoted: msg });
  }

  const isParticipant = senderId === battle.aJid || senderId === battle.bJid;
  if (!isParticipant) {
    return sock.sendMessage(chatId, { text: "👀 You are not in this battle." }, { quoted: msg });
  }

  const pickRaw = args.join(" ").trim();
  if (!pickRaw) {
    const { mora } = resolveChosenMora(players, senderId, battle);
    if (!mora) return sock.sendMessage(chatId, { text: "❌ No active Mora." }, { quoted: msg });

    const moraList = loadMora();
    const species = getSpecies(moraList, mora.moraId);
    const detailed = buildMoveListTextDetailed(mora, species, battleMath);

    return sock.sendMessage(chatId, {
      text:
        `🎴 *Choose your move*\n` +
        `Use: *.attack 1-4* or *.attack MoveName*\n\n` +
        detailed,
    }, { quoted: msg });
  }

  const { mora } = resolveChosenMora(players, senderId, battle);
  if (!mora || isFainted(mora)) {
    return sock.sendMessage(chatId, { text: "❌ Your active Mora is fainted. Use *.switch*." }, { quoted: msg });
  }

  ensureEnergyFields(mora);

  const moves = Array.isArray(mora.moves) ? mora.moves : [];
  let moveName = null;

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
    return sock.sendMessage(chatId, { text: "❌ Move not found in your current moves." }, { quoted: msg });
  }

  const moraList = loadMora();
  const species = getSpecies(moraList, mora.moraId);
  const mv = getMoveData(species, moveName);

  if (!mv) {
    return sock.sendMessage(chatId, { text: "❌ That move data is missing in mora.json for this Mora." }, { quoted: msg });
  }

  const cost = battleMath.calcEnergyCost(mv);
  if (mora.energy < cost) {
    return sock.sendMessage(chatId, {
      text: `❌ Not enough energy. Need *${cost}*, you have *${mora.energy}*.`,
    }, { quoted: msg });
  }

  battle.pending[senderId] = { kind: "move", value: moveName };
  setBattle(chatId, battle);

  const bothReady = battle.pending[battle.aJid] && battle.pending[battle.bJid];
  if (!bothReady) {
    return sock.sendMessage(chatId, { text: "✅ Action locked. Waiting for the other player..." }, { quoted: msg });
  }

  return resolveTurn(ctx, chatId, msg);
}


async function cmdSwitch(ctx, chatId, senderId, args, msg) {
  const { sock, players } = ctx;

  const battle = getBattle(chatId);
  if (!battle) {
    return sock.sendMessage(chatId, { text: "❌ No active battle in this group." }, { quoted: msg });
  }

  const isParticipant = senderId === battle.aJid || senderId === battle.bJid;
  if (!isParticipant) {
    return sock.sendMessage(chatId, { text: "👀 You are not in this battle." }, { quoted: msg });
  }

  const pickRaw = args.join(" ").trim();
  if (!/^\d+$/.test(pickRaw)) {
    const p = players[senderId];
    const party = getParty(p);

    const lines = [];
    for (let i = 0; i < 5; i++) {
      const m = party[i];
      if (!m) {
        lines.push(`${i + 1}) — empty —`);
        continue;
      }
      const status = isFainted(m) ? "💀 FAINTED" : `❤️ ${m.hp}/${m.maxHp}`;
      ensureEnergyFields(m);
      lines.push(`${i + 1}) ${m.name} • Lv ${m.level} • ${status} • 🔋 ${m.energy}/${m.maxEnergy}`);
    }

    return sock.sendMessage(chatId, {
      text: `Use: *.switch 1-5*\n\nYour party:\n${lines.join("\n")}`,
    }, { quoted: msg });
  }

  const slot = Number(pickRaw);
  const p = players[senderId];
  const party = getParty(p);

  if (slot < 1 || slot > 5) {
    return sock.sendMessage(chatId, { text: "❌ Invalid party slot." }, { quoted: msg });
  }

  const chosen = party[slot - 1];
  if (!chosen) {
    return sock.sendMessage(chatId, { text: "❌ That party slot is empty." }, { quoted: msg });
  }

  if (isFainted(chosen)) {
    return sock.sendMessage(chatId, { text: "❌ You can’t switch to a fainted Mora." }, { quoted: msg });
  }

  battle.pending[senderId] = { kind: "switch", value: slot - 1 };
  setBattle(chatId, battle);

  const bothReady = battle.pending[battle.aJid] && battle.pending[battle.bJid];
  if (!bothReady) {
    return sock.sendMessage(chatId, { text: "✅ Switch locked. Waiting for the other player..." }, { quoted: msg });
  }

  return resolveTurn(ctx, chatId, msg);
}

// ============================
// USE ITEM IN BATTLE
// ============================
// Per-turn consumable use. Counts as the player's action for this round.
async function cmdUse(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;

  const battle = getBattle(chatId);
  if (!battle) return sock.sendMessage(chatId, { text: "❌ No active battle." }, { quoted: msg });

  const isParticipant = senderId === battle.aJid || senderId === battle.bJid;
  if (!isParticipant) return sock.sendMessage(chatId, { text: "👀 You are not in this battle." }, { quoted: msg });

  if (battle.pending?.[senderId]) {
    return sock.sendMessage(chatId, { text: "⏳ You already locked in an action this round." }, { quoted: msg });
  }

  const query = args.join(" ").trim();
  if (!query) return sock.sendMessage(chatId, { text: "Usage: `.use <item name or id>`" }, { quoted: msg });

  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Player not found." }, { quoted: msg });

  // Lazy-load inventory system to avoid circular dep at module level
  const inventorySystem = require("./inventory");
  const itemsSystem = require("./items");

  itemsSystem.ensurePlayerItemData(player);

  const item = itemsSystem.findItem(query);
  if (!item) return sock.sendMessage(chatId, { text: `❌ Item not found: *${query}*` }, { quoted: msg });

  const isConsumable = item.category === "consumable" || item.category === "scroll";
  if (!isConsumable) {
    return sock.sendMessage(chatId, {
      text: `❌ *${item.name}* can't be used in battle.\nOnly consumables and scrolls can be used mid-fight.`,
    }, { quoted: msg });
  }

  const owned = itemsSystem.getItemQuantity(player, item.id);
  if (owned <= 0) return sock.sendMessage(chatId, { text: `❌ You don't have any *${item.name}*.` }, { quoted: msg });

  // Faction scroll check
  if (item.category === "scroll" && item.faction && player.faction !== item.faction) {
    return sock.sendMessage(chatId, {
      text: `🚫 *${item.name}* is a *${item.faction}* scroll. It doesn't respond to your faction.`,
    }, { quoted: msg });
  }

  const effects = item.category === "scroll"
    ? (inventorySystem.SCROLL_EFFECTS[item.id] || {})
    : (item.effects || {});

  if (!Object.keys(effects).length) {
    return sock.sendMessage(chatId, {
      text: `⚠️ *${item.name}* has no in-battle effect yet.`,
    }, { quoted: msg });
  }

  // Apply effects immediately (battle items apply on use, not on turn resolve)
  const maxHp = Number(player.playerMaxHp || 100);
  const maxEn = Number(player.maxHuntEnergy ?? player.huntEnergyMax ?? 100);
  const before = { hp: Number(player.playerHp || 0), en: Number(player.huntEnergy || 0) };

  const { log } = inventorySystem.applyItemEffects(player, effects, {});

  player.playerHp   = Math.max(0, Math.min(player.playerHp   || 0, maxHp));
  player.huntEnergy = Math.max(0, Math.min(player.huntEnergy  || 0, maxEn));

  // Remove one from inventory
  const newQty = owned - 1;
  if (newQty <= 0) delete player.inventory[item.id];
  else player.inventory[item.id] = newQty;

  savePlayers(players);

  const icon = itemsSystem.getRarityIcon(item.rarity);
  const changes = [];
  if (player.playerHp !== before.hp)   changes.push(`❤️ HP: *${before.hp} → ${player.playerHp}*`);
  if (player.huntEnergy !== before.en) changes.push(`⚡ Energy: *${before.en} → ${player.huntEnergy}*`);

  await sock.sendMessage(chatId, {
    text:
      `🧪 @${String(senderId).split("@")[0]} used *${icon} ${item.name}*!\n\n` +
      (log.length    ? log.join("\n")     + "\n\n" : "") +
      (changes.length ? changes.join("\n") + "\n\n" : "") +
      `📦 Remaining: *${newQty}*\n\n` +
      `_Item use counts as your action this round._`,
    mentions: [senderId],
  }, { quoted: msg });

  // Lock in a "pass" action so the round can resolve
  battle.pending[senderId] = { kind: "pass", value: "" };
  setBattle(chatId, battle);

  const bothReady = battle.pending[battle.aJid] && battle.pending[battle.bJid];
  if (bothReady) return resolveTurn(ctx, chatId, msg);
  return;
}

// ============================
// CHARGE — restore energy at the cost of your turn
// ============================
async function cmdCharge(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;

  const battle = getBattle(chatId);
  if (!battle) {
    return sock.sendMessage(chatId, { text: "❌ No active battle in this group." }, { quoted: msg });
  }

  const isParticipant = senderId === battle.aJid || senderId === battle.bJid;
  if (!isParticipant) {
    return sock.sendMessage(chatId, { text: "👀 You are not in this battle." }, { quoted: msg });
  }

  if (battle.pending[senderId]) {
    return sock.sendMessage(chatId, { text: "⏳ You already locked an action this turn." }, { quoted: msg });
  }

  const { mora } = resolveChosenMora(players, senderId, battle);
  if (!mora || isFainted(mora)) {
    return sock.sendMessage(chatId, { text: "❌ Your active Mora is fainted. Use *.switch*." }, { quoted: msg });
  }

  ensureEnergyFields(mora);

  const gain = Math.max(6, Math.floor(mora.maxEnergy * 0.22));
  mora.energy = clamp(mora.energy + gain, 0, mora.maxEnergy);

  battle.pending[senderId] = { kind: "pass", value: "charge" };
  setBattle(chatId, battle);

  const chargeQuotes = [
    `🔋 *${mora.name}* focuses its energy... *+${gain} EN* restored!`,
    `⚡ *${mora.name}* gathers power from the rift... *+${gain} EN*!`,
    `🌀 *${mora.name}* channels the Lumora crystals... *+${gain} EN* recharged!`,
    `💠 *${mora.name}* takes a deep breath and *charges up +${gain} EN*!`,
  ];
  const quote = chargeQuotes[Math.floor(Math.random() * chargeQuotes.length)];

  const bothReady = battle.pending[battle.aJid] && battle.pending[battle.bJid];

  if (!bothReady) {
    return sock.sendMessage(chatId, {
      text: `${quote}\n\n⏳ Waiting for the other player...`,
      mentions: [senderId],
    }, { quoted: msg });
  }

  await sock.sendMessage(chatId, { text: quote, mentions: [senderId] });
  return resolveTurn(ctx, chatId, msg);
}

async function cmdForfeit(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers, auraSystem, xpSystem } = ctx;

  const battle = getBattle(chatId);
  if (!battle) {
    return sock.sendMessage(chatId, { text: "❌ No active battle in this group." }, { quoted: msg });
  }

  const isParticipant = senderId === battle.aJid || senderId === battle.bJid;
  if (!isParticipant) {
    return sock.sendMessage(chatId, { text: "👀 You are not in this battle." }, { quoted: msg });
  }

  const winnerJid = senderId === battle.aJid ? battle.bJid : battle.aJid;
  const loserJid = senderId;

  const winner = players[winnerJid];
  const loser = players[loserJid];

  // No aura penalty for forfeiting
  const gain = auraSystem.calcAuraGain(winner, loser);
  auraSystem.addAura(winner, gain);

  const playerXpGain = 40;
  const winnerPlayerXp = xpSystem.addPlayerXp(winner, playerXpGain);

  savePlayers(players);
  clearBattle(chatId);

  const wName = getDisplayName(players, winnerJid);
  const lName = getDisplayName(players, loserJid);

  return sock.sendMessage(chatId, {
    text:
      `🏳️ *FORFEIT!*\n` +
      `@${String(loserJid).split("@")[0]} forfeited.\n\n` +
      `🏆 Winner: *${wName}*\n` +
      `💔 Loser: *${lName}*\n` +
      `✨ Winner aura +${gain}\n` +
      `⭐ Winner Player XP +${playerXpGain}` +
      (winnerPlayerXp.leveledUp ? `\n🆙 *${wName}* leveled up +${winnerPlayerXp.levels}!` : ""),
    mentions: [winnerJid, loserJid],
  }, { quoted: msg });
}

// ============================
// TURN RESOLUTION
// ============================
// ── Primordial Energy helpers ──────────────────────────────
function calcPeGain(mora, dmg, prim) {
  const maxHp = Number(mora.maxHp || 1);
  const pct   = dmg / maxHp;

  let base;
  if (pct >= 0.18)      base = randInt(prim.base.heavy[0],  prim.base.heavy[1]);
  else if (pct >= 0.08) base = randInt(prim.base.medium[0], prim.base.medium[1]);
  else                  base = randInt(prim.base.light[0],  prim.base.light[1]);

  const rarity  = (mora.rarity || "common").toLowerCase();
  const faction = (mora.faction || "").toLowerCase();

  const rm = prim.rarityMultiplier[rarity]  ?? 1.0;
  const fm = prim.factionMultiplier[faction] ?? 1.0;

  return Math.max(1, Math.round(base * rm * fm));
}

const BATTLE_SPEECHES_WIN  = [
  "⚔️ *The Rift trembles.* Another warrior rises.",
  "🏆 *Victory echoes through the Lumora crystals.* The strong endure.",
  "✨ *The bond between Lumorian and Mora proved unbreakable today.*",
  "🌌 *Power recognized. The Lumora crystals pulse in approval.*",
];
const BATTLE_SPEECHES_LOSE = [
  "💔 *Even the mightiest fall. Rise again, Lumorian.*",
  "🌌 *Defeat is not the end — it is the forge.*",
  "🩸 *The Rift does not mourn the fallen. Train harder.*",
  "⚡ *Strength is born from struggle. Return stronger.*",
];
function pickBattleSpeech() {
  const pool = Math.random() < 0.5 ? BATTLE_SPEECHES_WIN : BATTLE_SPEECHES_LOSE;
  return pool[Math.floor(Math.random() * pool.length)];
}


function applyPe(mora, gain, prim, logs) {
  if (!mora) return;
  const prev = Number(mora.pe || 0);
  mora.pe = clamp(prev + gain, 0, 9999);

  const t = prim.thresholds;
  if (prev < t.unstable  && mora.pe >= t.unstable)
    logs.push(`⚠️ *${mora.name}*'s Primordial Energy is *UNSTABLE* (${mora.pe} PE)! It's becoming erratic!`);
  else if (prev < t.corrupted && mora.pe >= t.corrupted)
    logs.push(`🔴 *${mora.name}*'s Primordial Energy reached *CORRUPTED* level (${mora.pe} PE)! Control is slipping!`);
  else if (prev < t.critical  && mora.pe >= t.critical)
    logs.push(`💀 *${mora.name}*'s Primordial Energy is at *CRITICAL* (${mora.pe} PE)! It may break free!`);
}

async function resolveTurn(ctx, chatId, msg) {
  const { sock, players, savePlayers, loadMora, battleMath, hpBar, primordial } = ctx;

  const battle = getBattle(chatId);
  if (!battle) return;

  let A = resolveChosenMora(players, battle.aJid, battle);
  let B = resolveChosenMora(players, battle.bJid, battle);

  if (!A.mora || !B.mora) {
    clearBattle(chatId);
    return sock.sendMessage(chatId, { text: "❌ Battle ended (missing party Mora data)." }, { quoted: msg });
  }

  if (isFainted(A.mora)) battle.activeIndex[battle.aJid] = pickFirstAliveIndex(A.party);
  if (isFainted(B.mora)) battle.activeIndex[battle.bJid] = pickFirstAliveIndex(B.party);

  A = resolveChosenMora(players, battle.aJid, battle);
  B = resolveChosenMora(players, battle.bJid, battle);

  if (
    !A.mora || !B.mora ||
    battle.activeIndex[battle.aJid] === -1 ||
    battle.activeIndex[battle.bJid] === -1
  ) {
    return endIfBattleOver(ctx, chatId, msg);
  }

  const actA = battle.pending[battle.aJid];
  const actB = battle.pending[battle.bJid];

  battle.pending = {};
  setBattle(chatId, battle);

  try {
    regenPartyEnergyForTurn(players[battle.aJid], battle.activeIndex[battle.aJid] ?? 0);
    regenPartyEnergyForTurn(players[battle.bJid], battle.activeIndex[battle.bJid] ?? 0);
  } catch {}

  const logs = [];

  // ── RIFT: Corruption burn — Rift players take HP per turn with corrupted active Mora
  for (const jid of [battle.aJid, battle.bJid]) {
    const p    = players[jid];
    const idx  = battle.activeIndex[jid] ?? 0;
    const mora = getParty(p)[idx];
    const burn = factionMarketSystem.getRiftInBattleBurn(p, mora);
    if (burn > 0) {
      logs.push(`🩸 *${getDisplayName(players, jid)}* takes *${burn} HP burn* from corrupted Mora feedback!`);
    }
  }

  const spdA = Number(A.mora?.stats?.spd || 0);
  const spdB = Number(B.mora?.stats?.spd || 0);

  let firstJid = battle.aJid;
  let secondJid = battle.bJid;

  if (spdB > spdA) {
    firstJid = battle.bJid;
    secondJid = battle.aJid;
  } else if (spdA === spdB && randInt(0, 1) === 1) {
    firstJid = battle.bJid;
    secondJid = battle.aJid;
  }

  async function applyAction(actorJid, action) {
    const actor = resolveChosenMora(players, actorJid, battle);
    const enemyJid = actorJid === battle.aJid ? battle.bJid : battle.aJid;
    const enemy = resolveChosenMora(players, enemyJid, battle);

    if (!actor.mora || isFainted(actor.mora)) return;
    if (!enemy.mora || partyAllFainted(enemy.party)) return;

    if (action?.kind === "switch") {
      const newIdx = Number(action.value);
      const party = actor.party;

      if (newIdx >= 0 && newIdx < party.length && party[newIdx] && !isFainted(party[newIdx])) {
        battle.activeIndex[actorJid] = newIdx;
        const swMora = party[newIdx];
        logs.push(`🔁 *${getDisplayName(players, actorJid)}* switched to *${swMora.name}*! ${typeEmoji(swMora.type)}`);
        if (Math.random() < 0.5) logs.push(`  🎙️ _${getBattleCommentary("switch")}_`);
        setBattle(chatId, battle);
      }
      return;
    }

    // Item use already applied — just skip the attack this turn
    if (action?.kind === "pass") return;

    const moveName = String(action?.value || "");
    if (!moveName) {
      logs.push(`⏳ *${getDisplayName(players, actorJid)}* did not choose an action.`);
      return;
    }

    const moraList = loadMora();
    const actorSpecies = getSpecies(moraList, actor.mora.moraId);
    const mv = getMoveData(actorSpecies, moveName);

    if (!mv) {
      logs.push(`⚠️ *${getDisplayName(players, actorJid)}* tried *${moveName}* but data is missing.`);
      return;
    }

    ensureEnergyFields(actor.mora);
    const cost = battleMath.calcEnergyCost(mv);

    if (actor.mora.energy < cost) {
      logs.push(`🪫 *${actor.mora.name}* tried *${moveName}* — _not enough energy!_`);
      return;
    }

    actor.mora.energy = clamp(actor.mora.energy - cost, 0, actor.mora.maxEnergy);

    // ── Primordial Backlash: at critical PE (≥100), Mora may turn on its Lumorian ──
    const actorPe = Number(actor.mora.pe || 0);
    if (actorPe >= 100) {
      const backlashChance = actor.mora.faction === "harmony" ? 0.10 : 0.22;
      if (Math.random() < backlashChance) {
        const actorPlayer = players[actorJid];
        if (actorPlayer) {
          const maxHp  = Number(actorPlayer.playerMaxHp || 100);
          const blDmg  = Math.floor(maxHp * (0.05 + Math.random() * 0.10));
          actorPlayer.playerHp = Math.max(0, Number(actorPlayer.playerHp || 0) - blDmg);
          const PE_BACKLASH = [
            "💥 *PRIMORDIAL BACKLASH* — The unstable energy erupts, striking its own Lumorian!",
            "🌌 *The Rift within screams outward — you take the blow.*",
            "⚠️ *BACKLASH* — Your Mora's overloaded PE turns against you!",
          ];
          logs.push(`${PE_BACKLASH[Math.floor(Math.random() * PE_BACKLASH.length)]}\n💔 @${String(actorJid).split("@")[0]} takes *-${blDmg} HP* from their own Mora!`);
        }
        return; // Backlash consumes the turn — no attack goes through
      }
    }

    const hit = battleMath.checkHit(mv.accuracy ?? 100);
    if (!hit) {
      logs.push(`${typeEmoji(actor.mora.type)} *${actor.mora.name}* used *${moveName}* — 💨 *MISS!*`);
      if (Math.random() < 0.6) logs.push(`  🎙️ _${getBattleCommentary("miss")}_`);
      return;
    }

    const crit = battleMath.rollCrit(10);

    // Track crit for mission system
    if (crit) missionSystem.onCritHit(actorJid, players[actorJid]?.faction);

    let dmg = battleMath.calcDamage({
      attacker: actor.mora,
      defender: enemy.mora,
      move: { ...mv, type: actor.mora.type },
      crit,
    });

    const power = clamp(Number(mv.power ?? 35), 10, 200);
    const powerFactor = 0.55 + (power / 200) * 0.70;
    dmg = Math.floor(dmg * powerFactor);

    const mult = typeMultiplier(actor.mora.type, enemy.mora.type);
    dmg = Math.floor(dmg * mult);

    dmg = Math.floor(dmg * (randInt(92, 108) / 100));

    const aLv = Number(actor.mora.level || 1);
    const bLv = Number(enemy.mora.level || 1);
    const lvDiff = clamp(aLv - bLv, -10, 10);
    dmg = Math.floor(dmg * (1 + lvDiff * 0.03));

    const enemyMax = Number(enemy.mora.maxHp || 1);
    const lowLevel = Math.max(aLv, bLv) <= 6;
    const capPct = lowLevel ? 0.38 : 0.55;
    const cap = Math.max(4, Math.floor(enemyMax * capPct));
    dmg = Math.min(dmg, cap);

    const minDmg = power <= 25 ? 2 : 4;
    dmg = Math.max(minDmg, dmg);

    // ── Faction damage modifiers ─────────────────────────────
    const actorP = players[actorJid];
    const enemyP = players[enemyJid];
    dmg = Math.floor(dmg * factionMarketSystem.getPurityCombatBonus(actorP));
    dmg = Math.floor(dmg * factionMarketSystem.getHarmonyPvpPenalty(actorP));
    dmg = Math.floor(dmg * factionMarketSystem.getRiftCorruptedDamageBoost(actorP, actor.mora));

    // ── Rift Fury buff (from .devour) ─────────────────────────
    if (actorP?.riftFury && Number(actorP.riftFury.battles) > 0) {
      dmg = Math.floor(dmg * (1 + Number(actorP.riftFury.bonus || 0.15)));
      actorP.riftFury.battles = Number(actorP.riftFury.battles) - 1;
      if (actorP.riftFury.battles <= 0) delete actorP.riftFury;
      logs.push(`🔥 *RIFT FURY* surges through *${getDisplayName(players, actorJid)}*'s attack!`);
    }

    enemy.mora.hp = clamp(Number(enemy.mora.hp || 0) - dmg, 0, Number(enemy.mora.maxHp || 1));

    // ── Primordial Energy rises on the hit Mora ──
    if (primordial && enemy.mora && !isFainted(enemy.mora)) {
      const peGain = calcPeGain(enemy.mora, dmg, primordial);
      applyPe(enemy.mora, peGain, primordial, logs);
    }
    // ── Big hit bonus PE for the attacker's Mora ──
    if (primordial && crit && actor.mora) {
      applyPe(actor.mora, primordial.base.bigHitBonus, primordial, logs);
    }

    const effTxt =
      mult >= 1.2 ? "  🔥*SUPER EFFECTIVE!*"
      : mult <= 0.85 ? "  🥶*NOT VERY EFFECTIVE*"
      : "";

    // Build damage line with type emoji
    const tIcon = typeEmoji(actor.mora.type);
    let dmgLine = `${tIcon} *${actor.mora.name}* used *${moveName}*`;
    if (crit) dmgLine += ` ✨*CRIT!*`;
    dmgLine += `\n   ↳ *-${dmg} HP* to *${enemy.mora.name}*`;
    if (effTxt) dmgLine += `  ${effTxt}`;
    logs.push(dmgLine);

    // Battle announcer commentary
    const enemyHpPct = Number(enemy.mora.hp || 0) / Number(enemy.mora.maxHp || 1);
    if (crit || dmg >= Number(enemy.mora.maxHp || 1) * 0.3) {
      logs.push(`  🎙️ _${getBattleCommentary("bigHit")}_`);
    } else if (enemyHpPct > 0 && enemyHpPct <= 0.25 && !isFainted(enemy.mora)) {
      logs.push(`  🎙️ _${getBattleCommentary("lowHp")}_`);
    }

    if (isFainted(enemy.mora)) {
      logs.push(`\n☠️ *${enemy.mora.name}* has fallen!`);
      if (Math.random() < 0.7) logs.push(`  🎙️ _${getBattleCommentary("faint")}_`);

      const idx = pickFirstAliveIndex(enemy.party);
      if (idx !== -1) {
        battle.activeIndex[enemyJid] = idx;
        const nextMora = enemy.party[idx];
        logs.push(`  ➡️ *${getDisplayName(players, enemyJid)}* sent out *${nextMora.name}*! ${typeEmoji(nextMora.type)}`);
        setBattle(chatId, battle);
      }
    }
  }

  const firstAction = firstJid === battle.aJid ? actA : actB;
  const secondAction = secondJid === battle.aJid ? actA : actB;

  await applyAction(firstJid, firstAction);
  await endIfBattleOver(ctx, chatId, msg);
  if (!getBattle(chatId)) return;

  await applyAction(secondJid, secondAction);
  await endIfBattleOver(ctx, chatId, msg);
  if (!getBattle(chatId)) return;

  // ── Round tick: PE slowly rises each round for all active Mora ──
  if (primordial) {
    const tickBattle = getBattle(chatId);
    if (tickBattle) {
      for (const jid of [tickBattle.aJid, tickBattle.bJid]) {
        const tickMora = resolveChosenMora(players, jid, tickBattle).mora;
        if (tickMora && !isFainted(tickMora)) {
          applyPe(tickMora, primordial.base.roundTick, primordial, logs);
        }
      }
    }
  }

  const now = getBattle(chatId);
  const A3 = resolveChosenMora(players, now.aJid, now);
  const B3 = resolveChosenMora(players, now.bJid, now);

  const header = battleHeader(players, now.aJid, now.bJid, A3.mora, B3.mora, hpBar);
  savePlayers(players);

  // Sectioned output with action log, status, and prompt
  const actionSection = logs.join("\n");
  const promptSection = `┌─────── ✦ YOUR MOVE ✦ ───────┐\n` +
    `│  *.attack 1-4*  ┃  *.switch 1-5*  │\n` +
    `│  *.charge*      ┃  *.forfeit*     │\n` +
    `└────────────────────────────┘`;

  return sock.sendMessage(chatId, {
    text: `${actionSection}\n\n${header}\n\n${promptSection}`,
    mentions: [now.aJid, now.bJid],
  }, { quoted: msg });
}

// ============================
// END BATTLE
// ============================
async function endIfBattleOver(ctx, chatId, msg) {
  const { sock, players, savePlayers, loadMora, xpSystem, auraSystem } = ctx;

  const battle = getBattle(chatId);
  if (!battle) return;

  const aParty = getParty(players[battle.aJid]);
  const bParty = getParty(players[battle.bJid]);

  const aDead = partyAllFainted(aParty);
  const bDead = partyAllFainted(bParty);

  if (!aDead && !bDead) return;

  const winnerJid = aDead ? battle.bJid : battle.aJid;
  const loserJid = aDead ? battle.aJid : battle.bJid;

  const winnerP = players[winnerJid];
  const loserP = players[loserJid];

  const moraList = loadMora();

  const winnerActive = resolveChosenMora(players, winnerJid, battle).mora;
  const loserActive = resolveChosenMora(players, loserJid, battle).mora;

  const winnerSpecies = winnerActive ? getSpecies(moraList, winnerActive.moraId) : null;
  const loserSpecies = loserActive ? getSpecies(moraList, loserActive.moraId) : null;

  const loserLv = Number(loserActive?.level || 1);

  const baseXp = 30 + loserLv * 5;
  const winMoraXp = baseXp;
  const loseMoraXp = Math.floor(baseXp * 0.5);

  const winPlayerXp = 50 + loserLv * 3;
  const losePlayerXp = Math.floor(winPlayerXp * 0.5);

  let winnerMoraLevelText = "";
  let loserMoraLevelText = "";
  let winnerPlayerLevelText = "";
  let loserPlayerLevelText = "";

  if (winnerActive && winnerSpecies) {
    const res = xpSystem.addMoraXp(winnerActive, winnerSpecies, winMoraXp);
    if (res.leveledUp) {
      winnerMoraLevelText = `\n🆙 Winner Mora leveled up +${res.levelsGained}!`;
    }
  }

  if (loserActive && loserSpecies) {
    const res = xpSystem.addMoraXp(loserActive, loserSpecies, loseMoraXp);
    if (res.leveledUp) {
      loserMoraLevelText = `\n🆙 Loser Mora leveled up +${res.levelsGained}!`;
    }
  }

  const winnerPlayerXpRes = xpSystem.addPlayerXp(winnerP, winPlayerXp);
  const loserPlayerXpRes = xpSystem.addPlayerXp(loserP, losePlayerXp);

  if (winnerPlayerXpRes.leveledUp) {
    winnerPlayerLevelText = `\n🆙 Winner leveled up +${winnerPlayerXpRes.levels}!`;
  }

  if (loserPlayerXpRes.leveledUp) {
    loserPlayerLevelText = `\n🆙 Loser leveled up +${loserPlayerXpRes.levels}!`;
  }

  const loss = auraSystem.calcAuraLoss(loserP, winnerP);
  let gain   = auraSystem.calcAuraGain(winnerP, loserP);

  // ── PURITY: +15% Aura on PvP win ─────────────────────────
  gain = factionMarketSystem.getPurityAuraWinBonus(winnerP, gain);

  // ── RIFT: 15% chance to double Aura gain ─────────────────
  const riftBonus = factionMarketSystem.rollRiftChaosBonus(winnerP, gain);
  if (riftBonus.triggered) gain += riftBonus.bonus;

  auraSystem.removeAura(loserP, loss);
  auraSystem.addAura(winnerP, gain);

  // ── Record PvP win for Purity discipline clock ────────────
  winnerP.lastPvpWinAt = Date.now();

  // ── Win streak tracking ────────────────────────────────────
  winnerP.pvpWinStreak = (winnerP.pvpWinStreak || 0) + 1;
  winnerP.battlesWon = (winnerP.battlesWon || 0) + 1;
  loserP.pvpWinStreak = 0;

  // ── Companion bond +3 for winning ─────────────────────────
  if (winnerP.companionId != null) winnerP.companionBond = (winnerP.companionBond || 0) + 3;

  // ── Mutation decay: decrement battlesLeft for both players ─
  for (const pJid of [winnerJid, loserJid]) {
    const party = getParty(players[pJid]);
    for (const m of party) {
      if (m?.mutation && m.mutation.battlesLeft > 0) {
        m.mutation.battlesLeft -= 1;
        if (m.mutation.battlesLeft <= 0) delete m.mutation;
      }
    }
  }

  // ── Mission hooks ─────────────────────────────────────────
  try {
    const winnerActiveIdx  = battle.activeIndex[winnerJid] ?? 0;
    const winnerActiveMora = getParty(winnerP)[winnerActiveIdx];
    const activeIsCorrupted = !!(winnerActiveMora?.corrupted);
    const cleanParty = !getParty(winnerP).filter(Boolean).some(m => m.corrupted);
    missionSystem.onPvpWin(winnerJid, winnerP.faction, activeIsCorrupted, cleanParty);
  } catch {}

  // ── Gear durability damage ──────────────────────────────
  const GEAR_DESTROY_FLAVOR = {
    "Ashen Veil":           "🔥 The *Ashen Veil* finally burns out, crumbling to ash.",
    "Stormshroud":          "⚡ The *Stormshroud* tears apart from the lightning strain.",
    "Frostmantle":          "❄️ The *Frostmantle* shatters, frozen solid.",
    "Gloamwrap":            "🌑 The *Gloamwrap* dissolves into shadow and is gone.",
    "Emberthread":          "🔥 The *Emberthread* ignites and burns away completely.",
    "Rift Stabilizer Core": "🌀 The *Rift Stabilizer Core* fractures — rift energy tears it apart.",
    "Harmony Pulse Core":   "🌿 The *Harmony Pulse Core* dims and goes silent.",
    "Dominion Core":        "⚔️ The *Dominion Core* cracks under the pressure of battle.",
    "Aegis Node Core":      "🛡️ The *Aegis Node Core* overloads and shatters.",
    "Riftbite Core":        "💀 The *Riftbite Core* consumes itself — the power was too unstable.",
    "Primordial Fragment":  "🌌 The *Primordial Fragment* splinters, its energy spent.",
    "Vitality Relic":       "💎 The *Vitality Relic* cracks and the glow fades.",
    "Echo Relic":           "🔮 The *Echo Relic* goes silent — the resonance is broken.",
  };
  const GEAR_DAMAGE_FLAVOR = {
    "Ashen Veil":    "🔥 The *Ashen Veil* flickers — it won't hold much longer.",
    "Riftbite Core": "⚠️ The *Riftbite Core* pulses dangerously — it's becoming unstable.",
    "Dominion Core": "⚔️ The *Dominion Core* shows stress fractures.",
    "Echo Relic":    "🔮 The *Echo Relic* dims slightly from the battle.",
    "Primordial Fragment": "🌌 The *Primordial Fragment* hums with strain.",
  };

  const durabilityLogs = [];
  const itemsSystem = require("./items");

  for (const pJid of [winnerJid, loserJid]) {
    const p = players[pJid];
    if (!p) continue;
    // Terrain gear (cloak, boots) only degrades from terrain — skip those slots in PvP
    const chance = pJid === loserJid ? 0.45 : 0.25;
    const results = itemsSystem.applyDurabilityDamage(p, chance, ["cloak", "boots"]);
    for (const r of results) {
      if (r.status === "broken") {
        const flavor = GEAR_DESTROY_FLAVOR[r.item] || `💥 *${r.item}* has been destroyed!`;
        durabilityLogs.push(`@${String(pJid).split("@")[0]}: ${flavor}`);
      } else if (r.status === "damaged") {
        const flavor = GEAR_DAMAGE_FLAVOR[r.item];
        if (flavor) durabilityLogs.push(`@${String(pJid).split("@")[0]}: ${flavor} _(${r.remaining} durability left)_`);
      }
    }
  }

  savePlayers(players);
  clearBattle(chatId);

  const wName = getDisplayName(players, winnerJid);
  const lName = getDisplayName(players, loserJid);

  // ── Streak text ─────────────────────────────────────────────
  const streak = winnerP.pvpWinStreak || 1;
  let streakText = "";
  if (streak >= 10)     streakText = `\n\n🔥🔥🔥 *${wName}* is on a ${streak}-WIN STREAK! UNSTOPPABLE! 🔥🔥🔥`;
  else if (streak >= 7) streakText = `\n\n🔥🔥 *${wName}* is on a ${streak}-win streak! DOMINATING!`;
  else if (streak >= 5) streakText = `\n\n🔥 *${wName}* is on a ${streak}-win streak! On fire!`;
  else if (streak >= 3) streakText = `\n\n⚡ *${wName}* is on a ${streak}-win streak!`;

  const top = `╔══════════════════════╗`;
  const mid = `╟──────────────────────╢`;
  const bot = `╚══════════════════════╝`;

  const resultBlock =
    `${top}\n` +
    `   🏁  *BATTLE OVER*\n` +
    `${mid}\n\n` +
    `   🏆  *${wName}*  —  *VICTORY*\n` +
    `   💀  *${lName}*  —  DEFEATED\n`;

  const rewardsBlock =
    `\n${mid}\n` +
    `   📊  *REWARDS*\n` +
    `${mid}\n\n` +
    `  ✨ Aura:   *${wName}* +${gain}${riftBonus.triggered ? " 🎲*CHAOS!*" : ""}  ┃  *${lName}* -${loss}\n` +
    `  ⭐ Mora XP:   Winner +${winMoraXp}  ┃  Loser +${loseMoraXp}\n` +
    `  🌟 Player XP: Winner +${winPlayerXp}  ┃  Loser +${losePlayerXp}` +
    `${winnerMoraLevelText}${loserMoraLevelText}${winnerPlayerLevelText}${loserPlayerLevelText}\n`;

  const gearBlock = durabilityLogs.length
    ? `\n${mid}\n   ⚙️  *GEAR WEAR*\n${mid}\n${durabilityLogs.join("\n")}\n`
    : "";

  return sock.sendMessage(chatId, {
    text: resultBlock + rewardsBlock + gearBlock + `${bot}` + streakText + `\n\n${pickBattleSpeech()}`,
    mentions: [winnerJid, loserJid],
  }, { quoted: msg });
}

module.exports = {
  cmdBattle,
  cmdAccept,
  cmdReject,
  cmdAttack,
  cmdSwitch,
  cmdCharge,
  cmdForfeit,
  cmdUse,
  getBattle,
};

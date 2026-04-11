const DIVIDER = "━━━━━━━━━━━━━━━━━━";
const SMALL_DIVIDER = "──────────────────";

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function getOwned(player) {
  return Array.isArray(player?.moraOwned) ? player.moraOwned : [];
}

function ensureParty(player) {
  if (!player || typeof player !== "object") return;

  const owned = getOwned(player);

  if (!Array.isArray(player.party)) {
    player.party = [null, null, null, null, null];
  }

  while (player.party.length < 5) player.party.push(null);
  if (player.party.length > 5) player.party = player.party.slice(0, 5);

  const seen = new Set();

  for (let i = 0; i < 5; i++) {
    const idx = player.party[i];

    if (idx === null || idx === undefined) continue;

    if (!Number.isInteger(idx) || idx < 0 || idx >= owned.length || !owned[idx]) {
      player.party[i] = null;
      continue;
    }

    if (seen.has(idx)) {
      player.party[i] = null;
      continue;
    }

    seen.add(idx);
  }
}

function getParty(player) {
  ensureParty(player);
  return Array.isArray(player?.party) ? player.party.slice(0, 5) : [null, null, null, null, null];
}

function isValidOwnedIndex(player, idx) {
  const owned = getOwned(player);
  return Number.isInteger(idx) && idx >= 0 && idx < owned.length && !!owned[idx];
}

function isIndexAlreadyInParty(player, ownedIdx) {
  ensureParty(player);
  return player.party.includes(ownedIdx);
}

function firstEmptyPartySlot(player) {
  ensureParty(player);
  for (let i = 0; i < player.party.length; i++) {
    if (player.party[i] === null || player.party[i] === undefined) return i;
  }
  return -1;
}

function getUsername(player) {
  return player?.username && String(player.username).trim()
    ? String(player.username).trim()
    : "Unnamed Lumorian";
}

function buildPartyText(player, displayName = "Lumorian") {
  ensureParty(player);
  const owned = getOwned(player);
  const party = getParty(player);

  const lines = [];

  for (let i = 0; i < 5; i++) {
    const ownedIdx = party[i];

    if (ownedIdx === null || ownedIdx === undefined || !owned[ownedIdx]) {
      lines.push(
        `${i + 1}️⃣ *Empty Slot*\n` +
        `🌫 No Mora assigned here yet.`
      );
      continue;
    }

    const m = owned[ownedIdx];
    const lv = m.level || 1;
    const hp = m.hp ?? 0;
    const maxHp = m.maxHp ?? 0;
    const type = m.type || "—";
    const rarity = m.rarity || "—";

    lines.push(
      `${i + 1}️⃣ *${m.name}*  ⚔️\n` +
      `🆔 ID_${m.moraId}\n` +
      `📈 Lv ${lv} • ❤️ ${hp}/${maxHp}\n` +
      `⚡ ${type} • 💠 ${rarity}`
    );
  }

  return (
    `${DIVIDER}\n` +
    `🌟 *ACTIVE MORA PARTY* 🌟\n` +
    `${DIVIDER}\n\n` +
    `👤 *${displayName}*\n` +
    `🛡 Party Capacity: *5 Slots*\n\n` +
    lines.join(`\n\n${SMALL_DIVIDER}\n\n`) +
    `\n\n${DIVIDER}\n` +
    `🧭 Commands:\n` +
    `• \`.t2party <tamedIndex> [more indexes]\`\n` +
    `• \`.t2tamed <partySlot>\``
  );
}

async function cmdParty(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  ensureParty(player);
  savePlayers(players);

  return sock.sendMessage(
    chatId,
    { text: buildPartyText(player, getUsername(player)) },
    { quoted: msg }
  );
}

async function cmdT2Party(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  ensureParty(player);

  if (!args.length) {
    return sock.sendMessage(
      chatId,
      { text: "Usage: `.t2party <tamedIndex> [tamedIndex2] [tamedIndex3] ...`" },
      { quoted: msg }
    );
  }

  const owned = getOwned(player);
  if (!owned.length) {
    return sock.sendMessage(chatId, { text: "❌ You do not own any Mora." }, { quoted: msg });
  }

  const moved = [];
  const failed = [];

  for (const raw of args) {
    if (!/^\d+$/.test(String(raw))) {
      failed.push(`${raw} (not a number)`);
      continue;
    }

    const shownIndex = Number(raw);
    const ownedIdx = shownIndex - 1;

    if (!isValidOwnedIndex(player, ownedIdx)) {
      failed.push(`${shownIndex} (not found)`);
      continue;
    }

    if (isIndexAlreadyInParty(player, ownedIdx)) {
      failed.push(`${shownIndex} (already in party)`);
      continue;
    }

    const emptySlot = firstEmptyPartySlot(player);
    if (emptySlot === -1) {
      failed.push(`${shownIndex} (party full)`);
      continue;
    }

    player.party[emptySlot] = ownedIdx;
    moved.push(`*${owned[ownedIdx].name}* → slot ${emptySlot + 1}`);
  }

  ensureParty(player);
  savePlayers(players);

  const parts = [];

  if (moved.length) {
    parts.push(`✅ *Moved to Party*\n${moved.map((x) => `• ${x}`).join("\n")}`);
  }

  if (failed.length) {
    parts.push(`⚠️ *Could Not Move*\n${failed.map((x) => `• ${x}`).join("\n")}`);
  }

  parts.push(`\n${buildPartyText(player, getUsername(player))}`);

  return sock.sendMessage(
    chatId,
    { text: parts.join("\n\n") || "Nothing changed." },
    { quoted: msg }
  );
}

async function cmdT2Tamed(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  ensureParty(player);

  const raw = String(args[0] || "").trim();
  if (!/^\d+$/.test(raw)) {
    return sock.sendMessage(chatId, { text: "Usage: `.t2tamed <partySlot>`" }, { quoted: msg });
  }

  const slot = clamp(Number(raw), 1, 5) - 1;
  const owned = getOwned(player);
  const ownedIdx = player.party[slot];

  if (ownedIdx === null || ownedIdx === undefined || !owned[ownedIdx]) {
    return sock.sendMessage(chatId, { text: "❌ That party slot is already empty." }, { quoted: msg });
  }

  const moraName = owned[ownedIdx].name;
  player.party[slot] = null;

  ensureParty(player);
  savePlayers(players);

  return sock.sendMessage(
    chatId,
    {
      text:
        `✅ *${moraName}* moved back to tamed list.\n` +
        `🪑 Party slot ${slot + 1} is now empty.\n\n` +
        buildPartyText(player, getUsername(player))
    },
    { quoted: msg }
  );
}

module.exports = {
  cmdParty,
  cmdT2Party,
  cmdT2Tamed,
  ensureParty,
  getParty,
};
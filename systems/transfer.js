// systems/transfer.js
function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function findOwned(owned, queryRaw) {
  const q = String(queryRaw || "").trim();
  if (!q) return null;

  // number: list index OR moraId
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    if (n >= 1 && n <= owned.length) return { mora: owned[n - 1], index: n - 1 };
    const byId = owned.findIndex((m) => Number(m.moraId) === n);
    if (byId >= 0) return { mora: owned[byId], index: byId };
  }

  // name
  const byName = owned.findIndex((m) => norm(m.name) === norm(q));
  if (byName >= 0) return { mora: owned[byName], index: byName };

  return null;
}

async function cmdTamedGive(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const { getMentionedJids, getRepliedJid, toUserJidFromArg, normJid } = helpers;

  if (!players[senderId]) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });

  const mentioned = getMentionedJids(msg).map(normJid);
  const replied = getRepliedJid(msg);
  const argJid = toUserJidFromArg(args[0]);

  const target = normJid(mentioned[0] || replied || argJid || "");
  const pick = mentioned[0] || replied ? args[0] : args[1]; // if mention/reply, id is first arg; else second

  if (!target || !pick) {
    return sock.sendMessage(chatId, {
      text: "Use:\n• .tamed-give @user 2\n• Reply then .tamed-give 2\n• .tamed-give 2637xxxxxxx 2",
    });
  }

  if (!players[target]) return sock.sendMessage(chatId, { text: "❌ That user is not registered in Lumora yet." });

  const senderOwned = Array.isArray(players[senderId].moraOwned) ? players[senderId].moraOwned : [];
  if (!senderOwned.length) return sock.sendMessage(chatId, { text: "😔 You don’t own any Mora yet." });

  const found = findOwned(senderOwned, pick);
  if (!found) return sock.sendMessage(chatId, { text: "❌ Mora not found in your tamed list." });

  // remove from sender, add to target (keep stats/moves/xp/hp as-is)
  const moraObj = found.mora;
  senderOwned.splice(found.index, 1);

  if (!Array.isArray(players[target].moraOwned)) players[target].moraOwned = [];
  players[target].moraOwned.push(moraObj);

  savePlayers(players);

  return sock.sendMessage(chatId, {
    text: `✅ Transferred *${moraObj.name}* (ID_${moraObj.moraId}) to that player.`,
    mentions: [target],
  });
}

module.exports = { cmdTamedGive };
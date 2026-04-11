const itemsSystem = require("./items");

const DIVIDER = "━━━━━━━━━━━━━━━━━━";

function normalizeJid(jid = "") {
  return String(jid || "").split(":")[0];
}

async function cmdGiveItem(ctx, chatId, senderId, msg, args = [], helpers = {}) {
  const { sock, players, savePlayers, mentionTag } = ctx;
  const {
    getMentionedJids = () => [],
    getRepliedJid = () => null,
    toUserJidFromArg = () => null,
  } = helpers;

  const sender = players[senderId];
  if (!sender) {
    return sock.sendMessage(
      chatId,
      { text: "❌ Register first using `.start`." },
      { quoted: msg }
    );
  }

  itemsSystem.ensurePlayerItemData(sender);

  const mentioned = getMentionedJids(msg);
  const replied = getRepliedJid(msg);
  const targetJid = normalizeJid(mentioned[0] || replied || toUserJidFromArg(args[args.length - 1]));

  if (!targetJid) {
    return sock.sendMessage(
      chatId,
      { text: "Usage: `.gitem <item name or id> <qty> @user`" },
      { quoted: msg }
    );
  }

  if (targetJid === senderId) {
    return sock.sendMessage(
      chatId,
      { text: "❌ You cannot give items to yourself." },
      { quoted: msg }
    );
  }

  const receiver = players[targetJid];
  if (!receiver) {
    return sock.sendMessage(
      chatId,
      { text: "❌ That player is not registered." },
      { quoted: msg }
    );
  }

  itemsSystem.ensurePlayerItemData(receiver);

  const raw = args.join(" ").trim();
  const qtyMatch = raw.match(/\s(\d+)\s+@/) || raw.match(/\s(\d+)\s*$/);
  const qty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;

  let itemQuery = raw;

  itemQuery = itemQuery.replace(/@\d+/g, "").trim();
  itemQuery = itemQuery.replace(/\b\d+\b\s*$/, "").trim();

  if (!itemQuery) {
    return sock.sendMessage(
      chatId,
      { text: "❌ Please specify an item name or id." },
      { quoted: msg }
    );
  }

  const item = itemsSystem.findItem(itemQuery);
  if (!item) {
    return sock.sendMessage(
      chatId,
      { text: `❌ Item not found: *${itemQuery}*` },
      { quoted: msg }
    );
  }

  const senderQty = itemsSystem.getItemQuantity(sender, item.id);
  if (senderQty < qty) {
    return sock.sendMessage(
      chatId,
      { text: `❌ You only have *${senderQty}* of *${item.name}*.` },
      { quoted: msg }
    );
  }

  const canAdd = itemsSystem.canAddItemToInventory(receiver, item.id, qty);
  if (!canAdd.ok) {
    return sock.sendMessage(
      chatId,
      { text: `❌ Receiver cannot hold this item.\n${canAdd.reason}` },
      { quoted: msg }
    );
  }

  const removed = itemsSystem.removeItem(sender, item.id, qty);
  if (!removed.ok) {
    return sock.sendMessage(
      chatId,
      { text: `❌ ${removed.reason}` },
      { quoted: msg }
    );
  }

  const added = itemsSystem.addItem(receiver, item.id, qty);
  if (!added.ok) {
    // rollback
    itemsSystem.addItem(sender, item.id, qty);
    return sock.sendMessage(
      chatId,
      { text: `❌ Transfer failed.\n${added.reason}` },
      { quoted: msg }
    );
  }

  savePlayers(players);

  const rarityIcon = itemsSystem.getRarityIcon(item.rarity);
  const baseText =
    `${DIVIDER}\n` +
    `🎁 *ITEM TRANSFERRED*\n` +
    `${DIVIDER}\n\n` +
    `${rarityIcon} *${item.name}* x${qty}\n` +
    `⚡ ${item.effect || "No effect"}\n` +
    `📜 ${item.desc || "No description."}`;

  if (typeof mentionTag === "function") {
    return mentionTag(
      sock,
      chatId,
      targetJid,
      `${baseText}\n\n✅ Sent to {mention}`,
      msg
    );
  }

  return sock.sendMessage(
    chatId,
    { text: `${baseText}\n\n✅ Sent successfully.` },
    { quoted: msg }
  );
}

module.exports = {
  cmdGiveItem,
};
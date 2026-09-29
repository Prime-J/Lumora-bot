const itemsSystem = require("./items");

// ============================
// UI
// ============================
const DIVIDER = "━━━━━━━━━━━━━━━━━━";
const SMALL_DIVIDER = "──────────────────";

function titleCase(str = "") {
  return String(str)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function slotView(itemId, itemsDb, player, slot) {
  if (!itemId) {
    return `Nothing equipped`;
  }

  const item = itemsDb[itemId];
  if (!item) {
    return `Unknown item equipped`;
  }

  const lumen = player?.equipment?.[`${slot}Durability`];
  const lumenMax =
    item.durability ?? itemsSystem.BASE_DURABILITY_BY_RARITY[item.rarity] ?? 3;

  const opts = typeof lumen === "number" ? { lumen, lumenMax } : {};
  return itemsSystem.formatGearDetails(item, opts);
}

function buildGearText(player, displayName = "Lumorian") {
  itemsSystem.ensurePlayerItemData(player);

  const itemsDb = itemsSystem.loadItems();
  const eq = player.equipment || {};

  const sections = [
    `⚙ *Core*\n${slotView(eq.core, itemsDb, player, "core")}`,
    `🔮 *Charm*\n${slotView(eq.charm, itemsDb, player, "charm")}`,
    `🧰 *Tool*\n${slotView(eq.tool, itemsDb, player, "tool")}`,
    `🜂 *Relic*\n${slotView(eq.relic, itemsDb, player, "relic")}`,
    `🜁 *Cloak*\n${slotView(eq.cloak, itemsDb, player, "cloak")}`,
    `👢 *Boots*\n${slotView(eq.boots, itemsDb, player, "boots")}`,
    `🎖 *Badge*\n${slotView(eq.badge, itemsDb, player, "badge")}`,
  ];

  return (
    `${DIVIDER}\n` +
    `🛡 *LUMORA GEAR*\n` +
    `${DIVIDER}\n\n` +
    `👤 ${displayName}\n\n` +
    sections.join(`\n\n${SMALL_DIVIDER}\n\n`) +
    `\n\n${DIVIDER}\n` +
    `🧭 Use:\n` +
    `\`.equip <item name or id>\`\n` +
    `\`.unequip <slot>\`\n`
  );
}

// ============================
// COMMANDS
// ============================
async function cmdGear(ctx, chatId, senderId, msg, args = [], helpers = {}) {
  const { sock, players, isOwner, mentionTag } = ctx;
  const {
    getMentionedJids = () => [],
    getRepliedJid = () => null,
    toUserJidFromArg = () => null,
    normJid = (x) => x,
  } = helpers;

  let targetId = senderId;

  // owner can inspect others
  if (isOwner) {
    const mentioned = getMentionedJids(msg);
    const replied = getRepliedJid(msg);
    const argJid = toUserJidFromArg(args[0]);
    targetId = normJid(mentioned[0] || replied || argJid || senderId);
  }

  const player = players[targetId];
  if (!player) {
    return sock.sendMessage(
      chatId,
      { text: "❌ That player is not registered." },
      { quoted: msg }
    );
  }

  const username =
    player.username && String(player.username).trim()
      ? String(player.username).trim()
      : "Unnamed Lumorian";

  const text = buildGearText(player, username);

  if (typeof mentionTag === "function") {
    return mentionTag(sock, chatId, targetId, `${text}\n\n🧾 Viewing gear of {mention}`, msg);
  }

  return sock.sendMessage(
    chatId,
    { text },
    { quoted: msg }
  );
}

// 🛡 .equip — a thin wrapper over the shared action layer.
// Equipping rules live in systems/lumoraActions.js → equip(), so the typed
// command and a card tap run the same validation.
async function cmdEquip(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const lumoraActions = require("./lumoraActions");

  const result = await lumoraActions.equip(
    { playerId: senderId, chatId, source: "command", runtime: { players, savePlayers } },
    { item: args.join(" ").trim() },
  );

  return sock.sendMessage(
    chatId,
    { text: result.message || (result.ok ? "✅ Item equipped." : "❌ Equip failed.") },
    { quoted: msg }
  );
}

// 📤 .unequip — a thin wrapper over the shared action layer.
async function cmdUnequip(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const lumoraActions = require("./lumoraActions");

  const result = await lumoraActions.unequip(
    { playerId: senderId, chatId, source: "command", runtime: { players, savePlayers } },
    { slot: String(args[0] || "").trim().toLowerCase() },
  );

  return sock.sendMessage(
    chatId,
    { text: result.message || (result.ok ? "✅ Item unequipped." : "❌ Unequip failed.") },
    { quoted: msg }
  );
}

// ============================
// ERADICATE (permanently destroy a gear item)
// ============================
async function cmdEradicate(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) {
    return sock.sendMessage(
      chatId,
      { text: "❌ Register first using `.register`." },
      { quoted: msg }
    );
  }

  const query = args.join(" ").trim();
  if (!query) {
    return sock.sendMessage(
      chatId,
      {
        text:
          `${DIVIDER}\n` +
          `💥 *ERADICATE GEAR*\n` +
          `${DIVIDER}\n\n` +
          `Permanently destroy a gear item. This cannot be undone!\n\n` +
          `Usage:\n` +
          `• \`.eradicate <item name>\`\n` +
          `• \`.eradicate <slot>\` — destroys the item equipped in that slot\n\n` +
          `Slots: core, charm, tool, relic, cloak, boots, badge`,
      },
      { quoted: msg }
    );
  }

  itemsSystem.ensurePlayerItemData(player);

  const validSlots = ["core", "charm", "tool", "relic", "cloak", "boots", "badge"];
  const slotQuery = query.toLowerCase();

  // Case 1: query is a slot name → destroy the equipped item in that slot
  if (validSlots.includes(slotQuery)) {
    const equippedId = player.equipment?.[slotQuery];
    if (!equippedId) {
      return sock.sendMessage(
        chatId,
        { text: `❌ Nothing equipped in *${titleCase(slotQuery)}* slot.` },
        { quoted: msg }
      );
    }
    const item = itemsSystem.getItemById(equippedId);
    player.equipment[slotQuery] = null;
    delete player.equipment[`${slotQuery}Durability`];
    savePlayers(players);
    return sock.sendMessage(
      chatId,
      {
        text:
          `${DIVIDER}\n` +
          `💥 *GEAR ERADICATED*\n` +
          `${DIVIDER}\n\n` +
          `🔥 *${item?.name || equippedId}* has been destroyed from your *${titleCase(slotQuery)}* slot.\n` +
          `The gear is gone forever.`,
      },
      { quoted: msg }
    );
  }

  // Case 2: query is an item name/id → destroy from inventory or equipped slot
  const item = itemsSystem.findItem(query);
  if (!item) {
    return sock.sendMessage(
      chatId,
      { text: `❌ Item not found: *${query}*` },
      { quoted: msg }
    );
  }

  if (!itemsSystem.isEquippable(item)) {
    return sock.sendMessage(
      chatId,
      { text: `❌ *${item.name}* isn't gear. Only gear can be eradicated.` },
      { quoted: msg }
    );
  }

  // Check inventory first
  const invQty = itemsSystem.getItemQuantity(player, item.id);
  if (invQty > 0) {
    itemsSystem.removeItem(player, item.id, 1);
    savePlayers(players);
    return sock.sendMessage(
      chatId,
      {
        text:
          `${DIVIDER}\n` +
          `💥 *GEAR ERADICATED*\n` +
          `${DIVIDER}\n\n` +
          `🔥 *${item.name}* has been destroyed from your inventory.\n` +
          `The gear is gone forever.`,
      },
      { quoted: msg }
    );
  }

  // Check if equipped
  const eq = player.equipment || {};
  let equippedSlot = null;
  for (const s of validSlots) {
    if (eq[s] === item.id) {
      equippedSlot = s;
      break;
    }
  }

  if (equippedSlot) {
    player.equipment[equippedSlot] = null;
    delete player.equipment[`${equippedSlot}Durability`];
    savePlayers(players);
    return sock.sendMessage(
      chatId,
      {
        text:
          `${DIVIDER}\n` +
          `💥 *GEAR ERADICATED*\n` +
          `${DIVIDER}\n\n` +
          `🔥 *${item.name}* has been destroyed from your *${titleCase(equippedSlot)}* slot.\n` +
          `The gear is gone forever.`,
      },
      { quoted: msg }
    );
  }

  return sock.sendMessage(
    chatId,
    { text: `❌ You don't have *${item.name}* in your inventory or equipped.` },
    { quoted: msg }
  );
}

module.exports = {
  cmdGear,
  cmdEquip,
  cmdUnequip,
  cmdEradicate,
};
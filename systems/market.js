const itemsSystem = require("./items");

// ============================
// UI
// ============================
const DIVIDER = "━━━━━━━━━━━━━━━━━━";
const SMALL_DIVIDER = "──────────────────";

function randInt(min, max) {
  const a = Number(min);
  const b = Number(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function pickRandom(arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

function normalizeName(str = "") {
  return String(str || "").trim().toLowerCase();
}

function getStockForItem(item, marketCfg) {
  const rules = marketCfg?.stockRules || {};
  const rarityRule = rules[item.rarity] || null;

  if (!rarityRule) {
    return Number(item.stock || 1);
  }

  const min = Number(rarityRule.min || 1);
  const max = Number(rarityRule.max || min);
  return randInt(min, max);
}

function isLimitedStock(item, stock) {
  if (item.rarity === "Rare" || item.rarity === "Epic" || item.rarity === "Legendary" || item.rarity === "Mythic") {
    return true;
  }
  return Number(stock) <= 3;
}

function buildRotationFromPools(itemsDb, marketCfg) {
  const poolCfg = marketCfg.rotationPoolSizes || {};

  const normalIds = marketCfg?.forcedRotationPools?.normal || [];
  const blackIds = marketCfg?.forcedRotationPools?.black || [];

  const normalPool = normalIds.map((id) => itemsDb[id]).filter(Boolean);
  const blackPool = blackIds.map((id) => itemsDb[id]).filter(Boolean);

  const normalGear = normalPool.filter((x) => x.category === "gear");
  const normalItems = normalPool.filter((x) =>
    ["consumable", "hunting", "access"].includes(x.category)
  );
  const materials = normalPool.filter((x) => x.category === "material");
  const specials = normalPool.filter((x) => x.category === "special");

  const visibleTarget = randInt(
    Number(poolCfg.minVisibleItems || 5),
    Number(poolCfg.maxVisibleItems || 8)
  );

  const chosen = [];

  chosen.push(
    ...pickRandom(
      normalGear,
      randInt(Number(poolCfg.normalGearMin || 1), Number(poolCfg.normalGearMax || 2))
    )
  );

  chosen.push(
    ...pickRandom(
      normalItems,
      randInt(Number(poolCfg.normalItemsMin || 2), Number(poolCfg.normalItemsMax || 3))
    )
  );

  chosen.push(
    ...pickRandom(
      materials,
      randInt(Number(poolCfg.materialMin || 0), Number(poolCfg.materialMax || 1))
    )
  );

  chosen.push(
    ...pickRandom(
      specials,
      randInt(Number(poolCfg.specialMin || 0), Number(poolCfg.specialMax || 1))
    )
  );

  chosen.push(
    ...pickRandom(
      blackPool,
      randInt(Number(poolCfg.blackMarketMin || 0), Number(poolCfg.blackMarketMax || 1))
    )
  );

  const unique = [];
  const seen = new Set();

  for (const item of chosen) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  const allPool = [...normalPool, ...blackPool].filter((x) => x && !seen.has(x.id));
  while (unique.length < visibleTarget && allPool.length) {
    const next = allPool.splice(Math.floor(Math.random() * allPool.length), 1)[0];
    if (!next) continue;
    seen.add(next.id);
    unique.push(next);
  }

  const priceMods = marketCfg.priceModifiers || {};
  const normalMult = Number(priceMods.normalMultiplier || 1);
  const blackMult = Number(priceMods.blackMarketMultiplier || 1.15);
  const limitedBonus = Number(priceMods.limitedStockBonusMultiplier || 1.1);
  const rareBonus = Number(priceMods.rareItemBonusMultiplier || 1.05);

  const finalItems = unique.map((item) => {
    const stock = getStockForItem(item, marketCfg);
    const limited = isLimitedStock(item, stock);

    let price = Number(item.price || 0);
    price *= item.marketType === "black" ? blackMult : normalMult;
    if (limited) price *= limitedBonus;
    if (itemsSystem.isRareOrHigher(item.rarity)) price *= rareBonus;

    return {
      itemId: item.id,
      price: Math.max(1, Math.round(price)),
      stock,
      limited,
      sold: 0,
    };
  });

  const normalSpeeches = Array.isArray(marketCfg.rotationSpeeches) ? marketCfg.rotationSpeeches : [];
  const blackSpeeches = Array.isArray(marketCfg.blackMarketSpeeches) ? marketCfg.blackMarketSpeeches : [];

  const hasBlack = finalItems.some((x) => {
    const item = itemsDb[x.itemId];
    return item && item.marketType === "black";
  });

  const speechPool =
    hasBlack && blackSpeeches.length
      ? [...normalSpeeches, ...blackSpeeches]
      : normalSpeeches;

  const speechUsed = speechPool.length
    ? speechPool[Math.floor(Math.random() * speechPool.length)]
    : "🏪 MARKET ROTATION\n\nUse .market to see what is available.";

  const hasRareHighlight = finalItems.some((x) => {
    const item = itemsDb[x.itemId];
    return item && itemsSystem.isRareOrHigher(item.rarity);
  });

  return {
    rotationId: Number(marketCfg?.currentRotation?.rotationId || 0) + 1,
    speechUsed,
    hasRareHighlight,
    items: finalItems,
  };
}

function maybeRotateMarket() {
  const market = itemsSystem.loadMarket();
  const itemsDb = itemsSystem.loadItems();
  const now = Date.now();

  if (!market.enabled) {
    return { rotated: false, market };
  }

  const nextRotationAt = Number(market.nextRotationAt || 0);
  if (nextRotationAt && now < nextRotationAt && Array.isArray(market?.currentRotation?.items)) {
    return { rotated: false, market };
  }

  const rotation = buildRotationFromPools(itemsDb, market);
  const intervalMs = Number(market.rotationIntervalMinutes || 60) * 60 * 1000;

  market.lastRotationAt = now;
  market.nextRotationAt = now + intervalMs;
  market.currentRotation = rotation;

  itemsSystem.saveMarket(market);
  return { rotated: true, market };
}

function formatMarketText(market) {
  const itemsDb = itemsSystem.loadItems();
  const ui = market.marketUi || {};
  const header = ui.header || `${DIVIDER}\n🏪 *LUMORA MARKET*\n${DIVIDER}`;
  const footer =
    ui.footer ||
    `${DIVIDER}\n🛒 Use: \`.buy <item name or id>\`\n🔔 Use \`.subscribe-market\``;
  const rareBanner = ui.rareBannerText || "🌟 *RARE ITEM AVAILABLE* 🌟";

  const rotation = market.currentRotation || { items: [] };
  const entries = Array.isArray(rotation.items) ? rotation.items : [];

  if (!entries.length) {
    return (
      `${header}\n\n` +
      `The stalls are quiet right now.\n` +
      `Try again after the next rotation.\n\n` +
      `${footer}`
    );
  }

  const blocks = [];

  for (const entry of entries) {
    const item = itemsDb[entry.itemId];
    if (!item) continue;

    const merged = {
      ...item,
      marketPrice: Number(entry.price ?? item.price ?? 0),
      marketStock: Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0)),
      limited: !!entry.limited,
    };

    const lines = [];
    if (itemsSystem.isRareOrHigher(item.rarity)) {
      lines.push(rareBanner);
      lines.push("");
    }

    lines.push(itemsSystem.formatItemLine(merged));

    if (merged.marketStock <= 0) {
      lines.push("❌ *SOLD OUT*");
    } else if (merged.limited) {
      lines.push("⏳ Limited stock");
    }

    blocks.push(lines.join("\n"));
  }

  return `${header}\n\n${blocks.join(`\n\n${SMALL_DIVIDER}\n\n`)}\n\n${footer}`;
}

function getRotationEntryByQuery(query, market, itemsDb) {
  const q = normalizeName(query);
  const entries = Array.isArray(market?.currentRotation?.items) ? market.currentRotation.items : [];

  for (const entry of entries) {
    const item = itemsDb[entry.itemId];
    if (!item) continue;

    if (normalizeName(item.id) === q) return { entry, item };
    if (normalizeName(item.name) === q) return { entry, item };
  }

  return null;
}

function parseOwnerQueryAndNumbers(args = []) {
  const cleanArgs = [...args];
  let stock = null;
  let price = null;

  if (cleanArgs.length && /^\d+$/.test(cleanArgs[cleanArgs.length - 1])) {
    stock = Number(cleanArgs.pop());
  }
  if (cleanArgs.length && /^\d+$/.test(cleanArgs[cleanArgs.length - 1])) {
    price = Number(cleanArgs.pop());
  }

  const query = cleanArgs.join(" ").trim();
  return { query, price, stock };
}

function buildOwnerMarketItemsText(market) {
  const itemsDb = itemsSystem.loadItems();
  const entries = Array.isArray(market?.currentRotation?.items) ? market.currentRotation.items : [];

  if (!entries.length) {
    return `🏪 *MARKET ROTATION ITEMS*\n\nNo active market items.`;
  }

  const lines = entries.map((entry, i) => {
    const item = itemsDb[entry.itemId];
    const name = item?.name || entry.itemId;
    const left = Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0));
    return (
      `${i + 1}. *${name}*\n` +
      `🆔 ${entry.itemId}\n` +
      `💰 Price: ${entry.price}\n` +
      `📦 Stock: ${entry.stock}\n` +
      `🛒 Sold: ${entry.sold || 0}\n` +
      `📉 Left: ${left}`
    );
  });

  return `🏪 *MARKET ROTATION ITEMS*\n\n${lines.join(`\n\n${SMALL_DIVIDER}\n\n`)}`;
}

async function cmdMarket(ctx, chatId, senderId, msg) {
  const { sock } = ctx;

  const { market } = maybeRotateMarket();
  const text = formatMarketText(market);

  return sock.sendMessage(chatId, { text }, { quoted: msg });
}

async function cmdBuy(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;

  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(
      chatId,
      { text: "❌ Register first using `.start`." },
      { quoted: msg }
    );
  }

  const query = args.join(" ").trim();
  if (!query) {
    return sock.sendMessage(
      chatId,
      { text: "Usage: `.buy <item name or id>`" },
      { quoted: msg }
    );
  }

  const { market } = maybeRotateMarket();
  const itemsDb = itemsSystem.loadItems();
  const found = getRotationEntryByQuery(query, market, itemsDb);

  if (!found) {
    return sock.sendMessage(
      chatId,
      { text: `❌ That item is not currently in the market.` },
      { quoted: msg }
    );
  }

  const { entry, item } = found;

  const remaining = Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0));
  if (remaining <= 0) {
    return sock.sendMessage(
      chatId,
      { text: `❌ *${item.name}* is sold out.` },
      { quoted: msg }
    );
  }

  const price = Number(entry.price ?? item.price ?? 0);
  const money = Number(player.lucons || 0);

  if (money < price) {
    return sock.sendMessage(
      chatId,
      { text: `❌ You need *${price} Lucons* but only have *${money}*.` },
      { quoted: msg }
    );
  }

  const canAdd = itemsSystem.canAddItemToInventory(player, item.id, 1);
  if (!canAdd.ok) {
    return sock.sendMessage(
      chatId,
      { text: `❌ ${canAdd.reason}` },
      { quoted: msg }
    );
  }

  const added = itemsSystem.addItem(player, item.id, 1);
  if (!added.ok) {
    return sock.sendMessage(
      chatId,
      { text: `❌ ${added.reason}` },
      { quoted: msg }
    );
  }

  player.lucons = Math.max(0, money - price);
  entry.sold = Number(entry.sold || 0) + 1;

  savePlayers(players);
  itemsSystem.saveMarket(market);

  const left = Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0));
  const rarityIcon = itemsSystem.getRarityIcon(item.rarity);

  return sock.sendMessage(
    chatId,
    {
      text:
        `${DIVIDER}\n` +
        `🛒 *PURCHASE COMPLETE*\n` +
        `${DIVIDER}\n\n` +
        `${rarityIcon} *${item.name}*\n` +
        `💰 Price: *${price} Lucons*\n` +
        `📦 Remaining Stock: *${left}*\n` +
        `⚡ Effect: ${item.effect || "None"}\n` +
        `📜 ${item.desc || "No description."}\n\n` +
        `💳 Lucons Left: *${player.lucons}*`,
    },
    { quoted: msg }
  );
}

async function cmdSubscribeMarket(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const subs = itemsSystem.loadSubscribers();

  if (!subs.enabled) {
    return sock.sendMessage(
      chatId,
      { text: "❌ Market alerts are currently disabled." },
      { quoted: msg }
    );
  }

  const isGroup = String(chatId).endsWith("@g.us");

  if (isGroup) {
    if (!subs.groups || typeof subs.groups !== "object") subs.groups = {};
    subs.groups[chatId] = {
      name: "Group",
      subscribedAt: Date.now(),
      type: "group",
      mode: "market",
    };
  } else {
    if (!subs.users || typeof subs.users !== "object") subs.users = {};
    subs.users[senderId] = {
      name: "User",
      subscribedAt: Date.now(),
      type: "user",
      mode: "market",
    };
  }

  itemsSystem.saveSubscribers(subs);

  return sock.sendMessage(
    chatId,
    {
      text:
        `🔔 *MARKET ALERTS ENABLED*\n\n` +
        `You will now receive market rotation alerts here.`,
    },
    { quoted: msg }
  );
}

async function cmdUnsubscribeMarket(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const subs = itemsSystem.loadSubscribers();
  const isGroup = String(chatId).endsWith("@g.us");

  if (isGroup) {
    if (subs.groups && subs.groups[chatId]) {
      delete subs.groups[chatId];
    }
  } else {
    if (subs.users && subs.users[senderId]) {
      delete subs.users[senderId];
    }
  }

  itemsSystem.saveSubscribers(subs);

  return sock.sendMessage(
    chatId,
    {
      text:
        `🔕 *MARKET ALERTS DISABLED*\n\n` +
        `This chat will no longer receive market rotation alerts.`,
    },
    { quoted: msg }
  );
}

async function cmdOwnerMarketMenu(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text:
      `🏪 *MARKET OWNER MENU*\n\n` +
      `\`.market-items\`\n` +
      `\`.market-refresh\`\n` +
      `\`.market-add <item name or id> <price> <stock>\`\n` +
      `\`.market-remove <item name or id>\`\n` +
      `\`.market-set <item name or id> <price> <stock>\``,
  }, { quoted: msg });
}

async function cmdMarketItems(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  const { market } = maybeRotateMarket();
  return sock.sendMessage(chatId, { text: buildOwnerMarketItemsText(market) }, { quoted: msg });
}

async function cmdMarketRefresh(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  const market = itemsSystem.loadMarket();
  market.nextRotationAt = 0;
  itemsSystem.saveMarket(market);

  const { market: rotatedMarket } = maybeRotateMarket();
  return sock.sendMessage(chatId, {
    text:
      `✅ *MARKET REFRESHED*\n\n` +
      `Rotation ID: *${rotatedMarket?.currentRotation?.rotationId || 0}*`,
  }, { quoted: msg });
}

async function cmdMarketAdd(ctx, chatId, senderId, msg, args = []) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  const { query, price, stock } = parseOwnerQueryAndNumbers(args);
  if (!query || !Number.isFinite(price) || !Number.isFinite(stock)) {
    return sock.sendMessage(chatId, {
      text: "Usage: `.market-add <item name or id> <price> <stock>`",
    }, { quoted: msg });
  }

  const item = itemsSystem.findItem(query);
  if (!item) {
    return sock.sendMessage(chatId, { text: `❌ Item not found: *${query}*` }, { quoted: msg });
  }

  const market = itemsSystem.loadMarket();
  if (!market.currentRotation || !Array.isArray(market.currentRotation.items)) {
    market.currentRotation = { rotationId: 1, items: [] };
  }

  const exists = market.currentRotation.items.find((x) => x.itemId === item.id);
  if (exists) {
    return sock.sendMessage(chatId, {
      text: `❌ *${item.name}* is already in the current market. Use \`.market-set\`.`,
    }, { quoted: msg });
  }

  market.currentRotation.items.push({
    itemId: item.id,
    price: Math.max(1, Number(price)),
    stock: Math.max(0, Number(stock)),
    limited: isLimitedStock(item, stock),
    sold: 0,
  });

  itemsSystem.saveMarket(market);

  return sock.sendMessage(chatId, {
    text:
      `✅ *ITEM ADDED TO MARKET*\n\n` +
      `📦 ${item.name}\n` +
      `💰 Price: ${Math.max(1, Number(price))}\n` +
      `📦 Stock: ${Math.max(0, Number(stock))}`,
  }, { quoted: msg });
}

async function cmdMarketRemove(ctx, chatId, senderId, msg, args = []) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  const query = args.join(" ").trim();
  if (!query) {
    return sock.sendMessage(chatId, {
      text: "Usage: `.market-remove <item name or id>`",
    }, { quoted: msg });
  }

  const market = itemsSystem.loadMarket();
  const itemsDb = itemsSystem.loadItems();
  const found = getRotationEntryByQuery(query, market, itemsDb);

  if (!found) {
    return sock.sendMessage(chatId, {
      text: "❌ That item is not in the current market.",
    }, { quoted: msg });
  }

  market.currentRotation.items = market.currentRotation.items.filter((x) => x.itemId !== found.item.id);
  itemsSystem.saveMarket(market);

  return sock.sendMessage(chatId, {
    text: `✅ Removed *${found.item.name}* from the current market.`,
  }, { quoted: msg });
}

async function cmdMarketSet(ctx, chatId, senderId, msg, args = []) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Owner-only command." }, { quoted: msg });
  }

  const { query, price, stock } = parseOwnerQueryAndNumbers(args);
  if (!query || !Number.isFinite(price) || !Number.isFinite(stock)) {
    return sock.sendMessage(chatId, {
      text: "Usage: `.market-set <item name or id> <price> <stock>`",
    }, { quoted: msg });
  }

  const market = itemsSystem.loadMarket();
  const itemsDb = itemsSystem.loadItems();
  const found = getRotationEntryByQuery(query, market, itemsDb);

  if (!found) {
    return sock.sendMessage(chatId, {
      text: "❌ That item is not in the current market. Use `.market-add` first.",
    }, { quoted: msg });
  }

  found.entry.price = Math.max(1, Number(price));
  found.entry.stock = Math.max(0, Number(stock));
  found.entry.limited = isLimitedStock(found.item, found.entry.stock);
  if (found.entry.sold > found.entry.stock) {
    found.entry.sold = found.entry.stock;
  }

  itemsSystem.saveMarket(market);

  return sock.sendMessage(chatId, {
    text:
      `✅ *MARKET ITEM UPDATED*\n\n` +
      `📦 ${found.item.name}\n` +
      `💰 Price: ${found.entry.price}\n` +
      `📦 Stock: ${found.entry.stock}\n` +
      `🛒 Sold: ${found.entry.sold || 0}`,
  }, { quoted: msg });
}

module.exports = {
  maybeRotateMarket,
  cmdMarket,
  cmdBuy,
  cmdSubscribeMarket,
  cmdUnsubscribeMarket,
  cmdOwnerMarketMenu,
  cmdMarketItems,
  cmdMarketRefresh,
  cmdMarketAdd,
  cmdMarketRemove,
  cmdMarketSet,
};
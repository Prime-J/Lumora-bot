const fs = require("fs");
const path = require("path");

// ============================
// PATHS
// ============================
const DATA_DIR = path.join(__dirname, "..", "data");
const ITEMS_FILE = path.join(DATA_DIR, "items.json");
const MARKET_FILE = path.join(DATA_DIR, "market.json");
const FACTION_MARKET_FILE = path.join(DATA_DIR, "factionMarket.json");
const SUBSCRIBERS_FILE = path.join(DATA_DIR, "subscribers.json");

// ============================
// BASIC FILE HELPERS
// ============================
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath, defaultValue) {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

function loadJSON(filePath, defaultValue) {
  ensureFile(filePath, defaultValue);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (err) {
    console.log(`[items.js] loadJSON error for ${filePath}:`, err?.message || err);
    return defaultValue;
  }
}

function saveJSON(filePath, data) {
  ensureFile(filePath, {});
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ============================
// LOADERS
// ============================
function loadItems() {
  return loadJSON(ITEMS_FILE, {});
}

function loadMarket() {
  return loadJSON(MARKET_FILE, {});
}

function saveMarket(data) {
  return saveJSON(MARKET_FILE, data);
}

function loadFactionMarket() {
  return loadJSON(FACTION_MARKET_FILE, {});
}

function saveFactionMarket(data) {
  return saveJSON(FACTION_MARKET_FILE, data);
}

function loadSubscribers() {
  return loadJSON(SUBSCRIBERS_FILE, {});
}

function saveSubscribers(data) {
  return saveJSON(SUBSCRIBERS_FILE, data);
}

// ============================
// RARITY / UI HELPERS
// ============================
const RARITY_ICONS = {
  Common: "⚪",
  Uncommon: "🟢",
  Rare: "🔵",
  Epic: "🟣",
  Legendary: "🟡",
  Mythic: "🔴",
};

const RARITY_RANK = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
  Mythic: 6,
};

function getRarityIcon(rarity = "Common") {
  return RARITY_ICONS[rarity] || "⚪";
}

function rarityRank(rarity = "Common") {
  return RARITY_RANK[rarity] || 0;
}

function isRareOrHigher(rarity = "Common") {
  return rarityRank(rarity) >= rarityRank("Rare");
}

// ============================
// ITEM HELPERS
// ============================
function getItemById(itemId) {
  if (!itemId) return null;
  const items = loadItems();
  return items[itemId] || null;
}

function normalizeName(str = "") {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getItemByName(name) {
  if (!name) return null;
  const items = loadItems();
  const target = normalizeName(name);

  for (const itemId of Object.keys(items)) {
    const item = items[itemId];
    if (!item) continue;

    if (normalizeName(item.name) === target) return item;
    if (normalizeName(item.id) === target) return item;
  }

  return null;
}

function findItem(query) {
  if (!query) return null;
  return getItemById(query) || getItemByName(query);
}

function itemExists(query) {
  return !!findItem(query);
}

function isEquippable(item) {
  return !!(item && item.category === "gear" && item.slot);
}

function isScroll(item) {
  return !!(item && item.category === "scroll");
}

function isStackable(item) {
  if (!item) return false;
  if (item.category === "gear") return false;
  return true;
}

function getAllItemsArray() {
  const items = loadItems();
  return Object.values(items);
}

function getItemsByCategory(category) {
  if (!category) return [];
  return getAllItemsArray().filter((item) => item.category === category);
}

function getItemsByMarketType(marketType) {
  if (!marketType) return [];
  return getAllItemsArray().filter((item) => item.marketType === marketType);
}

function getFactionItems(factionKey) {
  if (!factionKey) return [];
  return getAllItemsArray().filter((item) => item.faction === factionKey);
}

function getFactionScrolls(factionKey) {
  if (!factionKey) return [];
  return getAllItemsArray().filter(
    (item) => item.faction === factionKey && item.category === "scroll"
  );
}

// ============================
// STORAGE HELPERS
// ============================
function getBaseStorageCapacity() {
  return 40;
}

function getExtraStorageFromItems(player, itemsDb = null) {
  if (!player || typeof player !== "object") return 0;

  const items = itemsDb || loadItems();
  let bonus = 0;

  const inv = player.inventory || {};

  for (const itemId of Object.keys(inv)) {
    const qty = Number(inv[itemId] || 0);
    if (!qty || qty <= 0) continue;

    const item = items[itemId];
    if (!item) continue;

    const effectText = String(item.effect || "");
    const m = effectText.match(/\+(\d+)\s+inventory storage capacity/i);
    if (m) {
      bonus += Number(m[1]) * qty;
    }
  }

  return bonus;
}

function getPlayerStorageCapacity(player, itemsDb = null) {
  return getBaseStorageCapacity() + getExtraStorageFromItems(player, itemsDb);
}

function getUsedStorage(player, itemsDb = null) {
  if (!player || typeof player !== "object") return 0;

  const items = itemsDb || loadItems();
  const inv = player.inventory || {};

  let used = 0;

  for (const itemId of Object.keys(inv)) {
    const qty = Number(inv[itemId] || 0);
    if (!qty || qty <= 0) continue;

    const item = items[itemId];
    if (!item) continue;

    const cost = Number(item.storageCost || 1);
    used += cost * qty;
  }

  return used;
}

function canAddItemToInventory(player, itemId, qty = 1, itemsDb = null) {
  const items = itemsDb || loadItems();
  const item = items[itemId];
  if (!item) {
    return { ok: false, reason: "Item not found." };
  }

  const amount = Math.max(1, Number(qty || 1));
  const currentUsed = getUsedStorage(player, items);
  const capacity = getPlayerStorageCapacity(player, items);
  const addedCost = Number(item.storageCost || 1) * amount;

  if (currentUsed + addedCost > capacity) {
    return {
      ok: false,
      reason: `Not enough storage space. Needed ${addedCost}, free ${Math.max(0, capacity - currentUsed)}.`,
    };
  }

  return { ok: true };
}

// ============================
// PLAYER INVENTORY HELPERS
// ============================
function ensurePlayerItemData(player) {
  if (!player || typeof player !== "object") return player;

  if (!player.inventory || typeof player.inventory !== "object") {
    player.inventory = {};
  }

  if (!player.equipment || typeof player.equipment !== "object") {
    player.equipment = {
      core: null,
      charm: null,
      tool: null,
      relic: null,
      cloak: null,
      boots: null,
      badge: null,
    };
  } else {
    if (!("core" in player.equipment)) player.equipment.core = null;
    if (!("charm" in player.equipment)) player.equipment.charm = null;
    if (!("tool" in player.equipment)) player.equipment.tool = null;
    if (!("relic" in player.equipment)) player.equipment.relic = null;
    if (!("cloak" in player.equipment)) player.equipment.cloak = null;
    if (!("boots" in player.equipment)) player.equipment.boots = null;
    if (!("badge" in player.equipment)) player.equipment.badge = null;
  }

  return player;
}

function getItemQuantity(player, itemId) {
  ensurePlayerItemData(player);
  return Number(player.inventory[itemId] || 0);
}

function addItem(player, itemId, qty = 1, itemsDb = null) {
  ensurePlayerItemData(player);

  const items = itemsDb || loadItems();
  if (!items[itemId]) {
    return { ok: false, reason: "Item not found." };
  }

  const amount = Math.max(1, Number(qty || 1));
  const check = canAddItemToInventory(player, itemId, amount, items);
  if (!check.ok) return check;

  player.inventory[itemId] = Number(player.inventory[itemId] || 0) + amount;
  return { ok: true };
}

function removeItem(player, itemId, qty = 1) {
  ensurePlayerItemData(player);

  const amount = Math.max(1, Number(qty || 1));
  const current = Number(player.inventory[itemId] || 0);

  if (current < amount) {
    return { ok: false, reason: "Not enough quantity." };
  }

  const left = current - amount;
  if (left <= 0) delete player.inventory[itemId];
  else player.inventory[itemId] = left;

  return { ok: true };
}

function equipItem(player, itemId, itemsDb = null) {
  ensurePlayerItemData(player);

  const items = itemsDb || loadItems();
  const item = items[itemId];
  if (!item) return { ok: false, reason: "Item not found." };
  if (!isEquippable(item)) return { ok: false, reason: "That item cannot be equipped." };

  const slot = String(item.slot || "").trim().toLowerCase();
  if (!slot) return { ok: false, reason: "Item slot missing." };

  if (!Object.prototype.hasOwnProperty.call(player.equipment, slot)) {
    return { ok: false, reason: "Invalid gear slot." };
  }

  const qty = getItemQuantity(player, itemId);
  if (qty < 1) {
    return { ok: false, reason: "You do not own that item." };
  }

  const currentEquipped = player.equipment[slot] || null;
  if (currentEquipped === itemId) {
    return { ok: false, reason: "That item is already equipped." };
  }

  if (currentEquipped) {
    const addBack = addItem(player, currentEquipped, 1, items);
    if (!addBack.ok) {
      return {
        ok: false,
        reason: "Not enough storage space to unequip current item.",
      };
    }
  }

  const removed = removeItem(player, itemId, 1);
  if (!removed.ok) return removed;

  player.equipment[slot] = itemId;

  // Initialize durability for new item
  if (!player.equipment[`${slot}Durability`]) {
    player.equipment[`${slot}Durability`] =
      item.durability ?? BASE_DURABILITY_BY_RARITY[item.rarity] ?? 3;
  }

  return {
    ok: true,
    slot,
    replaced: currentEquipped,
  };
}

function unequipItem(player, slot, itemsDb = null) {
  ensurePlayerItemData(player);

  const items = itemsDb || loadItems();
  const cleanSlot = String(slot || "").trim().toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(player.equipment, cleanSlot)) {
    return { ok: false, reason: "Invalid gear slot." };
  }

  if (!player.equipment[cleanSlot]) {
    return { ok: false, reason: "Nothing equipped in that slot." };
  }

  const itemId = player.equipment[cleanSlot];
  const addBack = addItem(player, itemId, 1, items);
  if (!addBack.ok) {
    return { ok: false, reason: addBack.reason || "No storage space available." };
  }

  player.equipment[cleanSlot] = null;
  delete player.equipment[`${cleanSlot}Durability`];

  return { ok: true, itemId };
}

// ============================
// DURABILITY / DAMAGE SYSTEM
// ============================
const BASE_DURABILITY_BY_RARITY = {
  Common: 2,
  Uncommon: 3,
  Rare: 4,
  Epic: 5,
  Legendary: 6,
  Mythic: 8,
};

function applyDurabilityDamage(player, chance = 0.4, excludeSlots = []) {
  ensurePlayerItemData(player);

  const itemsDb = loadItems();
  const equipment = player.equipment || {};
  const results = [];

  for (const slot of Object.keys(equipment)) {
    if (excludeSlots.includes(slot)) continue;
    const itemId = equipment[slot];
    if (!itemId) continue;

    const item = itemsDb[itemId];
    if (!item || !isEquippable(item)) continue;

    const key = `${slot}Durability`;
    if (!player.equipment[key]) {
      // Set default durability based on rarity
      player.equipment[key] = item.durability ?? BASE_DURABILITY_BY_RARITY[item.rarity] ?? 3;
    }

    if (Math.random() < chance) {
      player.equipment[key] -= 1;

      if (player.equipment[key] <= 0) {
        player.equipment[slot] = null;
        delete player.equipment[key];
        results.push({ status: "broken", item: item.name });
      } else {
        results.push({
          status: "damaged",
          item: item.name,
          remaining: player.equipment[key],
        });
      }
    }
  }

  return results;
}

// ============================
// CONSUMABLES HELPERS
// ============================
function useConsumable(player, itemId) {
  const item = getItemById(itemId);
  if (!item || item.category !== "consumable") return { ok: false, reason: "Not usable" };

  const match = item.effect.match(/Restores (\d+)/);
  if (match) {
    const restore = Number(match[1]);
    player.huntingEnergy = (player.huntingEnergy || 0) + restore;
  }

  removeItem(player, itemId, 1);
  return { ok: true, message: `${item.name} used.` };
}

// ============================
// MARKET HELPERS
// ============================
function getCurrentMarketRotation() {
  const market = loadMarket();
  return market.currentRotation || { items: [] };
}

function getCurrentMarketItemsDetailed() {
  const rotation = getCurrentMarketRotation();
  const itemsDb = loadItems();

  return (rotation.items || [])
    .map((entry) => {
      const item = itemsDb[entry.itemId];
      if (!item) return null;

      return {
        ...item,
        marketPrice: entry.price ?? item.price ?? 0,
        marketStock: entry.stock ?? item.stock ?? 0,
        limited: !!entry.limited,
        sold: Number(entry.sold || 0),
      };
    })
    .filter(Boolean);
}

function getFactionMarketFor(factionKey) {
  const factionMarket = loadFactionMarket();
  if (!factionKey) return null;
  return factionMarket.factions?.[factionKey] || null;
}

function getFactionMarketItemsDetailed(factionKey) {
  const market = getFactionMarketFor(factionKey);
  if (!market) return [];

  const itemsDb = loadItems();

  return (market.items || [])
    .map((entry) => {
      const item = itemsDb[entry.itemId];
      if (!item) return null;

      return {
        ...item,
        marketPrice: entry.price ?? item.price ?? 0,
        marketStock: entry.stock ?? item.stock ?? 0,
        limited: !!entry.limited,
      };
    })
    .filter(Boolean);
}

// ============================
// FORMAT HELPERS
// ============================
function formatItemLine(item, options = {}) {
  if (!item) return "Unknown item";

  const icon = getRarityIcon(item.rarity);
  const showStock = options.showStock !== false;
  const stockText =
    typeof item.marketStock === "number"
      ? `\n📦 Stock: ${item.marketStock <= 0 ? "Sold Out" : item.marketStock}`
      : "";

  return (
    `${icon} *${item.name}*\n` +
    `💠 Rarity: ${item.rarity}\n` +
    `💰 Price: ${item.marketPrice ?? item.price ?? 0} Lucons` +
    (showStock ? stockText : "") +
    `\n⚡ Effect: ${item.effect || "None"}` +
    `\n📜 ${item.desc || "No description."}`
  );
}

function formatGearDetails(item, opts = {}) {
  if (!item) {
    return `Nothing equipped`;
  }

  const icon = getRarityIcon(item.rarity);

  let lumenLine = "";
  if (typeof opts.lumen === "number") {
    const max = Number(
      opts.lumenMax || item.durability || BASE_DURABILITY_BY_RARITY[item.rarity] || 3
    );
    const cur = Math.max(0, Math.min(max, Number(opts.lumen)));
    const filled = Math.round((cur / max) * 8);
    const bar = "▰".repeat(filled) + "▱".repeat(Math.max(0, 8 - filled));
    const state =
      cur <= 0 ? "Extinguished" :
      cur / max <= 0.25 ? "Flickering" :
      cur / max <= 0.5 ? "Dim" :
      cur / max <= 0.85 ? "Steady" : "Radiant";
    lumenLine = `\n💡 Lumen: ${cur}/${max}  ${bar}  (${state})`;
  }

  return (
    `${icon} *${item.name}*\n` +
    `💠 Rarity: ${item.rarity}${lumenLine}\n` +
    `⚡ Effect: ${item.effect || "None"}\n` +
    `📜 ${item.desc || "No description."}`
  );
}

function sortItemsByRarityThenName(items = []) {
  return [...items].sort((a, b) => {
    const ra = rarityRank(a.rarity);
    const rb = rarityRank(b.rarity);
    if (ra !== rb) return rb - ra;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

// ============================
// EXPORTS
// ============================
module.exports = {
  // raw file helpers
  loadItems,
  loadMarket,
  saveMarket,
  loadFactionMarket,
  saveFactionMarket,
  loadSubscribers,
  saveSubscribers,

  // item lookup
  getItemById,
  getItemByName,
  findItem,
  itemExists,
  getAllItemsArray,
  getItemsByCategory,
  getItemsByMarketType,
  getFactionItems,
  getFactionScrolls,

  // rarity / ui
  getRarityIcon,
  rarityRank,
  isRareOrHigher,
  formatItemLine,
  formatGearDetails,
  sortItemsByRarityThenName,

  // storage / inventory
  ensurePlayerItemData,
  getBaseStorageCapacity,
  getExtraStorageFromItems,
  getPlayerStorageCapacity,
  getUsedStorage,
  canAddItemToInventory,
  getItemQuantity,
  addItem,
  removeItem,
  equipItem,
  unequipItem,

  // item typing
  isEquippable,
  isScroll,
  isStackable,

  // durability
  applyDurabilityDamage,
  BASE_DURABILITY_BY_RARITY,

  // market
  getCurrentMarketRotation,
  getCurrentMarketItemsDetailed,
  getFactionMarketFor,
  getFactionMarketItemsDetailed,
};
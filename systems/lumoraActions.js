"use strict";
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  LUMORA ACTION LAYER                                                  ║
// ╠═══════════════════════════════════════════════════════════════════════╣
// ║  ONE ACTION LAYER — typed commands and card taps call the same code:   ║
// ║                                                                       ║
// ║      .buy 14   ──┐                                                    ║
// ║                  ├──►  actions.buy(ctx, {item:"GER_001"})  ──► store   ║
// ║      tap BUY   ──┘                                                    ║
// ║                                                                       ║
// ║  Rules this file lives by:                                            ║
// ║   • EVERY validation happens here, server-side. A card may only send   ║
// ║     an action name plus ids — never a price, name or amount.          ║
// ║   • Prices, stock, levels, energy and cooldowns are read from the      ║
// ║     game's own data files, never from the caller.                     ║
// ║   • Every action returns the same shape:                              ║
// ║       { ok:true,  message, data }                                     ║
// ║       { ok:false, error:<code>, message, data? }                      ║
// ║   • This file does not know WhatsApp exists — no socket, no sending.   ║
// ║     Callers deliver `message` however they like (chat, bridge, card).  ║
// ║   • Nothing here is random except rollDice, and even that takes its    ║
// ║     randomness from deps.random so tests can pin it.                  ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const DIVIDER = "━━━━━━━━━━━━━━━━━━";

// ── hunt UI constants ───────────────────────────────────────────────────
// Mirrors the values hunting.js uses for its own map screens. Kept here so
// the action layer can build card data without importing hunt internals.
const TERRAIN_EMOJI = {
  wilderness: "🌲", verdant_wilds: "🌿", volt_expanse: "⚡", ashfall_basin: "🌋",
  terra_shatterfields: "🏜️", frostreach: "❄️", shadow_hollow: "🌑", rift_scar: "🌀",
};
const DIFF_LEVEL_REQ = { easy: 1, standard: 5, dangerous: 15, nightmare: 30 };
const DIFF_EMOJI = { easy: "🟢", standard: "🟡", dangerous: "🟠", nightmare: "🔴" };
const DIFF_ORDER = ["easy", "standard", "dangerous", "nightmare"];

const GEAR_SLOTS = ["core", "charm", "tool", "relic", "cloak", "boots", "badge"];

// ─────────────────────────────────────────────────────────────────────────
// SECTION 1 — RESULT + DEPENDENCY PLUMBING
// ─────────────────────────────────────────────────────────────────────────

function ok(message, data) {
  return { ok: true, message: message || "", data: data || {} };
}

function fail(code, message, data) {
  return { ok: false, error: code, message: message || "", data: data || {} };
}

/**
 * Game modules. Required lazily on purpose: market/gear call back into this
 * file, so a top-level require would build a cycle.
 */
function resolveDeps(provided) {
  if (provided && provided.items && provided.market && provided.hunting) return provided;
  return {
    items: require("./items"),
    market: require("./market"),
    hunting: require("./hunting"),
    random: Math.random,
  };
}

/** ctx.runtime = { players, savePlayers } — the live player store. */
function store(ctx) {
  const rt = ctx && ctx.runtime;
  if (!rt || !rt.players || typeof rt.savePlayers !== "function") return null;
  return rt;
}

function titleCase(str) {
  return String(str || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 2 — READ-ONLY SNAPSHOTS (what the cards render)
// ─────────────────────────────────────────────────────────────────────────

/** 🏪 Market listings as data: ids, real prices, real stock. */
async function marketList(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];

  const { market } = deps.market.maybeRotateMarket();
  const itemsDb = deps.items.loadItems();

  const mapEntry = (entry, permanent) => {
    const item = itemsDb[entry.itemId];
    if (!item) return null;
    const unlimited = permanent || entry.unlimited === true || entry.permanent === true;
    const stock = Number(entry.stock || 0);
    const sold = Number(entry.sold || 0);
    return {
      itemId: item.id,
      name: item.name,
      rarity: item.rarity || "Common",
      category: item.category || "item",
      slot: item.slot || null,
      price: Number(entry.price ?? item.price ?? 0),
      stock,
      sold,
      left: unlimited ? null : Math.max(0, stock - sold),
      unlimited,
      permanent: !!permanent,
      effect: item.effect || "",
      desc: item.desc || "",
    };
  };

  const rotation = Array.isArray(market?.currentRotation?.items) ? market.currentRotation.items : [];
  const permanent = Array.isArray(market?.permanentListings) ? market.permanentListings : [];

  const entries = rotation.map((e) => mapEntry(e, false))
    .concat(permanent.map((e) => mapEntry(e, true)))
    .filter(Boolean);

  return ok("", {
    lucons: Number(player?.lucons || 0),
    rotationEndsAt: Number(market?.nextRotationAt || 0) || null,
    entries,
    command: ".buy <item name or id>",
  });
}

/** 🎒 Inventory as data for the .inv card. */
async function inventoryView(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  deps.items.ensurePlayerItemData(player);
  const itemsDb = deps.items.loadItems();
  const inventory = player.inventory || {};

  const items = Object.keys(inventory)
    .map((itemId) => {
      const item = itemsDb[itemId];
      if (!item) return null;
      const qty = Number(inventory[itemId] || 0);
      if (qty <= 0) return null;
      return {
        itemId,
        name: item.name,
        rarity: item.rarity || "Common",
        category: item.category || "item",
        slot: item.slot || null,
        qty,
        effect: item.effect || "",
        desc: item.desc || "",
        storageCost: Number(item.storageCost || 0),
      };
    })
    .filter(Boolean);

  return ok("", {
    lucons: Number(player.lucons || 0),
    used: deps.items.getUsedStorage(player, itemsDb),
    capacity: deps.items.getPlayerStorageCapacity(player, itemsDb),
    equipment: Object.assign({}, player.equipment || {}),
    items,
  });
}

/** 🗺️ Hunting grounds with per-difficulty lock state. */
async function huntGrounds(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const grounds = deps.hunting.loadGrounds();
  const state = deps.hunting.loadHuntState();
  const hunter = deps.hunting.ensureHunter(state, ctx.playerId);
  const level = Number(player.level || 1);

  const list = Object.values(grounds)
    .filter((g) => g && g.travelable && g.id !== "capital")
    .map((g) => ({
      id: g.id,
      name: g.name,
      emoji: TERRAIN_EMOJI[g.id] || "🌍",
      description: g.description || "",
      recommendedLevel: Number(g.recommendedLevel || 1),
      recommendedAura: Number(g.recommendedAura || 0),
      hazard: g.hazard || null,
      difficulties: Object.keys(g.difficultyModes || {}).map((key) => {
        const mode = g.difficultyModes[key];
        const req = DIFF_LEVEL_REQ[key] || 1;
        return {
          key,
          label: mode.label || titleCase(key),
          emoji: DIFF_EMOJI[key] || "⚪",
          levelReq: req,
          unlocked: level >= req,
          energyCost: Number(mode.energyCost || 0),
          moraLevelMin: Number(mode.moraLevelMin || 1),
          moraLevelMax: Number(mode.moraLevelMax || 1),
        };
      }),
    }));

  return ok("", {
    level,
    location: hunter.location || "capital",
    currentDifficulty: hunter.currentDifficulty || null,
    huntEnergy: Number(hunter.huntEnergy || 0),
    huntEnergyMax: Number(hunter.huntEnergyMax || 0),
    playerHp: Number(player.playerHp || 0),
    playerMaxHp: Number(player.playerMaxHp || 0),
    grounds: list,
  });
}

/** 🗺️ One ground in detail, plus the exact command to go there. */
async function huntGround(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const groundId = String((params && (params.groundId || params.id)) || "").trim();
  if (!groundId) return fail("invalid_params", "❌ Which ground? Pass groundId.");

  const grounds = deps.hunting.loadGrounds();
  const ground = grounds[groundId];
  if (!ground || !ground.travelable || groundId === "capital") {
    return fail("unknown_ground", "❌ Unknown terrain. Use `.map` to see available locations.");
  }

  const level = Number(player.level || 1);
  const difficulties = Object.entries(ground.difficultyModes || {}).map(([key, mode]) => {
    const req = DIFF_LEVEL_REQ[key] || 1;
    return {
      key,
      label: mode.label || titleCase(key),
      emoji: DIFF_EMOJI[key] || "⚪",
      levelReq: req,
      unlocked: level >= req,
      energyCost: Number(mode.energyCost || 0),
      moraLevelMin: Number(mode.moraLevelMin || 1),
      moraLevelMax: Number(mode.moraLevelMax || 1),
    };
  });

  return ok("", {
    id: ground.id,
    name: ground.name,
    emoji: TERRAIN_EMOJI[ground.id] || "🌍",
    description: ground.description || "",
    lore: ground.lore || "",
    recommendedLevel: Number(ground.recommendedLevel || 1),
    recommendedAura: Number(ground.recommendedAura || 0),
    suggestedGear: Array.isArray(ground.suggestedGear) ? ground.suggestedGear : [],
    hazard: ground.hazard || null,
    difficulties,
    level,
    huntEnergy: Number(rt.players[ctx.playerId].huntEnergy || 0),
    playerHp: Number(player.playerHp || 0),
    playerMaxHp: Number(player.playerMaxHp || 0),
  });
}

/**
 * 🧭 Travel decision — validation only. `data.command` is what the player
 * types; the commit itself still belongs to .travel/.proceed (see notes in
 * the report — the two-step hunt flow was not refactored yet).
 */
async function huntTravelPlan(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const groundId = String((params && (params.groundId || params.id)) || "").trim();
  const difficulty = String((params && params.difficulty) || "").trim().toLowerCase();

  if (!DIFF_ORDER.includes(difficulty)) {
    return fail("unknown_difficulty", "❌ Usage: `.travel <terrain> <easy|standard|dangerous|nightmare>`");
  }

  const grounds = deps.hunting.loadGrounds();
  const ground = grounds[groundId];
  if (!ground || !ground.travelable || ground.id === "capital") {
    return fail("unknown_ground", "❌ Unknown or invalid terrain.\nUse `.map` to see available locations.");
  }

  const mode = (ground.difficultyModes || {})[difficulty];
  if (!mode) {
    return fail("unknown_difficulty", "❌ That difficulty is not available for this terrain.");
  }

  const state = deps.hunting.loadHuntState();
  const hunter = deps.hunting.ensureHunter(state, ctx.playerId);
  const level = Number(player.level || 1);
  const req = DIFF_LEVEL_REQ[difficulty] || 1;

  if (level < req) {
    return fail("level_too_low", "🔒 *" + (mode.label || difficulty) + "* needs level " + req + "+ (you: Lv " + level + ").",
      { required: req, level });
  }
  if (hunter.activeEncounter) {
    return fail("busy_encounter", "❌ Finish your current encounter before travelling.");
  }
  const pending = hunter.pendingTravel;
  if (pending && Date.now() < Number(pending.expiresAt || 0)) {
    return fail("pending_travel", "⚠️ You already have a pending travel. Use `.proceed` or `.dismiss`.");
  }

  const energyCost = Number(mode.energyCost || 0);
  const huntEnergy = Number(hunter.huntEnergy || 0);
  const riftBuff = Number(player.riftEnergyUntil || 0) > Date.now();
  if (!riftBuff && huntEnergy < energyCost) {
    return fail("not_enough_energy",
      "❌ Not enough hunt energy.\nNeed: *" + energyCost + "*  |  Have: *" + huntEnergy + "*",
      { need: energyCost, have: huntEnergy });
  }

  const label = mode.label || titleCase(difficulty);
  return ok(
    "🧭 " + ground.name + " · " + label + " — " + energyCost + " energy. Type the command below to travel.",
    {
      applies: false,
      groundId: ground.id,
      groundName: ground.name,
      difficulty,
      difficultyLabel: label,
      energyCost,
      level,
      huntEnergy,
      huntEnergyMax: Number(hunter.huntEnergyMax || 0),
      playerHp: Number(player.playerHp || 0),
      playerMaxHp: Number(player.playerMaxHp || 0),
      command: ".travel " + ground.id + " " + difficulty,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 3 — STATE-CHANGING ACTIONS
// ─────────────────────────────────────────────────────────────────────────

/**
 * 🛒 BUY — the price, the stock and the storage rules all come from the
 * market data, never from `params`.
 */
async function buy(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const query = String((params && (params.item || params.query || params.itemId)) || "").trim();
  if (!query) return fail("no_query", "Usage: `.buy <item name or id>`");

  const qty = Math.max(1, toInt(params && params.qty, 1) || 1);
  if (qty !== 1) {
    return fail("unsupported_qty", "❌ The market sells one unit per purchase.");
  }

  const { market } = deps.market.maybeRotateMarket();
  const itemsDb = deps.items.loadItems();
  const found = deps.market.getRotationEntryByQuery(query, market, itemsDb);
  if (!found) return fail("not_in_market", "❌ That item is not currently in the market.");

  const { entry, item } = found;
  const unlimited = entry.unlimited === true || entry.permanent === true;

  if (!unlimited) {
    const remaining = Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0));
    if (remaining <= 0) return fail("sold_out", "❌ *" + item.name + "* is sold out.");
  }

  const price = Number(entry.price ?? item.price ?? 0);
  const money = Number(player.lucons || 0);
  if (money < price) {
    return fail("insufficient_lucons",
      "❌ You need *" + price + " Lucons* but only have *" + money + "*.",
      { price, lucons: money });
  }

  const canAdd = deps.items.canAddItemToInventory(player, item.id, 1);
  if (!canAdd.ok) return fail("storage_full", "❌ " + canAdd.reason);

  const added = deps.items.addItem(player, item.id, 1);
  if (!added.ok) return fail("add_failed", "❌ " + added.reason);

  player.lucons = Math.max(0, money - price);
  if (!unlimited) entry.sold = Number(entry.sold || 0) + 1;

  rt.savePlayers(rt.players);
  if (!unlimited) deps.items.saveMarket(market);

  const left = unlimited ? "∞" : String(Math.max(0, Number(entry.stock || 0) - Number(entry.sold || 0)));
  const rarityIcon = deps.items.getRarityIcon(item.rarity);

  const message =
    DIVIDER + "\n" +
    "🛒 *PURCHASE COMPLETE*\n" +
    DIVIDER + "\n\n" +
    rarityIcon + " *" + item.name + "*\n" +
    "💰 Price: *" + price + " Lucons*\n" +
    (unlimited ? "♾️ Permanent listing — always restocked\n" : "📦 Remaining Stock: *" + left + "*\n") +
    "⚡ Effect: " + (item.effect || "None") + "\n" +
    "📜 " + (item.desc || "No description.") + "\n\n" +
    "💳 Lucons Left: *" + player.lucons + "*";

  return ok(message, {
    itemId: item.id,
    name: item.name,
    rarity: item.rarity || "Common",
    price,
    lucons: Number(player.lucons),
    left,
    unlimited,
  });
}

/** 🛡 EQUIP — wraps itemsSystem.equipItem. */
async function equip(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const query = String((params && (params.item || params.query || params.itemId)) || "").trim();
  if (!query) return fail("no_query", "Usage: `.equip <item name or id>`");

  deps.items.ensurePlayerItemData(player);
  const item = deps.items.findItem(query);
  if (!item) return fail("not_found", "❌ Item not found: *" + query + "*");

  const result = deps.items.equipItem(player, item.id);
  if (!result.ok) return fail("not_equippable", "❌ " + result.reason);

  rt.savePlayers(rt.players);

  let extra = "";
  if (result.replaced) {
    const replaced = deps.items.getItemById(result.replaced);
    extra = replaced ? "\n📤 Returned to inventory: *" + replaced.name + "*" : "";
  }

  const message =
    DIVIDER + "\n" +
    "✅ *ITEM EQUIPPED*\n" +
    DIVIDER + "\n\n" +
    "🛡 Equipped: *" + item.name + "*\n" +
    "📌 Slot: *" + titleCase(result.slot) + "*\n" +
    "⚡ Effect: " + (item.effect || "None") + "\n" +
    "📜 " + (item.desc || "No description.") +
    extra;

  return ok(message, {
    itemId: item.id,
    name: item.name,
    slot: result.slot,
    replaced: result.replaced || null,
  });
}

/** 📤 UNEQUIP — wraps itemsSystem.unequipItem. */
async function unequip(ctx, params, d) {
  const deps = resolveDeps(d);
  const rt = store(ctx);
  if (!rt) return fail("no_store", "❌ Player store unavailable.");
  const player = rt.players[ctx.playerId];
  if (!player) return fail("no_player", "❌ Register first using `.register`.");

  const slot = String((params && params.slot) || "").trim().toLowerCase();
  if (!slot || !GEAR_SLOTS.includes(slot)) {
    return fail("invalid_slot", "Usage: `.unequip <" + GEAR_SLOTS.join("|") + ">`");
  }

  deps.items.ensurePlayerItemData(player);
  const currentId = (player.equipment || {})[slot] || null;
  const result = deps.items.unequipItem(player, slot);
  if (!result.ok) return fail("nothing_equipped", "❌ " + result.reason);

  rt.savePlayers(rt.players);

  const item = deps.items.getItemById(currentId);
  const message =
    DIVIDER + "\n" +
    "📤 *ITEM UNEQUIPPED*\n" +
    DIVIDER + "\n\n" +
    "🛡 Slot: *" + titleCase(slot) + "*\n" +
    "📦 Returned: *" + ((item && item.name) || result.itemId || "Unknown Item") + "*";

  return ok(message, { slot, itemId: currentId, name: (item && item.name) || null });
}

/**
 * 🎲 DICE ROLL — the bot rolls, the card only reveals the result.
 * deps.random is injectable so the result can be pinned in tests.
 */
async function rollDice(ctx, params, d) {
  const deps = resolveDeps(d);
  const random = typeof deps.random === "function" ? deps.random : Math.random;
  const requested = toInt(params && params.max, 0) || 6;
  const max = Math.min(Math.max(requested, 2), 1000);
  const result = Math.floor(random() * max) + 1;

  return ok(
    "🎲 *DICE ROLL* (1-" + max + ")\n\nYou rolled: *" + result + "*!",
    { max, result, requestedMax: requested, clamped: max !== requested }
  );
}

/**
 * 💰 SELL — Lumora has no sell mechanic yet (there is no .sell anywhere in
 * the bot). Refusing loudly beats inventing prices and a buy-back economy.
 */
async function sell() {
  return fail("not_implemented",
    "❌ Selling isn't part of Lumora yet — the bot has no sell mechanic. Ask Prime before we invent one.");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION 4 — CATALOG + DISPATCH
// ─────────────────────────────────────────────────────────────────────────

/** `changes: true` marks actions the bridge must make single-use. */
const ACTIONS = {
  marketList,
  inventoryView,
  huntGrounds,
  huntGround,
  huntTravelPlan,
  buy,
  equip,
  unequip,
  rollDice,
  sell,
};

/** Lowercase keys on purpose: callers may send any casing.
 *  "rollDice" MUST be in here — a replayed roll is a free reroll. */
const CHANGING = new Set(["buy", "equip", "unequip", "rolldice"]);

const ACTION_KEYS = Object.keys(ACTIONS).reduce((map, key) => {
  map[key.toLowerCase()] = key;
  return map;
}, {});

function describe() {
  return Object.keys(ACTIONS).map((name) => ({ name, changes: CHANGING.has(name.toLowerCase()) }));
}

function isChanging(name) {
  return CHANGING.has(String(name || "").trim().toLowerCase());
}

/** Uniform entry point: never throws, always returns a result object. */
async function run(name, ctx, params, d) {
  const asked = String(name || "").trim();
  const key = ACTION_KEYS[asked.toLowerCase()];
  const fn = key ? ACTIONS[key] : null;
  if (!fn) return fail("unknown_action", "❌ Unknown action: " + asked);
  try {
    return await fn(ctx || {}, params || {}, d);
  } catch (e) {
    console.log("[lumora-actions] " + key + " threw:", (e && e.message) || e);
    return fail("exception", "❌ " + ((e && e.message) || "Action failed."));
  }
}

module.exports = {
  // actions
  marketList,
  inventoryView,
  huntGrounds,
  huntGround,
  huntTravelPlan,
  buy,
  equip,
  unequip,
  rollDice,
  sell,

  // plumbing
  ACTIONS,
  run,
  describe,
  isChanging,
  CHANGING,

  // shared constants
  DIVIDER,
  GEAR_SLOTS,
  DIFF_LEVEL_REQ,
  DIFF_EMOJI,
  DIFF_ORDER,
  TERRAIN_EMOJI,
};

"use strict";
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA ACTION LAYER CHECK                                        ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Runs with no WhatsApp, no network and no writes to data/:        ║
// ║  the item database is the real data/items.json (read only), the   ║
// ║  player store is a fixture and saveMarket/saveHuntState are stubs.║
// ║                                                                   ║
// ║  What it proves:                                                  ║
// ║   • the price/stock/level rules come from game data, never from   ║
// ║     the caller (a card cannot buy something for 1 Lucon)          ║
// ║   • failures are typed codes the cards can render                 ║
// ║   • only the state-changing actions are marked as such            ║
// ║                                                                   ║
// ║  Run: node scripts/actions_check.js                               ║
// ╚═══════════════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

const actions = require("../systems/lumoraActions.js");
const itemsSystem = require("../systems/items.js");
const marketSystem = require("../systems/market.js");
const huntingSystem = require("../systems/hunting.js");

const ROOT = path.join(__dirname, "..");
const PLAYER = "85376064581854@lid";

// ── fixtures (real item + ground data, in-memory player store) ──────────
const realItems = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const realGrounds = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "hunting_grounds.json"), "utf8"));

// GER_001 is a real Rare core (280 Lucons). ITM_001 is a real consumable.
const GEAR = "GER_001";
const GEAR2 = "GER_002";
const CONSUMABLE = "ITM_001";

let marketFixture = null;
let huntStateFixture = null;
let savedPlayers = 0;
let savedMarket = 0;

function resetFixtures() {
  savedPlayers = 0;
  savedMarket = 0;
  marketFixture = {
    enabled: true,
    nextRotationAt: Date.now() + 60 * 60 * 1000,
    currentRotation: {
      items: [
        { itemId: GEAR, price: realItems[GEAR].price, stock: 2, sold: 0 },
        { itemId: GEAR2, price: realItems[GEAR2].price, stock: 1, sold: 1 }, // sold out
      ],
    },
    // Mirrors data/market.json: permanent listings carry unlimited: true.
    permanentListings: [{ itemId: CONSUMABLE, price: realItems[CONSUMABLE].price, unlimited: true }],
  };
  huntStateFixture = {
    players: {
      [PLAYER]: {
        location: "capital",
        huntEnergy: 100,
        huntEnergyMax: 200,
        pendingTravel: null,
        activeEncounter: null,
      },
    },
    defaults: {},
  };
}

itemsSystem.loadItems = () => realItems;
itemsSystem.loadMarket = () => marketFixture;
itemsSystem.saveMarket = () => { savedMarket++; };
huntingSystem.loadGrounds = () => realGrounds;
huntingSystem.loadHuntState = () => huntStateFixture;
huntingSystem.saveHuntState = () => {};

function freshPlayer(over) {
  return Object.assign({
    username: "Prime",
    level: 12,
    lucons: 1000,
    inventory: {},
    equipment: {},
    playerHp: 80,
    playerMaxHp: 100,
    huntEnergy: 100,
    maxHuntEnergy: 200,
  }, over || {});
}

function ctxFor(player, over) {
  const players = {};
  if (player) players[PLAYER] = player;
  return Object.assign({
    playerId: PLAYER,
    chatId: "12345@g.us",
    source: "test",
    runtime: { players, savePlayers: () => { savedPlayers++; } },
  }, over || {});
}

let rng = Math.random;
const DEPS = {
  items: itemsSystem,
  market: marketSystem,
  hunting: huntingSystem,
  get random() { return rng; },
};

let pass = 0;
let fail = 0;

function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label + (extra ? "  → " + extra : "")); }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
}

(async function main() {
  console.log("\n═══ 1. CATALOG ═══");
  const catalog = actions.describe();
  const names = catalog.map((a) => a.name).sort();
  ok("catalog lists the actions",
    ["buy", "equip", "huntGround", "huntGrounds", "huntTravelPlan", "inventoryView", "marketList", "rollDice", "sell", "unequip"]
      .every((n) => names.includes(n)), names.join(","));
  ok("buy is marked state-changing", actions.isChanging("buy") === true);
  ok("equip/unequip/roll are state-changing (rollDice is the replay risk)",
    actions.isChanging("equip") && actions.isChanging("unequip") && actions.isChanging("rollDice") &&
    actions.isChanging("ROLLDICE"),
    ["equip", "unequip", "rollDice", "ROLLDICE"].map((n) => n + ":" + actions.isChanging(n)).join(" "));
  ok("read-only actions are NOT marked state-changing",
    !actions.isChanging("inventoryView") && !actions.isChanging("marketList") && !actions.isChanging("huntGrounds"));

  console.log("\n═══ 2. BUY — happy path ═══");
  resetFixtures();
  let player = freshPlayer();
  let res = await actions.buy(ctxFor(player), { item: GEAR }, DEPS);
  ok("buy succeeds", res.ok === true, JSON.stringify(res));
  eq("lucons charged the market price", player.lucons, 1000 - realItems[GEAR].price);
  eq("item landed in the inventory", player.inventory[GEAR], 1);
  eq("market entry counted the sale", marketFixture.currentRotation.items[0].sold, 1);
  eq("players were saved once", savedPlayers, 1);
  eq("market was saved once (limited stock)", savedMarket, 1);
  ok("message is the classic purchase card",
    res.message.includes("🛒 *PURCHASE COMPLETE*") && res.message.includes("💳 Lucons Left: *720*"), res.message);
  eq("data carries the real price", res.data.price, realItems[GEAR].price);
  eq("data carries the remaining stock", res.data.left, "1");

  console.log("\n═══ 3. BUY — a caller cannot cheat the price ═══");
  resetFixtures();
  player = freshPlayer();
  res = await actions.buy(ctxFor(player), { item: GEAR, price: 1, qty: 1, name: "GM Sword" }, DEPS);
  ok("succeeds through the real listing", res.ok === true);
  eq("caller-supplied price is ignored", player.lucons, 1000 - realItems[GEAR].price);
  eq("caller-supplied name is ignored", res.data.name, realItems[GEAR].name);

  res = await actions.buy(ctxFor(player), { item: GEAR, qty: 25 }, DEPS);
  eq("multi-buy is refused, not silently applied", res.error, "unsupported_qty");

  console.log("\n═══ 4. BUY — refusals ═══");
  resetFixtures();
  res = await actions.buy(ctxFor(freshPlayer()), { item: "NO_SUCH_ITEM" }, DEPS);
  eq("unknown item → not_in_market", res.error, "not_in_market");

  res = await actions.buy(ctxFor(freshPlayer()), { item: GEAR2 }, DEPS);
  eq("sold-out entry → sold_out", res.error, "sold_out");

  player = freshPlayer({ lucons: 5 });
  res = await actions.buy(ctxFor(player), { item: GEAR }, DEPS);
  eq("too poor → insufficient_lucons", res.error, "insufficient_lucons");
  eq("data reports the price", res.data.price, realItems[GEAR].price);
  eq("data reports the balance", res.data.lucons, 5);
  eq("nothing was charged", player.lucons, 5);
  eq("nothing was added", player.inventory[GEAR], undefined);
  ok("message names both numbers",
    res.message.includes(String(realItems[GEAR].price)) && res.message.includes("but only have *5*"), res.message);

  res = await actions.buy(ctxFor(null), { item: GEAR }, DEPS);
  eq("unregistered player → no_player", res.error, "no_player");

  res = await actions.buy(ctxFor(freshPlayer()), { item: "" }, DEPS);
  eq("no item asked for → no_query", res.error, "no_query");

  // Storage is full: base capacity is 40 and the bag already holds 40 units.
  // (Patching items.json is not an option — the bot must not write real data.)
  player = freshPlayer({ inventory: { [CONSUMABLE]: 40 } });
  res = await actions.buy(ctxFor(player), { item: GEAR }, DEPS);
  eq("full storage → storage_full", res.error, "storage_full");
  eq("no charge when storage is full", player.lucons, 1000);
  ok("the refusal explains the space", /storage space/i.test(res.message), res.message);

  console.log("\n═══ 5. BUY — permanent listings and lookups ═══");
  resetFixtures();
  player = freshPlayer({ lucons: 500 });
  res = await actions.buy(ctxFor(player), { item: CONSUMABLE }, DEPS);
  ok("permanent listing purchase succeeds", res.ok === true, JSON.stringify(res));
  eq("permanent purchase charges the price", player.lucons, 500 - realItems[CONSUMABLE].price);
  eq("unlimited stock is reported as ∞", res.data.left, "∞");
  eq("market file is untouched for permanent stock", savedMarket, 0);

  resetFixtures();
  player = freshPlayer();
  res = await actions.buy(ctxFor(player), { item: realItems[GEAR].name }, DEPS);
  ok("lookup by item name works", res.ok === true, JSON.stringify(res));
  res = await actions.buy(ctxFor(player), { item: GEAR }, DEPS);
  ok("lookup by item id works", res.ok === true, JSON.stringify(res));

  console.log("\n═══ 6. EQUIP / UNEQUIP ═══");
  resetFixtures();
  player = freshPlayer({ inventory: { [GEAR]: 1, [CONSUMABLE]: 3 } });
  res = await actions.equip(ctxFor(player), { item: GEAR }, DEPS);
  ok("equip succeeds", res.ok === true, JSON.stringify(res));
  eq("gear slot is filled", player.equipment.core, GEAR);
  eq("equipping saved players", savedPlayers, 1);
  eq("equipping consumed the inventory copy", player.inventory[GEAR], undefined);
  ok("message is the classic equip card", res.message.includes("✅ *ITEM EQUIPPED*"), res.message);

  res = await actions.equip(ctxFor(player), { item: "NOPE" }, DEPS);
  eq("unknown item → not_found", res.error, "not_found");

  player = freshPlayer({ inventory: { [CONSUMABLE]: 1 } });
  res = await actions.equip(ctxFor(player), { item: CONSUMABLE }, DEPS);
  eq("a consumable is not equippable", res.error, "not_equippable");

  player = freshPlayer({ inventory: { [GEAR]: 1, [GEAR2]: 1 } });
  await actions.equip(ctxFor(player), { item: GEAR }, DEPS);
  res = await actions.equip(ctxFor(player), { item: GEAR2 }, DEPS);
  eq("second core replaces the first", player.equipment.core, GEAR2);
  eq("the replaced item is reported", res.data.replaced, GEAR);
  ok("message tells the player what came back",
    res.message.includes("Returned to inventory: *" + realItems[GEAR].name + "*"), res.message);

  player = freshPlayer({ equipment: { core: GEAR, charm: null } });
  res = await actions.unequip(ctxFor(player), { slot: "core" }, DEPS);
  ok("unequip succeeds", res.ok === true, JSON.stringify(res));
  eq("slot is empty", player.equipment.core, null);
  eq("item returned to the inventory", player.inventory[GEAR], 1);
  ok("message is the classic unequip card", res.message.includes("📤 *ITEM UNEQUIPPED*"), res.message);

  res = await actions.unequip(ctxFor(player), { slot: "wings" }, DEPS);
  eq("bad slot → invalid_slot", res.error, "invalid_slot");

  res = await actions.unequip(ctxFor(freshPlayer({ equipment: {} })), { slot: "core" }, DEPS);
  eq("empty slot → nothing_equipped", res.error, "nothing_equipped");

  console.log("\n═══ 7. ROLL — the bot rolls, the caller only delivers ═══");
  rng = () => 0;
  let roll = await actions.rollDice({ playerId: PLAYER, chatId: "x", source: "test" }, { max: 6 }, DEPS);
  eq("rng 0 → lowest face", roll.data.result, 1);
  eq("default max is 6", roll.data.max, 6);
  roll = await actions.rollDice({}, { max: 6 }, DEPS);
  rng = () => 0.999999;
  roll = await actions.rollDice({}, { max: 6 }, DEPS);
  eq("rng ~1 → highest face", roll.data.result, 6);
  roll = await actions.rollDice({}, { max: 5000 }, DEPS);
  eq("max is clamped to 1000", roll.data.max, 1000);
  ok("clamping is reported", roll.data.clamped === true);
  roll = await actions.rollDice({}, { max: 1 }, DEPS);
  eq("max is raised to 2", roll.data.max, 2);
  roll = await actions.rollDice({}, {}, DEPS);
  ok("message matches the live .roll format", /^🎲 \*DICE ROLL\* \(1-6\)/.test(roll.message), roll.message);
  rng = Math.random;
  roll = await actions.rollDice({}, {}, DEPS);
  ok("result stays inside the range", roll.data.result >= 1 && roll.data.result <= roll.data.max);

  console.log("\n═══ 8. READ-ONLY SNAPSHOTS ═══");
  resetFixtures();
  player = freshPlayer({ inventory: { [GEAR]: 2, [CONSUMABLE]: 5 }, equipment: { core: GEAR } });
  let inv = await actions.inventoryView(ctxFor(player), {}, DEPS);
  ok("inventoryView succeeds", inv.ok === true, JSON.stringify(inv));
  eq("lucons reported", inv.data.lucons, 1000);
  eq("two inventory stacks", inv.data.items.length, 2);
  const gearRow = inv.data.items.find((i) => i.itemId === GEAR);
  eq("stack quantity reported", gearRow.qty, 2);
  eq("rarity reported", gearRow.rarity, realItems[GEAR].rarity);
  ok("storage numbers are numeric", Number.isFinite(inv.data.used) && Number.isFinite(inv.data.capacity));
  eq("equipment map is exposed", inv.data.equipment.core, GEAR);

  let mk = await actions.marketList(ctxFor(player), {}, DEPS);
  ok("marketList succeeds", mk.ok === true, JSON.stringify(mk));
  eq("rotation + permanent listings are all listed", mk.data.entries.length, 3);
  const gearEntry = mk.data.entries.find((e) => e.itemId === GEAR);
  eq("entry price comes from the market", gearEntry.price, realItems[GEAR].price);
  eq("left is stock minus sold", gearEntry.left, 2);
  const permEntry = mk.data.entries.find((e) => e.itemId === CONSUMABLE);
  ok("permanent listing is flagged unlimited", permEntry.unlimited === true && permEntry.permanent === true);
  eq("entry name comes from the item db", gearEntry.name, realItems[GEAR].name);
  eq("buyer's balance is included for afford-state rendering", mk.data.lucons, 1000);

  mk = await actions.marketList(ctxFor(null), {}, DEPS);
  eq("marketList still works with no player (browsing)", mk.ok, true);

  console.log("\n═══ 9. HUNTING — grounds, detail and travel plan ═══");
  resetFixtures();
  player = freshPlayer({ level: 12 });
  let grounds = await actions.huntGrounds(ctxFor(player), {}, DEPS);
  ok("huntGrounds succeeds", grounds.ok === true, JSON.stringify(grounds).slice(0, 200));
  eq("capital is not a hunting ground", grounds.data.grounds.some((g) => g.id === "capital"), false);
  eq("all eight wild grounds are listed", grounds.data.grounds.length, 8);
  const wild = grounds.data.grounds.find((g) => g.id === "wilderness");
  eq("each ground lists its difficulties", wild.difficulties.length, 4);
  const easy = wild.difficulties.find((d) => d.key === "easy");
  ok("easy is unlocked at level 12", easy.unlocked === true && easy.levelReq === 1);
  const nightmare = wild.difficulties.find((d) => d.key === "nightmare");
  ok("nightmare is locked at level 12", nightmare.unlocked === false && nightmare.levelReq === 30);
  eq("energy cost comes from the ground data", easy.energyCost, 10);

  let detail = await actions.huntGround(ctxFor(player), { groundId: "wilderness" }, DEPS);
  ok("huntGround succeeds", detail.ok === true, JSON.stringify(detail).slice(0, 200));
  eq("detail carries the ground name", detail.data.name, realGrounds.wilderness.name);
  detail = await actions.huntGround(ctxFor(player), { groundId: "capital" }, DEPS);
  eq("capital has no detail → unknown_ground", detail.error, "unknown_ground");
  detail = await actions.huntGround(ctxFor(player), { groundId: "atlantis" }, DEPS);
  eq("made-up ground → unknown_ground", detail.error, "unknown_ground");
  detail = await actions.huntGround(ctxFor(player), {}, DEPS);
  eq("missing groundId → invalid_params", detail.error, "invalid_params");

  let plan = await actions.huntTravelPlan(ctxFor(freshPlayer({ level: 30 })), { groundId: "wilderness", difficulty: "easy" }, DEPS);
  ok("travel plan succeeds", plan.ok === true, JSON.stringify(plan).slice(0, 200));
  eq("the plan does not apply anything by itself", plan.data.applies, false);
  eq("the plan hands over the exact command", plan.data.command, ".travel wilderness easy");
  eq("the plan reports the energy cost", plan.data.energyCost, 10);

  plan = await actions.huntTravelPlan(ctxFor(freshPlayer({ level: 3 })), { groundId: "wilderness", difficulty: "nightmare" }, DEPS);
  eq("low level → level_too_low", plan.error, "level_too_low");
  eq("the level requirement is reported", plan.data.required, 30);

  plan = await actions.huntTravelPlan(ctxFor(freshPlayer()), { groundId: "wilderness", difficulty: "banana" }, DEPS);
  eq("made-up difficulty → unknown_difficulty", plan.error, "unknown_difficulty");

  huntStateFixture.players[PLAYER].huntEnergy = 1;
  plan = await actions.huntTravelPlan(ctxFor(freshPlayer()), { groundId: "wilderness", difficulty: "easy" }, DEPS);
  eq("no energy → not_enough_energy", plan.error, "not_enough_energy");
  eq("the energy numbers are reported", plan.data.need + "/" + plan.data.have, "10/1");

  huntStateFixture.players[PLAYER].huntEnergy = 100;
  huntStateFixture.players[PLAYER].pendingTravel = { terrainId: "wilderness", difficulty: "easy", expiresAt: Date.now() + 60000 };
  plan = await actions.huntTravelPlan(ctxFor(freshPlayer()), { groundId: "wilderness", difficulty: "easy" }, DEPS);
  eq("pending travel blocks a new one", plan.error, "pending_travel");

  huntStateFixture.players[PLAYER].pendingTravel = null;
  huntStateFixture.players[PLAYER].activeEncounter = { moraId: "x" };
  plan = await actions.huntTravelPlan(ctxFor(freshPlayer()), { groundId: "wilderness", difficulty: "easy" }, DEPS);
  eq("an active encounter blocks travel", plan.error, "busy_encounter");
  huntStateFixture.players[PLAYER].activeEncounter = null;

  console.log("\n═══ 10. HONEST REFUSALS + DISPATCH ═══");
  const sold = await actions.sell({ playerId: PLAYER }, { itemId: GEAR }, DEPS);
  eq("sell refuses because Lumora has no sell mechanic", sold.error, "not_implemented");

  res = await actions.run("inventoryView", ctxFor(freshPlayer()), {}, DEPS);
  ok("run() dispatches by name", res.ok === true);
  res = await actions.run("MarketList", ctxFor(freshPlayer()), {}, DEPS);
  ok("run() dispatches case-insensitively", res.ok === true);
  res = await actions.run("rollDice", {}, {}, DEPS);
  ok("run() dispatches the camelCase action", res.ok === true && res.data.result >= 1);
  res = await actions.run("nonsense", ctxFor(freshPlayer()), {}, DEPS);
  eq("unknown action name → unknown_action", res.error, "unknown_action");

  res = await actions.run("buy", { playerId: PLAYER, chatId: "x" }, { item: GEAR }, DEPS);
  eq("a missing player store is refused, not crashed", res.error, "no_store");

  const boom = await actions.run("buy", ctxFor(freshPlayer()), { item: GEAR }, {
    items: { loadItems: () => { throw new Error("disk on fire"); } },
    market: marketSystem,
    hunting: huntingSystem,
  });
  eq("a thrown dependency becomes a typed failure", boom.error, "exception");
  ok("the thrown reason survives in the message", boom.message.includes("disk on fire"), boom.message);

  console.log("\n═══ 11. TYPED COMMANDS ROUTE THROUGH THE ACTION LAYER ═══");
  const gearSystem = require("../systems/gear.js");
  const miscSystem = require("../systems/misc.js");

  resetFixtures();
  player = freshPlayer();
  let captured = [];
  const sock = {
    sendMessage: async (chatId, content) => { captured.push(content); return { key: { id: "stub" } }; },
  };
  const cmdCtx = { sock, players: { [PLAYER]: player }, savePlayers: () => { savedPlayers++; } };
  const msg = { key: { id: "m1" } };

  await marketSystem.cmdBuy(cmdCtx, "chat@g.us", PLAYER, msg, [GEAR]);
  ok(".buy sends exactly one chat message", captured.length === 1);
  ok(".buy prints the action layer's purchase card",
    captured[0] && captured[0].text.includes("🛒 *PURCHASE COMPLETE*") && captured[0].text.includes("💳 Lucons Left: *720*"),
    captured[0] && captured[0].text);
  eq(".buy charged through the action layer", player.lucons, 1000 - realItems[GEAR].price);
  eq(".buy added through the action layer", player.inventory[GEAR], 1);

  player = freshPlayer({ inventory: { [GEAR]: 1 } });
  cmdCtx.players[PLAYER] = player;
  captured = [];
  await gearSystem.cmdEquip(cmdCtx, "chat@g.us", PLAYER, msg, [GEAR]);
  ok(".equip prints the action layer's equip card", /✅ \*ITEM EQUIPPED\*/.test(captured[0] && captured[0].text), captured[0] && captured[0].text);
  eq(".equip filled the slot through the action layer", player.equipment.core, GEAR);

  captured = [];
  await gearSystem.cmdUnequip(cmdCtx, "chat@g.us", PLAYER, msg, ["core"]);
  ok(".unequip prints the action layer's card", /📤 \*ITEM UNEQUIPPED\*/.test(captured[0] && captured[0].text), captured[0] && captured[0].text);

  captured = [];
  await miscSystem.cmdRoll(cmdCtx, "chat@g.us", PLAYER, msg, ["100"]);
  ok(".roll prints the action layer's roll result", /^🎲 \*DICE ROLL\* \(1-100\)/.test(captured[0] && captured[0].text), captured[0] && captured[0].text);

  captured = [];
  await marketSystem.cmdBuy(cmdCtx, "chat@g.us", PLAYER, msg, ["not-a-real-item"]);
  ok(".buy still explains refusals in chat", /not currently in the market/.test(captured[0] && captured[0].text), captured[0] && captured[0].text);

  console.log("\n────────────────────────────────");
  console.log(fail === 0 ? "ALL GREEN" : "FAILURES PRESENT");
  console.log("passed " + pass + " / " + (pass + fail));
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error("check crashed:", e);
  process.exitCode = 1;
});

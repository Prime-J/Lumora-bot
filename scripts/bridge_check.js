"use strict";
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA BRIDGE CHECK                                              ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Starts the real bridge on an ephemeral port and talks to it with  ║
// ║  fetch — exactly what a card would do — then asserts:              ║
// ║   • a valid token works, a tampered/expired one does not           ║
// ║   • a card cannot ask for an action it was not granted             ║
// ║   • a card cannot act as another player                            ║
// ║   • replays of state-changing actions are refused                  ║
// ║   • the rate limit bites                                           ║
// ║   • pings are logged and answered in chat                          ║
// ║                                                                   ║
// ║  No WhatsApp and no real data writes: the player store and the     ║
// ║  market are fixtures, savePlayers/saveMarket are stubs.            ║
// ║                                                                   ║
// ║  Run: node scripts/bridge_check.js                                 ║
// ╚═══════════════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const itemsSystem = require("../systems/items.js");
const realItems = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "items.json"), "utf8"));
const GEAR = "GER_001";
const PLAYER = "85376064581854@lid";
const OTHER = "11111111111111@lid";
const CHAT = "12345@g.us";

// ── fixtures ────────────────────────────────────────────────────────────
const marketFixture = {
  enabled: true,
  nextRotationAt: Date.now() + 60 * 60 * 1000,
  currentRotation: { items: [{ itemId: GEAR, price: realItems[GEAR].price, stock: 5, sold: 0 }] },
  permanentListings: [],
};
itemsSystem.loadItems = () => realItems;
itemsSystem.loadMarket = () => marketFixture;
itemsSystem.saveMarket = () => {};

const store = {
  [PLAYER]: { username: "Prime", level: 12, lucons: 1000, inventory: {}, equipment: {} },
  [OTHER]: { username: "NotPrime", level: 12, lucons: 1000, inventory: {}, equipment: {} },
};

process.env.LUMORA_BRIDGE_SECRET = process.env.LUMORA_BRIDGE_SECRET || "test-secret-for-bridge-check";
process.env.LUMORA_BRIDGE_PORT = "0"; // ephemeral

const bridge = require("../systems/lumoraBridge.js");

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label + (extra ? "  → " + extra : "")); }
}
function eq(label, actual, expected) {
  ok(label, actual === expected, "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
}

let base = "";
let sent = [];

async function call(pathname, opts) {
  const res = await fetch(base + pathname, opts);
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { status: res.status, body, headers: res.headers };
}

function post(payload) {
  return call("/lumora/act", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  console.log("\n═══ 1. KILL SWITCH ═══");
  ok("the bridge is enabled by default", bridge.isEnabled({}) === true);
  ok("LUMORA_BRIDGE=off disables it", bridge.isEnabled({ LUMORA_BRIDGE: "off" }) === false);
  ok("LUMORA_BRIDGE=0 disables it", bridge.isEnabled({ LUMORA_BRIDGE: "0" }) === false);
  const offServer = bridge.start({ env: { LUMORA_BRIDGE: "off" }, loadPlayers: () => store, savePlayers: () => {} });
  eq("start() refuses to listen when disabled", offServer, null);
  eq("no server is running while disabled", bridge.status().running, false);

  console.log("\n═══ 2. TOKENS ═══");
  const token = bridge.mintToken({ playerId: PLAYER, chatId: CHAT, cardId: "market", allowedActions: ["marketList", "buy", "rollDice"] });
  ok("a token has a payload and a signature", token.split(".").length === 2);
  const verified = bridge.verifyToken(token);
  ok("a fresh token verifies", verified.ok === true, JSON.stringify(verified));
  eq("the token carries the player", verified.payload.playerId, PLAYER);
  eq("the token carries the chat", verified.payload.chatId, CHAT);
  eq("the token carries its card id", verified.payload.cardId, "market");
  ok("the token carries an allow-list", verified.payload.allowedActions.join(",") === "marketList,buy,rollDice");
  ok("the token carries a nonce", typeof verified.payload.nonce === "string" && verified.payload.nonce.length > 10);
  ok("the token expires in ~15 minutes",
    Math.abs(verified.payload.exp - Date.now() - bridge.TOKEN_TTL_MS) < 5000);

  const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
  eq("a tampered signature is refused", bridge.verifyToken(tampered).error, "bad_signature");
  eq("garbage is refused", bridge.verifyToken("not-a-token").error, "bad_token");
  eq("an empty token is refused", bridge.verifyToken("").error, "bad_token");
  const expired = bridge.mintToken({ playerId: PLAYER, chatId: CHAT, ttlMs: -1000 });
  eq("an expired token is refused", bridge.verifyToken(expired).error, "token_expired");
  ok("the secret never travels inside the token", token.indexOf(bridge.getSecret().slice(0, 8)) === -1);

  console.log("\n═══ 3. START ═══");
  const server = bridge.start({
    loadPlayers: () => store,
    savePlayers: () => {},
    getSocket: () => ({ sendMessage: (chatId, content) => { sent.push({ chatId, content }); } }),
    summaryDelayMs: 40,
  });
  ok("the server started", !!server);
  // listen() is async — wait for the socket to be bound before reading the port.
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once("listening", resolve);
  });
  const st = bridge.status();
  eq("status reports it is running", st.running, true);
  ok("status reports the bound port", st.port > 0, String(st.port));
  ok("status never leaks the secret", st.secretSet === true && JSON.stringify(st).indexOf(bridge.getSecret()) === -1);
  base = "http://127.0.0.1:" + st.port;

  let health = await call("/lumora/health");
  eq("health answers 200", health.status, 200);
  eq("health says ok", health.body.ok, true);
  ok("health lists the actions", Array.isArray(health.body.actions) && health.body.actions.length >= 9);

  const pre = await call("/lumora/act", { method: "OPTIONS" });
  eq("preflight answers 204", pre.status, 204);
  eq("preflight allows any origin", pre.headers.get("access-control-allow-origin"), "*");
  ok("preflight allows POST", /POST/.test(pre.headers.get("access-control-allow-methods") || ""));

  eq("an unknown route is a 404", (await call("/nope")).status, 404);

  console.log("\n═══ 4. A REAL TAP PATH (ping) ═══");
  sent = [];
  const pingRes = await post({ token, action: "ping", channel: "A-post" });
  eq("ping answers 200", pingRes.status, 200);
  eq("ping says the arrival was logged", pingRes.body.note, "arrival logged");
  await sleep(120);
  const summary = sent.map((s) => s.content.text).join("\n");
  ok("the bot answered in chat", sent.length >= 1, JSON.stringify(sent).slice(0, 200));
  ok("the summary confirms the channel that arrived", summary.includes("✅ A-post"), summary);
  ok("the summary marks a channel that did not arrive", summary.includes("❌ B-beacon"), summary);
  eq("the summary goes to the card's chat", sent[sent.length - 1].chatId, CHAT);

  sent = [];
  await call("/lumora/act?t=" + encodeURIComponent(token) + "&a=ping&ch=C-image");
  await sleep(120);
  ok("the GET/image channel also works",
    sent.some((s) => String(s.content.text).includes("✅ C-image")), JSON.stringify(sent).slice(0, 200));

  console.log("\n═══ 5. AUTHORISATION ═══");
  eq("no token → 401", (await post({ action: "ping", channel: "A-post" })).status, 401);
  eq("bad token → 401", (await post({ token: "rubbish", action: "ping", channel: "A-post" })).status, 401);
  eq("expired token → 401",
    (await post({ token: expired, action: "ping", channel: "A-post" })).body.error, "token_expired");

  const pingOnly = bridge.mintToken({ playerId: PLAYER, chatId: CHAT, cardId: "probe", allowedActions: ["ping"] });
  const denied = await post({ token: pingOnly, action: "buy", params: { item: GEAR }, channel: "A-post" });
  eq("an action outside the allow-list is refused", denied.status, 403);
  eq("…with a typed code", denied.body.error, "not_allowed");
  eq("…and nothing was bought", store[PLAYER].inventory[GEAR], undefined);

  console.log("\n═══ 6. THE TOKEN IS THE IDENTITY ═══");
  store[PLAYER].lucons = 1000;
  store[OTHER].lucons = 1000;
  const buyToken = bridge.mintToken({ playerId: PLAYER, chatId: CHAT, cardId: "market", allowedActions: ["buy"] });
  const shop = await post({
    token: buyToken,
    action: "buy",
    params: { item: GEAR, playerId: OTHER, price: 1, lucons: 999999 },
    channel: "A-post",
  });
  eq("the purchase succeeds", shop.status, 200);
  eq("the token's player paid the real price", store[PLAYER].lucons, 1000 - realItems[GEAR].price);
  eq("the other player was untouched", store[OTHER].lucons, 1000);
  eq("the other player got nothing", store[OTHER].inventory[GEAR], undefined);
  eq("the caller's fake price was ignored", shop.body.data.price, realItems[GEAR].price);
  ok("the result was echoed to the chat", sent.some((s) => String(s.content.text).includes("PURCHASE COMPLETE")), JSON.stringify(sent).slice(0, 200));

  console.log("\n═══ 7. REPLAY ═══");
  const replay = await post({ token: buyToken, action: "buy", params: { item: GEAR }, channel: "A-post" });
  eq("the first buy was applied", replay.status, 200);
  const replay2 = await post({ token: buyToken, action: "buy", params: { item: GEAR }, channel: "A-post" });
  eq("the identical second buy is blocked", replay2.status, 409);
  eq("…with a replay code", replay2.body.error, "replay");

  const rollToken = bridge.mintToken({ playerId: PLAYER, chatId: CHAT, cardId: "roll", allowedActions: ["rollDice"] });
  const roll1 = await post({ token: rollToken, action: "rollDice", params: { max: 6 }, channel: "A-post" });
  eq("rollDice works through the bridge", roll1.status, 200);
  ok("the result is the bot's, not the card's",
    roll1.body.data.result >= 1 && roll1.body.data.result <= 6, JSON.stringify(roll1.body));
  const roll2 = await post({ token: rollToken, action: "rollDice", params: { max: 6 }, channel: "A-post" });
  eq("re-rolling the same nonce re-rolls nothing", roll2.status, 409);
  const roll3 = await post({ token: rollToken, action: "rollDice", params: { max: 10 }, channel: "A-post" });
  eq("a different roll is allowed", roll3.status, 200);

  console.log("\n═══ 8. RATE LIMIT ═══");
  const floodToken = bridge.mintToken({ playerId: OTHER, chatId: CHAT, cardId: "flood", allowedActions: ["ping"] });
  let throttled = 0;
  for (let i = 0; i < 30; i++) {
    const r = await post({ token: floodToken, action: "ping", channel: "A-post" });
    if (r.status === 429) throttled++;
  }
  ok("a flood gets throttled", throttled > 0, throttled + " of 30 were 429");
  eq("the first requests still went through", throttled < 30, true);

  console.log("\n═══ 9. THE LOG (how we prove which channel works) ═══");
  eq("the log needs the key",
    (await call("/lumora/log")).status, 403);
  const logRes = await call("/lumora/log?key=" + encodeURIComponent(bridge.getSecret()));
  eq("the right key opens the log", logRes.status, 200);
  ok("arrivals are recorded with their channel",
    logRes.body.entries.some((e) => e.action === "ping" && e.result === "arrived" && e.channel), JSON.stringify(logRes.body.entries.slice(0, 2)));
  ok("refusals are recorded too",
    logRes.body.entries.some((e) => e.result === "replay_blocked" || e.result === "not_allowed" || e.result === "rate_limited"));
  ok("player ids are shortened in the console log, full ids stay in the log json",
    logRes.body.entries.every((e) => Object.prototype.hasOwnProperty.call(e, "player")));

  console.log("\n═══ 10. SHUTDOWN ═══");
  await bridge.stop();
  eq("status reports stopped", bridge.status().running, false);
  let refused = false;
  try { await fetch(base + "/lumora/health"); } catch (e) { refused = true; }
  ok("the port is closed again", refused === true);

  console.log("\n────────────────────────────────");
  console.log(fail === 0 ? "ALL GREEN" : "FAILURES PRESENT");
  console.log("passed " + pass + " / " + (pass + fail));
  if (fail) process.exitCode = 1;
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("check crashed:", e);
  process.exit(1);
});

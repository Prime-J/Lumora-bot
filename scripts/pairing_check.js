"use strict";
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LOGIN / PAIRING CHECK                                            ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Verifies the link-with-code login without touching WhatsApp:      ║
// ║   • number normalisation and validation                           ║
// ║   • env / stored-file / prompt precedence                         ║
// ║   • code request success, retry and failure paths                 ║
// ║   • the QR code is still reachable as a fallback                  ║
// ║   • index.js actually routes its qr events through the flow       ║
// ║                                                                   ║
// ║  Run: node scripts/pairing_check.js                               ║
// ╚═══════════════════════════════════════════════════════════════════╝

const fs = require("fs");
const os = require("os");
const path = require("path");

const pairingFile = require.resolve("../systems/pairing.js");
void pairingFile;

const pairing = require("../systems/pairing.js");

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

/** Capture console.log while fn() runs. */
function capture(fn) {
  const lines = [];
  const real = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.log = real;
  }
  return lines.join("\n");
}

(async function main() {
  const tmpFile = path.join(os.tmpdir(), "lumora-pairing-check.json");
  try { fs.unlinkSync(tmpFile); } catch (e) {}

  console.log("\n═══ 1. NUMBER NORMALISATION ═══");
  eq("strips +, spaces and dashes", pairing.normalizePairingNumber("+234 810-123 4567"), "2348101234567");
  eq("strips (0) area brackets", pairing.normalizePairingNumber("+1 (555) 010-9999"), "15550109999");
  eq("leading 00 becomes a country code", pairing.normalizePairingNumber("002348101234567"), "2348101234567");
  eq("empty input", pairing.normalizePairingNumber(""), "");
  eq("null input is safe", pairing.normalizePairingNumber(null), "");
  eq("7 digits is too short", pairing.isValidPairingNumber("1234567"), false);
  eq("8 digits is valid", pairing.isValidPairingNumber("12345678"), true);
  eq("15 digits is valid", pairing.isValidPairingNumber("123456789012345"), true);
  eq("16 digits is too long", pairing.isValidPairingNumber("1234567890123456"), false);

  console.log("\n═══ 1b. THE “COULDN'T LINK DEVICE” BUG ═══");
  // Prime typed 08083028530 and WhatsApp answered "Couldn't link device —
  // check the phone number is correct". A local number is not linkable.
  eq("a local number is NOT accepted", pairing.isValidPairingNumber("08083028530"), false);
  eq("…it is recognised as missing a country code", pairing.needsCountryCode("08083028530"), true);
  eq("…and the country code fixes it",
    pairing.normalizePairingNumber("08083028530", { countryCode: "234" }), "2348083028530");
  ok("the fixed number is valid",
    pairing.isValidPairingNumber("08083028530", { countryCode: "234" }) === true);
  eq("00 + local still ends up international",
    pairing.normalizePairingNumber("0008083028530", { countryCode: "234" }), "2348083028530");
  eq("an international number is untouched",
    pairing.normalizePairingNumber("2348083028530", { countryCode: "234" }), "2348083028530");
  eq("a US number is not mistaken for a local one", pairing.needsCountryCode("+1 555 010 9999"), false);
  eq("a country code can be read from the env", pairing.countryCodeFrom({ LUMORA_COUNTRY_CODE: "234" }), "234");
  eq("…including its aliases", pairing.countryCodeFrom({ BOT_COUNTRY_CODE: "+234" }), "234");
  eq("no country code configured", pairing.countryCodeFrom({}), "");
  ok("a one-word country code is not a country code", pairing.looksLikeCountryCode("234") === true &&
    pairing.looksLikeCountryCode("12345") === false && pairing.looksLikeCountryCode("0") === false);

  console.log("\n═══ 1c. HOW A TYPED ANSWER IS INTERPRETED ═══");
  let typed = pairing.interpretPromptAnswer("08083028530", {});
  eq("a local number asks for the country code instead of sending it", typed.error, "need_country_code");
  eq("…and the local number is kept for the next question", typed.local, "08083028530");
  typed = pairing.interpretPromptAnswer("08083028530", { countryCode: "234" });
  ok("with a country code it is accepted", typed.ok === true && typed.number === "2348083028530", JSON.stringify(typed));
  ok("…and flagged as auto-fixed", typed.fixed === true && typed.countryCode === "234");
  typed = pairing.interpretPromptAnswer("2348083028530", {});
  ok("an international number is accepted as typed", typed.ok === true && typed.fixed === undefined, JSON.stringify(typed));
  eq("garbage is refused", pairing.interpretPromptAnswer("123", {}).error, "invalid");
  eq("nothing typed means the QR code", pairing.interpretPromptAnswer("   ", {}).error, "empty");
  eq("+234… with punctuation is accepted", pairing.interpretPromptAnswer("+234 808 302 8530", {}).ok, true);

  console.log("\n═══ 2. CODE FORMATTING ═══");
  eq("8-char code gets a dash", pairing.formatCode("abcdefgh"), "ABCD-EFGH");
  eq("already-dashed code is stable", pairing.formatCode("ABCD-EFGH"), "ABCD-EFGH");
  eq("lowercase with spaces", pairing.formatCode("ab cd ef gh"), "ABCD-EFGH");
  eq("garbage degrades safely", pairing.formatCode(""), "????????");

  console.log("\n═══ 3. WHERE THE NUMBER COMES FROM ═══");
  const noStore = path.join(os.tmpdir(), "lumora-pairing-absent-" + Date.now() + ".json");
  const envCfg = pairing.resolveLoginConfig({ PAIRING_NUMBER: "+234 810 123 4567" }, noStore);
  eq("env number wins", envCfg.number, "2348101234567");
  eq("env source is reported", envCfg.source, "env:PAIRING_NUMBER");
  eq("alias BOT_NUMBER works", pairing.resolveLoginConfig({ BOT_NUMBER: "2348101234567" }, noStore).number, "2348101234567");
  eq("alias WHATSAPP_NUMBER works", pairing.resolveLoginConfig({ WHATSAPP_NUMBER: "2348101234567" }, noStore).number, "2348101234567");
  ok("LUMORA_LOGIN=qr forces the QR path", pairing.resolveLoginConfig({ LUMORA_LOGIN: "qr" }, noStore).forceQr === true);
  ok("LUMORA_LOGIN=scan forces the QR path", pairing.resolveLoginConfig({ LUMORA_LOGIN: "scan" }, noStore).forceQr === true);
  eq("a junk env number is ignored", pairing.resolveLoginConfig({ PAIRING_NUMBER: "nope" }, noStore).number, null);

  const localEnv = pairing.resolveLoginConfig({ PAIRING_NUMBER: "08083028530" }, noStore);
  eq("a local number in the env is NOT sent to WhatsApp", localEnv.number, null);
  eq("…it is reported as missing its country code", localEnv.needsCountryCode, "08083028530");
  ok("…with a source that says so", /missing country code/.test(localEnv.source), localEnv.source);
  const localEnvFixed = pairing.resolveLoginConfig({ PAIRING_NUMBER: "08083028530", LUMORA_COUNTRY_CODE: "234" }, noStore);
  eq("…unless a country code is configured", localEnvFixed.number, "2348083028530");

  console.log("\n═══ 3b. THE NUMBER PRIME ALREADY SAVED ═══");
  const storeFile = path.join(os.tmpdir(), "lumora-pairing-store-" + Date.now() + ".json");
  fs.writeFileSync(storeFile, JSON.stringify({ number: "08083028530", addedAt: new Date().toISOString() }));
  const stored = pairing.resolveLoginConfig({}, storeFile);
  eq("his saved local number is not reused blindly", stored.number, null);
  eq("…it is surfaced so the bot can ask", stored.needsCountryCode, "08083028530");
  const storedFixed = pairing.resolveLoginConfig({ LUMORA_COUNTRY_CODE: "234" }, storeFile);
  eq("add LUMORA_COUNTRY_CODE=234 and it is fixed on the next start", storedFixed.number, "2348083028530");
  eq("…and remembered for later", pairing.readStore(storeFile).countryCode, "");
  pairing.saveNumber("2348083028530", storeFile, "234");
  eq("the corrected number is saved", pairing.readStore(storeFile).number, "2348083028530");
  eq("the country code is saved with it", pairing.readStore(storeFile).countryCode, "234");
  eq("a later run needs no questions", pairing.resolveLoginConfig({}, storeFile).number, "2348083028530");
  try { fs.unlinkSync(storeFile); } catch (e) {}

  console.log("\n═══ 4. STORED NUMBER (data/pairing.json) ═══");
  eq("nothing stored yet", pairing.readStoredNumber(tmpFile), null);
  eq("invalid number is refused", pairing.saveNumber("123", tmpFile), false);
  eq("valid number is saved", pairing.saveNumber("+2348101234567", tmpFile), true);
  eq("stored number reads back normalised", pairing.readStoredNumber(tmpFile), "2348101234567");
  ok("the file on disk holds the number", fs.readFileSync(tmpFile, "utf8").indexOf("2348101234567") > 0);
  eq("corrupt file degrades to null", (fs.writeFileSync(tmpFile, "{ not json"), pairing.readStoredNumber(tmpFile)), null);
  try { fs.unlinkSync(tmpFile); } catch (e) {}

  console.log("\n═══ 5. REQUESTING A CODE ═══");
  const goodSock = { requestPairingCode: async (n) => (n === "2348101234567" ? "abcdefgh" : "x") };
  const good = await pairing.requestPairingCode(goodSock, "+234 810 123 4567");
  ok("happy path returns ok", good.ok === true, JSON.stringify(good));
  eq("code is formatted", good.code, "ABCD-EFGH");

  let attempts = 0;
  const flakySock = { requestPairingCode: async () => { attempts++; if (attempts === 1) throw new Error("Connection Closed"); return "zzzzzzzz"; } };
  const flaky = await pairing.requestPairingCode(flakySock, "2348101234567", 2);
  ok("retry recovers a transient failure", flaky.ok === true && attempts === 2, JSON.stringify({ flaky, attempts }));

  const deadSock = { requestPairingCode: async () => { throw new Error("401 logged out"); } };
  const dead = await pairing.requestPairingCode(deadSock, "2348101234567", 1);
  ok("permanent failure reports the reason", dead.ok === false && /401/.test(dead.error), JSON.stringify(dead));

  const emptySock = { requestPairingCode: async () => undefined };
  const empty = await pairing.requestPairingCode(emptySock, "2348101234567", 1);
  ok("no code returned is a failure", empty.ok === false, JSON.stringify(empty));

  const oldSock = {};
  const old = await pairing.requestPairingCode(oldSock, "2348101234567", 1);
  ok("old socket without requestPairingCode fails gracefully", old.ok === false && /requestPairingCode/.test(old.error));

  const badNumber = await pairing.requestPairingCode(goodSock, "123", 1);
  ok("bad number is rejected before asking WhatsApp", badNumber.ok === false && /invalid/i.test(badNumber.error));

  let asked = null;
  const spySock = { requestPairingCode: async (n) => { asked = n; return "abcdefgh"; } };
  const localNumber = await pairing.requestPairingCode(spySock, "08083028530", 1);
  ok("a local number is never sent to WhatsApp", localNumber.ok === false && asked === null,
    "asked=" + asked + " → " + JSON.stringify(localNumber));
  ok("…and the refusal explains the country code", /country code/i.test(localNumber.error), localNumber.error);
  const fixedNumber = await pairing.requestPairingCode(spySock, "2348083028530", 1);
  ok("the fixed number is sent as-is", fixedNumber.ok === true && asked === "2348083028530", String(asked));

  console.log("\n═══ 6. OUTPUT + THROTTLING ═══");
  const banner = capture(() => pairing.printPairingBanner("2348101234567", "abcdefgh"));
  ok("banner shows the number", banner.indexOf("2348101234567") > 0);
  ok("banner shows the dashed code", banner.indexOf("ABCD-EFGH") > 0);
  ok("banner explains the phone steps", /Link with phone number instead/.test(banner));

  const remind = pairing.makeWaitingReminder();
  const reminded = capture(() => { remind("ABCD-EFGH"); remind("ABCD-EFGH"); remind("ABCD-EFGH"); });
  eq("waiting reminder is throttled to one line", reminded.split("\n").filter(Boolean).length, 1);

  const qrOut = capture(() => pairing.printQr("2@abc/def", "fallback reason"));
  ok("QR fallback still prints a QR code", qrOut.length > 0 && qrOut.indexOf("fallback reason") > 0);

  console.log("\n═══ 7. PROMPT BEHAVIOUR ═══");
  if (!process.stdin.isTTY) {
    const t0 = Date.now();
    let notice = "";
    const realLog = console.log;
    console.log = (...args) => { notice += args.join(" ") + "\n"; };
    let noTty = null;
    try {
      noTty = await pairing.promptForPairingNumber(2000);
    } finally {
      console.log = realLog;
    }
    eq("no terminal → no prompt, no number", noTty, null);
    ok("no terminal → returns immediately", Date.now() - t0 < 1500, (Date.now() - t0) + "ms");
    // Silence WAS the bug report: with no TTY the whole stage vanished with
    // no trace. Now it says what happened and what to do instead.
    ok("no terminal → it SAYS the question was skipped",
      /number question was skipped/.test(notice), JSON.stringify(notice));
    ok("…and points at PAIRING_NUMBER", /PAIRING_NUMBER=/.test(notice), notice);
  } else {
    console.log("  ⏭️  skipped (running on a real terminal)");
  }
  const pairingSrc = fs.readFileSync(pairingFile, "utf8");
  ok("the TTY-less notice exists in the source (covers TTY runs too)",
    /number question was skipped/.test(pairingSrc));

  console.log("\n═══ 7c. THE NUMBER-PROMPT GATE (\"it skips the number stage\") ═══");
  // data/pairing.json remembered a number, so the old gate
  // `!loginConfig.number` never asked again — the input stage simply never
  // appeared. Pin both halves: memory stays the default, the re-ask flips it.
  ok("a number on file → the prompt is skipped (remembered on purpose)",
    pairing.shouldAskForNumber({ registered: false, number: "2348083028530" }) === false);
  ok("…unless a re-ask was requested",
    pairing.shouldAskForNumber({ registered: false, number: "2348083028530", forcePrompt: true }) === true);
  ok("no number on file → the prompt runs",
    pairing.shouldAskForNumber({ registered: false, number: null }) === true);
  ok("an empty config still asks", pairing.shouldAskForNumber({}) === true);
  ok("a registered session is never asked",
    pairing.shouldAskForNumber({ registered: true, forcePrompt: true }) === false);
  ok("LUMORA_LOGIN=qr wins over the re-ask",
    pairing.shouldAskForNumber({ forceQr: true, forcePrompt: true }) === false);

  ok("LUMORA_PROMPT_NUMBER=1 requests the re-ask",
    pairing.shouldPromptForNumber({ LUMORA_PROMPT_NUMBER: "1" }, ["node", "index.js"]) === true);
  ok("…alias LUMORA_ASK_NUMBER works too",
    pairing.shouldPromptForNumber({ LUMORA_ASK_NUMBER: "true" }, ["node", "index.js"]) === true);
  ok("--pair requests it",
    pairing.shouldPromptForNumber({}, ["node", "index.js", "--pair"]) === true);
  ok("--ask-number requests it",
    pairing.shouldPromptForNumber({}, ["node", "index.js", "--ask-number"]) === true);
  ok("unset → no re-ask (normal starts stay quiet)",
    pairing.shouldPromptForNumber({}, ["node", "index.js"]) === false);
  ok("\"0\" turns it off",
    pairing.shouldPromptForNumber({ LUMORA_PROMPT_NUMBER: "0" }, ["node", "index.js"]) === false);
  ok("\"false\" turns it off",
    pairing.shouldPromptForNumber({ LUMORA_PROMPT_NUMBER: "false" }, ["node", "index.js"]) === false);
  ok("junk is not treated as yes, case does not matter",
    pairing.isTruthyFlag("maybe") === false && pairing.isTruthyFlag("YES") === true);

  const plainBanner = pairing.promptBanner({});
  ok("without a saved number the banner offers the QR code",
    /use the QR code instead/.test(plainBanner), plainBanner);
  const reaskBanner = pairing.promptBanner({ savedNumber: "2348083028530" });
  ok("with a saved number it offers to KEEP it (no false QR promise)",
    /keep \+2348083028530/.test(reaskBanner), reaskBanner);
  ok("…and never promises a QR it will not show",
    !/QR code instead/.test(reaskBanner), reaskBanner);

  console.log("\n═══ 7a. THE HALF-PAIRED TRAP (the 401 dead end) ═══");
  // requestPairingCode() writes creds.me immediately; Baileys then skips the
  // pairing flow forever (socket.js: `if (!creds.me)`), so WhatsApp answers 401
  // on every start. That folder has to be thrown away.
  const freshCreds = { registered: false };
  const lockedOut = { registered: false, pairingCode: "9TF3WS7H", me: { id: "2348083028530@s.whatsapp.net", name: "~" } };
  const healthy = { registered: true, pairingCode: "ABCDEFGH", me: { id: "2348083028530@s.whatsapp.net", name: "Prime" } };
  // Right after a SUCCESSFUL pair, creds briefly have me + pairingCode with
  // registered still false — archiving that would throw away a working link.
  const justPaired = { registered: false, pairingCode: "ABCDEFGH", me: { id: "2348083028530@s.whatsapp.net", name: "~", lid: "99@lid" } };
  const stuckDir = path.join(os.tmpdir(), "lumora-auth-stuck-" + Date.now());
  fs.mkdirSync(stuckDir, { recursive: true });
  fs.writeFileSync(path.join(stuckDir, "creds.json"), JSON.stringify(lockedOut));
  // index.js writes its single-instance lock at auth/.lock BEFORE this check
  // runs, so the real folder on disk always has one. Counting it as session
  // material made the half-paired heal dead code.
  fs.writeFileSync(path.join(stuckDir, ".lock"), "21120");
  const pairedDir = path.join(os.tmpdir(), "lumora-auth-paired-" + Date.now());
  fs.mkdirSync(pairedDir, { recursive: true });
  fs.writeFileSync(path.join(pairedDir, "creds.json"), JSON.stringify(justPaired));
  fs.writeFileSync(path.join(pairedDir, "pre-key-1.json"), "{}");
  fs.writeFileSync(path.join(pairedDir, "app-state-sync-version-regular.json"), "{}");

  eq("a code that was requested but never used IS half-paired",
    pairing.isHalfPaired(lockedOut, { dir: stuckDir }), true);
  eq("…and a folder with only creds.json confirms it", pairing.countAuthFiles(stuckDir), 1);
  eq("…even with index.js' .lock file sitting in it",
    pairing.isHalfPaired(lockedOut, { dir: stuckDir }), true);
  eq("…because the .lock is not session material", pairing.countAuthFiles(stuckDir), 1);
  eq("a working session is NOT half-paired", pairing.isHalfPaired(healthy, { dir: stuckDir }), false);
  eq("an untouched folder is NOT half-paired", pairing.isHalfPaired(freshCreds, { dir: stuckDir }), false);
  eq("a missing creds file is NOT half-paired", pairing.isHalfPaired(null, { dir: stuckDir }), false);
  eq("me without a pairingCode is not treated as broken",
    pairing.isHalfPaired({ registered: false, me: { id: "x@s.whatsapp.net" } }, { dir: stuckDir }), false);
  eq("a session that JUST paired is protected by its lid",
    pairing.isHalfPaired(justPaired, { dir: pairedDir }), false);
  eq("…and by the session files it wrote",
    pairing.isHalfPaired({ registered: false, pairingCode: "ABCDEFGH", me: { id: "x@s.whatsapp.net" } }, { dir: pairedDir }), false);
  ok("a folder with session material is never archived", pairing.countAuthFiles(pairedDir) > 1);
  try { fs.rmSync(stuckDir, { recursive: true, force: true }); fs.rmSync(pairedDir, { recursive: true, force: true }); } catch (e) {}

  const authDir = path.join(os.tmpdir(), "lumora-auth-check-" + Date.now());
  const missing = pairing.archiveAuthDir({ dir: authDir });
  eq("archiving a folder that is not there fails cleanly", missing.ok, false);
  ok("…and says why", /no auth folder/.test(missing.error), missing.error);
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify(lockedOut));
  const archived = pairing.archiveAuthDir({ dir: authDir, label: "halfpaired" });
  eq("the broken folder is moved aside", archived.ok, true);
  ok("…into a folder that says what happened", /\.halfpaired-/.test(archived.to), archived.to);
  eq("…the original is gone", fs.existsSync(authDir), false);
  eq("…and nothing was deleted", JSON.parse(fs.readFileSync(path.join(archived.to, "creds.json"), "utf8")).pairingCode, "9TF3WS7H");
  eq("a folder with no lock is not relocked", archived.relocked, false);
  eq("reading creds from a missing folder is safe", pairing.readCreds(authDir), null);
  try { fs.rmSync(archived.to, { recursive: true, force: true }); } catch (e) {}

  // Archiving must not drop the single-instance guard: two bots on one auth
  // folder is what corrupts creds.json.
  const lockedDir = path.join(os.tmpdir(), "lumora-auth-locked-" + Date.now());
  fs.mkdirSync(lockedDir, { recursive: true });
  fs.writeFileSync(path.join(lockedDir, "creds.json"), JSON.stringify(lockedOut));
  fs.writeFileSync(path.join(lockedDir, ".lock"), "99999");
  const relocked = pairing.archiveAuthDir({ dir: lockedDir, label: "halfpaired" });
  eq("archiving a locked folder succeeds", relocked.ok, true);
  eq("…and the lock is re-armed for this process", relocked.relocked, true);
  eq("…pointing at us", fs.readFileSync(path.join(lockedDir, ".lock"), "utf8"), String(process.pid));
  eq("…so the next boot still sees a live lock", fs.existsSync(path.join(lockedDir, ".lock")), true);
  eq("…and the old folder still holds the old creds",
    JSON.parse(fs.readFileSync(path.join(relocked.to, "creds.json"), "utf8")).pairingCode, "9TF3WS7H");
  try { fs.rmSync(lockedDir, { recursive: true, force: true }); fs.rmSync(relocked.to, { recursive: true, force: true }); } catch (e) {}

  console.log("\n═══ 7b. THE LINK WINDOW (QR refs) ═══");
  eq("the default window is 3 minutes per QR ref", pairing.qrTimeoutMs({}), 180000);
  eq("…which is a ~15 minute link window", pairing.qrTimeoutMs({}) * 5 / 60000, 15);
  eq("the window is configurable", pairing.qrTimeoutMs({ LUMORA_QR_TIMEOUT_MS: "60000" }), 60000);
  eq("an absurdly short window is raised", pairing.qrTimeoutMs({ LUMORA_QR_TIMEOUT_MS: "5" }), 30000);
  eq("an absurdly long window is capped", pairing.qrTimeoutMs({ LUMORA_QR_TIMEOUT_MS: "99999999" }), 900000);
  eq("junk falls back to the default", pairing.qrTimeoutMs({ LUMORA_QR_TIMEOUT_MS: "soon" }), pairing.DEFAULT_QR_TIMEOUT_MS);
  ok("Baileys' default of 60s is deliberately overridden", pairing.qrTimeoutMs({}) > 60000);

  console.log("\n═══ 7b. CODE REFRESH (codes expire in minutes) ═══");
  let issued = [];
  let fails = [];
  const refresher = pairing.startCodeRefresh({
    number: "2348083028530",
    intervalMs: 5,
    max: 3,
    request: async () => ({ ok: true, code: "zzzz" + issued.length }),
    onCode: (code, n) => issued.push({ code, n }),
    onFail: (err, n) => fails.push({ err, n }),
  });
  ok("a refresher starts running", refresher.running === true);
  ok("it wants to refresh while it can", refresher.shouldRefresh() === true);
  await new Promise((r) => setTimeout(r, 60));
  eq("it stopped at its own limit", refresher.count, 3);
  eq("every refresh reported a fresh code", issued.length, 3);
  ok("the refreshes are numbered", issued.map((i) => i.n).join(",") === "1,2,3");
  ok("it stops itself once spent", refresher.running === false && refresher.shouldRefresh() === false);

  const stopped = pairing.startCodeRefresh({
    number: "2348083028530",
    intervalMs: 5,
    max: 5,
    request: async () => ({ ok: true, code: "aaaa" }),
    onCode: () => issued.push({ code: "late", n: 99 }),
  });
  const before = issued.length;
  stopped.stop();
  await new Promise((r) => setTimeout(r, 30));
  eq("stop() really stops it", issued.length, before);
  eq("…and a stop is reported", stopped.running, false);

  const noNumber = pairing.startCodeRefresh({ number: "", request: async () => ({ ok: true }) });
  eq("no number means no refresher", noNumber.running, false);
  noNumber.stop();

  console.log("\n═══ 8. INDEX.JS WIRING ═══");
  const src = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  ok("index.js requires the pairing module", /require\("\.\/systems\/pairing"\)/.test(src));
  ok("login method is resolved before the socket is made",
    src.indexOf("pairing.resolveLoginConfig()") > 0 &&
    src.indexOf("pairing.resolveLoginConfig()") < src.indexOf("const sock = makeWASocket({"));
  ok("qr events go through the pairing flow", /pairingFlow\.handleQr\(qr\);/.test(src));
  ok("the flow requests a pairing code", /pairing\.requestPairingCode\(sock, this\.number\)/.test(src));
  ok("the QR code is still the fallback", /pairing\.printQr\(qr/.test(src));
  ok("a failed code request falls back to the QR code",
    /Pairing code unavailable[\s\S]{0,200}pairing\.printQr\(qr\)/.test(src));
  ok("the startup prompt runs through the one tested gate",
    /pairing\.shouldAskForNumber\(\{[\s\S]{0,400}\}\);[\s\S]{0,80}if \(needsNumberPrompt\)/.test(src) &&
    /if \(needsNumberPrompt\) \{[\s\S]{0,1500}promptForPairingNumber/.test(src));
  ok("…and the gate is told about session, QR mode, saved number, re-ask",
    /registered: !!state\.creds\?\.registered,[\s\S]{0,300}forcePrompt: reAskNumber/.test(src));
  ok("the re-ask switch is wired into index.js",
    /pairing\.shouldPromptForNumber\(\)/.test(src));
  ok("the prompt is shown what is already on file",
    /savedNumber: loginConfig\.number/.test(src));
  ok("the prompt answer is remembered", /pairing\.saveNumber\(answered/.test(src));
  ok("a leading-zero number is spotted before it is sent", /loginConfig\.needsCountryCode/.test(src));
  ok("the prompt is told about the country code", /promptForPairingNumber\(\{[\s\S]{0,120}countryCode/.test(src));
  ok("the link window is handed to Baileys", /qrTimeout: pairing\.qrTimeoutMs\(\)/.test(src));
  ok("a half-paired folder is archived before connecting",
    /pairing\.isHalfPaired\(staleCreds, \{ dir: pairing\.AUTH_DIR \}\)[\s\S]{0,300}pairing\.archiveAuthDir/.test(src));
  ok("…and the archive happens before the auth state is loaded",
    src.indexOf("pairing.archiveAuthDir({ label: \"halfpaired\" })") < src.indexOf("await useMultiFileAuthState"));
  ok("a 401 on a half-paired folder heals itself once",
    /!authHealedOnce && pairing\.isHalfPaired\(pairing\.readCreds\(\)[\s\S]{0,1200}archiveAuthDir/.test(src));
  ok("…and only once per process", /let authHealedOnce = false;/.test(src));
  ok("the banner tells Prime how long he has", /windowMs: pairing\.qrTimeoutMs\(\) \* 5/.test(src));
  ok("code refreshing is opt-in, so a second code cannot kill the first",
    /LUMORA_CODE_REFRESH[\s\S]{0,160}startCodeRefresh/.test(src));
  ok("the banner can show the country code",
    /printPairingBanner\(this\.number, res\.code, \{[\s\S]{0,160}countryCode/.test(src));

  console.log("\n────────────────────────────────");
  console.log(fail === 0 ? "ALL GREEN" : "FAILURES PRESENT");
  console.log("passed " + pass + " / " + (pass + fail));
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error("check crashed:", e);
  process.exitCode = 1;
});

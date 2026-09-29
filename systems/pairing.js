"use strict";
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  LUMORA LOGIN — QR code **and** link-with-code (WhatsApp pairing code) ║
// ╠═══════════════════════════════════════════════════════════════════════╣
// ║  WhatsApp supports two ways to link a device:                          ║
// ║    1. scan the QR code  (what the bot printed before)                  ║
// ║    2. "Link with phone number instead" → enter an 8-character code      ║
// ║                                                                       ║
// ║  THE NUMBER RULE (this is the one that bites):                         ║
// ║  WhatsApp wants the number in INTERNATIONAL form — country code, no    ║
// ║  leading zero. A Nigerian number typed as 08083028530 must become      ║
// ║  2348083028530. Send the leading zero and WhatsApp answers             ║
// ║  "Couldn't link device — check the phone number is correct".           ║
// ║                                                                       ║
// ║  So: a leading 0 is treated as a trunk prefix and replaced with the    ║
// ║  country code, which comes from                                     ║
// ║    LUMORA_COUNTRY_CODE (or BOT_COUNTRY_CODE / PAIRING_COUNTRY_CODE),    ║
// ║    data/pairing.json → countryCode,                                    ║
// ║    or the question the bot asks when it sees one.                      ║
// ║  With no country code known we REFUSE to send the request rather than  ║
// ║  burning a doomed code.                                               ║
// ║                                                                       ║
// ║  Where the number comes from, in order:                               ║
// ║    • env  PAIRING_NUMBER | BOT_NUMBER | WHATSAPP_NUMBER |             ║
// ║           LUMORA_NUMBER | PHONE_NUMBER                                ║
// ║    • data/pairing.json   (written when you answer the startup prompt) ║
// ║    • the startup prompt  (local runs only — needs a real terminal)    ║
// ║                                                                       ║
// ║  Force the old QR-only flow with: LUMORA_LOGIN=qr                     ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const STORE_PATH = path.join(__dirname, "..", "data", "pairing.json");
const AUTH_DIR = path.join(__dirname, "..", "auth");
const LOCK_NAME = ".lock";
const ENV_KEYS = ["PAIRING_NUMBER", "BOT_NUMBER", "WHATSAPP_NUMBER", "LUMORA_NUMBER", "PHONE_NUMBER"];
const COUNTRY_KEYS = ["LUMORA_COUNTRY_CODE", "BOT_COUNTRY_CODE", "PAIRING_COUNTRY_CODE"];
// A remembered number normally skips the startup question — that memory is
// exactly what made "the number stage get skipped". These opt-in switches
// ask again: LUMORA_PROMPT_NUMBER=1 (or the bot started with --pair).
const PROMPT_KEYS = ["LUMORA_PROMPT_NUMBER", "LUMORA_ASK_NUMBER"];
const PROMPT_TRUE = ["1", "true", "yes", "on", "ask"];
const PROMPT_TIMEOUT_MS = 25000;
const REMINDER_EVERY_MS = 30000;
// A pairing code lives only a few minutes. Refreshing it is OFF by default:
// Baileys' qrTimeout keeps the same window open far longer, and a second
// requestPairingCode only invalidates the code the player is already typing.
const REFRESH_EVERY_MS = 150000;
const MAX_REFRESHES = 3;

// WhatsApp hands the socket a fixed list of pair-device refs. Baileys shows one
// QR per ref, waits `qrTimeout` before moving to the next, and drops the socket
// ("QR refs attempts ended", code 408) once the list runs out — whether or not a
// pairing code was requested. The default (60s on the first ref, 20s on the
// rest) is ~2 minutes for the 5 refs WhatsApp usually sends: far too short to
// open WhatsApp, find Linked Devices and type 8 characters. 3 minutes per ref
// is a ~15 minute window.
const DEFAULT_QR_TIMEOUT_MS = 180000;
const MIN_QR_TIMEOUT_MS = 30000;
const MAX_QR_TIMEOUT_MS = 900000;

function qrTimeoutMs(env) {
  const raw = Number((env || process.env).LUMORA_QR_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_QR_TIMEOUT_MS;
  return Math.min(Math.max(raw, MIN_QR_TIMEOUT_MS), MAX_QR_TIMEOUT_MS);
}

/**
 * THE HALF-PAIRED TRAP — this is what locks a bot out of WhatsApp.
 *
 * Baileys' requestPairingCode() writes creds.me (your number) and
 * creds.pairingCode to auth/creds.json IMMEDIATELY. The socket then decides
 * how to connect with `if (!creds.me)` — so a folder that has `me` but never
 * finished pairing NEVER runs the pairing flow again: it tries to resume a
 * session that was never created, and WhatsApp answers 401 Connection
 * Failure on every start. Nothing recovers it. It has to be thrown away.
 *
 * Two guards keep this from touching a session that DID pair:
 *  • Baileys binds me.lid on pair-success, so a folder with me.lid is real.
 *  • A completed pairing writes session material (pre-keys, app-state), so a
 *    folder holding nothing but creds.json never finished.
 *
 * Dot-files deliberately do not count. index.js keeps its single-instance lock
 * at auth/.lock and writes it before this check runs, so counting every entry
 * made every half-paired folder look like a finished one — the 401 dead end
 * then survived the very check written to escape it.
 */
function countAuthFiles(dir) {
  try {
    return fs
      .readdirSync(dir || AUTH_DIR)
      .filter((name) => !name.startsWith(".") && name.endsWith(".json")).length;
  } catch (e) {
    return null;
  }
}

function isHalfPaired(creds, opts) {
  if (!creds || !creds.me || creds.registered === true || !creds.pairingCode) return false;
  if (creds.me.lid) return false; // pairing completed: the lid was bound
  const files = countAuthFiles(opts && opts.dir);
  if (files != null && files > 1) return false; // session material exists → not stuck
  return true;
}

function readCreds(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir || AUTH_DIR, "creds.json"), "utf8"));
  } catch (e) {
    return null;
  }
}

/**
 * Move a broken/half-paired auth folder aside. Renames, never deletes — an
 * older working session still exists if the operator wants it back.
 *
 * The single-instance lock travels with the folder, which would leave this
 * process unlocked, so it is re-armed on the way out. Two bots sharing ./auth
 * is precisely what corrupts creds.json and forces a re-link.
 * @returns {{ ok:boolean, from?:string, to?:string, relocked?:boolean, error?:string }}
 */
function archiveAuthDir(opts) {
  const o = opts || {};
  const dir = o.dir || AUTH_DIR;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = dir + "." + (o.label || "broken") + "-" + stamp;
  try {
    if (!fs.existsSync(dir)) return { ok: false, error: "no auth folder at " + dir };
    const hadLock = fs.existsSync(path.join(dir, LOCK_NAME));
    fs.renameSync(dir, target);
    if (hadLock) {
      // Best effort: a missing lock must never stop the re-pair.
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, LOCK_NAME), String(process.pid));
      } catch (e) {}
    }
    return { ok: true, from: dir, to: target, relocked: hadLock };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function digitsOnly(value) {
  return String(value == null ? "" : value).replace(/[^0-9]/g, "");
}

function countryCodeFrom(env) {
  const e = env || process.env;
  for (const key of COUNTRY_KEYS) {
    const cc = digitsOnly(e[key]).replace(/^0+/, "");
    if (cc.length >= 1 && cc.length <= 4) return cc;
  }
  return "";
}

/** Keep digits only, drop 00, and turn a leading 0 into the country code. */
function normalizePairingNumber(raw, opts) {
  const o = opts || {};
  let digits = digitsOnly(raw);
  if (/^00/.test(digits)) digits = digits.slice(2);
  if (/^0/.test(digits)) {
    const cc = digitsOnly(o.countryCode).replace(/^0+/, "");
    if (cc) digits = cc + digits.slice(1);
  }
  return digits;
}

/** True when this is a local number missing its country code (0808…, 07… …). */
function needsCountryCode(raw) {
  const digits = digitsOnly(raw);
  const stripped = digits.replace(/^00/, "");
  if (!/^0/.test(stripped)) return false;
  const rest = stripped.replace(/^0+/, "");
  return rest.length >= 7 && rest.length <= 12;
}

/** International numbers are 8–15 digits and never start with 0. */
function isValidPairingNumber(raw, opts) {
  const n = normalizePairingNumber(raw, opts);
  return n.length >= 8 && n.length <= 15 && !/^0/.test(n);
}

function readStore(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file || STORE_PATH, "utf8"));
    return {
      number: raw && raw.number != null ? digitsOnly(raw.number) : "",
      countryCode: raw && raw.countryCode != null ? digitsOnly(raw.countryCode) : "",
    };
  } catch (e) {
    return { number: "", countryCode: "" };
  }
}

function readStoredNumber(file) {
  const stored = readStore(file);
  return isValidPairingNumber(stored.number, { countryCode: stored.countryCode }) ? stored.number : null;
}

function saveNumber(number, file, countryCode) {
  const cc = digitsOnly(countryCode);
  const n = digitsOnly(number);
  if (!isValidPairingNumber(n)) return false;
  try {
    const target = file || STORE_PATH;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const payload = { number: n, addedAt: new Date().toISOString() };
    if (cc) payload.countryCode = cc;
    fs.writeFileSync(target, JSON.stringify(payload, null, 2));
    return true;
  } catch (e) {
    console.log("[pairing] could not save the number:", e.message);
    return false;
  }
}

/**
 * Decide how this process should log in.
 * @returns {{ number:string|null, source:string, forceQr:boolean,
 *             countryCode:string, needsCountryCode:string|null }}
 */
function resolveLoginConfig(env, file) {
  const e = env || process.env;
  const mode = String(e.LUMORA_LOGIN || e.LOGIN_MODE || "").toLowerCase();
  const forceQr = mode === "qr" || mode === "scan" || mode === "qrcode";

  const stored = readStore(file);
  const countryCode = countryCodeFrom(e) || stored.countryCode || "";

  for (const key of ENV_KEYS) {
    const value = e[key];
    if (!value) continue;
    if (isValidPairingNumber(value, { countryCode })) {
      return {
        number: normalizePairingNumber(value, { countryCode }),
        source: "env:" + key,
        forceQr,
        countryCode,
        needsCountryCode: null,
      };
    }
    if (needsCountryCode(value)) {
      return {
        number: null,
        source: "env:" + key + " (missing country code)",
        forceQr,
        countryCode,
        needsCountryCode: digitsOnly(value),
      };
    }
  }

  if (stored.number) {
    if (isValidPairingNumber(stored.number, { countryCode })) {
      return { number: normalizePairingNumber(stored.number, { countryCode }), source: "data/pairing.json", forceQr, countryCode, needsCountryCode: null };
    }
    if (needsCountryCode(stored.number)) {
      return {
        number: null,
        source: "data/pairing.json (missing country code)",
        forceQr,
        countryCode,
        needsCountryCode: stored.number,
      };
    }
  }

  return { number: null, source: "none", forceQr, countryCode, needsCountryCode: null };
}

/** "1" / "true" / "yes" / "on" / "ask" (any case) → true; anything else → false. */
function isTruthyFlag(value) {
  return PROMPT_TRUE.indexOf(String(value == null ? "" : value).trim().toLowerCase()) > -1;
}

/**
 * Opt-in: ask for the bot number AGAIN on this start, even when one is
 * already remembered in data/pairing.json / the env.
 *   LUMORA_PROMPT_NUMBER=1 node index.js
 *   node index.js --pair
 * @returns {boolean}
 */
function shouldPromptForNumber(env, argv) {
  const e = env || process.env;
  const a = argv || process.argv || [];
  if (a.indexOf("--pair") > -1 || a.indexOf("--ask-number") > -1) return true;
  for (let i = 0; i < PROMPT_KEYS.length; i++) {
    if (isTruthyFlag(e[PROMPT_KEYS[i]])) return true;
  }
  return false;
}

/**
 * THE NUMBER-PROMPT GATE — one pure predicate so index.js cannot drift and
 * the rules are testable without booting the bot:
 *   • registered session → never ask (already linked)
 *   • LUMORA_LOGIN=qr    → never ask (the QR was chosen explicitly)
 *   • a number on file   → never ask, UNLESS forcePrompt (the re-ask)
 * @param {{ registered?:boolean, forceQr?:boolean, number?:string|null,
 *           forcePrompt?:boolean }} cfg
 * @returns {boolean}
 */
function shouldAskForNumber(cfg) {
  const c = cfg || {};
  if (c.registered) return false;
  if (c.forceQr) return false;
  if (c.number && !c.forcePrompt) return false;
  return true;
}

/**
 * The box the prompt prints. Kept pure so the Enter-key wording — which
 * changes once a number is already on file — can be tested without a TTY.
 * @param {{ savedNumber?:string|null }} [opts]
 * @returns {string}
 */
function promptBanner(opts) {
  const o = opts || {};
  const onFile = o.savedNumber ? digitsOnly(o.savedNumber) : "";
  const enterLine = onFile
    ? "│ Press Enter with nothing typed to keep +" + onFile + " (already on file).\n"
    : "│ Press Enter with nothing typed to use the QR code instead.\n";
  return (
    "\n┌─ LOGIN ────────────────────────────────────────────────\n" +
    "│ Link this bot with a CODE instead of scanning a QR.\n" +
    "│ Type the bot number in INTERNATIONAL form: country code\n" +
    "│ first, no leading zero (2348101234567, not 08101234567).\n" +
    enterLine +
    "└───────────────────────────────────────────────────────"
  );
}

/**
 * Pure decision for one typed answer. Kept separate from the terminal so the
 * rules can be tested without a TTY.
 * @returns {{ ok:boolean, number?:string, error?:string, local?:string,
 *             fixed?:boolean, countryCode?:string }}
 */
function interpretPromptAnswer(answer, opts) {
  const o = opts || {};
  const countryCode = digitsOnly(o.countryCode).replace(/^0+/, "");
  const raw = digitsOnly(answer);

  if (!raw) return { ok: false, error: "empty" };

  if (needsCountryCode(raw)) {
    if (!countryCode) return { ok: false, error: "need_country_code", local: raw };
    const fixed = normalizePairingNumber(raw, { countryCode });
    if (!isValidPairingNumber(fixed)) return { ok: false, error: "invalid", local: raw };
    return { ok: true, number: fixed, fixed: true, countryCode };
  }

  if (!isValidPairingNumber(raw)) return { ok: false, error: "invalid" };
  return { ok: true, number: raw };
}

/** Does this answer look like a country code on its own (1–4 digits)? */
function looksLikeCountryCode(answer) {
  const cc = digitsOnly(answer).replace(/^0+/, "");
  return cc.length >= 1 && cc.length <= 4;
}

/**
 * Ask for the number (and the country code when it is missing) on a real
 * terminal. Resolves null when there is no TTY (Railway/CI/Docker) or when the
 * questions time out — QR keeps working either way.
 */
function promptForPairingNumber(opts) {
  const o = typeof opts === "number" ? { timeoutMs: opts } : (opts || {});
  return new Promise((resolve) => {
    const tty = process.stdin.isTTY && process.stdout.isTTY;
    if (!tty || process.env.CI) {
      // Say it out loud. A silent resolve here is what "the number stage was
      // skipped" looks like from the operator's side — no box, no hint.
      console.log(
        "\n[pairing] No interactive terminal here, so the number question was skipped." +
        "\n[pairing] Set the number yourself instead — PAIRING_NUMBER=2348101234567" +
        "\n[pairing] (in .env, or correct data/pairing.json), then restart."
      );
      return resolve(null);
    }

    let settled = false;
    let rl = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (rl) rl.close(); } catch (e) { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => {
      console.log("\n[pairing] No number entered — continuing with the QR code.");
      finish(null);
    }, Number(o.timeoutMs || PROMPT_TIMEOUT_MS));

    let countryCode = digitsOnly(o.countryCode).replace(/^0+/, "");
    let pendingLocal = o.needsCountryCode ? digitsOnly(o.needsCountryCode) : "";
    let attempts = 0;

    console.log(promptBanner(o));

    try {
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    } catch (e) {
      return finish(null);
    }

    const askNumber = (prefix) => {
      if (pendingLocal) {
        // We already know the local number; only the country code is missing.
        askCountryCode();
        return;
      }
      rl.question(prefix || "Number → ", (answer) => {
        attempts++;
        const result = interpretPromptAnswer(answer, { countryCode });
        if (result.ok) {
          if (result.fixed) {
            countryCode = result.countryCode;
            console.log("[pairing] Using +" + result.number + " (country code " + countryCode + ").");
          }
          return finish(result.number);
        }
        if (result.error === "need_country_code") {
          pendingLocal = result.local;
          return askCountryCode();
        }
        if (result.error === "empty") {
          console.log("[pairing] Nothing entered — using the QR code.");
          return finish(null);
        }
        console.log(
          "[pairing] That is not an international number.\n" +
          "          WhatsApp needs the country code and NO leading zero\n" +
          "          (e.g. 2348101234567, not 08101234567)."
        );
        if (attempts >= 3) {
          console.log("[pairing] Giving up on the number — using the QR code.");
          return finish(null);
        }
        return askNumber();
      });
    };

    const askCountryCode = () => {
      const local = pendingLocal;
      console.log("[pairing] " + local + " looks like a local number (it starts with 0).");
      rl.question("Country code → ", (answer) => {
        attempts++;
        if (!looksLikeCountryCode(answer)) {
          console.log("[pairing] A country code is 1–4 digits (Nigeria is 234).");
          if (attempts >= 3) {
            console.log("[pairing] Giving up on the number — using the QR code.");
            return finish(null);
          }
          return askCountryCode();
        }
        countryCode = digitsOnly(answer).replace(/^0+/, "");
        const result = interpretPromptAnswer(local, { countryCode });
        if (result.ok) {
          console.log("[pairing] Using +" + result.number + " (country code " + countryCode + ").");
          return finish(result.number);
        }
        console.log("[pairing] Still not valid — type the full number instead.");
        pendingLocal = "";
        askNumber();
      });
    };

    askNumber();
  });
}

/** "abcdefgh" / "ABCD-EFGH" → "ABCD-EFGH" (WhatsApp shows it with the dash). */
function formatCode(code) {
  const flat = String(code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (flat.length === 8) return flat.slice(0, 4) + "-" + flat.slice(4);
  return flat || "????????";
}

/**
 * Ask WhatsApp for the 8-character pairing code.
 * @returns {Promise<{ok: boolean, code?: string, error?: string}>}
 */
async function requestPairingCode(sock, number, attempts) {
  const max = attempts || 2;
  const n = digitsOnly(number);
  if (!sock || typeof sock.requestPairingCode !== "function") {
    return { ok: false, error: "socket has no requestPairingCode (old Baileys build)" };
  }
  if (!isValidPairingNumber(n)) {
    return { ok: false, error: "invalid phone number: " + number + " (needs the country code, no leading 0)" };
  }

  for (let i = 0; i < max; i++) {
    try {
      const raw = await sock.requestPairingCode(n);
      if (raw && String(raw).replace(/[^A-Za-z0-9]/g, "").length >= 6) {
        return { ok: true, code: formatCode(raw) };
      }
      if (i === max - 1) return { ok: false, error: "WhatsApp returned no code" };
    } catch (e) {
      if (i === max - 1) return { ok: false, error: (e && e.message) || String(e) };
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: false, error: "pairing request failed" };
}

function printPairingBanner(number, code, opts) {
  const o = opts || {};
  const pretty = formatCode(code);
  const cc = digitsOnly(o.countryCode).replace(/^0+/, "");
  const lines = [
    "",
    "╔═══════════════════════════════════════════════════════════╗",
    "║   🔗 LINK THIS BOT WITH A CODE — NO QR NEEDED             ║",
    "╚═══════════════════════════════════════════════════════════╝",
    "   Number : +" + digitsOnly(number) + (cc ? "   (country code " + cc + ")" : ""),
    "   Code   : " + pretty + (o.refreshNumber ? "   [refresh " + o.refreshNumber + "]" : ""),
    "",
    "   On that phone, open WhatsApp:",
    "     Settings → Linked Devices → Link a Device",
    "     → tap “Link with phone number instead”",
    "     → type the code above",
    "",
    "   Type it within ~" + Math.round((Number(o.windowMs) || DEFAULT_QR_TIMEOUT_MS * 5) / 60000) + " minutes: after that the" ,
    "   link window closes and the next start asks for a fresh code.",
  ];
  if (o.replaces) lines.push("   The previous code expired — this one replaces it.");
  lines.push(
    "   “Couldn't link device”? The number sent must be the full",
    "   international one (country code, no leading 0). Yours is " +
    "+" + digitsOnly(number) + ".",
    ""
  );
  console.log(lines.join("\n"));
}

/** One-line nudge instead of re-printing the whole QR while we wait. */
function makeWaitingReminder() {
  let last = 0;
  return function waiting(code) {
    const now = Date.now();
    if (now - last < REMINDER_EVERY_MS) return;
    last = now;
    console.log("[pairing] Waiting for code " + formatCode(code) + " → WhatsApp → Linked Devices → Link with phone number instead");
  };
}

/**
 * Keep the pairing window alive: pairing codes expire after a few minutes, so
 * re-request one a couple of times instead of leaving Prime with a dead code.
 * Bounded on purpose (WhatsApp does not like being hammered).
 *
 * @returns {{ stop:Function, tick:Function, shouldRefresh:Function, count:number, running:boolean }}
 */
function startCodeRefresh(opts) {
  const o = opts || {};
  const intervalMs = Number(o.intervalMs || REFRESH_EVERY_MS);
  const max = Number(o.max == null ? MAX_REFRESHES : o.max);
  const number = digitsOnly(o.number);
  const request = typeof o.request === "function" ? o.request : null;

  let count = 0;
  let timer = null;
  let stopped = false;

  const state = {
    get count() { return count; },
    get running() { return !!timer; },
    shouldRefresh() { return !stopped && !!number && !!request && count < max; },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    async tick() {
      if (!state.shouldRefresh()) {
        state.stop();
        return null;
      }
      count++;
      let result = null;
      try {
        result = await request(number);
      } catch (e) {
        result = { ok: false, error: (e && e.message) || String(e) };
      }
      if (result && result.ok && typeof o.onCode === "function") o.onCode(result.code, count);
      else if (typeof o.onFail === "function") o.onFail((result && result.error) || "no code", count);
      if (state.shouldRefresh()) timer = setTimeout(state.tick, intervalMs);
      else state.stop();
      return result;
    },
  };

  if (number && request && max > 0) timer = setTimeout(state.tick, intervalMs);
  return state;
}

function printQr(qr, reason) {
  if (reason) console.log("\n[pairing] " + reason);
  console.log("\n✅ SCAN THIS QR CODE IN WHATSAPP → LINKED DEVICES:\n");
  // qrcode-terminal is required by index.js; keep this module dependency-free.
  const qrcode = require("qrcode-terminal");
  qrcode.generate(qr, { small: true });
}

module.exports = {
  ENV_KEYS,
  COUNTRY_KEYS,
  STORE_PATH,
  AUTH_DIR,
  qrTimeoutMs,
  isHalfPaired,
  countAuthFiles,
  readCreds,
  archiveAuthDir,
  normalizePairingNumber,
  isValidPairingNumber,
  needsCountryCode,
  interpretPromptAnswer,
  looksLikeCountryCode,
  countryCodeFrom,
  readStore,
  readStoredNumber,
  saveNumber,
  PROMPT_KEYS,
  isTruthyFlag,
  shouldPromptForNumber,
  shouldAskForNumber,
  resolveLoginConfig,
  promptBanner,
  promptForPairingNumber,
  formatCode,
  requestPairingCode,
  printPairingBanner,
  makeWaitingReminder,
  startCodeRefresh,
  printQr,
  REFRESH_EVERY_MS,
  MAX_REFRESHES,
  DEFAULT_QR_TIMEOUT_MS,
};

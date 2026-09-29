"use strict";
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  LUMORA BRIDGE — can a tap inside a card reach the bot?               ║
// ╠═══════════════════════════════════════════════════════════════════════╣
// ║  A tiny HTTP server (Node's built-in http — no packages) that the     ║
// ║  card can try to reach. Three things matter:                          ║
// ║                                                                       ║
// ║  1. TOKENS. Every card carries one signed token:                      ║
// ║       { playerId, chatId, cardId, allowedActions, exp, nonce }        ║
// ║     signed with HMAC-SHA256 (secret from env or data/bridge_secret).  ║
// ║     The card never sees the secret, and it never sends a playerId —   ║
// ║     the token IS the identity. A card cannot act as someone else.     ║
// ║                                                                       ║
// ║  2. THE ACTION LAYER decides everything. The bridge only checks the   ║
// ║     token, the allow-list, the rate limit and the nonce, then calls   ║
// ║     systems/lumoraActions.js — the same code typed commands use.      ║
// ║     State-changing actions are SINGLE-USE per nonce+action+params.    ║
// ║                                                                       ║
// ║  3. THE CHAT IS THE GUARANTEED RETURN CHANNEL. Whatever the card can  ║
// ║     or cannot read, every successful action's message is also sent    ║
// ║     to the chat through the socket.                                   ║
// ║                                                                       ║
// ║  Endpoints:  POST /lumora/act   {token, action, params, channel}      ║
// ║              GET  /lumora/act?t=&a=&p=&ch=                            ║
// ║              GET  /lumora/health                                      ║
// ║              GET  /lumora/log?key=<secret>                            ║
// ║                                                                       ║
// ║  Kill switch: LUMORA_BRIDGE=off                                       ║
// ║  Config:      LUMORA_BRIDGE_PORT (default 8791)                       ║
// ║               LUMORA_BRIDGE_SECRET                                    ║
// ║               LUMORA_BRIDGE_URL  (public URL, for handing to cards)   ║
// ║                                                                       ║
// ║  UNTESTED: no real phone tap has arrived here yet. The probe card     ║
// ║  (.uiprobe) exists to find out which channels actually work.          ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SECRET_FILE = path.join(__dirname, "..", "data", "bridge_secret.json");
const TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT = 20;              // requests per player …
const RATE_WINDOW_MS = 60 * 1000;   // … per minute
const MAX_BODY_BYTES = 8 * 1024;
const SUMMARY_DEBOUNCE_MS = 2500;
const PING = "ping";

let SERVER = null;
let CONFIG = null;
let SECRET = null;
let startedAt = 0;

const usedNonces = new Map();   // nonce → expiresAt
const rateHits = new Map();     // playerId → [timestamps]
const requestLog = [];          // newest last, capped
const pendingPings = new Map(); // playerId → { chatId, channels:Set, timer }

const LOG_CAP = 400;

// ─────────────────────────────────────────────────────────────────────────
// SECRET
// ─────────────────────────────────────────────────────────────────────────

function loadSecret(envSecret) {
  const fromEnv = String(envSecret || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const stored = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8"));
    if (stored && stored.secret) return String(stored.secret);
  } catch (e) { /* first run */ }
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, JSON.stringify({ secret: generated, createdAt: new Date().toISOString() }, null, 2));
    console.log("[bridge] generated a new secret at data/bridge_secret.json");
  } catch (e) {
    console.log("[bridge] could not persist the secret:", e.message);
  }
  return generated;
}

// ─────────────────────────────────────────────────────────────────────────
// TOKENS
// ─────────────────────────────────────────────────────────────────────────

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** The secret is loaded on first use: a card can be minted before the server
 *  starts, and the kill switch must not make minting throw. */
function secret() {
  if (!SECRET) SECRET = loadSecret(process.env.LUMORA_BRIDGE_SECRET);
  return SECRET;
}

function sign(payloadPart) {
  return b64url(crypto.createHmac("sha256", secret()).update(payloadPart).digest());
}

/**
 * Mint the token a card carries. `allowedActions` is the closed list of what
 * that card may ask for.
 */
function mintToken(opts) {
  const o = opts || {};
  if (!o.playerId) throw new Error("mintToken: playerId is required");
  const payload = {
    playerId: String(o.playerId),
    chatId: o.chatId ? String(o.chatId) : null,
    cardId: o.cardId ? String(o.cardId) : "card",
    allowedActions: Array.isArray(o.allowedActions) && o.allowedActions.length
      ? o.allowedActions.map((a) => String(a))
      : [PING],
    exp: Date.now() + Number(o.ttlMs || TOKEN_TTL_MS),
    nonce: crypto.randomUUID(),
  };
  const part = b64url(JSON.stringify(payload));
  return part + "." + sign(part);
}

/**
 * Verify a token. Returns { ok, payload } or { ok:false, error }.
 * Errors: bad_token | bad_signature | token_expired
 */
function verifyToken(token) {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return { ok: false, error: "bad_token" };
  const part = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = sign(part);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(part).toString("utf8"));
  } catch (e) {
    return { ok: false, error: "bad_token" };
  }
  if (!payload || !payload.playerId || !payload.exp) return { ok: false, error: "bad_token" };
  if (Date.now() > Number(payload.exp)) return { ok: false, error: "token_expired" };
  return { ok: true, payload };
}

// ─────────────────────────────────────────────────────────────────────────
// NONCE LEDGER + RATE LIMIT
// ─────────────────────────────────────────────────────────────────────────

function pruneNonces() {
  const now = Date.now();
  for (const [nonce, exp] of usedNonces) {
    if (exp <= now) usedNonces.delete(nonce);
  }
}

function nonceKey(payload, action, params) {
  return payload.nonce + ":" + action + ":" + JSON.stringify(params || {});
}

/** true when this exact request was already applied. */
function isReplay(payload, action, params) {
  pruneNonces();
  return usedNonces.has(nonceKey(payload, action, params));
}

function rememberUse(payload, action, params) {
  pruneNonces();
  usedNonces.set(nonceKey(payload, action, params), Date.now() + TOKEN_TTL_MS);
}

function rateLimitExceeded(playerId) {
  const now = Date.now();
  const hits = (rateHits.get(playerId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(playerId, hits);
  return hits.length > RATE_LIMIT;
}

// ─────────────────────────────────────────────────────────────────────────
// LOGGING + THE CHAT RETURN CHANNEL
// ─────────────────────────────────────────────────────────────────────────

function logRequest(entry) {
  requestLog.push(Object.assign({ at: new Date().toISOString() }, entry));
  if (requestLog.length > LOG_CAP) requestLog.splice(0, requestLog.length - LOG_CAP);
  console.log(
    "[bridge] " + entry.channel + " action=" + entry.action +
    " player=" + String(entry.player || "-").split("@")[0] +
    " -> " + entry.result + (entry.detail ? " (" + entry.detail + ")" : "")
  );
}

function sendToChat(chatId, text) {
  try {
    const getSocket = CONFIG && CONFIG.getSocket;
    const sock = typeof getSocket === "function" ? getSocket() : null;
    if (!sock || !chatId) return false;
    sock.sendMessage(chatId, { text });
    return true;
  } catch (e) {
    console.log("[bridge] chat delivery failed:", (e && e.message) || e);
    return false;
  }
}

/**
 * A card ping is proof that a channel reached us. Collect them for a moment
 * and answer once in chat, so Prime sees the verdict where he can read it.
 */
function notePing(payload, channel) {
  const key = payload.playerId;
  const entry = pendingPings.get(key) || { chatId: payload.chatId, channels: new Set(), timer: null };
  entry.chatId = entry.chatId || payload.chatId;
  entry.channels.add(channel);
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    pendingPings.delete(key);
    const list = Array.from(entry.channels).sort();
    const lines = ["📡 *CARD PROBE*", "━━━━━━━━━━━━━━━━━━", ""];
    for (const c of ["A-post", "B-beacon", "C-image", "unknown"]) {
      lines.push((list.includes(c) ? "✅ " : "❌ ") + c);
    }
    const extra = list.filter((c) => !["A-post", "B-beacon", "C-image", "unknown"].includes(c));
    if (extra.length) lines.push("• other: " + extra.join(", "));
    lines.push("", "_Sent " + list.length + " ping(s) in the last " +
      Math.round(SUMMARY_DEBOUNCE_MS / 1000) + "s. A missing line means that channel did not arrive._");
    sendToChat(entry.chatId, lines.join("\n"));
  }, Number((CONFIG && CONFIG.summaryDelayMs) || SUMMARY_DEBOUNCE_MS));
  pendingPings.set(key, entry);
}

// ─────────────────────────────────────────────────────────────────────────
// REQUEST HANDLING
// ─────────────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, corsHeaders()));
  res.end(text);
}

function parseParams(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function handleAction(req, res, input) {
  const { token, action, params, channel } = input;
  const ch = String(channel || "unknown");
  const name = String(action || "").trim();

  const check = verifyToken(token);
  if (!check.ok) {
    logRequest({ channel: ch, action: name, player: null, result: check.error });
    return sendJson(res, 401, { ok: false, error: check.error });
  }

  const payload = check.payload;
  const allowed = Array.isArray(payload.allowedActions) ? payload.allowedActions : [];
  const allowedThis = allowed.some((a) => String(a).toLowerCase() === name.toLowerCase()) || name.toLowerCase() === PING;

  if (name.toLowerCase() !== PING && !allowedThis) {
    logRequest({ channel: ch, action: name, player: payload.playerId, result: "not_allowed" });
    return sendJson(res, 403, { ok: false, error: "not_allowed", message: "This card may not do that." });
  }

  if (rateLimitExceeded(payload.playerId)) {
    logRequest({ channel: ch, action: name, player: payload.playerId, result: "rate_limited" });
    return sendJson(res, 429, { ok: false, error: "rate_limited", message: "Slow down." });
  }

  // ── the probe's ping: record the arrival, answer in chat ──
  if (name.toLowerCase() === PING) {
    notePing(payload, ch);
    logRequest({ channel: ch, action: PING, player: payload.playerId, result: "arrived" });
    return sendJson(res, 200, { ok: true, channel: ch, note: "arrival logged" });
  }

  const actions = require("./lumoraActions");
  const changing = actions.isChanging(name);
  if (changing && isReplay(payload, name, params)) {
    logRequest({ channel: ch, action: name, player: payload.playerId, result: "replay_blocked" });
    return sendJson(res, 409, { ok: false, error: "replay", message: "That was already applied." });
  }

  const loadPlayers = CONFIG && CONFIG.loadPlayers;
  const savePlayers = CONFIG && CONFIG.savePlayers;
  if (typeof loadPlayers !== "function" || typeof savePlayers !== "function") {
    logRequest({ channel: ch, action: name, player: payload.playerId, result: "no_store" });
    return sendJson(res, 503, { ok: false, error: "no_store", message: "The bot is not ready yet." });
  }

  const runtime = { players: loadPlayers(), savePlayers };
  const result = await actions.run(
    name,
    { playerId: payload.playerId, chatId: payload.chatId, source: "card", runtime },
    params,
  );

  if (changing && result.ok) rememberUse(payload, name, params);

  logRequest({
    channel: ch,
    action: name,
    player: payload.playerId,
    result: result.ok ? "ok" : (result.error || "failed"),
    detail: result.ok ? undefined : result.message,
  });

  // The guaranteed return channel: the result also lands in the chat.
  if (result.message) {
    const delivered = sendToChat(payload.chatId, result.message);
    if (!delivered) console.log("[bridge] could not echo the result to chat (socket down)");
  }

  return sendJson(res, result.ok ? 200 : 400, {
    ok: result.ok,
    error: result.error || null,
    message: result.message || "",
    data: result.data || {},
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { req.destroy(); resolve(""); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function createHandler() {
  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    if (route === "/lumora/health") {
      return sendJson(res, 200, {
        ok: true,
        running: !!SERVER,
        upMs: Date.now() - startedAt,
        actions: require("./lumoraActions").describe(),
        logSize: requestLog.length,
        // never the secret itself, only whether one exists
        secret: secret() ? "set" : "missing",
      });
    }

    if (route === "/lumora/log") {
      const key = url.searchParams.get("key") || "";
      const expected = secret();
      const a = Buffer.from(key);
      const b = Buffer.from(expected || "");
      if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return sendJson(res, 403, { ok: false, error: "forbidden" });
      }
      return sendJson(res, 200, { ok: true, count: requestLog.length, entries: requestLog.slice(-100) });
    }

    if (route !== "/lumora/act") {
      return sendJson(res, 404, { ok: false, error: "not_found" });
    }

    if (req.method === "POST") {
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch (e) { body = {}; }
      return handleAction(req, res, {
        token: body.token || url.searchParams.get("t"),
        action: body.action || url.searchParams.get("a"),
        params: parseParams(body.params || url.searchParams.get("p")),
        channel: body.channel || url.searchParams.get("ch") || "A-post",
      });
    }

    if (req.method === "GET") {
      return handleAction(req, res, {
        token: url.searchParams.get("t"),
        action: url.searchParams.get("a"),
        params: parseParams(url.searchParams.get("p")),
        channel: url.searchParams.get("ch") || "C-image",
      });
    }

    return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  };
}

// ─────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────

function isEnabled(env) {
  const e = env || process.env;
  const flag = String(e.LUMORA_BRIDGE || "").toLowerCase();
  return !(flag === "off" || flag === "0" || flag === "false" || flag === "disabled");
}

/** Idempotent: safe to call on every (re)connect. */
function start(opts) {
  const o = opts || {};
  if (SERVER) return SERVER;
  if (!isEnabled(o.env)) {
    console.log("[bridge] disabled (LUMORA_BRIDGE=off) — no tap channel available");
    return null;
  }

  CONFIG = Object.assign({
    loadPlayers: null,
    savePlayers: null,
    getSocket: () => global._lumoraSock,
    summaryDelayMs: SUMMARY_DEBOUNCE_MS,
  }, CONFIG || {}, o);

  secret();
  startedAt = Date.now();

  const port = Number(process.env.LUMORA_BRIDGE_PORT || 8791);
  // Localhost by default: a tunnel (cloudflared/ngrok) can reach 127.0.0.1, and
  // nothing else on the network can. Set LUMORA_BRIDGE_HOST to widen it.
  const host = String(process.env.LUMORA_BRIDGE_HOST || "127.0.0.1");
  SERVER = http.createServer(createHandler());
  SERVER.on("error", (e) => {
    console.log("[bridge] server error:", (e && e.message) || e);
  });
  SERVER.listen(port, host, () => {
    const addr = SERVER && typeof SERVER.address === "function" ? SERVER.address() : null;
    const boundPort = addr && addr.port ? addr.port : port;
    const publicUrl = String(process.env.LUMORA_BRIDGE_URL || "").replace(/\/+$/, "");
    console.log("[bridge] listening on " + host + ":" + boundPort +
      (publicUrl ? " — public URL " + publicUrl : " (no LUMORA_BRIDGE_URL set)"));
  });
  return SERVER;
}

function stop() {
  return new Promise((resolve) => {
    if (!SERVER) return resolve(false);
    const s = SERVER;
    SERVER = null;
    try { s.close(() => resolve(true)); } catch (e) { resolve(false); }
  });
}

/** Boot from index.js: wires the real player store and starts the server. */
function boot(opts) {
  const o = opts || {};
  CONFIG = Object.assign({}, CONFIG || {}, {
    loadPlayers: o.loadPlayers || (CONFIG && CONFIG.loadPlayers) || null,
    savePlayers: o.savePlayers || (CONFIG && CONFIG.savePlayers) || null,
    getSocket: o.getSocket || (CONFIG && CONFIG.getSocket) || (() => global._lumoraSock),
  });
  return start(o);
}

/** The URL the cards should talk to (trailing slash trimmed). */
function publicUrl(env) {
  const e = env || process.env;
  const url = String(e.LUMORA_BRIDGE_URL || "").trim();
  if (url) return url.replace(/\/+$/, "");
  const port = Number(e.LUMORA_BRIDGE_PORT || 8791);
  return "http://localhost:" + port;
}

function status() {
  const bound = SERVER && typeof SERVER.address === "function" ? SERVER.address() : null;
  return {
    running: !!SERVER,
    enabled: isEnabled(),
    port: bound && bound.port ? bound.port : Number(process.env.LUMORA_BRIDGE_PORT || 8791),
    publicUrl: publicUrl(),
    secretSet: !!secret(),
    requests: requestLog.length,
    usedNonces: usedNonces.size,
  };
}

function recentLog(limit) {
  return requestLog.slice(-(Number(limit) || 50));
}

module.exports = {
  boot,
  start,
  stop,
  status,
  mintToken,
  verifyToken,
  publicUrl,
  isEnabled,
  recentLog,
  // exposed for tests / tooling
  PING,
  TOKEN_TTL_MS,
  RATE_LIMIT,
  getSecret: () => secret(),
};

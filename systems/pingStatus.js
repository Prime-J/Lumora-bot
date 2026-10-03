"use strict";
// ═══════════════════════════════════════════════════════════════
// LUMORA PING — "am I alive?"
//  Answers `.ping` with the bot's liveness, automatically pings every
//  member of the group, and reminds everyone about the Sunday Gift.
// ═══════════════════════════════════════════════════════════════

const CAT_OFFSET_MS = 2 * 60 * 60 * 1000; // Central Africa Time = UTC+2
const DAY_MS = 24 * 60 * 60 * 1000;
const GIFT_TITLE = "THE SUNDAY GIFT";
const MAX_MENTIONS = 1024; // WhatsApp group metadata can be large; cap defensively

// ── TIME ─────────────────────────────────────────────────────
function catDate(now = Date.now()) {
  return new Date(now + CAT_OFFSET_MS);
}

// Next Sunday 00:00 CAT. On a Sunday it returns the NEXT week's window,
// so the countdown never reads "0m" the moment the Gift opens.
function nextSundayStartMs(now = Date.now()) {
  const shift = now + CAT_OFFSET_MS;
  const startOfDay = Math.floor(shift / DAY_MS) * DAY_MS;
  const dow = new Date(shift).getUTCDay();
  let days = (7 - dow) % 7;
  if (days === 0) days = 7;
  return startOfDay + days * DAY_MS - CAT_OFFSET_MS;
}

// The Gift window closes at Sunday 24:00 CAT == Monday 00:00 CAT.
function giftWindowEndMs(now = Date.now()) {
  const shift = now + CAT_OFFSET_MS;
  const startOfDayShift = Math.floor(shift / DAY_MS) * DAY_MS;
  return startOfDayShift - CAT_OFFSET_MS + DAY_MS;
}

function formatCountdown(ms) {
  const diff = Math.max(0, Number(ms) || 0);
  const d = Math.floor(diff / DAY_MS);
  const h = Math.floor((diff % DAY_MS) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
}

function formatUptime(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600) % 24;
  const days = Math.floor(total / 86400);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ── SUNDAY GIFT REMINDER ─────────────────────────────────────
//  Returns { open, line }. During the 24h window the Gift is live and the
//  line says so; otherwise it counts down to the next opening.
function sundayReminder(now = Date.now()) {
  const end = giftWindowEndMs(now);
  const dow = catDate(now).getUTCDay();
  // Sunday (0) after midnight CAT means the window is still open.
  if (dow === 0 && now < end) {
    return {
      open: true,
      line:
        `📜 *${GIFT_TITLE}* is *OPEN* right now — ${formatCountdown(end - now)} left.\n` +
        `   Answer the scriptures, and receive. Type *.gift*`,
    };
  }
  const next = nextSundayStartMs(now);
  return {
    open: false,
    line:
      `📜 *${GIFT_TITLE}* opens in *${formatCountdown(next - now)}* — Sunday, 00:00 CAT.\n` +
      `   24 hours of scripture trials. Type *.gift* when it opens.`,
  };
}

// ── @ALL ─────────────────────────────────────────────────────
//  Hidden mentions: the `mentions` array fires a notification for every
//  member while the message text stays clean (no @handle spam).
async function collectMentionJids(sock, chatId, opts = {}) {
  const { exclude = [], cap = MAX_MENTIONS } = opts;
  try {
    const meta = await sock.groupMetadata(chatId);
    const skip = new Set(exclude.filter(Boolean));
    const ids = (meta?.participants || [])
      .map((p) => (typeof p === "string" ? p : p && p.id))
      .filter((id) => id && !skip.has(id));
    return [...new Set(ids)].slice(0, cap);
  } catch {
    return []; // DM or metadata unavailable — fall back to a plain reply
  }
}

// ── MESSAGE ──────────────────────────────────────────────────
//  `pingMs` is the round-trip latency; `uptimeMs` the process age.
function buildPingText({ pingMs, uptimeMs, now, taggedCount = 0 } = {}) {
  const gift = sundayReminder(now);
  const stamp = catDate(now).toISOString().replace("T", " ").slice(0, 16);

  const lines = [];
  lines.push("═══════════════════════");
  lines.push("  🌌 *STAR IS ONLINE*");
  lines.push("═══════════════════════");
  lines.push("");
  lines.push(`⏱️ Response: *${Math.max(0, Math.round(Number(pingMs) || 0))}ms*`);
  lines.push(`🕒 Uptime: *${formatUptime(uptimeMs)}*`);
  lines.push(`🕰️ *${stamp}* CAT`);
  lines.push("");
  lines.push(gift.line);
  lines.push("");
  if (taggedCount > 0) {
    lines.push(`📣 *${taggedCount} Lumorian${taggedCount === 1 ? "" : "s"} notified.*`);
    lines.push("");
  }
  lines.push("_The grove is awake. Come play._");
  return lines.join("\n");
}

// ── COMMAND ──────────────────────────────────────────────────
async function cmdPing(ctx, chatId, msg, opts = {}) {
  const { sock, startTime, botJid } = ctx;
  const now = Date.now();

  const t0 = Number(msg?.messageTimestamp || 0) * 1000;
  const pingMs = t0 ? Math.max(0, now - t0) : 0;

  const isGroup = /@g\.us$/.test(String(chatId));
  const mentions = isGroup
    ? await collectMentionJids(sock, chatId, { exclude: [botJid] })
    : [];

  const text = buildPingText({
    pingMs,
    uptimeMs: startTime ? now - startTime : 0,
    now,
    taggedCount: mentions.length,
  });

  return sock.sendMessage(chatId, { text, mentions }, { quoted: msg });
}

module.exports = {
  cmdPing,
  buildPingText,
  sundayReminder,
  collectMentionJids,
  formatCountdown,
  formatUptime,
  nextSundayStartMs,
  giftWindowEndMs,
  catDate,
  GIFT_TITLE,
};
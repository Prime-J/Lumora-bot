// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA — INBOUND MESSAGE GATE  v1.0                           ║
// ║                                                                ║
// ║  Decides whether an upserted message is REAL traffic or replay  ║
// ║  noise from a history sync / post-relink flood.                 ║
// ║                                                                ║
// ║  Why this is its own module: the rule used to live inline in    ║
// ║  index.js as `msgTimestamp < BOT_START_TIME - 60 ||             ║
// ║  msgAgeSec > 120`, and that second clause was wrong. Its        ║
// ║  comment promised "older than 5 minutes outright"; the code     ║
// ║  dropped anything older than two. A live message keeps the      ║
// ║  timestamp the SENDER gave it, so delivery latency (a slow      ║
// ║  reconnect, or a group whose sender key went stale after a      ║
// ║  restart and needed a decryption retry) made genuine messages   ║
// ║  look old and get silently discarded — the bot went quiet in    ║
// ║  exactly the groups that needed the retry while still           ║
// ║  answering the ones that delivered instantly.                   ║
// ║                                                                ║
// ║  The rule that actually separates the two is AGE RELATIVE TO    ║
// ║  BOOT, not age in general: a replay always predates the         ║
// ║  process, and a live message never does, however late it        ║
// ║  arrives. Delivery latency is not evidence of anything.         ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

// Slack around boot for clock skew and for messages sent in the moment before
// we came up. A message older than this, relative to boot, is a replay.
const REPLAY_GRACE_SEC = 60;

// Reasons a message is dropped, as stable strings (logged and asserted on).
const DROP = {
  UNSTAMPED: "unstamped",
  PREDATES_BOOT: "predates-boot",
};

/**
 * Should this message be dropped as replay noise?
 *
 * @param {object}  o
 * @param {number}  o.timestamp    messageTimestamp, already normalised to Unix seconds (0 = absent)
 * @param {number}  o.bootTimeSec  Unix seconds when this process started
 * @param {number} [o.graceSec]    boot slack, default REPLAY_GRACE_SEC
 * @param {number} [o.nowSec]      current Unix seconds (only used for reporting)
 * @returns {null | {reason: string, ageSec: number}} null = deliver it
 */
function replayVerdict({ timestamp, bootTimeSec, graceSec = REPLAY_GRACE_SEC, nowSec = null } = {}) {
  const ts = Number(timestamp) || 0;
  const boot = Number(bootTimeSec) || 0;
  const grace = Number.isFinite(Number(graceSec)) ? Number(graceSec) : REPLAY_GRACE_SEC;
  const now = nowSec == null ? Math.floor(Date.now() / 1000) : Number(nowSec);

  // Real WhatsApp messages always carry a timestamp. An unstamped one is
  // history-sync or stale-sender-key noise.
  if (!ts) return { reason: DROP.UNSTAMPED, ageSec: 0 };

  // The only reliable replay signal: it happened before this process existed.
  if (ts < boot - grace) return { reason: DROP.PREDATES_BOOT, ageSec: now - ts };

  // Deliberately NOT a function of age. A message sent after boot is live
  // traffic even if it reaches us an hour later.
  return null;
}

/** Convenience wrapper: true when the message should NOT be delivered. */
function isReplay(o) {
  return replayVerdict(o) != null;
}

module.exports = { replayVerdict, isReplay, DROP, REPLAY_GRACE_SEC };

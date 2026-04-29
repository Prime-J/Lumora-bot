// 0.1.3 — ROBBERY SYSTEM
// Snatch glove from market → .rob @user → victim has N seconds to .defend
// or be auto-defended (chance scales with idle time). Failed snatch = robber
// gets clapped (HP damage from victim's aura) + glove consumed + cooldown.

const fs = require("fs");
const path = require("path");

// ─── Glove tiers ─────────────────────────────────────────────
// id matches itemsDb id for stocking; window is the defend window in ms;
// snatchPct is the % of victim's WALLET (not bank); cap is the hard ceiling.
const GLOVES = {
  SNATCH_GLOVE:  { name: "Snatch Glove",  windowMs: 5000, snatchPct: 0.05, cap: 1500, price: 1000, market: "regular" },
  SHADOW_GLOVE:  { name: "Shadow Glove",  windowMs: 3000, snatchPct: 0.08, cap: 2000, price: 0,    market: "pro"     },
  PHANTOM_GLOVE: { name: "Phantom Glove", windowMs: 2000, snatchPct: 0.10, cap: 2500, price: 0,    market: "black"   },
};

// In-memory pending snatches keyed by victim JID. Cleared on .defend, on
// auto-defense, or when the window expires.
const pending = new Map();

// Cooldowns: robber → victim → expiresAt (24h grief block)
const robCooldowns = new Map();
const ROB_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Knockout lockouts: jid → expiresAt
const knockouts = new Map();
const KO_LOCKOUT_MS = 10 * 60 * 1000;

// Alert buff: victim → expiresAt (auto-defends next snatch attempt)
const alerts = new Map();
const ALERT_MS = 30 * 60 * 1000;

function digits(j = "") { return String(j).split(":")[0].split("/")[0].replace(/\D/g, ""); }
function normJid(j = "") { return String(j).split(":")[0].split("/")[0]; }

function isKnockedOut(jid) {
  const t = knockouts.get(normJid(jid));
  if (!t) return 0;
  if (Date.now() >= t) { knockouts.delete(normJid(jid)); return 0; }
  return t - Date.now();
}

function trackCommandActivity(jid) {
  // Called from index.js on every command — feeds the auto-defense odds.
  // Also stamped on the player record so it persists across restarts.
  // (See updatePlayerLastCmd.)
}

function updatePlayerLastCmd(player) {
  if (!player) return;
  player.lastCmdAt = Date.now();
}

// Auto-defense odds based on idle time:
//   < 30 min idle → 0% (must defend manually)
//   30-60 min     → 25%
//   60-90 min     → 50%
//   > 90 min      → 75% (capped — keeps stakes real)
function autoDefenseChance(victimPlayer) {
  const last = Number(victimPlayer?.lastCmdAt || 0);
  if (!last) return 0.50; // never seen → moderate auto-defense
  const idle = Date.now() - last;
  if (idle < 30 * 60 * 1000)      return 0.00;
  if (idle < 60 * 60 * 1000)      return 0.25;
  if (idle < 90 * 60 * 1000)      return 0.50;
  return 0.75;
}

// ─── .rob @user ──────────────────────────────────────────────
async function cmdRob(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const { getMentionedJids, getRepliedJid } = helpers;

  const robber = players[senderId];
  if (!robber) return sock.sendMessage(chatId, { text: "❌ Register first using *.start*." }, { quoted: msg });

  // KO check
  const koLeft = isKnockedOut(senderId);
  if (koLeft > 0) {
    return sock.sendMessage(chatId, {
      text: `💫 You're knocked out cold. Wait *${Math.ceil(koLeft / 60000)} min* before crime again.`,
    }, { quoted: msg });
  }

  const targets = getMentionedJids(msg);
  const replied = getRepliedJid(msg);
  const targetJid = targets[0] || replied;
  if (!targetJid) {
    return sock.sendMessage(chatId, { text: "Usage: *.rob @user* (or reply to them)" }, { quoted: msg });
  }
  const tNorm = normJid(targetJid);
  if (tNorm === senderId) {
    return sock.sendMessage(chatId, { text: "🤡 You can't rob yourself, genius." }, { quoted: msg });
  }
  const victim = players[tNorm];
  if (!victim) return sock.sendMessage(chatId, { text: "❌ That player isn't registered." }, { quoted: msg });

  // 24h cooldown per (robber → victim) pair
  const cdKey = `${senderId}|${tNorm}`;
  const cdEnd = robCooldowns.get(cdKey) || 0;
  if (Date.now() < cdEnd) {
    const mins = Math.ceil((cdEnd - Date.now()) / 60000);
    return sock.sendMessage(chatId, { text: `⏳ You already snatched them recently. Try again in *${mins} min*.` }, { quoted: msg });
  }

  // Pending check — one snatch at a time per victim
  if (pending.has(tNorm)) {
    return sock.sendMessage(chatId, { text: "⚠️ Someone's already mid-snatch on them. Wait." }, { quoted: msg });
  }

  // Find the highest-tier glove the robber owns
  const inv = robber.inventory || {};
  let chosenKey = null;
  for (const k of ["PHANTOM_GLOVE", "SHADOW_GLOVE", "SNATCH_GLOVE"]) {
    if (Number(inv[k] || 0) > 0) { chosenKey = k; break; }
  }
  if (!chosenKey) {
    return sock.sendMessage(chatId, {
      text: `❌ You don't have a snatch glove. Buy one in the market:\n• *Snatch Glove* — 1,000L (regular market)\n• *Shadow Glove* — pro market\n• *Phantom Glove* — black market`,
    }, { quoted: msg });
  }
  const glove = GLOVES[chosenKey];

  // Wallet must have something worth taking
  const wallet = Number(victim.lucons || 0);
  if (wallet <= 0) {
    return sock.sendMessage(chatId, {
      text: `🪙 Their wallet's empty. Save your glove for a real mark.`,
    }, { quoted: msg });
  }

  // Compute the potential snatch
  const potential = Math.min(Math.floor(wallet * glove.snatchPct), glove.cap);

  // Set pending
  const expiresAt = Date.now() + glove.windowMs;
  pending.set(tNorm, {
    robberJid: senderId,
    victimJid: tNorm,
    chatId,
    gloveKey: chosenKey,
    potential,
    expiresAt,
    quotedMsg: msg,
  });

  // Schedule auto-resolution if they don't .defend
  setTimeout(() => resolveExpired(ctx, tNorm).catch(e => console.log("[rob expire]", e?.message)), glove.windowMs + 100);

  const seconds = Math.ceil(glove.windowMs / 1000);
  return sock.sendMessage(chatId, {
    text:
      `🥷 *SNATCH ATTEMPT!*\n\n` +
      `@${digits(senderId)} is reaching for @${digits(tNorm)}'s wallet with a *${glove.name}*!\n\n` +
      `💰 At stake: up to *${potential.toLocaleString()}L*\n` +
      `⏳ @${digits(tNorm)} — type *.defend* in the next *${seconds}s* to fight back!`,
    mentions: [senderId, tNorm],
  });
}

// ─── .defend ────────────────────────────────────────────────
async function cmdDefend(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const p = pending.get(senderId);
  if (!p) {
    return sock.sendMessage(chatId, { text: "🛡️ Nothing to defend against right now." }, { quoted: msg });
  }
  if (Date.now() > p.expiresAt) {
    pending.delete(senderId);
    return; // expired path will handle
  }
  pending.delete(senderId);
  return resolveDefended(ctx, p, /* auto */ false);
}

// ─── Internal: snatch succeeded (defender no-show) ───────────
async function resolveExpired(ctx, victimJid) {
  const p = pending.get(victimJid);
  if (!p) return; // already resolved by .defend
  pending.delete(victimJid);

  const { players, savePlayers, sock } = ctx;
  const victim = players[victimJid];
  const robber = players[p.robberJid];
  if (!victim || !robber) return;

  // Roll auto-defense based on idle time + alert buff
  const alertEnd = alerts.get(victimJid) || 0;
  const alertActive = Date.now() < alertEnd;
  const autoChance = alertActive ? 1.0 : autoDefenseChance(victim);

  if (Math.random() < autoChance) {
    return resolveDefended(ctx, p, /* auto */ true);
  }

  // Robber wins. Take from wallet, transfer to robber's wallet.
  const taken = Math.min(p.potential, Number(victim.lucons || 0));
  victim.lucons = Math.max(0, (victim.lucons || 0) - taken);
  robber.lucons = (robber.lucons || 0) + taken;
  // 0.1.3 — Glove Hand achievement counter
  robber.snatchSuccesses = Number(robber.snatchSuccesses || 0) + 1;

  // Consume glove (snatch always burns one — success OR fail)
  const inv = robber.inventory || (robber.inventory = {});
  inv[p.gloveKey] = Math.max(0, Number(inv[p.gloveKey] || 0) - 1);
  if (inv[p.gloveKey] <= 0) delete inv[p.gloveKey];

  // Set 24h cooldown on this pair
  robCooldowns.set(`${p.robberJid}|${victimJid}`, Date.now() + ROB_COOLDOWN_MS);
  // Alert buff for victim (next snatch in 30min auto-defends)
  alerts.set(victimJid, Date.now() + ALERT_MS);

  savePlayers(players);

  return sock.sendMessage(p.chatId, {
    text:
      `💸 *SNATCHED!*\n\n` +
      `@${digits(p.robberJid)} got away with *${taken.toLocaleString()}L* from @${digits(victimJid)}'s wallet.\n\n` +
      `_${digits(victimJid) ? `You'll be on alert for 30 min. Next snatch attempt auto-defends.` : ""}_\n` +
      `_Tip: keep Lucons in *.bank* before going AFK._`,
    mentions: [p.robberJid, victimJid],
  });
}

// ─── Internal: defender wins ────────────────────────────────
async function resolveDefended(ctx, p, auto) {
  const { players, savePlayers, sock } = ctx;
  const victim = players[p.victimJid];
  const robber = players[p.robberJid];
  if (!victim || !robber) return;

  // Damage scales with victim aura. 0 aura = floor (small but non-zero).
  const aura = Number(victim.aura || 0);
  const baseDmg = Math.max(8, Math.floor(aura * 0.5));
  const dmg = baseDmg + Math.floor(Math.random() * 11) + 5; // +5-15 jitter

  // Robber's HP takes the hit
  if (typeof robber.playerHp !== "number") {
    robber.playerHp = Number(robber.playerMaxHp || 100);
  }
  if (typeof robber.playerMaxHp !== "number") robber.playerMaxHp = 100;
  const hpBefore = robber.playerHp;
  robber.playerHp = Math.max(0, robber.playerHp - dmg);
  const knockout = robber.playerHp <= 0;

  // Lucon fine — robber pays victim a "trespass fine"
  // 0 aura still pays a small fine (floor 20).
  const fine = Math.max(20, Math.floor(aura * 0.3) + Math.floor(Math.random() * 21));
  const actualFine = Math.min(fine, Number(robber.lucons || 0));
  robber.lucons = Math.max(0, (robber.lucons || 0) - actualFine);
  victim.lucons = (victim.lucons || 0) + actualFine;

  // Glove is consumed regardless
  const inv = robber.inventory || (robber.inventory = {});
  inv[p.gloveKey] = Math.max(0, Number(inv[p.gloveKey] || 0) - 1);
  if (inv[p.gloveKey] <= 0) delete inv[p.gloveKey];

  // 24h cooldown on this pair regardless of outcome
  robCooldowns.set(`${p.robberJid}|${p.victimJid}`, Date.now() + ROB_COOLDOWN_MS);

  // Knockout lockout
  if (knockout) {
    knockouts.set(p.robberJid, Date.now() + KO_LOCKOUT_MS);
  }

  // 0.1.3 — Sharp Reflexes achievement counter
  victim.snatchDefenses = Number(victim.snatchDefenses || 0) + 1;

  savePlayers(players);

  const koLine = knockout
    ? `\n\n💫 *@${digits(p.robberJid)} is KNOCKED OUT!* No commands for 10 min.`
    : `\n\n❤️ Robber HP: *${robber.playerHp}/${robber.playerMaxHp}*`;
  const autoLine = auto
    ? `_(They were too quick — auto-defended on instinct.)_\n\n`
    : "";

  return sock.sendMessage(p.chatId, {
    text:
      `🛡️ *DEFENDED!*\n\n` +
      autoLine +
      `@${digits(p.victimJid)} clocked the snatch attempt and clapped @${digits(p.robberJid)}!\n\n` +
      `💥 Damage dealt: *${dmg}*\n` +
      `💰 Trespass fine: *+${actualFine.toLocaleString()}L* to victim\n` +
      `🧤 Their *${GLOVES[p.gloveKey].name}* was destroyed in the scuffle.` +
      koLine,
    mentions: [p.victimJid, p.robberJid],
  });
}

module.exports = {
  GLOVES,
  cmdRob,
  cmdDefend,
  isKnockedOut,
  updatePlayerLastCmd,
  trackCommandActivity,
};

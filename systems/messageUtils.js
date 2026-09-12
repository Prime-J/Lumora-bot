// systems/messageUtils.js
// Central helpers for player-facing sends: display names, mention tags,
// DM templates, group announcements, battle cards, and system messages.
// Keeps player-name resolution + mention wiring in ONE place.
'use strict';

const fs = require('fs');
const path = require('path');

const PLAYERS_FILE = path.join(__dirname, '..', 'data', 'Players.json');

function loadPlayersSync() {
  try {
    const raw = fs.readFileSync(PLAYERS_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Resolve the registered name for a WhatsApp JID from the local player store.
// Falls back to the bare @handle defined for the number if no username yet.
function resolvePlayerName(jid) {
  const num = String(jid || '').split('@')[0].replace(/\D/g, '');
  if (!num) return null;
  const players = loadPlayersSync();
  for (const p of Object.values(players)) {
    if (String(p.id || p.jid || '').split('@')[0].replace(/\D/g, '') === num) {
      if (p.username && String(p.username).trim()) {
        return String(p.username).trim();
      }
    }
  }
  return null;
}

// Build the bare @handle for a WhatsApp number (e.g. "263779982560" / "cepheus@xxx" -> "263779982560").
function buildHandleFromJid(jid) {
  const num = String(jid || '').split('@')[0].replace(/\D/g, '');
  return num ? `@${num}` : '';
}

// Generate the display text for a player.
// Priority: registered username (with mention tag) > @handle.
// Returns { text, mentionJids } so callers can embed a proper WhatsApp mention.
function generateDisplayTag(jid) {
  const name = resolvePlayerName(jid);
  const handle = buildHandleFromJid(jid);
  const jidClean = String(jid || '').split(':')[0];
  if (name) {
    return {
      text: name,
      mentionJids: [jidClean],
      isMention: true,
    };
  }
  if (handle) {
    return {
      text: handle,
      mentionJids: [jidClean],
      isMention: true,
    };
  }
  return { text: jidClean || 'unknown', mentionJids: [], isMention: false };
}

// Send a message that mentions a specific player JID.
// `text` may include the player's name already; this just ensures the mentions
// array reaches WhatsApp so they get highlighted.
async function mentionTag(sock, chatId, jid, text, msg = null) {
  const { mentionJids } = generateDisplayTag(jid);
  const mentions = mentionJids.length ? mentionJids.map(m => ({ jid: m })) : [];
  await sock.sendMessage(chatId, { text, mentions }, { quoted: msg || undefined });
}

// Send a player-facing mention message (text already contains the name).
async function sendMentionMessage(sock, chatId, jid, text) {
  const { mentionJids } = generateDisplayTag(jid);
  const mentions = mentionJids.length ? mentionJids.map(m => ({ jid: m })) : [];
  await sock.sendMessage(chatId, { text, mentions });
}

// Send a plain player-facing system message to a chat.
async function sendSystemMessage(sock, chatId, text, options = {}) {
  const payload = { text };
  if (options.mentions && options.mentions.length) {
    payload.mentions = options.mentions.map(m => ({ jid: m }));
  }
  await sock.sendMessage(chatId, payload, options.quoted ? { quoted: options.quoted } : undefined);
}

// Send a battle-related message (uses normal send path; kept explicit for clarity).
async function sendBattleMessage(sock, chatId, text, msg = null) {
  await sock.sendMessage(chatId, { text }, msg ? { quoted: msg } : undefined);
}

// Send a group announcement to everyone currently in the group (used by raids/faction pings).
async function sendGroupAnnouncement(sock, chatId, text, msg = null, recipients = null) {
  await sock.sendMessage(chatId, { text }, msg ? { quoted: msg } : undefined);
}

// Send a DM to a single player JID (direct, no group context).
async function sendPlayerDMTemplate(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

// Build a lightweight context object used by message helpers.
// Keeps access to ctx.sock, ctx.chatId, ctx.senderId, ctx.players, settings in one place.
function buildPlayerContext(ctx) {
  const c = ctx || {};
  return {
    sock: c.sock || null,
    chatId: c.chatId || null,
    senderId: c.senderId || null,
    players: c.players || loadPlayersSync(),
    settings: c.settings || {},
    quoteValue: c.msg || null,
  };
}

// Build a bot-context wrapper from ctx for sending from the bot's "side".
function buildBotContext(ctx) {
  const c = ctx || {};
  return {
    sock: c.sock || null,
    chatId: c.chatId || null,
    senderId: c.senderId || null,
    players: c.players || loadPlayersSync(),
    settings: c.settings || {},
  };
}

module.exports = {
  generateDisplayTag,
  mentionTag,
  sendMentionMessage,
  sendSystemMessage,
  sendBattleMessage,
  sendGroupAnnouncement,
  sendPlayerDMTemplate,
  buildPlayerContext,
  buildBotContext,
  resolvePlayerName,
  loadPlayersSync,
};

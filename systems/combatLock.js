// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA COMBAT LOCK  v1.0  (M1)                               ║
// ║  One shared source of truth for "is this player mid-fight?".   ║
// ║                                                                ║
// ║  Both battle engines keep state in memory:                     ║
// ║    • wildbattle   — Map keyed `${chatId}::${senderId}`         ║
// ║    • playerBattle — Map keyed `chatId` with p1/p2              ║
// ║  This module consults BOTH so commands like .heal / .invest /  ║
// ║  .awaken / .shed / .trade / .storage / .open can be denied     ║
// ║  while a player is locked in combat — one fix, no dead flags.  ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

// Late-required to avoid circular imports (wildbattle/playerBattle
// reference each other + shards/quests at startup).
let _wb = null;
function wb() {
  if (!_wb) _wb = require("./wildbattle");
  return _wb;
}
let _pb = null;
function pb() {
  if (!_pb) _pb = require("./playerBattle");
  return _pb;
}

// Returns "wild" | "pvp" | null
function isInCombat(chatId, senderId) {
  if (!chatId || !senderId) return null;
  try {
    if (wb().getWildBattle && wb().getWildBattle(chatId, senderId)) return "wild";
  } catch { /* module unavailable — never lock */ }
  try {
    const b = pb().getBattle && pb().getBattle(chatId);
    if (b && (b.p1 === senderId || b.p2 === senderId)) return "pvp";
  } catch { /* module unavailable — never lock */ }
  return null;
}

// Ready-to-send denial message, or null if not in combat.
// `action` is the human label, e.g. "heal", "merge", "trade".
function denyIfInCombat(chatId, senderId, action) {
  const kind = isInCombat(chatId, senderId);
  if (!kind) return null;
  const text =
    kind === "pvp"
      ? `⚔️ *RESONANCE LOCKED* — you're in a live PvP duel! You can't ${action} while your consciousness is tied to the arena. Finish the fight first.`
      : `🐉 *RESONANCE LOCKED* — a wild Mora has you pinned in combat! You can't ${action} mid-fight. Finish or flee first.`;
  return { text };
}

// M2.6: force-release every live battle a player is in (all chats), for the
// owner .ow reset tool. Returns how many of each were cleared.
function forceRelease(senderId) {
  const result = { wild: 0, pvp: 0 };
  try {
    if (wb().clearAllWildBattlesFor) result.wild = wb().clearAllWildBattlesFor(senderId) || 0;
  } catch { /* module unavailable */ }
  try {
    if (pb().clearAllPvPFor) result.pvp = pb().clearAllPvPFor(senderId) || 0;
  } catch { /* module unavailable */ }
  return result;
}

module.exports = {
  isInCombat,
  denyIfInCombat,
  forceRelease,
};

// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .switch ui — CARD MODE ↔ TEXT MODE                   ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Some players run old WhatsApp builds that cannot render the      ║
// ║  HTML cards. .switch ui flips THEM back to plain text — per       ║
// ║  player, remembered on the player record. Default is cards.       ║
// ║                                                                   ║
// ║  .switch WITHOUT "ui" is the companion command — this plugin      ║
// ║  declines it (returns false) so the old handler keeps working.    ║
// ╚═══════════════════════════════════════════════════════════════════╝

/** Pure toggle so the check script can pin the rules without a session. */
export function nextUiMode(current, want) {
  const cur = String(current || "card").toLowerCase() === "text" ? "text" : "card";
  const w = String(want == null ? "" : want).trim().toLowerCase();
  if (w === "text" || w === "plain" || w === "old") return "text";
  if (w === "card" || w === "cards" || w === "cool" || w === "ui") return "card";
  return cur === "card" ? "text" : "card"; // bare .switch ui toggles
}

/** Shared by every card plugin: does this player want plain text? */
export function isTextMode(player) {
  return !!(player && String(player.uiMode || "").toLowerCase() === "text");
}

export default {
  name: "switch",
  command: ["switch"],
  category: ["game"],
  description: "🎨 .switch ui — toggle the card UI and plain text (default: cards)",

  async run({ m, args, player, players, savePlayers }) {
    const a = String((args && args[0]) || "").toLowerCase();
    // `.switch <companion>` is the OLD command — decline so index.js keeps
    // handling it. Only ".switch ui [mode]" belongs to this plugin.
    if (a !== "ui" && a !== "mode" && a !== "interface") return false;

    if (!player) {
      if (m && typeof m.reply === "function") {
        await m.reply("❌ Register first using `.register`.");
      }
      return true;
    }

    const next = nextUiMode(player.uiMode, args && args[1]);
    player.uiMode = next;
    try {
      if (typeof savePlayers === "function") savePlayers(players);
    } catch (e) {
      console.log("[switch-ui] could not save the preference:", e && e.message);
    }

    if (next === "text") {
      await m.reply(
        "🔤 *TEXT MODE ON*\n\n" +
        "Your commands now answer in plain text — best for older WhatsApp versions.\n" +
        "Run `.switch ui` again to bring the cards back (cards are the default)."
      );
    } else {
      await m.reply(
        "🎨 *CARD MODE ON* (default)\n\n" +
        "Commands answer with interactive cards again.\n" +
        "Run `.switch ui` any time to fall back to plain text."
      );
    }
    return true;
  },
};

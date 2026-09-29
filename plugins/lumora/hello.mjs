// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · STEP ZERO — "HELLO LUMORA"                       ║
// ╠═══════════════════════════════════════════════════════════════╣
// ║  Proves the delivery truck works: one interactive HTML card    ║
// ║  rendered inside the chat, with no external files and no game  ║
// ║  logic. Every later screen (.inv, .arena, .hunt, .market,      ║
// ║  .roll) imports the same systems/lumoraUI.js transport.        ║
// ║                                                               ║
// ║  Plugin shape follows dino.js: default export with            ║
// ║  { name, command, category, description, run }.               ║
// ╚═══════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";

const {
  sendLumoraUI,
  buildLumoraPage,
  pillRow,
  bar,
  section,
  commandBox,
  itemCard,
  tileGrid,
  tabBar,
  panel,
  toastLine,
  emptyState,
  hint,
} = lumoraUI;

/** The page markup — pure function so the check script can assert on it. */
export function buildHelloPage(view) {
  const v = view || {};
  const player = v.player || {};
  const stats = v.stats || {
    name: player.username || "Lumorian",
    level: player.level,
    lucons: player.lucons,
  };

  const body = [
    pillRow([
      { icon: "🪙", label: "Lucons", value: stats.lucons == null ? "—" : stats.lucons, tone: stats.lucons == null ? "" : "warn" },
      { icon: "🌟", label: "Level", value: stats.level == null ? "—" : stats.level },
      { icon: "🧩", label: "Card", value: view.step || "STEP 0" },
    ]),

    bar({ label: "Aura", value: v.aura == null ? 40 : v.aura, max: 100, tone: "aura" }),
    bar({ label: "HP", value: v.hp == null ? 76 : v.hp, max: 100, tone: "hp" }),
    bar({ label: "XP", value: v.xp == null ? 62 : v.xp, max: 100, tone: "xp" }),

    section("What this is"),
    '<div class="bodyIn">This whole panel is one HTML page living inside the chat bubble — CSS, JavaScript and all. Nothing is loaded from the internet.</div>',

    tabBar([
      { id: "shell", icon: "🧱", label: "Shell" },
      { id: "parts", icon: "🧩", label: "Parts" },
      { id: "next", icon: "🗺️", label: "Next" },
    ]),

    panel("shell", [
      section("Transport"),
      '<div class="bodyIn">The page is base64-encoded into a WhatsApp rich response and relayed by the bot. The card cannot message the bot back, so every real action is a command you type.</div>',
      commandBox(".hello", "Tap to copy, then paste it here", { label: "TAP TO COPY" }),
      toastLine("Tap the tabs above — that is local JavaScript running in the card."),
    ].join(""), true),

    panel("parts", tileGrid([
      itemCard({
        icon: "💠", name: "Rarity Glow", rarity: "Epic", qty: 1,
        meta: "Common → Mythic borders",
        details: "Every item card takes its glow colour straight from your item's rarity.",
      }),
      itemCard({
        icon: "🪙", name: "Lucons", rarity: "Legendary", qty: 7163,
        meta: "Currency display",
        details: "Balances, prices and rewards all render in Lucons.",
      }),
      itemCard({
        icon: "⚡", name: "Progress Bars", rarity: "Rare",
        meta: "Aura · HP · XP · Energy",
        details: "Tap any card to open its details — also local, also instant.",
      }),
      itemCard({
        icon: "📋", name: "Command Box", rarity: "Uncommon",
        meta: "Tap to copy the command",
        details: "The card never performs a purchase. It shows you the exact line to type.",
      }),
    ])),

    panel("next", [
      section("Build order"),
      '<div class="bodyIn">Step 0 is this card. Steps 1–6 turn the same shell into .inv → .arena → .hunt → .market → .roll, one screen at a time.</div>',
      emptyState("🎒", "Waiting on this card rendering", "Confirm this card shows on your phone, then we build .inv."),
      hint("Lumora UI · no images, no links, everything drawn with CSS"),
    ].join("")),

    '<div class="bodyIn">If you can read this text inside the chat, the truck works — everything after this is just cargo.</div>',
  ].join("");

  return buildLumoraPage({
    title: "HELLO LUMORA",
    subtitle: "Interactive card test — " + (v.when || "inline"),
    brand: "LUMORA UI",
    bodyHtml: body,
    player: player,
    stats: stats,
    script: PAGE_SCRIPT,
  });
}

// Static (no data interpolation) — safe to live in one constant.
const PAGE_SCRIPT = [
  "(function(){",
  "  try{",
  "    var t=document.getElementById('lum-toast');",
  "    if(t){t.textContent='Card loaded — shell, tabs and bars all rendered locally.'}",
  "  }catch(e){}",
  "})();",
].join("\n");

export default {
  name: "hello",
  command: ["hello", "uihello", "uitest"],
  category: ["game"],
  description: "🧪 Hello Lumora — the interactive in-chat card test",

  async run({ feb, sock, m, args, react, player }) {
    const socket = feb || sock;
    try {
      await react("🧪");

      const html = buildHelloPage({ player: player || {}, step: "STEP 0" });
      await sendLumoraUI(socket, m.chat, html);

      await react("✅");
    } catch (error) {
      console.error("[hello] Error:", error && error.message);
      await react("❌");
      await m.reply("❌ UI card failed: " + (error && error.message ? error.message : error));
    }
  },
};

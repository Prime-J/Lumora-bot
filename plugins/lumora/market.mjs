// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .market — THE SHOP AS A CARD                         ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  The rotation, prices and stock drawn in the chat bubble.         ║
// ║  BUY IS A WRITE — so every entry carries two paths:               ║
// ║    • a tap button (bridge linked) → lumoraActions.buy()           ║
// ║    • a SHELL commandBox — .buy <item> — typed, old-school, always ║
// ║  Both run the exact same buy(); the text .market shell stays.     ║
// ║                                                                   ║
// ║  DECLINES (returns false → the old text .market runs) when:       ║
// ║    • the player picked text mode (.switch ui)                     ║
// ║    • the player is not registered                                 ║
// ║    • args were given (the text path owns every variant)           ║
// ╚═══════════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";
import itemsSystem from "../../systems/items.js";
import marketSystem from "../../systems/market.js";
import { isTextMode } from "./switch.mjs";

const {
  sendLumoraUI,
  buildLumoraPage,
  bridgeContext,
  pillRow,
  section,
  tileGrid,
  itemCard,
  emptyState,
  actionButton,
  commandBox,
  toastLine,
  hint,
} = lumoraUI;

const MAX_ROWS = 9;

/**
 * Turn the current rotation into card rows.
 * itemsDb / market are injectable so the check script can use fixtures.
 */
export function collectMarketView(player, opts) {
  const o = opts || {};
  const market = o.market || {};
  const itemsDb = o.itemsDb || itemsSystem.loadItems();
  const raw = market.currentRotation && Array.isArray(market.currentRotation.items)
    ? market.currentRotation.items
    : [];

  const rows = [];
  for (const e of raw) {
    const item = itemsDb[e.itemId];
    if (!item) continue;
    const price = Number(e.price != null ? e.price : (item.price != null ? item.price : 0));
    rows.push({
      id: item.id || e.itemId,
      name: item.name || e.itemId,
      rarity: item.rarity || "Common",
      icon: itemsSystem.getRarityIcon(item.rarity),
      price,
      stock: e.stock == null ? null : Number(e.stock),
    });
  }

  const minutesLeft = market.nextRotationAt
    ? Math.max(0, Math.ceil((Number(market.nextRotationAt) - Date.now()) / 60000))
    : null;

  return {
    lucons: player && player.lucons != null ? player.lucons : null,
    entries: rows.slice(0, MAX_ROWS),
    hidden: Math.max(0, rows.length - MAX_ROWS),
    total: rows.length,
    minutesLeft,
  };
}

/** The page markup — pure function so the check script can assert on it. */
export function buildMarketPage(view) {
  const v = view || {};
  const bridge = v.bridge || { enabled: false };

  const body = [
    pillRow([
      { icon: "🧺", label: "Items", value: v.total == null ? "—" : v.total },
      { icon: "⏳", label: "Rotates in", value: v.minutesLeft == null ? "—" : (v.minutesLeft + "m") },
      { icon: "🪙", label: "You hold", value: v.lucons == null ? "—" : v.lucons },
    ]),
  ];

  if (!v.entries || !v.entries.length) {
    body.push(emptyState("\u{1F9FA}", "Nothing for sale", "The market rotation is empty right now."));
  } else {
    body.push(section("For sale"));
    body.push(tileGrid(v.entries.map((it) => itemCard({
      icon: it.icon,
      name: it.name,
      rarity: it.rarity,
      meta: "\u{1F681} " + it.price + (it.stock == null ? "" : " · " + it.stock + " in stock"),
      cmd: ".buy " + it.name,
      cmdNote: "Buy shell — tap to copy, then send",
    }))));

    if (bridge.enabled) {
      body.push(section("Tap to buy"));
      body.push(v.entries.map((it) => actionButton({
        label: "Buy " + it.name + " · " + it.price,
        action: "buy",
        params: { item: it.id },
      })).join(""));
    } else {
      body.push(hint("Bridge not linked — use the .buy shells above."));
    }

    if (v.hidden > 0) {
      body.push('<div class="bodyIn">… ' + v.hidden + ' more in the rotation.</div>');
      body.push(commandBox(".market-items", "The rest of the rotation as text"));
    }
  }

  body.push(commandBox(".switch ui", "Switch to the plain text shop"));
  body.push(toastLine("Stock and price are re-checked by the bot when the tap (or shell) arrives."));
  body.push(hint("Lumora UI · market card"));

  return buildLumoraPage({
    title: "MARKET",
    subtitle: v.minutesLeft == null ? "Item shop" : ("Rotates in " + v.minutesLeft + "m"),
    brand: "LUMORA UI",
    bodyHtml: body.join(""),
    player: { username: "", lucons: v.lucons },
    bridge: bridge,
  });
}

export default {
  name: "market",
  command: ["market"],
  category: ["game"],
  description: "\u{1F6D2} The item shop as an interactive card — tap or shell to buy",
  textCommand: "market",

  async run({ feb, sock, m, args, react, player }) {
    if (!player) return false;
    if (isTextMode(player)) return false;
    if (args && args.length) return false;

    const socket = feb || sock;
    const doReact = typeof react === "function" ? react : async () => {};
    try {
      await doReact("\u{1F6D2}");

      let market = null;
      try { market = marketSystem.maybeRotateMarket().market; } catch (e) { market = null; }

      const view = collectMarketView(player, { market: market || {} });
      view.bridge = bridgeContext({
        playerId: m.sender,
        chatId: m.chat,
        cardId: "market",
        actions: ["buy"],
      });

      await sendLumoraUI(socket, m.chat, buildMarketPage(view));
      await doReact("✅");
    } catch (error) {
      console.error("[market] Error:", error && error.message);
      await doReact("❌");
      if (m && typeof m.reply === "function") {
        await m.reply("❌ Market card failed: " + ((error && error.message) || error));
      }
    }
    return true;
  },
};

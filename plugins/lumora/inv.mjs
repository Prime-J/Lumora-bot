// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .inv — YOUR INVENTORY AS A CARD                      ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Storage, lucons and the item list drawn in the chat bubble.      ║
// ║  Every item carries its SHELL: the exact typed command that does  ║
// ║  the same job (.equip / .consume / .item), so old WhatsApp and    ║
// ║  text-mode players lose nothing. Gear gets a tap button when the  ║
// ║  bridge is linked — the same equip() the shell runs.              ║
// ║                                                                   ║
// ║  DECLINES (returns false → the old text .inv runs) when:          ║
// ║    • the player picked text mode (.switch ui)                     ║
// ║    • the player is not registered                                 ║
// ║    • args were given (.inv 2 → the text pager)                    ║
// ╚═══════════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";
import itemsSystem from "../../systems/items.js";
import { isTextMode } from "./switch.mjs";

const {
  sendLumoraUI,
  buildLumoraPage,
  bridgeContext,
  pillRow,
  section,
  tileGrid,
  itemCard,
  commandBox,
  emptyState,
  actionButton,
  toastLine,
  hint,
  escapeHtml,
} = lumoraUI;

const SECTION_ORDER = [
  ["gear", "Gear"],
  ["consumable", "Consumables"],
  ["scroll", "Scrolls"],
  ["hunting", "Hunting"],
  ["material", "Materials"],
  ["crystal", "Crystals"],
  ["access", "Access"],
  ["special", "Special"],
  ["misc", "Other"],
];

const MAX_SHOWN = 12;

function titleCase(s) {
  return String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The typed command that does what this item is for. */
function shellFor(item) {
  const cat = item.category || "misc";
  if (cat === "gear") return ".equip " + (item.id || "");
  if (cat === "consumable" || cat === "scroll") return ".consume " + (item.name || "");
  return ".item " + (item.name || "");
}

function metaFor(item) {
  const cat = item.category || "misc";
  if (cat === "gear") return "Gear · " + titleCase(item.slot || "?");
  return titleCase(cat);
}

/**
 * Group the player's inventory for the card.
 * itemsDb is injectable so the check script can use a fixture.
 */
export function collectInvView(player, opts) {
  const o = opts || {};
  const p = player || {};
  const itemsDb = o.itemsDb || itemsSystem.loadItems();
  try { itemsSystem.ensurePlayerItemData(p); } catch (e) { /* fixture players are fine */ }

  const inv = p.inventory || {};
  const sections = [];
  let total = 0;
  let shown = 0;

  for (const pair of SECTION_ORDER) {
    const cat = pair[0];
    const title = pair[1];
    const items = [];
    for (const id of Object.keys(inv)) {
      const qty = Number(inv[id] || 0);
      if (!qty) continue;
      const item = itemsDb[id];
      if (!item) continue;
      if ((item.category || "misc") !== cat) continue;
      total++;
      if (shown >= MAX_SHOWN) continue;
      shown++;
      items.push({
        id: item.id || id,
        name: item.name || id,
        rarity: item.rarity || "Common",
        icon: itemsSystem.getRarityIcon(item.rarity),
        qty,
        meta: metaFor(item),
        shell: shellFor(item),
        equip: cat === "gear",
      });
    }
    if (items.length) sections.push({ title, items });
  }

  let storage = { used: total, cap: "?" };
  try {
    storage = {
      used: itemsSystem.getUsedStorage(p, itemsDb),
      cap: itemsSystem.getPlayerStorageCapacity(p, itemsDb),
    };
  } catch (e) { /* keep the fallback */ }

  return {
    name: p.username || "Unnamed Lumorian",
    level: p.level == null ? "—" : p.level,
    lucons: p.lucons == null ? "—" : p.lucons,
    storage,
    sections,
    hidden: Math.max(0, total - shown),
    total,
  };
}

/** The page markup — pure function so the check script can assert on it. */
export function buildInvPage(view) {
  const v = view || {};
  const storage = v.storage || { used: 0, cap: 0 };
  const gear = [];
  for (const s of v.sections || []) {
    for (const it of s.items || []) if (it.equip) gear.push(it);
  }
  const bridge = v.bridge || { enabled: false };

  const body = [
    pillRow([
      { icon: "📦", label: "Storage", value: storage.used + "/" + storage.cap,
        tone: Number(storage.cap) > 0 && Number(storage.used) / Number(storage.cap) > 0.9 ? "bad" : "" },
      { icon: "🪙", label: "Lucons", value: v.lucons == null ? "—" : v.lucons },
      { icon: "⭐", label: "Level", value: v.level == null ? "—" : v.level },
    ]),
  ];

  if (!v.sections || !v.sections.length) {
    body.push(emptyState("🎒", "Inventory empty", "Visit .market to stock up."));
  }

  for (const s of v.sections || []) {
    body.push(section(s.title));
    body.push(tileGrid(s.items.map((it) => itemCard({
      icon: it.icon,
      name: it.name,
      rarity: it.rarity,
      qty: it.qty,
      meta: it.meta,
      cmd: it.shell,
      cmdNote: "Tap to copy, then send",
    }))));
  }

  if (bridge.enabled && gear.length) {
    body.push(section("Tap to equip"));
    body.push(gear.slice(0, 6).map((it) => actionButton({
      label: "Equip " + it.name,
      action: "equip",
      params: { item: it.id },
    })).join(""));
  }

  if (v.hidden > 0) {
    body.push('<div class="bodyIn">… ' + v.hidden +
      ' more not shown.</div>');
    body.push(commandBox(".inv 2", "Next page as plain text"));
  }

  body.push(toastLine("Tap an item to see its shell — every action has a typed command."));
  body.push(hint("Lumora UI · inventory card"));

  return buildLumoraPage({
    title: "INVENTORY",
    subtitle: String(v.name || "Lumorian") + " · " + (v.total || 0) + " item" + ((v.total === 1) ? "" : "s"),
    brand: "LUMORA UI",
    bodyHtml: body.join(""),
    player: { username: v.name, level: v.level, lucons: v.lucons },
  });
}

export default {
  name: "inv",
  command: ["inv", "inventory"],
  category: ["game"],
  description: "🎒 Your inventory as an interactive card",
  textCommand: "inventory",

  async run({ feb, sock, m, args, react, player }) {
    if (!player) return false;                                  // → text .inv says "register first"
    if (isTextMode(player)) return false;                       // → plain text, old WhatsApp
    if (args && args.length) return false;                      // → .inv 2 keeps the text pager

    const socket = feb || sock;
    const doReact = typeof react === "function" ? react : async () => {};
    try {
      await doReact("🎒");

      const view = collectInvView(player);
      view.bridge = bridgeContext({
        playerId: m.sender,
        chatId: m.chat,
        cardId: "inv",
        actions: ["equip"],
      });

      await sendLumoraUI(socket, m.chat, buildInvPage(view));
      await doReact("✅");
    } catch (error) {
      console.error("[inv] Error:", error && error.message);
      await doReact("❌");
      if (m && typeof m.reply === "function") {
        await m.reply("❌ Inventory card failed: " + ((error && error.message) || error));
      }
    }
    return true;
  },
};

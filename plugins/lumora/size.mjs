// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .uisize <kb> — FIND THE SIZE CEILING                 ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Sends a card padded to roughly <kb> kilobytes of inert markup so  ║
// ║  we learn the largest page WhatsApp will actually render.          ║
// ║                                                                   ║
// ║  Try: .uisize 10 · .uisize 20 · .uisize 40 · .uisize 80 · 120      ║
// ║  Prime reports which sizes render and which come through blank or  ║
// ║  not at all — that becomes our real page budget.                   ║
// ╚═══════════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";

const {
  buildLumoraPage,
  bridgeContext,
  sendLumoraUI,
  pillRow,
  section,
  commandBox,
  toastLine,
  hint,
  byteSize,
} = lumoraUI;

const SMALLEST_KB = 5;
const LARGEST_KB = 200;
const PAD_UNIT = "<div hidden>pad</div>";

/** The card body itself, shared by both passes of the sizing loop. */
function render(kb, bytes, padding, bridge) {
  const body = [
    pillRow([
      { icon: "📦", label: "Requested", value: kb + " KB" },
      { icon: "📏", label: "Actual", value: Math.round(bytes / 1024) + " KB" },
      { icon: "📐", label: "Bytes", value: String(bytes) },
    ]),

    section("The test"),
    '<div class="bodyIn">If you can read this whole line, this card <b>rendered</b>. If the message came through blank, clipped, or not at all, that is the answer for this size.</div>',
    '<div class="bodyIn">Nothing above is measured by the card — the numbers are what the bot actually sent.</div>',

    section("Try the ladder"),
    commandBox(".uisize 10", "Small — should always work"),
    commandBox(".uisize 20", "Our current design budget"),
    commandBox(".uisize 40", "Double the budget"),
    commandBox(".uisize 80", "Where it usually breaks"),
    commandBox(".uisize 120", "Probably the ceiling"),

    section("Keep the canary alive"),
    commandBox(".hello", "Always keeps working — that is the point"),

    toastLine("Sent " + bytes + " bytes (" + kb + " KB requested)."),
    hint("Lumora UI · " + padding.length + " bytes of inert padding"),
    // The padding itself: inert, hidden, no network, no logic. It is here to
    // make the page as big as requested — nothing else.
    padding,
  ].join("");

  return buildLumoraPage({
    title: "UI SIZE " + kb + "KB",
    subtitle: "Renders or it doesn't — both are useful",
    brand: "LUMORA UI",
    bodyHtml: body,
    bridge,
    extraCss: "",
  });
}

/**
 * Build a card padded to roughly `kb` kilobytes.
 * @returns {{ html:string, kb:number, bytes:number, count:number }}
 */
export function buildSizePage(opts) {
  const o = opts || {};
  const asked = Number(o.kb) || 20;
  const kb = Math.max(SMALLEST_KB, Math.min(LARGEST_KB, asked));
  const target = kb * 1024;
  const bridge = o.bridge || { url: "", token: "", enabled: false };

  const empty = render(kb, 0, "", bridge);
  const unitBytes = Math.max(1, byteSize(PAD_UNIT));
  const count = Math.max(0, Math.ceil((target - byteSize(empty)) / unitBytes));
  const padding = PAD_UNIT.repeat(count);

  // Two passes: the reported size changes the page size by a few bytes.
  let html = render(kb, 0, padding, bridge);
  html = render(kb, byteSize(html), padding, bridge);
  return { html, kb, bytes: byteSize(html), count, clamped: kb !== asked };
}

export default {
  name: "uisize",
  command: ["uisize", "uikb"],
  category: ["bot"],
  description: "📦 Send a padded UI card to find the render size ceiling",

  async run({ feb, sock, m, args, react, player }) {
    const socket = feb || sock;
    try {
      await react("📦");

      const bridge = bridgeContext({
        playerId: m.sender,
        chatId: m.chat,
        cardId: "size",
        actions: ["ping"],
      });

      const built = buildSizePage({ kb: args && args[0], bridge });
      // This card deliberately exceeds the normal 30 KB design budget, so the
      // size guard is raised for it only — everything else still applies.
      await sendLumoraUI(socket, m.chat, built.html, { maxBytes: LARGEST_KB * 1024 + 4096 });

      await react("✅");
    } catch (error) {
      console.error("[uisize] Error:", error && error.message);
      await react("❌");
      await m.reply("❌ Size card failed: " + ((error && error.message) || error) +
        "\n_That failure is itself a result: the transport refused this size._");
    }
  },
};

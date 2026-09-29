// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .uiprobe — WHICH CHANNEL CAN A TAP COME BACK ON?      ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  One card, eight tests. Tap each row and read the result:          ║
// ║   1 render · 2 local JS · 3 clipboard · 4 channel A (fetch POST)   ║
// ║   5 channel B (sendBeacon) · 6 channel C (image GET) · 7 storage   ║
// ║   8 does the card keep running after you scroll away               ║
// ║                                                                   ║
// ║  THE CARD'S ANSWER IS ONLY A HINT. The truth is what ARRIVES at     ║
// ║  the bot: the bridge logs every ping and answers in this same chat  ║
// ║  with "✅ A-post / ❌ B-beacon / …" so Prime can compare.           ║
// ╚═══════════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";

const {
  buildLumoraPage,
  bridgeContext,
  pillRow,
  section,
  actionButton,
  statusRow,
  commandBox,
  toastLine,
  hint,
} = lumoraUI;

/** Pure builder so the check script can assert on the page without a socket. */
export function buildProbePage(view) {
  const v = view || {};
  const player = v.player || {};
  const bridge = v.bridge || { url: "", token: "", enabled: false };

  const bridgeLine = bridge.enabled && bridge.token
    ? "Bridge link attached to this card."
    : "⚠️ No bridge link in this card — set LUMORA_BRIDGE_URL (or start the bridge), then restart the bot.";

  const body = [
    pillRow([
      { icon: "📡", label: "Bridge", value: bridge.enabled ? "linked" : "offline", tone: bridge.enabled ? "good" : "bad" },
      { icon: "🧪", label: "Tests", value: "8" },
      { icon: "🪙", label: "Lucons", value: player.lucons == null ? "—" : player.lucons },
    ]),

    '<div class="bodyIn">Tap every row. The card reports what it can see — but the bot only believes what <b>arrives</b>. The bridge posts a verdict in this chat about a second after you tap the channel rows.</div>',

    section("The card itself"),
    statusRow("1 · Card rendered", "row-render", "running"),
    statusRow("2 · Local JavaScript", "row-js", "tap the button below"),
    actionButton({ label: "Tap me (row 2)", id: "tapbtn", action: "ping", params: { probe: "local-js" }, tone: "ghost" }),
    statusRow("3 · Clipboard", "row-clip", "tap the button below"),
    actionButton({ label: "Copy “.hello” (row 3)", id: "copybtn", action: "ping", params: { probe: "clipboard" }, tone: "ghost" }),
    statusRow("7 · localStorage", "row-storage", "checking"),
    statusRow("8 · Still running", "row-clock", "clock starting"),

    section("Channels back to the bot"),
    bridgeLine,
    statusRow("4 · A — fetch POST", "lum-channel-A", "untried"),
    actionButton({ label: "Ping via fetch (row 4)", action: "ping", params: { probe: "A-post" }, tone: "ghost" }),
    statusRow("5 · B — sendBeacon", "lum-channel-B", "untried"),
    actionButton({ label: "Ping via sendBeacon (row 5)", action: "ping", params: { probe: "B-beacon" }, tone: "ghost" }),
    statusRow("6 · C — image GET", "lum-channel-C", "untried"),
    actionButton({ label: "Ping via image GET (row 6)", action: "ping", params: { probe: "C-image" }, image: true, tone: "ghost" }),

    section("What actually arrives"),
    '<div class="bodyIn">Disappearing rows here are meaningless on their own. The bot answers in the chat within ~2 seconds of your tap, listing which channels reached it: <b>✅ A-post / ✅ B-beacon / ❌ C-image</b>. That message is the evidence.</div>',

    section("After the probe"),
    commandBox(".hello", "The canary card — always keep it working"),
    commandBox(".uisize 40", "Find the size ceiling: try 10, 20, 40, 80, 120"),
    toastLine("Probe ready — tap the rows above."),
    hint("Lumora UI · probe card"),
  ].join("");

  return buildLumoraPage({
    title: "UI PROBE",
    subtitle: "Which channel can a tap come back on?",
    brand: "LUMORA UI",
    bodyHtml: body,
    player,
    bridge,
    script: PAGE_SCRIPT,
  });
}

// No backticks, no ${} — the page's JS only uses strings and concatenation.
const PAGE_SCRIPT = [
  "(function(){",
  "  function set(id,text){",
  "    var el=document.getElementById(id);",
  "    if(el)el.textContent=text;",
  "    return el;",
  "  }",
  "  var failures=[];",
  "  try{",
  "    set('row-render','ok');",
  "  }catch(e){failures.push('render:'+e.name)}",
  "  var taps=0;",
  "  var t=document.getElementById('tapbtn');",
  "  if(t){t.addEventListener('pointerdown',function(e){",
  "    try{ e.preventDefault(); taps++; set('row-js','ok — '+taps+' tap(s)'); }",
  "    catch(err){ set('row-js','FAIL '+((err&&err.name)||'error')); }",
  "  })}",
  "  var c=document.getElementById('copybtn');",
  "  if(c){c.addEventListener('pointerdown',function(e){",
  "    try{",
  "      e.preventDefault();",
  "      if(navigator.clipboard&&navigator.clipboard.writeText){",
  "        navigator.clipboard.writeText('.hello').then(function(){",
  "          set('row-clip','ok — paste it to check');",
  "        },function(err){",
  "          set('row-clip','FAIL '+((err&&err.name)||'denied'));",
  "        });",
  "      } else { set('row-clip','FAIL — no clipboard api'); }",
  "    }catch(err){ set('row-clip','FAIL '+((err&&err.name)||'error')); }",
  "  })}",
  "  try{",
  "    var KEY='lum_probe_stamp';",
  "    localStorage.setItem(KEY,String(Date.now()));",
  "    var back=localStorage.getItem(KEY);",
  "    set('row-storage', back?'ok':'FAIL — wrote nothing');",
  "  }catch(err){ set('row-storage','FAIL '+((err&&err.name)||'error')); }",
  "  var ticks=0;",
  "  try{",
  "    set('row-clock','running 0s');",
  "    setInterval(function(){",
  "      ticks++;",
  "      set('row-clock','running '+ticks+'s — scroll the chat away and come back');",
  "    },1000);",
  "  }catch(err){ set('row-clock','FAIL '+((err&&err.name)||'error')); }",
  "  try{",
  "    var b=window.LUMORA_BRIDGE?window.LUMORA_BRIDGE():{url:'',token:''};",
  "    var msg=document.getElementById('lum-toast');",
  "    if(msg&&!b.url){msg.textContent='No bridge link in this card — the channel rows cannot arrive.'}",
  "  }catch(err){}",
  "})();",
].join("\n");

export default {
  name: "probe",
  command: ["uiprobe", "probe"],
  category: ["bot"],
  description: "📡 Card probe — which channel can a tap come back on?",

  async run({ feb, sock, m, react, player }) {
    const socket = feb || sock;
    try {
      await react("📡");

      const bridge = bridgeContext({
        playerId: m.sender,
        chatId: m.chat,
        cardId: "probe",
        actions: ["ping"],
      });

      const html = buildProbePage({ player: player || {}, bridge });
      await lumoraUI.sendLumoraUI(socket, m.chat, html);

      await react("✅");
    } catch (error) {
      console.error("[probe] Error:", error && error.message);
      await react("❌");
      await m.reply("❌ Probe card failed: " + ((error && error.message) || error));
    }
  },
};

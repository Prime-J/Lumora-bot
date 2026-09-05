// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA MEETING NOTES  v1.0                                    ║
// ║  Save every Town-Hall decision and recall it later.            ║
// ║  .meeting new <title> | add <point> | show [id] | list        ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "meetings.json");
const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━";

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(d.meetings) ? d.meetings : [];
  } catch { return []; }
}
function save(meetings) {
  fs.writeFileSync(FILE, JSON.stringify({ meetings }, null, 2));
}

function pad2(n) { return String(n).padStart(2, "0"); }
// Date + UTC time — stored verbatim on every point so the archive
// always shows when each decision was locked, regardless of timezone.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtUTC(ts) {
  const d = new Date(ts);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

async function cmdMeeting(ctx, chatId, senderId, msg, args = []) {
  const { sock } = ctx;
  const sub = String(args[0] || "").toLowerCase();
  const rest = args.slice(1).join(" ").trim();

  // .meeting new <title> — open a meeting log
  if (sub === "new") {
    const meetings = load();
    const title = rest || "Untitled Meeting";
    const id = meetings.length + 1;
    const now = Date.now();
    meetings.push({ id, title, createdAt: now, createdUtc: fmtUTC(now), items: [] });
    save(meetings);
    return sock.sendMessage(chatId, {
      text:
        `📋 *MEETING #${id} OPEN* — _${title}_\n${DIVIDER}\n` +
        `Save decisions as they happen:\n` +
        `• *.meeting add <point>*\n` +
        `• *.meeting show ${id}* — view anytime`,
    }, { quoted: msg });
  }

  // .meeting add <point> — append to the latest meeting
  if (sub === "add") {
    const meetings = load();
    if (!rest) return sock.sendMessage(chatId, { text: "❌ Usage: *.meeting add <point>*" }, { quoted: msg });
    if (!meetings.length) {
      return sock.sendMessage(chatId, { text: "❌ No meeting open yet — start one with *.meeting new <title>*" }, { quoted: msg });
    }
    const m = meetings[meetings.length - 1];
    const now = Date.now();
    m.items.push({ t: now, utc: fmtUTC(now), text: rest });
    save(meetings);
    return sock.sendMessage(chatId, {
      text:
        `📝 *SAVED → Meeting #${m.id}* — _${m.title}_\n${DIVIDER}\n` +
        `• ${rest}\n${DIVIDER}\n` +
        `_${m.items.length} point(s) so far. View: *.meeting show ${m.id}*_`,
    }, { quoted: msg });
  }

  // .meeting show [id] — view a meeting (default: latest)
  if (sub === "show") {
    const meetings = load();
    const idx = Number(args[1]);
    const m = Number.isFinite(idx) && idx >= 1
      ? meetings.find((x) => x.id === idx)
      : meetings[meetings.length - 1];
    if (!m) return sock.sendMessage(chatId, { text: "❌ No meeting found." }, { quoted: msg });
    const lines = m.items.map((it, i) => `${i + 1}. ${it.text}  _(${it.utc || fmtUTC(it.t)})_`);
    return sock.sendMessage(chatId, {
      text:
        `📋 *MEETING #${m.id} — ${m.title}*\n${DIVIDER}\n` +
        `📅 ${m.createdUtc || fmtUTC(m.createdAt)}  •  ${m.items.length} point(s)\n${DIVIDER}\n` +
        (lines.length ? lines.join("\n") : "_(no points recorded yet)_") +
        `\n${DIVIDER}\n_Add: *.meeting add <point>*  •  Archive: *.meeting list*_`,
    }, { quoted: msg });
  }

  // .meeting list — the archive
  if (sub === "list") {
    const meetings = load();
    if (!meetings.length) {
      return sock.sendMessage(chatId, { text: "📭 No meetings saved yet — *.meeting new <title>*" }, { quoted: msg });
    }
    const lines = meetings.map((m) => `#${m.id} — *${m.title}*  (${m.createdUtc || fmtUTC(m.createdAt)})  • ${m.items.length} pt(s)`);
    return sock.sendMessage(chatId, {
      text:
        `🗂️ *MEETING ARCHIVE*\n${DIVIDER}\n` +
        lines.join("\n") +
        `\n${DIVIDER}\n_View any: *.meeting show <id>*_`,
    }, { quoted: msg });
  }

  // default — help
  return sock.sendMessage(chatId, {
    text:
      `📋 *MEETING NOTES*\n${DIVIDER}\n` +
      `• *.meeting new <title>* — open a meeting log\n` +
      `• *.meeting add <point>* — save a decision\n` +
      `• *.meeting show [id]* — view (default: latest)\n` +
      `• *.meeting list* — the archive`,
  }, { quoted: msg });
}

module.exports = { cmdMeeting };

// Update tracker — current shipped version + pending in-development update.
// Anyone can run .update / .updates to see what's live and what's coming.
// Owner runs .update-release <version> to promote pending → current.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "updates.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { current: null, pending: null, history: [] }; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().split("T")[0];
}

function renderCurrent(c) {
  if (!c) return "📦 *No current version recorded.*";
  return (
    `🟢 *CURRENT — v${c.version}* ${c.name ? `— "${c.name}"` : ""}\n` +
    `_Released ${fmtDate(c.releasedAt)}_\n\n` +
    `${c.notes || "(no notes)"}`
  );
}

// ── LIVE / UPCOMING SEASONAL EVENTS ─────────────────────────────
// Events are not numbered versions, so they get their own panel above the
// version ladder instead of being forced into `current`/`pending`.
const EVENT_ICON = { live: "🔴", upcoming: "🟡", ended: "⚪" };

function eventStatus(e, now = Date.now()) {
  if (e && e.status) return String(e.status).toLowerCase();
  const starts = e && e.startsAt ? Date.parse(e.startsAt) : null;
  const ends   = e && e.endsAt   ? Date.parse(e.endsAt)   : null;
  if (starts && Number.isFinite(starts) && now < starts) return "upcoming";
  if (ends   && Number.isFinite(ends)   && now >= ends)  return "ended";
  return "live";
}

function renderEvent(e, now = Date.now()) {
  if (!e) return "";
  const status = eventStatus(e, now);
  const head =
    `${EVENT_ICON[status] || "🔴"} *${String(e.name || "").toUpperCase()}*` +
    (e.subtitle ? ` — _${e.subtitle}_` : "") +
    (status === "upcoming" && e.startsAt ? `\n_Starts ${fmtDate(Date.parse(e.startsAt))}_` : "") +
    (status === "live" && e.endsAt ? `\n_Ends ${fmtDate(Date.parse(e.endsAt))}_` : "");
  const notes = e.notes ? `\n\n${e.notes}` : "";
  const stages = Array.isArray(e.stages) && e.stages.length
    ? `\n\n${e.stages.map(s => `• ${s}`).join("\n")}`
    : "";
  return head + notes + stages;
}

// Finished events drop off the card so it always reads as current.
function renderEvents(data, now = Date.now()) {
  const list = Array.isArray(data && data.events) ? data.events : [];
  const shown = list.filter(e => eventStatus(e, now) !== "ended");
  if (!shown.length) return "";
  return shown.map(e => renderEvent(e, now)).join("\n\n");
}

function renderPending(p) {
  if (!p) return "📭 *No pending update.*";
  const stages = Array.isArray(p.stages) && p.stages.length
    ? `\n\n*Coming:*\n${p.stages.map(s => `• ${s}`).join("\n")}`
    : "";
  const notes = p.notes ? `\n\n${p.notes}` : "";
  return (
    `🟡 *PENDING — v${p.version}* ${p.name ? `— "${p.name}"` : ""}` +
    notes + stages
  );
}

async function cmdUpdate(ctx, chatId, msg) {
  const data = load();
  const now  = Date.now();
  const events = renderEvents(data, now);
  const text =
    `═══════════════════════\n` +
    `  📜 *LUMORA UPDATES*\n` +
    `═══════════════════════\n\n` +
    (events ? `${events}\n\n───────────────────────\n\n` : "") +
    renderCurrent(data.current) +
    `\n\n───────────────────────\n\n` +
    renderPending(data.pending) +
    `\n\n_Anyone can use .update or .updates to check progress._`;
  return ctx.sock.sendMessage(chatId, { text }, { quoted: msg });
}

async function cmdUpdateRelease(ctx, chatId, msg, args, isOwner) {
  if (!isOwner) {
    return ctx.sock.sendMessage(chatId, { text: "❌ Only the Architect can release updates." }, { quoted: msg });
  }
  const wantVersion = (args[0] || "").trim();
  const data = load();
  if (!data.pending) {
    return ctx.sock.sendMessage(chatId, { text: "❌ No pending update to release." }, { quoted: msg });
  }
  if (wantVersion && wantVersion !== data.pending.version) {
    return ctx.sock.sendMessage(chatId, {
      text: `❌ Pending version is *${data.pending.version}*, but you said *${wantVersion}*. Use \`.update-release ${data.pending.version}\` to confirm.`,
    }, { quoted: msg });
  }

  if (data.current) {
    data.history.unshift(data.current);
    if (data.history.length > 25) data.history = data.history.slice(0, 25);
  }

  const released = { ...data.pending, releasedAt: Date.now() };
  data.current = released;
  data.pending = null;
  save(data);

  const text =
    `═══════════════════════\n` +
    `  🎉 *UPDATE RELEASED — v${released.version}*\n` +
    `═══════════════════════\n\n` +
    `${released.name ? `*"${released.name}"*\n\n` : ""}` +
    `${released.notes || ""}\n` +
    (Array.isArray(released.stages) && released.stages.length
      ? `\n*What shipped:*\n${released.stages.map(s => `✅ ${s}`).join("\n")}`
      : "") +
    `\n\n_The Architect has spoken. The era begins._`;
  return ctx.sock.sendMessage(chatId, { text });
}

module.exports = {
  load,
  save,
  cmdUpdate,
  cmdUpdateRelease,

  // exposed for tests
  eventStatus,
  renderEvent,
  renderEvents,
  renderCurrent,
  renderPending,
  EVENT_ICON,
};

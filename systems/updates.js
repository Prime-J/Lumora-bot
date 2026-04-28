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
  const text =
    `═══════════════════════\n` +
    `  📜 *LUMORA UPDATES*\n` +
    `═══════════════════════\n\n` +
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
};

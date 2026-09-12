// ══════════════════════════════════════════════════════════════
// LUMORA ADMIN TOKENS — Prime's council reward system
// ══════════════════════════════════════════════════════════════
// Prime or the Right-Hand issues tasks (.admin <task>). Sudos take
// a task up with .claim <id> — taking up does NOT lock it and does
// NOT award tokens; the issuer is DM'd the taker's admin name.
// Whoever finishes first reports back; the RHM/Prime verifies and
// clears with .task--<id>-cleared, which notifies every taker.
// Tokens are granted directly by Prime/RHM (.token-give @user <n>
// or via the cleared command with a mention). At cycle end the
// lowest earner is demoted (.cycle-admin) and balances reset.
"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "admin_tokens.json");

// ── TOKEN SHOP — spend tokens on real in-game mechanics ───────
const TOKEN_SHOP = [
  { id: "lucons", cost: 1, label: "💰 1,000 Lucons", desc: "Instant cash for the market." },
  { id: "points", cost: 2, label: "📊 +5 Stat Points", desc: "Grow your stats without the grind." },
  { id: "refill", cost: 3, label: "⚡ Full Refill", desc: "HP + hunt energy + combat energy restored." },
];

function defaultState() {
  return { tasks: [], tokens: {}, history: [], cycle: 1, cycleStartedAt: Date.now() };
}

let _cache = null;
function loadState() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    _cache = defaultState();
  }
  return _cache;
}

function saveState() {
  try {
    const s = loadState();
    // Keep the state file bounded: never lose an open task, but drop the
    // oldest *cleared* tasks once we exceed 100, and cap the history.
    const open = (s.tasks || []).filter((t) => !t.cleared);
    const cleared = (s.tasks || [])
      .filter((t) => t.cleared)
      .sort((a, b) => (a.clearedAt || 0) - (b.clearedAt || 0));
    while (open.length + cleared.length > 100 && cleared.length) cleared.shift();
    s.tasks = [...open, ...cleared];
    if (Array.isArray(s.history) && s.history.length > 300) s.history = s.history.slice(-300);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch (e) {
    console.log("[adminTokens] save failed:", e?.message || e);
  }
}

function getTokens(jid) {
  return Number(loadState().tokens[jid] || 0);
}

function addTokens(jid, n) {
  const s = loadState();
  s.tokens[jid] = Math.max(0, getTokens(jid) + Number(n || 0));
  saveState();
}

// Normalize legacy tasks that still carry claimedBy into takers.
function ensureTakers(task) {
  if (!Array.isArray(task.takers)) task.takers = task.claimedBy ? [task.claimedBy] : [];
  return task;
}

// ── ISSUE A TASK (Prime / Right-Hand) ─────────────────────────
async function issueTask(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock } = ctx;
  if (!opts.isOwner && !opts.isRightHand) {
    return sock.sendMessage(chatId, {
      text: "❌ Only the Architect (Prime) or the Right-Hand can issue admin tasks.",
      quoted: msg,
    });
  }

  // Optional leading number = token value (default 1)
  let tokens = 1;
  let textArgs = (args || []).slice();
  if (textArgs.length && /^\d+$/.test(String(textArgs[0]))) {
    tokens = Math.max(1, parseInt(textArgs[0], 10));
    textArgs = textArgs.slice(1);
  }
  const taskText = textArgs.join(" ").trim();
  if (!taskText) {
    return sock.sendMessage(chatId, {
      text: `Usage: *.admin <task>*  or  *.admin 2 <task>* (2-token task)`,
      quoted: msg,
    });
  }

  const s = loadState();
  const id = `T${Date.now().toString(36).toUpperCase().slice(-5)}`;
  s.tasks.push({
    id,
    text: taskText,
    tokens,
    issuedBy: senderId,
    issuedAt: Date.now(),
    takers: [],
    cleared: false,
    clearedBy: null,
    clearedAt: null,
  });
  saveState();

  const sudos = (typeof opts.loadSudos === "function" ? opts.loadSudos() : []) || [];
  const sudoJids = sudos.map((n) => `${String(n).replace(/\D/g, "")}@s.whatsapp.net`);
  const issuerName = typeof opts.getName === "function" ? opts.getName(senderId) : senderId;

  // DM every sudo with the task.
  let dmCount = 0;
  for (const jid of sudoJids) {
    try {
      await sock.sendMessage(jid, {
        text:
          `🎖 *NEW ADMIN TASK — ${id}*\n\n` +
          `📋 ${taskText}\n\n` +
          `🪙 Reward on clear: *${tokens} token${tokens > 1 ? "s" : ""}*\n` +
          `👑 Issued by: ${issuerName}\n\n` +
          `Taking it up? Type:\n.claim ${id}\n\n` +
          `_Taking up does NOT lock it — finish it, report back, and the issuer clears the ones that are really done._`,
      });
      dmCount++;
    } catch {}
  }

  // Tag every sudo in the group.
  const tagText = sudoJids.length
    ? `\n\n⚠️ ${sudoJids.map((j) => `@${j.split("@")[0]}`).join(" ")} — take it up with *.claim ${id}*`
    : "";

  return sock.sendMessage(chatId, {
    text:
      `📣 *ADMIN TASK ISSUED*\n\n` +
      `🆔 *${id}*\n` +
      `📋 ${taskText}\n` +
      `🪙 Tokens: *${tokens}*\n` +
      tagText +
      `\n\n📩 DM sent to ${dmCount} admin(s).`,
    mentions: sudoJids,
    quoted: msg,
  });
}

// ── TAKE UP A TASK — no lock, issuer notified ─────────────────
async function cmdClaim(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock } = ctx;
  const sudoNums = (typeof opts.loadSudos === "function" ? opts.loadSudos() : []) || [];
  const clean = String(senderId).replace(/\D/g, "");
  if (!sudoNums.includes(clean)) {
    return sock.sendMessage(chatId, {
      text: "❌ Only sudos can take up admin tasks.",
      quoted: msg,
    });
  }

  const s = loadState();
  const id = String(args[0] || "").toUpperCase().trim();
  if (!id) {
    return sock.sendMessage(chatId, { text: "Usage: `.claim <task-id>` — e.g. .claim TABC1", quoted: msg });
  }
  const task = ensureTakers(s.tasks.find((t) => String(t.id).toUpperCase() === id));
  if (!task) {
    return sock.sendMessage(chatId, { text: `❌ No open task with id *${id}*.`, quoted: msg });
  }
  if (task.cleared) {
    return sock.sendMessage(chatId, { text: `✅ *${task.id}* is already cleared and done.`, quoted: msg });
  }
  if (task.takers.includes(senderId)) {
    return sock.sendMessage(chatId, { text: `ℹ️ You already took up *${task.id}*.`, quoted: msg });
  }

  task.takers.push(senderId);
  saveState();

  const takerName = typeof opts.getName === "function" ? opts.getName(senderId) : senderId;
  const issuerName = typeof opts.getName === "function" ? opts.getName(task.issuedBy) : task.issuedBy;

  // DM the issuer (Prime or RHM who set the task).
  try {
    if (String(task.issuedBy) !== String(senderId)) {
      await sock.sendMessage(task.issuedBy, {
        text:
          `🎖 *TASK TAKEN — ${task.id}*\n\n` +
          `${takerName} has taken up:\n"${task.text}"\n\n` +
          `They'll report back when it's done. Verify, then clear it with:\n.task--${task.id}-cleared`,
      });
    }
  } catch {}

  return sock.sendMessage(chatId, {
    text:
      `✅ You've taken up *${task.id}* — *"${task.text}"*\n\n` +
      `📣 ${issuerName} has been notified.\n\n` +
      `🛠️ Finish it, report back, and when it's verified and cleared, everyone who took it up gets the news.`,
    quoted: msg,
  });
}

// ── CLEAR A TASK (Prime / Right-Hand) — notify all takers ─────
async function cmdClear(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock } = ctx;
  if (!opts.isOwner && !opts.isRightHand) {
    return sock.sendMessage(chatId, {
      text: "❌ Only the Architect (Prime) or the Right-Hand can clear tasks.",
      quoted: msg,
    });
  }
  const id = String(args.id || args[0] || "").toUpperCase().trim();
  if (!id) {
    return sock.sendMessage(chatId, { text: "Usage: `.task--<task-id>-cleared`", quoted: msg });
  }
  const s = loadState();
  const task = ensureTakers(s.tasks.find((t) => String(t.id).toUpperCase() === id));
  if (!task) {
    return sock.sendMessage(chatId, { text: `❌ No task with id *${id}*.`, quoted: msg });
  }
  if (task.cleared) {
    return sock.sendMessage(chatId, { text: `✅ *${task.id}* was already cleared.`, quoted: msg });
  }

  task.cleared = true;
  task.clearedBy = senderId;
  task.clearedAt = Date.now();

  // Optional mention → grant the task's tokens to that admin/sudo.
  let grantLine = "";
  if (opts.grantTarget) {
    addTokens(opts.grantTarget, task.tokens);
    const grantName = typeof opts.getName === "function" ? opts.getName(opts.grantTarget) : opts.grantTarget;
    grantLine = `\n\n🪙 +${task.tokens} token${task.tokens > 1 ? "s" : ""} granted to *${grantName}*.`;
    s.history.push({ taskId: task.id, admin: opts.grantTarget, tokens: task.tokens, at: Date.now(), reason: "cleared" });
  }
  saveState();

  const clearText =
    `✅ *TASK CLEARED — ${task.id}*\n\n` +
    `📋 "${task.text}"\n` +
    `_Verified and done._${grantLine}`;

  // Notify every admin who took it up.
  let notified = 0;
  for (const jid of task.takers || []) {
    try {
      await sock.sendMessage(jid, { text: clearText });
      notified++;
    } catch {}
  }

  return sock.sendMessage(chatId, {
    text:
      `✅ *TASK CLEARED*\n\n` +
      `🆔 ${task.id} — *"${task.text}"*\n` +
      `_Verified and done._${grantLine}\n\n` +
      `📩 ${notified} taker(s) notified.`,
    quoted: msg,
  });
}

// ── GRANT TOKENS (Prime / Right-Hand → any admin or sudo) ─────
async function cmdTokenGive(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock } = ctx;
  if (!opts.isOwner && !opts.isRightHand) {
    return sock.sendMessage(chatId, {
      text: "❌ Only the Architect (Prime) or the Right-Hand can grant tokens.",
      quoted: msg,
    });
  }
  const target = opts.target;
  if (!target) {
    return sock.sendMessage(chatId, {
      text: `Usage: *.token-give @user <amount>* — e.g. .token-give @Prime 2`,
      quoted: msg,
    });
  }
  const amt = Math.max(1, parseInt(String(args.find((a) => /^\d+$/.test(a)) || "1"), 10));
  const s = loadState();
  s.history.push({ taskId: "GRANT", admin: target, tokens: amt, at: Date.now(), by: senderId, reason: "grant" });
  addTokens(target, amt);

  const targetName = typeof opts.getName === "function" ? opts.getName(target) : target;
  const giverName = typeof opts.getName === "function" ? opts.getName(senderId) : senderId;
  return sock.sendMessage(chatId, {
    text:
      `🪙 *TOKENS GRANTED*\n\n` +
      `@${String(target).split("@")[0]} *${targetName}* received *${amt} token${amt > 1 ? "s" : ""}* 🪙\n` +
      `New balance: *${getTokens(target)}* 🪙\n` +
      `Granted by: ${giverName}`,
    quoted: msg,
  });
}

// ── SET AN ADMIN NAME (sudos) ─────────────────────────────────
async function cmdAdminName(ctx, chatId, senderId, msg, args, opts = {}) {
  const { sock, players, savePlayers } = ctx;
  const sudoNums = (typeof opts.loadSudos === "function" ? opts.loadSudos() : []) || [];
  const clean = String(senderId).replace(/\D/g, "");
  if (!sudoNums.includes(clean)) {
    return sock.sendMessage(chatId, {
      text: "❌ Only sudos can set an admin name.",
      quoted: msg,
    });
  }
  const name = String(args.join(" ") || "").trim().slice(0, 24);
  if (name.length < 2) {
    return sock.sendMessage(chatId, { text: "Usage: `.admin-name <name>` (2–24 chars)", quoted: msg });
  }
  const p = players && players[senderId];
  if (p) {
    p.adminName = name;
    if (typeof savePlayers === "function") savePlayers(players);
  }
  return sock.sendMessage(chatId, {
    text: `🏷️ Admin name set to *${name}* — this is what shows on admin & sudo work.`,
    quoted: msg,
  });
}

// ── BALANCE ───────────────────────────────────────────────────
async function cmdTokens(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const s = loadState();
  const mine = s.history.filter((h) => h.admin === senderId).slice(-5).reverse();
  const lines = [
    "🪙 *ADMIN TOKENS*",
    "",
    `💰 Balance: *${getTokens(senderId)}* 🪙`,
    "",
  ];
  if (mine.length) {
    lines.push("📜 *Recent*");
    for (const h of mine) {
      lines.push(`  • ${h.taskId} — +${h.tokens} 🪙 (${new Date(h.at).toLocaleDateString()})`);
    }
    lines.push("");
  }
  lines.push(`🛒 Spend them: *.token-shop*\n📊 Rivals: *.admin-lb*`);
  return sock.sendMessage(chatId, { text: lines.join("\n"), quoted: msg });
}

// ── LEADERBOARD ───────────────────────────────────────────────
async function cmdAdminLb(ctx, chatId, senderId, msg, opts = {}) {
  const { sock } = ctx;
  const s = loadState();
  const sudos = (typeof opts.loadSudos === "function" ? opts.loadSudos() : []) || [];
  const rows = sudos
    .map((n) => {
      const jid = `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;
      return {
        jid,
        name: typeof opts.getName === "function" ? opts.getName(jid) : jid.split("@")[0],
        tokens: getTokens(jid),
      };
    })
    .sort((a, b) => b.tokens - a.tokens);

  if (!rows.length) return sock.sendMessage(chatId, { text: "📋 No sudos yet.", quoted: msg });

  const medals = ["🥇", "🥈", "🥉"];
  const lines = [
    "🪙 *ADMIN TOKEN LEADERBOARD*",
    "",
    "_Whoever earns the most keeps their seat._",
    "",
  ];
  rows.forEach((r, i) => {
    lines.push(`${medals[i] || "▫️"} *${i + 1}.* ${r.name} — ${r.tokens} 🪙`);
  });
  lines.push(
    "",
    `🔄 Cycle #${s.cycle || 1} started: ${new Date(s.cycleStartedAt).toLocaleDateString()}`
  );
  return sock.sendMessage(chatId, { text: lines.join("\n"), quoted: msg });
}

// ── TOKEN SHOP ────────────────────────────────────────────────
async function cmdTokenShop(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const lines = [
    "🛒 *TOKEN SHOP*",
    "",
    "Spend your admin 🪙 on in-game goods:",
    "",
  ];
  for (const it of TOKEN_SHOP) {
    lines.push(`${it.label}  —  *${it.cost} 🪙*`);
    lines.push(`    _${it.desc}_`);
    lines.push("");
  }
  lines.push(`Buy: *.token-buy <item>* (${TOKEN_SHOP.map((i) => i.id).join(" / ")})`);
  return sock.sendMessage(chatId, { text: lines.join("\n"), quoted: msg });
}

async function cmdTokenBuy(ctx, chatId, senderId, msg, args) {
  const { sock, players, savePlayers } = ctx;
  const id = String(args[0] || "").toLowerCase().trim();
  const item = TOKEN_SHOP.find((i) => i.id === id);
  if (!item) {
    return sock.sendMessage(chatId, {
      text: `Usage: *.token-buy <item>* — see *.token-shop*`,
      quoted: msg,
    });
  }
  if (getTokens(senderId) < item.cost) {
    return sock.sendMessage(chatId, {
      text: `❌ You need *${item.cost} 🪙* — you have *${getTokens(senderId)} 🪙*. Earn more by getting tasks cleared!`,
      quoted: msg,
    });
  }
  const p = players && players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register", quoted: msg });

  const applied = applyShopItem(p, item.id);
  addTokens(senderId, -item.cost);
  if (typeof savePlayers === "function") savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `✅ *PURCHASED* ${item.label} for *${item.cost} 🪙*\n\n` +
      `${applied}\n` +
      `💰 Remaining tokens: *${getTokens(senderId)}* 🪙`,
    quoted: msg,
  });
}

function applyShopItem(p, id) {
  switch (id) {
    case "lucons":
      p.lucons = Number(p.lucons || 0) + 1000;
      return "💰 +1,000 Lucons added to your wallet.";
    case "points":
      p.statPoints = Number(p.statPoints || 0) + 5;
      return "📊 +5 stat points — spend with *.invest melee 3*.";
    case "refill":
      p.playerHp = Number(p.playerMaxHp) || 100;
      p.huntEnergy = Number(p.maxHuntEnergy || p.huntEnergyMax || 100);
      p.combatEnergy = Number(p.combatMaxEnergy) || 50;
      return "⚡ HP + hunt energy + combat energy fully restored.";
    default:
      return "🤔 Nothing happened.";
  }
}

// ── CYCLE — demote the lowest earner, reset balances ──────────
async function cmdCycle(ctx, chatId, senderId, msg, opts = {}) {
  const { sock } = ctx;
  if (!opts.isOwner && !opts.isRightHand) {
    return sock.sendMessage(chatId, { text: "❌ Only Prime can run the admin cycle.", quoted: msg });
  }

  const s = loadState();
  const sudos = (typeof opts.loadSudos === "function" ? opts.loadSudos() : []) || [];
  if (sudos.length < 2) {
    return sock.sendMessage(chatId, { text: "⚠️ Need at least 2 sudos to run the cycle.", quoted: msg });
  }

  const ranked = sudos
    .map((n) => {
      const jid = `${String(n).replace(/\D/g, "")}@s.whatsapp.net`;
      return {
        num: String(n).replace(/\D/g, ""),
        jid,
        name: typeof opts.getName === "function" ? opts.getName(jid) : jid.split("@")[0],
        tokens: getTokens(jid),
      };
    })
    .sort((a, b) => a.tokens - b.tokens); // ascending — bottom first

  const demoted = ranked[0];
  const kept = ranked.slice(1);

  // Demote: strip the seat (power derives from the sudos list).
  const next = sudos.filter((n) => String(n).replace(/\D/g, "") !== demoted.num);
  if (typeof opts.saveSudos === "function") opts.saveSudos(next);

  // Reap: wipe the demoted balance; reset everyone else for the new cycle.
  s.tokens[demoted.jid] = 0;
  for (const k of kept) s.tokens[k.jid] = 0;
  s.cycle = (s.cycle || 1) + 1;
  s.cycleStartedAt = Date.now();
  saveState();

  const lines = [
    "👑 *ADMIN CYCLE COMPLETE*",
    "",
    `🔻 *DEMOTED — power reaped:*`,
    `   ${demoted.name} (${demoted.tokens} 🪙)`,
    "",
    `🔺 *KEEPING THEIR SEAT:*`,
  ];
  kept.forEach((k, i) => lines.push(`   ${i + 1}. ${k.name} — ${k.tokens} 🪙`));
  lines.push("", "🪙 All balances reset to 0. A new cycle begins — *earn or fall*.", "");
  lines.push("— *Prime, Father of Lumora*");

  return sock.sendMessage(chatId, { text: lines.join("\n"), quoted: msg });
}

// ── .help admin — Prime's bold speech ─────────────────────────
async function showHelp(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const text =
    `👑 *ADMIN TOKENS — THE COUNCIL OF LUMORA*\n\n` +
    `_Listen close, council. I built Lumora with my own hands — and I need warriors who carry it forward, not passengers._\n\n` +
    `🪙 *What are tokens?* Tokens are your *proof of work* — and your ticket to *keep your seat*.\n\n` +
    `📣 *How tasks work:*\n` +
    `  • I or the Right-Hand post tasks: *.admin <task>* (or *.admin 2 <task>* for a 2-token task)\n` +
    `  • Every sudo gets a DM + is tagged in the group\n` +
    `  • Taking it up: *.claim <task-id>* — this does NOT lock it; multiple hands can work it\n` +
    `  • Finish it and report back — the issuer verifies the real work\n\n` +
    `✅ *Clearing:* the issuer checks it's done, then runs:\n` +
    `  *.task--<task-id>-cleared @admin* — the mention grants the task's tokens, and every taker is notified that it's done\n\n` +
    `🪙 *Grants:* I or the Right-Hand can hand tokens to any admin or sudo:\n` +
    `  *.token-give @user <amount>*\n\n` +
    `🏷️ *Admin name:* set the name shown on admin work:\n  *.admin-name <name>*\n\n` +
    `🔄 *The cycle:* When I run *.cycle-admin*, the sudo with the *fewest tokens* is *demoted and stripped of all power*. The rest keep their seats and start fresh.\n\n` +
    `🛒 *Tokens are real currency:* *.token-shop* — Lucons, stat points, refills.\n\n` +
    `📊 *.tokens* — your balance  ·  *.admin-lb* — who's winning\n\n` +
    `_Do the work. Claim the glory. Or step aside._\n\n` +
    `— *Prime, Father of Lumora* 👑`;
  return sock.sendMessage(chatId, { text, quoted: msg });
}

module.exports = {
  TOKEN_SHOP,
  loadState,
  getTokens,
  addTokens,
  issueTask,
  cmdClaim,
  cmdClear,
  cmdTokenGive,
  cmdAdminName,
  cmdTokens,
  cmdAdminLb,
  cmdTokenShop,
  cmdTokenBuy,
  cmdCycle,
  showHelp,
};
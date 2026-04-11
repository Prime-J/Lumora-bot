// systems/economy.js
const fs = require("fs");
const path = require("path");

const factionMarketSystem = require("./factionMarket");

const DATA_DIR = path.join(__dirname, "..", "data");
const TX_FILE = path.join(DATA_DIR, "transactions.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadTx() {
  ensureDir();
  if (!fs.existsSync(TX_FILE)) fs.writeFileSync(TX_FILE, JSON.stringify({}, null, 2));
  try {
    const raw = fs.readFileSync(TX_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveTx(tx) {
  ensureDir();
  fs.writeFileSync(TX_FILE, JSON.stringify(tx, null, 2));
}

function nowMs() {
  return Date.now();
}
function isSameUTCDate(aMs, bMs) {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
function weekKeyUTC(ms) {
  // ISO-ish week key: YYYY-W##
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const y = date.getUTCFullYear();
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

function makeCode() {
  return (
    "TX-" +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function displayName(players, jid) {
  const p = players[jid];
  const u = p?.username && String(p.username).trim() ? String(p.username).trim() : jid.split("@")[0];
  return u;
}

// ===== Daily claim: 100 lucons =====
async function cmdDaily(ctx, chatId, senderId) {
  const { sock, players, savePlayers } = ctx;

  if (!players[senderId]) {
    return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  }

  const p = players[senderId];
  const now = nowMs();

  const last = Number(p.lastDailyAt || 0);
  if (last && isSameUTCDate(last, now)) {
    const cooldownFlavors = [
      "⏳ The Lumora crystals are still recharging. Come back tomorrow.",
      "⏳ The Rift whispers: _patience, traveler._ Daily already claimed.",
      "⏳ You've already drained today's energy. Rest and return.",
      "⏳ Even the strongest Lumorians must wait. Daily claimed.",
      "⏳ The vault is sealed until tomorrow. Daily already taken.",
    ];
    return sock.sendMessage(chatId, { text: cooldownFlavors[Math.floor(Math.random() * cooldownFlavors.length)] });
  }

  // ── Base reward ──────────────────────────────────────────
  let baseReward = 100;
  const lines    = [];

  // ── PURITY: Discipline Tax (-15 Aura if no PvP win in 7 days)
  const disciplineTax = factionMarketSystem.checkPurityDisciplineTax(p);
  if (disciplineTax) lines.push(disciplineTax.message);

  // ── HARMONY: Healer's Tax (-50 from daily reward)
  let finalReward = baseReward;
  const healersTax = factionMarketSystem.checkHarmonyHealersTax(p, baseReward);
  if (healersTax.taxed) {
    finalReward = healersTax.reward;
    lines.push(healersTax.message);
  }

  // ── RIFT: -20% income reduction
  const riftReward = factionMarketSystem.applyRiftDailyReduction(p, finalReward);
  if (p.faction === "rift" && riftReward < finalReward) {
    lines.push(`🔶 *Rift Tax*: Daily income reduced 20% (Rift Seekers live on the edge)\nNet: *${riftReward} Lucons*`);
  }
  finalReward = Math.max(1, p.faction === "rift" ? riftReward : finalReward);

  // ── LOGIN STREAK ──────────────────────────────────────────
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const yesterdayKey = new Date(now - 86400000).toISOString().slice(0, 10);
  const prevLogin = p.lastLoginDate || "";

  if (prevLogin === yesterdayKey) {
    p.loginStreak = (p.loginStreak || 0) + 1;
  } else if (prevLogin !== todayKey) {
    p.loginStreak = 1;
  }
  p.lastLoginDate = todayKey;

  // Streak bonus: +10 lucons per streak day, max +200
  const streakBonus = Math.min((p.loginStreak || 1) * 10, 200);
  finalReward += streakBonus;

  // Companion bond +2 on daily claim
  if (p.companionId != null) {
    p.companionBond = (p.companionBond || 0) + 2;
    lines.push(`💞 *Companion Bond* +2 (total: ${p.companionBond})`);
  }

  p.lucons      = Number(p.lucons || 0) + finalReward;
  p.lastDailyAt = now;
  savePlayers(players);

  const streakLine = `🔥 *Login Streak:* Day ${p.loginStreak} (+${streakBonus} bonus)`;
  const taxNote = lines.length ? `\n\n${lines.join("\n\n")}` : "";
  return sock.sendMessage(chatId, {
    text:
      `✅ *Daily Claimed!*\n\n` +
      `💰 *+${finalReward} Lucons*\n` +
      `${streakLine}\n` +
      `🏦 Balance: *${p.lucons}*` +
      taxNote,
  });
}

// ===== Weekly claim: 350 lucons =====
async function cmdWeekly(ctx, chatId, senderId) {
  const { sock, players, savePlayers } = ctx;

  if (!players[senderId]) {
    return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  }

  const p = players[senderId];
  const now = nowMs();

  const currentWeek = weekKeyUTC(now);
  const lastWeek = String(p.lastWeeklyWeek || "");

  if (lastWeek === currentWeek) {
    const weeklyCooldowns = [
      "⏳ The weekly tribute has already been claimed. Patience, Lumorian.",
      "⏳ The Rift's generosity has limits. Weekly already taken.",
      "⏳ You already collected your weekly bounty. The vault needs time.",
    ];
    return sock.sendMessage(chatId, { text: weeklyCooldowns[Math.floor(Math.random() * weeklyCooldowns.length)] });
  }

  let reward = 250;
  const wLines = [];

  // ── RIFT: -20% income reduction
  const riftWeekly = factionMarketSystem.applyRiftDailyReduction(p, reward);
  if (p.faction === "rift" && riftWeekly < reward) {
    wLines.push(`🔶 *Rift Tax*: -20% reduction applied. Net: *${riftWeekly} Lucons*`);
  }
  reward = p.faction === "rift" ? riftWeekly : reward;

  // ── HARMONY: Healer's Tax on weekly (100 instead of 50)
  if (p.faction === "harmony") {
    const before = reward;
    reward = Math.max(1, reward - 100);
    wLines.push(`🌿 *Healer's Tax*: 100 Lucons donated to the community. Net: *${reward} Lucons*`);
  }

  reward = Math.max(1, reward);
  p.lucons         = Number(p.lucons || 0) + reward;
  p.lastWeeklyWeek = currentWeek;
  savePlayers(players);

  const wNote = wLines.length ? `\n\n${wLines.join("\n\n")}` : "";
  return sock.sendMessage(chatId, {
    text:
      `✅ *Weekly Claimed!*\n\n` +
      `💰 *+${reward} Lucons*\n` +
      `🏦 Balance: *${p.lucons}*` +
      wNote,
  });
}

// ===== Give lucons with transaction code =====
// Use inside index.js instead of your old give logic (or call this from give route)
async function cmdGive(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const { getMentionedJids, getRepliedJid, toUserJidFromArg, normJid } = helpers;

  if (!players[senderId]) {
    return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  }

  const mentioned = getMentionedJids(msg).map(normJid);
  const replied = getRepliedJid(msg);
  const argJid = toUserJidFromArg(args[0]);

  let target = null;
  let amountStr = null;

  if (mentioned[0] || replied) {
    target = mentioned[0] || replied;
    amountStr = args[0];
  } else {
    target = argJid;
    amountStr = args[1];
  }

  if (!target || !amountStr) {
    return sock.sendMessage(chatId, {
      text:
        "TAG the person you want to transfer to:\n\n" +
        "• .give @user 100\n" +
        "• Reply then .give 100\n" +
        "• .give 2637xxxxxxx 100",
    });
  }

  target = normJid(target);

  if (target === senderId) return sock.sendMessage(chatId, { text: "😑 You can’t give yourself lucons." });

  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return sock.sendMessage(chatId, { text: "❌ Amount must be a positive number." });
  }

  if (!players[target]) {
    return sock.sendMessage(chatId, { text: "❌ That user is not registered in Lumora yet." });
  }

  const senderBal = Number(players[senderId].lucons || 0);
  if (senderBal < amount) {
    return sock.sendMessage(chatId, { text: "❌ Not enough Lucons." });
  }

  // perform transfer
  players[senderId].lucons = senderBal - amount;
  players[target].lucons = Number(players[target].lucons || 0) + amount;

  // transaction record
  const tx = loadTx();
  const code = makeCode();
  tx[code] = {
    code,
    from: senderId,
    to: target,
    amount,
    at: new Date().toISOString(),
    reversed: false,
    reversedAt: null,
  };
  saveTx(tx);

  savePlayers(players);

  const fromName = displayName(players, senderId);
  const toName = displayName(players, target);

  return sock.sendMessage(chatId, {
    text:
     ` ✅ *PAYMENT COMPLETE*\n\n` +
      `💰 ${fromName} sent *${amount} Lucons* to ${toName}\n `+
     `🧾 Code: *${code}*\n\n `+
      `Reverse: *.reverse ${code}*`,
    mentions: [target],
  });
}

// ===== Reverse transaction =====
async function cmdReverse(ctx, chatId, senderId, args) {
  const { sock, players, savePlayers } = ctx;

  if (!players[senderId]) {
    return sock.sendMessage(chatId, { text: "❌ Register first using .start" });
  }

  const rawCode = String(args[0] || "").trim();
  if (!rawCode) {
    return sock.sendMessage(chatId, { text: "Use: .reverse TX-XXXX-XXXX" });
  }

  // Case-insensitive lookup so users can type tx-... or TX-...
  const tx = loadTx();
  let code = null;
  const wanted = rawCode.toUpperCase();
  for (const k of Object.keys(tx)) {
    if (k.toUpperCase() === wanted) { code = k; break; }
  }
  if (!code) return sock.sendMessage(chatId, { text: `❌ Transaction code *${rawCode}* not found.` });

  const t = tx[code];
  if (t.reversed) return sock.sendMessage(chatId, { text: "⚠️ That transaction was already reversed." });

  // Match sender by phone number so @lid / @s.whatsapp.net mismatches don't block reversal
  const digits = (s) => String(s || "").split("@")[0].replace(/\D/g, "");
  if (digits(t.from) !== digits(senderId)) {
    return sock.sendMessage(chatId, { text: "⛔ Only the original sender can reverse this transaction." });
  }

  const from = t.from;
  const to = t.to;
  const amount = Number(t.amount || 0);

  if (!players[from] || !players[to]) {
    return sock.sendMessage(chatId, { text: "❌ One of the accounts no longer exists in players DB." });
  }

  // Receiver can owe into negative only if they willingly drain; we refuse if insufficient
  const receiverBal = Number(players[to].lucons || 0);
  if (receiverBal < amount) {
    return sock.sendMessage(chatId, {
      text: `❌ Reverse failed: receiver only has *${receiverBal}* Lucons, need *${amount}* to reverse.`,
    });
  }

  players[to].lucons = receiverBal - amount;
  players[from].lucons = Number(players[from].lucons || 0) + amount;

  t.reversed = true;
  t.reversedAt = new Date().toISOString();
  tx[code] = t;

  saveTx(tx);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text: `✅ Reversed transaction *${code}* — *${amount} Lucons* returned to you.`,
  });
}

module.exports = {
  cmdDaily,
  cmdWeekly,
  cmdGive,
  cmdReverse,
};
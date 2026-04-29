// 0.1.3 — BANK SYSTEM
// Players store Lucons in a vault. Bank balance is invisible to robbers
// (they can only snatch from the wallet). Daily/weekly claims pay a tax
// scaled by total wealth when there's anything in the bank — that's
// Alverah's cut. Optional deposit tax (off by default).

const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "..", "data", "bank.json");

function loadBankSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      const def = {
        depositTaxOn: false,
        depositTaxPct: 0,
        totalTaxPool: 0,
        bankOwnerJid: null,        // null = Architect alone runs the bank
        bankOwnerName: "Alverah",
      };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(def, null, 2));
      return def;
    }
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    // backfill new fields onto older settings files
    if (typeof s.bankOwnerJid === "undefined") s.bankOwnerJid = null;
    if (typeof s.bankOwnerName !== "string") s.bankOwnerName = "Alverah";
    return s;
  } catch {
    return { depositTaxOn: false, depositTaxPct: 0, totalTaxPool: 0, bankOwnerJid: null, bankOwnerName: "Alverah" };
  }
}

function isBankOwner(jid) {
  if (!jid) return false;
  const s = loadBankSettings();
  if (!s.bankOwnerJid) return false;
  return String(s.bankOwnerJid).split(":")[0].split("/")[0] === String(jid).split(":")[0].split("/")[0];
}

function saveBankSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function ensureBank(player) {
  if (typeof player.bankBalance !== "number") player.bankBalance = 0;
}

// Wealth-scaled claim tax. Richer = pays more. Always applied to .daily
// and .weekly when bank balance > 0. Goes to Alverah's tax pool.
//
// Brackets (total = lucons + bankBalance):
//   < 500       → 0%   (poor; no tax)
//   500-2k      → 1%
//   2k-10k      → 3%
//   10k-50k     → 5%
//   50k-200k    → 8%
//   > 200k      → 12%
function getClaimTaxPct(player) {
  ensureBank(player);
  if ((player.bankBalance || 0) <= 0) return 0;
  const total = (player.lucons || 0) + (player.bankBalance || 0);
  if (total < 500)     return 0;
  if (total < 2000)    return 1;
  if (total < 10000)   return 3;
  if (total < 50000)   return 5;
  if (total < 200000)  return 8;
  return 12;
}

function applyClaimTax(player, claimAmount) {
  const pct = getClaimTaxPct(player);
  if (pct <= 0) return { net: claimAmount, tax: 0, pct };
  const tax = Math.floor(claimAmount * (pct / 100));
  const net = Math.max(1, claimAmount - tax);

  if (tax > 0) {
    const s = loadBankSettings();
    s.totalTaxPool = (s.totalTaxPool || 0) + tax;
    saveBankSettings(s);
  }
  return { net, tax, pct };
}

function applyDepositTax(amount) {
  const s = loadBankSettings();
  if (!s.depositTaxOn || (s.depositTaxPct || 0) <= 0) {
    return { net: amount, tax: 0, pct: 0 };
  }
  const pct = s.depositTaxPct;
  const tax = Math.floor(amount * (pct / 100));
  const net = Math.max(1, amount - tax);
  s.totalTaxPool = (s.totalTaxPool || 0) + tax;
  saveBankSettings(s);
  return { net, tax, pct };
}

// ─── Commands ───────────────────────────────────────────────

async function cmdBank(ctx, chatId, senderId, msg, args) {
  const { sock, players, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using *.start*." }, { quoted: msg });
  ensureBank(p);

  const sub = String(args[0] || "").toLowerCase();

  if (!sub || sub === "view" || sub === "balance") {
    const taxPct = getClaimTaxPct(p);
    const taxNote = taxPct > 0
      ? `\n\n_⚠️ Claim tax active: *${taxPct}%* off your next .daily/.weekly._\n_Withdraw to dodge tax — but then your Lucons are robbable._`
      : `\n\n_No claim tax — your bank is empty._`;
    return sock.sendMessage(chatId, {
      text:
        `🏦 *YOUR VAULT*\n\n` +
        `💼 Wallet:    *${(p.lucons || 0).toLocaleString()}L*\n` +
        `🏦 Bank:      *${p.bankBalance.toLocaleString()}L*\n` +
        `─────────────────\n` +
        `💰 Total:     *${((p.lucons || 0) + p.bankBalance).toLocaleString()}L*` +
        taxNote +
        `\n\n📖 *.bank deposit <amt>*  •  *.bank withdraw <amt>*`,
    }, { quoted: msg });
  }

  if (sub === "deposit" || sub === "dep") {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sock.sendMessage(chatId, { text: "Usage: *.bank deposit <amount>*" }, { quoted: msg });
    }
    if ((p.lucons || 0) < amount) {
      return sock.sendMessage(chatId, { text: `❌ Not enough Lucons. You have *${(p.lucons || 0).toLocaleString()}L*.` }, { quoted: msg });
    }
    const { net, tax, pct } = applyDepositTax(amount);
    p.lucons = (p.lucons || 0) - amount;
    p.bankBalance = p.bankBalance + net;
    // 0.1.3 — track lifetime deposits for the Vault Keeper achievement
    p.bankDepositTotal = Number(p.bankDepositTotal || 0) + net;
    savePlayers(players);

    const taxLine = tax > 0 ? `\n💸 Deposit tax (${pct}%): *-${tax.toLocaleString()}L* → Alverah's pool` : "";
    return sock.sendMessage(chatId, {
      text:
        `🏦 *DEPOSIT COMPLETE*\n\n` +
        `💼 Wallet: *${p.lucons.toLocaleString()}L*\n` +
        `🏦 Bank:   *${p.bankBalance.toLocaleString()}L*` +
        taxLine,
    }, { quoted: msg });
  }

  if (sub === "withdraw" || sub === "with") {
    const amount = Number(args[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return sock.sendMessage(chatId, { text: "Usage: *.bank withdraw <amount>*" }, { quoted: msg });
    }
    if (p.bankBalance < amount) {
      return sock.sendMessage(chatId, { text: `❌ Not enough in vault. You have *${p.bankBalance.toLocaleString()}L*.` }, { quoted: msg });
    }
    p.bankBalance = p.bankBalance - amount;
    p.lucons = (p.lucons || 0) + amount;
    savePlayers(players);
    return sock.sendMessage(chatId, {
      text:
        `🏦 *WITHDRAWAL COMPLETE*\n\n` +
        `💼 Wallet: *${p.lucons.toLocaleString()}L*\n` +
        `🏦 Bank:   *${p.bankBalance.toLocaleString()}L*\n\n` +
        `_⚠️ Wallet Lucons can be snatched. Lock them up or stay sharp._`,
    }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text: "Usage:\n• *.bank* — view\n• *.bank deposit <amt>*\n• *.bank withdraw <amt>*",
  }, { quoted: msg });
}

async function cmdBankTax(ctx, chatId, msg, args, isOwner, senderJid) {
  const { sock } = ctx;
  // Architect OR appointed Bank Owner can adjust tax
  if (!isOwner && !isBankOwner(senderJid)) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect or the Bank Owner controls tax policy." }, { quoted: msg });
  }
  const sub = String(args[0] || "").toLowerCase();
  const s = loadBankSettings();

  if (sub === "on") {
    s.depositTaxOn = true;
    if (!s.depositTaxPct) s.depositTaxPct = 2;
    saveBankSettings(s);
    return sock.sendMessage(chatId, { text: `✅ Deposit tax *ON* at *${s.depositTaxPct}%*.` }, { quoted: msg });
  }
  if (sub === "off") {
    s.depositTaxOn = false;
    saveBankSettings(s);
    return sock.sendMessage(chatId, { text: `✅ Deposit tax *OFF*.` }, { quoted: msg });
  }
  if (sub === "set") {
    const pct = Number(args[1]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
      return sock.sendMessage(chatId, { text: "Usage: *.bank-tax set <0-50>*" }, { quoted: msg });
    }
    s.depositTaxPct = pct;
    s.depositTaxOn = pct > 0;
    saveBankSettings(s);
    return sock.sendMessage(chatId, { text: `✅ Deposit tax set to *${pct}%* (${pct > 0 ? "ON" : "OFF"}).` }, { quoted: msg });
  }
  return sock.sendMessage(chatId, {
    text:
      `🏦 *BANK TAX CONTROLS*\n\n` +
      `Current: *${s.depositTaxOn ? "ON" : "OFF"}* (${s.depositTaxPct || 0}%)\n` +
      `Tax pool collected: *${(s.totalTaxPool || 0).toLocaleString()}L*\n\n` +
      `*.bank-tax on*\n*.bank-tax off*\n*.bank-tax set <0-50>*`,
  }, { quoted: msg });
}

// ─── Bank-owner appointment (Architect only) ────────────────
async function cmdBankAssign(ctx, chatId, senderId, msg, args, isOwner, helpers) {
  const { sock, players } = ctx;
  const { getMentionedJids, getRepliedJid, normJid } = helpers;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect can appoint a Bank Owner." }, { quoted: msg });
  }
  const targets = getMentionedJids(msg);
  const repliedTo = getRepliedJid(msg);
  const targetJid = targets[0] || repliedTo;
  if (!targetJid) {
    return sock.sendMessage(chatId, { text: "Usage: *.bank-assign @user* (or reply to them)" }, { quoted: msg });
  }
  const tNorm = normJid(targetJid);
  const target = players[tNorm];
  if (!target) {
    return sock.sendMessage(chatId, { text: "❌ That user isn't registered." }, { quoted: msg });
  }
  const s = loadBankSettings();
  s.bankOwnerJid = tNorm;
  s.bankOwnerName = target.username || "Alverah";
  saveBankSettings(s);
  return sock.sendMessage(chatId, {
    text:
      `🏦 *BANK OWNER APPOINTED*\n\n` +
      `@${tNorm.split("@")[0]} now wears the Vault Sigil as *${s.bankOwnerName}*.\n\n` +
      `_They control deposit tax, can grant from the tax pool, and answer to the Architect alone._`,
    mentions: [tNorm],
  }, { quoted: msg });
}

async function cmdBankRemove(ctx, chatId, msg, isOwner) {
  const { sock } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect can dismiss the Bank Owner." }, { quoted: msg });
  }
  const s = loadBankSettings();
  if (!s.bankOwnerJid) {
    return sock.sendMessage(chatId, { text: "🏦 No Bank Owner is currently appointed." }, { quoted: msg });
  }
  const removedName = s.bankOwnerName || "the Bank Owner";
  s.bankOwnerJid = null;
  s.bankOwnerName = "Alverah";
  saveBankSettings(s);
  return sock.sendMessage(chatId, {
    text: `🏦 *${removedName}* has been stripped of the Vault Sigil. The Architect resumes direct control.`,
  }, { quoted: msg });
}

// ─── Bank-owner powers ──────────────────────────────────────
async function cmdBankPool(ctx, chatId, msg, isOwner, senderJid) {
  const { sock } = ctx;
  if (!isOwner && !isBankOwner(senderJid)) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect or Bank Owner can inspect the pool." }, { quoted: msg });
  }
  const s = loadBankSettings();
  return sock.sendMessage(chatId, {
    text:
      `🏛️ *ALVERAH'S TAX POOL*\n\n` +
      `Pool balance: *${(s.totalTaxPool || 0).toLocaleString()}L*\n` +
      `Deposit tax: *${s.depositTaxOn ? "ON" : "OFF"}* (${s.depositTaxPct || 0}%)\n` +
      `Claim tax: *AUTOMATIC* — scales with player wealth\n\n` +
      `Use *.bank-grant @user <amt>* to disburse from the pool.`,
  }, { quoted: msg });
}

async function cmdBankGrant(ctx, chatId, senderId, msg, args, isOwner, helpers) {
  const { sock, players, savePlayers } = ctx;
  const { getMentionedJids, getRepliedJid, normJid } = helpers;
  if (!isOwner && !isBankOwner(senderId)) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect or Bank Owner can disburse the pool." }, { quoted: msg });
  }
  const targets = getMentionedJids(msg);
  const repliedTo = getRepliedJid(msg);
  const targetJid = targets[0] || repliedTo;
  // amount is the LAST numeric arg (so "@user 500" or "500" both work)
  const numArg = args.find(a => /^\d+$/.test(a));
  const amount = Number(numArg);
  if (!targetJid || !Number.isFinite(amount) || amount <= 0) {
    return sock.sendMessage(chatId, { text: "Usage: *.bank-grant @user <amount>*" }, { quoted: msg });
  }
  const tNorm = normJid(targetJid);
  const target = players[tNorm];
  if (!target) return sock.sendMessage(chatId, { text: "❌ That user isn't registered." }, { quoted: msg });

  const s = loadBankSettings();
  if ((s.totalTaxPool || 0) < amount) {
    return sock.sendMessage(chatId, {
      text: `❌ Pool only holds *${(s.totalTaxPool || 0).toLocaleString()}L*. Can't grant *${amount.toLocaleString()}L*.`,
    }, { quoted: msg });
  }
  s.totalTaxPool = (s.totalTaxPool || 0) - amount;
  saveBankSettings(s);
  target.lucons = (target.lucons || 0) + amount;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `💰 *GRANT ISSUED*\n\n` +
      `@${tNorm.split("@")[0]} received *${amount.toLocaleString()}L* from Alverah's pool.\n` +
      `Pool remaining: *${s.totalTaxPool.toLocaleString()}L*`,
    mentions: [tNorm],
  }, { quoted: msg });
}

async function cmdBankVault(ctx, chatId, msg, isOwner, senderJid) {
  const { sock, players } = ctx;
  if (!isOwner && !isBankOwner(senderJid)) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect or Bank Owner can audit the vault." }, { quoted: msg });
  }
  let totalBanked = 0;
  let depositors = 0;
  let topName = "—", topAmt = 0;
  for (const [, p] of Object.entries(players)) {
    const b = Number(p?.bankBalance || 0);
    if (b > 0) {
      totalBanked += b;
      depositors++;
      if (b > topAmt) { topAmt = b; topName = p.username || "Anonymous"; }
    }
  }
  const s = loadBankSettings();
  return sock.sendMessage(chatId, {
    text:
      `🏛️ *VAULT AUDIT*\n\n` +
      `📦 Total banked across all Lumorians: *${totalBanked.toLocaleString()}L*\n` +
      `👥 Active depositors: *${depositors}*\n` +
      `🥇 Largest single vault: *${topName}* — ${topAmt.toLocaleString()}L\n` +
      `🏦 Tax pool: *${(s.totalTaxPool || 0).toLocaleString()}L*\n\n` +
      `Bank Owner: *${s.bankOwnerName}*${s.bankOwnerJid ? ` (@${String(s.bankOwnerJid).split("@")[0]})` : " — Architect"}`,
  }, { quoted: msg });
}

module.exports = {
  loadBankSettings,
  saveBankSettings,
  ensureBank,
  isBankOwner,
  getClaimTaxPct,
  applyClaimTax,
  applyDepositTax,
  cmdBank,
  cmdBankTax,
  cmdBankAssign,
  cmdBankRemove,
  cmdBankPool,
  cmdBankGrant,
  cmdBankVault,
};

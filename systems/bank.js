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
      const def = { depositTaxOn: false, depositTaxPct: 0, totalTaxPool: 0 };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(def, null, 2));
      return def;
    }
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return { depositTaxOn: false, depositTaxPct: 0, totalTaxPool: 0 };
  }
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

async function cmdBankTax(ctx, chatId, msg, args, isOwner) {
  const { sock } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Only the Architect controls Alverah's policies." }, { quoted: msg });
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

module.exports = {
  loadBankSettings,
  saveBankSettings,
  ensureBank,
  getClaimTaxPct,
  applyClaimTax,
  applyDepositTax,
  cmdBank,
  cmdBankTax,
};

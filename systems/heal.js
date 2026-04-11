// systems/heal.js
const COOLDOWN_MS = 15 * 60 * 1000;

function fmtMs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function getEnergyCaps(m) {
  // Prefer stored maxEnergy, then stats.energy, else fallback.
  const maxE = Number(m?.maxEnergy ?? m?.stats?.energy ?? 30);
  const safeMax = Number.isFinite(maxE) && maxE > 0 ? Math.floor(maxE) : 30;

  const curE = Number(m?.energy);
  const safeCur = Number.isFinite(curE) && curE >= 0 ? Math.floor(curE) : safeMax;

  return {
    maxEnergy: safeMax,
    energy: Math.min(safeCur, safeMax),
  };
}

async function cmdHeal(ctx, chatId, senderId) {
  const { sock, players, savePlayers, battleSystem } = ctx;

  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .start" });

  // ✅ Block ONLY if THIS player is in an active battle in THIS group
  try {
    const b = battleSystem?.getBattle?.(chatId) || null;
    if (b && (senderId === b.aJid || senderId === b.bJid)) {
      return sock.sendMessage(chatId, { text: "⛔ You can’t heal while you’re in a battle. Finish/forfeit first." });
    }
  } catch {
    // if battleSystem isn't wired yet, just skip the check
  }

  const now = Date.now();
  const last = Number(p.lastHealAt || 0);

  if (last && now - last < COOLDOWN_MS) {
    const left = COOLDOWN_MS - (now - last);
    const healFlavors = [
      `⏳ The healing crystals need time to recharge. Wait ${fmtMs(left)}.`,
      `⏳ Your Mora's wounds are still mending. Try again in ${fmtMs(left)}.`,
      `⏳ The Rift's restorative energy hasn't returned yet. ${fmtMs(left)} remaining.`,
    ];
    return sock.sendMessage(chatId, { text: healFlavors[Math.floor(Math.random() * healFlavors.length)] });
  }

  const owned = Array.isArray(p.moraOwned) ? p.moraOwned : [];
  if (!owned.length) return sock.sendMessage(chatId, { text: "😔 You don’t own any Mora yet." });

  // ✅ Heal ALL Mora (including fainted) + restore energy
  for (const m of owned) {
    const maxHp = Number(m?.maxHp || 0);
    if (Number.isFinite(maxHp) && maxHp > 0) {
      m.hp = maxHp;
    }

    const caps = getEnergyCaps(m);
    m.maxEnergy = caps.maxEnergy;
    m.energy = caps.maxEnergy; // full restore on heal
  }

  p.lastHealAt = now;
  savePlayers(players);

  return sock.sendMessage(chatId, { text: "✅ Party healed ❤️ (+ Energy restored 🔋)" });
}

module.exports = { cmdHeal };
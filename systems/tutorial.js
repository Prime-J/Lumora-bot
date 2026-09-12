// ══════════════════════════════════════════════════════════════
// LUMORA GUIDED TUTORIAL — first-journey flow for new players
// ══════════════════════════════════════════════════════════════
// Flow: faction joined → "you're all set" + Begin/Skip buttons →
// world links → join a Hunting Ground → scripted battle (you win,
// it hurts) → rewards (bg art soon + Lucons + shard) → Market GC
// → buy a healing capsule → heal → done.
//
// State lives on the player object (p.tutorial) so there is ONE
// owner: step = offer | skip | join | battle | heal | done.
"use strict";

const MAX_PLAYER_LEVEL = require("../core/xpSystem").MAX_PLAYER_LEVEL;

// ── WORLD LINKS (real groups) ─────────────────────────────────
const WORLD_LINKS = {
  hunt1: "https://chat.whatsapp.com/KO49ofp0Sy7Cljhy6qf5kZ?mode=gi_t",
  hunt2: "https://chat.whatsapp.com/EUiNwYhP23aC3qTzCcF3pM?mode=gi_t",
  battleground: "https://chat.whatsapp.com/KbYKc2TRhYiE5fotm1oxiV?mode=gi_t",
  market: "https://chat.whatsapp.com/HCs4qvETAzj6NXNELewsEn?mode=gi_t",
};

// Invite codes resolved to JIDs at boot, same pattern as faction groups.
const HUNT_GROUND_INVITES = [
  { code: "KO49ofp0Sy7Cljhy6qf5kZ", name: "Hunting Grounds 1" },
  { code: "EUiNwYhP23aC3qTzCcF3pM", name: "Hunting Grounds 2" },
  { code: "KbYKc2TRhYiE5fotm1oxiV", name: "Battleground" },
];

// Resolved JID → group name (keys use raw info.id; index.js normalizes).
const HUNT_GROUNDS = {};
let huntGroundsResolved = false;

async function resolveHuntGrounds(sock) {
  if (huntGroundsResolved || !sock || typeof sock.groupGetInviteInfo !== "function") return;
  let resolved = 0;
  for (const g of HUNT_GROUND_INVITES) {
    try {
      const info = await sock.groupGetInviteInfo(g.code);
      if (info && info.id) {
        HUNT_GROUNDS[String(info.id)] = g.name;
        resolved++;
      }
    } catch (e) {
      console.log(`⚠️ Could not resolve hunt-ground invite ${g.code}: ${e?.message || e}`);
    }
  }
  // Only stop retrying once at least one ground resolved; a total failure
  // (e.g. transient network) gets retried on the next join event.
  if (resolved > 0) huntGroundsResolved = true;
  console.log("✅ Hunting grounds resolved:", Object.keys(HUNT_GROUNDS).length);
}

function ensureTutorial(p) {
  if (!p) return null;
  if (!p.tutorial || typeof p.tutorial !== "object") p.tutorial = {};
  return p.tutorial;
}

function linksBlock() {
  return [
    `🏹 *HUNTING GROUNDS 1* — ${WORLD_LINKS.hunt1}`,
    `🏹 *HUNTING GROUNDS 2* — ${WORLD_LINKS.hunt2}`,
    `⚔️ *BATTLEGROUND* — ${WORLD_LINKS.battleground}`,
    `🏪 *MARKET PLACE* — ${WORLD_LINKS.market}`,
  ].join("\n");
}

function getButtons() {
  return require("./buttons");
}

// ── OFFER — shown after faction join: "you're all set" ────────
async function offerTutorial(sock, chatId, msg, head) {
  const btns = getButtons();
  btns.mapButtons({
    "🎓 Begin Tutorial": ".tutorial",
    "⏭️ Skip Tutorial": ".skip-tutorial",
  });
  const title = head || "🎉 *You're all set, Lumorian!*";
  return btns.sendButtons(
    sock,
    chatId,
    `${title}\n\n` +
      `🌌 Before you dive in — want the *guided tutorial*? It's a fast, fun first hunt with a *special reward* waiting at the end. 🎁`,
    ["🎓 Begin Tutorial", "⏭️ Skip Tutorial"],
    { footer: "Or type .tutorial / .skip-tutorial", quoted: msg }
  );
}

// ── SKIP — send the world links as a "visit later" list ───────
async function cmdSkip(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
  const t = ensureTutorial(p);
  t.step = "skipped";
  t.skippedAt = Date.now();
  if (typeof savePlayers === "function") savePlayers(players);
  return sock.sendMessage(
    chatId,
    {
      text:
        `⏭️ *TUTORIAL SKIPPED* — that's fine, hunter.\n\n` +
        `Save these for later — visit whenever you're ready:\n\n` +
        linksBlock() +
        `\n\n🎮 Type *.help* anytime — or *.tutorial* if you change your mind (the reward stays waiting 🎁).`,
      quoted: msg,
    }
  );
}

// ── START — the guided flow. Resumes based on the player's step.
async function cmdStart(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
  const t = ensureTutorial(p);

  if (t.step === "battle") return resumeBattle(ctx, senderId, msg);
  if (t.step === "heal") return resumeHeal(ctx, senderId, msg);
  if (t.step === "join") return startBattle(ctx, senderId, msg);
  if (t.step === "done") {
    return sock.sendMessage(chatId, {
      text: `✅ You already completed the tutorial, champion!\n\n${linksBlock()}`,
      quoted: msg,
    });
  }

  // Fresh start (undefined / offer / skipped). The step is only advanced
  // AFTER the intro DMs actually deliver — otherwise a failed DM would leave
  // the player at "join" and the next .tutorial would skip straight to the
  // battle without them ever seeing the intro or the world links.
  let dmOk = false;
  try {
    await sock.sendMessage(senderId, {
      text:
        `🎓 *LUMORA GUIDED TUTORIAL*\n\n` +
        `Hey ${p.username || "Lumorian"} — Star here. 🌟\n` +
        `Let's get you into the real world, fast. This is a *quick guided hunt* — you'll win, but the wild hits hard, so listen up.\n\n` +
        `🪙 *Special reward* waiting when you finish. Let's go!`,
    });
    dmOk = true;
  } catch {}
  try {
    await sock.sendMessage(senderId, {
      text:
        `🗺️ *FIRST STOP — THE HUNTING GROUNDS*\n\n` +
        `Join a Hunting Grounds group:\n\n` +
        linksBlock() +
        `\n\n👉 When you join, the group welcome shows a *🎓 Start Tutorial* button — tap it and we'll begin.`,
    });
    dmOk = true;
  } catch {}

  const inDm = String(senderId) === String(chatId);
  if (!dmOk) {
    return sock.sendMessage(chatId, {
      text: inDm
        ? `❌ Hmm, that message didn't go through. Try *.tutorial* again in a moment.`
        : `❌ I couldn't reach your DM, ${p.username || ""}.\n👉 Send the bot any private message first (e.g. *.help*), then type *.tutorial* again.`,
      quoted: msg,
    });
  }

  t.step = "join";
  t.startedAt = Date.now();
  if (typeof savePlayers === "function") savePlayers(players);

  if (!inDm) {
    return sock.sendMessage(chatId, {
      text: `📩 I DM'd you the tutorial intro, ${p.username || ""}! Check your private chat. 👀`,
      quoted: msg,
    });
  }
}

// ── BATTLE — scripted fight: 2 hits, enemy hits back hard ─────
async function startBattle(ctx, senderId, msg) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const p = players[senderId];
  if (!p) return;
  const t = ensureTutorial(p);

  const moraList = (typeof loadMora === "function" ? loadMora() : []) || [];
  const enemy = moraList.find((m) => Number(m.id) === 1) || moraList[0] || { name: "Rift Pup" };
  t.step = "battle";
  t.enemyName = enemy.name || "Rift Pup";
  t.enemyHp = 2;
  t.enemyMaxHp = 2;
  if (typeof savePlayers === "function") savePlayers(players);

  const btns = getButtons();
  btns.mapButtons({ "⚔️ Attack": ".t-attack" });
  return btns.sendButtons(
    sock,
    senderId,
    `⚔️ *A wild ${t.enemyName} appears!*\n\n` +
      `It's *weak* — 2 hits and it's down. But it hits *hard*, so finish it fast!\n\n` +
      `🎯 Enemy HP: ${t.enemyHp}/${t.enemyMaxHp}`,
    ["⚔️ Attack"],
    { footer: "Tap Attack — this is your tutorial hunt!", quoted: msg }
  );
}

async function resumeBattle(ctx, senderId, msg) {
  const { sock, players } = ctx;
  const p = players[senderId];
  const t = ensureTutorial(p);
  const btns = getButtons();
  btns.mapButtons({ "⚔️ Attack": ".t-attack" });
  return btns.sendButtons(
    sock,
    senderId,
    `⚔️ *Still fighting the wild ${t.enemyName || "Rift Pup"}!*\n\n🎯 Enemy HP: ${t.enemyHp}/${t.enemyMaxHp}\n\nFinish it!`,
    ["⚔️ Attack"],
    { footer: "Tap Attack!", quoted: msg }
  );
}

async function cmdAttack(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const p = players[senderId];
  if (!p) return sock.sendMessage(chatId, { text: "❌ Register first using .register" }, { quoted: msg });
  const t = ensureTutorial(p);
  if (t.step !== "battle") {
    return sock.sendMessage(chatId, {
      text: "⚠️ You're not in the tutorial battle. Type *.tutorial* to start it.",
      quoted: msg,
    });
  }

  // Guard against partial/corrupt state softlocking the fight (NaN HP =
  // a battle that can never be won).
  t.enemyMaxHp = Number(t.enemyMaxHp) || 2;
  if (!Number.isFinite(Number(t.enemyHp)) || Number(t.enemyHp) > t.enemyMaxHp) {
    t.enemyHp = t.enemyMaxHp;
  }

  const maxHp = Number(p.playerMaxHp) || 100;
  if (!Number.isFinite(Number(p.playerHp))) p.playerHp = maxHp;

  t.enemyHp -= 1;

  // Enemy counterattack — the "destroys your health" beat. Clamped
  // to 1 so the tutorial never knocks the player out.
  const dmg = Math.max(5, Math.floor(maxHp * 0.35));
  p.playerHp = Math.max(1, Number(p.playerHp) - dmg);

  if (t.enemyHp <= 0) {
    // ── VICTORY ──
    // Level-up respects the global cap (same source as core/xpSystem).
    const leveled = Number(p.level || 1) < MAX_PLAYER_LEVEL;
    if (leveled) {
      p.level = Number(p.level || 1) + 1;
      p.statPoints = Number(p.statPoints || 0) + 3;
    }
    // Level-up refill: energy refills, HP stays low ON PURPOSE (next lesson).
    p.combatEnergy = Number(p.combatMaxEnergy) || 50;
    p.huntEnergy = Number(p.maxHuntEnergy || p.huntEnergyMax || 100);
    // Rewards: Lucons + Cleanse Shard. Background art arrives in a later patch.
    p.lucons = Number(p.lucons || 0) + 250;
    p.inventory = p.inventory || {};
    p.inventory.ITM_006 = (p.inventory.ITM_006 || 0) + 1;
    t.step = "heal";
    t.wonAt = Date.now();
    if (typeof savePlayers === "function") savePlayers(players);

    const levelLine = leveled
      ? `⭐ *LEVEL UP!* You're now *Level ${p.level}* (+3 stat points)`
      : `⭐ You're already at the level cap (*${MAX_PLAYER_LEVEL}*) — rewards granted, no level gained.`;
    const lines = [
      `🎉 *VICTORY!* You took down the wild *${t.enemyName}*!`,
      "",
      `━━━ *REWARDS* ━━━`,
      `🖼️ Rare Background Art — *arriving in a future patch* (your frame is reserved!)`,
      `💰 +250 Lucons`,
      `💠 +1 Cleanse Shard`,
      levelLine,
      "",
      `⚠️ But that fight *wrecked* you — you're at *${p.playerHp}/${maxHp}* HP.`,
      "",
      `🛒 *NEXT:* join the *Market Place* group:`,
      `${WORLD_LINKS.market}`,
      "",
      `Buy a *Minor Healing Capsule* (35 LC), then type:`,
      `*.consume ITM_001*`,
      "",
      `📊 Then spend your stat points:`,
      `*.invest melee 3*  (or vit / mora / speed / def)`,
    ];
    return sock.sendMessage(senderId, { text: lines.join("\n"), quoted: msg });
  }

  const btns = getButtons();
  btns.mapButtons({ "⚔️ Attack": ".t-attack" });
  return btns.sendButtons(
    sock,
    senderId,
    `💥 *Hit!* The ${t.enemyName} staggers — it lashes back for *${dmg} damage*! 💢\n\n` +
      `🎯 Enemy HP: ${t.enemyHp}/${t.enemyMaxHp}  |  You: ${p.playerHp}/${maxHp} HP\n\nOne more hit!`,
    ["⚔️ Attack"],
    { footer: "Tap Attack!", quoted: msg }
  );
}

// ── HEAL — directed to the market; auto-completes on full HP ──
async function resumeHeal(ctx, senderId, msg) {
  const { sock } = ctx;
  return sock.sendMessage(senderId, {
    text:
      `🛒 *MARKET STEP* — you still need to heal!\n\n` +
      `1️⃣ Join the *Market Place* group:\n${WORLD_LINKS.market}\n\n` +
      `2️⃣ Buy a *Minor Healing Capsule* (35 LC)\n\n` +
      `3️⃣ Type *.consume ITM_001*\n\n` +
      `💡 The moment your HP is full, I'll finish the tutorial for you.`,
    quoted: msg,
  });
}

// Hooked after every .consume — advances heal → done when HP is full.
async function onConsume(ctx, senderId) {
  try {
    const { sock, players, savePlayers } = ctx;
    const p = players && players[senderId];
    if (!p) return;
    const t = ensureTutorial(p);
    if (t.step !== "heal") return;
    const maxHp = Number(p.playerMaxHp) || 100;
    if (Number(p.playerHp || 0) < maxHp) return; // not healed yet

    t.step = "done";
    t.completedAt = Date.now();
    p.lucons = Number(p.lucons || 0) + 150;
    if (typeof savePlayers === "function") savePlayers(players);

    const lines = [
      `🏁 *TUTORIAL COMPLETE!*`,
      "",
      `You're healed, you leveled up, and you've got your first shard + Lucons. That's the Lumora loop: *hunt → fight → heal → grow*. 🌌`,
      "",
      `🎁 *Bonus reward:* +150 Lucons`,
      "",
      `📊 Don't forget your *3 stat points* — type *.invest melee 3* (or vit / mora / speed / def).`,
      "",
      `🗺️ Explore the world whenever you're ready:`,
      "",
      linksBlock(),
      "",
      `*Welcome to Lumora, ${p.username || "Lumorian"}.* 🔥`,
    ].join("\n");
    await sock.sendMessage(senderId, { text: lines }).catch(() => {});
  } catch (e) {
    console.log("[tutorial] onConsume error:", e?.message || e);
  }
}

// ── HUNT-GROUND WELCOME — the persistent tutorial button ──────
async function sendHuntGroundWelcome(sock, groupIdStr, jidStr, groundName) {
  try {
    const tag = `@${String(jidStr).split("@")[0]}`;
    const text =
      `🌌 *${groundName}* — welcome, ${tag}!\n\n` +
      `The wild is dangerous here... but this is where Lumorians are made. 💪\n\n` +
      `🎓 *New here?* Do the *guided tutorial* for a special reward — a quick first hunt that teaches you the whole loop.`;
    const btns = getButtons();
    btns.mapButtons({ "🎓 Start Tutorial": ".tutorial" });
    return btns.sendButtons(sock, groupIdStr, text, ["🎓 Start Tutorial"], {
      footer: "Tap to begin your first hunt!",
      mentions: [jidStr],
    });
  } catch (e) {
    console.log("[tutorial] hunt-ground welcome error:", e?.message || e);
  }
}

module.exports = {
  WORLD_LINKS,
  HUNT_GROUNDS,
  HUNT_GROUND_INVITES,
  resolveHuntGrounds,
  ensureTutorial,
  offerTutorial,
  cmdStart,
  cmdSkip,
  cmdAttack,
  onConsume,
  sendHuntGroundWelcome,
};
// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA FACTION MARKET  v3.0 — "The True Balance"           ║
// ╠═══════════════════════════════════════════════════════════════╣
// ║  FACTION PHILOSOPHY — every path has real cost AND reward:   ║
// ║                                                               ║
// ║  🌿 HARMONY                                                  ║
// ║     Benefit: Best catchers, full corruption tools, Mora      ║
// ║              bond bonuses, half backlash on self             ║
// ║     Drawback: Weakest in PvP (-8% dmg), cannot benefit from ║
// ║               corrupted Mora at all, Healer's Tax            ║
// ║               (daily costs 50 more Lucons)                   ║
// ║                                                               ║
// ║  ⚔️  PURITY                                                  ║
// ║     Benefit: Strongest in PvP (+10% dmg), best battle tools ║
// ║              anti-corruption gear, no energy burnout         ║
// ║     Drawback: Corrupted Mora auto-flee party immediately,    ║
// ║               no tame bonus, Discipline Tax (must win 1 PvP  ║
// ║               per week or lose Aura)                         ║
// ║                                                               ║
// ║  🕶  RIFT                                                    ║
// ║     Benefit: Corrupted Mora = power (+20% dmg), Aura double ║
// ║              chance, Mythic Mora access, highest raw reward  ║
// ║     Drawback: HARDEST backlash when PE maxes out (not from  ║
// ║               holding corrupted Mora — from PE overflow),    ║
// ║               Lucon income from dailies reduced by 20%,      ║
// ║               corrupted Mora WILL explode if not managed     ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const itemsSystem = require("./items");
const { applyItemEffects, SCROLL_EFFECTS } = require("./inventory");

const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─";

function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 — FACTION IDENTITY: BENEFITS + DRAWBACKS
// Every faction entry has both perks[] AND drawbacks[].
// These are shown in .faction market and .factioninfo.
// ══════════════════════════════════════════════════════════════
const FACTION_BENEFITS = {
  harmony: {
    emoji:   "🌿",
    name:    "Harmony Lumorians",
    belief:  "Humans and Mora are one. The Rift is a wound — we heal it, we don't exploit it.",
    speech:  "The Harmony archives open quietly. Sacred scripts, cleansing tools, and bond stabilizers await those who walk the balanced path.",
    perks: [
      "🧼 *Cleanse Shard* (exclusive) — removes corruption from any Mora",
      "📜 *Scroll of Purification* (exclusive) — full corruption cleanse",
      "🔵 *Stabilizer* (exclusive) — -20 Primordial Energy on any Mora",
      "🎯 *+5% catch success* on all wild Mora (passive)",
      "💛 *Half backlash* — Corruption backlash deals 50% less damage to you",
      "🌿 *Healer's Synergy* — healing items restore 20% more HP",
    ],
    drawbacks: [
      "😤 *-8% PvP damage* — Harmony beliefs limit offensive Mora training",
      "🚫 *Cannot use Corrupted Mora* in party — they flee your pure energy",
      "💰 *Healer's Tax* — daily reward costs +50 Lucons (you invest in the community)",
      "📦 *No black market access* — Harmony opposes forbidden trade",
    ],
  },
  purity: {
    emoji:   "⚔️",
    name:    "The Purity Order",
    belief:  "The Rift is a plague. Mora are its symptoms. We seal the wound and protect humanity — by force if necessary.",
    speech:  "The Order's armoury stands open. Precision tools, combat scrolls, and discipline gear for those who fight with purpose and iron will.",
    perks: [
      "⚔️ *+10% PvP damage* — Purity training sharpens combat focus",
      "🎯 *+20% move accuracy* via Scroll of Precision (exclusive)",
      "🛡️ *No energy burnout* — discipline prevents the 200→100 gauge drop",
      "👁 *Corrupted sensing* — warned before entering a corrupted encounter",
      "🧱 *+15% Aura on PvP win* — the Order honours decisive victory",
      "🗡 *Dominion Core* (exclusive) — battle control gear",
    ],
    drawbacks: [
      "💨 *Corrupted Mora instantly flee* your party — the Order's energy rejects them",
      "🎯 *No tame/catch bonus* — Purity doesn't believe in bonding with wild Mora",
      "⚠️ *Discipline Tax* — if you go 7 days without a PvP win, lose 15 Aura",
      "🚫 *Cannot buy Harmony cleanse items* — you destroy corruption, not coddle it",
    ],
  },
  rift: {
    emoji:   "🕶",
    name:    "The Rift Seekers",
    belief:  "The Rift is not a disaster. It is power. Unlimited, uncompromising, glorious power. We don't close it — we become it.",
    speech:  "The Rift whispers its secrets to the worthy. Forbidden amplifiers, chaos energy, Primordial tools — for those who understand that all power has a price.",
    perks: [
      "🌀 *Corrupted Mora deal +20% damage* for you (they respond to Rift energy)",
      "🎲 *15% Aura double chance* on any win (chaos rewards the bold)",
      "👁 *Mythic Mora access* — only Rift can attempt to tame Mythic-tier Mora",
      "☠ *+30% attack scroll* (Scroll of Rift Surge, exclusive)",
      "🌑 *Corrupted spawns* — more corrupted Mora appear for you to capture",
      "💀 *Primordial Mastery* — PE builds slower for YOU specifically (-15% PE gain)",
    ],
    drawbacks: [
      "💥 *PE Overflow Explosion* — when any Mora hits 100 PE, it EXPLODES: faint + party damage + Aura loss",
      "💰 *-20% daily Lucon income* — Rift Seekers live on the edge, not on charity",
      "🩸 *Corruption burns both ways* — corrupted Mora deal 8 HP backlash PER TURN in battle to YOU",
      "🏥 *No healing scrolls* — Rift doesn't believe in retreat or recovery",
      "⚠️ *Unstable catch* — 10% chance any non-Shadow Mora flees mid-catch attempt",
    ],
  },
};

// ══════════════════════════════════════════════════════════════
// SECTION 2 — FACTION MARKET CATALOG
// Items available per faction. Each faction has:
//   - Their unique scrolls
//   - Consumables relevant to their playstyle
//   - 1-2 exclusive gear pieces
// ══════════════════════════════════════════════════════════════
// This supplements the factionMarket.json file.
// Items listed here that are NOT in factionMarket.json are
// always available at the hardcoded price below.
const FACTION_CATALOG = {
  harmony: [
    { itemId: "SCR_001", price: 180, desc: "Removes corruption from one Mora" },
    { itemId: "SCR_002", price: 140, desc: "-20% incoming battle damage" },
    { itemId: "SCR_003", price: 200, desc: "Restore HP and party Mora HP" },
    { itemId: "SCR_004", price: 160, desc: "+15% catch success next catch" },
    { itemId: "SCR_005", price: 150, desc: "Block Aura loss from one faint" },
    { itemId: "ITM_006", price: 220, desc: "Cleanse one Mora of corruption" },   // Cleanse Shard - Harmony exclusive
    { itemId: "ITM_005", price: 160, desc: "-20 Primordial Energy on Mora" },    // Stabilizer - Harmony exclusive
    { itemId: "GER_002", price: 300, desc: "+5% bond/tame success (gear)" },     // Harmony Pulse Core
    { itemId: "GER_010", price: 240, desc: "+5% catch chance (gear charm)" },    // Whisperleaf Charm
    { itemId: "ITM_003", price: 140, desc: "Restore 15 Aura after fainting" },   // Aura Stabilizer
  ],
  purity: [
    { itemId: "SCR_006", price: 170, desc: "Control unstable Mora (battle)" },
    { itemId: "SCR_007", price: 180, desc: "+20% move accuracy (battle)" },
    { itemId: "SCR_008", price: 160, desc: "Force Mora obedience (battle)" },
    { itemId: "SCR_009", price: 200, desc: "+15% Mora attack (battle)" },
    { itemId: "SCR_010", price: 150, desc: "Reveal enemy Mora stats (battle)" },
    { itemId: "GER_003", price: 320, desc: "+10 battle control (gear core)" },   // Dominion Core - Purity exclusive
    { itemId: "GER_012", price: 250, desc: "-10% Aura loss (gear charm)" },       // Aura Lantern
    { itemId: "ITM_001", price: 80,  desc: "Restore 30 player HP" },
    { itemId: "ITM_002", price: 150, desc: "Restore 70 player HP" },
    { itemId: "GER_050", price: 280, desc: "Purity Crest — -15% corruption" },   // Purity crest
  ],
  rift: [
    { itemId: "SCR_011", price: 220, desc: "+30% Mora attack (battle)" },
    { itemId: "SCR_012", price: 180, desc: "+20% corrupted Mora spawns" },
    { itemId: "SCR_013", price: 160, desc: "Reveal hidden anomalies" },
    { itemId: "SCR_014", price: 200, desc: "Immunity to env damage (hunt)" },
    { itemId: "SCR_015", price: 190, desc: "+10 Primordial Energy instantly" },
    { itemId: "GER_005", price: 350, desc: "+20% damage, +15% PE gain (trade-off gear)" }, // Riftbite Core
    { itemId: "ITM_015", price: 170, desc: "Reduce env damage this hunt" },       // Pulse Tonic - useful for Rift terrain
    { itemId: "GER_021", price: 290, desc: "Rift Compass — +% unstable encounters" }, // Rift exclusive gear
    { itemId: "ITM_008", price: 400, desc: "Forbidden Mora Lure (rare)" },         // Force spawn
    { itemId: "GER_011", price: 270, desc: "+10% rare Mora spawn (gear)" },
  ],
};

// ══════════════════════════════════════════════════════════════
// SECTION 3 — FACTION CONSEQUENCE SYSTEM
// ══════════════════════════════════════════════════════════════
// Every faction has UNIQUE consequences — not just "backlash or not".
//
// HARMONY consequences (for holding corrupted Mora):
//   • Immediate moderate backlash — 4 commands grace period, then
//     HP damage + Aura loss (50% of base because Harmony resists it)
//   • Cannot USE corrupted Mora in battle (they flee the pure energy)
//   • Harmony energy is incompatible with corruption
//
// PURITY consequences (for holding corrupted Mora):
//   • INSTANT forced flee — corrupted Mora auto-leave the party
//     the moment Purity energy touches them. No grace period.
//   • Any corrupted Mora in tamed list gets quarantined (can't be
//     placed in party)
//   • The hardest rule: you literally CANNOT keep them
//
// RIFT consequences (for PE overflow at 100):
//   • Not from HOLDING corrupted Mora (that's their power)
//   • From MISMANAGING Primordial Energy — when ANY Mora hits PE 100:
//     that Mora faints, deals damage to entire party, player loses Aura
//   • Plus: in-battle corruption burn (8 HP/turn) meaning combat
//     with corrupted Mora costs the player health while winning
//   • Plus: daily income reduced 20% (tracked in economy.js)
//   • Plus: 10% non-Shadow catch fail (applied in spawn.js)
//
// WEEKLY DISCIPLINE TAX for Purity:
//   • Checked on .daily command — if no PvP win in 7 days → -15 Aura
//
// HARMONY HEALER'S TAX:
//   • Checked on .daily command — costs 50 extra Lucons
//   • (Player gets the daily, but 50 is "donated to the community")
// ══════════════════════════════════════════════════════════════

const CORRUPTION_GRACE = 4; // Harmony: commands before backlash fires

function getCorruptedMora(player) {
  if (!Array.isArray(player.moraOwned)) return [];
  return player.moraOwned.filter(m => m && m.corrupted && Number(m.hp || 0) > 0);
}

function hasCleanseTool(player) {
  const inv = player.inventory || {};
  return Number(inv.ITM_006 || 0) > 0 || Number(inv.SCR_001 || 0) > 0;
}

// ── PURITY: Auto-quarantine corrupted Mora ───────────────────
// Called whenever a Purity player's state is loaded.
// Corrupted Mora are moved OUT of the active party and flagged.
// Returns { quarantined: string[] } (names of removed Mora)
function enforcePurityQuarantine(player) {
  if (!Array.isArray(player.moraOwned)) return { quarantined: [] };
  const quarantined = [];

  for (const mora of player.moraOwned) {
    if (!mora || !mora.corrupted) continue;
    // Mark as quarantined — can't enter party
    if (!mora.quarantined) {
      mora.quarantined = true;
      quarantined.push(mora.name || "Unknown Mora");
    }
  }

  // Remove quarantined Mora from party slots
  if (Array.isArray(player.party) && quarantined.length) {
    const corruptedNames = new Set(
      player.moraOwned.filter(m => m?.corrupted).map(m => m.name)
    );
    for (let i = 0; i < player.party.length; i++) {
      const idx = player.party[i];
      if (idx === null || idx === undefined) continue;
      const mora = player.moraOwned[idx];
      if (mora && mora.corrupted) {
        player.party[i] = null; // evict from party
      }
    }
  }

  return { quarantined };
}

// ── RIFT: PE Overflow Explosion ──────────────────────────────
// Called after any action that could raise PE (battles, hunts).
// If any Mora hits PE 100+, it explodes.
// Returns array of explosion events or null.
function checkPeOverflow(player) {
  if (!Array.isArray(player.moraOwned)) return null;

  const explosions = [];
  for (const mora of player.moraOwned) {
    if (!mora || Number(mora.pe || 0) < 100) continue;

    // Mora explodes
    const auraLoss  = 12;
    const selfDamage = 15;
    const partyDmg  = 8;

    // Faint the Mora
    mora.hp = 0;
    mora.pe = 0;

    // Damage player
    player.playerHp = Math.max(1, (player.playerHp || 100) - selfDamage);
    player.aura     = Math.max(0, (player.aura     || 0)   - auraLoss);

    // Damage other party Mora
    const partyCasualties = [];
    for (const other of player.moraOwned) {
      if (!other || other === mora || Number(other.hp || 0) <= 0) continue;
      other.hp = Math.max(0, Number(other.hp) - partyDmg);
      if (other.hp === 0) partyCasualties.push(other.name);
    }

    explosions.push({
      moraName:         mora.name,
      selfDamage,
      auraLoss,
      partyDmg,
      partyCasualties,
      message:
        `${DIV}\n` +
        `💥  *P R I M O R D I A L   E X P L O S I O N*\n` +
        `${DIV}\n\n` +
        `*${mora.name}*'s Primordial Energy reached *100* and detonated!\n\n` +
        `📉 *CONSEQUENCES*\n` +
        `├ 💀 *${mora.name}* fainted instantly\n` +
        `├ ❤️ You took *-${selfDamage} HP* from the shockwave\n` +
        `├ ✨ You lost *-${auraLoss} Aura*\n` +
        `└ 🐉 All other Mora took *-${partyDmg} HP* from the blast\n` +
        (partyCasualties.length ? `\n💀 Also fainted: *${partyCasualties.join(", ")}*\n` : "") +
        `\n_"The Rift gives. The Rift takes. You forgot which one you were doing."_\n\n` +
        `💡 Manage PE using the *Stabilizer* or keep Mora under 80 PE.\n` +
        `${DIV}`,
    });
  }

  return explosions.length ? explosions : null;
}

// ── MAIN CHECK — called once per command in index.js ─────────
// Returns an array of consequence objects (each has .message)
// or null if nothing happened this tick.
function checkFactionConsequences(player, faction) {
  const results = [];

  const corrupted = getCorruptedMora(player);

  // ─── HARMONY CONSEQUENCES ──────────────────────────────────
  if (faction === "harmony") {
    if (corrupted.length === 0) {
      player.corruptionExposureCount = 0;
      return null;
    }

    // Has a cleanse tool: warn only
    if (hasCleanseTool(player)) {
      return [{
        backlash: false,
        warning:  true,
        message:
          `⚠️ *CORRUPTION DETECTED*  _(Harmony Warning)_\n` +
          `You carry *${corrupted.length}* corrupted Mora.\n` +
          `Your cleansing item is protecting you — use it soon.\n` +
          `*.consume Cleanse Shard*  or  *.consume Scroll of Purification*`,
      }];
    }

    player.corruptionExposureCount = (player.corruptionExposureCount || 0) + 1;

    if (player.corruptionExposureCount < CORRUPTION_GRACE) {
      const left = CORRUPTION_GRACE - player.corruptionExposureCount;
      return [{
        backlash: false,
        warning:  true,
        message:
          `☠ *CORRUPTION WARNING* _(${player.corruptionExposureCount}/${CORRUPTION_GRACE})_  🌿 Harmony\n` +
          `*${corrupted.length}* corrupted Mora destabilise your bond energy.\n` +
          `${left} more action${left !== 1 ? "s" : ""} before backlash strikes.\n\n` +
          `🧼 *.fbuy Cleanse Shard*  _(Harmony exclusive)_`,
      }];
    }

    // Backlash fires — Harmony gets 50% reduction
    player.corruptionExposureCount = 0;
    const attacker  = corrupted[Math.floor(Math.random() * corrupted.length)];
    const hpLoss    = Math.max(1, Math.floor(corrupted.length * 6 * 0.5));
    const auraLoss  = Math.max(1, Math.floor(corrupted.length * 4 * 0.5));
    player.playerHp = Math.max(1, (player.playerHp || 100) - hpLoss);
    player.aura     = Math.max(0, (player.aura     || 0)   - auraLoss);

    return [{
      backlash: true,
      hpLoss,
      auraLoss,
      message:
        `${DIV}\n` +
        `☠  *C O R R U P T I O N   B A C K L A S H*  🌿\n` +
        `${DIV}\n\n` +
        `*${attacker.name}*'s Primordial energy clashes with your Harmony bond!\n\n` +
        `📉 *DAMAGE* _(reduced 50% by Harmony resistance)_\n` +
        `├ ❤️ HP: *-${hpLoss}*\n` +
        `└ ✨ Aura: *-${auraLoss}*\n\n` +
        `_Harmony energy rejects corruption. Your bond weakens while you carry it._\n` +
        `🧼 *.fbuy Cleanse Shard*  to end this.\n` +
        `${DIV}`,
    }];
  }

  // ─── PURITY CONSEQUENCES ───────────────────────────────────
  if (faction === "purity") {
    if (corrupted.length === 0) return null;

    // Purity auto-quarantines on contact — immediate, no grace
    const { quarantined } = enforcePurityQuarantine(player);

    if (quarantined.length) {
      return [{
        backlash: false,
        quarantine: true,
        message:
          `${DIV}\n` +
          `⚔️  *P U R I T Y   Q U A R A N T I N E*\n` +
          `${DIV}\n\n` +
          `The Order's energy is incompatible with corruption.\n` +
          `*${quarantined.join(", ")}* ${quarantined.length === 1 ? "has" : "have"} been ` +
          `*removed from your active party* and quarantined.\n\n` +
          `_You may keep them in your tamed list but cannot use them in battle._\n\n` +
          `💡 Options:\n` +
          `• *.consume Scroll of Dominion* to temporarily override (battle only)\n` +
          `• Sell or release quarantined Mora\n` +
          `• Switch factions if corruption is your intended path\n` +
          `${DIV}`,
      }];
    }
    return null;
  }

  // ─── RIFT CONSEQUENCES (PE OVERFLOW) ───────────────────────
  if (faction === "rift") {
    // Rift players CAN hold corrupted Mora freely.
    // Their consequence is PE overflow — checked separately.
    // We check it here too for completeness.
    const overflows = checkPeOverflow(player);
    if (overflows) {
      return overflows.map(o => ({ backlash: true, peExplosion: true, ...o }));
    }
    return null;
  }

  // ─── NO FACTION ────────────────────────────────────────────
  // Factionless players get moderate universal backlash
  if (corrupted.length === 0) return null;

  player.corruptionExposureCount = (player.corruptionExposureCount || 0) + 1;
  if (player.corruptionExposureCount < 3) {
    return [{
      backlash: false,
      warning:  true,
      message:
        `⚠️ You carry *${corrupted.length}* corrupted Mora.\n` +
        `Join a faction for proper tools to manage them.\n` +
        `Backlash in *${3 - player.corruptionExposureCount}* more action${3 - player.corruptionExposureCount !== 1 ? "s" : ""}.`,
    }];
  }
  player.corruptionExposureCount = 0;
  const hpLoss   = corrupted.length * 8;
  const auraLoss = corrupted.length * 6;
  player.playerHp = Math.max(1, (player.playerHp || 100) - hpLoss);
  player.aura     = Math.max(0, (player.aura     || 0)   - auraLoss);
  return [{
    backlash: true,
    message:
      `☠ *CORRUPTION BACKLASH*\n\n` +
      `❤️ HP: *-${hpLoss}*\n✨ Aura: *-${auraLoss}*\n\n` +
      `Join a faction to get proper corruption tools.`,
  }];
}

// Legacy alias so index.js doesn't need updating
function checkCorruptionBacklash(player, faction) {
  const results = checkFactionConsequences(player, faction);
  return results ? results[0] : null;
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — MARKET UI BUILDER
// ══════════════════════════════════════════════════════════════
function buildFactionMarketText(player) {
  if (!player.faction) {
    return `❌ You must join a faction first.\nUse *.faction harmony / purity / rift*`;
  }

  const faction  = player.faction;
  const info     = FACTION_BENEFITS[faction];
  const catalog  = FACTION_CATALOG[faction] || [];
  const itemsDb  = itemsSystem.loadItems();

  // Also pull from factionMarket.json if it has extra items
  const fmData   = itemsSystem.loadFactionMarket();
  const jsonItems = fmData.factions?.[faction]?.items || [];

  // Merge: json items take precedence (for stock tracking), catalog fills gaps
  const merged = new Map();
  for (const entry of catalog) {
    merged.set(entry.itemId, { ...entry, source: "catalog" });
  }
  for (const entry of jsonItems) {
    merged.set(entry.itemId, { ...entry, source: "json" });
  }

  // Group items by category for cleaner layout
  const groups = {
    scroll:     { label: "📜 SCROLLS",     items: [] },
    gear:       { label: "🛡️ GEAR",        items: [] },
    consumable: { label: "🧪 CONSUMABLES", items: [] },
    other:      { label: "✨ SPECIAL",     items: [] },
  };

  for (const entry of merged.values()) {
    const item = itemsDb[entry.itemId];
    if (!item) continue;
    const cat = String(item.category || "other").toLowerCase();
    const bucket = groups[cat] ? cat : "other";
    groups[bucket].items.push({ entry, item });
  }

  // Sort each group by rarity then price
  const rank = { Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6 };
  for (const g of Object.values(groups)) {
    g.items.sort((a, b) => {
      const ra = rank[a.item.rarity] || 0;
      const rb = rank[b.item.rarity] || 0;
      if (ra !== rb) return rb - ra;
      return Number(a.entry.price || 0) - Number(b.entry.price || 0);
    });
  }

  const formatItem = ({ entry, item }) => {
    const icon = itemsSystem.getRarityIcon(item.rarity);
    const stockStr = entry.source === "json" && entry.stock !== undefined
      ? (entry.stock <= 0 ? "  •  ❌ SOLD OUT" : `  •  📦 ${entry.stock} left`)
      : "";
    return (
      `  ${icon} *${item.name}*  —  💰 ${entry.price} Lucons${stockStr}\n` +
      `      ⚡ ${item.effect || entry.desc || "Effect active"}`
    );
  };

  const sections = [];
  for (const g of Object.values(groups)) {
    if (!g.items.length) continue;
    sections.push(`${g.label}\n${g.items.map(formatItem).join("\n\n")}`);
  }

  const perksText     = info.perks.slice(0, 4).map(p => `  ✅ ${p}`).join("\n");
  const drawbacksText = info.drawbacks.slice(0, 3).map(d => `  ❌ ${d}`).join("\n");

  return (
    `${DIV}\n` +
    `${info.emoji}  *${info.name.toUpperCase()}*  ${info.emoji}\n` +
    `${DIV}\n\n` +
    `_"${info.belief}"_\n\n` +
    `${SDIV}\n` +
    `✅  *BENEFITS*\n` +
    `${SDIV}\n` +
    perksText +
    `\n\n${SDIV}\n` +
    `⚠️  *DRAWBACKS*\n` +
    `${SDIV}\n` +
    drawbacksText +
    `\n\n${DIV}\n` +
    `🛒  *MARKET CATALOG*\n` +
    `${DIV}\n\n` +
    (sections.length ? sections.join(`\n\n${SDIV}\n\n`) : "No items currently available.") +
    `\n\n${DIV}\n` +
    `📖 Buy: *.fbuy <item name or id>*\n` +
    `_Exclusive to ${titleCase(faction)} members._\n` +
    `${DIV}`
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — .faction market COMMAND
// ══════════════════════════════════════════════════════════════
async function cmdFactionMarket(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });

  return sock.sendMessage(chatId, { text: buildFactionMarketText(player) }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — .fbuy COMMAND (Faction Market Purchase)
// ══════════════════════════════════════════════════════════════
async function cmdFbuy(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];

  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first." }, { quoted: msg });

  if (!player.faction) {
    return sock.sendMessage(chatId, {
      text: "❌ You must join a faction first.\nUse *.faction harmony / purity / rift*",
    }, { quoted: msg });
  }

  const query = args.join(" ").trim();
  if (!query) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.fbuy <item name or id>*\n\nView your market: *.faction market*`,
    }, { quoted: msg });
  }

  const faction  = player.faction;
  const catalog  = FACTION_CATALOG[faction] || [];
  const itemsDb  = itemsSystem.loadItems();

  // Also check factionMarket.json
  const fmData   = itemsSystem.loadFactionMarket();
  const jsonItems = (fmData.factions?.[faction]?.items || []);

  // Build searchable list (json entries override catalog price)
  const allEntries = new Map();
  for (const e of catalog)   allEntries.set(e.itemId, { ...e, source: "catalog" });
  for (const e of jsonItems) allEntries.set(e.itemId, { ...e, source: "json"    });

  // Find item by name or ID
  const q = query.toLowerCase();
  let matchEntry = null;
  let matchItem  = null;

  for (const [itemId, entry] of allEntries.entries()) {
    const item = itemsDb[itemId];
    if (!item) continue;
    if (
      item.id.toLowerCase() === q ||
      item.name.toLowerCase() === q ||
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    ) {
      matchEntry = entry;
      matchItem  = item;
      break;
    }
  }

  if (!matchItem || !matchEntry) {
    return sock.sendMessage(chatId, {
      text:
        `❌ *${query}* is not available in the ${titleCase(faction)} market.\n\n` +
        `Use *.faction market* to see what's available.`,
    }, { quoted: msg });
  }

  // Stock check (only for json-tracked items)
  if (matchEntry.source === "json") {
    const stock = Number(matchEntry.stock ?? 99);
    if (stock <= 0) {
      return sock.sendMessage(chatId, { text: `❌ *${matchItem.name}* is sold out.` }, { quoted: msg });
    }
  }

  // Price check
  const price = Number(matchEntry.price || matchItem.price || 0);
  const money  = Number(player.lucons || 0);
  if (money < price) {
    return sock.sendMessage(chatId, {
      text:
        `❌ Not enough Lucons!\n` +
        `*${matchItem.name}* costs *${price} Lucons*.\n` +
        `Your balance: *${money} Lucons*.`,
    }, { quoted: msg });
  }

  // Storage check
  const canAdd = itemsSystem.canAddItemToInventory(player, matchItem.id, 1);
  if (!canAdd.ok) {
    return sock.sendMessage(chatId, { text: `❌ ${canAdd.reason}` }, { quoted: msg });
  }

  // Add item
  const added = itemsSystem.addItem(player, matchItem.id, 1);
  if (!added.ok) {
    return sock.sendMessage(chatId, { text: `❌ ${added.reason}` }, { quoted: msg });
  }

  player.lucons = Math.max(0, money - price);

  // Deduct stock from json entries if applicable
  if (matchEntry.source === "json" && typeof matchEntry.stock === "number") {
    matchEntry.stock = Math.max(0, matchEntry.stock - 1);
    // Update the factionMarket.json
    for (const e of (fmData.factions?.[faction]?.items || [])) {
      if (e.itemId === matchItem.id) {
        e.stock = matchEntry.stock;
        break;
      }
    }
    itemsSystem.saveFactionMarket(fmData);
  }

  savePlayers(players);

  const icon   = itemsSystem.getRarityIcon(matchItem.rarity);
  const info   = FACTION_BENEFITS[faction];

  // Show usage hint based on item type
  let usageHint = "";
  if (matchItem.category === "consumable") usageHint = `\n💡 Use: *.consume ${matchItem.name}*`;
  if (matchItem.category === "scroll")     usageHint = `\n💡 Use: *.consume ${matchItem.name}* (in battle or hunt)`;
  if (matchItem.category === "gear")       usageHint = `\n💡 Equip: *.equip ${matchItem.id}*`;

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `${info.emoji}  *FACTION PURCHASE*\n` +
      `${DIV}\n\n` +
      `${icon} *${matchItem.name}*\n` +
      `💰 Paid: *${price} Lucons*\n` +
      `⚡ ${matchItem.effect || "Effect active"}\n` +
      `📜 ${matchItem.desc || ""}` +
      usageHint +
      `\n\n💳 Lucons remaining: *${player.lucons}*\n` +
      `${DIV}`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — PASSIVE BONUS FUNCTIONS
// Called from battle.js, spawn.js, economy.js etc.
// ══════════════════════════════════════════════════════════════

// ── RIFT: Chaos Aura double (15% chance) ─────────────────────
function rollRiftChaosBonus(player, baseAuraGain) {
  if (player.faction !== "rift") return { bonus: 0, triggered: false };
  if (Math.random() > 0.15) return { bonus: 0, triggered: false };
  return { bonus: baseAuraGain, triggered: true }; // doubles the gain
}

// ── RIFT: Corrupted Mora deal +20% damage ────────────────────
function getRiftCorruptedDamageBoost(player, mora) {
  if (player.faction !== "rift") return 1.0;
  if (!mora || !mora.corrupted) return 1.0;
  return 1.20;
}

// ── RIFT: In-battle corruption burn (8 HP/turn) ──────────────
// Called at the start of each battle turn for Rift players.
// If their active Mora is corrupted, they take 8 HP damage themselves.
// High risk — you win harder but bleed doing it.
function getRiftInBattleBurn(player, activeMora) {
  if (player.faction !== "rift") return 0;
  if (!activeMora || !activeMora.corrupted) return 0;
  const burn = 8;
  player.playerHp = Math.max(1, (player.playerHp || 100) - burn);
  return burn;
}

// ── RIFT: Unstable catch — 10% fail on non-Shadow Mora ───────
// Returns true if the catch attempt should fail due to Rift instability
function rollRiftUnstableCatch(player, moraType) {
  if (player.faction !== "rift") return false;
  if (String(moraType || "").toLowerCase() === "shadow") return false; // Shadow exempt
  return Math.random() < 0.10;
}

// ── RIFT: -20% daily Lucon reduction ─────────────────────────
function applyRiftDailyReduction(player, baseReward) {
  if (player.faction !== "rift") return baseReward;
  return Math.floor(baseReward * 0.80);
}

// ── PURITY: +10% PvP damage ──────────────────────────────────
function getPurityCombatBonus(player) {
  if (player.faction !== "purity") return 1.0;
  return 1.10;
}

// ── PURITY: +15% Aura gain on PvP win ────────────────────────
function getPurityAuraWinBonus(player, baseAura) {
  if (player.faction !== "purity") return baseAura;
  return Math.floor(baseAura * 1.15);
}

// ── PURITY: Discipline Tax check ─────────────────────────────
// Disabled — no aura penalties for inactivity
function checkPurityDisciplineTax(player) {
  return null;
}

// ── HARMONY: -8% PvP damage (beliefs limit aggression) ───────
function getHarmonyPvpPenalty(player) {
  if (player.faction !== "harmony") return 1.0;
  return 0.92;
}

// ── HARMONY: +5% catch bonus ─────────────────────────────────
function getHarmonyCatchBonus(player) {
  if (player.faction !== "harmony") return 0;
  return 5;
}

// ── HARMONY: Healer's Tax — +50 Lucon cost on daily ─────────
function checkHarmonyHealersTax(player, baseReward) {
  if (player.faction !== "harmony") return { reward: baseReward, taxed: false };
  const tax = 50;
  const net = Math.max(0, baseReward - tax);
  return {
    reward: net,
    taxed:  true,
    tax,
    message:
      `🌿 *HARMONY HEALER'S TAX*\n` +
      `50 Lucons donated to the community healing fund.\n` +
      `Net daily reward: *${net} Lucons*`,
  };
}

// ── HARMONY: +20% healing item effectiveness ─────────────────
function getHarmonyHealBoost(player, baseHeal) {
  if (player.faction !== "harmony") return baseHeal;
  return Math.floor(baseHeal * 1.20);
}

// ── PURITY: No energy burnout ────────────────────────────────
// Called in cmdHunt burnout check — Purity players skip the drop
function skipBurnoutForPurity(player) {
  return player.faction === "purity";
}

// ── PE OVERFLOW check (Rift — exported separately for hunt/battle) ──
// Can be called directly from hunt.js or battle.js
function checkPeOverflowForPlayer(player) {
  return checkPeOverflow(player);
}

// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════
module.exports = {
  // Commands
  cmdFactionMarket,    // .faction market
  cmdFbuy,             // .fbuy <item>

  // Main consequence check (call once per command in index.js)
  checkFactionConsequences,
  checkCorruptionBacklash, // legacy alias

  // Individual checks
  checkPeOverflow,
  checkPeOverflowForPlayer,
  enforcePurityQuarantine,
  getCorruptedMora,
  hasCleanseTool,

  // Passive bonuses — call from battle.js / hunt.js / economy.js
  rollRiftChaosBonus,
  getRiftCorruptedDamageBoost,
  getRiftInBattleBurn,
  rollRiftUnstableCatch,
  applyRiftDailyReduction,
  getPurityCombatBonus,
  getPurityAuraWinBonus,
  checkPurityDisciplineTax,
  getHarmonyPvpPenalty,
  getHarmonyCatchBonus,
  checkHarmonyHealersTax,
  getHarmonyHealBoost,
  skipBurnoutForPurity,

  // Data references
  FACTION_BENEFITS,
  FACTION_CATALOG,
};
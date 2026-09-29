// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI · .profile — YOUR CARD PROFILE                         ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Level, rank, faction, vitals and progression, drawn in the       ║
// ║  chat bubble. Shells point at the stat/loadout/ladder commands.   ║
// ║                                                                   ║
// ║  DECLINES (returns false → the old text .profile runs) when:      ║
// ║    • the player picked text mode (.switch ui)                     ║
// ║    • the player is not registered                                 ║
// ║    • it is NOT a plain self-view: args, a mention or a reply all  ║
// ║      mean "someone else's profile" — the text path owns those     ║
// ║      (mentions, masking, target lookups).                         ║
// ╚═══════════════════════════════════════════════════════════════════╝

import lumoraUI from "../../systems/lumoraUI.js";
import statsSystem from "../../systems/stats.js";
import { isTextMode } from "./switch.mjs";

const {
  sendLumoraUI,
  buildLumoraPage,
  pillRow,
  bar,
  section,
  statusRow,
  commandBox,
  toastLine,
  hint,
} = lumoraUI;

// Display-only mirror of the faction table in index.js (emoji + name).
// The card never decides anything from this — the text profile is the
// authority for faction details.
const FACTION_DISPLAY = {
  harmony: { icon: "\u{1F33F}", name: "Harmony Lumorians" },
  purity: { icon: "⚔", name: "The Purity Order" },
  rift: { icon: "\u{1F576}", name: "The Rift Seekers" },
};

/** Is this a plain "show me MY profile" request? Anything else → text. */
export function isTargetedProfile(args, msg) {
  if (args && args.length) return true;
  const em = msg && msg.message && msg.message.extendedTextMessage &&
    msg.message.extendedTextMessage.contextInfo;
  if (!em) return false;
  return !!((em.mentionedJid && em.mentionedJid.length) || em.quotedMessage || em.participant);
}

/** Gather everything the card shows. Pure — testable with a fixture player. */
export function collectProfileView(player) {
  const p = player || {};
  const key = String(p.faction || "").toLowerCase();
  const faction = p.faction
    ? (FACTION_DISPLAY[key] || {
        icon: "\u{1F6E1}",
        name: key.charAt(0).toUpperCase() + key.slice(1),
      })
    : null;

  const mora = Array.isArray(p.moraOwned) ? p.moraOwned : [];
  const companion = p.companionId != null
    ? mora.find((x) => x && x.moraId === p.companionId)
    : null;

  let rank = "Unranked";
  try { rank = statsSystem.getRankForLevel(p.level || 1) || "Unranked"; } catch (e) { /* keep */ }

  const maxHp = Number(p.playerMaxHp || 100);
  const maxEn = Number(p.maxHuntEnergy || 100);
  const aura = Number(p.aura || 0);

  return {
    name: p.username || "Unnamed Lumorian",
    level: p.level == null ? "—" : p.level,
    rank,
    lucons: p.lucons == null ? "—" : p.lucons,
    faction,
    gender: p.gender || "",
    streak: Number(p.loginStreak || 0),
    achievements: Array.isArray(p.achievements) ? p.achievements.length : 0,
    moraCount: mora.length,
    companion: companion
      ? { name: companion.name || "Mora", bond: Number(p.companionBond || 0) }
      : null,
    aura,
    hp: { value: Number(p.playerHp || 0), max: maxHp },
    energy: { value: Number(p.huntEnergy || 0), max: maxEn },
  };
}

/** The page markup — pure function so the check script can assert on it. */
export function buildProfilePage(view) {
  const v = view || {};
  const hp = v.hp || { value: 0, max: 100 };
  const energy = v.energy || { value: 0, max: 100 };
  const aura = Number(v.aura || 0);

  const rows = [
    section("About"),
    statusRow("Name", "pf-name", v.name),
    statusRow("Faction", "pf-fac", v.faction ? (v.faction.icon + " " + v.faction.name) : "None"),
    statusRow("Gender", "pf-gender", v.gender || "—"),
    statusRow("Achievements", "pf-ach", v.achievements),
    statusRow("Mora owned", "pf-mora", v.moraCount),
  ];
  if (v.streak > 1) rows.push(statusRow("Login streak", "pf-streak", v.streak + " days"));
  if (v.companion) rows.push(statusRow("Companion", "pf-comp", v.companion.name + " · bond " + v.companion.bond));

  const body = [
    pillRow([
      { icon: "⭐", label: "Level", value: v.level == null ? "—" : v.level },
      { icon: "🎖", label: "Rank", value: v.rank || "Unranked" },
      { icon: "🪙", label: "Lucons", value: v.lucons == null ? "—" : v.lucons },
    ]),
    bar({ label: "Aura", value: aura, max: Math.max(100, aura), tone: "aura" }),
    bar({ label: "HP", value: hp.value, max: hp.max, tone: "hp" }),
    bar({ label: "Energy", value: energy.value, max: energy.max, tone: "xp" }),
    rows.join(""),
    section("More"),
    commandBox(".stats", "Stat distribution & invest points"),
    commandBox(".gear", "Equipped loadout"),
    commandBox(".ranks", "The full rank ladder"),
    commandBox(".switch ui", "Switch back to the plain text view"),
    toastLine("This is the card profile — everything it shows is live from your player record."),
    hint("Lumora UI · profile card"),
  ].join("");

  return buildLumoraPage({
    title: "PROFILE",
    subtitle: String(v.name || "Lumorian"),
    brand: "LUMORA UI",
    bodyHtml: body,
    player: { username: v.name, level: v.level, lucons: v.lucons },
  });
}

export default {
  name: "profile",
  command: ["profile"],
  category: ["game"],
  description: "👤 Your stats, rank & progression as an interactive card",
  textCommand: "profile",

  async run({ feb, sock, m, args, msg, react, player }) {
    if (!player) return false;
    if (isTextMode(player)) return false;
    if (isTargetedProfile(args, msg)) return false;   // someone else / mentions / reply → text

    const socket = feb || sock;
    const doReact = typeof react === "function" ? react : async () => {};
    try {
      await doReact("\u{1F464}");

      const view = collectProfileView(player);
      await sendLumoraUI(socket, m.chat, buildProfilePage(view));
      await doReact("✅");
    } catch (error) {
      console.error("[profile] Error:", error && error.message);
      await doReact("❌");
      if (m && typeof m.reply === "function") {
        await m.reply("❌ Profile card failed: " + ((error && error.message) || error));
      }
    }
    return true;
  },
};

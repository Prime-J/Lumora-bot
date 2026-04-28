// ════════════════════════════════════════════════════════════
// │           LUMORA ARENA SYSTEM  v2.0 – "The Fractured Trials"   │
// ════════════════════════════════════════════════════════════
//
// LORE GROUNDING:
//   The Arena exists in the Capital of Lumora – a place where
//   Lumorians test their bonds before venturing into Baby Rifts.
//   NPC fighters represent veterans of each faction: Harmony
//   Lumorians who purify Rifts, Purity Order warriors who seal
//   them, and Rift Seekers who harness forbidden power.
//   Defeating them earns respect, Aura, and hidden knowledge.

"use strict";

const fs   = require("fs");
const path = require("path");

// ── PATHS ────────────────────────────────────────────────────
const ARENA_STATE_FILE = path.join(__dirname, "../data/arena_state.json");
const NPC_ASSETS_DIR   = path.join(__dirname, "../assets/npc");

// 0.1.3 — arena now uses the player's PARTY only, not their full tamed list.
// Resolves party slot indices into actual mora references so HP mutations
// during battle still write back to the original moraOwned entry.
function getArenaParty(player) {
  const owned = Array.isArray(player?.moraOwned) ? player.moraOwned : [];
  const slots = Array.isArray(player?.party) ? player.party : [];
  const out = [];
  for (const idx of slots) {
    if (idx === null || idx === undefined) continue;
    if (Number.isInteger(idx) && idx >= 0 && idx < owned.length && owned[idx]) {
      out.push(owned[idx]);
    }
  }
  return out;
}

// 0.1.3 — global reward dampener so XP/Aura grind isn't trivial.
const REWARD_NERF = 0.70;

// ════════════════════════════════════════════════════════════
// SECTION 1 – TIER DEFINITIONS
// ════════════════════════════════════════════════════════════
const TIERS = {
  novice: {
    key:          "novice",
    label:        "🟢 NOVICE",
    badge:        "NOVICE",
    desc:         "Lumorians fresh from their first Rift encounter.",
    lore:         "These fighters trained in the Capital's outer yards, catching stray Mora that wandered through Baby Rift leaks.",
    levelRange:   [2, 9],
    partySize:    1,
    auraReward:   12,
    xpMult:       1.0,
    auraRequired: 50,
    auraGap:      60,
    fineOnLoss:   0,
  },
  warrior: {
    key:          "warrior",
    label:        "🔵 WARRIOR",
    badge:        "WARRIOR",
    desc:         "Seasoned fighters who have survived multiple Rift encounters.",
    lore:         "Each Warrior-tier fighter has closed at least one Baby Rift. Their Mora carry scars of real Rift energy.",
    levelRange:   [12, 24],
    partySize:    2,
    auraReward:   28,
    xpMult:       1.6,
    auraRequired: 90,
    auraGap:      80,
    fineOnLoss:   6,
  },
  elite: {
    key:          "elite",
    label:        "🟠 ELITE",
    badge:        "ELITE",
    desc:         "Champions who operate at the edge of the Primordial Rift's influence.",
    lore:         "Elite fighters have bonded Mora that absorbed raw Primordial energy. Their power is unstable – and immense.",
    levelRange:   [28, 42],
    partySize:    2,
    auraReward:   45,
    xpMult:       2.2,
    auraRequired: 140,
    auraGap:      110,
    fineOnLoss:   15,
  },
  mythic: {
    key:          "mythic",
    label:        "🔴 MYTHIC",
    badge:        "MYTHIC",
    desc:         "Figures from Lumoran legend. Battling them is either heroic or suicidal.",
    lore:         "Mythic fighters are rumoured to have stood before the Primordial Rift itself. They carry its energy in their very soul.",
    levelRange:   [45, 70],
    partySize:    3,
    auraReward:   80,
    xpMult:       3.2,
    auraRequired: 230,
    auraGap:      160,
    fineOnLoss:   30,
  },
};

// ════════════════════════════════════════════════════════════
// SECTION 1.5 – PER-NPC DIFFICULTY LEVELS
// ════════════════════════════════════════════════════════════
// Each NPC can be challenged at one of these difficulty levels.
// Difficulty modifies stat scaling, level boost, and rewards.
//
// Format: weak / normal / strong / nightmare
//
// FUTURE: per-NPC unique difficulty (each NPC overrides their own
// scaling curve) — see FUTURE.md
const DIFFICULTY_LEVELS = {
  weak: {
    key:        "weak",
    label:      "🟢 WEAK",
    statMult:   0.80,
    hpMult:     0.85,
    levelBoost: -2,
    rewardMult: 0.70,
    desc:       "A warm-up. Lower stats, lower rewards.",
  },
  normal: {
    key:        "normal",
    label:      "🟡 NORMAL",
    statMult:   1.10,
    hpMult:     1.10,
    levelBoost: 0,
    rewardMult: 1.00,
    desc:       "Standard challenge. Tier-appropriate stats.",
  },
  strong: {
    key:        "strong",
    label:      "🟠 STRONG",
    statMult:   1.40,
    hpMult:     1.35,
    levelBoost: 3,
    rewardMult: 1.45,
    desc:       "Buffed stats and higher level. Real fight.",
  },
  nightmare: {
    key:        "nightmare",
    label:      "🔴 NIGHTMARE",
    statMult:   1.80,
    hpMult:     1.70,
    levelBoost: 6,
    rewardMult: 2.00,
    desc:       "Max-tier scaling. Bring your best Mora.",
  },
};
const DIFFICULTY_ALIASES = {
  weak: "weak", easy: "weak", w: "weak",
  normal: "normal", medium: "normal", n: "normal", mid: "normal",
  strong: "strong", hard: "strong", s: "strong",
  nightmare: "nightmare", insane: "nightmare", nm: "nightmare", extreme: "nightmare",
};

// ════════════════════════════════════════════════════════════
// SECTION 2 – NPC ROSTER (FACTION-SEPARATED)
// ════════════════════════════════════════════════════════════
const NPC_ROSTER = {
  harmony: {
    novice:  ["Mira"],
    warrior: ["Lyra"],
    elite:   ["Veil Crest"],
    mythic:  ["The Eternal Mora Sage"],
  },
  purity: {
    novice:  ["Tolo"],
    warrior: ["Sereth"],
    elite:   ["Commander Drax"],
    mythic:  ["Iron Sovereign Kael"],
  },
  rift: {
    novice:  ["Kade"],
    warrior: ["Vaan"],
    elite:   ["Shadow Wren"],
    mythic:  ["Rift Sovereign Kairo"],
  },
  none: {
    novice:  ["Mira", "Tolo", "Kade"],
    warrior: ["Lyra", "Sereth", "Vaan"],
    elite:   ["Veil Crest", "Commander Drax", "Shadow Wren"],
    mythic:  ["The Eternal Mora Sage", "Iron Sovereign Kael", "Rift Sovereign Kairo"],
  },
};

// ════════════════════════════════════════════════════════════
// SECTION 3 – NPC CHARACTER DATA
// ════════════════════════════════════════════════════════════
const NPC_CHARACTERS = {

  // ── HARMONY LUMORIANS ──────────────────────────────────────
  Mira: {
    tier: "novice", faction: "harmony",
    title: "The Wandering Tamer",
    bio: "Found her first Mora alone in a forest clearing three days after the Fracture's echo reached her village. She never went home.",
    emoji: "🌸",
    openingLine: "Easy now... my Mora and I don't like rushed energy. Breathe. Then lose gracefully.",
  },
  Lyra: {
    tier: "warrior", faction: "harmony",
    title: "Resonance Hunter",
    bio: "A former Harmony scholar who discovered that a Lumorian's emotional state directly affects Mora bond strength. She became a fighter to prove her theory in the field.",
    emoji: "🔮",
    openingLine: "I've already mapped three openings in your stance. This is educational for both of us.",
  },
  "Veil Crest": {
    tier: "elite", faction: "harmony",
    title: "Harmony's Blade",
    bio: "The youngest fighter ever to receive the Harmony Council's seal of combat mastery. She speaks rarely. When she does, it's usually to end a fight.",
    emoji: "🌸",
    openingLine: "The Rift tests every Lumorian differently. Today it tests you through me.",
  },
  "The Eternal Mora Sage": {
    tier: "mythic", faction: "harmony",
    title: "Keeper of Ancient Bonds",
    bio: "She was there before the factions formed. Before the first Purity Order member drew a blade. She bonded with Mora when the creatures were still finding their shapes.",
    emoji: "✨",
    openingLine: "I have watched a thousand Lumorians stand where you stand. Each one changed me. Let us see what you bring.",
  },

  // ── THE PURITY ORDER ────────────────────────────────────────
  Tolo: {
    tier: "novice", faction: "purity",
    title: "Market District Brawler",
    bio: "When a Baby Rift opened near his market stall and corrupted three of his neighbours' Mora, Tolo joined the Purity Order the same afternoon. He's been fighting since.",
    emoji: "🛡",
    openingLine: "I'm not here for glory. I'm here because the Rift needs to be stopped. You're practice.",
  },
  Sereth: {
    tier: "warrior", faction: "purity",
    title: "Order Vanguard",
    bio: "Sereth has sealed eleven Baby Rifts across the eastern territories. He doesn't believe Mora are evil – just that the energy creating them is. He fights to protect humans, not hate Mora.",
    emoji: "⚔️",
    openingLine: "I respect the bond you carry. But discipline beats passion every single time. Prove me wrong.",
  },
  "Commander Drax": {
    tier: "elite", faction: "purity",
    title: "Order Commander, Eastern Front",
    bio: "Drax lost his bonded Mora to Rift corruption seven years ago. He never bonded again. He uses his partner's memory as fuel for every fight.",
    emoji: "🗡",
    openingLine: "I don't enjoy this. But the Order needs to know its fighters are ready. Show me something real.",
  },
  "Iron Sovereign Kael": {
    tier: "mythic", faction: "purity",
    title: "The Wall That Has Never Fallen",
    bio: "Kael stood at the edge of the Primordial Rift for six days during the Great Rift Surge and held the line alone. No one knows how. He doesn't speak about it.",
    emoji: "🏰",
    openingLine: "The Rift has thrown worse things at me than you. Come.",
  },

  // ── THE RIFT SEEKERS ────────────────────────────────────────
  Kade: {
    tier: "novice", faction: "rift",
    title: "The Accidental Rift Seeker",
    bio: "Kade didn't choose the Rift Seekers. A Baby Rift opened beneath his feet on the way to the Capital and a wild Mora bonded to him on instinct. The Seekers found him two days later and made him one of their own.",
    emoji: "😱",
    openingLine: "Ha – okay look, I still don't fully know what I'm doing. But my Mora does. Watch.",
  },
  Vaan: {
    tier: "warrior", faction: "rift",
    title: "The Memory Walker",
    bio: "Vaan emerged from a Baby Rift with no memory of who he was. The Rift Seekers took him in. He fights to feel something familiar – like the answers are hidden somewhere in the battle itself.",
    emoji: "🌶",
    openingLine: "I don't remember much. But I remember how to fight. That much never left.",
  },
  "Shadow Wren": {
    tier: "elite", faction: "rift",
    title: "Rift Infiltrator",
    bio: "She appeared out of a Rift tear three seasons ago without explanation. The Rift Seekers gave her shelter. She repaid them by becoming their most feared operative. She has not lost since arriving.",
    emoji: "🌑",
    openingLine: "The Rift sent me here. I'm not sure if it sent me to fight you or to find something in you. Let's find out.",
  },
  "Rift Sovereign Kairo": {
    tier: "mythic", faction: "rift",
    title: "Sovereign of the Primordial Fracture",
    bio: "Kairo descended into the Primordial Rift three years ago and came back changed. He speaks of what he saw but no one fully understands what he describes. He is searching for a specific Lumorian. He will know them when their Aura touches his.",
    emoji: "🌀",
    openingLine: "The Rift showed me your energy before you walked in. Interesting. Let us see if reality matches the vision.",
  },
};

// ════════════════════════════════════════════════════════════
// SECTION 4 – NPC IMAGE FILE KEYS
// ════════════════════════════════════════════════════════════
const NPC_IMAGE_KEYS = {
  "Mira":                    "mira",
  "Lyra":                    "lyra",
  "Veil Crest":              "veilcrest",
  "The Eternal Mora Sage":   "sage",
  "Tolo":                    "tolo",
  "Sereth":                  "sereth",
  "Commander Drax":          "drax",
  "Iron Sovereign Kael":     "kael",
  "Kade":                    "kade",
  "Vaan":                    "vaan",
  "Shadow Wren":             "wren",
  "Rift Sovereign Kairo":    "kairo",
};

// ════════════════════════════════════════════════════════════
// SECTION 5 – EXTENDED LORE (unlocked via .intel after defeating)
// ════════════════════════════════════════════════════════════
const NPC_LORE = {
  Mira: {
    age: "22", origin: "Forest Road Villages, Eastern Lumora",
    record: "21 fights – 9 wins",
    style: "Patient, reactive. She waits for you to commit before countering.",
    secret: "Her first Mora died in a Baby Rift surge. Every creature she bonds with now carries that Mora's name in her records.",
    weakness: "Struggles against fighters who never commit to an attack. Her counter-style needs a target.",
    strength: "Exceptional Rift-sense. She feels Mora energy shifts before they happen.",
    quote: "\"Every Mora deserves to be understood before it is used as a weapon.\"",
    riftView: "The Rift brought Mora into the world. Our job is to protect both from each other.",
  },
  Lyra: {
    age: "24", origin: "Harmony Research Station, Central Lumora",
    record: "67 fights – 44 wins",
    style: "Analytical. Maps your pattern in round 1. Exploits it in round 2.",
    secret: "She keeps a battle journal with notes on every opponent. Your page is being written right now.",
    weakness: "Genuinely creative fighters break her predictive model entirely. She panics briefly.",
    strength: "By round 3, she is playing the perfect counter to your specific playstyle.",
    quote: "\"I already know how this ends. I want to see your reaction when you realise it too.\"",
    riftView: "The Rift's energy is not evil. It is misunderstood. Like all things powerful and new.",
  },
  "Veil Crest": {
    age: "26", origin: "Harmony Council Citadel",
    record: "143 fights – 128 wins",
    style: "Pressure and precision. She closes distance fast and ends fights before you adjust.",
    secret: "She failed her Council trial twice before passing. She has never told anyone.",
    weakness: "Long-range battles frustrate her. Her style requires being close.",
    strength: "Perfect movement. She has never been hit by a status move in competition.",
    quote: "\"The Rift fractures. I do not.\"",
    riftView: "The Baby Rifts are wounds. We are the medicine. Mora are not the disease.",
  },
  "The Eternal Mora Sage": {
    age: "Ancient – records do not agree",
    origin: "The First Bonding Grounds (location erased from all maps)",
    record: "1,000 recorded fights. She stopped counting.",
    style: "Absolute bond mastery. Her Mora moves feel like extensions of her own thoughts with zero delay.",
    secret: "She has lost before. Once. She spent two centuries understanding what she learned from it.",
    weakness: "Her Mora are extensions of her emotion. Causing them pain visibly shakes her focus.",
    strength: "Perfect energy control. No Mora in her party has ever wasted a single point of energy.",
    quote: "\"Victory and defeat wear different masks but teach the same lesson.\"",
    riftView: "The Primordial Rift is not our enemy. It is the world's way of growing. We must grow with it.",
  },
  Tolo: {
    age: "27", origin: "Capital Market District",
    record: "38 fights – 17 wins",
    style: "Defensive anchor. He absorbs damage and waits for openings others would not take.",
    secret: "Every Lucon he earns from the arena goes back to rebuilding the market stalls destroyed by the Rift surge.",
    weakness: "Slow to switch Mora. His loyalty to his current fighter costs him.",
    strength: "Abnormal pain tolerance. He keeps his Mora in situations where others would retreat.",
    quote: "\"Pain is overhead. I've dealt with worse balance sheets.\"",
    riftView: "The Rift destroyed my livelihood. Seal it. I don't care about philosophy.",
  },
  Sereth: {
    age: "31", origin: "Purity Order Eastern Barracks",
    record: "112 fights – 71 wins",
    style: "Military doctrine. Every action planned three turns ahead.",
    secret: "He once refused a direct order from a Commander. He still carries the disciplinary mark. It drives him harder than anything.",
    weakness: "Plans break when opponents do something genuinely irrational. He freezes briefly.",
    strength: "Near-encyclopaedic knowledge of type matchups. He is almost never caught by a super-effective hit.",
    quote: "\"Discipline is not a cage. It is the weapon.\"",
    riftView: "The Rift is a wound. A wound does not care about your feelings. You seal it.",
  },
  "Commander Drax": {
    age: "44", origin: "Purity Order High Command",
    record: "340 fights – 289 wins",
    style: "Overwhelming force. Highest-power moves, no hesitation, no mercy.",
    secret: "His bonded Mora was consumed by Rift corruption during the Third Surge. He never replaced it. He fights with other Mora out of duty, not love.",
    weakness: "Opponents he deems 'beneath him' occasionally surprise him. He has learned this lesson slowly.",
    strength: "Raw conditioning. His Mora are the most physically developed fighters in the Order.",
    quote: "\"The Purity Order does not recognise second place.\"",
    riftView: "The Rift took the only Mora I ever loved. Every Baby Rift I seal is personal.",
  },
  "Iron Sovereign Kael": {
    age: "Unknown",
    origin: "The Primordial Rift's Edge – where he stood alone for six days",
    record: "Undefeated in 200+ arena appearances. Records before that were destroyed.",
    style: "He does not attack until you have committed three mistakes. Then he ends it.",
    secret: "Kael claims he heard something in the Primordial Rift during those six days. A voice. He has never said what it told him.",
    weakness: "None documented. His one presumed weakness is emotional investment – but no opponent has found it yet.",
    strength: "Patience beyond human comprehension. He has been known to let opponents tire themselves completely before acting.",
    quote: "\"The Rift has thrown worse things at me than you.\"",
    riftView: "The Rift must be sealed. Not because of fear. Because I have heard what waits beyond it.",
  },
  Kade: {
    age: "19", origin: "Capital Outskirts – fell into a Baby Rift accidentally",
    record: "14 fights – 5 wins",
    style: "Charge first, adapt second. Reckless by design.",
    secret: "The Mora that bonded to him in the Baby Rift was not supposed to bond with anyone. The Rift Seekers have no explanation for why it chose him.",
    weakness: "No plan beyond the first attack. Experienced fighters read him in seconds.",
    strength: "His Mora seem to respond to danger with amplified energy. The more dangerous the fight, the stronger they get.",
    quote: "\"Okay I don't fully know what I'm doing. But it's been working so far.\"",
    riftView: "The Rift opened up and handed me a Mora. That's not a disaster. That's a gift.",
  },
  Vaan: {
    age: "Unknown – no memory before the Rift",
    origin: "Emerged from a Baby Rift six months ago. No records exist before that.",
    record: "88 fights – 55 wins",
    style: "Pure unpredictability. No consistent pattern. Even his Mora seem surprised sometimes.",
    secret: "He has flashes of memory during intense battles. He fights partly to trigger them and find out who he was.",
    weakness: "Uncontrolled energy surges occasionally misfire onto his own Mora.",
    strength: "No opponent can build a model of his behaviour. He breaks every pattern-recognition system.",
    quote: "\"Strategy? I just do whatever feels true in the moment. It mostly works.\"",
    riftView: "The Rift made me. I owe it nothing and everything simultaneously.",
  },
  "Shadow Wren": {
    age: "Unknown",
    origin: "Stepped out of a Rift tear – no records of her existence before that moment",
    record: "201 fights – 187 wins",
    style: "Shadow pressure. She attacks from angles that should not exist geometrically.",
    secret: "She has not slept since emerging from the Rift. She does not know why. She does not seem bothered.",
    weakness: "High-accuracy moves partially bypass her techniques. Precision over power.",
    strength: "No one has ever landed a status move on her. Whether this is immunity or perfect read-speed is unknown.",
    quote: "\"I don't win battles. I erase them.\"",
    riftView: "The Rift is the only home I remember. I protect what feeds me.",
  },
  "Rift Sovereign Kairo": {
    age: "Classified by the Rift Seeker council",
    origin: "Descended into the Primordial Rift three years ago. Came back changed.",
    record: "Unrecorded. The Rift Seekers sealed his file.",
    style: "Primordial resonance. His Mora carry direct Rift energy. Type rules begin to break down at high intensity.",
    secret: "He entered the Primordial Rift deliberately to find one specific thing. He says he found it. He entered the arena to find the person it belongs to.",
    weakness: "A brief window when channelling maximum Rift energy leaves him exposed. One turn. Most opponents never see it coming.",
    strength: "At full Rift saturation his Mora transcend normal type interactions. They become something else entirely.",
    quote: "\"The Rift showed me your energy before you walked in. You are exactly who I have been waiting for.\"",
    riftView: "The Primordial Rift is not a wound. It is a door. I have seen what is on the other side.",
  },
};

// ════════════════════════════════════════════════════════════
// SECTION 6 – DIALOGUE POOLS
// ════════════════════════════════════════════════════════════
const DIALOGUE = {
  opening: [
    "The Primordial Rift forged this arena. Only real power echoes here.",
    "Your Mora's energy... it's unsteady. Let's see if your resolve holds.",
    "Every Lumorian who enters this arena is tested. Not just in strength.",
    "The Rift watches every battle here. Don't disappoint it.",
    "I've broken stronger bonds than yours. Prove me wrong.",
    "Focus. The arena doesn't reward hesitation.",
    "Your Mora chose you. Now show me why they were right.",
  ],
  bigHit: [
    "THAT is Primordial energy at work! Feel it!",
    "My Mora trained in Rift energy itself. You feel the difference!",
    "Did that rattle you? Good. That's just the beginning.",
    "Power without hesitation. That's what the Rift teaches.",
    "The arena echoes with that strike. Beautiful.",
    "Your Mora held. I'm impressed. Don't get comfortable.",
  ],
  miss: [
    "Tch... you read the energy. Lucky – or skilled. We'll find out.",
    "That was supposed to end things... don't celebrate yet.",
    "A miss. My Mora won't miscalculate twice.",
    "*narrows eyes* You're reading the Rift-flow. Interesting.",
    "Fine. My next move carries more of the Primordial's weight.",
  ],
  moraFainted: [
    "Not yet – the Primordial gives me more to work with!",
    "You broke that bond. But I have more. And they're angrier.",
    "Down... but the Rift energy in me has not run dry.",
    "Impressive. That Mora carried years of Rift training. You earned that.",
    "One fragment falls. The rest of the Fracture remains standing.",
  ],
  nearDefeat: [
    "Haha – wow. You almost got me there. ALMOST.",
    "My heart is racing. The Rift hasn't let me feel this in years.",
    "*breathes heavily* ...Don't count your Lucons yet.",
    "You're actually good. The arena hasn't seen a fight like this recently.",
    "I'm not going to lie – that was dangerously close.",
    "The Rift is watching this. So am I. Keep going.",
  ],
  taunt: [
    "Is that the full power of your bond? Or are you holding back?",
    "Hesitation is how Lumorians die near Baby Rifts. Stop it.",
    "My Mora is warming up. You haven't seen real Rift energy yet.",
    "You fight like someone who fears the Rift. Channel it instead.",
    "You're good... but are you Lumora-level great?",
  ],
  npcWins: [
    "The Rift chose you – but the Rift also chose your limits. Find them and push past them.",
    "You had fire in your eyes. Channel it better. Come back.",
    "Defeat is a lesson. The arena writes it in pain so you don't forget.",
    "Every Lumorian who became great lost exactly like this first. Remember that.",
    "Close. Genuinely close. The arena only honours results – but you're building toward one.",
  ],
  playerWins: [
    "...You won. The Rift acknowledges it. And so do I.",
    "Remarkable. I've fought in this arena for years. Today you humbled me.",
    "That is a Lumorian worthy of standing at the edge of the Primordial Rift.",
    "My Mora gave everything. Today, that wasn't enough. You've earned this.",
    "I yield. The arena – and the Rift – recognises your strength.",
  ],
  sameFactionWin: {
    harmony: "A Harmony Lumorian defeating another... the Rift-crystal records this. Your bond grows stronger from the internal test.",
    purity:  "The Order's trials are meant to forge the best. You just proved the forge works. Well done, soldier.",
    rift:    "Rift Seekers sharpen each other. You've just added your name to the Fracture's memory. It won't forget you.",
  },
};

// ════════════════════════════════════════════════════════════
// SECTION 7 – DEFAULT CONFIG
// ════════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  dailyLimit:        4,
  arenaEnabled:      true,
  baseAuraRequired:  50,
  crossFactionBonus: 0.25,
  diminishFloor:     0.20,
};

// ════════════════════════════════════════════════════════════
// SECTION 8 – HELPERS
// ════════════════════════════════════════════════════════════
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ════════════════════════════════════════════════════════════
// SECTION 9 – STATE MANAGEMENT
// ════════════════════════════════════════════════════════════
function loadState() {
  try {
    if (!fs.existsSync(ARENA_STATE_FILE)) {
      const blank = {
        config:       { ...DEFAULT_CONFIG },
        battles:      {},
        dailyCounts:  {},
        defeatedNpcs: {},
      };
      fs.writeFileSync(ARENA_STATE_FILE, JSON.stringify(blank, null, 2));
      return blank;
    }
    return JSON.parse(fs.readFileSync(ARENA_STATE_FILE, "utf8"));
  } catch (e) {
    console.log("[Arena] loadState error:", e?.message);
    return { config: { ...DEFAULT_CONFIG }, battles: {}, dailyCounts: {}, defeatedNpcs: {} };
  }
}
function saveState(s) {
  try { fs.writeFileSync(ARENA_STATE_FILE, JSON.stringify(s, null, 2)); }
  catch (e) { console.log("[Arena] saveState error:", e?.message); }
}
function bKey(chatId, pid) { return `${chatId}||${pid}`; }
function getBattle(s, chatId, pid) { return s.battles[bKey(chatId, pid)] || null; }
function setBattle(s, chatId, pid, b) { s.battles[bKey(chatId, pid)] = b; }
function clearBattle(s, chatId, pid) { delete s.battles[bKey(chatId, pid)]; }

function getDailyCount(s, pid) {
  const e = s.dailyCounts[pid];
  if (!e || e.date !== todayKey()) return 0;
  return e.count || 0;
}
function incDaily(s, pid) {
  const today = todayKey();
  const e = s.dailyCounts[pid];
  if (!e || e.date !== today) s.dailyCounts[pid] = { date: today, count: 1 };
  else s.dailyCounts[pid].count += 1;
}

function getWinCount(s, pid, npcName) {
  return s.defeatedNpcs?.[pid]?.[npcName] || 0;
}
function recordWin(s, pid, npcName) {
  if (!s.defeatedNpcs) s.defeatedNpcs = {};
  if (!s.defeatedNpcs[pid]) s.defeatedNpcs[pid] = {};
  s.defeatedNpcs[pid][npcName] = (s.defeatedNpcs[pid][npcName] || 0) + 1;
}
function hasDefeated(s, pid, npcName) {
  return (s.defeatedNpcs?.[pid]?.[npcName] || 0) > 0;
}
function getDefeatedList(s, pid) {
  const map = s.defeatedNpcs?.[pid] || {};
  return Object.keys(map);
}

// ════════════════════════════════════════════════════════════
// SECTION 10 – REWARD SCALING ENGINE
// ════════════════════════════════════════════════════════════
function calcRewardMultiplier(tier, playerAura, winCount, playerFaction, npcFaction, config) {
  let dimMult;
  if (winCount <= 3)       dimMult = 1.00;
  else if (winCount <= 6)  dimMult = 0.60;
  else if (winCount <= 10) dimMult = 0.40;
  else                     dimMult = 0.20;

  const gap = playerAura - (tier.auraRequired + tier.auraGap);
  let gapMult;
  if (gap <= 0) {
    gapMult = 1.00;
  } else {
    const steps = gap / 50;
    gapMult = Math.max(config.diminishFloor, Math.pow(0.85, steps));
  }

  const isCross = playerFaction && playerFaction !== "none" && playerFaction !== npcFaction;
  const crossMult = isCross ? (1 + (config.crossFactionBonus || 0.25)) : 1.0;

  const total = dimMult * gapMult * crossMult;
  return Math.max(config.diminishFloor, total);
}

// ════════════════════════════════════════════════════════════
// SECTION 11 – NPC MORA BUILDER
// ════════════════════════════════════════════════════════════
function buildNpcMora(moraList, levelRange, difficulty = null) {
  if (!moraList?.length) return null;
  const species = pick(moraList);
  if (!species) return null;

  const diff      = difficulty || DIFFICULTY_LEVELS.normal;
  const statMult  = Number(diff.statMult  || 1.0);
  const hpMult    = Number(diff.hpMult    || 1.0);
  const lvlBoost  = Number(diff.levelBoost || 0);

  const rawLvl = randInt(levelRange[0], levelRange[1]) + lvlBoost;
  const level  = clamp(rawLvl, 1, 999);

  const pool   = Object.keys(species.moves || {});
  const moves  = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(4, pool.length));

  // BUFFED baseline (was: base + level*2 / level*3)
  // New: stats scale steeper with level and use a base multiplier so even
  // lower-tier NPCs hit hard. Difficulty multiplies on top.
  const base   = species.baseStats || {};
  const stats  = {
    atk:    clamp(Math.floor((Number(base.atk || 12) * 1.30 + level * 3.2) * statMult), 1, 9999),
    def:    clamp(Math.floor((Number(base.def || 12) * 1.30 + level * 3.0) * statMult), 1, 9999),
    spd:    clamp(Math.floor((Number(base.spd || 10) * 1.20 + level * 1.6) * statMult), 1, 9999),
    energy: clamp(Math.floor((Number(base.energy || 30) + level * 1.5)),                10, 999),
  };
  const maxHp     = clamp(Math.floor((Number(base.hp || 55) * 1.25 + level * 5) * hpMult), 20, 99999);
  const maxEnergy = stats.energy;

  return {
    moraId: Number(species.id), name: String(species.name),
    type: String(species.type), rarity: String(species.rarity || "common"),
    level, xp: 0, hp: maxHp, maxHp, energy: maxEnergy, maxEnergy,
    pe: 0, corrupted: false, moves, stats, isNpc: true,
  };
}

// ════════════════════════════════════════════════════════════
// SECTION 12 – NPC AI MOVE PICKER
// ════════════════════════════════════════════════════════════
function npcPickAction(npcParty, activeIdx, moraList, opponent = null) {
  const active = npcParty[activeIdx];
  if (!active || active.hp <= 0) {
    const next = npcParty.findIndex((m, i) => i !== activeIdx && m?.hp > 0);
    return next >= 0 ? { kind: "switch", value: next } : null;
  }

  const sp      = moraList.find(m => Number(m.id) === Number(active.moraId));
  const moveDef = sp?.moves || {};
  const affordable = (active.moves || []).filter(n => {
    const mv   = moveDef[n];
    const cost = Math.max(6, 6 + Math.floor(Number(mv?.power || 0) / 10));
    return mv && active.energy >= cost;
  });

  // 0.1.3 — TACTICAL SWITCH: if opponent is set and current matchup is bad
  // (active is type-disadvantaged AND below 45% HP), look for a bench mora
  // with a clearly better matchup. Same trigger when energy is gone but a
  // bench mora is full-energy with strong moves.
  if (opponent && Number(opponent.hp || 0) > 0) {
    const curMatch = typeChart(String(active.type || ""), String(opponent.type || ""));
    const lowHp = (active.hp / Math.max(1, active.maxHp)) < 0.45;
    const energyStarved = !affordable.length;

    if ((curMatch < 1.0 && lowHp) || energyStarved) {
      let bestSwap = -1;
      let bestScore = curMatch + (lowHp ? 0.15 : 0); // need to clearly beat current
      for (let i = 0; i < npcParty.length; i++) {
        if (i === activeIdx) continue;
        const cand = npcParty[i];
        if (!cand || Number(cand.hp || 0) <= 0) continue;
        const candMatch = typeChart(String(cand.type || ""), String(opponent.type || ""));
        const candHpFrac = cand.hp / Math.max(1, cand.maxHp);
        // Score: type advantage + HP fraction (favor healthy, advantaged mora)
        const score = candMatch + candHpFrac * 0.25;
        if (score > bestScore + 0.10) { bestScore = score; bestSwap = i; }
      }
      if (bestSwap >= 0) return { kind: "switch", value: bestSwap };
    }
  }

  // Random small chance to switch even outside the bad-matchup case — keeps
  // NPCs from feeling robotic. Only if a clearly better bench option exists.
  if (opponent && Math.random() < 0.10) {
    const curMatch = typeChart(String(active.type || ""), String(opponent.type || ""));
    for (let i = 0; i < npcParty.length; i++) {
      if (i === activeIdx) continue;
      const cand = npcParty[i];
      if (!cand || Number(cand.hp || 0) <= 0) continue;
      const candMatch = typeChart(String(cand.type || ""), String(opponent.type || ""));
      if (candMatch >= 1.25 && candMatch > curMatch + 0.20) {
        return { kind: "switch", value: i };
      }
    }
  }

  if (!affordable.length) {
    active.energy = clamp(active.energy + Math.floor(active.maxEnergy * 0.25), 0, active.maxEnergy);
    return { kind: "charge" };
  }

  const statusMoves = affordable.filter(n => moveDef[n]?.category === "Status" || Number(moveDef[n]?.power || 0) === 0);
  if (statusMoves.length && Math.random() < 0.20) return { kind: "move", value: pick(statusMoves) };

  const physical = affordable.filter(n => Number(moveDef[n]?.power || 0) > 0)
    .sort((a, b) => Number(moveDef[b]?.power || 0) - Number(moveDef[a]?.power || 0));
  if (!physical.length) return { kind: "move", value: pick(affordable) };
  const chosen = physical.length > 1 && Math.random() < 0.30 ? physical[1] : physical[0];
  return { kind: "move", value: chosen };
}

// ════════════════════════════════════════════════════════════
// SECTION 13 – DAMAGE CALCULATION
// ════════════════════════════════════════════════════════════
function typeChart(att, def) {
  const T = {
    Flame:  { Nature:1.25, Frost:1.25, Aqua:0.75, Terra:0.75 },
    Aqua:   { Flame:1.25, Terra:1.25, Nature:0.75, Volt:0.75 },
    Terra:  { Volt:1.25, Flame:1.25, Aqua:0.75, Wind:0.75, Nature:0.75 },
    Volt:   { Aqua:1.25, Wind:1.25, Terra:0.75 },
    Nature: { Aqua:1.25, Terra:1.25, Flame:0.75, Frost:0.75 },
    Frost:  { Wind:1.25, Nature:1.25, Flame:0.75 },
    Wind:   { Terra:1.25, Frost:1.25, Volt:0.75 },
    Shadow: { Shadow:1.1 },
  };
  return T?.[att]?.[def] ?? 1.0;
}

function calcDmg(attacker, defender, move) {
  const power   = clamp(Number(move?.power || 0), 0, 200);
  if (!power) return { dmg: 0, crit: false, mult: 1 };
  const atk     = clamp(Number(attacker?.stats?.atk || 10), 1, 99999);
  const def_    = clamp(Number(defender?.stats?.def || 10), 1, 99999);
  const lv      = clamp(Number(attacker?.level || 1), 1, 999);
  let dmg = Math.floor((power * ((lv + 10) / 18) * (atk / (def_ + 8))) / 6);
  dmg = Math.floor(dmg * (randInt(88, 110) / 100));
  const mult = typeChart(String(attacker.type || ""), String(defender.type || ""));
  dmg = Math.floor(dmg * (0.9 + (mult - 1) * 0.85));
  const crit = Math.random() < 0.10;
  if (crit) dmg = Math.floor(dmg * 1.35);
  return { dmg: clamp(dmg, 1, 9999), crit, mult };
}

// ════════════════════════════════════════════════════════════
// SECTION 14 – BATTLE UI
// ════════════════════════════════════════════════════════════
const DIVIDER     = "═══════════════════════════";
const THIN_DIV    = "─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─";

function hpBar(hp, maxHp) {
  const pct    = clamp(hp / Math.max(maxHp, 1), 0, 1);
  const filled = Math.round(pct * 10);
  const empty  = 10 - filled;
  const color  = pct > 0.55 ? "🟩" : pct > 0.28 ? "🟨" : "🟥";
  return color.repeat(filled) + "⬛".repeat(empty) + ` *${hp}/${maxHp}*`;
}

function energyBar(en, max) {
  const pct    = clamp(en / Math.max(max, 1), 0, 1);
  const filled = Math.round(pct * 8);
  const empty  = 8 - filled;
  return "🔷".repeat(filled) + "⬛".repeat(empty) + ` *${en}/${max}*`;
}

function buildCard(playerMora, npcMora, npcName, npcChar, tierLabel, turnNum) {
  const factionTag = npcChar ? `${npcChar.emoji} ${npcChar.faction?.toUpperCase() || ""}` : "";
  return (
    `${DIVIDER}\n` +
    `⚔️  *A R E N A   B A T T L E*  ⚔️\n` +
    `${THIN_DIV}\n` +
    `${tierLabel}  •  Turn *${turnNum}*  •  ${factionTag}\n` +
    `${THIN_DIV}\n\n` +
    `🤺 *YOUR MORA*\n` +
    `🔹 ${playerMora.name}  _(Lv ${playerMora.level})_\n` +
    `❤️  ${hpBar(playerMora.hp, playerMora.maxHp)}\n` +
    `⚡  ${energyBar(playerMora.energy, playerMora.maxEnergy)}\n\n` +
    `🤖 *${npcName.toUpperCase()}*\n` +
    `🔹 ${npcMora.name}  _(Lv ${npcMora.level})_\n` +
    `❤️  ${hpBar(npcMora.hp, npcMora.maxHp)}\n` +
    `⚡  ${energyBar(npcMora.energy, npcMora.maxEnergy)}\n` +
    `${DIVIDER}`
  );
}

// ════════════════════════════════════════════════════════════
// SECTION 15 – .arena COMMAND
// ════════════════════════════════════════════════════════════
async function cmdArena(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const state  = loadState();
  const config = state.config || DEFAULT_CONFIG;

  if (!config.arenaEnabled) {
    return sock.sendMessage(chatId, {
      text:
        `${DIVIDER}\n` +
        `🚫  *T H E   A R E N A   I S   C L O S E D*\n` +
        `${DIVIDER}\n\n` +
        `_"The gates are sealed by order of the Architect.\nThe Primordial Rift's energy is too unstable for trials today."_\n\n` +
        `Check back later.`,
    }, { quoted: msg });
  }

  const player    = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using *.start*" }, { quoted: msg });

  const aura      = Number(player.aura || 0);
  const used      = getDailyCount(state, senderId);
  const limit     = config.dailyLimit || 4;
  const pFaction  = player.faction || "none";
  const defeated  = getDefeatedList(state, senderId);

  let tierLines = "";
  for (const tKey of ["novice", "warrior", "elite", "mythic"]) {
    const t      = TIERS[tKey];
    const locked = aura < t.auraRequired;
    const icon   = locked ? "🔒" : "✅";
    const npcPool = NPC_ROSTER[pFaction]?.[tKey] || NPC_ROSTER["none"][tKey];
    const npcLine = npcPool.map(n => {
      const beaten = defeated.includes(n);
      const ch     = NPC_CHARACTERS[n];
      return `    ${beaten ? "☑️" : "⬜"} ${n}${ch ? ` _(${ch.faction})_` : ""}`;
    }).join("\n");

    tierLines +=
      `${icon} *${t.label}*  ${locked ? `_(Aura ${t.auraRequired} required)_` : ""}\n` +
      `   ${t.desc}\n` +
      `   🏅  Aura reward: *+${t.auraReward}*\n` +
      `${THIN_DIV}\n` +
      `   Challengers you face:\n` +
      npcLine + "\n\n";
  }

  return sock.sendMessage(chatId, {
    text:
      `${DIVIDER}\n` +
      `🏟️  *L U M O R A   A R E N A*\n` +
      `_"Forged in the Capital's shadow. Sanctioned by no faction. Feared by all."_\n` +
      `${DIVIDER}\n\n` +
      `🤺 *Your Aura:* ${aura}  |  ⚔️ *Today:* ${used}/${limit} battles\n` +
      `🏩 *Faction:* ${pFaction.toUpperCase()}\n` +
      `🏅 *Defeated:* ${defeated.length} NPC(s)\n\n` +
      `${THIN_DIV}\n` +
      `*CHALLENGE TIERS*\n` +
      `${THIN_DIV}\n\n` +
      tierLines +
      `💡 Require Aura ≥ ${config.baseAuraRequired || 50} to enter.\n` +
      `⦿ Fighting an opposing faction NPC gives *+25% Aura*.\n` +
      `⚠️ Repeat wins on the same NPC give diminishing rewards.\n` +
      `📖 Use *.intel <name>* after defeating an NPC to unlock their profile.\n\n` +
      `${THIN_DIV}\n` +
      `🎯 *How to challenge:*\n` +
      `*.challenge <name> <difficulty>*\n` +
      `Difficulties: 🟢 weak  🟡 normal  🟠 strong  🔴 nightmare\n` +
      `Example: *.challenge mira strong*`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 15.5 – NPC LOOKUP
// ════════════════════════════════════════════════════════════
function findNpcByName(query) {
  if (!query) return null;
  const q = String(query).trim().toLowerCase();
  const allKeys = Object.keys(NPC_CHARACTERS);
  // exact match first
  let found = allKeys.find(n => n.toLowerCase() === q);
  if (found) return found;
  // startsWith
  found = allKeys.find(n => n.toLowerCase().startsWith(q));
  if (found) return found;
  // contains (any word)
  found = allKeys.find(n => n.toLowerCase().includes(q));
  return found || null;
}

// ════════════════════════════════════════════════════════════
// SECTION 16 – .challenge <name> <difficulty> COMMAND
// ════════════════════════════════════════════════════════════
async function cmdChallenge(ctx, chatId, senderId, msg, args) {
  const { sock, players, loadMora } = ctx;
  const state  = loadState();
  const config = state.config || DEFAULT_CONFIG;

  if (!config.arenaEnabled) {
    return sock.sendMessage(chatId, {
      text: "🚫 The Arena is sealed. The Architect has closed the gates.",
    }, { quoted: msg });
  }

  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using *.start*" }, { quoted: msg });

  if (getBattle(state, chatId, senderId)) {
    return sock.sendMessage(chatId, {
      text:
        `⚔️ *You have an active Arena battle!*\n` +
        `Use *.attack <move>* to continue or *.arena-flee* to abandon.`,
    }, { quoted: msg });
  }

  if (player.inBattle) {
    return sock.sendMessage(chatId, {
      text: "❌ You cannot enter the Arena while in a PvP duel. Finish your battle first.",
    }, { quoted: msg });
  }

  // ── Parse args: .challenge <name...> <difficulty>
  if (!args.length) {
    return sock.sendMessage(chatId, {
      text:
        `${DIVIDER}\n` +
        `⚔️ *CHALLENGE AN NPC*\n` +
        `${DIVIDER}\n\n` +
        `Usage: *.challenge <name> <difficulty>*\n\n` +
        `*Difficulties:*\n` +
        `🟢 weak  – warm-up, lower rewards\n` +
        `🟡 normal – tier-appropriate (default)\n` +
        `🟠 strong – buffed stats, higher rewards\n` +
        `🔴 nightmare – maxed scaling, biggest rewards\n\n` +
        `Examples:\n` +
        `• *.challenge mira normal*\n` +
        `• *.challenge "Veil Crest" strong*\n` +
        `• *.challenge kael nightmare*\n\n` +
        `Use *.arena* to see all NPCs.`,
    }, { quoted: msg });
  }

  // Last token might be the difficulty; everything before is the name
  let diffKey = "normal";
  let nameTokens = args.slice();
  const lastToken = String(args[args.length - 1] || "").toLowerCase();
  if (DIFFICULTY_ALIASES[lastToken]) {
    diffKey = DIFFICULTY_ALIASES[lastToken];
    nameTokens = args.slice(0, -1);
  }
  const nameQuery = nameTokens.join(" ").trim();

  if (!nameQuery) {
    return sock.sendMessage(chatId, {
      text: `❌ Provide an NPC name.\nExample: *.challenge mira strong*`,
    }, { quoted: msg });
  }

  const npcName = findNpcByName(nameQuery);
  if (!npcName) {
    return sock.sendMessage(chatId, {
      text:
        `❌ NPC not found: *${nameQuery}*\n\n` +
        `Use *.arena* to see all available NPCs.`,
    }, { quoted: msg });
  }

  const npcChar = NPC_CHARACTERS[npcName];
  const tierKey = npcChar?.tier;
  const tier    = TIERS[tierKey];
  if (!tier) {
    return sock.sendMessage(chatId, { text: `❌ NPC tier data missing for *${npcName}*.` }, { quoted: msg });
  }

  const difficulty = DIFFICULTY_LEVELS[diffKey];
  if (!difficulty) {
    return sock.sendMessage(chatId, {
      text: `❌ Unknown difficulty *${diffKey}*. Use: weak / normal / strong / nightmare`,
    }, { quoted: msg });
  }

  const aura = Number(player.aura || 0);
  if (aura < (config.baseAuraRequired || 50)) {
    return sock.sendMessage(chatId, {
      text:
        `🔒 *Arena Locked*\n\n` +
        `You need *${config.baseAuraRequired || 50} Aura* to enter.\n` +
        `Current Aura: *${aura}*\n\n` +
        `_Win PvP battles and complete hunts to build your Aura._`,
    }, { quoted: msg });
  }

  if (aura < tier.auraRequired) {
    return sock.sendMessage(chatId, {
      text:
        `🔒 *Tier Locked – ${tier.label}*\n\n` +
        `*${npcName}* fights at the *${tier.label}* tier.\n` +
        `This tier requires *${tier.auraRequired} Aura*.\n` +
        `Current Aura: *${aura}*\n\n` +
        `_${tier.lore}_`,
    }, { quoted: msg });
  }

  const used  = getDailyCount(state, senderId);
  const limit = config.dailyLimit || 4;
  if (used >= limit) {
    return sock.sendMessage(chatId, {
      text:
        `⏳ *Daily Limit Reached*\n\n` +
        `You've fought *${used}/${limit}* NPCs today.\n` +
        `_"The arena gates close at midnight. The Primordial Rift rests too. Return tomorrow."_`,
    }, { quoted: msg });
  }

  const party     = getArenaParty(player);
  const aliveMora = party.filter(m => m && Number(m.hp || 0) > 0);
  if (!aliveMora.length) {
    return sock.sendMessage(chatId, {
      text:
        `❌ *All your Mora have fainted!*\n` +
        `Use *.heal* before challenging the Arena.`,
    }, { quoted: msg });
  }

  const moraList = loadMora();
  const npcParty = [];
  for (let i = 0; i < tier.partySize; i++) {
    const m = buildNpcMora(moraList, tier.levelRange, difficulty);
    if (m) npcParty.push(m);
  }
  if (!npcParty.length) {
    return sock.sendMessage(chatId, {
      text: "❌ Arena error: could not generate NPC Mora. Try again.",
    }, { quoted: msg });
  }

  const winCount    = getWinCount(state, senderId, npcName);
  const pFaction    = player.faction || "none";
  const isCross     = pFaction !== "none" && npcChar?.faction && pFaction !== npcChar.faction;
  const baseRewardMult = calcRewardMultiplier(tier, aura, winCount, pFaction, npcChar?.faction, config);
  // Stack difficulty reward multiplier on top of the existing one
  const rewardMult  = baseRewardMult * Number(difficulty.rewardMult || 1.0);
  const previewAura = Math.max(1, Math.floor(tier.auraReward * rewardMult));

  let scalingNote = "";
  if (winCount > 0) scalingNote += `\n⚠️ You've beaten this NPC *${winCount}x* before – rewards are reduced.`;
  if (aura > tier.auraRequired + tier.auraGap) scalingNote += `\n⚠️ Your Aura exceeds this tier – rewards are scaled down.`;
  if (isCross) scalingNote += `\n⦿ Cross-faction bonus: *+25% Aura* on win!`;
  scalingNote += `\n🎚 Difficulty: *${difficulty.label}* (×${difficulty.rewardMult.toFixed(2)} reward)`;

  const playerActiveIdx = party.findIndex(m => m && Number(m.hp || 0) > 0);
  const battle = {
    chatId, playerId: senderId,
    npcName, npcChar, tierKey, tier,
    difficultyKey: diffKey,
    npcParty, npcActiveIdx: 0,
    playerActiveIdx,
    startedAt: Date.now(), turnCount: 0, dialogueCooldown: 0,
    rewardMult,
  };

  setBattle(state, chatId, senderId, battle);
  incDaily(state, senderId);
  saveState(state);

  const playerMora = party[playerActiveIdx];
  const npcMora    = npcParty[0];
  const opening    = npcChar?.openingLine || pick(DIALOGUE.opening);

  return sock.sendMessage(chatId, {
    text:
      `${DIVIDER}\n` +
      `🏟️  *A R E N A   C H A L L E N G E*\n` +
      `${tier.label}  •  ${difficulty.label}  •  ${npcChar?.emoji || "⚔️"} ${npcChar?.faction?.toUpperCase() || ""}\n` +
      `${DIVIDER}\n\n` +
      `${npcChar?.emoji || "⚔️"} *${npcName}*\n` +
      `_${npcChar?.title || "Arena Challenger"}_\n\n` +
      `📖 _"${npcChar?.bio || "A formidable challenger."}"_\n\n` +
      `💬 *${npcName}:* _"${opening}"_\n\n` +
      `${THIN_DIV}\n` +
      `🏅  *Potential Aura Reward:* ~${previewAura}${scalingNote}\n` +
      `${THIN_DIV}\n\n` +
      buildCard(playerMora, npcMora, npcName, npcChar, `${tier.label} ${difficulty.label}`, 1) +
      `\n\n` +
      `🎯 *Commands:*\n` +
      `• *.attack <1-4 or move name>* – use a move\n` +
      `• *.switch <slot>* – swap your active Mora\n` +
      `• *.arena-flee* – abandon the battle (no penalty)\n\n` +
      `⚡ The NPC responds immediately after your move!`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 16 – .npc <difficulty> COMMAND  (LEGACY)
// ════════════════════════════════════════════════════════════
async function cmdNpcChallenge(ctx, chatId, senderId, msg, args) {
  const { sock, players, loadMora } = ctx;
  const state  = loadState();
  const config = state.config || DEFAULT_CONFIG;

  if (!config.arenaEnabled) {
    return sock.sendMessage(chatId, {
      text: "🚫 The Arena is sealed. The Architect has closed the gates.",
    }, { quoted: msg });
  }

  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Register first using *.start*" }, { quoted: msg });

  if (getBattle(state, chatId, senderId)) {
    return sock.sendMessage(chatId, {
      text:
        `⚔️ *You have an active Arena battle!*\n` +
        `Use *.attack <move>* to continue or *.arena-flee* to abandon.`,
    }, { quoted: msg });
  }

  if (player.inBattle) {
    return sock.sendMessage(chatId, {
      text: "❌ You cannot enter the Arena while in a PvP duel. Finish your battle first.",
    }, { quoted: msg });
  }

  const tierKey = String(args[0] || "").toLowerCase().trim();
  const tier    = TIERS[tierKey];
  if (!tier) {
    return sock.sendMessage(chatId, {
      text:
        `❌ Invalid tier. Choose:\n` +
        `*novice* | *warrior* | *elite* | *mythic*\n\n` +
        `Example: *.npc warrior*`,
    }, { quoted: msg });
  }

  const aura = Number(player.aura || 0);
  if (aura < (config.baseAuraRequired || 50)) {
    return sock.sendMessage(chatId, {
      text:
        `🔒 *Arena Locked*\n\n` +
        `You need *${config.baseAuraRequired || 50} Aura* to enter.\n` +
        `Current Aura: *${aura}*\n\n` +
        `_Win PvP battles and complete hunts to build your Aura._`,
    }, { quoted: msg });
  }

  if (aura < tier.auraRequired) {
    return sock.sendMessage(chatId, {
      text:
        `🔒 *Tier Locked – ${tier.label}*\n\n` +
        `This tier requires *${tier.auraRequired} Aura*.\n` +
        `Current Aura: *${aura}*\n\n` +
        `_${tier.lore}_`,
    }, { quoted: msg });
  }

  const used  = getDailyCount(state, senderId);
  const limit = config.dailyLimit || 4;
  if (used >= limit) {
    return sock.sendMessage(chatId, {
      text:
        `⏳ *Daily Limit Reached*\n\n` +
        `You've fought *${used}/${limit}* NPCs today.\n` +
        `_"The arena gates close at midnight. The Primordial Rift rests too. Return tomorrow."_`,
    }, { quoted: msg });
  }

  const party     = getArenaParty(player);
  const aliveMora = party.filter(m => m && Number(m.hp || 0) > 0);
  if (!aliveMora.length) {
    return sock.sendMessage(chatId, {
      text:
        `❌ *All your Mora have fainted!*\n` +
        `Use *.heal* before challenging the Arena.`,
    }, { quoted: msg });
  }

  const pFaction = player.faction || "none";
  const pool     = NPC_ROSTER[pFaction]?.[tierKey] || NPC_ROSTER["none"][tierKey];
  if (!pool?.length) {
    return sock.sendMessage(chatId, {
      text: "❌ No NPCs available for your faction at this tier. Contact the Architect.",
    }, { quoted: msg });
  }
  const npcName = pick(pool);
  const npcChar = NPC_CHARACTERS[npcName];

  const moraList = loadMora();
  const npcParty = [];
  for (let i = 0; i < tier.partySize; i++) {
    const m = buildNpcMora(moraList, tier.levelRange, DIFFICULTY_LEVELS.normal);
    if (m) npcParty.push(m);
  }
  if (!npcParty.length) {
    return sock.sendMessage(chatId, {
      text: "❌ Arena error: could not generate NPC Mora. Try again.",
    }, { quoted: msg });
  }

  const winCount    = getWinCount(state, senderId, npcName);
  const isCross     = pFaction !== "none" && npcChar?.faction && pFaction !== npcChar.faction;
  const rewardMult  = calcRewardMultiplier(tier, aura, winCount, pFaction, npcChar?.faction, config);
  const previewAura = Math.max(1, Math.floor(tier.auraReward * rewardMult));

  let scalingNote = "";
  if (winCount > 0) scalingNote += `\n⚠️ You've beaten this NPC *${winCount}x* before – rewards are reduced.`;
  if (aura > tier.auraRequired + tier.auraGap) scalingNote += `\n⚠️ Your Aura exceeds this tier – rewards are scaled down.`;
  if (isCross) scalingNote += `\n⦿ Cross-faction bonus: *+25% Aura* on win!`;

  const playerActiveIdx = party.findIndex(m => m && Number(m.hp || 0) > 0);
  const battle = {
    chatId, playerId: senderId,
    npcName, npcChar, tierKey, tier,
    npcParty, npcActiveIdx: 0,
    playerActiveIdx,
    startedAt: Date.now(), turnCount: 0, dialogueCooldown: 0,
    rewardMult,
  };

  setBattle(state, chatId, senderId, battle);
  incDaily(state, senderId);
  saveState(state);

  const playerMora = party[playerActiveIdx];
  const npcMora    = npcParty[0];
  const opening    = npcChar?.openingLine || pick(DIALOGUE.opening);

  return sock.sendMessage(chatId, {
    text:
      `${DIVIDER}\n` +
      `🏟️  *A R E N A   C H A L L E N G E*\n` +
      `${tier.label}  •  ${npcChar?.emoji || "⚔️"} ${npcChar?.faction?.toUpperCase() || ""}\n` +
      `${DIVIDER}\n\n` +
      `${npcChar?.emoji || "⚔️"} *${npcName}*\n` +
      `_${npcChar?.title || "Arena Challenger"}_\n\n` +
      `📖 _"${npcChar?.bio || "A formidable challenger."}"_\n\n` +
      `💬 *${npcName}:* _"${opening}"_\n\n` +
      `${THIN_DIV}\n` +
      `🏅  *Potential Aura Reward:* ~${previewAura}${scalingNote}\n` +
      `${THIN_DIV}\n\n` +
      buildCard(playerMora, npcMora, npcName, npcChar, tier.label, 1) +
      `\n\n` +
      `🎯 *Commands:*\n` +
      `• *.attack <1-4 or move name>* – use a move\n` +
      `• *.switch <slot>* – swap your active Mora\n` +
      `• *.arena-flee* – abandon the battle (no penalty)\n\n` +
      `⚡ The NPC responds immediately after your move!`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 17 – .attack (NPC battle intercept)
// Returns false if no active NPC battle
// ════════════════════════════════════════════════════════════
async function cmdNpcAttack(ctx, chatId, senderId, msg, args) {
  const { sock, players, savePlayers, loadMora, xpSystem, auraSystem } = ctx;
  const state  = loadState();
  const battle = getBattle(state, chatId, senderId);
  if (!battle) return false;

  const player     = players[senderId];
  const party      = getArenaParty(player);
  const playerMora = party[battle.playerActiveIdx];

  if (!player || !playerMora) {
    clearBattle(state, chatId, senderId);
    saveState(state);
    return sock.sendMessage(chatId, { text: "❌ Arena battle data lost. Battle cancelled." }, { quoted: msg });
  }

  if (Number(playerMora.hp || 0) <= 0) {
    return sock.sendMessage(chatId, {
      text:
        `💀 *${playerMora.name} has fainted!*\n` +
        `Use *.switch <slot>* to send out another Mora.`,
    }, { quoted: msg });
  }

  const pickRaw  = args.join(" ").trim();
  const moraList = loadMora();

  if (!pickRaw) {
    const sp    = moraList.find(m => Number(m.id) === Number(playerMora.moraId));
    const defs  = sp?.moves || {};
    const moves = Array.isArray(playerMora.moves) ? playerMora.moves : [];
    const lines = moves.map((n, i) => {
      const mv   = defs[n] || {};
      const cost = Math.max(6, 6 + Math.floor(Number(mv.power || 0) / 10));
      const canUse = playerMora.energy >= cost;
      return (
        `${canUse ? `${i+1})` : `${i+1})✖`} *${n}*\n` +
        `   🔥 Pwr: ${mv.power ?? "–"}  🎯 Acc: ${mv.accuracy ?? "–"}  🔋 Cost: ~${cost}\n` +
        `   📝 ${mv.desc || "–"}`
      );
    });
    return sock.sendMessage(chatId, {
      text:
        `🔴 *${playerMora.name}'s Moves*\n` +
        `🔋 Energy: *${playerMora.energy}/${playerMora.maxEnergy}*\n\n` +
        (lines.join("\n\n") || "No moves available.") +
        `\n\nUse *.attack 1-4* or *.attack <move name>*`,
    }, { quoted: msg });
  }

  const sp    = moraList.find(m => Number(m.id) === Number(playerMora.moraId));
  const defs  = sp?.moves || {};
  const moves = Array.isArray(playerMora.moves) ? playerMora.moves : [];

  let moveName = null;
  if (/^\d+$/.test(pickRaw)) {
    const n = Number(pickRaw);
    moveName = (n >= 1 && n <= moves.length) ? moves[n - 1] : null;
  } else {
    const q = pickRaw.toLowerCase();
    moveName = moves.find(m => m.toLowerCase() === q)
            || moves.find(m => m.toLowerCase().includes(q))
            || null;
  }

  if (!moveName) {
    return sock.sendMessage(chatId, {
      text: `❌ Move not found. Use *.attack* (no args) to see your move list.`,
    }, { quoted: msg });
  }

  const mv = defs[moveName];
  if (!mv) {
    return sock.sendMessage(chatId, { text: `❌ *${moveName}* has no data in the database.` }, { quoted: msg });
  }

  const cost = Math.max(6, 6 + Math.floor(Number(mv.power || 0) / 10));
  if (Number(playerMora.energy || 0) < cost) {
    return sock.sendMessage(chatId, {
      text:
        `⚡ *Not enough energy!*\n` +
        `*${moveName}* costs ~${cost}  |  You have *${playerMora.energy}/${playerMora.maxEnergy}*\n\n` +
        `Use *.switch* to swap to a Mora with more energy.`,
    }, { quoted: msg });
  }

  // ── Execute player attack ─────────────────────────────────
  const logs    = [];
  const npcMora = battle.npcParty[battle.npcActiveIdx];
  battle.turnCount++;

  playerMora.energy = clamp(Number(playerMora.energy) - cost, 0, playerMora.maxEnergy);

  const hitRoll = Math.random() * 100 <= Number(mv.accuracy || 100);
  if (!hitRoll) {
    logs.push(`🌨 *${playerMora.name}* used *${moveName}* – *MISSED!*`);
    if (battle.turnCount > battle.dialogueCooldown) {
      logs.push(`💬 *${battle.npcName}:* _"${pick(DIALOGUE.miss)}"_`);
      battle.dialogueCooldown = battle.turnCount + 2;
    }
  } else {
    const { dmg, crit, mult } = calcDmg(playerMora, npcMora, { ...mv, type: playerMora.type });
    npcMora.hp = clamp(Number(npcMora.hp) - dmg, 0, npcMora.maxHp);

    const effText = mult >= 1.18 ? "  🔥 *SUPER EFFECTIVE!*" : mult <= 0.82 ? "  🧊 *NOT VERY EFFECTIVE*" : "";
    logs.push(
      `⚔️ *${playerMora.name}* – *${moveName}* – *${dmg} dmg* to *${npcMora.name}*` +
      (crit ? "  ✨ *CRIT!*" : "") + effText
    );

    if ((crit || mult >= 1.18) && battle.turnCount > battle.dialogueCooldown) {
      logs.push(`💬 *${battle.npcName}:* _"${pick(DIALOGUE.bigHit)}"_`);
      battle.dialogueCooldown = battle.turnCount + 2;
    }

    if (npcMora.hp <= 0) {
      logs.push(`\n💀 *${npcMora.name}* has fainted!`);
      if (battle.turnCount > battle.dialogueCooldown) {
        logs.push(`💬 *${battle.npcName}:* _"${pick(DIALOGUE.moraFainted)}"_`);
        battle.dialogueCooldown = battle.turnCount + 2;
      }
      const nextNpc = battle.npcParty.findIndex((m, i) => i !== battle.npcActiveIdx && m?.hp > 0);
      if (nextNpc < 0) {
        return resolveEnd(ctx, chatId, senderId, msg, state, battle, players, true, logs);
      }
      battle.npcActiveIdx = nextNpc;
      logs.push(`⬅️ *${battle.npcName}* sends out *${battle.npcParty[nextNpc].name}*!`);
    }
  }

  // ── NPC attacks back ──────────────────────────────────────
  const curNpc = battle.npcParty[battle.npcActiveIdx];
  if (curNpc && curNpc.hp > 0) {
    // Pass the player's active mora as opponent so the AI can do tactical
    // type-matchup switches and sane charge decisions.
    const act = npcPickAction(battle.npcParty, battle.npcActiveIdx, moraList, playerMora);
    if (!act) {
      return resolveEnd(ctx, chatId, senderId, msg, state, battle, players, true, logs);
    }

    if (act.kind === "switch") {
      battle.npcActiveIdx = act.value;
      logs.push(`🔄 *${battle.npcName}* switched to *${battle.npcParty[act.value].name}*!`);
    } else if (act.kind === "charge") {
      logs.push(`🔋 *${curNpc.name}* channels Rift energy to restore stamina...`);
    } else if (act.kind === "move") {
      const npcSp   = moraList.find(m => Number(m.id) === Number(curNpc.moraId));
      const npcDefs = npcSp?.moves || {};
      const npcMv   = npcDefs[act.value];
      if (npcMv) {
        const npcCost = Math.max(6, 6 + Math.floor(Number(npcMv.power || 0) / 10));
        curNpc.energy = clamp(Number(curNpc.energy) - npcCost, 0, curNpc.maxEnergy);

        const npcHit = Math.random() * 100 <= Number(npcMv.accuracy || 100);
        if (!npcHit) {
          logs.push(`🌨 *${curNpc.name}* used *${act.value}* – *MISSED!*`);
        } else {
          const npcRes = calcDmg(curNpc, playerMora, { ...npcMv, type: curNpc.type });
          playerMora.hp = clamp(Number(playerMora.hp) - npcRes.dmg, 0, playerMora.maxHp);

          const npcEff = npcRes.mult >= 1.18 ? "  🔥 *SUPER EFFECTIVE!*" : npcRes.mult <= 0.82 ? "  🧊 *NOT VERY EFFECTIVE*" : "";
          logs.push(
            `🤖 *${curNpc.name}* – *${act.value}* – *${npcRes.dmg} dmg* to *${playerMora.name}*` +
            (npcRes.crit ? "  ✨ *CRIT!*" : "") + npcEff
          );

          if (battle.turnCount % 3 === 0) {
            logs.push(`💬 *${battle.npcName}:* _"${pick(DIALOGUE.taunt)}"_`);
          }

          if (playerMora.hp <= 0) {
            logs.push(`\n💀 *${playerMora.name}* has fainted!`);
            const nextPlayer = party.findIndex((m, i) => i !== battle.playerActiveIdx && m && Number(m.hp||0) > 0);
            if (nextPlayer < 0) {
              return resolveEnd(ctx, chatId, senderId, msg, state, battle, players, false, logs);
            }
            battle.playerActiveIdx = nextPlayer;
            logs.push(`⬅️ Your *${party[nextPlayer].name}* enters the battle!`);
          }

          const npcAlive = battle.npcParty.filter(m => m.hp > 0).length;
          if (npcAlive === 1 && curNpc.hp / curNpc.maxHp < 0.30 && battle.turnCount > battle.dialogueCooldown) {
            logs.push(`💬 *${battle.npcName}:* _"${pick(DIALOGUE.nearDefeat)}"_`);
            battle.dialogueCooldown = battle.turnCount + 3;
          }
        }
      }
    }
  }

  // ── Energy regen ──────────────────────────────────────────
  playerMora.energy = clamp(
    Number(playerMora.energy) + Math.floor(playerMora.maxEnergy * 0.10),
    0, playerMora.maxEnergy
  );

  setBattle(state, chatId, senderId, battle);
  saveState(state);
  savePlayers(players);

  const upNpc    = battle.npcParty[battle.npcActiveIdx];
  const upPlayer = party[battle.playerActiveIdx];

  return sock.sendMessage(chatId, {
    text:
      logs.join("\n") +
      `\n\n` +
      buildCard(upPlayer, upNpc, battle.npcName, battle.npcChar, battle.tier.label, battle.turnCount) +
      `\n\n🎯 *.attack <move>*  |  *.switch <slot>*  |  *.arena-flee*`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 18 – .switch (NPC battle intercept)
// ════════════════════════════════════════════════════════════
async function cmdNpcSwitch(ctx, chatId, senderId, msg, args) {
  const { sock, players, savePlayers } = ctx;
  const state  = loadState();
  const battle = getBattle(state, chatId, senderId);
  if (!battle) return false;

  const player = players[senderId];
  const party  = getArenaParty(player);
  const slotRaw = String(args[0] || "").trim();

  if (!slotRaw) {
    const lines = party.map((m, i) => {
      if (!m) return `${i+1}) – empty –`;
      const st = Number(m.hp||0) > 0 ? `❤️ ${m.hp}/${m.maxHp}` : "💀 FAINTED";
      const active = i === battle.playerActiveIdx ? " ◀ ACTIVE" : "";
      return `${i+1}) *${m.name}* Lv ${m.level} – ${st}${active}`;
    });
    return sock.sendMessage(chatId, {
      text: `🔄 *Switch Mora*\n\n${lines.join("\n")}\n\nUse *.switch 1-5*`,
    }, { quoted: msg });
  }

  const slot = Number(slotRaw) - 1;
  if (slot < 0 || slot >= party.length) return sock.sendMessage(chatId, { text: "❌ Invalid slot." }, { quoted: msg });
  const target = party[slot];
  if (!target) return sock.sendMessage(chatId, { text: "❌ That slot is empty." }, { quoted: msg });
  if (Number(target.hp||0) <= 0) return sock.sendMessage(chatId, { text: "❌ That Mora has fainted." }, { quoted: msg });
  if (slot === battle.playerActiveIdx) return sock.sendMessage(chatId, { text: "❌ That Mora is already in battle." }, { quoted: msg });

  battle.playerActiveIdx = slot;
  setBattle(state, chatId, senderId, battle);
  saveState(state);

  const npcMora = battle.npcParty[battle.npcActiveIdx];
  return sock.sendMessage(chatId, {
    text:
      `🔄 You switched to *${target.name}* (Lv ${target.level})!\n\n` +
      buildCard(target, npcMora, battle.npcName, battle.npcChar, battle.tier.label, battle.turnCount) +
      `\n\n🎯 *.attack <move>*`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 19 – .arena-flee
// ════════════════════════════════════════════════════════════
async function cmdArenaFlee(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const state  = loadState();
  const battle = getBattle(state, chatId, senderId);
  if (!battle) return sock.sendMessage(chatId, { text: "❌ You have no active Arena battle." }, { quoted: msg });

  clearBattle(state, chatId, senderId);
  saveState(state);

  return sock.sendMessage(chatId, {
    text:
      `${DIVIDER}\n` +
      `🏃 *You fled the Arena.*\n` +
      `${DIVIDER}\n\n` +
      `💬 *${battle.npcName}:* _"Running? The Rift remembers cowardice."_\n\n` +
      `No Aura or XP earned.\n` +
      `Your daily challenge count is *not* refunded.\n\n` +
      `Use *.npc <tier>* to start a new challenge.`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 20 – BATTLE END RESOLUTION
// ════════════════════════════════════════════════════════════
async function resolveEnd(ctx, chatId, senderId, msg, state, battle, players, playerWon, logs) {
  const { sock, savePlayers, loadMora, xpSystem, auraSystem } = ctx;

  const player  = players[senderId];
  const party   = getArenaParty(player);
  const moraList = loadMora();
  const tier    = battle.tier;
  const config  = state.config || DEFAULT_CONFIG;
  const mult    = battle.rewardMult || 1.0;

  clearBattle(state, chatId, senderId);

  if (playerWon) {
    recordWin(state, senderId, battle.npcName);
    saveState(state);

    const baseXp       = 65 + tier.levelRange[1] * 4;
    const playerXpGain = Math.max(5, Math.floor(baseXp * tier.xpMult * mult * REWARD_NERF));
    const auraGain     = Math.max(1, Math.floor(tier.auraReward * mult * REWARD_NERF));
    const moraXpGain   = Math.max(3, Math.floor(baseXp * 0.5 * tier.xpMult * mult * REWARD_NERF));

    const levelUps = [];
    for (const mora of party) {
      if (!mora || Number(mora.hp||0) <= 0) continue;
      const sp = moraList.find(m => Number(m.id) === Number(mora.moraId));
      if (!sp) continue;
      const res = xpSystem.addMoraXp(mora, sp, moraXpGain);
      if (res.leveledUp) levelUps.push(`🎉 *${mora.name}* levelled up – Lv *${mora.level}*!`);
    }

    const xpRes = xpSystem.addPlayerXp(player, playerXpGain);
    auraSystem.addAura(player, auraGain);

    const pFaction  = player.faction || "none";
    const npcFaction = battle.npcChar?.faction || "none";
    const isSame    = pFaction !== "none" && pFaction === npcFaction;
    const isCross   = pFaction !== "none" && pFaction !== npcFaction;

    let factionEvent = "";
    if (isSame) {
      factionEvent =
        `\n${THIN_DIV}\n` +
        `🤝 *FACTION BOND EVENT*\n` +
        `_${DIALOGUE.sameFactionWin[pFaction] || "Your faction acknowledges this internal trial."}_\n` +
        `⦿ Defeating a fellow ${pFaction} fighter strengthens your Rift resonance.\n`;
    } else if (isCross) {
      factionEvent =
        `\n${THIN_DIV}\n` +
        `⚔️ *CROSS-FACTION VICTORY*\n` +
        `_You defeated a ${npcFaction.toUpperCase()} fighter. The ideological clash sharpened your Aura._\n` +
        `⦿ *+25% Aura bonus applied!*\n`;
    }

    let scalingNote = "";
    const winCount  = getWinCount(state, senderId, battle.npcName);
    if (winCount > 3) scalingNote += `\n⚠️ Diminishing returns active (${winCount} wins vs this NPC).`;
    if (mult < 0.90)  scalingNote += `\n⚠️ Aura-gap penalty reduced rewards further.`;

    savePlayers(players);

    return sock.sendMessage(chatId, {
      text:
        logs.join("\n") + `\n\n` +
        `${DIVIDER}\n` +
        `🏆  *V I C T O R Y !*\n` +
        `${DIVIDER}\n\n` +
        `💬 *${battle.npcName}:* _"${pick(DIALOGUE.playerWins)}"_\n` +
        factionEvent +
        `\n✨ *R E W A R D S*\n` +
        `${THIN_DIV}\n` +
        `▸ ⚡ Aura:        *+${auraGain}*\n` +
        `▸ 📊 Player XP:   *+${playerXpGain}*\n` +
        `▸ ⭐ Mora XP:     *+${moraXpGain}* (all alive Mora)\n` +
        (levelUps.length ? `\n${levelUps.join("\n")}\n` : "") +
        (xpRes.leveledUp ? `\n🎉 *You levelled up!* Now Level *${player.level}*\n` : "") +
        scalingNote +
        `\n\n🏅 Your Aura is now *${player.aura}*\n` +
        `📖 Use *.intel ${battle.npcName}* to unlock their full profile!\n` +
        `${DIVIDER}`,
    }, { quoted: msg });
  }

  // ── PLAYER LOSES ──────────────────────────────────────────
  saveState(state);
  const consolXp  = Math.max(5, Math.floor(25 * tier.xpMult));
  const auraFine  = tier.fineOnLoss;
  xpSystem.addPlayerXp(player, consolXp);
  if (auraFine > 0) auraSystem.removeAura(player, auraFine);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      logs.join("\n") + `\n\n` +
      `${DIVIDER}\n` +
      `💀  *D E F E A T*\n` +
      `${DIVIDER}\n\n` +
      `💬 *${battle.npcName}:* _"${pick(DIALOGUE.npcWins)}"_\n\n` +
      `📊 *O U T C O M E*\n` +
      `${THIN_DIV}\n` +
      `▸ 🔵 Aura penalty:     *-${auraFine}*\n` +
      `▸ 📊 Consolation XP:   *+${consolXp}*\n\n` +
      `_"Every Lumorian who fell here came back. The Rift doesn't forget effort."_\n\n` +
      `Use *.heal* then *.npc ${battle.tierKey}* to try again.\n` +
      `${DIVIDER}`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 21 – .intel <npc name>
// ════════════════════════════════════════════════════════════
async function cmdIntel(ctx, chatId, senderId, msg, args) {
  const { sock, players } = ctx;
  const state  = loadState();

  if (!args.length) {
    const defeated  = getDefeatedList(state, senderId);
    const allNpcs = Object.keys(NPC_CHARACTERS);
    let indexText = `${DIVIDER}\n📖 *ARENA INTEL FILES*\n${DIVIDER}\n\n`;
    indexText += `_Defeat NPCs in the arena to unlock their intelligence dossier._\n\n`;

    for (const tKey of ["novice", "warrior", "elite", "mythic"]) {
      const t = TIERS[tKey];
      indexText += `${t.label}\n`;
      const npcsInTier = allNpcs.filter(n => NPC_CHARACTERS[n].tier === tKey);
      for (const n of npcsInTier) {
        const ch = NPC_CHARACTERS[n];
        const won = defeated.includes(n);
        indexText += `  ${won ? "📂" : "📁"} *${n}*  _(${ch.faction})_`;
        if (won) indexText += `  – *.intel ${n}*`;
        indexText += "\n";
      }
      indexText += "\n";
    }
    return sock.sendMessage(chatId, { text: indexText }, { quoted: msg });
  }

  const query   = args.join(" ").trim().toLowerCase();
  const allKeys = Object.keys(NPC_CHARACTERS);
  const npcName = allKeys.find(n => n.toLowerCase() === query)
               || allKeys.find(n => n.toLowerCase().includes(query))
               || null;

  if (!npcName) {
    return sock.sendMessage(chatId, {
      text:
        `❌ NPC not found: *${args.join(" ")}*\n\n` +
        `Use *.intel* (no args) to see the full list.`,
    }, { quoted: msg });
  }

  if (!hasDefeated(state, senderId, npcName)) {
    const ch = NPC_CHARACTERS[npcName] || {};
    const imgKey  = NPC_IMAGE_KEYS[npcName];
    const imgPath = imgKey ? path.join(NPC_ASSETS_DIR, `${imgKey}.jpg`) : null;

    const lockedCaption =
      `🔒 *INTEL FILE – CLASSIFIED*\n` +
      `${DIVIDER}\n\n` +
      `${ch.emoji || "⚔️"} *${npcName}*\n` +
      `_${ch.title || "Arena Challenger"}_\n\n` +
      `_"Some knowledge must be earned with sweat and Rift-fire."_\n\n` +
      `⚠️ You have not yet defeated *${npcName}* in the Arena.\n\n` +
      `Challenge them with *.npc ${ch.tier || "novice"}* and win to unlock this profile.\n` +
      `${DIVIDER}`;

    if (imgPath && fs.existsSync(imgPath)) {
      return sock.sendMessage(chatId, {
        image: fs.readFileSync(imgPath),
        caption: lockedCaption,
      }, { quoted: msg });
    }
    return sock.sendMessage(chatId, { text: lockedCaption }, { quoted: msg });
  }

  const lore    = NPC_LORE[npcName] || {};
  const ch      = NPC_CHARACTERS[npcName] || {};
  const winCount = getWinCount(state, senderId, npcName);
  const imgKey  = NPC_IMAGE_KEYS[npcName];
  const imgPath = imgKey ? path.join(NPC_ASSETS_DIR, `${imgKey}.jpg`) : null;

  const FACTION_LORE = {
    harmony: "Harmony Lumorian – fights to coexist with Mora and purify Baby Rifts.",
    purity:  "Purity Order – seeks to seal the Primordial Rift and destroy corrupted Mora.",
    rift:    "Rift Seeker – harnesses Rift energy for power, consequences be damned.",
  };

  const intelCaption =
    `${DIVIDER}\n` +
    `📁  *ARENA INTEL – DECLASSIFIED*\n` +
    `${DIVIDER}\n\n` +
    `${ch.emoji || "⚔️"}  *${npcName}*\n` +
    `🏅  _${ch.title || "–"}_\n` +
    `🏩  ${FACTION_LORE[ch.faction] || ch.faction || "–"}\n\n` +
    `${THIN_DIV}\n` +
    `🧬  *D O S S I E R*\n` +
    `${THIN_DIV}\n` +
    `📅  Age:      ${lore.age || "Unknown"}\n` +
    `🗺  Origin:   ${lore.origin || "Unknown"}\n` +
    `⚔️  Record:   ${lore.record || "Unknown"}\n\n` +
    `🥊  *Fighting Style*\n` +
    `_${lore.style || ch.bio || "–"}_\n\n` +
    `💪  *Strength*\n` +
    `_${lore.strength || "–"}_\n\n` +
    `⚠️  *Weakness*\n` +
    `_${lore.weakness || "–"}_\n\n` +
    `🕵️  *Classified Detail*\n` +
    `_${lore.secret || "Information withheld."}_\n\n` +
    `🌀  *Their View on the Primordial Rift*\n` +
    `_"${lore.riftView || "Classified."}"_\n\n` +
    `💬  *Signature Quote*\n` +
    `_${lore.quote || "–"}_\n\n` +
    `${THIN_DIV}\n` +
    `🏅  Your wins vs ${npcName}: *${winCount}*\n` +
    `${DIVIDER}`;

  if (imgPath && fs.existsSync(imgPath)) {
    return sock.sendMessage(chatId, {
      image: fs.readFileSync(imgPath),
      caption: intelCaption,
    }, { quoted: msg });
  }
  return sock.sendMessage(chatId, { text: intelCaption }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 22 – OWNER COMMANDS
// ════════════════════════════════════════════════════════════

async function cmdArenaSetLimit(ctx, chatId, senderId, msg, args) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const n = Number(args[0]);
  if (!Number.isFinite(n) || n < 1 || n > 100) return sock.sendMessage(chatId, { text: "❌ Use a number 1-100." }, { quoted: msg });
  const s = loadState(); s.config = s.config || {}; s.config.dailyLimit = Math.floor(n); saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Daily NPC limit set to *${Math.floor(n)}*.` }, { quoted: msg });
}

async function cmdArenaToggle(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const s = loadState(); s.config = s.config || {};
  s.config.arenaEnabled = !s.config.arenaEnabled; saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Arena is now *${s.config.arenaEnabled ? "🟢 OPEN" : "🔴 CLOSED"}*.` }, { quoted: msg });
}

async function cmdArenaSetAura(ctx, chatId, senderId, msg, args) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const n = Number(args[0]);
  if (!Number.isFinite(n) || n < 0) return sock.sendMessage(chatId, { text: "❌ Invalid value." }, { quoted: msg });
  const s = loadState(); s.config = s.config || {}; s.config.baseAuraRequired = Math.floor(n); saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Base Aura requirement set to *${Math.floor(n)}*.` }, { quoted: msg });
}

async function cmdArenaResetCounts(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const s = loadState(); s.dailyCounts = {}; saveState(s);
  return sock.sendMessage(chatId, { text: "✅ All daily NPC fight counts reset." }, { quoted: msg });
}

async function cmdArenaClearAll(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const s = loadState(); const n = Object.keys(s.battles||{}).length; s.battles = {}; saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Cleared *${n}* active Arena battle(s).` }, { quoted: msg });
}

async function cmdArenaClearPlayer(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const mentioned = helpers?.getMentionedJids?.(msg)?.[0] || helpers?.toUserJidFromArg?.(args[0]);
  if (!mentioned) return sock.sendMessage(chatId, { text: "❌ Tag the player: *.arena-clearplayer @user*" }, { quoted: msg });
  const s = loadState();
  Object.keys(s.battles||{}).forEach(k => { if (k.includes(mentioned)) delete s.battles[k]; });
  saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Arena battle cleared for that player.` }, { quoted: msg });
}

async function cmdArenaSetCrossBonus(ctx, chatId, senderId, msg, args) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const pct = Number(args[0]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 200) return sock.sendMessage(chatId, { text: "❌ Enter a percent 0-200.\nExample: *.arena-crossbonus 25* (means +25%)" }, { quoted: msg });
  const s = loadState(); s.config = s.config||{}; s.config.crossFactionBonus = pct / 100; saveState(s);
  return sock.sendMessage(chatId, { text: `✅ Cross-faction Aura bonus set to *+${pct}%*.` }, { quoted: msg });
}

async function cmdArenaStatus(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) return sock.sendMessage(chatId, { text: "❌ Owner-only." }, { quoted: msg });
  const s       = loadState();
  const cfg     = s.config || DEFAULT_CONFIG;
  const active  = Object.keys(s.battles||{}).length;
  const today   = Object.values(s.dailyCounts||{}).filter(e => e.date === todayKey()).length;
  const totalW  = Object.values(s.defeatedNpcs||{}).reduce((sum, map) => sum + Object.values(map).reduce((a,b)=>a+b,0), 0);

  return sock.sendMessage(chatId, {
    text:
      `${DIVIDER}\n` +
      `🏟️  *ARENA STATUS – ARCHITECT VIEW*\n` +
      `${DIVIDER}\n\n` +
      `🔵 Arena:             *${cfg.arenaEnabled ? "OPEN" : "CLOSED"}*\n` +
      `⚡ Base Aura req:     *${cfg.baseAuraRequired || 50}*\n` +
      `🎯 Daily limit:       *${cfg.dailyLimit || 4}* NPCs/player\n` +
      `⦿ Cross-faction +%:  *${Math.round((cfg.crossFactionBonus||0.25)*100)}%*\n` +
      `📻 Diminish floor:    *${Math.round((cfg.diminishFloor||0.20)*100)}%*\n\n` +
      `⚔️ Active battles:    *${active}*\n` +
      `🔥 Fighters today:    *${today}*\n` +
      `🏅 Total NPC wins:    *${totalW}*\n\n` +
      `${THIN_DIV}\n` +
      `*Owner Commands:*\n` +
      `• *.arena-setlimit <n>*      – daily fight cap\n` +
      `• *.arena-setaura <n>*       – base aura gate\n` +
      `• *.arena-crossbonus <pct>*  – cross-faction % bonus\n` +
      `• *.arena-toggle*            – open/close arena\n` +
      `• *.arena-resetcounts*       – wipe daily counts\n` +
      `• *.arena-clearall*          – clear all stuck battles\n` +
      `• *.arena-clearplayer @user* – clear one player\n` +
      `• *.addarenagroup*           – add this group as arena\n` +
      `• *.removearenagroup*        – remove this group\n` +
      `• *.arenagroups*             – list arena groups\n` +
      `${DIVIDER}`,
  }, { quoted: msg });
}

// ════════════════════════════════════════════════════════════
// SECTION 23 – UTILITY
// ════════════════════════════════════════════════════════════
function hasActiveArenaBattle(chatId, playerId) {
  const s = loadState();
  return !!getBattle(s, chatId, playerId);
}

// ════════════════════════════════════════════════════════════
// SECTION 24 – EXPORTS
// ════════════════════════════════════════════════════════════
module.exports = {
  // Player commands
  cmdArena,
  cmdChallenge,
  cmdNpcChallenge,
  cmdNpcAttack,
  cmdNpcSwitch,
  cmdArenaFlee,
  cmdIntel,

  // Owner commands
  cmdArenaSetLimit,
  cmdArenaToggle,
  cmdArenaSetAura,
  cmdArenaResetCounts,
  cmdArenaClearAll,
  cmdArenaClearPlayer,
  cmdArenaSetCrossBonus,
  cmdArenaStatus,

  // Utility
  hasActiveArenaBattle,

  // Constants
  TIERS,
  NPC_CHARACTERS,
};

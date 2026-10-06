// ╔═══════════════════════════════════════════════════════════════╗
// ║  THE HOLLOWING — Lumora's first seasonal world event            ║
// ║  A four-chapter, time-gated story that runs Oct 5 → Nov 1,      ║
// ║  building to the Halloween finale (the Veil breaks).            ║
// ║                                                                 ║
// ║  Design rules (do not break these):                             ║
// ║   • The whole event is behind ONE config flag. Untangling is a   ║
// ║     delete of data/hollowing_config.json + the loop start.       ║
// ║   • Nothing here hard-deletes game data. Mora go "missing",      ║
// ║     never away.                                                  ║
// ║   • All player-facing text is authored in CONFIG so Prime can    ║
// ║     tune the story without touching code.                        ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const buttonsSystem = require("./buttons");

const DATA_DIR    = path.join(__dirname, "..", "data");
const CONFIG_FILE = path.join(DATA_DIR, "hollowing_config.json");
const STATE_FILE  = path.join(DATA_DIR, "hollowing.json");
const DAY_MS      = 24 * 60 * 60 * 1000;

// Mutable paths so tests can redirect state/config into a temp dir without
// touching data/. Mirrors systems/chess.js configure({ dir }).
let PATHS = { config: CONFIG_FILE, state: STATE_FILE };
function configure(opts = {}) {
  if (opts && opts.dir) {
    PATHS = {
      config: path.join(opts.dir, "hollowing_config.json"),
      state:  path.join(opts.dir, "hollowing.json"),
    };
  }
  if (opts && opts.configFile) PATHS.config = opts.configFile;
  if (opts && opts.stateFile)  PATHS.state  = opts.stateFile;
  return { ...PATHS };
}
function resetPaths() { PATHS = { config: CONFIG_FILE, state: STATE_FILE }; return { ...PATHS }; }
const HOUR_MS     = 60 * 60 * 1000;
const CAT_OFFSET_MS = 2 * HOUR_MS; // Aetherfall runs on CAT (UTC+2)

// ── file helpers (never throw) ──────────────────────────────────
function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function saveJSON(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.log("[hollowing] save failed:", e?.message || e);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// CANON — the story. This block is the single source of truth for
// what players are told and when. Mirrors events/the-hollowing.md.
// ══════════════════════════════════════════════════════════════
const DEFAULT_CONFIG = {
  enabled: false,                 // ← Prime flips this to true to go live
  id: "the-hollowing",
  title: "THE HOLLOWING",
  era: "Lumora: Awakening",
  // The Veil breaks on Halloween night. Chapters hang off this anchor via
  // offsetDays (negative = before the finale), so re-basing the event is a
  // one-line change instead of a code rewrite.
  startDate: "2026-10-25T18:00:00Z",
  endDate:   "2026-11-01T03:00:00Z",
  // ── STORY CADENCE ──
  // The 15-min tick is only a poll. `minBeatSpacingHours` is what makes the
  // mystery unfold over DAYS: the chapter headline lands alone, resets the
  // spacing clock, and the clues follow hours apart. Never a burst.
  maxBeatsPerTick: 1,
  minBeatSpacingHours: 4,

  // THE OPENING PING. Fires exactly once, on the very first live tick after the
  // bot comes online, with hidden mentions — this is how everyone is told the
  // event has begun. It also absorbs the Chapter I headline so nobody gets two
  // messages at once.
  opening: {
    text:
      "🚨 *THE HOLLOWING HAS BEGUN*\n\n" +
      "Aetherfall — something is wrong.\n\n" +
      "The Mora are restless. Black crystals are surfacing in caves that were empty last week, " +
      "and a hunter came back without his Mora's shadow.\n\n" +
      "_Nobody has an explanation yet._\n\n" +
      "📖 *Chapter I — The Strange Signs* is live.\n" +
      "• *.hollowing* — the story so far\n" +
      "• *.investigate* — go and look\n\n" +
      "_The Hollowing runs until Halloween._",
  },

  // Three layers of delivery (see "Three Layers" in the event doc):
  //   audience "world"    → broadcast to the community groups (major discoveries)
  //   audience "story"    → chronicle only; players read it in .hollowing
  //   audience "personal" → DM to players who are engaged with the event
  // Leaving `audience` off means "world".

  // Hunt Energy modifiers while the event is live. Rebased on the real
  // system: regen is +50%/6h and drain is per-travel energyCost.
  eventModifiers: {
    huntEnergyRegenMultiplier: 2.0,
    huntEnergyDrainMultiplier: 0.5,
    huntEnergyActiveRefillIntervalMs: 180000, // 3 min while the event is live
    huntEnergyActiveRefillAmount: 50,
  },

  // TEMPORARY cooldown on the investigation command — short per-player throttle
  // so the rewarding paths cannot be spammed. Default 1 minute.
  investigationCooldownMs: 60000,
  // Backlash layer — punished too-fast or too-frequent investigation.
  // While the event is live, spamming investigations is punished hard:
  // every resolve inside the soft window costs aura/HP, and a few fast
  // resolves in a row trigger a hard lockout + a big backlash strike.
  investigationBacklashCoolMs: 0,       // ramp starts immediately after a resolve
  investigationBacklashMaxScares: 2,    // lockout after this many fast resolves
  investigationBacklashLockMs: 600000,  // 10-minute hard lock once ramp threshold hit
  investigationBacklashAura: 30,        // aura taken on a backlash strike
  investigationBacklashHp: 15,          // HP taken on a backlash strike
  investigationBacklashStrikeShards: 1, // random shard lost on a backlash strike
  investigationBacklashScareShards: 0,  // shards lost on a near-miss scare (0 = off)

  // TEMPORARY "burst" — while true, every hunter's gauge is topped to max
  // (on each command and on each world tick). A gift to the island while the
  // Hollowing runs; flip to false in data/hollowing_config.json to restore
  // normal regen/drain. Not tied to isActive(), so it can stand alone.
  huntEnergyBurst: true,

  chapters: [
    {
      id: "signs", number: 1, roman: "I",
      name: "The Strange Signs",
      offsetDays: -21,   // Oct 4 — already live on first boot
      intro: "Something is wrong.",
      story: [
        "Mora are growing restless. Hunters returning from the wilds say the animals are stronger than they should be.",
        "Black crystals have been found in caves that were empty last week.",
        "The bartender in the Capital swears a hunter came back without his Mora's shadow.",
      ],
      gameplay: [
        "Hunt Energy surges island-wide — the Mora are unnaturally active.",
        "Strange crystals begin appearing in hunting zones.",
      ],
      rewards: ["LUCONS", "XP", "Title: Veilwatcher"],
    },
    {
      id: "hollow", number: 2, roman: "II",
      name: "The Hunt for the Hollow",
      offsetDays: -14,   // Oct 11
      intro: "Preparation becomes survival.",
      story: [
        "A new kind of Mora has appeared — familiar species twisted by an unknown corruption.",
        "Their eyes glow violet. Their attacks leave shadows that linger after they die.",
        "And something has started speaking to hunters. Privately. At night.",
      ],
      gameplay: [
        "Hollow Mora appear in designated hunting zones.",
        "Rift Fragments, Hollow Essence and Ancient Seals begin dropping.",
        "The Aetherfall Bazaar opens a temporary event merchant.",
        "Some hunters begin receiving temptations they should not answer.",
      ],
      rewards: ["Hollow Hunter cosmetics", "Rift Ward", "Greater Healing Capsule"],
    },
    {
      id: "veil", number: 3, roman: "III",
      name: "The Night of the Broken Veil",
      offsetDays: -7,    // Oct 18
      intro: "The island prepares for disaster.",
      story: [
        "The archive surfaces an old warning: when the shadows detach from their masters, do not follow them into the dark.",
        "Shadow Echoes stalk the zones — hostile things wearing the shapes of Mora we know.",
        "And the Mora are disappearing. Not dying. Disappearing.",
      ],
      gameplay: [
        "Shadow Echoes emerge — faster, stranger, harder to purify.",
        "Seven Seals Before Midnight — the final preparation questline unlocks.",
        "Several Mora species vanish from the active wilds.",
      ],
      rewards: ["Ancient Seals", "Event equipment", "Title: Rift Survivor"],
    },
    {
      id: "hollowing", number: 4, roman: "IV",
      name: "THE HOLLOWING",
      offsetDays: 0,     // Oct 25 — the Veil breaks
      intro: "When the Veil breaks.",
      story: [
        "The sky over Aetherfall turns crimson. The protective crystal flickers.",
        "An unidentified entity has breached the outer boundary of the Primordial Rift.",
        "Beneath the island, a door that was never meant to open is opening.",
      ],
      gameplay: [
        "Corruption outbreaks erupt across hunting zones.",
        "The Haunted Dungeon opens: Forsaken Passage → Chamber of Echoes → Blackened Throne.",
        "The Hollow King stirs.",
      ],
      rewards: ["Title: Crownbreaker", "Blackened Crown Fragment", "Crimson Veil aura"],
    },
  ],

  // ── STORY BEATS ──
  // The heartbeat of the event. Each beat fires once, `offsetHours` after its
  // chapter unlocks, and is broadcast to the community groups. This is how
  // "something happens every few hours" without spamming: every beat has a
  // unique id and a single fire, persisted in data/hollowing.json.
  beats: [
    { id: "b-signs-1", chapterId: "signs", offsetHours: 0,
      kind: "broadcast",
      text: "🌑 *Hunters are coming back from the wilds saying the same thing.*\n\nThe Mora are stronger than they should be.\n\nNobody has an explanation.\n\n_The moor is full of places nobody has gone to look at yet_ — *.investigate*." },
    { id: "b-signs-2", chapterId: "signs", offsetHours: 6,
      kind: "broadcast", audience: "story",
      text: "🕯️ *A hunter's log, recovered near the Capital*\n\n\"Found black crystals in a cave that was empty last week. Touched one. It was cold. _It hummed._\n\nI'm going back out at dawn.\"" },
    { id: "b-signs-3", chapterId: "signs", offsetHours: 15,
      kind: "broadcast",
      text: "🍺 *The Tavern, Capital*\n\nThe bartender is quieter than usual.\n\n\"A hunter came back yesterday. Fine. Healthy. But his Mora... had no shadow. I asked him twice. He said it was nothing.\"\n\n_It was not nothing._" },
    { id: "b-signs-4", chapterId: "signs", offsetHours: 30,
      kind: "broadcast", audience: "story",
      text: "📜 *ARCHIVE FRAGMENT #1*\n\n\"When the veil grows thin, what was buried shall remember its name.\"\n\n_— author unknown, pre-Awakening_." },
    // Late Chapter I — keeps the week between chapters alive without spamming.
    { id: "b-signs-5", chapterId: "signs", offsetHours: 72,
      kind: "broadcast", audience: "story",
      text: "🕯️ *A hunter's log, day three*\n\n\"The tavern is locking up early now. Nobody says why.\n\nThree hunters have not come back from the northern moor. Nobody is filing reports.\"" },
    { id: "b-signs-6", chapterId: "signs", offsetHours: 120,
      kind: "broadcast",
      text: "🌒 *A quiet week, and then not.*\n\nNothing has happened for days. That is its own kind of warning.\n\n_The moor is full of places nobody has gone to look at yet_ — *.investigate*." },
    { id: "b-signs-7", chapterId: "signs", offsetHours: 168,
      kind: "broadcast", audience: "story",
      text: "📜 *ARCHIVE FRAGMENT #2*\n\nThe oldest record in the archive does not describe the Rift opening.\n\nIt describes something being *carried through it*." },

    { id: "b-hollow-1", chapterId: "hollow", offsetHours: 0,
      kind: "broadcast",
      text: "🌑 *THE HOLLOWING — CHAPTER II: THE HUNT FOR THE HOLLOW*\n\nThey are not new species.\n\nThey are *our* Mora. Something has reached into them.\n\nA Thornel whose leaves have turned black. Eyes that glow violet. Attacks that leave shadows behind when the body falls.\n\n*Hunt them. And do not trust the dark.*" },
    { id: "b-hollow-2", chapterId: "hollow", offsetHours: 4,
      kind: "broadcast",
      text: "⚡ *A surge in the wilds*\n\nThe Mora are unusually active — and that restlessness is bleeding into our hunters.\n\nHunt Energy regenerates *twice as fast* while this lasts." },
    { id: "b-hollow-3", chapterId: "hollow", offsetHours: 12,
      kind: "broadcast", audience: "story",
      text: "💰 *The Aetherfall Bazaar*\n\nA temporary merchant has arrived in the Capital.\n\nRift Wards. Greater Healing Capsules. A Lantern of Aether. Sealed caches.\n\n_She will not say where she came from._" },

    // Chapter III's first beat is the disappearance announcement — the lore
    // reason for a smaller, more recognizable Mora roster.
    { id: "b-veil-1", chapterId: "veil", offsetHours: 0,
      kind: "broadcast",
      text: "⚠️ *FIELD REPORT*\n\nSeveral Mora species have vanished from their known habitats.\n\nHunters are reporting that certain species can no longer be found anywhere on Aetherfall.\n\nResearchers initially believed this was migration.\n\n_They were wrong._" },
    { id: "b-veil-2", chapterId: "veil", offsetHours: 5,
      kind: "broadcast", audience: "story",
      text: "📜 *ARCHIVE FRAGMENT #7 — the old warning*\n\n\"When the shadows detach from their masters, do not follow them into the dark.\"\n\n_Someone added a line beneath it, in fresh ink:_\n\n\"They are already detaching.\"" },
    { id: "b-veil-3", chapterId: "veil", offsetHours: 18,
      kind: "broadcast",
      text: "👁️ *Shadow Echoes sighted*\n\nHunters describe creatures wearing the shapes of Mora we know — but faster, stranger, and resistant to the harm that should end them.\n\n_These are not the Mora. These are echoes of them._" },
    { id: "b-veil-4", chapterId: "veil", offsetHours: 40,
      kind: "broadcast",
      text: "🔒 *SEVEN SEALS BEFORE MIDNIGHT*\n\nThe final preparation has begun.\n\nCollect the Ancient Seals. Complete the trials. Only then will the door beneath the island open to you." },

    { id: "b-hollowing-1", chapterId: "hollowing", offsetHours: 0,
      kind: "broadcast",
      text: "🚨 *AETHERFALL EMERGENCY NOTICE*\n\nAn unidentified entity has breached the outer boundary of the Primordial Rift.\n\nAll hunters are advised to return to Aetherfall.\n\nThe capital's protective barrier is weakening.\n\n_This is not a drill._" },
    { id: "b-hollowing-2", chapterId: "hollowing", offsetHours: 8,
      kind: "broadcast",
      text: "👑 *THE HOLLOW KING STIRS*\n\nBeneath the island, past the Forsaken Passage and the Chamber of Echoes, something on the Blackened Throne has opened its eyes.\n\nThe dungeon is open. _Go carefully._" },
    { id: "b-hollowing-3", chapterId: "hollowing", offsetHours: 20,
      kind: "broadcast",
      text: "🤝 *THE HOLLOW MUSTER*\n\nA wave is coming and one hunter cannot hold the line.\n\nStand with your group — everyone who answers is rewarded.\n\n_Call it with_ *.muster*." },
    { id: "b-hollow-4", chapterId: "hollow", offsetHours: 26,
      kind: "broadcast",
      text: "🌑 *A path opens for those who look.*\n\nThe moor is full of places nobody has gone to look at yet. Crystals that hum. Cottages with the door left open.\n\n_Go and see_ — *.investigate*." },

    // ── PERSONAL beats (DMs, only to engaged players) ──
    { id: "p-tempt-1", chapterId: "hollow", offsetHours: 10, audience: "personal",
      kind: "broadcast",
      text: "👤 *UNKNOWN TRANSMISSION*\n\nYou have been noticed.\n\nSomething out here knows your name, and it is patient.\n\n_It will wait until you are ready to listen._" },
    { id: "p-veil-1", chapterId: "veil", offsetHours: 8, audience: "personal",
      kind: "broadcast",
      text: "👤 *You feel it before you see it.*\n\nYour Mora has gone quiet. Not frightened — *listening*.\n\nSomething is calling, and it is calling the ones who are bonded." },
    { id: "p-hollowing-1", chapterId: "hollowing", offsetHours: 4, audience: "personal",
      kind: "broadcast",
      text: "👤 *IT IS OPEN.*\n\nYou woke up because something in the dark said your name politely.\n\nWhatever is on the other side of the door knows you have been paying attention." },
  ],

  // ── LIMITED TASKS ──
  // First N players to complete each task are written into the world chronicle
  // (state.world.chronicle) and referenced by name in later broadcasts.
  limitedTasks: [
    { id: "first-witness", chapterId: "signs", name: "The First Witness", slots: 1,
      prompt: "Be the first to report a strange sign to the Capital.",
      lore: "{name} was the first to see it — and the first to be believed." },
    { id: "seal-keeper", chapterId: "veil", name: "Keeper of the Seventh Seal", slots: 1,
      prompt: "Recover the seventh Ancient Seal before midnight.",
      lore: "{name} carried the seventh seal through the dark, and set it in the door." },
    { id: "crown-touched", chapterId: "hollowing", name: "The One Who Touched the Crown", slots: 1,
      prompt: "Lay a hand on the Blackened Crown Fragment.",
      lore: "{name} touched the Broken Crown — and heard what is waiting behind it." },
  ],

  // ── RISK ──
  // Investigating is a GAMBLE. Losses are rolled from a range, and a
  // devastating path can go catastrophically wrong on top of that — which is
  // where the real damage lands. Rewards stay predictable; the COST does not.
  risk: {
    enabled: true,
    catastropheChance: 0.30,   // per devastating choice
    multiplier: 2.25,          // applied to lucons / aura / hp / shards when it bites
    line: "💀 *It goes badly wrong.*",
  },

  // ── STORY TREE ──
  // Branching, button-driven tales. Not every story — a handful of forking
  // paths whose choices can be LUCKY, DEVASTATING, or REVEALING, and which can
  // complete the limited tasks above. Each choice routes to a fixed verb command
  // (.hollow-investigate); the player's stored node decides what that verb means.
  storyTree: {
    entry: "signs-crystal",
    nodes: {
      // ── Chapter I ──
      "signs-crystal": {
        chapterId: "signs",
        title: "The Black Crystals",
        text: "A cave mouth exhales cold air. Three black crystals grow from the floor like teeth, and one of them is humming — a low note you feel in your jaw.",
        choices: [
          { verb: "investigate", label: "🔍 Step into the hollow", outcome: "lucky",
            line: "The cold takes your breath, then leaves something behind.",
            gain: { lucons: 350, aura: 8, fragments: 1 }, next: "signs-hollow" },
          { verb: "take", label: "🎒 Pry one loose", outcome: "devastating",
            line: "It comes free with a sound like a bone unsetting. Something notices you take it.",
            loss: { lucons: [400, 1200], aura: [10, 35], hp: [10, 40], shards: 1 },
            progress: "crystalsTaken", end: true },
          { verb: "retreat", label: "🏃 Back away slowly", outcome: "reveal",
            line: "You leave it humming. On the cave wall, scratched low, three words: _THEY ARE LEAVING._",
            reveal: "frag-1", end: true },
        ],
      },
      "signs-hollow": {
        chapterId: "signs",
        title: "The Humming Dark",
        text: "Past the crystals the cave narrows. The humming is louder here, and underneath it — very faintly — something is breathing in time with you.",
        choices: [
          { verb: "light", label: "🕯️ Light a lantern", outcome: "reveal",
            line: "Light reveals claw-marks on the ceiling, all pointing the same way: inward.",
            reveal: "frag-2", gain: { fragments: 1 }, end: true },
          { verb: "follow", label: "👁️ Follow the breathing", outcome: "devastating",
            line: "You follow it for an hour. It follows you back for two.",
            loss: { lucons: [600, 1800], aura: [15, 40], hp: [20, 50], shards: 1 }, end: true },
          { verb: "watch", label: "👁️ Watch and wait", outcome: "lucky",
            line: "Patience pays. Whatever it is, it decides you are not worth the trouble — and leaves a cache behind.",
            gain: { lucons: 500, essence: 2 }, end: true },
        ],
      },

      // ── Chapter II ──
      "hollow-whisper": {
        chapterId: "hollow",
        title: "A Voice at the Treeline",
        text: "Something calls your name from the black trees. It uses your name correctly. It uses it like it has been practising.",
        choices: [
          { verb: "investigate", label: "🔍 Answer it", outcome: "task",
            line: "You step to the treeline and it goes quiet — but not gone.",
            task: "first-witness", next: "hollow-whisper-deal" },
          { verb: "confront", label: "⚔️ Challenge it", outcome: "devastating",
            line: "The trees repeat your challenge back in a voice that is almost yours.",
            loss: { lucons: [450, 1400], aura: [20, 50], hp: [15, 40], shards: 1 }, end: true },
          { verb: "retreat", label: "🏃 Walk away", outcome: "reveal",
            line: "You walk. It lets you. That is somehow worse.",
            reveal: "frag-3", end: true },
        ],
      },
      "hollow-whisper-deal": {
        chapterId: "hollow",
        title: "UNKNOWN TRANSMISSION",
        text: "You have become stronger.\nBut you could become *much* stronger.\nTake what is being offered.\n_Nobody has to know._",
        choices: [
          { verb: "take", label: "🤝 Take it", outcome: "lucky", temptation: true,
            line: "Warmth pours in. Something behind your ribs makes room for it.",
            gain: { lucons: 900, essence: 3, fragments: 2 }, end: true },
          { verb: "retreat", label: "🛑 Refuse", outcome: "reveal", temptation: false,
            line: "You say no. The silence afterwards is long, and it is not empty.",
            reveal: "frag-4", gain: { aura: 10 }, end: true },
        ],
      },

      // ── Chapter III ──
      "veil-cottage": {
        chapterId: "veil",
        title: "The Empty Hunter's Cottage",
        text: "A door stands open on the moor. Inside: a cold hearth, a packed bag, and no hunter. His Mora's collar is on the table, unbuckled from the inside.",
        choices: [
          { verb: "investigate", label: "🔍 Read the logbook", outcome: "reveal",
            line: "The last entry is in a steady hand. It does not sound like a man who was taken.",
            reveal: "frag-5", gain: { fragments: 1 }, next: "veil-echo" },
          { verb: "take", label: "🎒 Take the cache", outcome: "lucky",
            line: "Under the floorboards, a hunter's stash — untouched, and now yours.",
            gain: { lucons: 700, essence: 3, seals: 1 }, end: true },
          { verb: "follow", label: "🌑 Follow the trail", outcome: "devastating",
            line: "The trail leads into the dark and then stops being a trail at all.",
            loss: { aura: [25, 60], hp: [25, 60], lucons: [500, 1500], shards: 1 }, end: true },
        ],
      },
      "veil-echo": {
        chapterId: "veil",
        title: "Shadow Echo",
        text: "It wears the shape of a Mora you have seen a hundred times. It moves wrong — too smooth, too fast, and it leaves no prints.",
        choices: [
          { verb: "confront", label: "⚔️ Strike it", outcome: "devastating",
            line: "It comes apart like smoke and reassembles behind you. You learn something on the way down.",
            loss: { hp: [30, 70], lucons: [400, 1600], shards: 1 }, reveal: "frag-6", end: true },
          { verb: "watch", label: "👁️ Study it", outcome: "task",
            line: "You watch longer than is wise and learn exactly what it is not.",
            task: "seal-keeper", gain: { seals: 1 }, end: true },
          { verb: "retreat", label: "🏃 Withdraw", outcome: "lucky",
            line: "You make it back. Most who meet an Echo do not, and you know it.",
            gain: { aura: 6, essence: 1 }, end: true },
        ],
      },

      // ── Chapter IV ──
      "hollowing-door": {
        chapterId: "hollowing",
        title: "The Door Beneath the Island",
        text: "The Passage ends at a door too large to have been built. It is warm. Something on the far side is leaning against it.",
        choices: [
          { verb: "light", label: "🕯️ Raise a light", outcome: "reveal",
            line: "The wards are old, and someone has been renewing them — recently.",
            reveal: "frag-7", next: "hollowing-crown" },
          { verb: "confront", label: "⚔️ Set your hand to it", outcome: "task",
            line: "The door remembers your hand.",
            task: "crown-touched", gain: { seals: 1 }, next: "hollowing-crown" },
          { verb: "retreat", label: "🏃 Turn back", outcome: "neutral",
            line: "You leave it shut. It does not mind being patient.", end: true },
        ],
      },
      "hollowing-crown": {
        chapterId: "hollowing",
        title: "The Blackened Crown",
        text: "A fractured crown floats above a throne that was never meant to hold a body. It turns, slowly, to face you — and then it speaks, and it is *tired*.",
        choices: [
          { verb: "watch", label: "👁️ Listen to it", outcome: "devastating",
            line: "It tells you what it has been guarding, and why it cannot leave. You will not sleep well again — but you know now.",
            loss: { aura: [20, 45], lucons: [300, 900], shards: 1 }, reveal: "frag-8", end: true },
          { verb: "confront", label: "⚔️ Take the Fragment", outcome: "lucky",
            line: "The Fragment comes away in your hand, cold and patient. Somewhere behind the door, something exhales.",
            gain: { lucons: 1200, seals: 2, aura: 15 }, end: true },
          { verb: "retreat", label: "🏃 Kneel and withdraw", outcome: "neutral",
            line: "You bow, because it feels right, and back out of the throne room.", end: true },
        ],
      },
    },
    // Revealed fragments — the pieces of the mystery players assemble themselves.
    fragments: {
      "frag-1": { title: "THEY ARE LEAVING", text: "Scratched into the cave wall, low, by someone kneeling: the Mora are not being killed. They are leaving — or being led." },
      "frag-2": { title: "THE CLAW-MARKS", text: "Every claw-mark in the deep cave points the same way: inward. Toward the Rift. Something called them home." },
      "frag-3": { title: "THE VOICE THAT WAITS", text: "It knew your name. It has been practising. The archive's oldest rule: do not answer the second time." },
      "frag-4": { title: "THE REFUSAL", text: "Those who refused the offer were not punished. They were *catalogued*." },
      "frag-5": { title: "THE HUNTER'S LAST ENTRY", text: "'I am going willingly. Do not follow. It is not taking us — it is *calling* us, and we are answering.'" },
      "frag-6": { title: "NOT THE MORA", text: "A Shadow Echo is not a corrupted Mora. It is a shape left behind. The Mora itself is somewhere else — and still alive." },
      "frag-7": { title: "THE RENEWED WARD", text: "The wards on the door are ancient, but someone has been renewing them for centuries. Someone has been keeping something IN." },
      "frag-8": { title: "WHAT IT GUARDS", text: "The Hollow King was not escaping the Rift. It was standing on the threshold. Something else was trying to come out — and it is still trying." },
    },
  },

  // ── THE HOLLOW MUSTER ──
  // A group mechanic: the whole group throws its strength at one encounter in a
  // shared window. Hit the threshold and everyone who answered is rewarded. Fall
  // short and the island takes the damage instead. No solo player can carry it.
  muster: {
    enabled: true,
    threshold: 8,        // contributions needed to hold
    windowHours: 6,
    reward: { lucons: 450, aura: 12, essence: 1 },
    holdLine: "🛡️ *THE MUSTER HOLDS.*\n\nFor one night the dark gives ground. The barrier steadies.",
    failLine: "🩸 *THE MUSTER BREAKS.*\n\nThe dark takes what it is owed. The island remembers.",
    call: "🤝 *THE HOLLOW MUSTER*\n\nA wave is coming and one hunter cannot hold the line.\n\nStand with your group — everyone who answers is rewarded.\n\n_Call it with_ *.muster*.",
  },

  // ── HOLLOW MORA ──
  // Familiar species twisted by an unknown corruption. Not a new creature and
  // not a new system: a Hollow spawn reuses the existing corrupted battle paths
  // (`isCorrupted`), so the AI, catch odds and mission hooks all still apply.
  // Only the flavour, the stat curve and the residue drops are ours.
  hollow: {
    enabled: true,
    chance: 0.22,                 // per wild spawn, once Chapter II is open
    namePrefix: "Hollow",
    statMultiplier: { hp: 1.30, atk: 1.40, def: 1.15, spd: 1.25, energy: 1.20 },
    // The signature: attacks leave a shadow that lingers after the body falls.
    rider: {
      id: "lingering_shadow",
      label: "Lingering Shadow",
      desc: "Its attacks leave a shadow behind that lingers after the body falls.",
    },
    intro: [
      "It moves wrong — too smooth, too fast, and its eyes glow violet.",
      "Its leaves have turned black. Where it steps, the grass stays dead.",
      "It wears a shape you know, but nothing behind the eyes recognises you.",
      "The shadows around it are a half-second late, and they do not match its body.",
    ],
    // What a Hollow Mora leaves behind when it falls.
    drops: {
      riftFragments: { chance: 0.85, min: 1, max: 3 },
      hollowEssence: { chance: 0.55, min: 1, max: 2 },
      ancientSeals:  { chance: 0.12, min: 1, max: 1 },
    },
    residueHeader: "🌑 *HOLLOW RESIDUE*",
    emptyLine: "🌑 _The shadow dissolves without leaving anything behind._",
  },

  // ── GLOBAL PROGRESS BAR ──
  // Preparation affects the ending. Milestones broadcast when reached.
  milestones: [
    { id: "m1", name: "The Barrier Holds", threshold: 500,  text: "🛡️ *MILESTONE I — THE BARRIER HOLDS*\n\nAetherfall's protective barrier stabilizes. The capital breathes." },
    { id: "m2", name: "The Crown Cracks", threshold: 1500, text: "⚔️ *MILESTONE II — THE CROWN CRACKS*\n\nThe Hollow King's defences weaken. Every seal, every hunt, every faction objective counts." },
    { id: "m3", name: "The Capital Survives", threshold: 3000, text: "🏛️ *MILESTONE III — THE CAPITAL SURVIVES*\n\nIf the island endures Halloween, it will be because of this." },
  ],

  // ── MORA CHANGES ──
  // Flavour shown when a hunting zone has gone quiet because its species are
  // missing. Not an error — an atmosphere. "Mora unavailable" would be a bug
  // report; this is a haunted wood.
  noTrace: {
    line: "🌑 *No trace found.*\n\n_The hunting grounds are strangely quiet. Whatever normally lives here isn't here anymore._",
  },

  // Mora that go missing from the active wilds during Chapter III. Populated by
  // scripts/hollowing_mora_audit.js after checking player inventories. Never
  // deleted: data/mora.json keeps the record, spawning just skips them.
  moraMissing: [],
};

function loadConfig() {
  const over = loadJSON(PATHS.config, null);
  if (!over || typeof over !== "object") return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  // shallow-merge top level, replace arrays wholesale when provided
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue;
    cfg[k] = v;
  }
  cfg.eventModifiers = { ...DEFAULT_CONFIG.eventModifiers, ...(over.eventModifiers || {}) };
  return cfg;
}
function saveConfig(cfg) { return saveJSON(PATHS.config, cfg); }

const EMPTY_STATE = { announcedBeats: {}, announcedChapters: {}, milestones: {}, world: { progress: {}, chronicle: [] }, tasks: {}, choices: {} };
function loadState()  { return { ...JSON.parse(JSON.stringify(EMPTY_STATE)), ...loadJSON(PATHS.state, {}) }; }
function saveState(st) { return saveJSON(PATHS.state, st); }

// ══════════════════════════════════════════════════════════════
// TIME / PHASE (pure)
// ══════════════════════════════════════════════════════════════

function chapterUnlockMs(config, chapter) {
  if (chapter && Number.isFinite(Number(chapter.offsetDays))) {
    const start = Date.parse(config.startDate);
    if (!Number.isFinite(start)) return null;
    return start + Number(chapter.offsetDays) * DAY_MS;
  }
  if (chapter && chapter.unlocksAt) {
    const t = Date.parse(chapter.unlocksAt);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function isEnabled(config = loadConfig()) { return config?.enabled === true; }

function isActive(config = loadConfig(), now = Date.now()) {
  if (!isEnabled(config)) return false;
  const start = Date.parse(config.startDate);
  const end   = Date.parse(config.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return now >= chapterUnlockMs(config, config.chapters[0]) && now < end;
}

// The most recently unlocked chapter, or null before the event begins.
function activeChapter(config = loadConfig(), now = Date.now()) {
  if (!isEnabled(config)) return null;
  let current = null;
  for (const ch of config.chapters || []) {
    const t = chapterUnlockMs(config, ch);
    if (t != null && now >= t) current = ch;
  }
  return current;
}

// Full chapter ladder with lock state — used by the .hollowing card.
function chapterLadder(config = loadConfig(), now = Date.now()) {
  return (config.chapters || []).map(ch => {
    const t = chapterUnlockMs(config, ch);
    return { ...ch, unlocksMs: t, unlocked: t != null && now >= t };
  });
}

// Beats whose time has arrived but which have not fired yet (oldest first).
function dueBeats(config = loadConfig(), state = loadState(), now = Date.now()) {
  const seen = state.announcedBeats || {};
  const out = [];
  for (const b of config.beats || []) {
    if (!b || !b.id || seen[b.id]) continue;
    const ch = (config.chapters || []).find(c => c.id === b.chapterId);
    const base = ch ? chapterUnlockMs(config, ch) : null;
    if (base == null) continue;
    const at = base + Number(b.offsetHours || 0) * HOUR_MS;
    if (now >= at) out.push({ ...b, firesAt: at });
  }
  return out.sort((a, b) => a.firesAt - b.firesAt);
}

// ══════════════════════════════════════════════════════════════
// HUNT ENERGY MODIFIERS (pure — consumed by systems/hunting.js)
// ══════════════════════════════════════════════════════════════
function huntEnergyMultipliers(config = loadConfig(), now = Date.now()) {
  if (!isActive(config, now)) return { regen: 1, drain: 1, active: false };
  const m = config.eventModifiers || {};
  const regen = Number(m.huntEnergyRegenMultiplier);
  const drain = Number(m.huntEnergyDrainMultiplier);
  return {
    regen: Number.isFinite(regen) && regen > 0 ? regen : 1,
    drain: Number.isFinite(drain) && drain > 0 ? drain : 1,
    active: true,
  };
}
// Round DOWN the cost so the discount never costs more than intended.
function applyRegenModifier(amount, mults) { return Math.round(Number(amount || 0) * (mults?.regen ?? 1)); }
function applyDrainModifier(cost, mults)   { return Math.max(0, Math.floor(Number(cost || 0) * (mults?.drain ?? 1))); }

// Active cadence only: a fast refill while the event is live, independent of
// the blunt burst toggle (which tops everyone to max). Off event → no effect.
function huntEnergyActiveRecharge(config = loadConfig(), now = Date.now()) {
  if (!isActive(config, now)) return null;
  const m = config.eventModifiers || {};
  const interval = Number(m.huntEnergyActiveRefillIntervalMs);
  const amount   = Number(m.huntEnergyActiveRefillAmount);
  if (!Number.isFinite(interval) || interval <= 0) return null;
  return {
    active: true,
    intervalMs: interval,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
  };
}

// Re-export a direct call for hunt.js to use without calling loadConfig again.
function huntEnergyActiveRechargeNow(now = Date.now()) {
  return huntEnergyActiveRecharge(loadConfig(), now);
}


// TEMPORARY burst mode: pure toggle, no time gating. Consumed by
// systems/hunting.js so every hunter's gauge sits at max while it is on.
function huntEnergyBurstEnabled(config = loadConfig()) { return config?.huntEnergyBurst === true; }
// Top a single player up. Returns true when the burst actually moved them.
function burstHuntEnergy(player) {
  if (!player || typeof player !== "object") return false;
  const maxE = Number(player.maxHuntEnergy || 200);
  const before = Number(player.huntEnergy || 0);
  player.maxHuntEnergy = maxE;
  player.huntEnergy = maxE;
  player.lastHuntRefill = Date.now();
  return before < maxE;
}

// ══════════════════════════════════════════════════════════════
// MORA ACTIVITY (pure)
// ══════════════════════════════════════════════════════════════
// A Mora is available to spawn unless explicitly marked inactive/missing.
// The event never deletes a Mora — it only hides it from the wilds.
function isMoraAvailable(mora) {
  if (!mora) return false;
  if (mora.active === false) return false;
  if (mora.missing === true) return false;
  return true;
}
function filterAvailableMora(list) {
  return Array.isArray(list) ? list.filter(isMoraAvailable) : [];
}
// Names listed in the event config, for the "Missing Mora" archive.
function missingMoraNames(config = loadConfig()) {
  return (config.moraMissing || []).map(x => (typeof x === "string" ? x : x?.name)).filter(Boolean);
}
// Shown when a zone has gone quiet because its species are missing. Atmosphere,
// not an error message — see `noTrace` in the config.
function noTraceLine(config = loadConfig()) {
  return config?.noTrace?.line
    || "🌑 *No trace found.*\n\n_The hunting grounds are strangely quiet. Whatever normally lives here isn't here anymore._";
}

// ══════════════════════════════════════════════════════════════
// SHARED PROGRESS + LIMITED TASKS + CHOICES
// ══════════════════════════════════════════════════════════════
function recordProgress(state, key, amount = 1) {
  if (!state.world) state.world = { progress: {}, chronicle: [] };
  if (!state.world.progress) state.world.progress = {};
  const k = String(key || "").trim();
  if (!k) return state.world.progress;
  state.world.progress[k] = Number(state.world.progress[k] || 0) + Number(amount || 0);
  return state.world.progress;
}
function totalProgress(state) {
  const p = (state?.world?.progress) || {};
  return Object.values(p).reduce((a, n) => a + Number(n || 0), 0);
}
// Milestones reached by `total` but not yet announced.
function dueMilestones(config = loadConfig(), state = loadState()) {
  const total = totalProgress(state);
  const done = state.milestones || {};
  return (config.milestones || []).filter(m => !done[m.id] && total >= Number(m.threshold || 0));
}

// Claim a limited slot. Returns { ok, position } or { ok:false, reason }.
function claimLimitedTask(state, taskId, playerId, playerName) {
  if (!state.tasks) state.tasks = {};
  const id = String(taskId || "");
  if (!id) return { ok: false, reason: "no-task" };
  const rec = state.tasks[id] || { claims: [] };
  const already = rec.claims.some(c => String(c.playerId) === String(playerId));
  if (already) return { ok: false, reason: "already-claimed" };
  const task = (DEFAULT_CONFIG.limitedTasks || []).find(t => t.id === id);
  const slots = task ? Number(task.slots || 1) : 1;
  if (rec.claims.length >= slots) return { ok: false, reason: "full" };
  rec.claims.push({ playerId, name: playerName || "A hunter", at: Date.now() });
  state.tasks[id] = rec;
  if (!state.world) state.world = { progress: {}, chronicle: [] };
  if (!Array.isArray(state.world.chronicle)) state.world.chronicle = [];
  state.world.chronicle.push({
    taskId: id, task: task ? task.name : id, playerId, name: playerName || "A hunter",
    at: Date.now(),
    lore: (task?.lore || "{name} answered the call.").replace(/\{name\}/g, playerName || "A hunter"),
  });
  return { ok: true, position: rec.claims.length, task };
}
function chronicleFor(state, taskId) {
  return ((state?.world?.chronicle) || []).find(e => e.taskId === taskId) || null;
}

// Lightweight per-player record of the event's moral choice. Stored on the
// player object (schema-less in Mongo), not here — this is the shape helper.
function ensureChoice(player) {
  if (!player || typeof player !== "object") return null;
  if (!player.eventChoices || typeof player.eventChoices !== "object") player.eventChoices = {};
  if (!player.eventChoices.hollowing || typeof player.eventChoices.hollowing !== "object") {
    player.eventChoices.hollowing = { temptationAccepted: false, temptationCount: 0 };
  }
  return player.eventChoices.hollowing;
}
function recordTemptation(player, accepted) {
  const rec = ensureChoice(player);
  if (!rec) return null;
  if (accepted) { rec.temptationAccepted = true; rec.temptationCount = Number(rec.temptationCount || 0) + 1; }
  return rec;
}

// ══════════════════════════════════════════════════════════════
// HOLLOW MORA — the Chapter II enemy
// ══════════════════════════════════════════════════════════════
function hollowConfig(config = loadConfig()) { return config?.hollow || {}; }

// Hollow Mora exist from Chapter II onward, and only while the event runs.
function hollowActive(config = loadConfig(), now = Date.now()) {
  if (!isActive(config, now)) return false;
  if (hollowConfig(config).enabled === false) return false;
  const order = (config.chapters || []).map(c => c.id);
  const idx = order.indexOf("hollow");
  const ch  = activeChapter(config, now);
  return ch ? idx < 0 || order.indexOf(ch.id) >= idx : false;
}

function shouldHollowSpawn(config = loadConfig(), now = Date.now(), rng = Math.random) {
  if (!hollowActive(config, now)) return false;
  const chance = Number(hollowConfig(config).chance);
  return rng() < (Number.isFinite(chance) ? chance : 0.22);
}

function hollowIntro(config = loadConfig(), rng = Math.random) {
  const pool = hollowConfig(config).intro;
  if (!Array.isArray(pool) || !pool.length) return "It glows violet, and it is not afraid of you.";
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

// Build a Hollow variant from any wild species. Marked `isCorrupted` on purpose
// so the existing wild-battle corruption paths (harder AI, 0.35 catch odds,
// corrupted mission hooks) all engage — we are not inventing a parallel system.
function buildHollowSpecies(baseSpecies, config = loadConfig()) {
  if (!baseSpecies) return null;
  const h = hollowConfig(config);
  const m = h.statMultiplier || {};
  const out = JSON.parse(JSON.stringify(baseSpecies));
  out.isHollow        = true;
  out.isCorrupted     = true;
  out.baseSpeciesId   = baseSpecies.id;
  out.originalName    = baseSpecies.name;
  out.name            = `${h.namePrefix || "Hollow"} ${baseSpecies.name}`;
  out.corruptedTitle  = "Hollow";
  out.hollowRider     = h.rider || null;
  const bs = out.baseStats || {};
  const mul = (v, k) => Math.max(1, Math.floor(Number(v || 1) * Number(m[k] || 1)));
  out.baseStats = {
    ...bs,
    hp:     mul(bs.hp, "hp"),
    atk:    mul(bs.atk, "atk"),
    def:    mul(bs.def, "def"),
    spd:    mul(bs.spd, "spd"),
    energy: mul(bs.energy, "energy"),
  };
  return out;
}

// Roll a Hollow Mora's residue. Deterministic when `rng` is injected (tests).
function rollHollowDrops(config = loadConfig(), rng = Math.random) {
  const rules = hollowConfig(config).drops || {};
  const out = { riftFragments: 0, hollowEssence: 0, ancientSeals: 0 };
  for (const key of Object.keys(out)) {
    const rule = rules[key];
    if (!rule) continue;
    if (rng() < Number(rule.chance || 0)) {
      const min = Number(rule.min ?? 1);
      const max = Number(rule.max ?? min);
      out[key] = min + Math.floor(rng() * Math.max(1, max - min + 1));
    }
  }
  return out;
}

// Add residue to the player's event resources. Returns display lines.
function grantHollowDrops(player, drops) {
  const res = resourcesOf(player);
  if (!res || !drops) return [];
  const lines = [];
  if (drops.riftFragments) { res.fragments += drops.riftFragments; lines.push(`🔷 *+${drops.riftFragments} Rift Fragment*`); }
  if (drops.hollowEssence) { res.essence   += drops.hollowEssence; lines.push(`🌫 *+${drops.hollowEssence} Hollow Essence*`); }
  if (drops.ancientSeals)  { res.seals      += drops.ancientSeals;  lines.push(`🔒 *+${drops.ancientSeals} Ancient Seal*`); }
  return lines;
}

// The line pushed into the wild-battle log when a Hollow Mora falls.
function hollowDefeatLog(player, drops, config = loadConfig()) {
  const lines = grantHollowDrops(player, drops);
  if (!lines.length) return hollowConfig(config).emptyLine || "🌑 _The shadow dissolves without leaving anything behind._";
  return `${hollowConfig(config).residueHeader || "🌑 *HOLLOW RESIDUE*"}\n${lines.join("\n")}`;
}

// Human-readable event resources, for .hollowing.
function hollowResourceSummary(player) {
  const r = resourcesOf(player);
  if (!r) return null;
  return `🔷 ${r.fragments} fragments · 🌫 ${r.essence} essence · 🔒 ${r.seals} seals`;
}

// ══════════════════════════════════════════════════════════════
// MESSAGE BUILDERS (pure)
// ══════════════════════════════════════════════════════════════
function formatCatStamp(ms = Date.now()) {
  const d = new Date(ms + CAT_OFFSET_MS);
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function formatCountdown(msLeft) {
  const s = Math.max(0, Math.floor(Number(msLeft || 0) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function chapterAnnouncement(chapter) {
  if (!chapter) return "";
  return `🌑 *THE HOLLOWING — CHAPTER ${chapter.roman}: ${chapter.name}*\n\n` +
    `_${chapter.intro}_\n\n` +
    (chapter.story || []).map(s => `• ${s}`).join("\n");
}
function milestoneAnnouncement(m, total) {
  if (!m) return "";
  return `${m.text}\n\n_World progress: ${total}_`;
}

// ══════════════════════════════════════════════════════════════
// SCHEDULER — announce chapters, story beats and milestones once each
// ══════════════════════════════════════════════════════════════
let loopTimer = null;
const TICK_MS = 15 * 60 * 1000; // check every 15 min; beats fire "every few hours"

async function collectMentions(sock, chatId, excludeJid) {
  // Reuse the proven hidden-mention collector from pingStatus, with a direct
  // groupMetadata fallback. Group metadata is often cold immediately after
  // boot, so a single empty result is retried once before we give up — the
  // opening ping MUST reach people.
  const attempt = async () => {
    try {
      const ping = require("./pingStatus");
      if (typeof ping.collectMentionJids === "function") {
        const jids = await ping.collectMentionJids(sock, chatId, { exclude: excludeJid });
        if (Array.isArray(jids) && jids.length) return jids;
      }
    } catch {}
    try {
      const meta = await sock.groupMetadata(chatId);
      const jids = (meta?.participants || []).map(p => p?.id || p).filter(Boolean);
      return jids.filter(j => j !== excludeJid);
    } catch {}
    return [];
  };
  let out = await attempt();
  if (!out.length) {
    await new Promise(r => setTimeout(r, 3000));
    out = await attempt();
  }
  return out;
}

async function broadcast(sock, groups, text, excludeJid) {
  const uniq = Array.from(new Set((groups || []).filter(Boolean)));
  for (const g of uniq) {
    try {
      let mentions = [];
      try { mentions = await collectMentions(sock, g, excludeJid); } catch { mentions = []; }
      const payload = mentions.length ? { text, mentions } : { text };
      await sock.sendMessage(g, payload);
    } catch (e) {
      console.log("[hollowing] broadcast failed:", e?.message || e);
    }
  }
}

// ── THREE LAYERS OF DELIVERY ──
//   world    → community groups  ("What is happening?")
//   story    → the chronicle, read in .hollowing ("What did I discover?")
//   personal → DM to engaged players ("What is trying to influence ME?")
const AUDIENCES = ["world", "story", "personal"];
function beatAudience(beat) {
  const a = String(beat?.audience || "world").toLowerCase();
  return AUDIENCES.includes(a) ? a : "world";
}
// Only people who have actually engaged with the event ever get a DM.
function engagedJids(players) {
  const out = [];
  for (const jid of Object.keys(players || {})) {
    if (players[jid]?.eventChoices?.hollowing) out.push(jid);
  }
  return out;
}
async function deliverPersonal(sock, players, text) {
  let sent = 0;
  for (const jid of engagedJids(players)) {
    try { await sock.sendMessage(jid, { text }); sent++; }
    catch { /* DMs fail on privacy settings — never fatal */ }
  }
  return sent;
}
// Every beat — broadcast or not — enters the chronicle, which is what makes
// .hollowing a readable, chronological story instead of a status card.
function appendChronicle(state, beat, now) {
  if (!Array.isArray(state.chronicle)) state.chronicle = [];
  state.chronicle.push({
    id: beat.id, chapterId: beat.chapterId, at: now,
    audience: beatAudience(beat), text: beat.text,
  });
  if (state.chronicle.length > 200) state.chronicle = state.chronicle.slice(-200);
  return state.chronicle;
}

async function tick(sock, groups, opts = {}) {
  const now     = Number(opts.now) || Date.now();
  const players = opts.players || global._lumoraPlayers || {};
  const config  = loadConfig();
  if (!isEnabled(config)) return { skipped: "disabled" };
  const state = loadState();
  const botJid = sock?.user?.id || null;   // never @ the bot itself
  let fired = 0, dms = 0;

  // 0) THE OPENING PING — once, on the first live tick. It brings the Chapter I
  //    headline forward into itself so the launch is a single clear ping.
  if (isActive(config, now) && !state.openedAt && config.opening?.text) {
    state.openedAt = now;
    state.lastBeatAt = now;
    const ch0 = activeChapter(config, now);
    if (ch0) {
      if (!state.announcedChapters) state.announcedChapters = {};
      state.announcedChapters[ch0.id] = now;
      appendChronicle(state, { id: `chapter-${ch0.id}`, chapterId: ch0.id, audience: "world", text: chapterAnnouncement(ch0) }, now);
    }
    await broadcast(sock, groups, config.opening.text, botJid);
    appendChronicle(state, { id: "opening", audience: "world", text: config.opening.text }, now);
    fired++;
  }

  // 1) New chapter headline (once per chapter). It lands ALONE and resets the
  //    spacing clock, so the first clue never shares its breath with it.
  const ch = activeChapter(config, now);
  if (ch && !(state.announcedChapters || {})[ch.id]) {
    if (!state.announcedChapters) state.announcedChapters = {};
    state.announcedChapters[ch.id] = now;
    state.lastBeatAt = now;
    await broadcast(sock, groups, chapterAnnouncement(ch), botJid);
    appendChronicle(state, { id: `chapter-${ch.id}`, chapterId: ch.id, audience: "world", text: chapterAnnouncement(ch) }, now);
    fired++;
  }

  // 2) Story beats — ONE per window, never closer than minBeatSpacingHours.
  //    The tick is a poll; THIS is the pacing. A backlog can never burst.
  const cap     = Number.isFinite(Number(config.maxBeatsPerTick)) ? Math.max(0, Number(config.maxBeatsPerTick)) : 1;
  const spacing = Number(config.minBeatSpacingHours ?? 4) * HOUR_MS;
  if (!state.announcedBeats) state.announcedBeats = {};
  const lastBeat = Number(state.lastBeatAt || 0);
  const beats = (now - lastBeat >= spacing) ? dueBeats(config, state, now).slice(0, cap) : [];

  for (const b of beats) {
    const audience = beatAudience(b);
    state.announcedBeats[b.id] = now;
    state.lastBeatAt = now;
    appendChronicle(state, b, now);
    if (audience === "world")            { await broadcast(sock, groups, b.text, botJid); fired++; }
    else if (audience === "personal")     { dms += await deliverPersonal(sock, players, b.text); fired++; }
    else                                  { fired++; } // "story": chronicle + .hollowing only
  }

  // 3) Global progress milestones
  if (!state.milestones) state.milestones = {};
  const total = totalProgress(state);
  for (const m of dueMilestones(config, state)) {
    state.milestones[m.id] = now;
    await broadcast(sock, groups, milestoneAnnouncement(m, total), botJid);
    fired++;
  }

  // 4) Muster windows that closed short — the island takes the damage
  const broken = sweepMustersInto(state, config, now);
  for (const chatId of broken) {
    try { await sock.sendMessage(chatId, { text: config.muster?.failLine || config.muster?.holdLine || "" }); fired++; }
    catch (e) { console.log("[hollowing] muster fail announce:", e?.message || e); }
  }

  // 5) TEMPORARY hunt-energy burst — top the whole roster up to max. Cheap and
  //    idempotent; only reports a change when someone was below max.
  let burst = 0;
  if (huntEnergyBurstEnabled(config)) {
    for (const p of Object.values(players || {})) if (burstHuntEnergy(p)) burst++;
    if (burst && typeof opts.savePlayers === "function") {
      try { opts.savePlayers(players); } catch (e) { console.log("[hollowing] burst save:", e?.message || e); }
    }
  }

  if (fired) saveState(state);
  return { fired, dms, burst };
}

function startHollowingLoop(sock, groups = [], opts = {}) {
  if (loopTimer) clearInterval(loopTimer);
  const run = () => { tick(sock, groups, opts).catch(e => console.log("[hollowing]", e?.message || e)); };
  run();
  loopTimer = setInterval(run, TICK_MS);
  if (loopTimer.unref) loopTimer.unref();
  return loopTimer;
}
function stopHollowingLoop() { if (loopTimer) clearInterval(loopTimer); loopTimer = null; }

// ══════════════════════════════════════════════════════════════
// STORY TREE — branching, button-driven paths
// ══════════════════════════════════════════════════════════════
function ensureTale(player) {
  if (!player || typeof player !== "object") return null;
  if (!player.eventChoices || typeof player.eventChoices !== "object") player.eventChoices = {};
  if (!player.eventChoices.hollowing || typeof player.eventChoices.hollowing !== "object") {
    player.eventChoices.hollowing = { temptationAccepted: false, temptationCount: 0 };
  }
  const h = player.eventChoices.hollowing;
  if (!h.tale || typeof h.tale !== "object") {
    h.tale = { node: null, visited: [], revealed: [], scars: 0, luck: 0, ending: null };
  }
  if (!Array.isArray(h.tale.visited))  h.tale.visited  = [];
  if (!Array.isArray(h.tale.revealed)) h.tale.revealed = [];
  if (!h.res || typeof h.res !== "object") h.res = { fragments: 0, essence: 0, seals: 0 };
  return h;
}
function taleOf(player) { const h = ensureTale(player); return h ? h.tale : null; }
function resourcesOf(player) { const h = ensureTale(player); return h ? h.res : null; }

function treeOf(config = loadConfig()) { return config?.storyTree || {}; }
function nodeById(config, id) { return (config?.storyTree?.nodes || {})[id] || null; }
function fragmentById(config, id) { return (config?.storyTree?.fragments || {})[id] || null; }
function taleEntry(config = loadConfig()) { return treeOf(config).entry || null; }
function nodeAvailable(config, node, now = Date.now()) {
  const ch = (config?.chapters || []).find(c => c.id === node?.chapterId);
  if (!ch) return true;
  const t = chapterUnlockMs(config, ch);
  return t == null || now >= t;
}
// every verb the tree uses, so index.js can route them and tests can assert them
function allVerbs(config = loadConfig()) {
  const set = new Set();
  for (const node of Object.values(config?.storyTree?.nodes || {})) {
    for (const c of node.choices || []) if (c.verb) set.add(c.verb);
  }
  return [...set].sort();
}
function verbCommand(verb) { return `.hollow-${String(verb).toLowerCase()}`; }
function  taleButtons(node) {
    return (node?.choices || []).slice(0, 8).map(c => ({ id: verbCommand(c.verb), text: c.label || c.verb }));
  }

  // Backlash line shown on the node when the player is close to a backlash lockout.
  function backlashWarnText(config, player) {
    if (!config) return null;
    const lastAt = Number(player?.eventChoices?.hollowing?.lastInvestigateAt || 0);
    const coolsAt = Number(player?.eventChoices?.hollowing?.backlashCoolsAt || 0);
    const scares = Number(player?.eventChoices?.hollowing?.backlashScares || 0);
    const now = Date.now();
    const cooldownMs = Number(config.investigationCooldownMs || 0);
    const hotMs = Number(config.investigationBacklashCoolMs || 0);
    const maxScares = Number(config.investigationBacklashMaxScares || 0);

    // Already locked out — strongest warning.
    if (coolsAt && now < coolsAt) {        return `\n\n⚠️ *THE DARK WON'T LET YOU IN RIGHT NOW.*\n\nYou pushed too fast too recently. Wait before you try again.`;
    }

    // If outside the normal cooldown window, the ramp is reset — no warning.
    if (!cooldownMs || now - lastAt >= cooldownMs) return null;

    // Inside the soft cool window, escalating.
    if (hotMs && now - lastAt < hotMs) {
      const nextScares = (scares || 0) + 1;
      const danger = maxScares && nextScares >= maxScares;
      if (danger) {
        return `\n\n⚠️ *THE DARK PUSHES BACK — ONE MORE STEP AND IT LOCKS YOU OUT.*\n\nYou are on thin ice. The next move locks you out. Stand still.`;
      }
      return `\n\n⚠️ *THE DARK NOTICES YOU MOVING TOO FAST.*\n\nSlow down. You are dangerously close to being locked out.`;
    }

    return null;
  }
function renderNode(config, node, tale) {
  const lines = [`🌑 *THE HOLLOWING — ${node.title}*`, ``, node.text];
  const carried = (tale?.revealed || []).map(id => fragmentById(config, id)).filter(Boolean);
  if (carried.length) lines.push(``, `📜 *Fragments you carry:* ${carried.map(f => f.title).join(" · ")}`);
  // Levels the risk honestly: players should know the cost is real before they tap.
  if ((node.choices || []).some(c => c.outcome === "devastating")) {
    lines.push(``, `⚠️ _Some of these paths cost you — lucons, aura, health, even shards. None of them are safe._`);
  }
  const warn = backlashWarnText(config, tale);
  if (warn) lines.push(warn);
  return lines.join("\n");
}

// ── GAMBLE MECHANICS ───────────────────────────────────────────
// A value may be a fixed number or a [min, max] range. Losses are rolled from
// ranges so the cost of investigating is never predictable.
function rollAmount(v, rng = Math.random) {
  if (Array.isArray(v) && v.length) {
    const min = Number(v[0]);
    const max = Number(v.length > 1 ? v[1] : v[0]);
    if (!Number.isFinite(min)) return 0;
    if (!Number.isFinite(max) || max <= min) return min;
    return min + Math.floor(rng() * (max - min + 1));
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveBag(bag, rng = Math.random) {
  const out = {};
  for (const k of Object.keys(bag || {})) out[k] = rollAmount(bag[k], rng);
  return out;
}

// Shards live in a species-keyed vault, so losing one means losing a random
// shard you actually own. Vault size drives how much there is to take.
function vaultSize(player) {
  const v = player && player.shards;
  if (!v || typeof v !== "object") return 0;
  return Object.values(v).reduce((a, n) => a + (Number(n) || 0), 0);
}
function shardLabel(key) {
  return String(key || "")
    .replace(/^corrupted:/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, m => m.toUpperCase());
}
// Remove up to `count` shards at random. Returns the keys actually lost.
function loseShards(player, count, rng = Math.random) {
  const lost = [];
  let want = Math.max(0, Math.floor(Number(count) || 0));
  if (!player || typeof player !== "object") return lost;
  if (!player.shards || typeof player.shards !== "object") player.shards = {};
  while (want > 0) {
    const entries = Object.entries(player.shards).filter(([, n]) => Number(n) > 0);
    if (!entries.length) break;
    const idx = Math.min(entries.length - 1, Math.floor(rng() * entries.length));
    const [key, have] = entries[idx];
    player.shards[key] = Number(have) - 1;
    if (player.shards[key] <= 0) delete player.shards[key];
    lost.push(key);
    want--;
  }
  return lost;
}

function applyGainLoss(player, res, gain = {}, loss = {}, rng = Math.random) {
  const gained = [], lost = [];
  if (gain.lucons)    { player.lucons = Number(player.lucons || 0) + gain.lucons; gained.push(`💰 +${gain.lucons} Lucons`); }
  if (gain.aura)      { player.aura   = Number(player.aura   || 0) + gain.aura;   gained.push(`✨ +${gain.aura} Aura`); }
  if (gain.fragments && res) { res.fragments += gain.fragments; gained.push(`🔷 +${gain.fragments} Rift Fragment`); }
  if (gain.essence   && res) { res.essence   += gain.essence;   gained.push(`🌫 +${gain.essence} Hollow Essence`); }
  if (gain.seals     && res) { res.seals     += gain.seals;     gained.push(`🔒 +${gain.seals} Ancient Seal`); }
  // Losses report what was ACTUALLY taken (clamped at zero), not the rolled
  // number — otherwise the card promises a loss the player never felt.
  if (loss.lucons) {
    const before = Number(player.lucons || 0);
    player.lucons = Math.max(0, before - Math.abs(loss.lucons));
    lost.push(`💰 −${before - player.lucons} Lucons`);
  }
  if (loss.aura) {
    const before = Number(player.aura || 0);
    player.aura = Math.max(0, before - Math.abs(loss.aura));
    lost.push(`✨ −${before - player.aura} Aura`);
  }
  if (loss.hp && player.playerHp != null) {
    const before = Number(player.playerHp);
    player.playerHp = Math.max(1, before - Math.abs(loss.hp));
    lost.push(`❤️ −${before - player.playerHp} HP`);
  }
  if (loss.shards) {
    const taken = loseShards(player, loss.shards, rng);
    if (taken.length) lost.push(...taken.map(k => `💎 −1 *${shardLabel(k)}* shard`));
    else lost.push(`💎 _Your vault was empty — nothing left to take._`);
  }
  return { gained, lost };
}

// Apply one choice. Mutates player + state; callers save.
function resolveChoice(config, state, player, nodeId, verbKey, meta = {}) {
  const node = nodeById(config, nodeId);
  if (!node) return { ok: false, reason: "no-node" };
  const choice = (node.choices || []).find(c => c.verb === verbKey);
  if (!choice) return { ok: false, reason: "no-choice" };

  const now = Number(meta.now || Date.now());
  const rng  = typeof meta.rng === "function" ? meta.rng : Math.random;
  const tale = taleOf(player);
  const res  = resourcesOf(player);
    // Investigation cooldown + backlash are a single punish ladder now:
  // the cooldown window is the window over which scares accumulate, and a
  // few fast resolves in a row trigger a hard lockout + a backlash strike.
  // When the backlash layer is OFF, the cooldown is a bare throttle.
  const cooldown = Number(config?.investigationCooldownMs || 0);
  const backlash = config?.investigationBacklashCoolMs != null;
  const lastAt = Number(player.eventChoices?.hollowing?.lastInvestigateAt || 0);

  if (cooldown > 0 && lastAt && now - lastAt < cooldown) {
    if (backlash) {
      // Inside the cooldown window with backlash on -> treat as a near-miss
      // scare rather than a bare throttle, so spammers feel the pressure.
      const coolsAt = Number(player.eventChoices?.hollowing?.backlashCoolsAt || 0);
      const scares  = Number(player.eventChoices?.hollowing?.backlashScares || 0);
      const hotMs   = Number(config.investigationBacklashCoolMs || 0);
      const maxScares = Number(config.investigationBacklashMaxScares || 0);
      const lockMs = Number(config.investigationBacklashLockMs || 0);

      // If already hard-locked by a prior strike, honor the lockout.
      if (coolsAt && now < coolsAt) {
        const remain = coolsAt - now;
        return { ok: false, reason: "backlash-locked", remainingMs: remain, lockMs };
      }

      const scareAura = (Number(config.investigationBacklashAura || 0) / 3) || 0;
      const scareHp   = (Number(config.investigationBacklashHp || 0) / 3)   || 0;
      const nextScares = (scares || 0) + 1;
      player.aura = Math.max(0, Number(player.aura || 0) - scareAura);
      if (player.playerHp != null) {
        player.playerHp = Math.max(1, Number(player.playerHp) - scareHp);
      }
      if (config.investigationBacklashScareShards) {
        loseShards(player, config.investigationBacklashScareShards, rng);
      }

      if (maxScares && nextScares >= maxScares) {
        // Strike the player, lock them out, reset the ramp.
        player.aura = Math.max(0, Number(player.aura || 0) - Number(config.investigationBacklashAura || 0));
        if (player.playerHp != null) {
          player.playerHp = Math.max(1, Number(player.playerHp) - Number(config.investigationBacklashHp || 0));
        }
        if (config.investigationBacklashStrikeShards) {
          loseShards(player, config.investigationBacklashStrikeShards, rng);
        }
        player.eventChoices.hollowing.backlashCoolsAt = now + lockMs;
        player.eventChoices.hollowing.backlashScares = 0;
        const backlashLine = "🌑 *THE HOLLOWING PUSHES BACK.*\n\nYou are moving too fast. The dark remembers your rhythm — and it answers.\n\n_Stand still for a moment._ ";
        const out0 = {
          ok: false,
          reason: "backlash",
          backlashLockedMs: lockMs,
          backlashAuraLoss: Number(config.investigationBacklashAura || 0),
          backlashHpLoss: Number(config.investigationBacklashHp || 0),
          backlashShardLoss: config.investigationBacklashStrikeShards ? 1 : 0,
          backlashRemainingMs: lockMs,
          line: backlashLine,
        };
        const gl0 = applyGainLoss(player, res, {}, {}, rng);
        out0.gained = gl0.gained; out0.lost = gl0.lost;
        return out0;
      }

      // Near-miss scare: charge a little and refuse the resolve.
      player.eventChoices.hollowing.backlashScares = nextScares;
      const warnLine = `\n\n⚠️ *THE DARK NOTICES YOU MOVING TOO FAST.*\n\nYou lost a little ground. Slow down, or it will lock you out. (${nextScares}/${maxScares})`;
      return {
        ok: false,
        reason: "backlash-scare",
        backlashScares: nextScares,
        backlashMaxScares: maxScares,
        backlashCooldownMs: cooldown,
        backlashLockMs: lockMs,
        backlashAuraLoss: scareAura,
        backlashHpLoss: scareHp,
        backlashShardLoss: config.investigationBacklashScareShards ? config.investigationBacklashScareShards : 0,
        line: warnLine,
      };
    }
    // Backlash off: bare throttle.
    return { ok: false, reason: "throttled", throttleMs: cooldown };
  }

  // Backlash gate (only reaches here when the cooldown isn't actively
  // blocking, OR when backlash is off and cooldown is 0). Handles the
  // lockout from a prior strike and the soft-window ramp for non-throttled
  // resolves.
  if (backlash) {
    const coolsAt = Number(player.eventChoices?.hollowing?.backlashCoolsAt || 0);
    const scares = Number(player.eventChoices?.hollowing?.backlashScares || 0);
    const cooldownMs = Number(config.investigationCooldownMs || 0);
    const hotMs = Number(config.investigationBacklashCoolMs || 0);
    const maxScares = Number(config.investigationBacklashMaxScares || 0);
    const lockMs = Number(config.investigationBacklashLockMs || 0);

    // Lockout from a prior backlash strike.
    if (coolsAt && now < coolsAt) {
      const remain = coolsAt - now;
      return { ok: false, reason: "backlash-locked", remainingMs: remain, lockMs };
    }

    // The soft ramp window is whichever is larger: the explicit hot window,
    // or the normal investigation cooldown. A player who waits long enough
    // for that window to fully elapse resets the ramp. Floor at 1 ms so the
    // layer stays reachable even when both config values are 0.
    const windowMs = Math.max(cooldownMs, hotMs, 1);
    const pastWindow = now - lastAt >= windowMs;
    if (pastWindow) {
      player.eventChoices.hollowing.backlashScares = 0;
      player.eventChoices.hollowing.backlashCoolsAt = 0;
    }

    // Inside the soft window: count a near-miss, charge a little, and possibly
    // strike. This path is reached when the resolve is NOT inside the bare
    // cooldown throttle (e.g. cooldown is 0, or the resolve happens in the
    // gap between throttle expiry and full window expiry on configs that tune
    // them separately).
    if (!pastWindow) {
      const nextScares = (scares || 0) + 1;

      // Every caught fast-resolve costs a little, so spamming hurts before
      // the lockout even lands.
      const scareAura = (Number(config.investigationBacklashAura || 0) / 3) || 0;
      const scareHp   = (Number(config.investigationBacklashHp || 0) / 3)   || 0;
      player.aura = Math.max(0, Number(player.aura || 0) - scareAura);
      if (player.playerHp != null) {
        player.playerHp = Math.max(1, Number(player.playerHp) - scareHp);
      }
      if (config.investigationBacklashScareShards) {
        loseShards(player, config.investigationBacklashScareShards, rng);
      }

      if (maxScares && nextScares >= maxScares) {
        // Strike the player, lock them out, reset the ramp.
        player.aura = Math.max(0, Number(player.aura || 0) - Number(config.investigationBacklashAura || 0));
        if (player.playerHp != null) {
          player.playerHp = Math.max(1, Number(player.playerHp) - Number(config.investigationBacklashHp || 0));
        }
        if (config.investigationBacklashStrikeShards) {
          loseShards(player, config.investigationBacklashStrikeShards, rng);
        }
        player.eventChoices.hollowing.backlashCoolsAt = now + lockMs;
        player.eventChoices.hollowing.backlashScares = 0;
        const backlashLine = "🌑 *THE HOLLOWING PUSHES BACK.*\n\nYou are moving too fast. The dark remembers your rhythm — and it answers.\n\n_Stand still for a moment._ ";
        const out0 = {
          ok: false,
          reason: "backlash",
          backlashLockedMs: lockMs,
          backlashAuraLoss: Number(config.investigationBacklashAura || 0),
          backlashHpLoss: Number(config.investigationBacklashHp || 0),
          backlashShardLoss: config.investigationBacklashStrikeShards ? 1 : 0,
          backlashRemainingMs: lockMs,
          line: backlashLine,
        };
        const gl0 = applyGainLoss(player, res, {}, {}, rng);
        out0.gained = gl0.gained; out0.lost = gl0.lost;
        return out0;
      }

      // Near-miss — store the ramp and return a refused resolve so the player
      // feels the pressure before the lockout.
      player.eventChoices.hollowing.backlashScares = nextScares;
      const warnLine = `\n\n⚠️ *THE DARK NOTICES YOU MOVING TOO FAST.*\n\nYou lost a little ground. Slow down, or it will lock you out. (${nextScares}/${maxScares})`;
      return {
        ok: false,
        reason: "backlash-scare",
        backlashScares: nextScares,
        backlashMaxScares: maxScares,
        backlashCooldownMs: cooldownMs,
        backlashLockMs: lockMs,
        backlashAuraLoss: scareAura,
        backlashHpLoss: scareHp,
        backlashShardLoss: config.investigationBacklashScareShards ? config.investigationBacklashScareShards : 0,
        line: warnLine,
      };
    }
  }

  // Roll the ranges first, then let a devastating path go catastrophically
  // wrong on top. Rewards stay fixed; only the cost is gambled.
  const gain = resolveBag(choice.gain, rng);
  const loss = resolveBag(choice.loss, rng);
  const risk = config?.risk || {};
  const out = {
    ok: true, outcome: choice.outcome || "neutral", line: choice.line || "",
    reveal: null, fragment: null, task: null, next: choice.next || null,
    gained: [], lost: [], catastrophe: false, riskLine: null,
  };

  // Catastrophe — only on devastating choices, only when risk is enabled.
  // A low risk roll escalates the already-rolled loss (lucons/aura/hp are
  // multiplied; shard theft rounds up to at least one). The risk roll is taken
  // after the loss is resolved so deterministic tests can force it separately.
  if (risk.enabled && out.outcome === "devastating") {
    const riskRoll = rng();
    if (riskRoll < Number(risk.catastropheChance || 0)) {
      const mult = Number(risk.multiplier || 1);
      out.catastrophe = true;
      out.riskLine = risk.line || "💀 *It goes badly wrong.*";
      if (loss.lucons) loss.lucons = Math.floor(loss.lucons * mult);
      if (loss.aura)   loss.aura   = Math.floor(loss.aura   * mult);
      if (loss.hp)     loss.hp     = Math.floor(loss.hp     * mult);
      if (loss.shards) loss.shards = Math.max(1, Math.round(loss.shards * mult));
    }
  }

  // Apply the rolled (and possibly escalated) gain and loss to the player.
  // Everything else (reveals, progress, temptation, task) is layered on top.
  const gl = applyGainLoss(player, res, gain, loss, rng);
  out.gained = gl.gained;
  out.lost   = gl.lost;

  if (out.outcome === "devastating") tale.scars += 1;
  if (out.outcome === "lucky")       tale.luck  += 1;

  // Stamp the last-investigate time on every successful resolve. The backlash
  // layer reads this, so it has to be written even when the throttle is off.
  if (out.ok) {
    if (!player.eventChoices || typeof player.eventChoices !== "object") player.eventChoices = {};
    if (!player.eventChoices.hollowing || typeof player.eventChoices.hollowing !== "object") {
      player.eventChoices.hollowing = { temptationAccepted: false, temptationCount: 0 };
    }
    player.eventChoices.hollowing.lastInvestigateAt = meta.now;
  }
  // Throttle the next resolve when the investigation cooldown is on.
  if (out.ok && Number(config?.investigationCooldownMs || 0) > 0) {
    // Keep the backlash ramp clean on a successful, on-time resolve.
    if (backlash) {
      player.eventChoices.hollowing.backlashScares = 0;
      player.eventChoices.hollowing.backlashCoolsAt = 0;
    }
  }

  if (choice.reveal && !tale.revealed.includes(choice.reveal)) {
    tale.revealed.push(choice.reveal);
    out.reveal   = choice.reveal;
    out.fragment = fragmentById(config, choice.reveal);
  }
  if (choice.progress && state) recordProgress(state, choice.progress, Number(choice.progressAmount || 1));
  if (choice.temptation != null) recordTemptation(player, !!choice.temptation);
  if (choice.task && state) {
    const claim = claimLimitedTask(state, choice.task, meta.playerId, meta.playerName);
    out.task = { id: choice.task, ok: claim.ok, reason: claim.reason, position: claim.position, task: claim.task };
  }

  if (!tale.visited.includes(nodeId)) tale.visited.push(nodeId);
  if (out.next) {
    if (!tale.visited.includes(out.next)) tale.visited.push(out.next);
    tale.node = out.next;
  } else {
    tale.node   = null;
    tale.ending = nodeId;
  }
  return out;
}

function taleOutcomeLines(result, playerName) {
  const lines = [result.line || "_You choose._", ""];
  if (result.catastrophe && result.riskLine) lines.push(result.riskLine, "");
  if (result.outcome === "lucky")       lines.push("🍀 *A lucky turn.*", ...result.gained.map(g => `• ${g}`));
  if (result.outcome === "devastating") lines.push("🩸 *It costs you.*", ...result.lost.map(l => `• ${l}`));
  if (result.fragment) {
    lines.push("", `📜 *A fragment of the story surfaces* — *${result.fragment.title}*`, `_${result.fragment.text}_`);
  }
  if (result.task?.ok) {
    const lore = String(result.task.task?.lore || "").replace(/\{name\}/g, playerName || "A hunter");
    lines.push("", `🖋️ *You are written into the story.*`, lore ? `_${lore}_` : "");
  } else if (result.task && result.task.reason === "full") {
    lines.push("", "🖋️ _Someone reached it first. The chronicle remembers their name — not yours._");
  }
  return lines.filter(l => l !== undefined);
}

async function cmdTale(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx || {};
  const player = players?.[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const config = loadConfig();
  if (!isActive(config)) {
    return sock.sendMessage(chatId, {
      text: "🌑 *THE HOLLOWING* — _dormant._\n\nThe Veil is intact. There is nothing to investigate. _Yet._",
    }, { quoted: msg });
  }

  const tale = taleOf(player);
  const restart = String(args[0] || "").toLowerCase() === "start";
  let nodeId = restart ? taleEntry(config) : tale.node;
  // A hunter who has never walked a path goes straight in — no menu between
  // them and the story. The menu is only for someone who has reached an end.
  if (!nodeId && !restart && !tale.ending) nodeId = taleEntry(config);

  if (!nodeId) {
    const done = !!tale.ending;
    const body = done
      ? "🌑 *THE HOLLOWING*\n\n_You have walked this path to its end. Another waits — the tale changes depending on what you choose._"
      : "🌑 *THE HOLLOWING*\n\n_Something is wrong on the moor. Nobody has gone to look._";
    return buttonsSystem.sendButtons(sock, chatId, body,
      [{ id: ".investigate start", text: done ? "🔁 Walk a path again" : "🔍 Go and look" }],
      { quoted: msg, title: "THE HOLLOWING", footer: "The Hollowing" });
  }

  const node = nodeById(config, nodeId);
  if (!node || !nodeAvailable(config, node)) {
    return sock.sendMessage(chatId, { text: "🌑 That part of the story has not opened yet." }, { quoted: msg });
  }
  // Persist the node BEFORE sending — otherwise the player is shown a scene
  // their next button press cannot resolve against.
  tale.node = nodeId;
  if (!tale.visited.includes(nodeId)) tale.visited.push(nodeId);

  const buttons = taleButtons(node);
  const labelMap = {};
  for (const b of buttons) labelMap[b.text] = b.id;
  buttonsSystem.mapButtons(labelMap);
  savePlayers(players);
  return buttonsSystem.sendButtons(sock, chatId, renderNode(config, node, tale), buttons,
    { quoted: msg, title: "THE HOLLOWING", footer: "Choose your path" });
}

async function cmdTaleChoice(ctx, chatId, senderId, msg, verbKey) {
  const { sock, players, savePlayers } = ctx || {};
  const player = players?.[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const config = loadConfig();
  if (!isActive(config)) {
    return sock.sendMessage(chatId, { text: "🌑 The Veil is intact. The story is closed for now." }, { quoted: msg });
  }

  const tale = taleOf(player);
  if (!tale.node) {
    return sock.sendMessage(chatId, { text: "🌑 You are not on a path. Use *.investigate* to begin or continue." }, { quoted: msg });
  }

  const state  = loadState();
  const name   = player.name || player.pushName || "A hunter";
  const result = resolveChoice(config, state, player, tale.node, verbKey, { playerId: senderId, playerName: name });
  if (!result.ok) {
    return sock.sendMessage(chatId, { text: "🌑 That path is closed to you here." }, { quoted: msg });
  }
  saveState(state);
  savePlayers(players);

  const lines = taleOutcomeLines(result, name);
  const next  = result.next ? nodeById(config, result.next) : null;
  if (next) {
    const buttons = taleButtons(next);
    const labelMap = {};
    for (const b of buttons) labelMap[b.text] = b.id;
    buttonsSystem.mapButtons(labelMap);
    return buttonsSystem.sendButtons(sock, chatId,
      `${lines.join("\n")}\n\n${renderNode(config, next, tale)}`, buttons,
      { quoted: msg, title: "THE HOLLOWING", footer: "Choose your path" });
  }

  lines.push("", "_The path ends here. Walk it again with_ *.investigate* _— the tale changes depending on what you choose._");
  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// THE HOLLOW MUSTER — a group mechanic no solo player can carry
// ══════════════════════════════════════════════════════════════
function musterWindowKey(config = loadConfig(), now = Date.now()) {
  const hours = Number(config?.muster?.windowHours) || 6;
  return `w${Math.floor(now / (hours * HOUR_MS))}`;
}
function ensureMuster(state, chatId, config = loadConfig(), now = Date.now()) {
  if (!state.muster || typeof state.muster !== "object") state.muster = {};
  const key = musterWindowKey(config, now);
  const rec = state.muster[chatId];
  if (!rec || rec.windowKey !== key) {
    state.muster[chatId] = { windowKey: key, tally: 0, contributors: {}, rewarded: false, failed: false };
  }
  return state.muster[chatId];
}
function musterLine(config, rec) {
  const threshold = Number(config?.muster?.threshold) || 8;
  return `🤝 *THE HOLLOW MUSTER* — ${rec.tally}/${threshold}\n` +
    `_Stand together. Every hunter who answers is rewarded._\n` +
    `📣 *${Object.keys(rec.contributors).length} answered.*`;
}

async function cmdMuster(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx || {};
  const player = players?.[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const config = loadConfig();
  if (!isActive(config)) {
    return sock.sendMessage(chatId, { text: "🌑 The Veil is intact. There is nothing to hold." }, { quoted: msg });
  }
  if (config.muster?.enabled === false) {
    return sock.sendMessage(chatId, { text: "🤝 The muster is closed." }, { quoted: msg });
  }
  if (!/@g\.us$/.test(String(chatId))) {
    return sock.sendMessage(chatId, { text: "🤝 The muster is a group effort — call it in a group, not in private." }, { quoted: msg });
  }

  const state = loadState();
  const rec   = ensureMuster(state, chatId, config);
  const threshold = Number(config.muster?.threshold) || 8;
  const reward = config.muster?.reward || {};

  if (rec.contributors[senderId]) {
    return sock.sendMessage(chatId, {
      text: `${musterLine(config, rec)}\n\n_You have already thrown your strength in this window._`,
    }, { quoted: msg });
  }

  rec.contributors[senderId] = Date.now();
  rec.tally += 1;
  recordProgress(state, "muster", 1);

  if (rec.tally >= threshold && !rec.rewarded) {
    rec.rewarded = true;
    const jids = Object.keys(rec.contributors);
    for (const jid of jids) {
      const p = players[jid];
      if (!p) continue;
      if (reward.lucons) p.lucons = Number(p.lucons || 0) + Number(reward.lucons);
      if (reward.aura)   p.aura   = Number(p.aura   || 0) + Number(reward.aura);
      const r = resourcesOf(p);
      if (r && reward.essence) r.essence += Number(reward.essence);
    }
    saveState(state); savePlayers(players);
    const rewardLine = reward.lucons
      ? `\n💰 Everyone who stood: *+${reward.lucons} Lucons*${reward.aura ? ` · *+${reward.aura} Aura*` : ""}`
      : "";
    return sock.sendMessage(chatId, {
      text: `${config.muster.holdLine}\n\n🤝 *${rec.tally}/${threshold} hunters answered.*${rewardLine}\n📣 *${jids.length} rewarded.*`,
      mentions: jids,
    }, { quoted: msg });
  }

  saveState(state); savePlayers(players);
  return sock.sendMessage(chatId, { text: musterLine(config, rec), mentions: [senderId] }, { quoted: msg });
}

// Windows that closed without reaching the threshold: the island takes the hit.
// Operates on the caller's state object so it never clobbers a concurrent save.
function sweepMustersInto(state, config, now = Date.now()) {
  if (!state?.muster) return [];
  const key = musterWindowKey(config, now);
  const failed = [];
  for (const [chatId, rec] of Object.entries(state.muster)) {
    if (!rec || rec.windowKey === key) continue;
    if (rec.rewarded || rec.failed || !rec.tally) continue;
    rec.failed = true;
    failed.push(chatId);
  }
  return failed;
}

// ══════════════════════════════════════════════════════════════
// COMMAND — .hollowing (info card)
// ══════════════════════════════════════════════════════════════
async function cmdHollowing(ctx, chatId, msg, args = []) {
  const { sock } = ctx || {};
  if (!sock) return;
  const config = loadConfig();
  const now = Date.now();
  const state = loadState();

  // .hollowing story — the full chronological story, readable at any time.
  if (String(args[0] || "").toLowerCase() === "story") {
    const chron = Array.isArray(state.chronicle) ? state.chronicle.slice(-40) : [];
    const body = chron.length
      ? [`📖 *THE HOLLOWING — THE STORY SO FAR*`, ``, ...chron.map(e => {
          const mark = e.audience === "personal" ? "👤" : e.audience === "story" ? "📜" : "🌍";
          return `${mark} _${formatCatStamp(e.at)}_\n${e.text}`;
        })].join("\n\n")
      : "📖 _The story has not begun._";
    return sock.sendMessage(chatId, { text: body }, { quoted: msg });
  }

  if (!isEnabled(config)) {
    return sock.sendMessage(chatId, {
      text: "🌑 *THE HOLLOWING* — _dormant._\n\nThe Veil is intact. For now.",
    }, { quoted: msg });
  }

  const ladder = chapterLadder(config, now);
  const current = activeChapter(config, now);
  const total = totalProgress(state);
  const missing = missingMoraNames(config);

  const lines = [
    `🌑 *${config.title}*`,
    `_Lumora's first seasonal world event_`,
    ``,
    current
      ? `📖 *Chapter ${current.roman} — ${current.name}*`
      : `⏳ _The Hollowing has not yet begun._`,
    ``,
    ...ladder.map(c => `${c.unlocked ? "✅" : "🔒"} Chapter ${c.roman} — ${c.name}`),
    ``,
    `🌍 *WORLD PROGRESS* — ${total}`,
    ...(config.milestones || []).map(m => `${state.milestones?.[m.id] ? "🏅" : "⬜"} ${m.name || m.id} — ${m.threshold}`),
    ``,
    `⚡ Hunt Energy: regen ×${config.eventModifiers.huntEnergyRegenMultiplier} · drain ×${config.eventModifiers.huntEnergyDrainMultiplier}`,
  ];

  // The story so far — the "layer 2" view, readable without the drip.
  const story = Array.isArray(state.chronicle) ? state.chronicle.slice(-6) : [];
  if (story.length) {
    lines.push(``, `📖 *THE STORY SO FAR*`);
    for (const e of story) {
      const mark = e.audience === "personal" ? "👤" : e.audience === "story" ? "📜" : "🌍";
      const head = String(e.text).split("\n").find(l => l.trim()) || "";
      lines.push(`${mark} _${formatCatStamp(e.at)}_ ${head.replace(/[*_]/g, "")}`);
    }
    lines.push(`_Full chronicle:_ *.hollowing story*`);
  }

  if (missing.length) lines.push(``, `👁️ *Missing Mora:* ${missing.join(", ")}`);
  const chronicle = (state.world?.chronicle) || [];
  if (chronicle.length) {
    lines.push(``, `📜 *Written into the story:*`);
    for (const e of chronicle.slice(-5)) lines.push(`• ${e.lore}`);
  }
  lines.push(``, `_${formatCatStamp(now)} CAT_`);

  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

module.exports = {
  // config + state
  DEFAULT_CONFIG, CONFIG_FILE, STATE_FILE,
  loadConfig, saveConfig, loadState, saveState, EMPTY_STATE,
  configure, resetPaths,

  // time / phase
  isEnabled, isActive, activeChapter, chapterLadder, chapterUnlockMs, dueBeats,

  // hunt energy
  huntEnergyMultipliers, applyRegenModifier, applyDrainModifier,
  huntEnergyActiveRecharge, huntEnergyActiveRechargeNow, huntEnergyBurstEnabled, burstHuntEnergy,

  // mora
  isMoraAvailable, filterAvailableMora, missingMoraNames, noTraceLine,

  // delivery layers
  AUDIENCES, beatAudience, engagedJids, appendChronicle, deliverPersonal,

  // world
  recordProgress, totalProgress, dueMilestones, claimLimitedTask, chronicleFor,
  ensureChoice, recordTemptation,

  // text
  formatCatStamp, formatCountdown, chapterAnnouncement, milestoneAnnouncement,

  // scheduler
  TICK_MS, tick, startHollowingLoop, stopHollowingLoop,

  // story tree
  ensureTale, taleOf, resourcesOf, treeOf, nodeById, fragmentById, taleEntry,
  nodeAvailable, allVerbs, verbCommand, taleButtons, renderNode, resolveChoice, applyGainLoss,
  rollAmount, resolveBag, vaultSize, shardLabel, loseShards,  cmdTale, cmdTaleChoice,
  backlashWarnText,

  // group muster
  musterWindowKey, ensureMuster, musterLine, sweepMustersInto, cmdMuster,

  // hollow mora
  hollowConfig, hollowActive, shouldHollowSpawn, hollowIntro, buildHollowSpecies,
  rollHollowDrops, grantHollowDrops, hollowDefeatLog, hollowResourceSummary,

  // command
  cmdHollowing,

  // exposed for tests
  DAY_MS, HOUR_MS, CAT_OFFSET_MS,
};

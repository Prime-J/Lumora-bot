// ============================
// LUMORA BOT PERSONALITY SYSTEM
// ============================
// Makes the bot feel alive — idle chatter, tips, jokes, battle commentary

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ══════════════════════════════════════════════════════════════
// IDLE MESSAGES — sent randomly when no one is playing
// ══════════════════════════════════════════════════════════════
const IDLE_MESSAGES = [
  `*sigh*... No one is playing. So boring. 😔`,
  `Hello?? Is anyone out there? The Moras are getting restless... 🦎`,
  `I've been sitting here for ages. Not a single battle. Not even a hunt. 😴`,
  `The Rift is quiet... too quiet. Someone go poke it. 🕶️`,
  `I swear if no one plays soon, I'm releasing all the Legendary Moras into the wild. Don't test me. 🐉`,
  `*taps microphone* Is this thing on? ...Anyone? 🎤`,
  `Just me and the void again. Cool. Very cool. Very normal. 🗿`,
  `Fun fact: I have over 200 lines of code dedicated to battles, and nobody is using them. Pain. 💀`,
  `You know what's sadder than losing a battle? Not having one at all. 😭`,
  `I just watched a wild Mora walk by and nobody tried to catch it. I'm disappointed. 🐾`,
  `The faction war won't fight itself, people! Get in here! ⚔️`,
  `At this rate, the Moras are going to start hunting *us*. 🦴`,
  `📢 PSA: Your Moras miss you. They told me. I speak Mora now. It's been that boring.`,
  `I've counted every pixel on this screen twice. Please. Play something. 🧮`,
  `*starts humming battle music alone* 🎵 dun dun dun... 🎵`,
  `Legend says a player once played for 12 hours straight. I think about them every day. 🥲`,
  `The Harmony faction is literally growing moss. The Rift is taking a nap. Purity gave up. Help.`,
  `I just generated a Mythic Mora spawn and... nobody was here. It despawned. You're welcome. 😐`,
];

// ══════════════════════════════════════════════════════════════
// DID YOU KNOW — TIPS SYSTEM
// ══════════════════════════════════════════════════════════════
const TIPS = [
  `💡 *Did you know?* You can use *.charge* in battle to restore energy instead of attacking!`,
  `💡 *Did you know?* Use *.hunt* in different terrains for unique Mora encounters!`,
  `💡 *Did you know?* Completing faction missions gives your faction points toward the season war!`,
  `💡 *Did you know?* You can *.submit-mora* to your faction for Lucons and Faction Points!`,
  `💡 *Did you know?* The *.gear* command shows all your equipped gear and durability!`,
  `💡 *Did you know?* Rift faction players get a 15% chance to DOUBLE aura gain on PvP wins!`,
  `💡 *Did you know?* Purity faction players deal +10% damage in PvP battles!`,
  `💡 *Did you know?* Harmony faction players get +5% catch bonus on wild Mora!`,
  `💡 *Did you know?* Use *.switch* during battle to swap to another Mora in your party!`,
  `💡 *Did you know?* Gear degrades during battles and hunts — check durability with *.gear*!`,
  `💡 *Did you know?* Resonance is earned from wild encounters — sanctuary, execute, or harvest!`,
  `💡 *Did you know?* Use *.map* to see available hunting terrains and their difficulties!`,
  `💡 *Did you know?* You can *.travel* to different terrains for different Mora types!`,
  `💡 *Did you know?* Use *.profile* to check your stats, aura, level, and faction info!`,
  `💡 *Did you know?* The faction leaderboard (*.f-lb*) is ranked by Resonance!`,
  `💡 *Did you know?* Use *.facpoints* to see the faction war standings as a visual graph!`,
  `💡 *Did you know?* Use *.missions* to see available faction missions for rewards!`,
  `💡 *Did you know?* Wild Mora battles give XP to your active Mora — great for leveling!`,
  `💡 *Did you know?* You can *.consume* items from your inventory to restore HP or energy!`,
  `💡 *Did you know?* Use *.daily* and *.weekly* to claim free Lucons!`,
  `💡 *Did you know?* Corrupted Mora deal more damage for Rift players but cause HP burn!`,
  `💡 *Did you know?* Higher rarity Mora give more Resonance when sent to sanctuary!`,
  `💡 *Did you know?* Type *.guide* for a full walkthrough of Lumora's world!`,
  `💡 *Did you know?* Battle someone with *.battle @player* — may the best Lumorian win!`,
];

// ══════════════════════════════════════════════════════════════
// BATTLE ANNOUNCER — live commentary during fights
// ══════════════════════════════════════════════════════════════
const BATTLE_COMMENTARY = {
  bigHit: [
    "OHHH! That's gonna leave a mark! 💥",
    "DEVASTATING blow! The crowd goes WILD! 🔥",
    "That hit was PERSONAL! 😱",
    "CRITICAL DAMAGE! Someone call a healer! 🚑",
    "The Rift itself felt THAT one! 💀",
  ],
  miss: [
    "A swing and a MISS! Embarrassing! 😂",
    "Whiffed it completely! The wind dodged better! 💨",
    "Not even close! Were they aiming at the sky? 🌙",
    "That attack hit absolutely nothing. Impressive, honestly. 🗿",
  ],
  lowHp: [
    "They're hanging on by a THREAD! One more hit and it's OVER! 😰",
    "HP is in the red zone! This is CRITICAL! 🔴",
    "Someone's about to go DOWN! The tension is REAL! ⚡",
    "BARELY standing! This could be the final round! 🏴",
  ],
  faint: [
    "AND THEY'RE DOWN! That Mora is OUT! ☠️",
    "KNOCKED OUT! Another one bites the dust! 💀",
    "It's OVER for that Mora! Time to switch or surrender! 🪦",
  ],
  switch: [
    "A tactical switch! Smart move or desperation? 🤔",
    "New Mora on the field! Let's see what they've got! 🔄",
    "The swap is in! This could change EVERYTHING! ⚡",
  ],
  charge: [
    "Taking a breather to charge up! Bold strategy! 🔋",
    "Charging energy while under fire? That takes GUTS! 💠",
    "Powering up for something BIG! Watch out! ⚡",
  ],
  startBattle: [
    "LET'S GET READY TO RUMBLEEEE! ⚔️🔥",
    "Two Lumorians enter... only ONE leaves victorious! 🏟️",
    "The arena is SET! The crowd is ROARING! It's BATTLE TIME! 🌌",
    "Sparks are flying! This is going to be LEGENDARY! ⚡",
    "The Lumora crystals pulse with anticipation... FIGHT! 💎",
  ],
};

function getBattleCommentary(type) {
  const pool = BATTLE_COMMENTARY[type];
  if (!pool || !pool.length) return "";
  return pickRandom(pool);
}

// ══════════════════════════════════════════════════════════════
// IDLE LOOP — runs in background, sends messages to groups
// ══════════════════════════════════════════════════════════════
let idleTimer = null;
let lastIdleType = null; // track to alternate between idle and tips

function startIdleLoop(sock, groupJids) {
  if (idleTimer) clearInterval(idleTimer);

  // Send a random message every 45-90 minutes
  function scheduleNext() {
    const delay = (15 + Math.floor(Math.random() * 15)) * 60 * 1000;
    idleTimer = setTimeout(async () => {
      try {
        if (!groupJids || groupJids.length === 0) {
          scheduleNext();
          return;
        }

        // Pick a random group
        const targetGroup = pickRandom(groupJids);

        // Alternate between idle chatter and tips
        let message;
        if (lastIdleType === "idle" || lastIdleType === null) {
          message = pickRandom(TIPS);
          lastIdleType = "tip";
        } else {
          message = pickRandom(IDLE_MESSAGES);
          lastIdleType = "idle";
        }

        await sock.sendMessage(targetGroup, { text: message });
      } catch (e) {
        console.log("Idle message error:", e.message);
      }
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}

function stopIdleLoop() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

module.exports = {
  IDLE_MESSAGES,
  TIPS,
  BATTLE_COMMENTARY,
  getBattleCommentary,
  startIdleLoop,
  stopIdleLoop,
  pickRandom,
};

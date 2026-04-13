// ============================
// FACTION GROUP WELCOME & LEAVE SYSTEM
// ============================

// ── RANDOMIZED WELCOME MESSAGES ──────────────────────────────
const WELCOME_MESSAGES = {
  harmony: [
    `🌿 Another soul drawn to balance... Welcome to *Harmony*, where the strongest protect the weakest.`,
    `🌿 The forest whispers your name... You belong here now. Welcome to *Harmony*.`,
    `🌿 A new Lumorian walks the path of balance. May your roots grow deep. Welcome!`,
    `🌿 The spirits of Harmony have accepted you. Don't disappoint them.`,
    `🌿 Peace is not weakness — it is the hardest path of all. Welcome to *Harmony*.`,
    `🌿 Nature bends to welcome you. The Harmony Sanctuary grows stronger today.`,
    `🌿 You chose unity over destruction. Wise. Welcome to the *Harmony Lumorians*.`,
    `🌿 The canopy parts for you, newcomer. Step into the light of *Harmony*.`,
  ],
  purity: [
    `⚔️ Fresh blood for the Order. Prove your worth or be forgotten. Welcome to *Purity*.`,
    `⚔️ Another warrior answers the call. The *Purity Order* demands excellence — can you deliver?`,
    `⚔️ Weakness dies here. Strength is forged. Welcome to the *Purity Order*.`,
    `⚔️ The Order watches. Every move. Every battle. Welcome — now prove yourself.`,
    `⚔️ Steel sharpens steel. You just joined the forge. Welcome to *Purity*.`,
    `⚔️ The battlefield doesn't care about your feelings. Only results. Welcome to the *Order*.`,
    `⚔️ Another blade in the arsenal. The *Purity Order* grows. Don't dull the edge.`,
    `⚔️ Discipline. Power. Victory. That's the *Purity* way. Welcome, soldier.`,
  ],
  rift: [
    `🕶️ You dare step into the void? Bold. Welcome to the *Rift*.`,
    `🕶️ Chaos recognizes its own... The *Rift* embraces you. Don't resist.`,
    `🕶️ Another one who chose power over safety. Respect. Welcome to the *Rift Seekers*.`,
    `🕶️ The void doesn't judge — it consumes. Welcome to the *Rift*. Try to survive.`,
    `🕶️ Rules are for the weak. You're in the *Rift* now. Act accordingly.`,
    `🕶️ The shadows have been waiting for you... Welcome, Rift Seeker.`,
    `🕶️ Forbidden power flows through here. You either control it or it controls you. Welcome.`,
    `🕶️ Most don't last a week in the *Rift*. Let's see what you're made of.`,
  ],
  none: [
    `✨ A new traveler arrives at the Grand Capital! Welcome, adventurer!`,
    `✨ The gates open for another soul. Welcome to *Lumora*!`,
    `✨ Another legend begins here. Welcome to the Grand Capital!`,
    `✨ The Capital buzzes with a new arrival. Make your mark, traveler!`,
    `✨ Welcome to the crossroads of all factions. Your journey starts now!`,
  ]
};

// ── LEAVE / GOODBYE TAUNTS ───────────────────────────────────
const LEAVE_MESSAGES = [
  `Couldn't handle the heat, huh? 🔥 One less to worry about.`,
  `And just like that... *poof*. Gone. Like they never existed. 💨`,
  `Another one bites the dust. The weak always leave first. 😴`,
  `Imagine joining and then leaving... couldn't be me. 🤷`,
  `They didn't just leave — they *rage quit life*. 💀`,
  `Oh no! Anyway... 🗿`,
  `The door hits different on the way out. 🚪💥`,
  `Someone check if they tripped on their way out. 😂`,
  `Farewell, fallen warrior. May you find a game easier than this one. ✌️`,
  `Left the group? That's the most action they've taken all week. 😭`,
  `They said "I'll be back"... no they won't. 🫡`,
  `We lost a soldier today... actually nah, we lost dead weight. 💪`,
  `Plot twist: they didn't leave, they got *spiritually evicted*. 👻`,
  `Rest in peace to their motivation. Gone too soon. 🪦`,
  `That's one way to dodge a battle invitation... 🏃💨`,
  `Breaking news: Local player discovers the exit button. More at 11. 📰`,
  `They left before the Moras could miss them. Spoiler: they won't. 🐉`,
  `And nothing of value was lost that day. 📉`,
  `Some say they're still looking for a group that deserves them... 🔭`,
  `Gone but not forgotten. Jk we already forgot. 🧠💨`,
];

// ── HELPERS ──────────────────────────────────────────────────
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================
// SEND WELCOME
// ============================
async function sendFactionWelcome(sock, chatId, faction) {
  const pool = WELCOME_MESSAGES[faction] || WELCOME_MESSAGES.none;
  return sock.sendMessage(chatId, { text: pickRandom(pool) });
}

// ============================
// SEND LEAVE TAUNT
// ============================
async function sendLeaveTaunt(sock, chatId, leaverJid) {
  const taunt = pickRandom(LEAVE_MESSAGES);
  // Ensure leaverJid is a string
  const jidStr = typeof leaverJid === 'string' ? leaverJid : String(leaverJid);
  const tag = `@${jidStr.split('@')[0]}`;
  return sock.sendMessage(chatId, {
    text: `${tag} just left the group.\n\n${taunt}`,
    mentions: [jidStr]
  });
}

module.exports = {
  sendFactionWelcome,
  sendLeaveTaunt,
  WELCOME_MESSAGES,
  LEAVE_MESSAGES,
};

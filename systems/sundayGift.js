// ══════════════════════════════════════════════════════════════
//  THE SUNDAY GIFT  —  weekly scripture trial
// ══════════════════════════════════════════════════════════════
//  Opens every Sunday at 00:00 CAT (UTC+2), closes 24 hours later.
//  A pool of AI-written Bible-knowledge questions is generated fresh
//  each week (with a curated fallback bank when the AI is offline).
//  Players choose 4–10 questions; six wrong answers close the Gift.
//
//  Rewards scale with how many they got right:
//    💰 Lucons (guaranteed, ~3k on a clean 5/5)
//    ✨ XP
//    🐉 one guaranteed random Epic Mora shard
//    🕊️ a Blessing on a perfect run
//    🎁 a rotating random bonus (Lucons · shard · Aura · relic)
//
//  Commands: .gift / .gift-begin / .gift-count N / .gift-answer A
//            .gift-quit / .gift-lb / .gift-help
// ══════════════════════════════════════════════════════════════
"use strict";

const fs = require("fs");
const path = require("path");
const itemsSystem = require("./items");
const ui = require("./ui");
const buttonsSystem = require("./buttons");

const DATA_FILE = path.join(__dirname, "..", "data", "sunday_gift.json");

const CAT_OFFSET_MS = 2 * 60 * 60 * 1000; // Central Africa Time = UTC+2
const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 10;
const MAX_FAILURES = 6;   // fail this many and the Gift closes on you
const POOL_SIZE = 24;     // questions written per Sunday

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-3-haiku";
const GIFT_TITLE = "THE SUNDAY GIFT";

const LETTERS = ["A", "B", "C", "D"];

// ── Static button map — registered once at boot ────────────────
function registerButtons() {
  const map = {
    "📖 Begin the Gift": ".gift-begin",
    "🔁 Continue": ".gift-begin",
    "🏆 Standings": ".gift-lb",
    "❓ How it Works": ".gift-help",
    "❌ Leave the Gift": ".gift-quit",
    "A": ".gift-answer A",
    "B": ".gift-answer B",
    "C": ".gift-answer C",
    "D": ".gift-answer D",
  };
  for (let n = MIN_QUESTIONS; n <= MAX_QUESTIONS; n++) {
    map[`${n} Questions`] = `.gift-count ${n}`;
  }
  buttonsSystem.mapButtons(map);
}
registerButtons();

// ══════════════════════════════════════════════════════════════
// TIME HELPERS  (CAT = UTC+2; "Sunday" is measured in CAT)
// ══════════════════════════════════════════════════════════════
function catDate(now = Date.now()) {
  return new Date(now + CAT_OFFSET_MS);
}

function activeWeekKey(now = Date.now()) {
  const d = catDate(now);
  if (d.getUTCDay() !== 0) return null; // not Sunday in CAT
  return d.toISOString().slice(0, 10);
}

function nextSundayStartMs(now = Date.now()) {
  const shift = now + CAT_OFFSET_MS;
  const startOfDay = Math.floor(shift / DAY_MS) * DAY_MS;
  const dow = new Date(shift).getUTCDay();
  let days = (7 - dow) % 7;
  if (days === 0) days = 7; // today is Sunday → next window is a week out
  return startOfDay + days * DAY_MS - CAT_OFFSET_MS;
}

function giftWindowEndMs(now = Date.now()) {
  const shift = now + CAT_OFFSET_MS;
  const startOfDayShift = Math.floor(shift / DAY_MS) * DAY_MS;
  return startOfDayShift - CAT_OFFSET_MS + DAY_MS;
}

function formatCountdown(ms) {
  const diff = Math.max(0, Number(ms) || 0);
  const d = Math.floor(diff / DAY_MS);
  const h = Math.floor((diff % DAY_MS) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
}

function fmtCAT(ms = Date.now()) {
  return catDate(ms).toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
function defaultState() {
  return {
    weekKey: null,
    generatedAt: 0,
    source: null,
    questions: [],
    sessions: {},
    standings: {},
    lastAnnouncedWeek: null,
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(st) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(st, null, 2));
  } catch (e) {
    console.log("[sundayGift] state save failed:", e?.message || e);
  }
}

// ══════════════════════════════════════════════════════════════
// FALLBACK QUESTION BANK  (used when the AI is unavailable)
// ══════════════════════════════════════════════════════════════
const FALLBACK_BANK = [
  { q: "On which mountain did Moses die?", options: ["Mount Sinai", "Mount Nebo", "Mount Carmel", "Mount Ararat"], answer: 1, ref: "Deuteronomy 34:1", topic: "places" },
  { q: "Who was swallowed by a great fish?", options: ["Jonah", "Elijah", "Isaiah", "Amos"], answer: 0, ref: "Jonah 1:17", topic: "people" },
  { q: "How many days and nights did it rain during the flood?", options: ["7", "12", "40", "100"], answer: 2, ref: "Genesis 7:12", topic: "numbers" },
  { q: "Which sea did Moses part?", options: ["The Dead Sea", "The Red Sea", "The Sea of Galilee", "The Mediterranean"], answer: 1, ref: "Exodus 14:21", topic: "places" },
  { q: "Who betrayed Jesus for thirty pieces of silver?", options: ["Peter", "Thomas", "Barabbas", "Judas Iscariot"], answer: 3, ref: "Matthew 26:15", topic: "people" },
  { q: "In which town was Jesus born?", options: ["Nazareth", "Bethlehem", "Jerusalem", "Capernaum"], answer: 1, ref: "Luke 2:4-7", topic: "places" },
  { q: "Who led the Israelites into the Promised Land?", options: ["Joshua", "Aaron", "Caleb", "Samuel"], answer: 0, ref: "Joshua 1:1-9", topic: "people" },
  { q: "How many disciples did Jesus choose?", options: ["Seven", "Ten", "Twelve", "Seventy"], answer: 2, ref: "Luke 6:13", topic: "numbers" },
  { q: "What did God create on the very first day?", options: ["The stars", "Light", "The oceans", "Man"], answer: 1, ref: "Genesis 1:3", topic: "creation" },
  { q: "Who was the first man created?", options: ["Seth", "Noah", "Adam", "Enoch"], answer: 2, ref: "Genesis 2:20", topic: "people" },
  { q: "Who received the Ten Commandments on the mountain?", options: ["Moses", "Abraham", "Joshua", "Aaron"], answer: 0, ref: "Exodus 31:18", topic: "people" },
  { q: "What did Jesus turn water into at Cana?", options: ["Oil", "Milk", "Honey", "Wine"], answer: 3, ref: "John 2:1-11", topic: "miracles" },
  { q: "Who was the strongest man in the Bible?", options: ["Goliath", "Samson", "Samson's father Manoah", "Ehud"], answer: 1, ref: "Judges 16", topic: "people" },
  { q: "Which apostle walked on water toward Jesus?", options: ["John", "Andrew", "Peter", "James"], answer: 2, ref: "Matthew 14:29", topic: "people" },
  { q: "What is the first book of the Bible?", options: ["Exodus", "Genesis", "Job", "Leviticus"], answer: 1, ref: "Genesis 1:1", topic: "books" },
  { q: "Who wrote most of the Psalms?", options: ["Solomon", "David", "Asaph", "Moses"], answer: 1, ref: "Psalms", topic: "books" },
  { q: "On which day did God rest after creation?", options: ["The fifth", "The sixth", "The seventh", "The eighth"], answer: 2, ref: "Genesis 2:2", topic: "creation" },
  { q: "What did John the Baptist eat in the wilderness?", options: ["Bread and fish", "Locusts and wild honey", "Figs and dates", "Barley cakes"], answer: 1, ref: "Matthew 3:4", topic: "people" },
  { q: "Which city's walls fell after Israel marched around them?", options: ["Jericho", "Ai", "Hebron", "Bethel"], answer: 0, ref: "Joshua 6", topic: "places" },
  { q: "Who denied Jesus three times before the rooster crowed?", options: ["Peter", "Judas", "Philip", "Bartholomew"], answer: 0, ref: "Luke 22:57-62", topic: "people" },
  { q: "What was the name of Abraham's promised son?", options: ["Ishmael", "Isaac", "Jacob", "Esau"], answer: 1, ref: "Genesis 21:3", topic: "people" },
  { q: "Which prophet was taken up to heaven in a whirlwind?", options: ["Elisha", "Elijah", "Ezekiel", "Jeremiah"], answer: 1, ref: "2 Kings 2:11", topic: "people" },
  { q: "How many people were saved on Noah's ark?", options: ["Two", "Four", "Eight", "Twelve"], answer: 2, ref: "1 Peter 3:20", topic: "numbers" },
  { q: "What is the last book of the Bible?", options: ["Jude", "Hebrews", "Revelation", "Malachi"], answer: 2, ref: "Revelation 1:1", topic: "books" },
  { q: "Who was thrown into the lions' den?", options: ["Daniel", "Shadrach", "Nehemiah", "Ezra"], answer: 0, ref: "Daniel 6", topic: "people" },
  { q: "What did David use to defeat Goliath?", options: ["A spear", "A sword", "A sling and a stone", "A bow"], answer: 2, ref: "1 Samuel 17:49", topic: "events" },
  { q: "On which mountain did Elijah face the prophets of Baal?", options: ["Mount Carmel", "Mount Horeb", "Mount Zion", "Mount Ebal"], answer: 0, ref: "1 Kings 18:19", topic: "places" },
  { q: "\"The Lord is my shepherd\" opens which Psalm?", options: ["Psalm 1", "Psalm 23", "Psalm 51", "Psalm 91"], answer: 1, ref: "Psalm 23:1", topic: "verses" },
  { q: "What is the shortest verse in the Bible?", options: ["\"Pray continually.\"", "\"Jesus wept.\"", "\"Rejoice always.\"", "\"God is love.\""], answer: 1, ref: "John 11:35", topic: "verses" },
  { q: "Who said, \"I am the way, the truth, and the life\"?", options: ["Paul", "Peter", "Jesus", "John"], answer: 2, ref: "John 14:6", topic: "verses" },
  { q: "Which book opens with \"In the beginning was the Word\"?", options: ["Mark", "Luke", "Acts", "John"], answer: 3, ref: "John 1:1", topic: "verses" },
  { q: "How many days had Lazarus been dead when Jesus raised him?", options: ["One", "Two", "Three", "Four"], answer: 3, ref: "John 11:39", topic: "numbers" },
  { q: "Which river was Jesus baptised in?", options: ["The Nile", "The Jordan", "The Euphrates", "The Kishon"], answer: 1, ref: "Matthew 3:13", topic: "places" },
  { q: "Who was the mother of Jesus?", options: ["Martha", "Elizabeth", "Mary", "Mary Magdalene"], answer: 2, ref: "Luke 1:31", topic: "people" },
  { q: "How many plagues struck Egypt before Pharaoh let Israel go?", options: ["Seven", "Ten", "Twelve", "Forty"], answer: 1, ref: "Exodus 7-12", topic: "numbers" },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildBankQuestions(n = POOL_SIZE) {
  return shuffle(FALLBACK_BANK).slice(0, n);
}

// ══════════════════════════════════════════════════════════════
// AI QUESTION GENERATION  (OpenRouter, same key Star uses)
// ══════════════════════════════════════════════════════════════
function buildPrompt(count) {
  return (
    `You write the weekly scripture quiz for the Sunday Gift, a Bible-knowledge ` +
    `event. Produce exactly ${count} multiple-choice questions.\n\n` +
    `Mix these topics: places (e.g. "On which mountain did Moses die?" → Mount Nebo), ` +
    `people, numbers, famous events, parables, and well-known verses.\n\n` +
    `Rules:\n` +
    `- Exactly 4 options per question; exactly ONE is correct.\n` +
    `- Distractors must be plausible but unambiguously wrong.\n` +
    `- Keep every question under 150 characters. No trick questions.\n` +
    `- Never repeat a question. Vary which option index is correct.\n` +
    `- Questions must be answerable from the Bible alone.\n\n` +
    `Return ONLY a JSON array — no prose, no markdown fences:\n` +
    `[{"q":"On which mountain did Moses die?","options":["Mount Sinai","Mount Nebo","Mount Carmel","Mount Ararat"],"answer":1,"ref":"Deuteronomy 34:1","topic":"places"}]`
  );
}

function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const q = String(entry.q || entry.question || "").trim();
    const options = Array.isArray(entry.options)
      ? entry.options.map((o) => String(o ?? "").trim())
      : [];
    let answer = Number(entry.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      answer = options.findIndex((o) => o && o === String(entry.answer || "").trim());
    }
    if (!q || options.length !== 4 || options.some((o) => !o)) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      q,
      options,
      answer,
      ref: String(entry.ref || entry.reference || "").trim(),
      topic: String(entry.topic || "scripture").trim(),
    });
  }
  return out;
}

function extractJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function generateQuestionsWithAI(count = POOL_SIZE) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lumora-bot.local",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a precise Biblical quiz writer. You output only valid JSON." },
          { role: "user", content: buildPrompt(count) },
        ],
        max_tokens: 2600,
      }),
    });
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const text = data?.choices?.[0]?.message?.content || "";
    const parsed = extractJsonArray(text);
    const qs = normalizeQuestions(parsed);
    if (qs.length < MAX_QUESTIONS) {
      console.log(`[sundayGift] AI returned ${qs.length} usable questions — using fallback bank.`);
      return null;
    }
    return qs.slice(0, count);
  } catch (e) {
    console.log("[sundayGift] AI generation failed:", e?.message || e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// POOL MANAGEMENT — one fresh pool per Sunday
// ══════════════════════════════════════════════════════════════
let _genPromise = null;

async function ensureQuestions({ force = false } = {}) {
  const now = Date.now();
  const key = activeWeekKey(now);
  const st = loadState();
  const poolReady = Array.isArray(st.questions) && st.questions.length >= MAX_QUESTIONS;

  if (!force && key && st.weekKey === key && poolReady) {
    return { generated: false, source: st.source, state: st };
  }

  if (_genPromise) return _genPromise;

  _genPromise = (async () => {
    try {
      const ai = await generateQuestionsWithAI(POOL_SIZE);
      const source = ai && ai.length >= MAX_QUESTIONS ? "ai" : "bank";
      const questions = source === "ai" ? ai : buildBankQuestions(POOL_SIZE);

      const prevKey = st.weekKey;
      // New week → fresh run for everyone.
      if (key && prevKey && prevKey !== key) st.sessions = {};
      if (key && !prevKey) st.sessions = {};

      st.weekKey = key || prevKey || null;
      st.generatedAt = Date.now();
      st.source = source;
      st.questions = questions;

      // Keep standings tidy — last 8 weeks only.
      const keys = Object.keys(st.standings || {}).sort();
      while (keys.length > 8) {
        const drop = keys.shift();
        delete st.standings[drop];
      }

      saveState(st);
      console.log(`[sundayGift] pool generated for ${st.weekKey} (${source}, ${questions.length} questions)`);
      return { generated: true, source, state: st };
    } finally {
      _genPromise = null;
    }
  })();

  return _genPromise;
}

// ══════════════════════════════════════════════════════════════
// REWARDS
// ══════════════════════════════════════════════════════════════
// A clean 5/5 pays ~3,200 Lucons. Longer trials pay more, but the
// per-correct rate is what really matters.
function computeRewards(correct, total) {
  const c = Math.max(0, Number(correct) || 0);
  const t = Math.max(0, Number(total) || 0);
  const perfect = t > 0 && c === t;
  if (c === 0) return { lucons: 150, xp: 15, perfect: false, failed: true };
  const lucons = 300 * c + 100 * t + (perfect ? 1200 : 0);
  const xp = 30 + 25 * c;
  return { lucons, xp, perfect, failed: false };
}

function grantRandomEpicShard(player, loadMora) {
  const list = (typeof loadMora === "function" ? loadMora() : []) || [];
  const epics = list.filter((m) => String(m?.rarity || "").toLowerCase() === "epic");
  if (!epics.length) return null;
  const sp = epics[Math.floor(Math.random() * epics.length)];
  const key = String(sp.id ?? sp.name ?? "").toLowerCase();
  if (!key) return null;
  if (!player.shards || typeof player.shards !== "object") player.shards = {};
  // Event rewards bypass the vault cap — a Gift is never refused.
  player.shards[key] = Number(player.shards[key] || 0) + 1;
  return sp;
}

function grantBlessing(player, weekKey) {
  if (!Array.isArray(player.blessings)) player.blessings = [];
  const id = "blessing-of-the-faithful";
  const now = Date.now();
  const existing = player.blessings.find((b) => b && b.id === id);
  if (existing) {
    existing.expiresAt = now + 7 * DAY_MS;
    existing.lastGrantedAt = now;
    existing.weekKey = weekKey || existing.weekKey;
    return existing;
  }
  const blessing = {
    id,
    name: "Blessing of the Faithful",
    source: "sunday-gift",
    grantedAt: now,
    expiresAt: now + 7 * DAY_MS,
    weekKey: weekKey || null,
    // Reserved for the upcoming blessings system (see docs/FUTURE_UPDATES.md).
    effectKey: "energyDrainReduction",
    effectValue: 0.10,
    note: "Reduces hunt energy drain once the Blessings system ships.",
  };
  player.blessings.push(blessing);
  return blessing;
}

const BONUS_ITEMS = ["SCR_003", "SCR_004", "SCR_011", "ITM_002", "ITM_003"];

function grantBonus(ctx, player) {
  const roll = Math.random();
  if (roll < 0.30) {
    const extra = 800 + Math.floor(Math.random() * 1700);
    player.lucons = Number(player.lucons || 0) + extra;
    return `🎁 Bonus purse — *+${extra} Lucons*`;
  }
  if (roll < 0.55) {
    const sp = grantRandomEpicShard(player, ctx.loadMora);
    if (sp) return `🎁 Bonus shard — *${sp.name}*`;
    const extra = 600;
    player.lucons = Number(player.lucons || 0) + extra;
    return `🎁 Bonus purse — *+${extra} Lucons*`;
  }
  if (roll < 0.80) {
    const aura = 15 + Math.floor(Math.random() * 26);
    if (ctx.auraSystem?.addAura) ctx.auraSystem.addAura(player, aura);
    else player.aura = Number(player.aura || 0) + aura;
    return `🎁 Surge of Aura — *+${aura} Aura*`;
  }
  const itemId = BONUS_ITEMS[Math.floor(Math.random() * BONUS_ITEMS.length)];
  const itemsDb = itemsSystem.loadItems();
  const item = itemsDb[itemId];
  if (item) {
    const added = itemsSystem.addItem(player, itemId, 1, itemsDb);
    if (added?.ok) return `🎁 Gift relic — *${item.name}*`;
  }
  const extra = 700;
  player.lucons = Number(player.lucons || 0) + extra;
  return `🎁 Bonus purse — *+${extra} Lucons*`;
}

function grantRewards(ctx, player, correct, total, weekKey) {
  const rewards = computeRewards(correct, total);
  player.lucons = Number(player.lucons || 0) + rewards.lucons;

  const lines = [`💰 *${rewards.lucons} Lucons*`];

  try {
    if (ctx.xpSystem?.addPlayerXp) ctx.xpSystem.addPlayerXp(player, rewards.xp);
    else player.xp = Number(player.xp || 0) + rewards.xp;
  } catch {}
  lines.push(`✨ *${rewards.xp} XP*`);

  if (!rewards.failed) {
    const epic = grantRandomEpicShard(player, ctx.loadMora);
    if (epic) lines.push(`🐉 *${epic.name}* — one random Epic shard`);
    if (rewards.perfect) {
      const b = grantBlessing(player, weekKey);
      if (b) lines.push(`🕊️ *${b.name}* — a perfect trial`);
    }
    const bonus = grantBonus(ctx, player);
    if (bonus) lines.push(bonus);
  }

  return { rewards, lines };
}

// ══════════════════════════════════════════════════════════════
// SMALL HELPERS
// ══════════════════════════════════════════════════════════════
function displayName(player, jid) {
  const u = player?.username && String(player.username).trim();
  return u || String(jid || "").split("@")[0];
}

function strikesLeft(session) {
  return Math.max(0, MAX_FAILURES - Number(session?.wrong || 0));
}

function giftHeader(sub) {
  return (
    `═══════════════════════\n` +
    `  📜 *${GIFT_TITLE}*\n` +
    `═══════════════════════\n` +
    (sub ? `\n${sub}` : "")
  );
}

function closedCard(now = Date.now()) {
  const next = nextSundayStartMs(now);
  return (
    giftHeader() +
    `\n🕯️ *The Gift is closed.*\n\n` +
    `It opens again in *${formatCountdown(next - now)}* — Sunday, 00:00 CAT.\n\n` +
    `Every Sunday the scriptures open for 24 hours.\nAnswer, and receive.\n\n` +
    `_Come back on Sunday, Lumorian._`
  );
}

const CORRECT_LINES = [
  "✅ *Correct!* The scriptures remember you.",
  "✅ *Right.* Well read, Lumorian.",
  "✅ *Correct!* The Gift glows a little brighter.",
  "✅ *Right.* Wisdom is its own reward — mostly.",
];
const WRONG_LINES = [
  "❌ *Not quite.*",
  "❌ *Missed.* The page turns anyway.",
  "❌ *Wrong.* Dust yourself and read on.",
  "❌ *No.* But the faithful keep going.",
];
function pickLine(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function questionText(st, session, feedback) {
  const poolIdx = session.order[session.index];
  const q = st.questions[poolIdx] || { q: "(question unavailable)", options: [], answer: 0 };
  const head =
    (feedback ? `${feedback}\n\n` : "") +
    giftHeader(`🌿 *Question ${session.index + 1} / ${session.total}*`) +
    `\n\n🕊️ Strikes remaining: *${strikesLeft(session)}*\n\n` +
    `_${q.q}_\n\n`;
  const opts = q.options
    .map((o, i) => `*${LETTERS[i]})* ${o}`)
    .join("\n");
  const tally = `\n\n📊 So far — ✅ ${session.correct} · ❌ ${session.wrong}`;
  return head + opts + tally;
}

function questionButtons() {
  return ["A", "B", "C", "D"];
}

async function sendQuestion(ctx, chatId, senderId, msg, st, session, feedback) {
  const { sock } = ctx;
  const text = questionText(st, session, feedback);
  return buttonsSystem.sendButtons(sock, chatId, text, questionButtons(), {
    title: GIFT_TITLE,
    footer: "Tap a letter to answer",
    quoted: msg,
  });
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════
async function cmdGift(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.register`." }, { quoted: msg });
  }

  const now = Date.now();
  const key = activeWeekKey(now);
  if (!key) {
    return buttonsSystem.sendButtons(sock, chatId, closedCard(now), ["❓ How it Works"], {
      title: GIFT_TITLE,
      footer: "Opens Sunday · 00:00 CAT",
      quoted: msg,
    });
  }

  await ensureQuestions();
  const st = loadState();
  const session = st.sessions[senderId];
  const end = giftWindowEndMs(now);

  let sub = `🗓️ *Open now* — Sunday, ${st.weekKey || fmtCAT(now)}\n`;
  sub += `⏳ Closes in *${formatCountdown(end - now)}*\n`;
  sub += `📚 Pool this week: *${st.questions.length}* questions ` +
    `_(written by ${st.source === "ai" ? "the scribe AI" : "the temple archives"})_\n`;

  if (session?.claimed) {
    sub += `\n✅ You already received this week's Gift ` +
      `(*${session.correct}/${session.total}* correct).\nThe next one arrives Sunday.`;
    return buttonsSystem.sendButtons(sock, chatId, giftHeader(sub), ["🏆 Standings", "❓ How it Works"], {
      title: GIFT_TITLE,
      footer: "One Gift per Sunday",
      quoted: msg,
    });
  }

  if (session) {
    sub += `\n▶️ *Trial in progress* — question *${session.index + 1}/${session.total}*, ` +
      `✅ ${session.correct} · ❌ ${session.wrong}`;
    return buttonsSystem.sendButtons(sock, chatId, giftHeader(sub), ["🔁 Continue", "❌ Leave the Gift", "🏆 Standings"], {
      title: GIFT_TITLE,
      footer: "Resume where you left off",
      quoted: msg,
    });
  }

  sub +=
    `\n🕯️ *Choose your trial.* Answer between *${MIN_QUESTIONS} and ${MAX_QUESTIONS}* questions.\n` +
    `The more you take on, the more Lucons, XP and Mora the Gift pours back.\n\n` +
    `⛔ ${MAX_FAILURES} wrong answers and the Gift closes on you.\n\n` +
    `Rewards always include *Lucons*, *XP* and a random *Epic Mora*.`;

  return buttonsSystem.sendButtons(sock, chatId, giftHeader(sub), ["📖 Begin the Gift", "🏆 Standings", "❓ How it Works"], {
    title: GIFT_TITLE,
    footer: "Tap to begin",
    quoted: msg,
  });
}

async function cmdGiftBegin(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.register`." }, { quoted: msg });
  }

  const now = Date.now();
  const key = activeWeekKey(now);
  if (!key) {
    return buttonsSystem.sendButtons(sock, chatId, closedCard(now), ["❓ How it Works"], {
      title: GIFT_TITLE,
      quoted: msg,
    });
  }

  await ensureQuestions();
  const st = loadState();
  let session = st.sessions[senderId];

  if (session?.claimed) {
    return buttonsSystem.sendButtons(
      sock, chatId,
      giftHeader(`✅ You already claimed this week's Gift (*${session.correct}/${session.total}*).\n\nThe next Gift opens Sunday, 00:00 CAT.`),
      ["🏆 Standings", "❓ How it Works"],
      { title: GIFT_TITLE, quoted: msg }
    );
  }

  if (session && session.weekKey === st.weekKey) {
    return sendQuestion(ctx, chatId, senderId, msg, st, session, "▶️ *Resuming your trial…*");
  }

  const countButtons = [];
  for (let n = MIN_QUESTIONS; n <= MAX_QUESTIONS; n++) countButtons.push(`${n} Questions`);

  const text =
    giftHeader(
      `🕯️ *How many questions will you answer?*\n\n` +
      `4 — a quick blessing.\n` +
      `10 — the full trial, the richest reward.\n\n` +
      `Guaranteed either way: *Lucons*, *XP*, and a random *Epic Mora*.\n` +
      `Beat all of them and earn a *Blessing*.\n\n` +
      `Fail ${MAX_FAILURES} and the Gift closes on you.`
    );

  return buttonsSystem.sendButtons(sock, chatId, text, countButtons, {
    title: GIFT_TITLE,
    footer: "Pick your trial length",
    quoted: msg,
  });
}

async function cmdGiftCount(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.register`." }, { quoted: msg });
  }

  const now = Date.now();
  if (!activeWeekKey(now)) {
    return buttonsSystem.sendButtons(sock, chatId, closedCard(now), ["❓ How it Works"], {
      title: GIFT_TITLE, quoted: msg,
    });
  }

  const n = Number.parseInt(String(args[0] || ""), 10);
  if (!Number.isFinite(n) || n < MIN_QUESTIONS || n > MAX_QUESTIONS) {
    return sock.sendMessage(
      chatId,
      { text: `❌ Choose a number of questions from *${MIN_QUESTIONS} to ${MAX_QUESTIONS}*.\nTry \`.gift-begin\`.` },
      { quoted: msg }
    );
  }

  await ensureQuestions();
  const st = loadState();
  const existing = st.sessions[senderId];
  if (existing?.claimed) {
    return buttonsSystem.sendButtons(
      sock, chatId,
      giftHeader(`✅ You already claimed this week's Gift. Come back on Sunday.`),
      ["🏆 Standings"], { title: GIFT_TITLE, quoted: msg }
    );
  }
  if (existing && existing.weekKey === st.weekKey && existing.index < existing.total) {
    return sendQuestion(ctx, chatId, senderId, msg, st, existing, "▶️ *Resuming your trial…*");
  }

  const order = shuffle(st.questions.map((_, i) => i)).slice(0, n);
  const session = {
    weekKey: st.weekKey,
    total: order.length,
    order,
    index: 0,
    correct: 0,
    wrong: 0,
    claimed: false,
    startedAt: now,
    lastAt: now,
  };
  st.sessions[senderId] = session;
  saveState(st);

  return sendQuestion(
    ctx, chatId, senderId, msg, st, session,
    `🕯️ *The Gift opens.* ${n} questions. ${MAX_FAILURES} strikes. Begin.`
  );
}

async function cmdGiftAnswer(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.register`." }, { quoted: msg });
  }

  const now = Date.now();
  if (!activeWeekKey(now)) {
    return buttonsSystem.sendButtons(sock, chatId, closedCard(now), ["❓ How it Works"], {
      title: GIFT_TITLE, quoted: msg,
    });
  }

  const st = loadState();
  const session = st.sessions[senderId];
  if (!session || session.claimed || session.weekKey !== st.weekKey) {
    return buttonsSystem.sendButtons(
      sock, chatId,
      giftHeader(`❓ You have no trial in progress this Sunday.`),
      ["📖 Begin the Gift"], { title: GIFT_TITLE, quoted: msg }
    );
  }

  const raw = String(args[0] || "").trim().toUpperCase();
  let idx = LETTERS.indexOf(raw);
  if (idx === -1 && /^[1-4]$/.test(raw)) idx = Number(raw) - 1;
  if (idx === -1 || idx > 3) {
    return buttonsSystem.sendButtons(
      sock, chatId,
      giftHeader(`❓ Answer with *A*, *B*, *C* or *D*.`),
      questionButtons(), { title: GIFT_TITLE, footer: "Tap a letter", quoted: msg }
    );
  }

  const poolIdx = session.order[session.index];
  const q = st.questions[poolIdx];
  if (!q) {
    session.index = session.total;
  } else {
    const isCorrect = idx === Number(q.answer);
    let feedback;
    if (isCorrect) {
      session.correct += 1;
      feedback = `${pickLine(CORRECT_LINES)} _(${q.ref || "Scripture"})_`;
    } else {
      session.wrong += 1;
      feedback =
        `${pickLine(WRONG_LINES)} The answer was *${LETTERS[q.answer]}) ${q.options[q.answer]}*` +
        (q.ref ? `\n_(${q.ref})_` : "");
    }
    session.index += 1;
    session.lastAt = now;
  }

  const done = session.index >= session.total;
  const struck = session.wrong >= MAX_FAILURES;

  if (done || struck) {
    return finishSession(ctx, chatId, senderId, msg, st, session, {
      reason: done ? "complete" : "strikes",
    });
  }

  saveState(st);
  return sendQuestion(ctx, chatId, senderId, msg, st, session, null);
}

async function finishSession(ctx, chatId, senderId, msg, st, session, info = {}) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const reason = info.reason || "complete";

  session.finishedAt = Date.now();

  const { rewards, lines } = grantRewards(ctx, player, session.correct, session.total, st.weekKey);

  // A run with zero correct answers pays a small consolation but is not
  // claimed — the player may try again before Sunday ends.
  if (rewards.failed) {
    delete st.sessions[senderId];
  } else {
    session.claimed = true;
  }

  if (!rewards.failed) {
    st.standings = st.standings || {};
    const board = st.standings[st.weekKey] || (st.standings[st.weekKey] = []);
    const name = displayName(player, senderId);
    const prev = board.find((e) => e.jid === senderId);
    if (prev) {
      if (session.correct > prev.correct) {
        prev.correct = session.correct;
        prev.total = session.total;
        prev.at = Date.now();
        prev.name = name;
      }
    } else {
      board.push({ jid: senderId, name, correct: session.correct, total: session.total, at: Date.now() });
    }
    board.sort((a, b) => b.correct - a.correct || a.at - b.at);
    if (board.length > 50) board.length = 50;
  }

  saveState(st);
  try { savePlayers(players); } catch {}

  const title = rewards.failed
    ? "🕯️ *The Gift goes quiet.*"
    : reason === "strikes"
      ? "⛔ *Six strikes. The Gift closes.*"
      : "🎉 *The Gift is complete!*";

  const body =
    giftHeader(title) +
    `\n\n📊 *Score:* ✅ ${session.correct} / ${session.total}` +
    (reason === "strikes" ? `\n⛔ Strikes: ${session.wrong}` : "") +
    `\n\n${ui.subheader("THE GIFT RETURNS", "🎁")}\n` +
    lines.map((l) => `• ${l}`).join("\n") +
    (rewards.failed
      ? `\n\n_No answers this time — the Gift can be reopened. Answer at least one to claim it._`
      : `\n\n_One Gift per Sunday. The next opens in ${formatCountdown(nextSundayStartMs(Date.now()) - Date.now())}._`);

  return buttonsSystem.sendButtons(sock, chatId, body, ["🏆 Standings", "❓ How it Works"], {
    title: GIFT_TITLE,
    footer: rewards.failed ? "Try again this Sunday" : "Rewards granted",
    quoted: msg,
  });
}

async function cmdGiftQuit(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const st = loadState();
  const session = st.sessions[senderId];
  if (!session || session.claimed) {
    return sock.sendMessage(chatId, { text: "❓ You have no trial in progress." }, { quoted: msg });
  }
  delete st.sessions[senderId];
  saveState(st);
  return buttonsSystem.sendButtons(
    sock, chatId,
    giftHeader(`🚪 *You leave the Gift.*\n\nYour trial is discarded — nothing claimed, nothing lost. Return before Sunday ends.`),
    ["📖 Begin the Gift"], { title: GIFT_TITLE, quoted: msg }
  );
}

async function cmdGiftStandings(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const st = loadState();
  const key = activeWeekKey(Date.now()) || st.weekKey;
  const board = (st.standings || {})[key] || [];

  let body;
  if (!board.length) {
    body = giftHeader(`🏆 *No one has claimed the Gift yet*${key ? ` (${key})` : ""}.\n\nBe the first.`);
  } else {
    const lines = board.slice(0, 10).map((e, i) => {
      const medal = ["🥇", "🥈", "🥉"][i] || `*${i + 1}.*`;
      return `${medal} *${e.name}* — ✅ ${e.correct}/${e.total}`;
    });
    body = giftHeader(`🏆 *Champions of the Gift*${key ? ` — ${key}` : ""}`) + `\n\n` + lines.join("\n");
  }

  return buttonsSystem.sendButtons(sock, chatId, body, ["📖 Begin the Gift", "❓ How it Works"], {
    title: GIFT_TITLE,
    footer: "Weekly scripture standings",
    quoted: msg,
  });
}

async function cmdGiftHelp(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const text =
    giftHeader() +
    `\n📖 *How the Gift works*\n\n` +
    `🗓️ Opens every *Sunday at 00:00 CAT* and closes *24 hours later*.\n` +
    `🧠 Questions are *written fresh each week* — no two Sundays are the same.\n` +
    `🎚️ You choose how many to answer: *${MIN_QUESTIONS} to ${MAX_QUESTIONS}*.\n` +
    `⛔ Answer *${MAX_FAILURES} wrong* and the Gift closes on you for the week.\n\n` +
    ui.subheader("REWARDS", "🎁") + `\n` +
    `• 💰 *Lucons* — always, scaled to your score (~3k on a clean 5/5)\n` +
    `• ✨ *XP* — a little per correct answer\n` +
    `• 🐉 *One random Epic Mora* — guaranteed\n` +
    `• 🕊️ *A Blessing* — for a perfect trial\n` +
    `• 🎲 *A rotating bonus* — extra Lucons, a shard, Aura, or a relic\n\n` +
    `_Commands:_ \`.gift\` · \`.gift-begin\` · \`.gift-lb\``;
  return buttonsSystem.sendButtons(sock, chatId, text, ["📖 Begin the Gift", "🏆 Standings"], {
    title: GIFT_TITLE,
    footer: "Sunday · 00:00 CAT",
    quoted: msg,
  });
}

// ══════════════════════════════════════════════════════════════
// SCHEDULER — generate + announce when a new Sunday arrives
// ══════════════════════════════════════════════════════════════
let loopTimer = null;
const TICK_MS = 20 * 60 * 1000;

async function tick(sock, groups) {
  const now = Date.now();
  const key = activeWeekKey(now);
  if (!key) return;
  const before = loadState();
  const isNewWeek = before.weekKey !== key;
  await ensureQuestions();
  if (!isNewWeek) return;
  const st = loadState();
  if (st.lastAnnouncedWeek === key) return;
  st.lastAnnouncedWeek = key;
  saveState(st);
  await announceToGroups(sock, groups);
}

async function announceToGroups(sock, groups) {
  if (!Array.isArray(groups) || !groups.length) return;
  const text =
    giftHeader() +
    `\n🕯️ *A new Gift has opened.*\n\n` +
    `The scriptures have been rewritten for this week — ${loadState().questions.length} questions, ` +
    `none of them the same as last Sunday.\n\n` +
    `Answer *${MIN_QUESTIONS} to ${MAX_QUESTIONS}*. Get them right and the Gift pours back:\n` +
    `💰 Lucons · ✨ XP · 🐉 a random Epic Mora · 🕊️ a Blessing\n\n` +
    `⏳ Closes in ${formatCountdown(giftWindowEndMs(Date.now()) - Date.now())}.`;
  const uniq = Array.from(new Set(groups.filter(Boolean)));
  for (const g of uniq) {
    try {
      await buttonsSystem.sendButtons(sock, g, text, ["📖 Begin the Gift", "❓ How it Works"], {
        title: GIFT_TITLE,
        footer: "Sunday · 00:00 CAT",
      });
    } catch (e) {
      console.log("[sundayGift] announce failed:", e?.message || e);
    }
  }
}

function startGiftLoop(sock, groups = []) {
  if (loopTimer) clearInterval(loopTimer);
  const run = () => { tick(sock, groups).catch((e) => console.log("[sundayGift]", e?.message || e)); };
  run();
  loopTimer = setInterval(run, TICK_MS);
  if (loopTimer.unref) loopTimer.unref();
}

function stopGiftLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

module.exports = {
  cmdGift,
  cmdGiftBegin,
  cmdGiftCount,
  cmdGiftAnswer,
  cmdGiftQuit,
  cmdGiftStandings,
  cmdGiftHelp,
  ensureQuestions,
  startGiftLoop,
  stopGiftLoop,

  // exposed for testing / tooling
  activeWeekKey,
  nextSundayStartMs,
  giftWindowEndMs,
  computeRewards,
  buildBankQuestions,
  normalizeQuestions,
  extractJsonArray,
  FALLBACK_BANK,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  MAX_FAILURES,
};

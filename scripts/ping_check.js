"use strict";
// ═══════════════════════════════════════════════════════════════
// LUMORA PING CHECK — verifies systems/pingStatus.js
// Run: node scripts/ping_check.js
// ═══════════════════════════════════════════════════════════════

const assert = require("assert");
const path = require("path");

const ping = require(path.join(__dirname, "..", "systems", "pingStatus.js"));

let pass = 0;
let fail = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ok   ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${label}`);
    console.log(`       ${e && e.message ? e.message : e}`);
    fail++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${label}`);
    console.log(`       ${e && e.message ? e.message : e}`);
    fail++;
  }
}

const DAY = 24 * 60 * 60 * 1000;
const CAT = 2 * 60 * 60 * 1000;

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ═════════════════════════════════════════════���═════════════════
section("time helpers");

check("nextSundayStartMs lands on a Sunday 00:00 CAT", () => {
  // 2026-10-07 is a Wednesday; next Sunday is 2026-10-11.
  const now = Date.parse("2026-10-07T12:00:00Z");
  const next = ping.nextSundayStartMs(now);
  const cat = new Date(next + CAT);
  assert.strictEqual(cat.getUTCDay(), 0, "must be Sunday");
  assert.strictEqual(cat.getUTCHours(), 0, "must be 00:00 CAT");
  assert.strictEqual(cat.getUTCMinutes(), 0);
  assert.ok(next > now, "must be in the future");
});

// Real-time instant of the most recent CAT midnight.
function catMidnight(now) {
  return Math.floor((now + CAT) / DAY) * DAY - CAT;
}

check("nextSundayStartMs on a Sunday skips to next week", () => {
  // Sunday 2026-10-11 06:00 CAT == 04:00 UTC. The next window opens a full
  // week later, so "now" itself is never the answer.
  const sunday = Date.parse("2026-10-11T04:00:00Z");
  const next = ping.nextSundayStartMs(sunday);
  assert.strictEqual(next, catMidnight(sunday) + 7 * DAY, "exactly next week's open");
  assert.strictEqual(new Date(next + CAT).getUTCDay(), 0);
  assert.strictEqual(new Date(next + CAT).getUTCHours(), 0);
});

check("giftWindowEndMs closes 24h after Sunday 00:00 CAT", () => {
  // From Sunday 06:00 CAT, the window (opened at CAT midnight) has 18h left.
  const sunday = Date.parse("2026-10-11T04:00:00Z");
  assert.strictEqual(ping.giftWindowEndMs(sunday), catMidnight(sunday) + DAY);
  assert.strictEqual(ping.giftWindowEndMs(sunday) - sunday, DAY - 6 * 3600000);
});

check("formatCountdown picks the right unit", () => {
  assert.strictEqual(ping.formatCountdown(0), "1m");
  assert.strictEqual(ping.formatCountdown(5 * 60000), "5m");
  assert.strictEqual(ping.formatCountdown(90 * 60000), "1h 30m");
  assert.strictEqual(ping.formatCountdown(3 * 3600000), "3h");
  assert.strictEqual(ping.formatCountdown(2 * DAY + 5 * 3600000), "2d 5h");
  assert.strictEqual(ping.formatCountdown(-5000), "1m", "negatives clamp");
  assert.strictEqual(ping.formatCountdown(2 * DAY), "2d");
});

check("formatUptime renders d/h/m/s", () => {
  assert.strictEqual(
    ping.formatUptime(((3 * 86400) + (4 * 3600) + (5 * 60) + 6) * 1000),
    "3d 4h 5m 6s"
  );
  assert.strictEqual(ping.formatUptime(0), "0d 0h 0m 0s");
  assert.strictEqual(ping.formatUptime(-5000), "0d 0h 0m 0s", "negatives clamp");
});

// ═══════════════════════════════════════════════════════════════
section("sunday reminder");

check("closed window counts down to the next Sunday", () => {
  // Wednesday.
  const r = ping.sundayReminder(Date.parse("2026-10-07T12:00:00Z"));
  assert.strictEqual(r.open, false);
  assert.match(r.line, /THE SUNDAY GIFT/);
  assert.match(r.line, /opens in \*3d 10h\*/, `got: ${r.line}`);
  assert.match(r.line, /Sunday, 00:00 CAT/);
  assert.match(r.line, /\.gift/);
});

check("open window announces the Gift is live", () => {
  // Sunday 2026-10-11 06:00 CAT (04:00 UTC) — window closes in 18h.
  const r = ping.sundayReminder(Date.parse("2026-10-11T04:00:00Z"));
  assert.strictEqual(r.open, true);
  assert.match(r.line, /is \*OPEN\*/);
  assert.match(r.line, /18h left/);
});

check("late Sunday still counts as open", () => {
  // Sunday 23:30 CAT == 21:30 UTC → 30 minutes left.
  const r = ping.sundayReminder(Date.parse("2026-10-11T21:30:00Z"));
  assert.strictEqual(r.open, true);
  assert.match(r.line, /30m left/);
});

check("Monday 00:30 CAT is closed again", () => {
  // Monday 2026-10-12 00:30 CAT == Sunday 22:30 UTC.
  const r = ping.sundayReminder(Date.parse("2026-10-11T22:30:00Z"));
  assert.strictEqual(r.open, false);
  assert.match(r.line, /opens in \*\d/, `got: ${r.line}`);
});

// ═══════════════════════════════════════════════════════════════
section("ping message");

check("buildPingText shows online status, latency and uptime", () => {
  const text = ping.buildPingText({
    pingMs: 143.7,
    uptimeMs: ((2 * 86400) + (1 * 3600) + (30 * 60)) * 1000,
    now: Date.parse("2026-10-07T12:00:00Z"),
    taggedCount: 12,
  });
  assert.match(text, /STAR IS ONLINE/);
  assert.match(text, /Response: \*144ms\*/, `got: ${text}`);
  assert.match(text, /Uptime: \*2d 1h 30m 0s\*/);
  assert.match(text, /\*2026-10-07 14:00\* CAT/, `stamp: ${text}`);
  assert.match(text, /12 Lumorians notified\./);
  assert.match(text, /THE SUNDAY GIFT/);
});

check("buildPingText handles missing input", () => {
  const text = ping.buildPingText();
  assert.match(text, /Response: \*0ms\*/);
  assert.match(text, /Uptime: \*0d 0h 0m 0s\*/);
  assert.ok(!/notified/.test(text), "no notify line when nobody was tagged");
  assert.match(text, /THE SUNDAY GIFT/);
});

check("buildPingText never emits raw @handles", () => {
  const text = ping.buildPingText({
    pingMs: 1,
    uptimeMs: 1000,
    now: Date.now(),
    taggedCount: 40,
  });
  assert.ok(!/@[0-9]/.test(text), "hidden mentions must not leak into the text");
});

check("buildPingText stays inside a sane size", () => {
  const text = ping.buildPingText({ pingMs: 5, uptimeMs: 5, now: Date.now(), taggedCount: 9 });
  assert.ok(Buffer.byteLength(text, "utf8") < 900, `too big: ${Buffer.byteLength(text)}`);
});

// ═══════════════════════════════════════════════════════════════
section("@all collection");

function fakeSock(participants) {
  return { groupMetadata: async () => ({ participants }) };
}

async function runAsyncSection() {
await checkAsync("collects every participant id", async () => {
  const sock = fakeSock([{ id: "a@s.whatsapp.net" }, { id: "b@s.whatsapp.net" }]);
  const ids = await ping.collectMentionJids(sock, "g@g.us");
  assert.deepStrictEqual(ids, ["a@s.whatsapp.net", "b@s.whatsapp.net"]);
});

await checkAsync("accepts bare-string participants", async () => {
  const sock = fakeSock(["a@s.whatsapp.net", "b@s.whatsapp.net"]);
  const ids = await ping.collectMentionJids(sock, "g@g.us");
  assert.strictEqual(ids.length, 2);
});

await checkAsync("excludes the bot itself", async () => {
  const sock = fakeSock([{ id: "bot@s.whatsapp.net" }, { id: "a@s.whatsapp.net" }]);
  const ids = await ping.collectMentionJids(sock, "g@g.us", { exclude: ["bot@s.whatsapp.net"] });
  assert.deepStrictEqual(ids, ["a@s.whatsapp.net"]);
});

await checkAsync("dedupes repeated ids", async () => {
  const sock = fakeSock([{ id: "a@s.whatsapp.net" }, { id: "a@s.whatsapp.net" }]);
  const ids = await ping.collectMentionJids(sock, "g@g.us");
  assert.strictEqual(ids.length, 1);
});

await checkAsync("drops entries with no id", async () => {
  const sock = fakeSock([{ id: null }, {}, { id: "a@s.whatsapp.net" }]);
  const ids = await ping.collectMentionJids(sock, "g@g.us");
  assert.deepStrictEqual(ids, ["a@s.whatsapp.net"]);
});

await checkAsync("caps a huge group", async () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: `p${i}@s.whatsapp.net` }));
  const ids = await ping.collectMentionJids(fakeSock(many), "g@g.us");
  assert.strictEqual(ids.length, 1024);
});

await checkAsync("returns [] when metadata throws (DM)", async () => {
  const sock = { groupMetadata: async () => { throw new Error("itemNotFound"); } };
  const ids = await ping.collectMentionJids(sock, "g@g.us");
  assert.deepStrictEqual(ids, []);
});

// ═══════════════════════════════════════════════════════════════
section("cmdPing end-to-end (fake sock)");

await checkAsync("group ping mentions everyone and says online", async () => {
  const sent = [];
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    groupMetadata: async () => ({
      participants: [{ id: "bot@s.whatsapp.net" }, { id: "x@s.whatsapp.net" }, { id: "y@s.whatsapp.net" }],
    }),
    sendMessage: async (chatId, payload) => { sent.push({ chatId, payload }); },
  };
  const ctx = { sock, startTime: Date.now() - 60000, botJid: "bot@s.whatsapp.net" };
  const now = Date.parse("2026-10-07T12:00:00Z");
  const msg = { messageTimestamp: Math.floor(now / 1000) - 0 };

  // Freeze time so the Sunday countdown is deterministic.
  const realNow = Date.now;
  Date.now = () => now;
  try {
    await ping.cmdPing(ctx, "grp@g.us", msg);
  } finally {
    Date.now = realNow;
  }

  assert.strictEqual(sent.length, 1);
  const { chatId, payload } = sent[0];
  assert.strictEqual(chatId, "grp@g.us");
  assert.match(payload.text, /STAR IS ONLINE/);
  assert.match(payload.text, /THE SUNDAY GIFT/);
  assert.match(payload.text, /2 Lumorians notified\./);
  assert.deepStrictEqual(payload.mentions, ["x@s.whatsapp.net", "y@s.whatsapp.net"]);
});

await checkAsync("DM ping mentions nobody but still answers", async () => {
  const sent = [];
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    groupMetadata: async () => ({ participants: [] }),
    sendMessage: async (chatId, payload) => { sent.push(payload); },
  };
  const ctx = { sock, startTime: Date.now() - 5000, botJid: "bot@s.whatsapp.net" };
  await ping.cmdPing(ctx, "user@s.whatsapp.net", { messageTimestamp: 0 });

  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].mentions, []);
  assert.match(sent[0].text, /STAR IS ONLINE/);
  assert.match(sent[0].text, /THE SUNDAY GIFT/);
});

await checkAsync("survives a groupMetadata failure", async () => {
  const sent = [];
  const sock = {
    user: { id: "bot@s.whatsapp.net" },
    groupMetadata: async () => { throw new Error("gone"); },
    sendMessage: async (chatId, payload) => { sent.push(payload); },
  };
  await ping.cmdPing({ sock, startTime: Date.now() }, "grp@g.us", {});
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(sent[0].mentions, []);
});

// ═══════════════════════════════════════════════════════════════
section("index.js wiring");

const fs = require("fs");
const indexSrc = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

check(".ping routes through pingStatus.cmdPing", () => {
  assert.match(indexSrc, /if \(command === "ping"\)/, "ping branch exists");
  assert.match(
    indexSrc,
    /require\("\.\/systems\/pingStatus"\)\.cmdPing\(/,
    "ping branch delegates to pingStatus.cmdPing"
  );
});

check("the ping call site passes startTime, sock, chatId and msg", () => {
  // The call site must hand cmdPing every ctx field it destructures,
  // otherwise uptime silently reads 0 in production.
  const call = indexSrc.match(/pingStatus"\)\.cmdPing\(([\s\S]*?)\n\s*\);/);
  assert.ok(call, "could not locate the cmdPing call");
  const body = call[1];
  assert.match(body, /sock/, "passes sock");
  assert.match(body, /startTime/, "passes startTime");
  assert.match(body, /chatId/, "passes chatId");
  assert.match(body, /msg/, "passes msg");
  assert.match(body, /botJid/, "passes botJid so it can exclude itself");
});

check("index.js declares startTime at module scope", () => {
  const decl = indexSrc.match(/^const startTime = Date\.now\(\);$/m);
  assert.ok(decl, "module-level startTime declaration missing");
});

check("no stale inline Pong handler remains", () => {
  assert.ok(!/🏓 \*Pong\.\*/.test(indexSrc), "old one-line ping reply still present");
});

check("ping stays out of the consequence system", () => {
  // A ping must never carry game-state side effects.
  const set = indexSrc.match(/_skipConsequences = new Set\(\[([^\]]*)\]/);
  assert.ok(set, "consequence skip-set not found");
  assert.match(set[1], /"ping"/, "ping must be in the skip set");
});
} // end runAsyncSection

runAsyncSection()
  .catch((e) => {
    console.log(`\n  FAIL async section crashed`);
    console.log(`       ${e && e.stack ? e.stack : e}`);
    fail++;
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
  });
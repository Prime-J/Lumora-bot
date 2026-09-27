// scripts/tamed_to_shards.js
// Converts every player's legacy Mora collection (`moraOwned`, the v1 `.tamed`
// list) into mergeable shards, then clears it.
//
//   Why
//   ───
//   The v0.5.0 rework moved the loop to shards: taming a wild Mora now
//   crystallizes its essence via shardSystem.dropShardOnDefeat instead of
//   adding to moraOwned, and Mora come from MERGING shards. moraOwned is the
//   v1 collection and `.tamed` is its command. This retires it.
//
//   What it does
//   ────────────
//   For every Mora in a player's moraOwned:
//     • look the species up in data/mora.json (by id, then by name)
//     • if the species is mergeable, add 1 to shards[shardKey]
//       (corrupted Mora use the "@corrupted" key suffix)
//     • if the species no longer exists, LEAVE that Mora in moraOwned and
//       report it — it is never silently deleted
//   Then moraOwned is emptied.
//
//   ⚠️  STOP THE BOT FIRST
//   The bot holds the whole roster in memory and re-writes EVERY player on each
//   save. If it is running while this script writes, the next save puts the old
//   moraOwned straight back. Deploy a version that does nothing, run this, then
//   deploy again.
//
//   Usage
//   ──────
//   node scripts/tamed_to_shards.js                  # dry run (default, safe)
//   node scripts/tamed_to_shards.js --apply          # writes to MongoDB
//   node scripts/tamed_to_shards.js --apply --keep-empty
//   node scripts/tamed_to_shards.js --out backups/x.json
//
//   A full backup of every touched record is written before any change lands.
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const APPLY = flag('--apply');
const KEEP_EMPTY = flag('--keep-empty'); // leave moraOwned as [] instead of deleting
const BACKUP_PATH = path.resolve(
  __dirname,
  '..',
  opt('--out', path.join('backups', `tamed-to-shards-${Date.now()}.json`))
);

const URI = process.env.MONGODB_URI || '';
const MORA_PATH = path.join(__dirname, '..', 'data', 'mora.json');
const CORRUPTED_SUFFIX = '@corrupted';
const DEFAULT_CAP = 1;
const MAX_CAP = 10;

function fail(msg, hint) {
  console.error(`❌ ${msg}`);
  if (hint) console.error(`   ${hint}`);
  process.exit(1);
}

if (!URI) {
  fail(
    'MONGODB_URI is not set.',
    'Run this where the variable exists, e.g. `railway run node scripts/tamed_to_shards.js`.'
  );
}

function loadMoraIndex() {
  const raw = JSON.parse(fs.readFileSync(MORA_PATH, 'utf8'));
  const byId = new Map();
  const byName = new Map();
  for (const m of Object.values(raw)) {
    if (m?.id != null) byId.set(Number(m.id), m);
    if (m?.name) byName.set(String(m.name).toLowerCase(), m);
  }
  return { byId, byName };
}

const isMergeable = (s) => s && (s.merge === 'full' || s.merge === 'partial');

function shardKeyFor(species, corrupted) {
  const base = String(species.id ?? species.name ?? '').toLowerCase();
  return corrupted ? `${base}${CORRUPTED_SUFFIX}` : base;
}

async function main() {
  let mongoose;
  try {
    mongoose = require('mongoose');
  } catch (err) {
    fail(`Could not load the mongodb driver: ${err.message}`, 'Run `npm install` first.');
  }

  const { byId, byName } = loadMoraIndex();

  const conn = await mongoose
    .connect(URI, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 15000 })
    .catch((e) => fail(`Could not connect to MongoDB: ${e.message}`));

  const col = conn.connection.db.collection('players');
  const total = await col.countDocuments({});
  if (total === 0) fail('The players collection is empty — nothing to migrate.');

  const docs = await col.find({}).toArray();
  const backup = [];
  const skipped = [];
  const plans = [];
  let shardTotal = 0;
  let overDefault = 0;
  let overMax = 0;
  let worst = null;

  for (const doc of docs) {
    const player = doc.data || {};
    const owned = Array.isArray(player.moraOwned) ? player.moraOwned : [];
    if (!owned.length) continue;

    const next = { ...(player.shards && typeof player.shards === 'object' ? player.shards : {}) };
    const kept = [];

    for (const entry of owned) {
      const species =
        byId.get(Number(entry.moraId)) ||
        byName.get(String(entry.name || '').toLowerCase());
      if (!isMergeable(species)) {
        kept.push(entry);
        skipped.push({ jid: doc.jid, moraId: entry.moraId, name: entry.name });
        continue;
      }
      const k = shardKeyFor(species, !!entry.corrupted);
      next[k] = (Number(next[k]) || 0) + 1;
      shardTotal++;
    }

    const counts = Object.entries(next).map(([k, c]) => ({ k, c: Number(c) || 0 }));
    const over1 = counts.filter((x) => x.c > DEFAULT_CAP).length;
    const over10 = counts.filter((x) => x.c > MAX_CAP).length;
    const excess = counts.reduce((s, x) => s + Math.max(0, x.c - MAX_CAP), 0);
    if (over1) overDefault++;
    if (over10) overMax++;
    const mx = counts.reduce((a, b) => (b.c > (a?.c ?? 0) ? b : a), null);
    if (mx && (!worst || mx.c > worst.c)) {
      worst = { ...mx, jid: doc.jid, name: player.username || doc.jid };
    }

    const migrated = { ...player, shards: next };
    if (kept.length) migrated.moraOwned = kept;
    else if (KEEP_EMPTY) migrated.moraOwned = [];
    else delete migrated.moraOwned;

    plans.push({ jid: doc.jid, name: player.username || null, migrated, added: counts.length });
    backup.push({ jid: doc.jid, data: player });
  }

  console.log('');
  console.log('── tamed → shards ───────────────────────────────');
  console.log(`Players scanned          : ${total}`);
  console.log(`Players with Mora       : ${plans.length}`);
  console.log(`Shards to be created    : ${shardTotal}`);
  console.log(`Mora kept (no species)  : ${skipped.length}`);
  console.log(`Players over default cap (${DEFAULT_CAP}) : ${overDefault}`);
  console.log(`Players over hard cap (${MAX_CAP})     : ${overMax}`);
  if (worst) {
    console.log(`Worst vault              : ${worst.name || worst.jid} — ${worst.c}× "${worst.k}"`);
  }
  if (skipped.length) {
    console.log('');
    console.log('Left in moraOwned (species no longer exists in mora.json):');
    const seen = new Set();
    for (const s of skipped) {
      const k = `${s.moraId}/${s.name}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`  • ${k}`);
    }
  }
  console.log('');

  if (!APPLY) {
    console.log('🧪 Dry run — nothing written. Re-run with --apply to commit.');
    await mongoose.connection.close();
    return;
  }

  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup of ${backup.length} records → ${BACKUP_PATH}`);

  const ops = plans.map((p) => ({
    updateOne: {
      filter: { jid: p.jid },
      update: { $set: { data: p.migrated } },
    },
  }));
  const res = await col.bulkWrite(ops, { ordered: false });

  console.log(`✅ Migrated ${res.modifiedCount} players (matched ${res.matchedCount}).`);
  console.log('   Redeploy the bot to load the new roster.');
  await mongoose.connection.close();
}

main().catch((e) => {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
});

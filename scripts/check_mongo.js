// scripts/check_mongo.js
// Read-only MongoDB preflight. Tells you whether the player store is
// reachable and how many players it actually holds, WITHOUT starting the bot
// and WITHOUT writing anything.
//
// Why this exists
//   If MONGODB_URI is unset or unreachable, index.js falls back to whatever
//   data/Players.json happens to be on disk. On Railway that file is part of
//   the deploy image, so the bot silently runs on a stale snapshot and every
//   redeploy resets player progress. This script makes that failure visible
//   before it costs you a session of data.
//
// Usage
//   MONGODB_URI="mongodb+srv://..." node scripts/check_mongo.js
//   railway run node scripts/check_mongo.js
//   railway shell  →  node scripts/check_mongo.js
//
// Exit codes: 0 = connected, 1 = problem.
'use strict';

const URI = process.env.MONGODB_URI || '';
const CONNECT_TIMEOUT_MS = 15000;
const SERVER_SELECTION_TIMEOUT_MS = 20000;

async function main() {
  if (!URI) {
    console.error('❌ MONGODB_URI is not set in this environment.');
    console.error('   Set it on the Railway service (Variables), not just locally.');
    console.error('   Until then the bot falls back to data/Players.json and loses data on redeploy.');
    process.exit(1);
  }

  // Loaded only once we know we have a URI, so the most common misconfiguration
  // (variable simply not set) reports itself instead of a driver stack trace.
  let mongoose;
  try {
    mongoose = require('mongoose');
  } catch (err) {
    console.error(`❌ Could not load the mongodb driver: ${err.message}`);
    console.error('   Run `npm install` in the project directory and try again.');
    process.exit(1);
  }

  // Never print the URI — it embeds the database password.
  const redacted = URI.replace(/\/\/([^@]+)@/, (_m, creds) => `//${creds.split(':')[0]}:****@`);

  console.log('── MongoDB preflight ──────────────────────────');
  console.log(`Target : ${redacted}`);
  console.log('Pinging (read-only, writes nothing)…');
  console.log('');

  try {
    await mongoose.connect(URI, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: 20000,
    });
  } catch (err) {
    console.error(`❌ Could not connect: ${err.message}`);
    console.error('');
    console.error('Most likely causes, in order:');
    console.error('  1. Atlas "Network Access" is restricted to specific IPs. Railway egress');
    console.error('     IPs rotate, so an allowlist will fail. Allow 0.0.0.0/0 (with a strong');
    console.error('     database password) or add Railway\'s outbound range.');
    console.error('  2. Wrong username/password in the URI. Special characters (@ : / ? # %)');
    console.error('     must be percent-encoded.');
    console.error('  3. Wrong cluster hostname or the cluster is paused/hibernated.');
    process.exit(1);
  }

  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus();
    console.log('✅ Connected.');
    console.log(`   Server version : ${info.version}`);
    console.log(`   Database       : ${mongoose.connection.name}`);

    const cols = await mongoose.connection.db.listCollections().toArray();
    const hasPlayers = cols.some((c) => c.name === 'players');
    console.log(`   Collections    : ${cols.length}${hasPlayers ? ' (players ✅)' : ' (NO players collection ⚠️)'}`);

    if (hasPlayers) {
      const count = await mongoose.connection.db.collection('players').countDocuments({});
      const sample = await mongoose.connection.db
        .collection('players')
        .find({}, { projection: { jid: 1, updatedAt: 1 }, sort: { updatedAt: -1 }, limit: 3 })
        .toArray();

      console.log(`   Players stored : ${count}`);
      if (count > 0) {
        console.log('   Most recently updated:');
        for (const d of sample) {
          const when = d.updatedAt ? new Date(d.updatedAt).toISOString() : 'unknown';
          console.log(`     · ${d.jid}  ${when}`);
        }
        if (count > 0 && (!sample[0]?.updatedAt || Date.now() - new Date(sample[0].updatedAt).getTime() > 7 * 864e5)) {
          console.log('');
          console.log('   ⚠️  Newest write is over a week old — the bot is probably not');
          console.log('      reaching Mongo. Check the Railway deploy logs for [mongo] lines.');
        }
      } else {
        console.log('');
        console.log('   ⚠️  The players collection exists but is EMPTY. The bot will start');
        console.log('      with an empty roster and every player will re-register.');
      }
    }

    console.log('');
    console.log('✅ Pre-flight passed. Player data is persisting.');
    process.exit(0);
  } catch (err) {
    console.error(`❌ Connected, but the read failed: ${err.message}`);
    process.exit(1);
  } finally {
    try { await mongoose.connection.close(); } catch {}
  }
}

main();

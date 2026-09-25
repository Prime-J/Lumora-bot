// scripts/recover_players.js
// Rebuilds a recovered data/Players.json from the backups in backups/.
//
//   Why this exists
//   ───────────────
//   • data/Players.json is gitignored, but it was committed anyway, so every
//     Railway deploy shipped a stale snapshot into a fresh container.
//   • The richest surviving snapshot is backups/Players.2026-05-09-67players.json
//     (67 players, real progression). The file that was in data/ is a DEGRADED
//     re-registration state (players back at level 1, Mora rosters emptied).
//   • The game was reworked after May, so those 67 records predate the current
//     schema. This script reshapes them to match the CURRENT players so the
//     game code finds every field it expects.
//
//   Merge rules
//   ───────────
//   1. Base record comes from the May snapshot — it holds the real progression.
//   2. Players that exist ONLY in the later snapshots are added verbatim, so
//      anyone who registered after May is not lost.
//   3. On overlap, fields the May record lacks but the later record has are
//      filled in (new-schema fields like shards/styles/stats), so the current
//      game code does not trip over missing keys.
//   4. A username is only taken from the later record when the May one has
//      none, or when the later one is a real name and May's is missing.
//   5. Every record is then normalised to the current schema (see DEFAULTS).
//      Legacy fields that no longer exist in the schema are PRESERVED, not
//      deleted — the game ignores them, and they are the only remaining copy
//      of data like pvpWinStreak and party.
//
// Usage:
//   node scripts/recover_players.js                      # writes backups/Players.MERGED.json
//   node scripts/recover_players.js --dry-run           # report only, write nothing
//   node scripts/recover_players.js --strip-icons        # drop base64 avatars (much smaller file)
//   node scripts/recover_players.js --drop-legacy       # also remove fields not in the current schema
//   node scripts/recover_players.js --out data/Players.json
'use strict';

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PRIMARY = path.join(BACKUP_DIR, 'Players.2026-05-09-67players.json');
const LATER = [
  path.join(BACKUP_DIR, 'Players.head-2026-09-25.json'),
  path.join(BACKUP_DIR, 'Players.2026-09-12-8players.json'),
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const dryRun = flag('--dry-run');
const stripIcons = flag('--strip-icons');
const dropLegacy = flag('--drop-legacy');
const outPath = path.resolve(
  __dirname,
  '..',
  opt('--out', path.join(BACKUP_DIR, 'Players.MERGED.json'))
);

// ── Current-schema defaults ──────────────────────────────────────────────
// Shapes copied from the players that are live today. Anything the May
// snapshot predates starts empty here; the pre-rework systems simply did not
// have these concepts, so "empty" is the honest mapping.
function schemaDefaults() {
  return {
    age: null,
    birthday: null,
    combatEnergy: 50,
    combatMaxEnergy: 50,
    currentMerge: null,
    // Dex is a flat list of 30 stat rolls, stored as strings.
    dex: Array.from({ length: 30 }, () => String(1 + Math.floor(Math.random() * 100))),
    equippedStyle: null,
    // These players are long past onboarding.
    onboardingStep: 'done',
    quests: { active: {}, completed: [] },
    questsUnlocked: [],
    riftPE: 0,
    scrolls: {},
    shardStorage: {},
    shards: {},
    starterShardChosen: false,
    starterStyleChosen: false,
    statPoints: 0,
    stats: { melee: 1, mora: 1, vit: 1, speed: 1 },
    styles: [],
    tutorial: {},
    // Present on every current player. A pre-rework save bug wrote some
    // players' huntEnergy as a stray top-level map key instead of into the
    // record, so these three are genuinely missing for a chunk of the May set.
    lastCmdAt: 0,
    huntEnergy: 200,
    maxHuntEnergy: 200,
    lastHuntRefill: 0,
  };
}

function readJSON(file) {
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  Missing source, skipped: ${path.basename(file)}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// A "real" username is anything that isn't just the player's own JID digits.
function isRealName(name, jid) {
  if (!name) return false;
  const value = String(name).trim();
  if (!value) return false;
  return value !== String(jid).split('@')[0];
}

// The May snapshot contains at least one stray top-level key that is not a
// player record (e.g. `huntEnergy: 192` — a field that was written to the map
// by mistake). Keep only real records and report what was discarded.
function onlyPlayerRecords(source, label, discarded) {
  const out = {};
  for (const [jid, rec] of Object.entries(source)) {
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      out[jid] = rec;
    } else {
      discarded.push(`${label}: "${jid}" = ${JSON.stringify(rec)}`);
    }
  }
  return out;
}

function main() {
  const rawBase = readJSON(PRIMARY);
  if (!rawBase) {
    console.error('❌ Primary snapshot not found — nothing to recover from.');
    process.exit(1);
  }

  const discarded = [];
  const base = onlyPlayerRecords(rawBase, 'May snapshot', discarded);
  const merged = { ...base };
  const added = [];
  const filled = [];

  for (const file of LATER) {
    const rawLater = readJSON(file);
    if (!rawLater) continue;
    const label = path.basename(file);
    const later = onlyPlayerRecords(rawLater, label, discarded);

    for (const [jid, rec] of Object.entries(later)) {
      if (!merged[jid]) {
        merged[jid] = rec;
        added.push(`${jid} (${label})`);
        continue;
      }

      // Overlap: keep May's progression, top up only what May is missing.
      const target = merged[jid];
      let touched = 0;
      for (const [key, value] of Object.entries(rec)) {
        if (target[key] === undefined || target[key] === null) {
          if (value !== undefined && value !== null) {
            target[key] = value;
            touched++;
          }
        }
      }
      if (!isRealName(target.username, jid) && isRealName(rec.username, jid)) {
        target.username = rec.username;
        touched++;
      }
      if (touched) filled.push(`${jid} (+${touched} fields)`);
    }
  }

  // ── Normalise every record to the current schema ──────────────────────
  const defaults = schemaDefaults();

  // The real current schema = every field the live players actually have,
  // plus the defaults we backfill. Anything outside that is a pre-rework
  // leftover. (Using only `defaults` here would wrongly flag core fields like
  // `level` or `lucons` as legacy.)
  const schemaKeys = new Set(Object.keys(defaults));
  for (const file of LATER) {
    const snap = readJSON(file);
    if (!snap) continue;
    for (const rec of Object.values(snap)) {
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
        for (const key of Object.keys(rec)) schemaKeys.add(key);
      }
    }
  }

  let normalised = 0;
  const legacySeen = new Map();

  for (const [jid, rec] of Object.entries(merged)) {
    for (const [key, value] of Object.entries(defaults)) {
      if (rec[key] === undefined) {
        // Fresh copy per player — dex rolls and nested objects must not alias.
        rec[key] = Array.isArray(value) ? value.slice() : (value && typeof value === 'object' ? { ...value } : value);
        normalised++;
      }
    }
    for (const key of Object.keys(rec)) {
      if (!schemaKeys.has(key)) {
        legacySeen.set(key, (legacySeen.get(key) || 0) + 1);
        if (dropLegacy) delete rec[key];
      }
    }
  }

  if (stripIcons) {
    let dropped = 0;
    for (const rec of Object.values(merged)) {
      if (rec.profileIcon) {
        delete rec.profileIcon;
        dropped++;
      }
    }
    console.log(`🖼️  Stripped profileIcon from ${dropped} players.`);
  }

  const total = Object.keys(merged).length;
  console.log('');
  console.log('── Recovery summary ──────────────────────────────');
  if (discarded.length) {
    console.log(`⚠️  Discarded ${discarded.length} malformed entr${discarded.length > 1 ? 'ies' : 'y'} (not player records):`);
    for (const d of discarded) console.log(`     ${d}`);
  }
  console.log(`Base (May snapshot)    : ${Object.keys(base).length} players`);
  console.log(`Added from later snaps : ${added.length}`);
  console.log(`Overlap topped up      : ${filled.length}`);
  console.log(`Recovered total        : ${total} players`);
  console.log(`Schema fields backfilled: ${normalised}`);
  console.log('');
  console.log('Backfilled to the current schema:');
  console.log('  ' + Object.keys(defaults).join(', '));
  if (legacySeen.size) {
    console.log('');
    console.log(dropLegacy
      ? `Legacy fields REMOVED (--drop-legacy): ${[...legacySeen.keys()].join(', ')}`
      : `Legacy fields kept (not in current schema, ignored by the game): ${[...legacySeen.keys()].join(', ')}`);
  }
  console.log('');
  console.log('Still needs a human decision:');
  console.log('  • age / birthday are null for pre-rework players.');
  console.log('  • statPoints is 0. Levels are restored, so they have nothing to spend');
  console.log('    until you grant some (.ow points @user N).');
  if (added.length) {
    console.log('');
    console.log('Players only in the later snapshots (kept):');
    for (const line of added) console.log('  + ' + line);
  }
  if (filled.length) {
    console.log('');
    console.log('Overlaps topped up:');
    for (const line of filled) console.log('  ~ ' + line);
  }
  console.log('');

  if (dryRun) {
    console.log('🧪 --dry-run: nothing written.');
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`✅ Wrote ${total} players to ${outPath}`);
  console.log('   Review it, then copy it over data/Players.json or import to Mongo.');
}

main();

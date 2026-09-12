# 🎉 Lumora Limited Events — Design Notes

Limited-time events are the recurring live-service layer: they drive players
through the newest systems, drain/pump the economy in controlled bursts, and
advance the lore. Each event should have a **story hook**, **3-4 mechanics**,
**a reward identity**, and a **closing beat** that feeds the next one.

---

## Event 001 — THE AWAKENING (Rift Surge) ⚡ *recommended first event*

**Story:** The Rift pulses — the same pulse that first turned companions into
Mora. For 72 hours the surge bleeds essence into the wilds: every defeated Mora
crystallizes, corruption leaks out of the Plateau, and Kael the Riftwalker
smells profit.

**Why it's first:** everyone's vault is empty after the rework. The event is the
tutorial-by-fire that teaches the new loop (shard → awaken → merge → fight →
trade) while it's at its most rewarding.

### Mechanics (72 hours)

1. **Shard surge** — defeat drops: 80% → **100%** (guaranteed). Spawn-claim
   drops: 15% → **30%**.
2. **The wilds stir** — wild spawns reopen for the event (spawns are paused in
   the base game; the surge reopens them for 3 days, then they close again).
3. **Corruption bleeds** — corrupted shards begin dropping from wild defeats
   (normally Rift-only via `.bind`). Harmony can `.purify`, Purity can
   `.destroy`, Rift gets an unexpected harvest.
4. **Kael's Midnight Bazaar** — a limited listing window: rare/epic shards +
   a few scrolls sold for Lucons (the new economy's first real drain beyond
   storage).
5. **First-tier storage half-off** — one 50%-off storage upgrade per player
   (hooks the brand-new M3 sink).

### Event questline — "The Rift Speaks" (3 steps, from Kael)

1. Win 3 battles while the surge is live.
2. Awaken any merge (`*.awaken <name>*`).
3. Purify **or** destroy one corrupted shard (faction choice matters).

**Reward:** exclusive title *「Awakened」* + one free storage tier + a keepsake
(unique event scroll).

### Closing beat → next event

On the third night the surge ends — and in the resonance, a familiar voice
whispers. That is the on-ramp for Star's return (the next event or the same
event's act 2), and a natural pause while the market board / faction war event
gets built.

### Implementation sketch (for the future AI)

- `data/settings.json` → `events: { awakening: { active: true, endsAt: <ISO> } }`
- `systems/shards.js` `dropShardOnDefeat` → read the event flag, override the
  rate (100%/30%) while active.
- `systems/spawn.js` → `maybeSpawn` checks event flag to bypass the paused flag.
- New `systems/events.js` (or fold into `raids.js`): the bazaar listing
  command (`.bazaar`), the event quest chain (reuse `quests.js` chain engine),
  title grant, and a `cron` sweep that deactivates the flag at `endsAt`.
- Announcement: reuse `docs/REWORK_ANNOUNCEMENT.md` style.

---

## Event 002 (future) — Kael's Midnight Bazaar 🕶️

Economy week: Kael runs a rotating bazaar for 48h — rare/epic shards, scrolls,
styles, storage bundles at limited quantities and rotating prices. The first
real stress-test of the Lucon economy + a beta for the public market board
(M3.2).

## Event 003 (future) — Stronghold Siege ⚔️

Faction war weekend: auto-raids cranked (faster windows, double faction
points), the winning faction's banner is raised for the following week, and the
rites become faction-locked for the duration (decision D-3 as an event).

## Event 004 (future) — Star's Homecoming ✨

The emotional one: a welcome-back questline as the companion Star returns.
Festival cosmetics, a reunion style, and the bot persona switches back from
Prijo. Perfect as a season closer.

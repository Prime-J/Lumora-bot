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

---

## 🕊️ Event 005 (PERMANENT / WEEKLY) — The Sunday Bible Question Event

**Status:** permanent recurring weekly event, not a gift drop.
**Window:** every Sunday, 00:00 CAT → 24h.
**Owner source of truth:** `systems/sunday-bible.js` (or the owner-controlled Sunday module).
**Public facing command:** `.sunday` (start a run), `.sunday-lb` (standings / past weeks).

### What it is
A weekly AI-written Bible knowledge challenge. Every Sunday at 00:00 CAT the
event opens for 24 hours. Each player may take a run: choose how many biblical
questions to answer (allowed range **4–10**, player's choice each run). The bot
asks one biblical question at a time with **native clickable A / B / C / D
buttons** and ends the run after the allowed number of wrong answers.

Rewards are **earned by answering correctly**, not handed out for showing up:
- **Lucons** are earned for correct answers; more correct answers → more Lucons.
- **XP** is awarded on completion.
- A **completion reward** is awarded for finishing the chosen question count.
- A **performance reward** increases with accuracy.
- A **perfect-run reward** is granted when every chosen question is answered correctly.
- A **random reward** is added so the prize is not always the same.

### Participation flow (player-side)
1. Player sends `.sunday` on Sunday while the window is open.
2. Bot asks: *how many questions?* Player picks a number from 4–10 (buttons).
3. Bot serves biblical questions one by one, each with **A / B / C / D** clickable buttons.
4. Player taps the answer button. Bot replies immediately, marks it correct/incorrect,
   and continues to the next question.
5. Run ends when:
   - the player finishes the chosen count, OR
   - the player hits the strike limit.
6. Bot sends the result card: performance summary, Lucons earned, XP, completion
   reward, performance reward, perfect-run reward if applicable, and the random reward.

### Rules that make it a “major” recurring feature
- Questions are **generated fresh by AI every Sunday**, starting at 00:00 CAT,
  and the pool is sealed for that 24h window. After 24h the window closes and a
  new pool is generated for the next Sunday.
- The AI prompt asks for a **spread of biblical question types**: Bible knowledge
  (people, places, events, mountains), verse work (complete-the-verse /
  identify-the-verse), and thematic questions (what happened at this place, which
  mountain did Moses die on, who said this, etc.).
- If AI generation is unavailable or returns junk, the event falls back to a
  curated bank so Sunday still runs.

### Reward philosophy
- **Correct answers earn rewards.** The better the run, the better the reward.
- **Partial correctness still earns something**, so a failed run is not a dead run.
- **Non-Lucon rewards change frequently and randomly** so the event does not become
  farmable for one fixed prize.
- A perfect run additionally grants a **Blessing** that feeds the Blessings &
  Special Abilities system (`systems/blessings.js`) once that engine is live.

### Owner controls (admin / Sunday event alterations)
See [`docs/ADMIN_SUNDAY_EVENT.md`](ADMIN_SUNDAY_EVENT.md) for the full owner
command set. In short, owners can:
- Inspect the current Sunday window state and timing.
- Force-regenerate this Sunday's question pool.
- Adjust the Sunday rules for the current cycle without breaking the permanent event:
  - minimum and maximum question count,
  - strike limit,
  - Lucon reward curve,
  - perfect-run reward,
  - random reward pool,
  - AI provider / prompt tweaks,
  - fallback curated bank.
- Audit the week's results and standings.

### Why this is a permanent event, not a limited drop
- It is a **weekly living service layer**, not a 48–72h hype window.
- It teaches and rewards Bible knowledge in the Lumora world, ties into the
  existing scripture system, and feeds blessings/XP/economy every week.
- It is designed with **native buttons throughout** (`.sunday` → pick-count →
  A/B/C/D → result → completion), matching the rest of the bot's clickable UI.


# 🎃 THE HOLLOWING

> Lumora's first seasonal world event — a four-chapter mystery that runs through
> October and breaks on Halloween night.
>
> **Status:** 🟢 **LIVE** — enabled on the next deploy. Chapter I unlocks the
> moment the bot boots; the first story beat broadcasts within one tick.
> Toggle via `data/hollowing_config.json → enabled`.

### Go-live schedule (re-based to the October ladder)

| Chapter | Unlocks | Escalation | What players are told |
|---|---|---|---|
| **I — The Strange Signs** | **Oct 4–10** (live) | 🌑 *Something is wrong.* | Mora are restless. Black crystals. A missing shadow. |
| **II — The Hunt for the Hollow** | Oct 11–17 | 👁️ *Something is watching.* | Hollow Mora appear. Something speaks to hunters. |
| **III — The Night of the Broken Veil** | Oct 18–24 | 🩸 *The veil is breaking.* | FIELD REPORT: species vanish. Shadow Echoes. Seven Seals. |
| **IV — THE HOLLOWING** | Oct 25–31 | 👑 *Something comes through.* | The Veil breaks. The dungeon opens. |
| *ends* | Nov 1 | | Temporary consequences, if Milestone III was missed. |

Chapters hang off `startDate: 2026-10-25T18:00:00Z` by `offsetDays`
(`-21 / -14 / -7 / 0`), so the whole event re-bases with one date change.
>
> **Engine:** [`systems/hollowing.js`](../systems/hollowing.js)
> **Config override:** `data/hollowing_config.json` (optional)
> **Runtime state:** `data/hollowing.json` (auto-created)
> **Command:** `.hollowing` (`hollow`, `event`)
> **Design sibling:** [`docs/EVENTS.md`](../docs/EVENTS.md) — keeps the house style.

---

## Overview

Something is escaping from the Primordial Rift — or so the archive claims.

For years Aetherfall believed that Rift corruption simply *changes* Mora into
violent, unstable creatures. During the last days of October that belief breaks
down. Mora are going missing. Shadows move on their own. Hunters come back
reporting that their own Mora attacked them.

Then, one night, the sky turns crimson, and the ancient archive prints a line
nobody wrote recently:

> *When the veil grows thin, what was buried shall remember its name.*

The Rift isn't opening. **Something is trying to come through it.**

The Hollowing is deliberately built as a **mystery**, not a boss rush. Players
are told something is wrong long before they are told what it is. Chapters unlock
on dates, story beats fire **every few hours**, and a handful of limited tasks
write the first hunters to complete them **into the story by name**.

---

## Lore

### The world as it stands
- Era: **Lumora: Awakening**.
- The **Primordial Rift** is the wound that first turned companions into Mora.
  Its corruption is known, studied and — the factions believe — understood.
- The three factions each relate to the Rift differently:
  | Faction | Approach to the Hollowing |
  |---|---|
  | **Harmony Lumorians** | Try to *purify* the Hollow Mora. |
  | **Purity Order** | *Hunt down* the most dangerous corrupted Mora. |
  | **Rift Seekers** | *Investigate* the crystals, experiment with their energy. |
- All three contribute to the same world event, even as their methods conflict.

### The truth (revealed in stages)
1. **Early:** "Mora are becoming stronger than they should be."
2. **Then:** "Something is speaking to hunters."
3. **Then:** "The missing Mora aren't dead."
4. **Then:** "Something is taking them."
5. **Then:** "The disappearances are connected to the Rift."
6. **Finale:** The Hollow King was never escaping. **It was guarding something
   inside the Rift.** Something else is trying to get out.

Step 6 is the hook into Lumora's next major arc. The Hollowing must **not**
explain the whole Rift mystery. Leave it unresolved on purpose.

---

## The Arc

```text
CHAPTER I — THE STRANGE SIGNS
Something is wrong.
        ↓
Mora become unnaturally powerful.
        ↓
CHAPTER II — THE HUNT FOR THE HOLLOW
Something begins speaking to hunters. Temptations appear. Some accept.
        ↓
CHAPTER III — THE NIGHT OF THE BROKEN VEIL
Mora begin disappearing. The disappearances connect to the Rift.
        ↓
THE HOLLOWING — THE VEIL BREAKS
Corruption outbreaks · the Haunted Dungeon · the Hollow King
        ↓
The players discover the Hollow King may not be the true threat.
        ↓
(unresolved hook → next arc)
```

---

## Chapter I — The Strange Signs

**Unlocks:** `startDate − 20 days`

### Story
- Mora are growing restless; wilds report them stronger than they should be.
- Black crystals appear in caves that were empty last week.
- The Capital's bartender swears a hunter came back without his Mora's shadow.

### Gameplay changes
- **Hunt Energy surges island-wide** (see below) — the lore reason is that the
  Mora are unnaturally active and that restlessness bleeds into hunters.
- Strange crystals begin appearing in hunting zones.

### Hunt Energy changes
Configurable, temporary, and **does not touch normal progression**:

```js
eventModifiers: {
  huntEnergyRegenMultiplier: 2.0,   // regen twice as fast while the event is live
  huntEnergyDrainMultiplier: 0.5,   // travel drains half as much
}
```

When the event is off, both resolve to `×1` and hunting behaves exactly as
before — [systems/hunting.js](../systems/hunting.js) reads these through
`huntEnergyMultipliers()` and never hard-codes anything.

### Temporary hunt-energy burst
A standalone gift, **on for now**: while `huntEnergyBurst` is true every hunter's
gauge is held at **max** — topped on each command and swept for the whole roster
on every world tick.

```js
huntEnergyBurst: true,   // TEMPORARY — set false to restore normal regen/drain
```

It is a pure toggle (`huntEnergyBurstEnabled()`), not gated on `isActive()`, so
it can run on its own. [systems/hunting.js](../systems/hunting.js) checks it inside
`regenHuntEnergy()`, and the [tick](../systems/hollowing.js) sweeps the loaded
roster and persists through `savePlayers`. Flip it off in
`data/hollowing_config.json` to bring normal drain and 6-hour regen back.

### Rewards
LUCONS · XP · **Title: Veilwatcher**

---

## Chapter II — The Hunt for the Hollow

**Unlocks:** `startDate − 13 days`

### Story
- A new enemy type appears: **Hollow Mora** — familiar species twisted by an
  unknown corruption. *A Thornel whose leaves have turned black, whose eyes glow
  violet, whose attacks leave shadows that linger after it dies.*
- Something starts speaking to hunters. Privately. At night.

### Hollow Hunts
Players hunt Hollow Mora for three resources:

| Resource | Purpose |
|---|---|
| **Rift Fragments** | Event crafting |
| **Hollow Essence** | Crafting protective equipment |
| **Ancient Seals** | Required to enter the final dungeon |

### The Preparation Shop (the Aetherfall Bazaar)
A temporary event merchant appears. Intended purchases: **Rift Ward** (reduces
corruption damage), **Greater Healing Capsule**, **Lantern of Aether** (reveals
hidden event objects), **Sealed Cache** (random event resources). Accepts LUCONS
and event materials, giving the existing currency an extra sink.

### Faction Research
Each faction gets its own short questline and rewards (Harmony purifies, Purity
hunts, Rift Seekers investigate) — all feeding the **same** world progress bar.

### Temptations (the DM mechanic)
The event's strangest beat. Players begin receiving **private DM temptations**:

> **UNKNOWN TRANSMISSION**
> You have become stronger.
> But you could become *much* stronger.
> Take what is being offered.
> Nobody has to know.

- Offered: temporary power, LUCONS, event resources, combat bonuses, Hunt Energy.
- **Nothing here permanently destroys progression.** The point is narrative tension.
- The player's choice is recorded on their record — see [Player Choices](#player-choices).
- Rewards are balanced against the existing economy/progression before shipping.

### Rewards
Hollow Hunter cosmetics · Rift Ward · Greater Healing Capsule

---

## Chapter III — The Night of the Broken Veil

**Unlocks:** `startDate − 7 days`

### Story
- The archive surfaces an old warning: *"When the shadows detach from their
  masters, do not follow them into the dark."*
- **Shadow Echoes** stalk the zones — hostile things wearing the shapes of Mora
  we know: faster, stranger, temporarily damage-resistant.
- **The Mora are disappearing.** Not dying — *disappearing*.

### Gameplay changes
- Shadow Echoes emerge in event hunting zones.
- **Seven Seals Before Midnight** — the final preparation questline:

  1. Defeat a specified number of Hollow Mora.
  2. Collect Rift Fragments.
  3. Complete an elite hunting encounter.
  4. Craft a Rift Ward.
  5. Assist your faction's research or hunting objective.

- Completing the trials unlocks the Halloween dungeon.
- **Mora disappear from the active wilds** — see [Mora Changes](#mora-changes).

  The disappearance opens with a **FIELD REPORT** broadcast:
  > ⚠️ **FIELD REPORT**
  > Several Mora species have vanished from their known habitats.
  > Hunters are reporting that certain species can no longer be found anywhere on Aetherfall.
  > Researchers initially believed this was migration. *They were wrong.*

  And when a hunter searches a zone that has gone quiet, the game does **not**
  say *"Mora unavailable."* It says:
  > 🌑 **No trace found.**
  > _The hunting grounds are strangely quiet. Whatever normally lives here isn't here anymore._

  A missing species is not an error state — it is a haunted wood. The data is
  preserved, so it can walk back into the story later.

### Rewards
Ancient Seals · event equipment · **Title: Rift Survivor**

---

## Halloween Finale — THE HOLLOWING (When the Veil Breaks)

**Unlocks:** `startDate` (default `2026-10-25T18:00:00Z`)

### The announcement
> 🚨 **AETHERFALL EMERGENCY NOTICE**
> An unidentified entity has breached the outer boundary of the Primordial Rift.
> All hunters are advised to return to Aetherfall and prepare for an
> island-wide corruption outbreak. The capital's protective barrier is weakening.
> *This is not a drill.*

### 1. Corruption Outbreaks
At intervals, hunting zones become corrupted. Players enter, defeat waves, earn
event currency and resources. Zones **scale in difficulty** so weak and strong
players can both take part.

### 2. The Haunted Dungeon
A temporary dungeon opens beneath the island, in three stages:

| Stage | Encounter |
|---|---|
| **The Forsaken Passage** | Hollow Mora and environmental traps |
| **The Chamber of Echoes** | Elite enemies and a mini-boss |
| **The Blackened Throne** | The final boss |

Success needs preparation, combat skill **and** resource management — not just
raw damage.

### 3. The Hollow King
An ancient Mora-like entity predating the known records of Aetherfall. Floating
fractured crown, dark crystalline armour, violet fissures across its body.

| Phase | Name | Behaviour |
|---|---|---|
| 1 | **The Awakening** | Heavy melee attacks, summons Hollow Mora |
| 2 | **The Shattered Crown** | Faster attacks, shadow projectiles, arena hazards |
| 3 | **The Unmaking** | Arena darkens, boss turns aggressive, players must destroy corrupted crystals to weaken it |

The fight rewards **coordination**, not just the highest damage number.

### The twist
Defeating the Hollow King does **not** destroy it. It drops the **Blackened
Crown Fragment**. The event closes in the archive:

> The Hollow King wasn't trying to escape the Rift.
> **It was guarding something inside it.**
> Something else was trying to escape.

That is the forward hook. Do not resolve it.

---

## How Players Prepare (the 21–27 day countdown)

| Preparation | What players do | Why it matters |
|---|---|---|
| **Combat** | Train Mora, improve movesets | Stronger against Hollow enemies |
| **Equipment** | Get healing capsules & Rift Wards | Survive hard encounters |
| **Resources** | Collect Rift Fragments & Hollow Essence | Craft event gear, unlock rewards |
| **Exploration** | Find hidden event locations | Secret caches, optional encounters |
| **Cooperation** | Form hunting groups, assist factions | Harder content, contribution rewards |

**Recommended level for the final dungeon:** ~15–20. The event is **not** locked
behind it: a new player can investigate rumours, hunt weaker Hollow Mora, collect
resources and earn cosmetics. Experienced players get the hard content.

---

## Rewards

Four categories, none of which wreck progression balance:

**Cosmetic** — Hollow Hunter outfit · Crimson Veil aura · Haunted lantern
accessory · Halloween-themed Mora idle animation.

**Titles** — Veilwatcher · Hollow Slayer · Rift Survivor · Crownbreaker.

**Equipment** — Rift Ward · Greater Healing Capsule · temporary event weapon or
accessory.

**Rare** — the Hollow King has a small chance to drop a special cosmetic or
collectible. The **Blackened Crown Fragment** persists in the inventory as a
keepsake after the event.

Deliberately **not** given: an overpowered permanent Mora or weapon just for
participating. Exclusive cosmetics, titles, collectibles and interesting
abilities carry long-term value without breaking combat.

---

## Global Progress & the Ending

Preparation **affects the ending**. Every Hollow Mora defeated, Ancient Seal
recovered and faction objective completed feeds a **server-wide progress bar**
(`data/hollowing.json → world.progress`). Milestones broadcast when reached:

| Milestone | Threshold | Effect |
|---|---|---|
| **I — The Barrier Holds** | 500 | Aetherfall's protective barrier stabilizes |
| **II — The Crown Cracks** | 1500 | The Hollow King's defences weaken |
| **III — The Capital Survives** | 3000 | The capital endures the corruption outbreak |

If the highest milestone is missed the event still concludes — but the island
suffers **temporary consequences**: damaged structures, corrupted hunting zones
that must be restored afterward. Thresholds are config values, not code.

Implementation: `recordProgress(state, key, n)` / `totalProgress(state)` /
`dueMilestones(config, state)` in `systems/hollowing.js`.

---

## Hollow Mora — the Chapter II enemy ✅ BUILT

Familiar species, twisted by an unknown corruption. **Not a new creature system** —
a Hollow spawn reuses the existing corrupted battle paths (`isCorrupted`), so the
harder AI, the lower catch odds and the corrupted mission hooks all still apply.
Only the flavour, the stat curve and the residue are ours.

| Property | Value |
|---|---|
| Appears from | **Chapter II** onward, and only while the event runs |
| Spawn chance | `22%` per wild spawn (`hollow.chance`) |
| Name | `Hollow Thornel`, `Hollow Nylon`, … |
| Stats | `hp ×1.30 · atk ×1.40 · def ×1.15 · spd ×1.25 · energy ×1.20` |
| Signature | **Lingering Shadow** — its attacks leave a shadow that lingers after the body falls |
| Catch odds | `35%` instead of `65%` (inherited from the corrupted path) |

**Intro flavour** (rotates):
> *"It moves wrong — too smooth, too fast, and its eyes glow violet."*
> *"Its leaves have turned black. Where it steps, the grass stays dead."*
> *"It wears a shape you know, but nothing behind the eyes recognises you."*

### Residue drops — the event's reward path
When a Hollow Mora falls, it leaves event resources, and **every kill also feeds
the island-wide progress bar** (`hollowMoraDefeated`):

| Drop | Chance | Amount |
|---|---|---|
| 🔷 Rift Fragments | 85% | 1–3 |
| 🌫 Hollow Essence | 55% | 1–2 |
| 🔒 Ancient Seals | 12% | 1 |

```
🌑 HOLLOW RESIDUE
🔷 +2 Rift Fragment
🌫 +1 Hollow Essence
```

All values live in `config.hollow` — tune them without touching code.

---

## Story Tree — branching, button-driven paths

Not every story — a handful of **forking paths** whose choices actually matter.
The player's stored node decides what a verb means, so buttons can stay small and
reusable while the branching stays rich.

### How it plays
1. A clue invites players in (`🌒 A quiet week, and then not.` → `.investigate`).
2. The bot sends the scene **with native buttons** — one per available choice.
   Buttons carry hidden command ids (`.hollow-investigate`), so the chat is never
   cluttered with syntax.
3. The choice resolves, the outcome is narrated, and the path either continues or
   ends.

### Investigation cooldown + backlash

Investigation is rate-limited so the rewarding paths cannot be spammed, and
spamming it is punished. Each successful resolve stamps a cooldown on the player
(`lastInvestigateAt`); a resolve attempted before that cooldown lapses is
rejected and counted as a **near-miss scare** — a small aura/HP dip and a warning
that the dark is noticing the rhythm. A few fast resolves in a row trigger a hard
**backlash strike**: a large aura/HP hit, a random shard taken from the player's
vault, and a **hard lockout** that bars further investigation for a fixed window.

The relevant config fields (all in `data/hollowing_config.json`, defaulting as
shown):

- `investigationCooldownMs` — the per-resolve pacing window. Default **60000** (1
  minute). A resolve inside this window is a near-miss scare when the backlash
  layer is on.
- `investigationBacklashCoolMs` — an optional *extra* soft window on top of the
  cooldown. Default **0** (the cooldown is the window).
- `investigationBacklashMaxScares` — near-misses before a strike. Default **2**.
- `investigationBacklashLockMs` — hard lockout after a strike. Default **600000**
  (10 minutes).
- `investigationBacklashAura` — aura taken on a strike. Default **30**.
- `investigationBacklashHp` — HP taken on a strike. Default **15**.
- `investigationBacklashStrikeShards` — shards taken on a strike. Default **1**.
- `investigationBacklashScareShards` — shards taken on a near-miss scare.
  Default **0** (off).

A patient player who lets the cooldown lapse between resolves is never punished.
The backlash only fires on top of rapid, repeated resolves. The whole layer is
switchable: set `investigationBacklashCoolMs` to `null` (or drop it from the
config) and the cooldown reverts to a bare throttle with no punish ladder.

### The eight nodes

| Chapter | Node | The choice that matters |
|---|---|---|
| I | The Black Crystals | step in · pry one loose · back away |
| I | The Humming Dark | light · follow · watch |
| II | A Voice at the Treeline | answer it · challenge it · walk away |
| II | **UNKNOWN TRANSMISSION** | take it · refuse |
| III | The Empty Hunter's Cottage | read the logbook · take the cache · follow the trail |
| III | Shadow Echo | strike it · study it · withdraw |
| IV | The Door Beneath the Island | raise a light · set your hand to it · turn back |
| IV | The Blackened Crown | listen to it · take the Fragment · kneel and withdraw |

### Three kinds of outcome
- **🍀 LUCKY** — lucons, aura, Rift Fragments, Hollow Essence, Ancient Seals.
- **🩸 DEVASTATING** — you lose lucons, aura, HP **or shards** (rolled, never
  fixed — see *The gamble* below), and the tale records a *scar*. Some devastating
  paths are also the **most revealing** — you learn something on the way down.
- **📜 REVEALING** — surfaces one of **8 story fragments**, stored on the player
  (`tale.revealed`) and shown back to them in every node they visit.

### The gamble — investigating costs you
Investigation is **not safe**, and it is not predictable. Every devastating path
rolls its cost from a **range**, so two players who make the same choice lose
different amounts, and the same player loses differently on a second run.

- **Lucons** — rolled from a range (e.g. 400–1200, 600–1800, up to 500–1500).
- **Aura** — rolled, 10–60 per bad path.
- **HP** — rolled, 10–70. Never lethal: HP clamps at 1.
- **💎 Shards** — the sharpest edge. A devastating path can reach into the
  player's **species vault** and *take a shard you actually own*. `loseShards`
  picks from the vault at random, removes one, and deletes the key when it hits
  zero — exactly like `systems/shards.js`. A player with an empty vault is told
  so (*"nothing left to take"*) rather than promised a loss that never lands.
- **The catastrophe** — on top of the rolled cost, each devastating choice has a
  `catastropheChance` (default **30%**) of going *much* worse: lucons, aura and HP
  are multiplied by `multiplier` (default **2.25×**) and shard theft scales with
  it too. The narrated line is 💀 *It goes badly wrong.*

Risky nodes **warn the player before they tap** — a node with any devastating
choice carries *"⚠️ Some of these paths cost you — lucons, aura, health, even
shards. None of them are safe."* Rewards, by contrast, are **fixed** — only the
cost is gambled. The whole system is switchable: set `risk.enabled: false` and no
path can catastrophically escalate (the base loss still stands).

### Linked to the mini-tasks
Choices can complete a **limited task** directly. First to finish is written into
`world.chronicle` and named in later broadcasts:

| Node choice | Task | Slots |
|---|---|---|
| Answer the voice at the treeline | The First Witness | 1 |
| Study the Shadow Echo | Keeper of the Seventh Seal | 1 |
| Set your hand to the door | The One Who Touched the Crown | 1 |

The **temptation** in Chapter II is a story-tree node too — accepting or refusing
writes `player.eventChoices.hollowing.temptationAccepted`, which later chapters
reference. The danger is narrative, never a permanent stat wipe.

---

## The Hollow Muster — helping a group through the event

Lumora's co-op answer to *"how do we help a group of players get through this?"*
The Hollowing is **solo-able but group-optimal**, and the Muster is where that
bites:

- A wave hits a group. The bot calls it (`.muster`, also broadcast as a beat).
- **Every member contributes once** per window (default 6h). Each contribution
  feeds the shared world progress bar — so helping your group helps the island.
- Hit `threshold` (default 8) and **everyone who answered is rewarded** and the
  barrier steadies.
- Fall short and the window closes with a **🩸 devastating** outcome for that
  group — *the dark takes what it is owed.*

No solo player can carry a muster. That is the point: it is the one mechanic that
rewards showing up **for each other**, not for the boss.

---

## Event State Model

This is the whole event in one shape. It maps 1:1 onto the code, and it is
designed to lift straight into Roblox.

```
The Hollowing
│
├── Global State        → data/hollowing.json
│   ├── currentChapter      (derived: activeChapter(config, now))
│   ├── worldProgress       state.world.progress
│   ├── milestones          state.milestones
│   ├── chronicle           state.chronicle  (the full story, in order)
│   ├── announcedChapters   state.announcedChapters
│   ├── announcedBeats      state.announcedBeats
│   └── muster              state.muster[chatId]  (per-group windows)
│
├── Player State        → the player record (Mongo)
│   ├── choices             player.eventChoices.hollowing
│   ├── discoveries         player.eventChoices.hollowing.tale.revealed
│   ├── contribution        state.world.chronicle (named entries)
│   ├── preparation         player.eventChoices.hollowing.res
│   └── path                player.eventChoices.hollowing.tale
│
├── Mora State          → data/mora.json  (never deleted)
│   ├── active              mora.active !== false
│   ├── hollowed            future: Hollow Mora variant (systems/corruption.js)
│   └── missing             mora.missing === true  + config.moraMissing
│
└── Event Content       → DEFAULT_CONFIG in systems/hollowing.js
    ├── story               config.beats[]
    ├── quests              config.limitedTasks[], milestones
    ├── temptations         storyTree node "hollow-whisper-deal"
    ├── rewards             choice.gain / muster.reward
    └── encounters          config.storyTree, config.muster
```

---

## Mora Changes

**We are NOT deleting Mora.** That is a hard rule.

The Mora roster is large enough that players never learn the names. We want a
smaller, *recognizable* core roster — so we do it **in-story**.

### The mechanism
- A Mora stays in `data/mora.json` forever. It is only hidden from spawning:
  ```js
  { id: 42, name: "Thornel", /* ... */, active: false }   // "missing"
  ```
- `systems/hollowing.js` exports `isMoraAvailable(mora)` and
  `filterAvailableMora(list)` — a pure filter any spawn site can use.
- **Existing owned Mora never break.** Filtering applies to *wild spawning only*.
  Anything a player already owns keeps working, keeps merging, keeps its data.
- Lore hook (Chapter III beat): *"Mora are disappearing. Not dying. Not
  migrating. Disappearing."* The missing species are the ones players will one
  day recognize when they **return** in a later story event.

### Audit before removing anything
`scripts/hollowing_mora_audit.js` implements this. It marks a Mora safe **only
if** it is: unowned by every player, not a **Common** (Commons are the new-player
starter pool — `pickStarterOptionsByFaction` draws from them), and not named by
any quest, hunting ground, encounter, NPC or raid.

**Audit result (2026-10-05, first pass):**

| Metric | Value |
|---|---|
| Total species | 101 |
| Target active | ~55 |
| Need to hide | 46 |
| Safe candidates | 56 |
| Held back — owned | 24 |
| Held back — starter pool (Common) | 20 |
| Held back — referenced by quests/encounters | 3 |

Candidates are ranked **Uncommon → Rare → Epic → Legendary**, so Legendaries go
last — they are the Mora players chase and remember. The first pass needs only 4
Legendaries.

> ⚠️ **The first pass used the stale pre-wipe mirror** (`data/Players.json.pre-wipe`)
> because the local machine has no `MONGODB_URI`. Run it against the **live**
> roster before applying:
> ```
> MONGODB_URI=<uri> node scripts/hollowing_mora_audit.js        # report
> node scripts/hollowing_mora_audit.js --apply                  # mark missing
> ```
> The disappearance is a **Chapter III** beat (Oct 18), so there is no rush.

Applying sets `active:false, missing:true, missingSince:"the-hollowing"` and
writes the names into `data/hollowing_config.json → moraMissing`. Reversible by
clearing the flags.

---

## Event Configuration

Everything is behind one flag. To go live:

```jsonc
// data/hollowing_config.json   (optional; overrides the built-in canon)
{
  "enabled": true,
  "startDate": "2026-10-25T18:00:00Z",
  "endDate":   "2026-11-01T03:00:00Z",
  "eventModifiers": {
    "huntEnergyRegenMultiplier": 2.0,
    "huntEnergyDrainMultiplier": 0.5
  }
}
```

- **Dates are config, not code.** Chapters hang off `startDate` by `offsetDays`
  (negative = before the finale), so re-basing the whole event is one line.
- `enabled: false` (default) → the loop does nothing, `huntEnergyMultipliers()`
  returns `×1`, `.hollowing` reports *dormant*.
- **To remove the event entirely:** stop the loop + delete the config file. No
  other system needs to change; the docs even say so in `docs/EVENTS.md`.

### Story cadence (the mystery drip)
`config.beats[]` — each beat has a unique `id`, a `chapterId`, an `offsetHours`
from that chapter's unlock, and message `text`. The scheduler
(`startHollowingLoop`) polls every 15 minutes, but **the poll is not the pacing**:

- `maxBeatsPerTick: 1` — never more than one clue per window
- `minBeatSpacingHours: 4` — clues are never closer together than this
- the **chapter headline lands alone** and resets the spacing clock, so the first
  clue never shares its breath with the announcement

So the shape is: *headline → several hours → a clue → several hours → another
clue*, then a legitimate quiet gap until the next chapter opens. A backlog can
never burst, and every beat fires **exactly once** (persisted in
`data/hollowing.json → announcedBeats`).

Currently **21 canon beats** across four chapters.

### Three layers of delivery
The event speaks on three registers, and only the first one hits the group chat:

| Layer | Audience key | Where it goes | Question it answers |
|---|---|---|---|
| 🌍 **WORLD** | `world` | Broadcast to community groups | *What is happening?* |
| 📜 **STORY** | `story` | The chronicle — read via `.hollowing story` | *What did I discover?* |
| 👤 **PERSONAL** | `personal` | DM, **only** to players who have engaged | *What is trying to influence ME?* |

`audience` defaults to `world` when omitted. Personal beats DM only players whose
record already carries `eventChoices.hollowing` — nobody gets unsolicited DMs for
merely existing. Everything, in all three layers, is appended to the chronicle so
the complete story is always readable in order:

```
.hollowing         → status + the story so far
.hollowing story   → the full chronological chronicle
```

### Limited tasks (players written into the story)
`config.limitedTasks[]` — first N players to complete are appended to
`world.chronicle` and **referenced by name in later broadcasts**:

| Task | Slots | Lore line |
|---|---|---|
| The First Witness | 1 | *"{name} was the first to see it — and the first to be believed."* |
| Keeper of the Seventh Seal | 1 | *"{name} carried the seventh seal through the dark, and set it in the door."* |
| The One Who Touched the Crown | 1 | *"{name} touched the Broken Crown — and heard what is waiting behind it."* |

`claimLimitedTask(state, taskId, playerId, playerName)` returns
`{ ok, position }` or `{ ok:false, reason: "already-claimed" | "full" }`.

---

## Player Choices

Lightweight, per-player, on the player record (Mongo is schema-less, so no
migration is needed):

```js
player.eventChoices.hollowing = {
  temptationAccepted: true,
  temptationCount: 1
}
```

- `ensureChoice(player)` creates the shape.
- `recordTemptation(player, accepted)` records the moral choice.
- Future chapters **read** this to reference what the player did.
- This is deliberately **not** a branching-narrative engine. It is a record.

---

## Melee → Hunt Energy (Progression Update)

`systems/stats.js` already ties **Melee** to combat energy
(`applyMeleeInvest` → `+1 combatMaxEnergy` per point). The Hollowing era extends
the same idea: **Melee investment also raises Hunt Energy capacity** — a
hunter's endurance scales with dedication.

**Documented now. Activated at Chapter III (Oct 18) — not before.** Players
should notice their progression *evolving* mid-event, not read about it in a list
on day one. So the patch note is a tease until the chapter opens:

> ### ⚔️ UPCOMING — HUNTER'S ENDURANCE
> Hunters who invest heavily in Melee will soon develop greater physical
> endurance, increasing their Hunt Energy capacity.

Then Chapter III arrives and it simply becomes true.

The exact formula is **not yet fixed** — it must be derived from the stats
architecture and the burnout curve (`handleBurnout`: 200 → 100) so it does not
trivialise energy. Design: extend `applyMeleeInvest` to also raise
`player.maxHuntEnergy` (gated behind `hollowActive` at Chapter III), then sync
`hunter.huntEnergyMax`.

---

## Technical Notes

### Files
| File | Role |
|---|---|
| `systems/hollowing.js` | The entire event engine (config, phases, beats, loop, progress, tasks) |
| `systems/hunting.js` | Consumes `huntEnergyMultipliers()` for regen + drain |
| `index.js` | Starts the loop (guarded by `isEnabled()`); routes `.hollowing` |
| `systems/commandRegistry.js` | Registers `.hollowing` under the `events` subcat |
| `docs/EVENTS.md` | House style for events; The Hollowing joins the list |
| `data/hollowing.json` | Runtime state (beats fired, progress, chronicle) |
| `data/hollowing_config.json` | Optional override of the canon |

### Wiring rules
- **Guard everything.** The loop never starts when disabled; multipliers return
  `×1`; `.hollowing` says *dormant*. Halloween code must never tangle into the
  permanent systems — `docs/EVENTS.md` has said so from the start.
- **Reuse, don't rewrite.** Notifications use the proven hidden-mention
  collector from `systems/pingStatus.js`; the scheduler mirrors the Sunday
  Gift's `startGiftLoop` shape; player data rides the existing Mongo record.
- **Once-only delivery.** Every announcement is keyed by id in state so a
  redeploy or a tick storm cannot double-post.
- **No deletions.** Mora go `active:false`; player data is never removed.

### Visual Awakening hook (future)
The event is designed so the upcoming **Visual Awakening** battle renderer can
plug in later without blocking anything now:

```text
Hunting Ground + Pixel Player Avatar + Mora + Battle UI + HP + Effects
```

Existing Mora artwork will be processed with **rembg** for transparent assets.
Nothing in `systems/hollowing.js` depends on that work.

---

## Story Archive (for the Roblox port)

This document **is** the archive. It is written so the whole arc can be lifted
into Roblox later: every chapter, beat, item, title, reward and the ending hook
live here and in the `DEFAULT_CONFIG` block of `systems/hollowing.js`, in plain
text and plain data — no engine-specific logic. When Lumora moves, port
`DEFAULT_CONFIG.chapters`, `.beats`, `.limitedTasks`, `.milestones` and this
document. Nothing else is required.

---

## Upcoming Patch Notes

> Legend: **LIVE** = shipped and running · **UPCOMING** = built, dormant, flagged
> off · **PLANNED** = designed only.

### 🎃 THE HOLLOWING — 1.3.0 (proposed)

#### LIVE
- **`.hollowing`** — event status card: chapter ladder, world progress, Hunt
  Energy modifiers, missing Mora, and who has been written into the story.
- **Event engine** (`systems/hollowing.js`) — chapters, story beats, shared
  progress bar, limited tasks, per-player choice record, all config-driven.
- **Hunt Energy event modifiers** — wired into hunting regen and travel drain;
  inert (`×1`) while the event is off.
- **🎃 THE HOLLOWING is running** — Chapter I broadcasts on the next deploy;
  Chapters II–IV unlock Oct 11 / Oct 18 / Oct 25.
- **Story cadence** — one clue per window, never closer than 4h; the headline
  lands alone. A backlog can never burst.
- **Three delivery layers** — 🌍 group broadcast · 📜 chronicle (`.hollowing story`)
  · 👤 DMs to engaged players only.
- **Story tree** — 8 branching, button-driven nodes across four chapters, with
  **lucky**, **devastating** and **revealing** outcomes and 8 story fragments.
- **The Hollow Muster** — the group co-op wave; everyone who answers is rewarded,
  and a group that falls short takes the damage instead.
- **Mora audit tool** — `scripts/hollowing_mora_audit.js` (report + `--apply`).
- **🌑 Hollow Mora** — the Chapter II enemy. Familiar species twisted violet, with
  scaled stats, a *Lingering Shadow* rider, `35%` catch odds, and residue drops
  (Rift Fragments / Hollow Essence / Ancient Seals) that also feed the world
  progress bar. Dormant until Chapter II opens on Oct 11.

#### UPCOMING
- **Chapters II–IV** — unlock Oct 11 / Oct 18 / Oct 25; each broadcasts its
  headline once.
- **Periodic story beats** — mysterious broadcasts every few hours, each fired once.
- **Mora disappearance** — Chapter III FIELD REPORT + the quiet-grounds flavour;
  pending the live-roster audit before any species are hidden.
- **Melee → Hunt Energy progression** — documented as *Hunter's Endurance*;
  activates when Chapter III opens on Oct 18.
- **New event resources** — Rift Fragments · Hollow Essence · Ancient Seals.
- **Event rewards** — cosmetics, titles, equipment, the Blackened Crown Fragment.
- **Halloween finale** — corruption outbreaks, Haunted Dungeon, Hollow King.
- **DM temptations** — private transmissions with a recorded, consequence-free choice.

#### PLANNED
- **Hollow Hunts** — dedicated hunting zones that guarantee Hollow spawns
  (the variant itself is built; zones are not).
- **Shadow Echoes** — elite manifestations with new attack patterns.
- **Seven Seals Before Midnight** — the final preparation questline.
- **The event merchant** — the Aetherfall Bazaar shop.
- **Faction questlines** — Harmony / Purity / Rift Seeker research arcs.
- **The Hollow King** — three-phase, **hybrid gating** (solo-accessible,
  group-optimal) boss encounter.
- **Temporary island consequences** — if Milestone III is missed.
- **Visual battle integration** — plug The Hollowing into Visual Awakening.

---

## Decisions (settled)

1. **Finale gating → HYBRID: solo-accessible, group-optimal.**
   The dungeon can be finished alone; the boss scales to party size and group
   clears earn the strongest rewards. Applies to the Hollow King's three phases,
   the reward table, and the difficulty curve.
2. **Mora reduction → audit-first, never delete.** Mechanism shipped; the
   disappearance is a Chapter III beat. Mark `active:false` only after the audit
   runs against the live roster.
3. **Go-live → enabled now, re-based ladder.** Chapter I is already unlocked, so
   the next deploy announces the phenomenon to everyone. Enabled through
   [`data/hollowing_config.json`](../data/hollowing_config.json).

## Remaining / Open

1. **Live-roster audit** — run `hollowing_mora_audit.js` against Mongo before
   Oct 18 (Chapter III). The local machine has no `MONGODB_URI`.
2. **Hunt Energy multiplier values** (`×2.0` regen / `×0.5` drain) are the design
   prompt's placeholders — tune after watching a live regen/drain cycle.
3. **Beat throttle** is `maxBeatsPerTick: 2` (15-min tick). Raise it if the drip
   feels too slow; the launch backlog still drains without a burst.
4. **Deployment** — the flag is set locally; the changes must be committed and
   pushed for the next Railway deploy to pick them up.

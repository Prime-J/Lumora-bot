# Quest Lines Rework — Milestones

## What exists today (the "dead end")

- Scrolls drop while hunting (~5.4% combined). `.open <scroll>` consumes the scroll,
  auto-accepts the linked quest, +1 Intelligence, DMs the quest text.
- Quests are chain steps: `meetNpc` (via `.whisper <npc>` + secret phrase) → `winBattles`.
- Completion grants the style via `applyCompletion` — no level gate, no material costs,
  no Lucon teaching fee.
- `.quest accept <id>` lets anyone start any quest without ever finding the scroll —
  the scroll is decoration. The user wants the scroll to be the discovery moment and a
  **per-player secret code** to be the only way in.

## The new model

1. **Successful registration** (faction GC joined) → the bot generates a **one-time secret
   code for every scroll-gainable style**, stored on the player (`p.styleCodes[styleId]`).
   Codes are unique per player per style, usable once, typed raw in any group chat.
2. **Scroll acquisition** → hunt drops (unchanged rarity rates) + the starter scroll granted
   at registration. Player opens the scroll **in their DM**: story briefing + the secret code.
3. **Secret code starts the quest** — recognized before normal command dispatch, works in any
   GC. Marks the code used and hands off to the existing quest engine (meet NPC → requests →
   teacher). No parallel quest state machinery.
4. **Level barriers** — styles carry `levelReq`; the teacher refuses to teach below the gate
   (quest stays open until the player levels up).
5. Later: story beats with continue buttons, proceed/retreat choices, kill-N-mora requests for
   nature styles, material requirements sourced from hunting drops (with hints), expensive
   Lucon teaching fees, "mysterious cave" hunt encounters.

## Milestones

### M1 — Codes, scroll-in-DM, code-starts-quest, level gate, one full line ✅ DONE
- `systems/styleQuests.js` — single owner of code generation + secret-code interception
  + the M2 drama machinery (`p.styleQuest` state, beats, challenger, hooks).
- Registration complete (faction joined) → codes generated for all 15 styles + starter
  `Windworn Scroll` granted.
- `.open windworn scroll` no longer auto-accepts style quests — DMs the briefing + code;
  group sees only a tease.
- Raw secret code in any GC (before prefix dispatch) starts the quest, marks code used,
  double-use and unknown codes handled.
- `data/styles.json` — `levelReq` added (rare 8, epic 15, legendary 25; commons none).
  Enforced at completion: blocked quest stays active with a "come back at level X" message.
- wind_step / `first_breath` wired end-to-end on the existing quest engine as the reference line.

### M2 — Full quest-line drama per style (M5: all 15 lines DONE)
- ✅ Teleport + PROCEED/RETREAT at quest start: "You are teleported to a foreign land…"
  with buttons (text fallback built in). Retreat PAUSES the trial (quest stays active,
  `p.styleQuest[qId].paused`) — re-speaking the secret code resumes exactly where the
  player stood. Not abandoned, no dead end.
- ✅ Story beats with CONTINUE buttons: 3 scripted beats for the cliff-temple approach
  (Approach → Breathing Gate → Court of Tests), each delivered as a story card.
- ✅ NPC challenger: **Kaelen** (Reva's first student) — a real wild-battle-engine fight
  against a Zephyra scaled to the style (`level = max(2, round(levelReq + 0.8 × playerLevel))`),
  capture disabled, tagged in battle state so the victory hook fires.
- ✅ Victory → teacher: the hook advances the REAL `meetNpc` step via `quests.onNpcMeet`
  (no parallel state) and prints the next-step hint. Defeat → not a dead end: the
  challenger gate reopens from `.sq-proceed` / resume; retry fights freely.
- ✅ Level gate at the challenger: below `levelReq` the NPC refuses ("come back at
  level X"), trial stays open. (wind_step's gate is 0 — the refusal path is wired and
  the gate semantics are proven through tide_veil's levelReq 8.)
- ⬜ Other styles' drama scripts (sun_walk, tide_veil, …) — each is one `QUEST_DRAMA`
  entry + its story beats; the machinery is style-agnostic already.
- ⬜ Nature-style "kill certain Mora" request steps.

### M3 — Materials & the teacher's price (M5: all 15 lines DONE)
- ✅ Teach requirements are data-driven per quest (`teachReq` on the quest def):
  first_breath requires **3× Sky-Shard Feather (MAT_006)** + **1× Galestone Chip (MAT_007)**
  + a **1,500 Lucon teaching fee**. Two new REAL material items were added to
  `data/items.json` (MAT_006 Common ~5% hunt drop, MAT_007 Uncommon ~3% — neither existed
  before; existing materials didn't fit a wind discipline).
- ✅ Non-certain hunting drops: `.hunt` rolls the trialing player's still-needed trial
  materials, rarity-scaled (Common 5% / Uncommon 3% / Rare 1.5%), stops when the player
  already carries enough. Verified in aggregate: 27 drops in 500 hunts (~5.4%), 0 when
  stocked, 0 with no trial.
- ✅ Teacher's request card on challenger victory: exact remaining items, quantity, a
  WHERE-to-hunt hint per material, the fee, and the note "drops are not certain".
- ✅ `.sacrifice` — hands carried materials to the teacher (moved from inventory into
  `p.styleQuest[qId].turnedIn`; items live only in the normal inventory — one owner).
- ✅ Teach gate in BOTH completion paths: unpaid teachReq refuses completion, states
  exactly what's missing ("you carry X" for the fee), hints where to hunt, and the quest
  stays open. Paying (`payTeachReq`, auto-turn-in at pay time) deducts the exact fee and
  consumes materials, then completion grants the style.
- ⬜ teachReq entries for the other 14 styles (add `teachReq` to the quest def + items;
  the mechanism reads them generically).

### M4 — Hunting rework: discoveries (DONE)
- ✅ Themed discovery encounters layered on `.hunt` and `.proceed` (arrival): "You found
  an overgrown hollow / a humming grotto / a mysterious cave…" with **[🚪 ENTER] [↩️ LEAVE]**
  buttons (text fallback built in). Config-driven (`data/discoveries.json`): base chance
  **6%**, boosted to **16%** while the player's style trial still needs materials — the
  M3 grind loop's payoff moment. Themes are keyed by terrain type (nature/volt/flame/
  terra/frost/shadow/rift + default cave), each with its own flavor text and guardian
  Mora type.
- ✅ Outcomes are data-driven weights (`material 40 / lucons 35 / battle 25`):
  • **material** — a guaranteed drop of a still-needed trial material (the discovery
  skip's probability gate, unlike the normal hunt roll), or a fallback material when no
  trial is open.
  • **lucons** — 150–600 + difficulty scaling.
  • **battle** — a guardian Mora of the terrain's type via the real wild-battle engine,
  level scaled by player level + difficulty; capture disabled.
- ✅ No dead ends: LEAVE costs nothing and says so; an ignored discovery expires after
  30 minutes and the next `.hunt` resolves/replaces it (never a stuck hunt state); if
  the battle engine can't run, the enter pays lucons instead.
- ⬜ Per-ground discovery tuning (unique caves per terrain id) — themes already cover
  by terrain type.

### M5 — All styles' quest lines + wiki (DONE)
- ✅ Drama moved to data (`data/quest_drama.json`, one entry per line — 15/15 authored);
  `dramaNpcName` now reads the real `meetNpc` step (was hardcoded "Reva" — would have
  broken every new line).
- ✅ `teachReq` authored for all 15 quests (fees scale 1,500 → 4,000 LC with rarity/power;
  materials reuse real catalog items; only ONE new item added: **MAT_008 Chrono Shard**
  (Epic) — the Time discipline had no fitting existing material).
- ✅ Challenger NPCs on real Mora (verified species ids against `data/mora.json`):
  Kaelen/Zephyra, Orrin/Luxar, Maru/Aquarion, Brakk/Terralord, Nhal/Zovax, Ash-Voice Dara/
  Ignix, Tessera/Terragon, The Unlit/Nebula-Wisp, The Cartographer/Celestion, The
  Convalescent/Aetherion, Bolt-Runner Syx/Voltaris, Rimekeeper Sorrel/Cryovex,
  Nightbloom/Thornex, The Hollow Chorister/Eternyx, Second-Hand Mae/Drakoryx.
- ✅ Wiki styles section (`web/index.html`) rewritten: obtain flow (scroll → DM code →
  speak code → trial → teacher), secret-code privacy note, rarity/drop/gate table, and a
  per-style table (style, rarity, level gate, teacher, materials + hunt hints, fee).
  Tag-balance + bare-ampersand check PASS (`scripts/_wiki_check.js`); all 15 styles
  present.
- ✅ Verified per style (136/136 headless checks): code issued → drama/plain start →
  beats → challenger → battle → teacher card → meetNpc via real engine → battles →
  pay (fee exact) → completion (net −fee +reward exact). Level gates verified both
  sides for every gated style.
- ✅ Manual rewrite: `docs/FIGHTING_STYLES_MANUAL.md` + `.html` "How to Get a Fighting
  Style" now documents the live scroll-trial flow (scroll → DM reveal → personal one-time
  code → speak in any GC → proceed/retreat drama → retryable challenger → teacher's
  materials + Lucon fee + level barrier), with a hunt-hints table and trial commands
  (.open, code, .sq-proceed/.sq-retreat/.sq-fight, .sacrifice). Per-style cards carry
  gate · teacher · price, cross-checked 15/15 against the wiki table. Stale `.use <scroll>`
  / auto-accept references purged from both manuals and the wiki.

**Per-style summary (style · rarity · gate · teacher · materials · fee · challenger):**
wind_step · Common · any · Reva · 3× MAT_006 + 1× MAT_007 · 1500 · Kaelen (Zephyra)
sun_walk · Common · any · Iyra · 2× MAT_002 + 2× MAT_003 · 1800 · Orrin (Luxar)
tide_veil · Rare · Lv8 · Solen · 3× MAT_002 + 1× CRY_002 · 2200 · Maru (Aquarion)
bone_crush · Rare · Lv8 · Vance · 3× MAT_003 + 1× MAT_005 · 2200 · Brakk (Terralord)
void_sever · Rare · Lv8 · Kael · 4× MAT_001 + 2× MAT_005 + 1× MAT_007 · 2500 · Nhal (Zovax)
pyrolexis · Rare · Lv8 · Phlox · 2× MAT_003 + 1× CRY_002 · 2200 · Ash-Voice Dara (Ignix)
kataphraxis · Rare · Lv8 · Aspis · 2× MAT_004 + 3× CRY_001 · 2200 · Tessera (Terragon)
fulgur_strike · Rare · Lv10 · Kestrel · 2× CRY_002 + 2× MAT_002 · 2500 · Bolt-Runner Syx (Voltaris)
frost_mantle · Rare · Lv10 · Yrsa · 4× CRY_001 + 2× MAT_003 · 2500 · Rimekeeper Sorrel (Cryovex)
tenebris · Epic · Lv15 · Caligo · 3× MAT_005 + 3× MAT_001 + 2× MAT_007 · 3000 · The Unlit (Nebula-Wisp)
astrobolos · Epic · Lv15 · Selene · 4× MAT_002 + 1× CRY_003 · 3000 · The Cartographer (Celestion)
venomsong · Epic · Lv15 · Solenne · 3× MAT_003 + 2× MAT_005 · 3000 · Nightbloom (Thornex)
lunar_shroud · Epic · Lv15 · Morwen · 3× MAT_005 + 2× CRY_002 · 3000 · The Hollow Chorister (Eternyx)
anastasis · Legendary · Lv25 · Eleos · 2× CRY_003 + 2× MAT_004 · 3500 · The Convalescent (Aetherion)
chrono_vow · Legendary · Lv25 · Chronis · 2× MAT_008 + 1× CRY_003 · 4000 · Second-Hand Mae (Drakoryx)

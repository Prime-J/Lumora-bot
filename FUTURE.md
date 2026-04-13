# Lumora Bot — Future Implementations

This file tracks deferred improvements that were discussed but not yet implemented.
When picking one up, move it out of this file into a todo or commit.

---

## 1. Per-NPC Unique Difficulty Curves

**Status:** Pending
**Related file:** [systems/npcArena.js](systems/npcArena.js)

Right now every NPC uses the same shared `DIFFICULTY_LEVELS` table (weak /
normal / strong / nightmare) with a single set of stat, HP, level, and reward
multipliers. This makes all NPCs scale identically — a "strong" Noctis and a
"strong" Veyra are mathematically the same fight with different lore.

### Goal
Give each NPC its own scaling profile so every fight feels distinct.

### Approach
- Add an optional `difficultyProfile` field to each entry in `NPC_CHARACTERS`.
- Each profile overrides the shared `DIFFICULTY_LEVELS` values per NPC. Example:
  ```js
  {
    id: "noctis",
    name: "Noctis",
    tier: "apex",
    // ...existing fields...
    difficultyProfile: {
      weak:      { statMult: 0.75, hpMult: 0.90, levelBoost: -3, rewardMult: 0.65 },
      normal:    { statMult: 1.15, hpMult: 1.20, levelBoost:  1, rewardMult: 1.10 },
      strong:    { statMult: 1.55, hpMult: 1.60, levelBoost:  5, rewardMult: 1.70 },
      nightmare: { statMult: 2.10, hpMult: 2.20, levelBoost:  9, rewardMult: 2.60 },
    },
  }
  ```
- In `buildNpcMora` / `cmdChallenge`, look up the per-NPC override first, then
  fall back to the shared `DIFFICULTY_LEVELS` defaults for any missing fields.
- Optional: add a per-NPC "signature" (e.g., Noctis gets +spd, Veyra gets +def)
  that only applies on strong/nightmare.

### Why this matters
Player "KING" destroyed every NPC in one pass because the ceiling was uniform.
Per-NPC curves let us make some bosses tankier, some faster, some reward-heavy,
so farming strategy actually matters.

---

## 2. Per-Section Help Images

**Status:** Pending
**Related file:** [index.js](index.js) (the `.help` command)

The `.help` command is now sectored into sub-sections
(`companion`, `gear`, `economy`, `referrals`, `market`, `factions`, `arena`,
`pvp`, `hunting`, `fun`, `utilities`, `admin`). Each section deserves its own
banner image sent alongside the text.

### Goal
When a player runs `.help gear`, send an image + caption (the help text)
instead of a plain text message. Same for every other section.

### Approach
- Create a folder like `assets/help/` with one image per section:
  - `companion.jpg`
  - `gear.jpg`
  - `economy.jpg`
  - `referrals.jpg`
  - `market.jpg`
  - `factions.jpg`
  - `arena.jpg`
  - `pvp.jpg`
  - `hunting.jpg`
  - `fun.jpg`
  - `utilities.jpg`
  - `admin.jpg`
- In the help command, after resolving the requested section, try to load
  the matching image:
  ```js
  const imgPath = path.join(__dirname, "assets", "help", `${sectionKey}.jpg`);
  if (fs.existsSync(imgPath)) {
    await sock.sendMessage(chatId, { image: fs.readFileSync(imgPath), caption: helpText }, { quoted: msg });
  } else {
    await sock.sendMessage(chatId, { text: helpText }, { quoted: msg });
  }
  ```
- The default `.help` index page should also get its own banner image
  (`index.jpg` or `help.jpg`).

### Why this matters
Visual help screens make the bot feel polished and help new players navigate
the command surface without skimming a wall of text.

### Open questions
- Who's producing the artwork? (Likely commission / AI-gen in the Lumora
  aesthetic.)
- Should images be cached in memory at boot to avoid disk reads every
  `.help` call?

---

## 3. Mora Creation System (Lumora Labs)

**Status:** Pending — deferred until Pro system settles
**Related files:** [systems/pro.js](systems/pro.js), [data/premium_mora.json](data/premium_mora.json), [data/items.json](data/items.json)

Pro subscribers (and the owner) can forge entirely new Mora species through a
multi-stage creation ritual at **Lumora Labs**. Regular players cannot create
Mora — they can only tame what already exists.

### Goal
Let monetized players leave a real mark on the bot's living dex by designing
custom Mora — name, type, lore, moves, stats — with sensible guardrails so the
system doesn't turn into a "type your own god-mode pet" cheat.

### Inputs / Resources
- **Creation Powder** — a new rare consumable:
  - Drops very rarely from hunts (≤1% on high-rarity catches).
  - 1 free token awarded when a player first crosses **15 intelligence**.
  - Pro subscribers are granted **3 Creation Powders** on first activation
    of their tier.
- **Lucrystals (LCR)** — each creation also costs LCR (scaled by rarity).
- **Tame skill / Intelligence** — gates stat rolls (higher stats = tighter
  ceiling for low-intel creators).

### Creation Flow
1. Player runs `.create-mora` inside a dedicated **Lumora Labs** group.
2. Bot walks them through stages:
   - **Name** (uniqueness check vs. `mora.json` + `premium_mora.json`)
   - **Type** (must match their faction's affinity — see below)
   - **Description / lore** (short)
   - **Base stats** — rolled from a pool weighted by intelligence + tame
     skill + LCR spent.
   - **5 moves** — 3 of the chosen type, 2 free. Power/accuracy rolled.
3. Owner receives a DM with the full submission.
4. Owner replies `.approve <id>` or `.reject <id>`.
5. On approval: Mora is appended to the main registry and becomes
   tameable by everyone.

### Faction Type Rules
- **Harmony** → Nature-type only.
- **Rift** → Shadow-type primarily (plus Void/Chaos variants).
- **Purity** → Light, Psychic, Ice (disciplined types).
- **Neutral** → any single type.

### Bonus Mechanic — Corrupted Creation
If a player burns an `Energy Burst` during the creation ritual, the result
is a **Corrupted Mora** — higher stats but unstable moves (one is randomly
disabled per battle).

### Creator Rewards
When any player tames a Mora created by someone, the creator earns a small
Lucon kickback. This gives Pro players an ongoing passive income tied to
their creative work.

### Why this matters
This converts Pro subscription from "consume perks" to "participate in the
world," which is far stickier than pure content unlocks. It's also the
single biggest monetization hook: creation powder in the Pro market.

---

## 4. Item Codex / Database

**Status:** Pending
**Related file:** new — `systems/codex.js` (proposed)

A single in-bot reference listing every item, its effect, and **how to
obtain it** (shop, hunt drop, craft, Pro market, faction market, event, etc.).

### Goal
Stop players from having to ask "where do I get X?" in chat. Let them run
`.codex <item>` or `.codex list` and see a canonical source.

### Approach
- Add a `source` field to every entry in `data/items.json`:
  - `market` / `faction-market` / `pro-market` / `hunt` / `boss-drop` /
    `reward` / `event` / `owner-grant`.
- New command `.codex <query>`:
  - Without args: paginated list grouped by rarity.
  - With a query: resolves to a single item → full details + source line.
- Tie it into `.help gear` so it's discoverable.

### Why this matters
- Cuts support load in the group.
- Makes rare items feel *rare* because the path to them is visible.
- Pro items (Creation Powder, Ashveil Thread, etc.) get a natural promo
  slot inside the codex.

---

## Notes

- When any of the above lands, delete its section from this file and reference
  the commit in the PR description.
- Add new deferred ideas to this file under their own `##` heading using the
  same template (Status / Related file / Goal / Approach / Why this matters).

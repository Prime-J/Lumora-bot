# 📜 Lumora — Update & Patch Log

Living record of everything that has shipped. Newest first.

- **In-game source of truth:** `data/updates.json` (rendered by `.updates`).
- **Future / unshipped work:** [`docs/FUTURE_UPDATES.md`](FUTURE_UPDATES.md).
- **Design notes for live events:** [`docs/EVENTS.md`](EVENTS.md).
- **Rework planning:** [`docs/BOT_REWORK_PLAN.md`](BOT_REWORK_PLAN.md).

Convention: **major** = new system or game loop (`1.3.0`), **minor** = a feature
or meaningful content drop (`1.2.0`), **patch** = fixes, balance and polish
(`1.2.6`).

> **Next major update (proposed):** `1.3.0` — *"The Sunday Gift"*.
> Permanent weekly AI scripture event + owner command set + rotating bonus rewards.
> See `docs/EVENTS.md` event 005 and `docs/ADMIN_SUNDAY_EVENT.md`.

---

## 🔧 1.2.6 — "The Binding Patch" (2026-09-27)

A maintenance pass: the things that were quietly broken, fixed, and the things
that were ugly, cleaned up.

### Fixes

- **🏆 Leaderboard repaired.** `.lb` had been throwing on *every* call — the
  handler awaited an interactive-UI helper that no longer existed. The global
  board now renders rank, name, faction, DΞP, Lucons and Vault.
- **💠 Vault scoring.** Leaderboard weight `tamed` → `vault`, and the vault score
  is now `total shards + 2 × distinct species`, so the shard economy actually
  counts.
- **🧬 Factionless players** now read *Unaligned* instead of a blank line.
- **⚰️ Dead code removed** — the orphaned leaderboard menu helper, the unused
  top-players block, and the `moraOwned` remnants in the unused
  `lib/leaderboard/` module.
- **Arena crash** *(earlier in this cycle)* — a loss in `.npc` arena threw
  `ReferenceError: npcLevel is not defined`; the variable was scoped inside the
  win branch.

### Content

- **⛓️ Abyssal Chain of Binding (REL_004)** — new Mythic relic. Rift Bind
  success `30% → 98%`. Now a **permanent listing** in the market (7,400
  Lucons, never rotates, never sells out) plus a Rift-member discount in the
  faction market (6,400).
- **🎨 Hunting combat HUD** — the `.attack` move list was rebuilt into a proper
  card: moves grouped by *Fighting Style / Merged Mora / Basic*, power bars,
  accuracy, energy cost, riders (`heal`, `brace`, `never misses`, `counter`),
  live affordability markers and an energy footer.
- **🥋 Style buffs surfaced** — the active fighting-style rarity buff is shown
  on the move card instead of being hidden.

---

## 📜 1.2.5 — "The Scroll Trials" (2026-09-06)

- Quest rework: no more dead ends.
- **Secret codes** — every registered player holds one-time style codes; open a
  style scroll in DM, speak the code in a group to begin the trial.
- **Scroll Trials** for all 15 styles: story beats, a named NPC challenger, then
  the teacher.
- **Level barriers** — rare 8–10, epic 15, legendary 25. The trial stays open.
- **The teacher's price** — materials + a Lucon fee scaled to the style.
- **Discoveries** — cave / grotto / burrow encounters while hunting.
- **Loyalty gift** reworked (`.claim-gift` now grants Wind Step directly).
- **Guided tutorial**, **Admin Tokens Council**, faction stat alignment
  (Purity = Resonance · Rift = Bounty · Harmony = Honour), wiki + gender flow.

---

## ⛓ 1.0.2 — Combat HUD & Style Hype (2026-09-12)

- Combat UI upgraded to a game-HUD feel (PvP + wild).
- Help menu redesigned; 324 Bible verses added across the scripture system.
- `.styles--wind-step` hype command.
- Verified TikTok / Twitter media commands + logo suite.

---

## 🌌 0.9.0 — The Rework Deploy

- Four-stat overhaul + starter pickers.
- Spawns paused for the rework; `.ping`, help redesign, `.updates` command.

---

## 💎 0.5.0 — Full Rework Bundle (2026-05-26)

- **`moraOwned` retired.** Companions became **shards**; Mora exist as
  mergeable shards awakened on demand.
- New shard, merge, storage, corruption and discovery systems.
- Replaced the old taming loop with the shard → awaken → merge → fight → trade
  loop.

---

## 🏟️ Earlier

| Version | Name | Summary |
| --- | --- | --- |
| `0.4.0` | — | Mora sprite library, spawn rebalance, command expansion |
| `0.3.0` | Battlegrounds | Hunting grounds, banks, robbery, ranks, wealth, achievements, profile mask |
| `0.1.3` | — | Claim tax, XP jitter, economy tuning |
| `0.1.1` | — | Data-storm crisis patch (player data recovery) |

> Dates for `0.4.0` and older are not recorded in `data/updates.json`; see
> `git log` for the commit history behind them.

---

## How to ship an update

1. Add a `pending` entry to `data/updates.json` (version, name, `notes`, `stages`).
2. Players read `.updates` — anyone can see live + pending.
3. When it's live, the Architect runs `.update-release <version>`; the old
   `current` slides into `history` (last 25 kept) and the announcement card fires.
4. Add the entry here, in `docs/PATCHES.md`.

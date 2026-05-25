# Lumora WhatsApp Bot — Rework Design Doc

*Living document. Shape-session: 2026-05-25. Rework targeting v0.5.0.*

This rework brings the bot in line with the Roblox design (see [LUMORA_GAME_PLAN.md](LUMORA_GAME_PLAN.md)) — the WhatsApp bot becomes the live prototype for the merge / shard loop, faction identity, and quest-driven style progression.

---

## 1. Why a rework

The current bot loop (catch / tame / hunt) maxed out as a passive collector. The new loop puts **active combat choice** at the centre:

- Players don't just collect Mora — they **become** them via shard merges.
- Combat moves come from **fighting styles** (quest-unlocked) plus **merged Mora** movesets, not from passive stats.
- Trade, scarcity, and per-type storage caps create a real economy of shards.

This is a mechanical AND vocabulary overhaul — "tame," "pet," "stable" mostly retire; "shard," "shatter," "awaken," "merge," "shed" come in.

---

## 2. Core Loop (new)

A session, minute-to-minute:

1. **Encounter** a wild Mora (spawn, hunt, ambush).
2. **Defeat** it. If the Mora is `mergeable`, a **shard / crystal** drops to inventory.
3. **Store** the shard (subject to the 1-per-type cap — see §5).
4. **`.awaken <shard>`** when you want to swap loadouts → shard shatters, you **merge** with that Mora.
5. **Fight** as your merged form using `.attack` (move list = your style moves + merged-Mora moves).
6. To change loadout: shatter a different shard (merge replaces the previous) OR **`.shed`** to return to base form.
7. **Quests** along the way unlock new fighting styles → more moves in your `.attack` list.
8. **Trade** shards with other players; **buy storage upgrades** for the Mora types you want to stockpile.

---

## 3. Class System

**There is no class system.** The previous Tamer / Vessel split is dropped. Every player can catch, store, and merge — the only differentiation is what shards and styles they've accumulated.

---

## 4. Factions vs Fighting Styles

These are **two separate axes** in the rework. Conflating them was the old model.

| Axis | What it is | How you change it |
|---|---|---|
| **Faction** | Community / team affiliation. Lore identity. Determines who you raid with, faction treasury, faction rep. **Does NOT give combat moves.** | Faction Rite quest (existing). |
| **Fighting Style** | A combat moveset (e.g. Wind Step, Sun Walk, Stone Fist). Stacks — players can equip multiple over time. | Quest unlocks. New players have **no style** at all. |

Starter players have only **punch / dodge / block**. The first quest a player runs is the gateway to their first real moveset — high-stakes by design.

---

## 5. The Shard / Crystal System

### 5.1 Acquisition
- Defeating a `mergeable` Mora drops its **shard** (a.k.a. crystal) into your inventory.
- Some shards may also drop directly from spawn events (rate TBD).
- Non-mergeable Mora drop standard loot only — no shards.

### 5.2 Storage
- Inventory holds shards as discrete items, one entry per Mora type.
- **Per-type cap: 1 shard of any given Mora type by default.**
- To exceed the cap for a specific Mora, players **buy a storage upgrade** for that type (`+1` storage per upgrade, scaling cost TBD).
- This blocks stockpiling 20 of the strongest mergeable Mora and forces players to curate which types they invest in.

### 5.3 Trade
- Shards are tradeable between players (trade command set TBD — `.trade offer / accept`).
- Rare mergeable Mora become real market commodities.

### 5.4 Merge — `.awaken <shard>`
- Shatters the shard. Player merges with the Mora.
- **The merge is permanent until replaced.** It does NOT end on battle finish, timer, or death.
- The only ways to end a merge:
  - Shatter another shard via `.awaken` → new merge replaces the old form.
  - **`.shed`** → return to pure base form (punch / dodge / block).
- Shedding does NOT recover the shard — it was already shattered. Base form is just "unmerged human."

### 5.5 Merge Tiers (per-Mora flag)
Each mergeable Mora carries a tier flag in `data/mora.json`:

| Tier | Behavior |
|---|---|
| `merge: "full"` | Player fully **becomes** the Mora. Full HP / ATK / moveset of the Mora. |
| `merge: "partial"` | Default for most mergeable Mora. Player **keeps own stats**, gains the Mora's **moveset only**. |
| `merge: false` / absent | Can't be merged. No shard ever drops. |

Designer picks the tier per Mora — may correlate with rarity, element, or pure lore, but it's not strictly bound to any one of those.

---

## 6. Combat: `.attack` Command

Move source resolution at attack time:

1. Player's equipped fighting styles (zero or more, quest-unlocked).
2. Merged-Mora moveset (zero or one, depending on current merge).

**Display format — sectioned numbered list:**

```
--- STYLE: Wind Step ---
1. Gale Kick
2. Sky Step
--- STYLE: Sun Walk ---
3. Solar Step
--- MERGED: Tideling ---
4. Wave Crash
5. Tide Pull
```

- `.attack` → shows the list.
- `.attack N` → fires move number N.
- There is no "FACTION" section. Faction has no combat moves.
- Base-form players (no styles, no merge) see only:
  ```
  --- BASE ---
  1. Punch
  2. Dodge
  3. Block
  ```

---

## 7. Command Surface (new / changed)

| Command | Effect | Status |
|---|---|---|
| `.awaken <shard>` | Shatter shard, merge with that Mora | NEW |
| `.shed` | End current merge, return to base form | NEW |
| `.shards` (or `.inventory shards`) | List player's stored shards | NEW |
| `.attack [N]` | Show moveset / fire move N | REWORK (sectioned format) |
| `.trade …` | Offer / accept shard trades | NEW (later) |
| `.merge …` (old) | RETIRED — `.awaken` replaces it | RETIRE |
| `.tame`, `.pet`, `.stable` | RETIRED or repurposed | TBD |
| `.faction …` | UNCHANGED — factions are still real | KEEP |

---

## 8. Data Changes

### `data/mora.json`
Add per-Mora flags:
```json
{
  "id": "tideling",
  "name": "Tideling",
  "merge": "partial",
  "moveset": ["Wave Crash", "Tide Pull"],
  ...
}
```
- `merge`: `"full"` | `"partial"` | omit/false
- `moveset`: array of move IDs available when merged

### `data/Players.json`
Add per-player fields:
- `shards`: `{ "tideling": 1, "voltrix": 3, ... }` — current shard counts
- `shardStorage`: `{ "tideling": 1, "voltrix": 4, ... }` — max per type (default 1, increased by purchased upgrades)
- `currentMerge`: `null` | Mora ID — the active merge, if any
- `styles`: `["wind_step", ...]` — unlocked fighting styles

### New file: `data/styles.json` (eventually)
Catalog of fighting styles with movesets and unlock requirements. **Not required for v0.5.0** since styles ship in a later patch.

---

## 9. Build Order

The user has chosen to **ship the rework with only base actions** (punch / block / dodge), and add styles + quests in a follow-up patch. This means v0.5.0 launch can be limited combat-wise — the **shard / merge / shed loop is the carrier experience**.

### v0.5.0 — Merge Skeleton (this rework)
1. Data migrations: add `merge` flag to relevant Mora; add `shards` / `currentMerge` / `shardStorage` to Players.
2. Shard drop on defeat (for `mergeable: true/partial/full` Mora).
3. `.shards` / `.inventory` shard view.
4. `.awaken <shard>` — shatter, set `currentMerge`, broadcast merge in chat.
5. `.shed` — clear `currentMerge`.
6. `.attack` rework — sectioned format, sources merge moves from `currentMerge`'s `moveset`, base-form fallback for unmerged players.
7. Per-type storage cap enforced on shard drop.
8. Retire / migrate old `.merge` and related commands.

### v0.5.1 — Trade & Storage Upgrades
- Shard trade commands.
- Storage upgrade purchase via Lucons.

### v0.6.0 — Styles & Quest Engine
- First quest engine. Starter quests grant fighting styles.
- `data/styles.json` populated.
- `.attack` style sections light up.

### Later
- Style upgrades, style mastery, combo systems.
- More merge tiers / mutation mechanics.

---

## 10. Resolved Decisions (from 2026-05-25 follow-up)

- **Shard source**: BOTH defeat drops and spawn drops, but defeats give better odds (~80% on defeat, ~10-20% on spawn-claim). Combat is the primary acquisition path; casual spawn-claimers stay in the loop.
- **Storage upgrade pricing**: **real money**, not Lucons. Upgrades are a paid premium feature — not part of the in-game economy. (Payment infrastructure + per-Mora pricing tiers are a separate follow-up.)
- **Shard decay**: **none.** Shards are permanent until shattered or traded.
- **Shard fusion**: **none.** Shards are atomic — no same-type "+ version" upgrade, no cross-type hybrids. Duplicates exist only to use later or trade.
- **Merge UI signal**: **name prefix only.** Player's name renders as `[Tideling] Romio` while merged. No sprite swap in this rework.
- **Status effects on merge swap**: **clean wipe.** All buffs / debuffs / DoTs clear when shattering a new shard. New form, new state.
- **Trade model**: **P2P direct trade first**, public market board later. v0.5.1 ships `.trade @user offer X for Y` (mutual confirm). A public listing/market board is a later patch once the shard economy stabilizes.

## 11. Open Questions (still parked)

- Exact drop-rate numbers per Mora rarity tier (rough buckets only above).
- Payment infrastructure for storage upgrades (which provider, per-region pricing, etc.).
- Per-Mora pricing tiers for storage upgrades (does Legendary +1 cost more than Common +1, even in real money?).
- Anti-abuse for P2P trade (scam prevention, trade-back cooldowns?).
- Whether status-clear-on-swap should be exploitable as a poison-cleanse mid-fight, or restricted out-of-combat only.

---

## 12. Out of Scope (for the rework patch)

- Battle scenes / image rendering (already built but unshipped — fix in a separate patch).
- Anime cards system ([[project_lumora_anime_cards]]) — unrelated track.
- Roblox port — separate doc, separate codebase.

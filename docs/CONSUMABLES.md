# 🧪 Lumora — Consumable Items Catalog

> **What every consumable does, what it costs, and where it fits.** Source of truth: `data/items.json` (91 items total). Consumables are used with **`.use <name>`** in or out of battle depending on the item. Prices are the base market price in **Lucons**.

---

## 1. Healing & Energy (use anytime)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `HP_TINCTURE` | Sun-Dew Tincture | Common | Restores **50 HP** instantly. Use between fights. | 80 |
| `HP_TONIC_FULL` | Anastasis Draught | Rare | Heals you to **FULL HP** instantly. Named after the legendary style. | 240 |
| `ITM_001` | Minor Healing Capsule | Common | Heals **30 HP**. | 35 |
| `ITM_002` | Major Healing Capsule | Uncommon | Heals **70 HP**. | 90 |
| `ENERGY_TONIC` | Surge Tonic | Uncommon | Refills your **combat energy bar to full**. Use mid-fight to chain finishers. | 120 |
| `ITM_016` | Energy Capsule | Common | Restores **25 energy**. | 40 |

## 2. Aura, Corruption & Status (battle/life protection)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `ITM_003` | Aura Stabilizer | Rare | Restores **15 Aura after fainting**. | 210 |
| `ITM_005` | Stabilizer | Uncommon | **−20 Primordial Energy**, reduces flee risk. | 120 |
| `ITM_006` | Cleanse Shard | Rare | Removes **corrupted status** from one Mora. | 260 |
| `SCR_005` | Scroll of Aura Shield | Rare | Prevents **aura loss** from one faint. | 190 |
| `SCR_001` | Scroll of Purification | Rare | Purifies one **corrupted Mora or corruption event**. | 180 |

## 3. Shard & Vault Items

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `SHARD_VIAL` | Cleansing Vial | Rare | Purifies **one corrupted shard** in your vault back to normal. No Lucon cost. | 350 |
| `SHARD_LURE` | Shard Lure | Uncommon | **Guarantees a shard drop** on your next defeated mergeable wild Mora. | 200 |
| `RES_001` | Rift Escape Shard | Rare | **Breaks free from raid capture.** Single use. | 300 |

## 4. Hunting Aids

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `ITM_007` | Lure Beacon | Uncommon | **+15% Mora spawn rate** for one hunt. | 130 |
| `ITM_008` | Forbidden Mora Lure | Epic | **Forces an immediate Mora spawn** in hunting zones. | 950 |
| `ITM_014` | Capture Net | Common | **+5% catch success** for one attempt. | 60 |
| `ITM_015` | Pulse Tonic | Uncommon | Reduces **environmental HP loss** for one hunt. | 95 |
| `SCR_012` | Scroll of Corruption Pulse | Rare | **+20% corrupted Mora spawn** chance for one hunt. | 170 |
| `SCR_014` | Scroll of Rift Step | Rare | Avoids **environmental damage** for one hunt. | 165 |

## 5. Battle Scrolls (temporary battle buffs)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `SCR_002` | Scroll of Tranquility | Uncommon | **−20% incoming damage** for one battle. | 140 |
| `SCR_003` | Scroll of Renewal | Rare | Restores **50 player HP + 30 active Mora HP**. | 170 |
| `SCR_004` | Scroll of Spirit Bond | Uncommon | **+15% catch success** for next Mora. | 130 |
| `SCR_006` | Scroll of Dominion | Rare | Temporarily **controls unstable Mora** during battle. | 180 |
| `SCR_007` | Scroll of Precision | Uncommon | **+20% move accuracy** for one battle. | 130 |
| `SCR_008` | Scroll of Command | Rare | Forces **Mora obedience** while unstable. | 170 |
| `SCR_009` | Scroll of War Focus | Rare | **+15% Mora attack** for one battle. | 175 |
| `SCR_010` | Scroll of Tactical Insight | Uncommon | **Reveals enemy Mora stats** during battle. | 125 |
| `SCR_011` | Scroll of Rift Surge | Rare | **+30% Mora attack** for next battle. | 190 |
| `SCR_013` | Scroll of Abyss Echo | Uncommon | Reveals **hidden unstable Mora** nearby. | 135 |
| `SCR_015` | Scroll of Void Channel | Epic | **+10 Primordial Energy** instantly. | 260 |

## 6. Permanent / Character Boosts (single dose, permanent gain)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `ITM_009` | Vital Core Crystal | Rare | **+20 player max HP** (permanent). | 420 |
| `ITM_010` | Traveler's Satchel | Uncommon | **+10 inventory storage** (permanent). | 240 |
| `ITM_011` | Expedition Pack | Rare | **+20 inventory storage** (permanent). | 520 |
| `ITM_012` | Dimensional Pouch | Epic | **+40 inventory storage** (permanent). | 1400 |
| `RESONANCE_VIAL` | Resonance Vial | Rare | **+50 Resonance** instantly. | 300 |
| `READERS_INK` | Reader's Ink | Rare | **+3 Intelligence.** Single dose. | 320 |
| `QUEST_COMPASS` | Quest Compass | Uncommon | Re-DMs the **next pending NPC hint + hidden command** for every active chained quest. | 180 |
| `MUT_003` | Bond Amplifier | Epic | **+50 companion bond points** instantly. | 800 |

## 7. Mutation Items (temporary Mora mutations)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `MUT_001` | Mutation Shard | Rare | Triggers a **temporary mutation** on a non-companion Mora. Lasts **1–2 battles**. | 600 |
| `MUT_002` | Primal Catalyst | Epic | Triggers a **stronger mutation**. Lasts **2–3 battles**. | 1200 |

## 8. Access & Market Items (unlock access)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `ITM_013` | Shadow Permit | Rare | **Temporary access** to restricted black-market stock. | 600 |
| `ACC_001` | Black Market Pass | Rare | **Allows access to the Black Market.** | 700 |
| `ACC_002` | Vault Key | Legendary | **Unlocks hidden black-market inventory.** | 2600 |

## 9. Robbery Tools (consumed on use — success or fail)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `SNATCH_GLOVE` | Snatch Glove | Uncommon | Lets you attempt **`.rob @user`** — victim has **5s** to `.defend`. Consumed on use. | 1000 |
| `SHADOW_GLOVE` | Shadow Glove | Rare | Faster snatch — victim has only **3s** to defend. Consumed on use. | 8000 |
| `PHANTOM_GLOVE` | Phantom Glove | Legendary | Elite snatch — victim has only **2s** to defend. Consumed on use. | 25000 |

## 10. Special / Crafting

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `CREATION_POWDER` | Creation Powder | Mythic | Required to submit a **new Mora design** at Lumora Labs (`.create-mora`). Needs 15+ Intelligence. | — |
| `REOB` | Reob | Mythic | Rift Seeker origin — use to forge a Mora at Lumora Labs. **+1% rarity boost per creation**. | — |
| `PURIFY_ORB` | Orb of Purification | Rare | Purifies **corrupted Mora during wild battles**. Base success ~40%. | — |
| `PROFILE_MASK` | Veil Mask | Rare | Hides your profile from **`.profile` lookups** by other players. Toggle off with `.unmask`. | 3500 |

---

## Faction Wall Crystals (raid defense)

| ID | Name | Rarity | What it does | Price |
|---|---|---|---|---|
| `CRY_001` | Shard Crystal | Common | Fortifies faction wall: **+50 HP**. | 100 |
| `CRY_002` | Core Crystal | Uncommon | Fortifies faction wall: **+150 HP**. | 300 |
| `CRY_003` | Prismatic Crystal | Rare | Fortifies faction wall: **+400 HP**. | 800 |
| `CRY_004` | Rift Crystal | Epic | Fortifies faction wall: **+1000 HP**. | 2000 |

---

## Non-consumables (for reference — not used up)

- **Gear (31)** — `GER_*` + `REL_*`: equippable cores, charms, relics, boots, cloaks, badges. Equip with `.equip`, view with `.gear`.
- **Materials (5)** — `MAT_*`: crafting materials (Rift Dust, Aura Crystal, Mora Fang, Purity Ash, Shadow Resin).
- **Scroll items above that are permanent-access or battle-triggered** are consumables; gear never is.

---

## Data notes (for the Architect)

- Consumable `effects` live in `data/items.json` as structured keys (e.g. `heal`, `energy`, `maxHp`, `storage`, `raidEscape`, `forceShardDropNext`) — the bot reads these at `.use` time.
- Prices shown are base market prices; the market applies rarity/black-market multipliers at rotation (see `systems/market.js`).
- Rarity power (how hard a Mora hits in battle) is a separate curve in `core/battleMath.js` — consumables do **not** affect combat damage directly; they heal, buff, and unlock.

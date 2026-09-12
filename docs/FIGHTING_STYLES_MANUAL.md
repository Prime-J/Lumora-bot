# ⚔️ LUMORA — FIGHTING STYLES MANUAL

### *The Complete Guide to Combat Disciplines*

---

> *"Every style is a language. The Rift teaches fluency through pain."*
> — The Eternal Mora Sage

---

## TABLE OF CONTENTS

1. [How Fighting Styles Work](#how-fighting-styles-work)
2. [How to Get a Fighting Style](#how-to-get-a-fighting-style)
3. [How Moves Work](#how-moves-work)
4. [Type Matchups](#type-matchups)
5. [Common Styles](#common-styles)
6. [Rare Styles](#rare-styles)
7. [Epic Styles](#epic-styles)
8. [Legendary Styles](#legendary-styles)
9. [Faction Exclusive Styles](#faction-exclusive-styles)
10. [Scroll Drop Rates](#scroll-drop-rates)
11. [Style Rarity Tiers](#style-rarity-tiers)

---

## HOW FIGHTING STYLES WORK

Each Lumorian can equip **one fighting style** at a time. A fighting style gives your character **3 unique moves** that you can use in PvP and NPC battles.

- Your fighting style moves are **separate** from your Mora's moves
- You alternate between your moves and your Mora's moves in battle
- Higher-tier styles have more powerful moves but cost more energy
- You can change your equipped style anytime with `.equip-style <name>`

---

## HOW TO GET A FIGHTING STYLE

The chain is:

```
Hunt → Scroll drops → Open scroll in DM → Secret code revealed → Speak the code in any GC → The Scroll Trial → Style unlocked
```

**Step 1: Get a Scroll**
Scrolls drop randomly from wild Mora defeats (`.hunt`). The rarer the scroll, the rarer the style it unlocks.

**Step 2: Open the Scroll — in your DM**
Type `.open <scroll name>` (e.g. `.open Windworn Scroll`). Style scrolls are **opened in your DMs**: the bot consumes the scroll and reveals the quest briefing **plus your personal secret code**.

> 🔒 **Code privacy:** every code is *personal* and *one-time* — generated just for you when you register, unique per player per style. It is never shown in group chats. Keep your DMs clean; the code is your key.

**Step 3: Speak the Code in Any Group Chat**
Type your code raw in any group chat (e.g. `lum-a3f9c2`). This begins the Scroll Trial — a one-time ceremony the bot recognizes before any normal command. If you retreat or log off, speak the same code again later and the trial resumes exactly where you left it.

**Step 4: The Trial — no dead ends**

1. **The crossing** — you are teleported to a foreign land. Choose **PROCEED** (`.sq-proceed`) or **RETREAT** (`.sq-retreat`). Retreat only *pauses* the trial — the quest stays active and resumable.
2. **Story beats** — short scenes of the place, advanced with **CONTINUE**.
3. **The challenger** — an NPC who perfected the style (see each style's entry) drops in. Send the fight with `.sq-fight`; it uses the real battle engine and scales with your level. **Losing is not the end** — challenge again freely.
4. **The teacher** — victory earns the teacher's attention. But teaching has a price: **materials** gathered from real hunts (drops are *not certain*, and the teacher tells you where to look) plus a **Lucon fee** scaled to the style's power. Hand materials over with `.sacrifice`, or hold everything and speak your code to pay and be taught in one breath.
5. **The level barrier** — every gated style refuses students below its level requirement (table below). The trial stays open — come back stronger.

**Step 5: Equip the Style**
Type `.equip-style <name>` to equip your new fighting style.

**Level barriers & the teacher's price**

| Tier | Level Gate | Fee | Materials |
|------|-----------|-----|-----------|
| 🟢 Common | Any level | 1,500–1,800 LC | 2–3 of one or two materials |
| 🔵 Rare | Lv. 8–10 | 2,200–2,500 LC | 2–3 materials |
| 🟣 Epic | Lv. 15 | 3,000 LC | 2–3 materials |
| 🟡 Legendary | Lv. 25 | 3,500–4,000 LC | rare materials only |

**Where to hunt for materials** (drops are not certain — persistence pays):

| Material | Found |
|----------|-------|
| Sky-Shard Feather | Hunt Wind-type Mora — where Zephyra and Gustling roam (wind terrains) |
| Galestone Chip | Wind-carved cliffs — rare hunt finds |
| Aura Crystal | Near Volt Mora — Volt Expanse hunts |
| Mora Fang | From Nature Mora — Verdant Wilds hunts |
| Shadow Resin | Shadow Hollow hunts — rare |
| Rift Dust | Rift Scar hunts — unstable ground sheds it |
| Purity Ash | Terra Shatterfields — rare, and only for the worthy |
| Shard Crystal | Cold hunts — common finds in Frostreach |
| Core Crystal | Deep hunts — uncommon everywhere, certain nowhere |
| Prismatic Crystal | Rare finds in any weather |
| Chrono Shard | Near rift-scarred ground (Rift Scar) — very rare |

💡 **Discoveries:** while a trial still needs materials, hidden places (mysterious caves, humming grottos, lightless burrows) appear more often on hunts. **ENTER** them for a guaranteed needed material, Lucons, or a guardian battle. **LEAVE** costs nothing.

---

## HOW MOVES WORK

Each style has **3 moves**:

| Move Slot | Type | Description |
|-----------|------|-------------|
| **Move 1** | Basic | Low energy cost, high accuracy, moderate power |
| **Move 2** | Utility | Often 100% accuracy, may heal/buff/drain |
| **Move 3** | Finisher | High power, lower accuracy, high energy cost |

**Energy** regenerates 12% of max per turn in battle. Choose moves wisely — running out means you're forced to skip.

**Move Stats:**
- **Power** — Base damage (higher = more damage)
- **Accuracy** — Chance to hit (100% = never misses)
- **Energy Cost** — Energy consumed per use

---

## TYPE MATCHUPS

| Attacking Type | Strong Against | Weak Against |
|----------------|---------------|--------------|
| 🔥 Flame | Nature, Frost | Aqua, Terra |
| 💧 Aqua | Flame, Terra | Nature, Volt |
| 🪨 Terra | Volt, Flame | Aqua, Wind, Nature |
| ⚡ Volt | Aqua, Wind | Terra |
| 🌿 Nature | Aqua, Terra | Flame, Frost |
| ❄️ Frost | Wind, Nature | Flame |
| 💨 Wind | Terra, Frost | Volt |
| 🌑 Shadow | Shadow (1.1x) | — |

**Super Effective:** 1.25x damage
**Not Very Effective:** 0.75x damage

---

## COMMON STYLES

*Starting styles available to all factions. Speak your code to begin the trial — Wind Master Reva (Wind Step) and Sun Priestess Iyra (Sun Walk) teach them.*

---

### 🌬️ WIND STEP

| | |
|---|---|
| **Type** | Wind |
| **Rarity** | 🟢 Common |
| **Faction** | Any |
| **Quest** | `first_breath` |
| **Gate · Teacher** | Any level · Wind Master Reva |
| **Price** | 3× Sky-Shard Feather, 1× Galestone Chip · 1,500 LC |
| **Difficulty** | ★☆☆☆☆ |

> *"A fluid Lumorian discipline that bends momentum and air. Practitioners strike from impossible angles."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Gale Kick | 38 | 95% | 4 | A whipping kick carried on a gust of wind |
| Sky Step | 28 | 100% | 5 | Leap upward — your next move comes from above. **Cannot miss** |
| Cyclone Cut | 62 | 88% | 8 | A spinning blade of compressed air |

**Best for:** Beginners who want reliable hits and a strong finisher.

---

### ☀️ SUN WALK

| | |
|---|---|
| **Type** | Solar |
| **Rarity** | 🟢 Common |
| **Faction** | Any |
| **Quest** | `first_dawn` |
| **Gate · Teacher** | Any level · Sun Priestess Iyra |
| **Price** | 2× Aura Crystal, 2× Mora Fang · 1,800 LC |
| **Difficulty** | ★☆☆☆☆ |

> *"A radiant style taught only in the Sanctuary's inner courtyard. Each step burns its impression into the air."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Solar Step | 40 | 95% | 4 | A scorching forward stride |
| Flare Palm | 32 | 100% | 5 | A bright palm-strike that dazzles |
| Dawn Pillar | 70 | 85% | 9 | Call down a column of solar fire |

**Best for:** Players who want raw damage over precision.

---

## RARE STYLES

*Faction-locked or rare scroll drops. Level gate: Lv. 8–10. The challengers — Maru, Brakk, Nhal, Ash-Voice Dara, Tessera, Bolt-Runner Syx, Rimekeeper Sorrel — test you before their teachers will.*

---

### 🌊 TIDE VEIL

| | |
|---|---|
| **Type** | Aqua |
| **Rarity** | 🔵 Rare |
| **Faction** | 🌿 Harmony Exclusive |
| **Quest** | `tides_of_sanctuary` |
| **Gate · Teacher** | Lv. 8+ · Tide-Keeper Solen |
| **Price** | 3× Aura Crystal, 1× Core Crystal · 2,200 LC |
| **Difficulty** | ★★☆☆☆ |

> *"Harmony's defensive water form, taught by the Sanctuary's tide-keepers. Strikes ride the rhythm of breath and current."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Mending Wave | 0 | 100% | 6 | **Heals 18 HP** to yourself |
| Ripple Strike | 35 | 95% | 4 | A flowing palm-strike that washes back |
| Drown Press | 58 | 90% | 7 | A heavy press of compressed water |

**Best for:** Defensive players who want sustain. The heal makes you hard to kill.

---

### 🪨 BONE CRUSH

| | |
|---|---|
| **Type** | Stone |
| **Rarity** | 🔵 Rare |
| **Faction** | ⚔️ Purity Exclusive |
| **Quest** | `oath_of_iron` |
| **Gate · Teacher** | Lv. 8+ · Hierarch Vance |
| **Price** | 3× Mora Fang, 1× Shadow Resin · 2,200 LC |
| **Difficulty** | ★★☆☆☆ |

> *"The Purity Order's strike-discipline: no flourish, no waste. Every motion ends in a fracture."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Bone Hammer | 50 | 92% | 5 | Straight crush |
| Iron Stance | 0 | 100% | 4 | Defensive stance |
| Pillar Drop | 75 | 82% | 9 | Massive overhead strike |

**Best for:** High-damage dealers who can afford to miss sometimes.

---

### 🌑 VOID SEVER

| | |
|---|---|
| **Type** | Void |
| **Rarity** | 🔵 Rare |
| **Faction** | 🕶️ Rift Exclusive |
| **Quest** | `void_initiation` |
| **Gate · Teacher** | Lv. 8+ · Rift-Tongue Kael |
| **Price** | 4× Rift Dust, 2× Shadow Resin, 1× Galestone Chip · 2,500 LC |
| **Difficulty** | ★★★☆☆ |

> *"Rift-tongue carving. Each strike pulls a thread of substance out of the world and lets it bleed back in."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Sever Line | 42 | 95% | 5 | Clean void cut |
| Void Drain | 30 | 100% | 5 | Drains energy from target |
| Null Eclipse | 80 | 80% | 10 | Devastating void finisher |

**Best for:** Rift players who want high-risk, high-reward combat.

---

### 🔥 PYROLEXIS

| | |
|---|---|
| **Type** | Fire |
| **Rarity** | 🔵 Rare |
| **Faction** | Any |
| **Quest** | `rite_of_embers` |
| **Gate · Teacher** | Lv. 8+ · Speaker Phlox |
| **Price** | 2× Mora Fang, 1× Core Crystal · 2,200 LC |
| **Difficulty** | ★★★☆☆ |

> *"From the Greek pyr (fire) and lexis (speech). A spoken-art discipline — every motion is a word of flame."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Logos Ardens | 36 | 95% | 4 | Burning word-strike |
| Crepitus | 30 | 100% | 5 | Crackling flame burst |
| Hekatombe | 72 | 82% | 9 | Fire eruption |

**Best for:** Balanced fighters who want fire-type coverage.

---

### 🛡️ KATAPHRAXIS

| | |
|---|---|
| **Type** | Stone |
| **Rarity** | 🔵 Rare |
| **Faction** | 🌿 Harmony Exclusive |
| **Quest** | `vow_of_the_shield` |
| **Gate · Teacher** | Lv. 8+ · Aspis the Quiet |
| **Price** | 2× Purity Ash, 3× Shard Crystal · 2,200 LC |
| **Difficulty** | ★★★☆☆ |

> *"From the Greek kataphraktos (fully armored). Harmony's heavy-plate counter-form, taught in the outer Sanctum."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Phalanx Step | 34 | 95% | 4 | Shield advance |
| Aegis Stance | 0 | 100% | 4 | Counter stance — absorbs next hit |
| Citadel | 0 | 100% | 7 | Full defense — massive damage reduction |

**Best for:** Tank players who want to outlast opponents.

---

### ⚡ FULGUR STRIKE

| | |
|---|---|
| **Type** | Storm |
| **Rarity** | 🔵 Rare |
| **Faction** | Any |
| **Quest** | `the_thunder_road` |
| **Gate · Teacher** | Lv. 10+ · Storm-Rider Kestrel |
| **Price** | 2× Core Crystal, 2× Aura Crystal · 2,500 LC |
| **Difficulty** | ★★★☆☆ |

> *"Latin: fulgur (lightning flash). A storm-road discipline — every strike is the thunder's echo."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Celer Fulmen | 40 | 95% | 4 | Lightning jab |
| Tonitrui Pes | 32 | 100% | 5 | Thunder stomp |
| Caerulea Flagrum | 72 | 85% | 9 | Storm lash |

**Best for:** Fast attackers who want speed + power.

---

### ❄️ FROST MANTLE

| | |
|---|---|
| **Type** | Frost |
| **Rarity** | 🔵 Rare |
| **Faction** | ⚔️ Purity Exclusive |
| **Quest** | `the_winter_oath` |
| **Gate · Teacher** | Lv. 10+ · Sentinel Yrsa |
| **Price** | 4× Shard Crystal, 2× Mora Fang · 2,500 LC |
| **Difficulty** | ★★★☆☆ |

> *"The Order's cold sentinel form, taught in the high passes. Frost does not argue — it simply ends things."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Glacies Ictus | 38 | 95% | 4 | Ice strike |
| Aegis Frigus | 0 | 100% | 4 | Frost shield |
| Pruina Occasus | 68 | 87% | 8 | Blizzard finisher |

**Best for:** Purity players who want defensive ice combat.

---

## EPIC STYLES

*Level gate: Lv. 15. Epic scrolls, harder trials — The Unlit, The Cartographer, Nightbloom and Veiled One Morwen do not lose twice.*

---

### 🌑 TENEBRIS

| | |
|---|---|
| **Type** | Void |
| **Rarity** | 🟣 Epic |
| **Faction** | 🕶️ Rift Exclusive |
| **Quest** | `covenant_of_caligo` |
| **Gate · Teacher** | Lv. 15+ · Caligo |
| **Price** | 3× Shadow Resin, 3× Rift Dust, 2× Galestone Chip · 3,000 LC |
| **Difficulty** | ★★★★☆ |

> *"Latin: tenebrae (darkness, gloom). A Rift-borne shadow art — quieter than Void Sever, and far more lethal."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Umbra Caedere | 44 | 95% | 5 | Shadow cut |
| Noctis Vorax | 36 | 100% | 6 | Night drain — siphons energy |
| Eclipsis | 92 | 80% | 11 | Eclipse obliteration |

**Best for:** Rift players who want the most powerful void style.

---

### ⭐ ASTROBOLOS

| | |
|---|---|
| **Type** | Solar |
| **Rarity** | 🟣 Epic |
| **Faction** | Any |
| **Quest** | `starlit_passage` |
| **Gate · Teacher** | Lv. 15+ · Selene the Wanderer |
| **Price** | 4× Aura Crystal, 1× Prismatic Crystal · 3,000 LC |
| **Difficulty** | ★★★★☆ |

> *"Greek: astrobolos (star-thrown, struck by stars). A celestial striking art — sai-based, radiant, devastating."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Stella Cadens | 46 | 92% | 5 | Falling star strike |
| Sidereum Ictus | 34 | 100% | 5 | Star strike |
| Nova Igne | 88 | 82% | 10 | Supernova explosion |

**Best for:** Players who want celestial power with any faction.

---

### 🌿 VENOMSONG

| | |
|---|---|
| **Type** | Toxic |
| **Rarity** | 🟣 Epic |
| **Faction** | 🌿 Harmony Exclusive |
| **Quest** | `the_poisoned_garden` |
| **Gate · Teacher** | Lv. 15+ · Garden-Mother Solenne |
| **Price** | 3× Mora Fang, 2× Shadow Resin · 3,000 LC |
| **Difficulty** | ★★★★☆ |

> *"Harmony's hidden garden-form. The Sanctuary teaches mercy — and this is what mercy looks like to those who refuse it."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Cantus Veneni | 36 | 95% | 4 | Poison melody |
| Virus Lenis | 28 | 100% | 5 | Gentle toxin — applies poison |
| Requiem Noctis | 80 | 84% | 10 | Death requiem |

**Best for:** Harmony players who want damage-over-time poison combat.

---

### 🌙 LUNAR SHROUD

| | |
|---|---|
| **Type** | Lunar |
| **Rarity** | 🟣 Epic |
| **Faction** | 🕶️ Rift Exclusive |
| **Quest** | `the_moonless_road` |
| **Gate · Teacher** | Lv. 15+ · Veiled One Morwen |
| **Price** | 3× Shadow Resin, 2× Core Crystal · 3,000 LC |
| **Difficulty** | ★★★★☆ |

> *"Rift-tongue night-art, danced only under the dark moon. The Shroud is not a defence — it is a statement."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Umbra Lunae | 42 | 95% | 5 | Moon shadow strike |
| Tenebris Adsum | 34 | 100% | 5 | Darkness arrives |
| Eclipsis Plena | 86 | 82% | 11 | Full eclipse |

**Best for:** Rift players who want night-themed devastating power.

---

## LEGENDARY STYLES

*Endgame styles. Level gate: Lv. 25 — the Convalescent and Second-Hand Mae guard the deepest disciplines in Lumora.*

---

### ✨ ANASTASIS

| | |
|---|---|
| **Type** | Solar |
| **Rarity** | 🟡 Legendary |
| **Faction** | 🌿 Harmony Exclusive |
| **Quest** | `the_mercy_rising` |
| **Gate · Teacher** | Lv. 25+ · Eleos |
| **Price** | 2× Prismatic Crystal, 2× Purity Ash · 3,500 LC |
| **Difficulty** | ★★★★★ |

> *"Greek: anastasis (rising, resurrection). The Sanctuary's most sacred discipline — taught only to those who have earned the right to bring others back."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Lux Lenis | 26 | 100% | 4 | Gentle light — low damage, always hits |
| Velamen Sanans | 0 | 100% | 7 | **Healing veil** — restores HP |
| Resurgentia | 105 | 80% | 12 | **Resurrection strike** — highest damage move in the game |

**Best for:** The ultimate healer/nuker hybrid. Harmony's crown jewel.

---

### ⏳ CHRONO VOW

| | |
|---|---|
| **Type** | Time |
| **Rarity** | 🟡 Legendary |
| **Faction** | Any |
| **Quest** | `the_keepers_hour` |
| **Gate · Teacher** | Lv. 25+ · Keeper Chronis |
| **Price** | 2× Chrono Shard, 1× Prismatic Crystal · 4,000 LC |
| **Difficulty** | ★★★★★ |

> *"The oldest style in the Chronicle, older than the factions. Chrono Vow does not fight time — it negotiates with it."*

| Move | Power | Accuracy | Energy | Description |
|------|-------|----------|--------|-------------|
| Momentum Fractum | 44 | 100% | 5 | Time fracture — **never misses** |
| Tempus Inversum | 0 | 100% | 6 | **Time reversal** — reverses damage |
| Ultima Hora | 100 | 80% | 12 | **Final hour** — catastrophic finisher |

**Best for:** The ultimate endgame style. Available to any faction.

---

## FACTION EXCLUSIVE STYLES

| Faction | Exclusive Styles |
|---------|-----------------|
| 🌿 **Harmony** | Tide Veil, Kataphraxis, Venomsong, Anastasis |
| ⚔️ **Purity** | Bone Crush, Frost Mantle |
| 🕶️ **Rift** | Void Sever, Tenebris, Lunar Shroud |
| **Any Faction** | Wind Step, Sun Walk, Pyrolexis, Fulgur Strike, Astrobolos, Chrono Vow |

---

## SCROLL DROP RATES

Scrolls drop when you defeat wild Mora (hunts and wild battles). Drop chance per encounter, by scroll rarity:

| Scroll Rarity | Drop Rate | Notes |
|---------------|-----------|-------|
| Common | 2.5% | Easiest to find |
| Rare | 1.0% | Decent chance over time |
| Epic | 0.3% | Grind needed |
| Legendary | 0.1% | Very rare |

**Total chance of ANY scroll dropping: ~5.4% per encounter.** While a trial still needs materials, hidden discoveries appear more often instead — the wild rewards the determined.

---

## STYLE RARITY TIERS

| Tier | Styles | Max Move Power | Difficulty to Obtain |
|------|--------|---------------|---------------------|
| 🟢 Common | Wind Step, Sun Walk | 62–70 | Tutorial |
| 🔵 Rare | Tide Veil, Bone Crush, Void Sever, Pyrolexis, Kataphraxis, Fulgur Strike, Frost Mantle | 58–80 | Medium |
| 🟣 Epic | Tenebris, Astrobolos, Venomsong, Lunar Shroud | 80–92 | Hard |
| 🟡 Legendary | Anastasis, Chrono Vow | 100–105 | Endgame |

---

## QUICK REFERENCE

### Commands

| Command | Description |
|---------|-------------|
| `.styles` | View all available fighting styles |
| `.equip-style <name>` | Equip a fighting style |
| `.unequip <style>` | Remove your current style |
| `.scrolls` | Your scroll inventory |
| `.open <scroll>` | Open a scroll in DM — reveals the briefing + your secret code |
| `<your code>` | Speak the code raw in any GC to start/resume the trial |
| `.sq-proceed` / `.sq-retreat` | Advance or pause the trial (retreat is resumable) |
| `.sq-fight` | Challenge the style's NPC |
| `.sacrifice` | Hand trial materials to the teacher |
| `.inv` | Check your inventory for materials |
| `.quest` | View your active trials |

### Style Comparison

| Style | Type | Best Move Power | Has Heal? | Faction |
|-------|------|----------------|-----------|---------|
| Wind Step | Wind | 62 | No | Any |
| Sun Walk | Solar | 70 | No | Any |
| Tide Veil | Aqua | 58 | ✅ Yes | Harmony |
| Bone Crush | Stone | 75 | No | Purity |
| Void Sever | Void | 80 | No | Rift |
| Pyrolexis | Fire | 72 | No | Any |
| Kataphraxis | Stone | 34 | ✅ Shield | Harmony |
| Fulgur Strike | Storm | 72 | No | Any |
| Frost Mantle | Frost | 68 | ✅ Shield | Purity |
| Tenebris | Void | 92 | No | Rift |
| Astrobolos | Solar | 88 | No | Any |
| Venomsong | Toxic | 80 | No | Harmony |
| Lunar Shroud | Lunar | 86 | No | Rift |
| Anastasis | Solar | 105 | ✅ Yes | Harmony |
| Chrono Vow | Time | 100 | ✅ Reversal | Any |

---

*Document generated for Lumora v1.2.5 — "The Scroll Trials"*
*Last updated: September 2026*

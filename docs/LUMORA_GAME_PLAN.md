# Lumora: The Game — Design North-Star

*Living document. Updated as the vision sharpens. Last shape-session: 2026-04-23.*

---

## 1. Core Concept

**Lumora** is an open-world action-RPG on **Roblox** where players are Lumorians — humans born with the ability to bind Mora creatures into **Rift Crystals** and **infuse** with them to take on their powers, forms, and movesets.

Identity = your **Faction** (who you are).
Combat style = your **currently infused Mora** (what you fight as).

The WhatsApp bot is the live design prototype. Everything being built there (moves, factions, raids, status effects, economy) ports forward.

---

## 2. Core Loop

A player session, minute-to-minute:

1. **Explore** an island in the open world (biome-themed, faction-gated at higher tiers).
2. **Encounter** wild Mora (spawn events — first to weaken and tame wins).
3. **Tame** → Mora's essence crystallizes into a Rift Crystal, added to your Sanctum collection.
4. **Equip** up to N crystals in your active loadout (slot count scales with level).
5. **Infuse** with one → movement, appearance, and moveset change.
6. **Fight** wild Mora, other players, or faction raids as your infused form.
7. **De-infuse** at stronghold or out-of-combat to swap.
8. **Level up**, earn Lucons, rep, and rarer Mora.

**Session length target:** 20-60 minutes. Always something to chase.

---

## 3. Factions

Three factions — identity layer, **semi-permanent**.

| Faction | Stronghold | Identity | Mechanical Flavor |
|---|---|---|---|
| 🌿 **Harmony Lumorians** | Sanctuary | Healers, protectors | Infused moves can heal allies on hit; lower incoming status duration |
| ⚔️ **Purity Order** | Citadel | Disciplined warriors | Crits harder; lockout effects (paralyze/sleep) last +1 turn when they apply |
| 🕶️ **Rift Seekers** | Rift Nexus | Chaotic, corrupted | Lifesteal on attacks; can corrupt infused Mora for +power at cost of HP drain |

**Switching factions:**
- **"Faction Rite"** quest chain unlocks the swap
- Lose 50% earned faction rep
- Pay a Lucons fee scaling with level
- 7-day cooldown before another swap
- Caught Mora **stay with you** (bonded to you, not faction); faction-gated gear unequips

**Why semi-permanent:** keeps identity meaningful without trapping bad picks. Creates lore drama (defectors, converts, exiles).

**NOTE:** The 40-member faction cap is a **WhatsApp-bot-only** temporary balance fix. It does NOT apply to the Roblox game.

---

## 4. Mora System

### 4.1 Storage — Rift Crystals
- Every tamed Mora is held in a **Rift Crystal** — the Mora is visible inside, **frozen mid-pose** (stasis illusion).
- Color-coded by element: Fire = ember red, Water = sapphire, Electric = gold, Nature = jade, Rift-corrupted = black/purple, etc.
- Each crystal's silhouette is unique (the Mora's frozen pose is that Mora's signature).
- In inventory UI, crystals display as a grid of glowing stained-glass pieces.

### 4.2 Crystal Consumption — Single-Use Model (Blox Fruits style)

**Crystals are consumed when infused.** This is the central economic loop.

- Taming a Mora gives **one uncracked Rift Crystal**.
- **Infusing shatters the crystal permanently.** You gain that Mora's powers.
- Only **ONE infusion active at a time.** No loadout, no slots.
- To swap powers → catch/retrieve a **different** crystal, infuse → old power is **gone forever**, new one takes over.
- Want Voltrix again after you swapped away? **Go catch another Voltrix.**

This makes catching the core economy, not collecting. Rare Mora feel genuinely precious because each crystal is a real choice.

### 4.3 Storage Layers
| Layer | Capacity | Role |
|---|---|---|
| **Inventory (carried)** | ~5 uncracked crystals | Held on person; vulnerable if you die in PvP (future design: drop-on-death?) |
| **Stronghold Storage** | Unlimited | Deposited crystals — safe until you infuse them |
| **Infused (active)** | 1 | The Mora currently transforming you |

### 4.4 Infusion Mechanics
- **Swap rule:** at a stronghold OR when out of combat. Swap = shatter new crystal, lose old power.
- **Visual (infuse):** hold crystal → pulses → cracks → frozen Mora unfreezes and dissolves into element light → streams into your body → element aura settles over you.
- **De-infusion** is **not a thing in this model** — you're permanently infused with your current Mora until you shatter a new crystal. The previous Mora is simply overwritten.
- **Duration:** ~1.5 seconds. Reads cinematic but doesn't break flow.
- **Element aura persists** at all times while infused — lightning arcs, vines coil, flame ribbons, etc. This is your visible identity to other players.

### 4.5 Rarity → Power Gating
| Rarity | On Infusion |
|---|---|
| Common / Uncommon | 3 moves + minor aura |
| Rare | Full 4 moves + traversal ability (dash/leap/glide) |
| Epic | 4 moves + partial morph + passive (e.g. Fire Mora burns attackers in melee) |
| Legendary | 4 moves + partial morph + passive + **Ultimate full-morph** (15-30s charged form with signature finisher) |

### 4.6 Move Mastery & Awakening (Blox Fruits model, expanded)

**Mastery persists per-player, not per-crystal.** Shatter a Voltrix crystal → catch another later → your Voltrix mastery is still intact.

**No learnset.** All base moves of a Mora unlock the instant you infuse (move count is variable — see 4.6.1).

**Mastery gate:**

| Mastery | How | What Unlocks |
|---|---|---|
| **0 → 40** | Kill NPCs while infused with that Mora | Progress bar climbs |
| **At 40** | Ding | Unlocks **the right to take Awakening Trials** for that Mora's moves |

**Awakening via Mora Type Trials:**
- Each Mora's individual moves flagged `awakenable: true` has its **own trial quest**.
- Complete the trial → that specific move is **replaced with its Awakened version** (visual + rider effect upgrade).
- **Not every move is awakenable.** Some Mora have 4 awakenable moves; some have 2; some have 0.
- You choose which moves to awaken in what order.

**Per-Mora mastery, not per-move mastery** — one bar per Mora, many trials available after it caps. Keeps UI sane, content rich.

### 4.6.1 Variable Movesets

Not all Mora have the same move count. Move structure varies per Mora:
- Some Mora = 2 powerful moves + M1 (basic melee) combos
- Some = 5 weaker moves, no M1
- Some = 3 moves, no M1
- Some = 4 moves + M1

This is set per-Mora in the data schema. Adds handcrafted playstyle variety — a 2-move Mora with m1 plays like a brawler; a 5-move no-m1 Mora plays like a caster.

**Schema additions for every move:**
- `awakenable: boolean` — whether this specific move has an awakening trial
- Mora-level `hasM1: boolean` and `moveCount: number` flags

### 4.7 Future / Unshaped
- **Aura Sigils** — concept banked. Tattoo-style marks awarded when a Mora's mastery reaches Tier 5 (Awakened). Placement/visual purpose TBD.
- **Fusion / Corruption** — endgame: combine two crystals of the same element to create awakened/corrupted variants. Reuses existing `systems/corruption.js`.
- **Crystal Trading between players** — OPEN (strong recommendation: yes, Blox Fruits-style, enables social economy).

---

## 4.8 Aura — The Intimidation System (Conqueror's Haki inspired)

**Aura is NOT a damage buff.** It's a presence-based intimidation system. How feared / respected you are is measurable and visible.

### 4.8.1 Two-Track Resource

| Resource | Role |
|---|---|
| **Aura Points (AP)** | The consumable fuel. Current pool drains while aura is activated. Refills passively + via combat events. |
| **Activation Gauge** | Toggle-on/toggle-off cooldown. Does not drain from use — just governs on/off state and prevents spam. |
| **Max AP** | Scales with player level, Resonance, achievements. More max AP = bigger visible aura radius. |

### 4.8.2 Intimidation Effects (not stat buffs)

When your aura is active AND your max AP > enemy's max AP:
- Enemy's skill cooldowns **increase** (weaponized debuff)
- In the wild: weaker Mora **flee** from you, rarer/stronger Mora spawn drawn to you
- NPC vendors give subtle discounts
- Lower-aura players near you lose stamina faster
- Roleplay option: optional cower/bow animation for low-aura players (receiving player consents to it)

### 4.8.3 Aura Skill Tree

Players choose what their aura *does*, not how strong it is. Branches:
- **Dominion** — enemy cooldowns, weakened enemy moves in aura range
- **Wilderness** — stronger spawns, weaker Mora flee, hunt-related buffs
- **Presence** — social/cosmetic/vendor discounts/forced-bow
- **(more branches TBD as playtested)**

Respec available via scroll (Lucons) or Shadebroker token.

### 4.8.4 Visual

- Haki-style energy emanates from the player — **element-colored to match current infused Mora**.
- Radius scales with max AP. Low-level: halo. Max-level: floods a courtyard.
- Whether aura morphs the Mora appearance larger OR manifests as pure energy waves: **banked for later decision**.

### 4.8.5 PvP Death

- On death, you lose **current AP fill only**. Max AP is untouched.
- AP refills over time and via combat. You are never permanently weakened.

---

## 5. Combat

**Pure action, never turn-based.**

- Free movement, dodge-roll, block/parry, combo strings, stamina bar.
- Moves from [data/mora.json](../data/mora.json) become skill shots, AoE, melee — all 294.
- **Status effects** (paralyze, burn, poison, sleep, confuse, stat stages) — implemented in WhatsApp first, port directly to Roblox.
- **Tick damage formula** locked: `floor(attackerLevel × rarityMul × 0.5 + movePower × 0.1)` where rarityMul = Common 1.0 / Uncommon 1.1 / Rare 1.25 / Epic 1.5 / Legendary 1.8.
- **Accuracy is the only hit-gate.** Power-0 status moves still apply their effect if accuracy passes.
- **Paralyze** = 25% turn-skip / 3 turns. **Sleep** = 33% wake chance / broken by damage / max 3. **Confuse** = 33% self-hit / 3 turns.

**Faction × Mora synergy:** same Voltrix plays three ways:
- Harmony + Voltrix → lightning chains heal allies
- Purity + Voltrix → lightning crits harder, paralyze +1 turn
- Rift + Voltrix → lightning lifesteals, paralyze slows until retriggered

**100 Mora × 3 factions = 300 playstyle combos** with zero extra move design.

---

## 6. World

### 6.1 Open-World Islands
- Each biome has its own native Mora pool.
- **Island progression gated** by player level + faction rep (soft walls — you can visit, but enemies scale beyond you).
- **Spawn events**: wild Mora appears in its biome every few minutes, broadcast alert, first player to weaken + tame wins the crystal.

### 6.2 Faction Strongholds — Isolated Islands
Each faction stronghold sits on its **own closed island**, unreachable by normal travel.
- 🌿 **Sanctuary** (Harmony)
- ⚔️ **Citadel** (Purity)
- 🕶️ **Rift Nexus** (Rift)

**Access rules:**
- Only members of the faction can teleport home to their own stronghold freely.
- **Outsiders CANNOT enter** by normal means — no sneaking, no infiltration, no parkour exploits.
- **The only way in for outsiders: Kael's Summons during an active raid.** Kael opens a rift and pulls the attacker party into the enemy stronghold. When the raid ends, Kael rips everyone back out.
- This makes raids feel like forbidden invasions — crossing into enemy sanctum is a rare, sacred act, not casual trespass.
- **Offline defenders** get push notifications when their stronghold is raided.

### 6.3 Neutral Hubs
- **Coliseum** — neutral PvP arena (1v1 and 3v3).
- **Mora Bazaar** — neutral marketplace where players trade crystals and items across factions.
- **Kael's Gate** — neutral location where raid lobbies form.

---

## 7. PvP

- **Arena format** at the coliseum hub.
- **1v1** and **3v3** modes.
- Both players infused with chosen Mora → duel using that Mora's moveset.
- Ranked ladder. Seasonal rewards.
- **No turn-based anywhere.**
- Status effects fully in play — paralyze = stun root, burn = DoT, sleep = interruptible sit animation, etc.

---

## 8. Raids — Expanded System

Starts from existing WhatsApp raid system ([systems/raids.js](../systems/raids.js)) and expands into the tentpole endgame content.

### 8.1 Phase Structure (no walls — direct courtyard drop)

| # | Phase | What Happens | Duration |
|---|---|---|---|
| 1 | **Recruit** | Attacker faction forms raid party in lobby (3-8 players, roles assigned) | Open, until leader launches |
| 2 | **Ritual** | Kael channels the rift. Attackers stand in the rift circle. Defenders get pinged/notified. | 3 min warning |
| 3 | **Arrival** | Kael teleports attackers to the stronghold's outer **courtyard/grounds**. Immediate combat begins with NPC guards + any defending players. | 10 min |
| 4 | **Push** | Fight inward through the stronghold — chambers, arenas, environmental hazards, mini-bosses. | 10 min |
| 5 | **Encounter** | Inner sanctum: defender faction leader (elite NPC) + rallied defenders. Home-field buff applies. | 15 min |
| 6 | **Extraction** | Attackers channel to extract stolen loot. Defenders can still interrupt and kill them mid-channel. | 3 min |
| 7 | **Resolution** | Kael extracts all survivors. Loot distributed. Rep gained/lost. Treasury updated. | Instant |

**No walls.** No wall HP, no reinforcement channels, no siege mechanics — those were legacy WhatsApp design and don't translate to satisfying 3D action combat.

### 8.2 Outcome Matrix — 9 Distinct Results

| Outcome | Trigger | Result |
|---|---|---|
| **Decisive Victory** (Attacker) | Complete extraction with full loot | Max Lucons, rare crystal bonus, faction rep +3, defender wall damaged for 24hr |
| **Partial Victory** (Attacker) | Breach + encounter win, extraction interrupted | 50% Lucons, no crystal bonus, rep +1 |
| **Pyrrhic Victory** | Attackers win but lose >70% of their party | Lucons gained, but attackers drop crystals on knockout, rep +2 |
| **Stalemate** | Wall holds full duration OR timer runs out mid-infiltration | Both sides get consolation Lucons, standard cooldowns apply |
| **Repelled** | Defenders break attacker morale before wall falls | Attackers lose entry fee, defenders rep +2, treasury safe |
| **Routed** | Defenders wipe attacker party | Treasury bonus, defenders rep +3, attacker faction cooldown doubles to 48hr |
| **Counter-Raid** (new) | Defenders wipe attackers with 5+ still alive | Defenders earn instant-launch **counter-raid buff** for next 2hrs |
| **Crystal Heist** (alt-win path) | Attackers choose to steal a rare defender Mora crystal instead of Lucons | Treasury untouched, one rare Mora flagged "lost" — defender faction can quest to recover it |
| **Kael's Judgment** (rare) | Attackers use dishonorable tactics (AFK, exploits) | Kael aborts raid, attackers punished with rep loss |

### 8.3 Defender Mechanics

- **Mora Guards (NPCs)** — each stronghold has AI Mora patrolling; defender rank unlocks more + better Mora
- **Traps** — defenders can pre-place traps during the 3-min Ritual warning window (courtyard + hallway chokepoints)
- **Home-field buff** — +20% damage, reduced status-effect duration while inside their own stronghold
- **Rally Call** — a defender leader can summon offline faction members via push-DM
- **Barricade placement** — instead of wall repair, defenders drop temporary barricades in corridors during the Push phase

### 8.4 Attacker Mechanics

- **Role loadout** — Frontline (tank, breach lead), Mid (DPS, encounter carry), Support (heal, rez, trap-disarm). Existing in bot.
- **Breach Crystals** — consumable items that detonate barricades/traps in one shot
- **Sabotage** (Rift faction only) — invisibly plant corruption marks that reveal defender positions
- **Extraction gear** — items that speed up the extraction channel or mask your location

### 8.5 Environmental & Dynamic Events

- **Weather** — storms boost Water Mora, drought boosts Fire, eclipses boost Rift
- **Time-of-day** — night raids give stealth bonus to attackers; day gives visibility bonus to defenders
- **Random mid-raid events** — Kael drops a **neutral loot crate** both sides can race to
- **Random spawn** — a wild high-rarity Mora may spawn during the raid, creating a third faction (neutral) threat

### 8.6 Economy Gates & Cooldowns

- **Per-player raid-join cooldown: 5 hours** (individual). You can be in one raid per 5hr regardless of faction/server.
- **Per-faction-pair cooldown: 5 hours.** Harmony can't raid Purity twice in 5hr (but still can raid Rift).
- **Defenders have NO cooldown.** Defense is always free — you can be raided back-to-back and always respond. Only attacking is gated.
- **Counter-Raid** resets the pair cooldown only (not individual attacker cooldowns).
- **Raid Tokens** — earned from daily PvE, consumed to launch a raid; ensures only engaged players start raids.
- **Treasury lock** — after a Decisive Victory, defender treasury enters 12hr lockdown (can't be raided again until refilled).

### 8.7 Cooldown Reduction — Monetization

- **Robux-purchased cooldown skip**: players can spend Robux to reduce their personal raid cooldown (e.g., -1hr / -3hr / instant).
- Sold through the Cosmetic Stall in the Bazaar or an in-game menu.
- **Does NOT bypass faction-pair cooldowns** — only the individual player cooldown. Protects server economy balance.
- Also sold: cooldown reducers for trial re-attempts, aura activation gauge, bazaar listing fees.

---

## 9. Economy

- **Lucons** — primary currency. Name stays. Earn from hunts, quests, PvP wins, raid payouts.
- **Rift Shards** — rare currency for corrupted Mora infusion upgrades.
- **Treasury** — **GLOBAL per-faction** (see Section 9.1 below). One Harmony treasury, one Purity, one Rift. Shared by all members everywhere.
- **Crystal Trading** — player-to-player at the Mora Bazaar. Trade crystal ↔ crystal, or sell crystals for Lucons.
- **Robux monetization** (Roblox cut = ~50% kept):
  - Cosmetic skins for infused forms (aura colors, particle variations)
  - Stronghold Storage capacity upgrades
  - Season pass with exclusive Mora
  - **No pay-to-win** on core combat.

### 9.1 Global vs Per-Server Architecture — CRITICAL

**The problem:** Roblox games run as many parallel servers (~30 players each). If we tracked faction treasury per-server, a player's contribution on Server A would mean nothing on Server B. That kills investment in the faction.

**The solution:** clear split of what's global vs what's local.

| Data | Scope | Why |
|---|---|---|
| Player profile (crystals, Lucons, level, mastery, rep) | **GLOBAL** (DataStore) | Follows you anywhere. |
| **Faction Treasury** (per faction) | **GLOBAL** | One pot per faction. All contributions from all servers land here. |
| **Faction Rep** | **GLOBAL** | Your reputation follows you. |
| **Raid cooldowns** | **GLOBAL** | Raids are world-events, not server-events. |
| **Raid instances themselves** | **Dedicated private server** | See below. |
| Wild Mora spawns | **Per-server** | Each server has its own live spawn events. |
| Open-world PvP encounters | **Per-server** | Fight whoever's in your server. |
| Coliseum ranked PvP | **Global matchmaking** → private match instance | Queue from any server. |
| Chat (stronghold hub chat) | **Per-server** (with cross-server guild/faction chat as a layer on top) | Roblox default. |

### 9.2 How Raids Work With Global Treasury

- Raids **do not happen on normal play servers**.
- When a raid is launched, Kael spins up a **dedicated raid instance** — a private Roblox server created just for that raid.
- That instance reads the global treasury, runs the 7-phase raid, writes results back to the global treasury via DataStore.
- When the raid resolves, players return to their home server.

**Result:** no contribution is ever wasted. Every Lucons added to the Rift treasury by a player on Server 47 is the same pot as the one drained by Harmony raiders on Server 412. Faction identity stays unified.

### 9.3 Write-Rate Honesty

Roblox DataStore has a **rate limit of ~60 writes per key per minute**. We can't write to the global treasury every single Lucons gain. Standard solution:
- Batch writes (flush every 30-60 seconds, or per-significant-event)
- Cache treasury reads for ~10s
- Raid endings are single large transactions (one write, not hundreds)

This is a solved problem and I'll handle it in the Lua code. No design impact.

---

## 9.4 Market System — Mora Bazaar

**Theme:** anime capital marketplace — stone roads, lantern-lit square, themed shops flanking a central plaza. Think Magnolia from Fairy Tail or Hidden Leaf streets.

**Visible on every player's map. Neutral hub, all factions welcome.**

### 9.4.1 Shop Sections

| Section | Inventory | NPC |
|---|---|---|
| **Apothecary** | HP capsules (S/M/L), status cures, anti-backlash elixirs, aura potions | Herbalist |
| **Hunting Supplies** | Hunting Energy bottles, detection scrolls, bait, tracking maps | Gruff hunter |
| **Crystal Broker** | Player-listed crystal trades (main social economy) | Dignified trader |
| **Scroll Shop** | Mastery scrolls, trial vouchers, aura skill respec tokens | Scholar |
| **Gear Smithy** | Armor, accessories, aura-infused equipment | Blacksmith |
| **Cosmetic Stall** | Aura dyes (non-forbidden), title frames, emotes — Robux tier lives here | Stylish vendor |

### 9.4.2 HP Regen Rule (Blox Fruits style)

**HP auto-regenerates passively over time** (out of combat, or slowly during combat). No bulk-heal item dependency.

HP capsules exist as **emergency burst items**, not the main healing loop:
- **Vital Capsule S** — instant +100 HP (combat-usable, short cooldown)
- **Vital Capsule M** — instant +250 HP + 2s regen boost
- **Vital Capsule L** — full heal; PvP / raid clutch-only; rare

### 9.4.3 Key Items

| Item | Effect | Notes |
|---|---|---|
| **Vital Capsule S/M/L** | Burst heal (passive regen is the default, these are emergency) | See above |
| **Aura Capsule** | Refill 30% AP instantly | Rare drop / black-market |
| **Hunting Energy bottle** | Refills Hunting stamina | Consumable; free-tier from strongholds daily |
| **Status Cure** | Clears one debuff (paralyze/burn/poison/etc.) | Per-status variants or universal |
| **Mastery Scroll** | +5 mastery on currently infused Mora | Valuable, gated |
| **Trial Voucher** | Unlock a Mora Type Trial without normal entry requirement | Raid drop / premium |
| **Aura Respec Token** | Reset aura skill tree | One-time purchase per respec |

*Note:* "Anti-Backlash Elixir" removed from launch — see Section 17 (Deferred Systems).

### 9.4.3 Listing Rules (Crystal Broker)
- Player-to-player listings: fixed-price or auction
- **5% sale tax** on Lucons transactions → currency sink
- Searchable by rarity, element, price, seller resonance
- DataStore-backed escrow (safe from scams)
- Crystal ↔ Crystal swaps are tax-free (encourages bartering)

---

## 9.5 Black Market — The Shadebroker

**NOT on any map. NOT advertised.** Appears at a **random secret location each day** on a random island for a ~6 hour window. Players hunt for the spawn; locations shared by word-of-mouth / Discord / whisper.

### 9.5.1 Stock

| Item | Effect |
|---|---|
| **Corruption Catalyst** | Forcibly corrupt any crystal (permanent, irreversible) |
| **Forbidden Aura Dyes** | Black / void-purple / blood-red — banned visual flex |
| **Forbidden Titles** | "The Heretic", "Voidtouched", "Kael's Reject" — PvP flex |
| **Move-Swap Catalyst** | Replace one move on current infusion with a random same-element move from a lower-rarity Mora |
| **Trial Skip Token** | Skip 50% of any Mora Type Trial |
| **Grey-Market Crystals** | Rarer than regular stock, but flagged; using them visibly (Z-Move) triggers Resonance loss |
| **Corrupted Gear** | Stronger than regular gear; debuffs stack if worn too long |

### 9.5.2 Payment
- **Rift Shards** only (no Lucons). Keeps shady economy separate. Rift Shards earned from corrupted Mora farming — existing mechanic in `systems/corruption.js`.

### 9.5.3 Consequences
- Every purchase is invisibly logged.
- Frequent buyers receive the **Shadebroker's Mark** — cosmetic vignette, visible to others, **+% black-market discount / -% faction event rewards**.
- Abuse → Resonance penalty, faction Champions board won't list you.
- **One-way trade:** black market items can't be resold on the Bazaar. You commit when you buy.

### 9.5.4 Rollout / Anti-Abuse
- Black market doesn't spawn in the first ~6 hours of any server's lifetime (prevents bot farming at server reset).
- Same player can only purchase N items from the Shadebroker per day (stops hoarders).
- Shadebroker is neutral — doesn't care about factions, doesn't get raided.

---

## 10. NPCs / Lore Characters

| NPC | Role | Source |
|---|---|---|
| **Star** | Mysterious Stronghold Oracle — daily quests, lore drops. PG rewrite of the WhatsApp persona. | Ported from `systems/star.js` |
| **Kael the Riftwalker** | Raid announcer / raid instance host / endgame boss | Already in bot (`pickKaelLine` in raids) |
| **Mora Sage** | Explains infusion, upgrades crystals, gates trial access | New |
| **Shadebroker** | Black market cloaked vendor. Appears at random location daily. | New |
| **Bazaar NPCs** | Herbalist, Hunter, Crystal Broker, Scholar, Blacksmith, Stylish Vendor — one per shop section | New |
| **Faction Quest-Givers** | NPCs at each stronghold offering faction-rep missions. Replaces the "faction leader" role. | New |

**No acting/elected faction leaders.** Instead:

### 10.1 Faction Champions Hall (per stronghold)

Each stronghold has a **Champions Hall** — a visible shrine displaying top players of that faction. Not a governance role; a **hall of flex**.

- **All-Time Top 3** — hardest to dethrone, listed by total earned Resonance
- **Weekly Top 3** — resets every Monday, gives new players a shot
- **Current Rank 1** earns a **faction-exclusive title** displayed in chat:
  - 🌿 Harmony: *"The Unshaken"*
  - ⚔️ Purity: *"The Blade"*
  - 🕶️ Rift: *"The Voidborn"*
- Champion player models (low-poly mannequins in their last-worn cosmetics) stand in the shrine. Visible to all server members.

---

## 11. Current Lumora (WhatsApp) → Roblox Translation Table

| Current | Roblox Version |
|---|---|
| `.catch` / `.hunt` commands | Spawn events + quest NPCs on islands |
| Random Mora spawn in group | Open-world wild encounters |
| `.raid` cross-faction | Open-world stronghold sieges (3-phase: recruit / wall / encounter) |
| `.battle` turn-based | Action combat, moves mapped to keys |
| Lucons | Stays |
| Faction Points | Faction Rep (same system, new UI) |
| Treasury | Territory control / weekly dividend |
| Player level + Mora level | Stays; add Faction Rep as third track |
| Star (AI companion, flirty) | Stronghold Oracle NPC (PG) |
| Idle bot chatter | Ambient town NPC dialogue |
| `.commands` | UI menus + in-game Lumora Codex |
| Mora.json (101 Mora, 294 moves) | Direct data port → Luau tables |

---

## 12. Tech Stack & Workflow

### 12.1 Stack
- **Platform:** Roblox
- **Engine:** Roblox Studio
- **Language:** Luau
- **Sync tool:** [Rojo](https://rojo.space/) — syncs local `.lua` files into Studio in real-time
- **Source control:** Git (this repo extends)

### 12.2 Workflow
Identical loop to WhatsApp-bot development:
1. Prime opens terminal with Claude at the project folder
2. Claude writes Luau files on disk
3. Rojo hot-syncs into Studio
4. Prime handles Studio-side work (maps, art, animations, UI layout) in parallel
5. Test in Studio playtest
6. Ship to Roblox

### 12.3 Automation Split

**Fully automatable (Claude handles):**
- All Luau scripting (combat, abilities, data, networking)
- Player data (DataStores, save/load)
- RemoteEvents / RemoteFunctions
- Inventory, sigil, infusion logic
- Quest / NPC dialogue trees
- Raid matchmaking and phase logic
- UI *behavior* (handlers, state)
- Data migration (mora.json → Luau tables)
- Balancing formulas, data tables
- Build/deploy tooling

**Manual (Prime handles in Roblox Studio):**
- Building maps / islands (biggest time sink)
- 3D modeling Mora (skip early with Toolbox assets)
- Rigging + animations
- VFX / particle effects
- UI layout / visual design
- Sound / SFX selection
- Playtesting
- Publishing + Roblox dashboard

**Rough split:** ~60-70% of total hours = code/data/balance (Claude). ~30-40% = art/anim/world (Prime).

### 12.4 Art Shortcut
For alpha: Roblox Toolbox has free rigged character models and animations. Grab 10 for the first 10 Mora, rename, skin-tint. Custom art later. Collapses ~300hr of modeling into ~30hr of selection + minor rigging.

---

## 13. Milestones

### Week 1 — Setup
- Install Roblox Studio + Rojo
- Scaffold project folder structure
- Wire a walking player character
- Build one test island (simple flat biome)
- Get a single wild Mora model to spawn and be damageable

### Month 1 — Prototype
- Infusion system working (swap between 2 Mora, moves change, aura VFX)
- 3-5 Mora playable (full movesets + effects)
- 1 biome island fully explorable
- Basic HUD (HP, stamina, Lucons, crystal slots)
- DataStore save/load for player profile

### Month 3 — Playable Alpha
- 10 Mora ported
- 3 biome islands
- All 3 factions selectable + rep tracking
- PvE hunts working
- 1v1 PvP arena
- Basic Stronghold hub

### Month 6 — Private Beta
- 25 Mora ported
- 5 biomes
- Raid system (single raid at launch)
- 3v3 PvP
- Faction Rite swap quest

### Month 12 — Public Launch
- 50+ Mora ported
- Full island roster
- Weekly faction war
- Monetization (cosmetics, passes)

---

## 14. Risk Register

| Risk | Mitigation |
|---|---|
| 3D modeling bottleneck | Start with Toolbox assets, custom art later |
| Month 4-8 "combat feel" wall (where most Roblox games die) | Play-test weekly from Month 1, not Month 6 |
| Solo burnout | WhatsApp bot stays live as a vent/social outlet; game work on dedicated grind days |
| Roblox revenue cut (~50% net) | Accept it for reach; revisit once audience exists |
| Young Roblox audience vs Star's flirty persona | PG rewrite for Star in Roblox; keep flirty Star on WhatsApp only |
| Feature creep | This doc is the scope. Additions require updating this doc first. |

---

## 14.5 Deferred Systems (parked until proper implementation known)

These existed in the WhatsApp bot but are **explicitly deferred** for the Roblox version. Do not design around them until we lock in a proper approach:

- **Corrupted Mora Backlash** (HP burn per turn while infused with corrupted Mora) — pause. Current WhatsApp mechanic (`getRiftInBattleBurn` in `systems/battle.js`) is a number tweak, not a real design. The Roblox version needs a proper risk/reward model before we touch it.
- **Tamed Mora attacking / acting autonomously** — pause. Not clear how this fits with the single-active-infusion model. Revisit once combat feel is established.
- **Anti-Backlash Elixir** — removed from launch item list; parked alongside the backlash system itself.

---

## 15. Open Questions

*Batched — will tackle these in one pass once more systems are locked.*

- [ ] Final list of starter biomes (volcanic / aquatic / forest / rift / mountain / desert — which 3 for alpha?)
- [ ] Sigil tattoo unlock — when exactly does it tie in with new per-move awakening model? Placement on body TBD.
- [ ] Rift Crystal visual — hovering or palm-held during infusion? Size?
- [ ] Stamina vs MP for move usage — which system?
- [ ] PvP ranking — Elo, points, or tier ladder?
- [ ] Guild / clan system on top of factions?
- [ ] Aura visual — morph Mora appearance larger, or pure energy emanation waves?
- [ ] Aura skill tree — final list of branches beyond Dominion / Wilderness / Presence
- [ ] Shadebroker's secret location — fixed pool of possible spawns, or truly random?
- [ ] Weekly vs daily reset cycles for events, champion boards, hunting energy cap

---

## 16. Changelog

**2026-04-23 (session 1)**
- Doc created. Locked in: faction model (semi-permanent), Mora storage (Rift Crystals with frozen pose), infusion transform style, PvP action combat, raid port, translation table from WhatsApp bot, milestone roadmap, automation split.
- Sigil tattoo concept banked for later.
- Reminder: 40-member faction cap is WhatsApp-only.

**2026-04-23 (session 2)**
- **Crystal consumption rewritten: single-use (Blox Fruits model).** Shatter on infuse, no loadout, one active at a time.
- Storage layers simplified to: Inventory (carried, ~5) / Stronghold Storage (unlimited, safe) / Infused (1 active).
- **Move Mastery system added** (5 tiers, per-player, 500 uses to Awakened).
- **Strongholds locked as isolated islands** — only accessible by own-faction teleport home OR via Kael's Summons during a raid. No sneaking in.
- **Raid system heavily expanded:** 3 phases → 7 phases, 2 outcomes → 9 outcomes matrix, defender/attacker mechanics fleshed out.
- Added new neutral hubs: Coliseum, Mora Bazaar, Kael's Gate.
- Sigil Tattoos initially gated behind Mastery Tier 5.

**2026-04-23 (session 3)**
- **Mastery system rewritten (Blox Fruits-accurate):** 0-40 mastery by NPC kills while infused, unlocks Z-Move at 40. Mora Type Trials upgrade base Z-Move → Awakened Z-Move. Other 4 moves fixed on infuse.
- **No learnset** — all 4 base moves unlock instantly on infusion.
- **Walls removed from raids.** Kael drops raiders directly in courtyard/grounds. Phase structure: Recruit → Ritual → Arrival → Push → Encounter → Extraction → Resolution.
- Replaced wall-repair defender mechanics with barricade placement + traps.
- Replaced Siege Crystals with Breach Crystals (for detonating barricades/traps).
- **Crystal trading confirmed:** crystal↔crystal AND crystal→Lucons at Mora Bazaar.
- **Added Section 9.1-9.3 on Global vs Per-Server Architecture.** Faction treasury, rep, raid cooldowns = GLOBAL. Raids run on dedicated private server instances. Wild spawns + PvP encounters = per-server. Solves the cross-server contribution problem.
- Defined "Rep" explicitly (reputation = faction standing score, like Blox Fruits Bounty).

**2026-04-23 (session 5)**
- **Raid cooldown reduced from 24hr → 5hr** (per-player and per-faction-pair). More action, less waiting.
- **Defenders explicitly have no cooldown** — always free to defend, can be raided back-to-back.
- **Treasury lockdown after Decisive Victory: 12hr** (was 48hr). Scales with new faster cadence.
- **Cooldown reduction as monetization** (Section 8.7) — Robux to shave personal raid cooldown. Cannot bypass faction-pair cooldown (economy-safe).
- **HP regen model locked (Blox Fruits style)** — HP auto-regenerates passively. HP Capsules renamed to **Vital Capsules**, repositioned as emergency burst items, not the main heal loop.
- **New Section 14.5 Deferred Systems** — Corrupted Mora Backlash + Tamed Mora autonomous attacking explicitly parked for Roblox until proper implementation is known. Anti-Backlash Elixir removed from launch item list.
- Bot confirmed fully operational after libsignal fix settled + WhatsApp fresh-session throttle eased. No more blank-message spam. No further changes this session.

**2026-04-23 (session 4)**
- **Aura system fully redesigned — Conqueror's Haki model.** AP + Activation Gauge two-track resource. Intimidation effects only (enemy cooldown debuffs, wild Mora flee/draw, NPC discounts, stamina drain on low-aura nearby) — NOT stat buffs. Skill tree (Dominion / Wilderness / Presence branches) lets players pick their flavor. Aura visibly scales with Max AP. PvP death drains current AP, max untouched.
- **Renamed Faction Rep → Resonance.** Existing resonance field in `player` data is repurposed (had no active purpose).
- **Crystal Heist reworked:** individual Mora never lost. Attackers raid a **faction Crystal Vault** (communal stockpile) instead. Players safe.
- **Drop-on-death in PvP:** you only lose current AP. Crystals in inventory never drop.
- **No elected/acting faction leaders** in favor of **Faction Champions Hall** at each stronghold (all-time + weekly top 3, Rank 1 gets exclusive title).
- **Per-player raid cooldown locked** (24hr individual) + per-faction-pair cooldown (24hr). Counter-Raid resets the pair cooldown only.
- **Variable movesets per Mora**: move count, m1 availability, and awakenable flags all per-Mora in the schema. Not every move is awakenable.
- **Market System fleshed out** (Section 9.4): Mora Bazaar as anime capital marketplace with themed shop sections (Apothecary, Hunting, Crystal Broker, Scroll, Gear, Cosmetic). Key items: HP capsules, Hunting Energy, Anti-Backlash Elixirs (ties to existing corruption system), Mastery Scrolls, Aura Respec Tokens.
- **Black Market / Shadebroker added** (Section 9.5): rotating secret location, Rift-Shards-only payment, sells Corruption Catalysts / Forbidden Dyes / Forbidden Titles / Move-Swap Catalysts / Trial Skip Tokens / Grey-Market Crystals. Frequent buyers get Shadebroker's Mark (discount + rep loss). One-way, can't relist on bazaar.
- **Titles system locked:** earned via achievements/mastery/Resonance/rank, one equipped at a time, shown in chat as `[Title] Username: msg`.

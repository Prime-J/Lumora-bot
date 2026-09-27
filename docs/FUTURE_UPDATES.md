# 🔮 Lumora — Future Updates

Living roadmap of everything planned but not yet shipped. Add at the top, ship
from the bottom.

- **What already shipped:** [`docs/PATCHES.md`](PATCHES.md).
- **Live-event design notes:** [`docs/EVENTS.md`](EVENTS.md).
- **Star / AI roadmap:** [`FUTURE_UPDATES.md`](../FUTURE_UPDATES.md) (root).---

## 🕊️ Event 005 (SHIPPED AS PERMANENT) — The Sunday Gift

**Status:** permanent weekly event (not limited-time).
**Window:** every Sunday, 00:00 CAT → 24h.
**Owner manual:** [`docs/ADMIN_SUNDAY_EVENT.md`](ADMIN_SUNDAY_EVENT.md).
**Player entry:** `.gift` (start a run), `.gift-lb` (standings).

A weekly AI-written Bible scripture quiz. Every Sunday at 00:00 CAT the event
opens for 24 hours. Each player picks how many questions to answer (allowed
range **4–10**), answers one at a time via **native A / B / C / D buttons**, and
gets **6 wrong answers max** before the run closes.

On completion:
- **Lucons** are always awarded and scale with performance (more answered + more
  correct → more Lucons).
- **XP** on completion.
- **One completely random Epic Mora** on every completed run.
- **A Blessing** on a perfect run.
- **A rotating bonus reward** that changes from run to run / week to week.

Questions are generated fresh by AI every Sunday from 00:00 CAT for that 24h
window. If AI is unavailable or returns junk, the event falls back to a curated
bank. Example themes: *which mountain did Moses die on*, *which verse says X*,
*who spoke this line*, *what happened at this place*.

> **Major-update note:** this is treated as the headline of the next major
> update (1.3.0). It is permanent, recurring, and AI-driven — not a one-off
> drop.

### Owner commands (summary)
See `docs/ADMIN_SUNDAY_EVENT.md` for the full set. At a glance:
- Status / timing: `.su-status`, `.su-next`
- Pool control: `.su-regenerate`, `.su-pool`, `.su-pool-test`
- Rule alterations: `.su-set-range`, `.su-set-strikes`, `.su-set-base-lucons`, `.su-set-bonus-pool`, `.su-set-ai`, `.su-set-fallback`
- Audit / standings: `.su-lb`, `.su-audit`
- Operational: `.su-open`, `.su-close`, `.su-disable`, `.su-enable`

---

## 🌟 The Blessings & Special Abilities system  *(planned, major)*

Blessings are already being **granted** — the Sunday Gift hands out
*Blessing of the Faithful* on a perfect run and stores it on the player:

```js
player.blessings = [{
  id: "blessing-of-the-faithful",
  name: "Blessing of the Faithful",
  source: "sunday-gift",
  grantedAt, expiresAt,          // 7 days
  effectKey: "energyDrainReduction",
  effectValue: 0.10,
  note: "Reduces hunt energy drain once the Blessings system ships.",
}]
```

What's missing is the **engine that reads them**. Plan:

### 1. A blessings registry

- New `systems/blessings.js` exporting `BLESSINGS` (id → name, icon, duration,
  effectKey, effectValue, flavour).
- `grantBlessing(player, id, opts)` / `getActiveBlessings(player)` /
  `consumeBlessing(player, id)` / `expireBlessings(player)`.
- Prune expired entries on `bootPlayers()` and on `.daily`.

### 2. Special abilities (passive boons)

Each ability is a named modifier the game already has hooks for:

| Ability | Effect | Effect key |
| --- | --- | --- |
| 🕊️ **Blessing of the Faithful** | *lower energy drain while hunting* | `energyDrainReduction` |
| 🔥 **Emberwake** | +% damage on the first move of a battle | `battleDamage` |
| 🌿 **Sanctuary's Favour** | +% rare Mora spawn chance | `rareSpawn` |
| 🐾 **Hunter's Patience** | +% catch chance | `catchChance` |
| 🛡️ **Warded Soul** | flat reduction of environment damage | `envDamageReduction` |
| 💠 **Resonant Mind** | +% XP from hunts | `xpBoost` |
| 🎲 **Fortune's Coin** | +% Lucons from every sale | `sellBoost` |

Most of these keys already exist in `systems/inventory.js`
(`applyItemEffects`), so the cleanest implementation is:
`applyBlessingEffects(player)` mirrors `applyGearEffects(player)` but reads
`player.blessings` and is called once per hunt/battle. **Important:** do *not*
accumulate into `player.passives` repeatedly — that helper is not idempotent.

### 3. UI

- A `🕊️ *Blessings*` section on `.profile` / a `.blessings` command showing
  active boons and their remaining time.
- Expiry announcements in chat ("the Blessing of the Faithful has faded").

### 4. Sources

- Sunday Gift (perfect run) — *live already*.
- Faction missions, raid wins, and a rare market consumable (`.consume` a
  *Censer of Grace* → grants a random 24h blessing).

---

## 📜 The Sunday Gift — shipped & next steps

**Shipped (1.3.0):** weekly AI-written scripture quiz, Sunday 00:00 CAT → 24h,
player picks 4–10 questions, six strikes closes the run, scaled Lucons + XP + a
guaranteed random Epic Mora + a Blessing on a perfect run + a rotating bonus
reward. Buttons throughout (`.gift` → count → A/B/C/D).

### Suggestions for the next pass

1. **🧠 Harder tiers.** Let the player choose *Grace* (easy, 1× reward),
   *Doctrine* (mixed, 1.5×) or *Tribulation* (hard, 2.5×). Questions from the
   pool are tagged by difficulty; the AI prompt asks for a spread.
2. **📖 Verse mode.** Half the questions become "complete the verse" prompts
   pulled from `systems/bibleVerses.js`, so the 324 verses already in the bot do
   double duty.
3. **🔥 Streaks.** Four perfect Sundays in a row → a permanent title
   (*「Scribe of the Gift」*) and a guaranteed Legendary shard.
4. **👥 Group relays.** A weekly group relay where the *first* correct answer in
   the group takes the question — big social hook, native buttons already work.
5. **🎁 Mystery Gift.** A small chance the bonus reward is a "Mystery Relic" —
   an unrevealed item revealed on claim. Pure dopamine, no balance risk.
6. **🗓️ Gift calendar.** `.gift-lb` already stores 8 weeks of standings; surface
   an all-time hall of champions and each Sunday's theme.
7. **🧾 Question review.** An owner command (`.gift-generate` / `.gift-audit`)
   to regenerate the pool and review AI questions before they go live — useful
   when a question is ambiguous or off-doctrine.
8. **⚠️ AI reliability.** The event already falls back to a curated bank when
   `OPENROUTER_API_KEY` is missing or the model returns junk. Consider a nightly
   pre-generation on Saturday so Sunday's pool is always ready.

---

## ⛓ The Abyssal Chain & relic progression  *(planned)*

- **Chain tiers.** Rift Bind is now near-guaranteed with the Chain. Next: an
  *Awakened* chain (`.bind` also yields a bonus corrupted shard) purchasable with
  the Chain + Rift Energy Orbs.
- **Relic durability.** Relics are currently `storageCost: 0` and never degrade;
  a slow-durability pass would give the black market a recurring sink.
- **Permanent listing pattern.** `market.permanentListings` now exists — use it
  for any future always-on stock (travel permits, storage tokens, vanity relics)
  instead of stretching the rotation pool.

---

## 🧭 Other queued work

- **Mora-creation pipeline** — approval queue, rarity caps, forged-by metadata.
- **Market board (M3.2)** — player-to-player listings with escrow.
- **Faction war season reset** — banner carry-over and honour decay.
- **Per-NPC difficulty curves** and **per-section help images** — see the root
  `FUTURE.md`.
- **Star roadmap** — stickers, voice notes, live raid reactions — see the root
  `FUTURE_UPDATES.md`.

---

## 📌 Patch backlog (small, should-have)

- [ ] `.profile` shows active blessings + expiry.
- [ ] Economy sinks for late-game Lucon hoards.
- [ ] `data/arena_state.json` resets on redeploy (no Railway volume) —
      `.arenatoggle` does not persist.
- [ ] Migrate the last `moraOwned` writer (`systems/transfer.js`, `.tamed-give`)
      to shard grants.
- [ ] Run `scripts/tamed_to_shards.js --apply` with the bot **stopped** to
      finalise the shard migration on live Mongo data.
